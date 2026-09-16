/* ============================================================================
   NUR — Projector / Memory stage.
   ----------------------------------------------------------------------------
   Playback engine ported from memory-page-prototype.html (the standalone
   prototype), trimmed for production integration:
   - Reads its appearance settings from config.js's config.projector section
     (the SAME config object/admin panel every other stage uses - no second
     config system).
   - Never touches the DOM or fetches any media until start()/previewEnter()
     is actually called - app.js only calls start() when config.projector.
     enabled is true, so a visitor with the feature off never loads a single
     byte of this stage's media. preload() (see bottom) is the one deliberate
     exception - app.js calls it near the end of the countdown, and even
     then it only warms the frame's own decorative assets plus the FIRST
     memory item, never the whole list.
   - Memory items are persistent: they live in config.projector.items
     (each { id, type, url, caption, pace, trimStart, trimEnd }), uploaded
     via admin-panel.js's media-manager field and saved through the normal
     config Save flow, so every visitor and every future admin session
     sees the same memories - never session-local blob URLs.

   TWO separate entry points, deliberately - this split is what fixes a real,
   confirmed production bug ("Continue doesn't reliably reach Final"):
   - start(cfg, onDone): the ONLY path a real visitor ever takes
     (goToFinalOrProjector() in app.js). Sets onDoneCallback to the REAL
     routing callback.
   - previewEnter(cfg): what admin-panel.js's tab-switching uses to show the
     Projector stage while editing. It shares every bit of setup/reset logic
     with start() but NEVER touches onDoneCallback. Before this split, both
     paths called the same start() function, so an admin merely clicking
     into the Projector tab while a real (or even just previously-admin-
     started) playback was in flight would silently overwrite the real
     "go to Final" callback with previewEnter's harmless no-op - Continue
     would then do nothing, permanently, for the rest of that page's life.
     Confirmed by reproducing it exactly this way before writing this fix.

   State machine: entry -> preplay(poster+title+play) -> loading -> playing
   -> (stalled <-> playing/loading) -> ended-hold -> ended (Replay/Continue,
   waits indefinitely by default) -> done. Every failure path (missing
   media, network error, decode error, stall, timeout, explicit skip)
   funnels into the SAME "stalled" gate with Retry/Skip - one way out of
   trouble, not a different dead end per failure mode. A memory finishing
   normally does NOT jump straight to done: it holds briefly, then reveals
   a calm Replay/Continue gate and waits for the viewer (Auto Continue, off
   by default, skips straight to done instead after the same hold). "done"
   always calls onDoneCallback, so Final is reachable from every path.

   The title is shown exactly once, on entry, and only ever hidden by the
   natural cross-stage fade when the WHOLE #stage-projector section leaves
   (app.js's show()/.stage.leaving) - no per-state fading of the title, no
   individually hiding frame/title/gate before routing to Final (Module 18:
   the stage leaves as one composition, not piece by piece).
   ============================================================================ */
(() => {
  "use strict";

  const PACE_MS = { quick: 900, normal: 2000, hold: 4000 };
  const LOADING_TIMEOUT_MS = 6000;  // no progress on the very first load -> escalate copy + reveal retry/skip
  const STALL_TIMEOUT_MS = 9000;    // no timeupdate progress mid-playback -> reveal retry/skip
  const ENTRANCE_SAFETY_MS = 700;   // never leave the frame invisible longer than this even on a dead-slow connection

  const PROJECTOR_PRESETS = {
    soft:     { vignette: 0.5, blurPx: 0.15 },
    balanced: { vignette: 1.0, blurPx: 0.35 },
    deep:     { vignette: 1.5, blurPx: 0.55 }
  };

  const FRAME_OVERLAY_SRC = "assets/memory-frame.png";
  const FRAME_MASK_SRC = "assets/memory-frame-mask.png";

  let started = false;
  let memories = [];
  let currentId = null;
  let currentEl = null;
  let nextLayer = 0;
  let advanceTimer = null;
  let showRequestSeq = 0;
  let onDoneCallback = null;
  let cfgCache = null;
  let maskWarmed = false;

  let frameEl, layers, frameMediaEl, captionEl, titleEl, ambientGlowEl, posterEl, previewBadgeEl, youtubeEl;
  let gateEl, gateTextEl, playBtn, gateActionsEl, retryBtn, skipBtn, endedActionsEl, replayBtn, continueBtn;

  let loadingTimeoutId = null;
  let stallTimeoutId = null;
  let preloadEl = null;   // the hidden warm-up <video> from preload(), reused for real item-0 playback if it matches
  let preloadUrl = null;

  /* -------------------------------------------------------------------- *
   *  YouTube mode (Module 9-18) - a second, independent media source.
   *  Exactly ONE video (youtubeUrl), never a queue - every module
   *  describing this says "the YouTube video", never a list, so this is
   *  a paste-a-link feature, not a second upload architecture. Uses the
   *  official IFrame Player API only (no scraping, no hacks against the
   *  player) and maps its states onto the SAME gate functions above -
   *  there is one Nur state model, not two.
   *  ---------------------------------------------------------------------*/
  let ytApiPromise = null;
  let ytPlayer = null;
  let ytReady = false;
  let ytPendingPlay = false;
  let ytHeartbeatId = null;
  let ytLastTime = -1;

  /* A <video> element fires "timeupdate" continuously during playback,
     which is what armStallWatchdog() naturally leans on. YT.Player's
     onStateChange only fires on STATE TRANSITIONS, not continuously - so
     without this, arming the watchdog once on the PLAYING transition and
     then never again would make the watchdog fire on every video longer
     than STALL_TIMEOUT_MS, even while playing back perfectly normally
     (confirmed by hitting exactly this while testing). Polling
     getCurrentTime() and only re-arming when it has actually advanced
     reproduces the same "real progress -> reset the timer" guarantee. */
  function startYoutubeHeartbeat() {
    stopYoutubeHeartbeat();
    ytHeartbeatId = setInterval(() => {
      if (!ytPlayer) return;
      let t;
      try { t = ytPlayer.getCurrentTime(); } catch (err) { return; }
      if (typeof t === "number" && Math.abs(t - ytLastTime) > 0.05) {
        ytLastTime = t;
        armStallWatchdog();
      }
    }, 1500);
  }

  function stopYoutubeHeartbeat() {
    clearInterval(ytHeartbeatId);
    ytHeartbeatId = null;
  }

  /* Accepts watch?v=, youtu.be/, embed/, shorts/ (with or without extra
     query params/timestamps) - returns null for anything else instead of
     guessing, so a bad paste fails obviously (stalled/error gate) rather
     than silently embedding the wrong thing. */
  function extractYouTubeId(url) {
    if (!url || typeof url !== "string") return null;
    const patterns = [
      /(?:youtube\.com\/watch\?[^#]*\bv=)([\w-]{11})/,
      /(?:youtu\.be\/)([\w-]{11})/,
      /(?:youtube\.com\/embed\/)([\w-]{11})/,
      /(?:youtube\.com\/shorts\/)([\w-]{11})/
    ];
    for (const re of patterns) {
      const m = url.match(re);
      if (m) return m[1];
    }
    return null;
  }

  /* Lazy-loaded ONLY when source is actually "youtube" (Module 17 - never
     for Uploaded Media viewers). YT's own bootstrap calls the global
     onYouTubeIframeAPIReady, which may already be claimed by something
     else on the page (it isn't, here) - chaining is enough insurance
     either way. Resolves once, cached, so repeated Play/Retry taps never
     re-fetch the script. */
  function loadYouTubeApi() {
    if (ytApiPromise) return ytApiPromise;
    ytApiPromise = new Promise((resolve) => {
      if (window.YT && window.YT.Player) { resolve(window.YT); return; }
      const prevReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prevReady === "function") prevReady();
        resolve(window.YT);
      };
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    });
    return ytApiPromise;
  }

  function makeItem(id, type, src, caption, pace, trimStart, trimEnd) {
    return { id, type, src, caption: caption || "", pace: pace || "normal", trimStart: trimStart || 0, trimEnd: trimEnd || null };
  }

  /* Rebuilds the playable list from the persisted config every time
     start()/previewEnter()/applyLive() runs, so both a real visitor and
     the admin's live-preview always reflect whatever was last saved -
     never a stale in-memory list. Never auto-plays anything by itself. */
  function syncMemoriesFromConfig(items) {
    const list = Array.isArray(items) ? items : [];
    memories = list
      .filter((it) => it && it.url && (it.type === "video" || it.type === "image"))
      .map((it) => makeItem(it.id, it.type, it.url, it.caption, it.pace, it.trimStart, it.trimEnd));
    if (memories.findIndex((m) => m.id === currentId) === -1) currentId = null;
  }

  function currentIndex() {
    return memories.findIndex((m) => m.id === currentId);
  }

  function preloadImage(item) {
    if (!item || item.type === "video") return;
    const img = new Image();
    img.src = item.src;
  }

  function setFrameEmpty(empty) {
    frameMediaEl.classList.toggle("is-empty", empty);
    if (empty) {
      layers.forEach((l) => { l.classList.remove("active"); l.innerHTML = ""; });
      captionEl.classList.remove("show");
      captionEl.textContent = "";
      currentEl = null;
    }
  }

  /* -------------------------------------------------------------------- *
   *  Poster - a persistent <img>, same crop/fit/position CSS vars as the
   *  video (.media-fg), so a poster-to-video crossfade never jumps. Shown
   *  whenever configured and no media has been revealed yet; explicitly
   *  hidden (not removed) the moment real media reveals so it costs
   *  nothing once playback is under way.
   *  ---------------------------------------------------------------------*/
  /* The configured poster always wins. With none set AND source is
     YouTube, falls back to YouTube's own predictable thumbnail URL
     (Module 15 - "you may use the YouTube thumbnail if technically
     straightforward" - a plain img.youtube.com URL is exactly that, no
     API call needed). Uploaded-media mode with no poster stays on the
     frame's own warm parchment placeholder, same as before. */
  function currentPosterUrl() {
    if (cfgCache.poster) return cfgCache.poster;
    if (cfgCache.source === "youtube") {
      const id = extractYouTubeId(cfgCache.youtubeUrl);
      if (id) return "https://img.youtube.com/vi/" + id + "/maxresdefault.jpg";
    }
    return "";
  }

  function applyPoster(url) {
    if (url) {
      posterEl.src = url;
      posterEl.hidden = false;
      posterEl.classList.remove("hide");
    } else {
      posterEl.hidden = true;
    }
  }

  function hidePoster() {
    posterEl.classList.add("hide");
  }

  /* -------------------------------------------------------------------- *
   *  Overlay visual state (Module 1-3, 19-20) - whenever a gate state
   *  carries message text (loading/long-loading/stalled/ended), the media
   *  behind it gently blurs/dims/desaturates via CSS vars already wired
   *  into the SAME filter list as the frame's existing nostalgia
   *  treatment (see projector.css) - one paint cost, smoothly animated,
   *  never a hard cut. Neutral (0px/1/1) the instant real playback is
   *  showing or the quiet pre-play poster is up, so the media reads
   *  clearly whenever there is nothing to say about it.
   *  ---------------------------------------------------------------------*/
  function setOverlayActive(active) {
    const root = document.documentElement.style;
    const o = (cfgCache && cfgCache.overlay) || {};
    if (active) {
      const blur = typeof o.blur === "number" ? o.blur : 6;
      const dim = typeof o.dim === "number" ? o.dim : 30;
      root.setProperty("--proj-overlay-blur", blur + "px");
      root.setProperty("--proj-overlay-dim", (1 - dim / 100).toFixed(2));
      root.setProperty("--proj-overlay-desat", (1 - dim / 250).toFixed(2));
    } else {
      root.setProperty("--proj-overlay-blur", "0px");
      root.setProperty("--proj-overlay-dim", "1");
      root.setProperty("--proj-overlay-desat", "1");
    }
  }

  /* -------------------------------------------------------------------- *
   *  Entrance - the whole framed composition (frame + mask + poster +
   *  decoration) fades/scales in as ONE object, gated on its own
   *  decorative assets actually being ready (Module 4: the previous
   *  version started this transition immediately, before the frame PNG
   *  or the CSS mask image had necessarily loaded, which is exactly what
   *  produced "mask appears, blank interior, then frame pops in" - two
   *  independently-loading network images racing against a CSS animation
   *  that didn't know or care whether they'd arrived). preload() (bottom)
   *  warms both during the countdown so in the common case this resolves
   *  instantly; the safety timeout guarantees it is never stuck invisible
   *  on a slow connection either.
   *  ---------------------------------------------------------------------*/
  function triggerEntrance() {
    frameEl.classList.remove("enter");
    void frameEl.offsetWidth; // restart the transition if this is a re-entry
    frameEl.classList.add("enter");
  }

  function armEntrance() {
    const overlay = document.getElementById("projFrameOverlay");
    let fired = false;
    const fire = () => { if (!fired) { fired = true; triggerEntrance(); } };
    if (overlay.complete && overlay.naturalWidth > 0) {
      fire();
    } else {
      overlay.addEventListener("load", fire, { once: true });
      overlay.addEventListener("error", fire, { once: true });
      setTimeout(fire, ENTRANCE_SAFETY_MS);
    }
  }

  /* -------------------------------------------------------------------- *
   *  The gate - one overlay, one function per state. Every state clears
   *  whatever the previous one showed instead of layering flags, so there
   *  is never a stuck "loading text + play button both visible" glitch.
   *  All copy is config-driven (admin panel's "متن‌های پروژکتور" section)
   *  with the shipped defaults as fallback - see config.js.
   *  ---------------------------------------------------------------------*/
  function clearTimers() {
    clearTimeout(loadingTimeoutId);
    clearTimeout(stallTimeoutId);
    clearTimeout(advanceTimer);
    loadingTimeoutId = null;
    stallTimeoutId = null;
    stopYoutubeHeartbeat();
  }

  function hideGate() {
    gateEl.classList.remove("show");
    gateTextEl.classList.remove("show");
    playBtn.classList.remove("show");
    gateActionsEl.classList.remove("show");
    retryBtn.classList.remove("show");
    skipBtn.classList.remove("show");
    endedActionsEl.classList.remove("show");
    replayBtn.classList.remove("show");
    continueBtn.classList.remove("show");
    ambientGlowEl.classList.remove("show");
  }

  function showPreplayGate() {
    hideGate();
    setOverlayActive(false);
    applyPoster(currentPosterUrl());
    gateEl.classList.add("show");
    playBtn.classList.add("show");
    ambientGlowEl.classList.add("show");
    titleEl.classList.add("show");
  }

  function showLoadingGate(withEscape) {
    hideGate();
    setOverlayActive(true);
    gateEl.classList.add("show");
    gateTextEl.textContent = withEscape
      ? (cfgCache.longLoadingText || "یکم بیشتر زمان می‌خواد...")
      : (cfgCache.loadingText || "دارم آماده‌ش می‌کنم...");
    gateTextEl.classList.add("show");
    ambientGlowEl.classList.add("show");
    if (withEscape && cfgCache.showSkip !== false) {
      gateActionsEl.classList.add("show");
      retryBtn.classList.add("show");
      skipBtn.classList.add("show");
    }
  }

  function showStalledGate() {
    hideGate();
    setOverlayActive(true);
    gateEl.classList.add("show");
    gateTextEl.textContent = cfgCache.stalledText || "هنوز آماده نشده";
    gateTextEl.classList.add("show");
    gateActionsEl.classList.add("show");
    retryBtn.classList.add("show");
    if (cfgCache.showSkip !== false) skipBtn.classList.add("show");
    ambientGlowEl.classList.add("show");
  }

  /* The calm, indefinite-wait reaction state once a memory actually
     finishes (as opposed to showStalledGate above, which is for when
     something went wrong) - deliberately no headline text, just the
     quiet actions once the hold ends (see endSequence()). Replay only
     appears when there is something to replay AND the admin hasn't
     hidden it; Continue is the only action that can never be hidden -
     it is the sole way out once Auto Continue is off. Does NOT touch
     the frame/title/media - the last frame stays exactly as it was
     (Module 16). */
  function showEndedGate() {
    hideGate();
    setOverlayActive(true);
    gateEl.classList.add("show");
    endedActionsEl.classList.add("show");
    const hasReplayableMedia = cfgCache.source === "youtube"
      ? !!extractYouTubeId(cfgCache.youtubeUrl)
      : memories.length > 0;
    if (hasReplayableMedia && cfgCache.showReplay !== false) replayBtn.classList.add("show");
    continueBtn.classList.add("show");
    ambientGlowEl.classList.add("show");
  }

  /* -------------------------------------------------------------------- *
   *  Playback core.
   *  ---------------------------------------------------------------------*/
  function armLoadingTimeout() {
    clearTimeout(loadingTimeoutId);
    loadingTimeoutId = setTimeout(() => showLoadingGate(true), LOADING_TIMEOUT_MS);
  }

  function armStallWatchdog() {
    clearTimeout(stallTimeoutId);
    stallTimeoutId = setTimeout(() => {
      showStalledGate();
    }, STALL_TIMEOUT_MS);
  }

  function loadItem(index) {
    if (memories.length === 0) { setFrameEmpty(true); showEndedGate(); return; }
    setFrameEmpty(false);
    const item = memories[index];
    currentId = item.id;
    const layer = layers[nextLayer];
    const other = layers[1 - nextLayer];
    const requestToken = ++showRequestSeq;

    layer.innerHTML = "";
    clearTimeout(advanceTimer);
    armLoadingTimeout();

    function reveal(el) {
      if (requestToken !== showRequestSeq) return;
      clearTimeout(loadingTimeoutId);
      hideGate();
      setOverlayActive(false);
      hidePoster();
      layer.classList.add("active");
      other.classList.remove("active");
      // Stop the outgoing layer's media immediately instead of only
      // hiding it - otherwise it keeps decoding (and, for video, keeps
      // making sound) in the background until this layer slot happens
      // to be reused two items later. Found while testing Replay:
      // replaying the same item while its previous copy was still
      // "inactive but playing" produced two overlapping video/audio
      // streams - a real correctness bug, not just a resize/perf one.
      other.querySelectorAll("video").forEach((v) => v.pause());
      currentEl = el;

      captionEl.classList.remove("show");
      captionEl.textContent = item.caption || "";
      void captionEl.offsetWidth;
      captionEl.classList.add("show");

      if (item.type === "video") {
        armStallWatchdog();
        el.addEventListener("timeupdate", armStallWatchdog);
        el.addEventListener("ended", () => { clearTimeout(stallTimeoutId); advance(); });
        if (item.trimEnd) {
          el.addEventListener("timeupdate", () => {
            if (el.currentTime >= item.trimEnd) advance();
          });
        }
      } else {
        advanceTimer = setTimeout(advance, PACE_MS[item.pace] || PACE_MS.normal);
      }
    }

    function onItemError() {
      if (requestToken !== showRequestSeq) return;
      clearTimeout(loadingTimeoutId);
      showStalledGate();
    }

    const wantBg = window.NUR_PROJECTOR._bgEnabled;
    const fgSlot = document.createElement("div");
    fgSlot.className = "media-slot media-fg";
    layer.appendChild(fgSlot);
    let bgSlot = null;
    if (wantBg) {
      bgSlot = document.createElement("div");
      bgSlot.className = "media-slot media-bg";
      layer.appendChild(bgSlot);
    }

    let el;
    if (item.type === "video") {
      // Reuse the exact element preload() already started fetching for
      // item 0, instead of creating a second <video> with the same src -
      // two elements pointed at the same URL can each trigger their own
      // network request depending on cache headers; one shared element
      // guarantees exactly one request no matter what.
      if (index === 0 && preloadEl && preloadUrl === item.src) {
        el = preloadEl;
      } else {
        el = document.createElement("video");
        el.muted = true;
        el.playsInline = true;
        el.preload = "auto";
        el.src = item.src;
      }
      preloadEl = null;
      preloadUrl = null;
      fgSlot.appendChild(el);
      el.load();

      let bgEl = null;
      if (bgSlot) {
        bgEl = document.createElement("video");
        bgEl.muted = true;
        bgEl.playsInline = true;
        bgEl.preload = "auto";
        bgEl.src = item.src;
        bgSlot.appendChild(bgEl);
        bgEl.load();
        el.__bgTwin = bgEl;
      }

      function syncBgStart() {
        if (!bgEl) return;
        const doIt = () => {
          try { if (item.trimStart) bgEl.currentTime = item.trimStart; } catch (err) { /* ignore */ }
          bgEl.play().catch(() => {});
        };
        if (bgEl.readyState >= 2) doIt(); else bgEl.addEventListener("loadeddata", doIt, { once: true });
      }

      el.addEventListener("loadeddata", () => {
        if (item.trimStart) { try { el.currentTime = item.trimStart; } catch (err) { /* ignore */ } }
        el.play().then(() => reveal(el)).catch(() => {
          // Muted autoplay only fails in genuinely broken environments -
          // treat exactly like a load error rather than silently hanging.
          if (requestToken === showRequestSeq) onItemError();
        });
        syncBgStart();
      });
      el.addEventListener("error", onItemError);
      el.addEventListener("timeupdate", () => {
        if (bgEl && bgEl.readyState >= 2 && Math.abs(bgEl.currentTime - el.currentTime) > 0.25) {
          try { bgEl.currentTime = el.currentTime; } catch (err) { /* ignore */ }
        }
      });
    } else {
      el = document.createElement("img");
      el.alt = item.caption || "";
      el.src = item.src;
      fgSlot.appendChild(el);
      if (bgSlot) {
        const bgImg = document.createElement("img");
        bgImg.alt = "";
        bgImg.src = item.src;
        bgSlot.appendChild(bgImg);
      }
      el.addEventListener("error", onItemError);
      if (el.decode) {
        el.decode().then(() => reveal(el)).catch(() => reveal(el));
      } else {
        reveal(el);
      }
    }
    nextLayer = 1 - nextLayer;
    preloadImage(memories[(index + 1) % memories.length]);
  }

  function advance() {
    const idx = currentIndex();
    const nextIdx = idx === -1 ? 0 : idx + 1;
    if (nextIdx >= memories.length) {
      if (cfgCache.loop) {
        loadItem(0);
      } else {
        endSequence();
      }
      return;
    }
    loadItem(nextIdx);
  }

  /* Last frame/ambience lingers briefly ("something settling"), then
     either moves on by itself (Auto Continue) or reveals the calm
     Replay/Continue gate and waits indefinitely - never loops forever
     by default, and never rushes straight to Final either (Auto
     Continue defaults OFF: a streamer needs room to react to a memory,
     not a silent jump to the next scene). Nothing here touches the
     frame/title/media - the ended video's own last frame is already
     exactly what should stay on screen (Module 16). */
  function endSequence() {
    clearTimeout(advanceTimer);
    const delayMs = Math.max(0, (typeof cfgCache.continueDelaySec === "number" ? cfgCache.continueDelaySec : 1.3) * 1000);
    advanceTimer = setTimeout(() => {
      if (cfgCache.autoContinue) {
        callFinish();
      } else {
        showEndedGate();
      }
    }, delayMs);
  }

  /* The only path to "done" - never called piecemeal alongside manually
     hiding title/frame/gate first. The whole #stage-projector section
     leaves as one composition via app.js's existing cross-stage fade
     (show() -> .stage.leaving -> sceneOut), which already covers every
     descendant at once - nothing extra to orchestrate here. */
  function callFinish() {
    clearTimers();
    if (onDoneCallback) onDoneCallback();
  }

  function beginPlayback() {
    hideGate();
    if (cfgCache.source === "youtube") {
      if (!extractYouTubeId(cfgCache.youtubeUrl)) { setFrameEmpty(true); showEndedGate(); return; }
      beginPlaybackYoutube();
      return;
    }
    if (memories.length === 0) { setFrameEmpty(true); showEndedGate(); return; }
    showLoadingGate(false);
    loadItem(0);
  }

  function retryCurrent() {
    if (cfgCache.source === "youtube") { retryYoutube(); return; }
    const idx = currentIndex();
    loadItem(idx === -1 ? 0 : idx);
  }

  /* Replay restarts the WHOLE sequence from the first memory (Module 17:
     "restart from the beginning"), not just whichever item happened to
     be last - in the common case (one clip) these are the same thing.
     Reuses the exact, already-buffered <video> element in place instead
     of tearing it down and recreating it whenever that element is still
     the one showing - no redundant re-fetch of something already
     sitting in memory. Falls back to a normal (fresh) loadItem(0) only
     if that element is somehow gone or was a different item/type. */
  function replayFromStart() {
    if (cfgCache.source === "youtube") { replayYoutube(); return; }
    clearTimers();
    const first = memories[0];
    if (!first) { loadItem(0); return; }
    const canReuse = currentIndex() === 0 && first.type === "video" &&
      currentEl && currentEl.tagName === "VIDEO" && currentEl.src === first.src;
    if (canReuse) {
      hideGate();
      try { currentEl.currentTime = first.trimStart || 0; } catch (err) { /* ignore */ }
      currentEl.play().then(armStallWatchdog).catch(() => loadItem(0));
    } else {
      loadItem(0);
    }
  }

  /* -------------------------------------------------------------------- *
   *  YouTube playback - mirrors the upload path's shape (loading gate ->
   *  reveal/hide gate -> stall watchdog -> endSequence) but drives it
   *  from YT.PlayerState events instead of <video> events. Same gate
   *  functions, same timers, same Auto Continue/Replay/Continue logic -
   *  one Nur state model for both sources (Module 13).
   *  ---------------------------------------------------------------------*/
  function beginPlaybackYoutube() {
    const id = extractYouTubeId(cfgCache.youtubeUrl);
    if (!id) { showStalledGate(); return; }
    showLoadingGate(false);
    armLoadingTimeout();
    ytPendingPlay = true;
    const requestToken = ++showRequestSeq;
    loadYouTubeApi().then((YT) => {
      if (!ytPendingPlay || requestToken !== showRequestSeq) return; // superseded by a re-entry/retry while the API was loading
      youtubeEl.hidden = false;
      if (ytPlayer && ytReady) {
        try { ytPlayer.loadVideoById(id); } catch (err) { showStalledGate(); }
        return;
      }
      if (ytPlayer) return; // constructing already, onReady below will pick it up
      ytPlayer = new YT.Player(youtubeEl, {
        videoId: id,
        playerVars: {
          controls: 0, modestbranding: 1, rel: 0, iv_load_policy: 3,
          fs: 0, disablekb: 1, playsinline: 1, origin: location.origin
        },
        events: {
          onReady: () => { ytReady = true; if (ytPendingPlay) playYoutube(); },
          onStateChange: onYoutubeStateChange,
          onError: onYoutubeError
        }
      });
    });
  }

  function playYoutube() {
    try { ytPlayer.playVideo(); } catch (err) { showStalledGate(); }
  }

  function onYoutubeStateChange(e) {
    if (!window.YT) return;
    const S = window.YT.PlayerState;
    if (e.data === S.PLAYING) {
      clearTimeout(loadingTimeoutId);
      hideGate();
      setOverlayActive(false);
      hidePoster();
      armStallWatchdog();
      startYoutubeHeartbeat();
    } else if (e.data === S.BUFFERING) {
      armStallWatchdog(); // generous - normal mid-playback buffering shouldn't instantly read as broken
    } else if (e.data === S.ENDED) {
      clearTimeout(stallTimeoutId);
      stopYoutubeHeartbeat();
      endSequence(); // exact same hold -> Replay/Continue (or Auto Continue) logic as the upload path
    }
  }

  function onYoutubeError() {
    showStalledGate();
  }

  function retryYoutube() {
    ytPendingPlay = true;
    if (ytPlayer && ytReady) { playYoutube(); return; }
    beginPlaybackYoutube();
  }

  function replayYoutube() {
    hideGate();
    ytPendingPlay = true;
    if (ytPlayer && ytReady) {
      try { ytPlayer.seekTo(0); ytPlayer.playVideo(); armStallWatchdog(); } catch (err) { beginPlaybackYoutube(); }
    } else {
      beginPlaybackYoutube();
    }
  }

  /* Called on every entry (real, preview, or re-entry) - stops any
     already-playing YouTube video and hides its box rather than leaving
     it running behind a fresh preplay poster. Safe no-op if no player
     exists yet (the common case: nothing has ever played). */
  function resetYoutubePlayback() {
    ytPendingPlay = false;
    stopYoutubeHeartbeat();
    if (ytPlayer && ytReady) {
      try { ytPlayer.pauseVideo(); } catch (err) { /* ignore */ }
    }
    if (youtubeEl) youtubeEl.hidden = true;
  }

  /* -------------------------------------------------------------------- *
   *  Config application - reads config.projector (the real config object,
   *  same one every other stage uses) and drives the same CSS vars the
   *  prototype's applyMemoryConfig did, plus every editable text surface
   *  (Module 22/23) so admin edits reflect instantly regardless of which
   *  gate state happens to be showing.
   *  ---------------------------------------------------------------------*/
  function hexToRgba(hex, alphaPct) {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || "");
    if (!m) return null;
    const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    return "rgba(" + r + "," + g + "," + b + "," + (Math.max(0, Math.min(100, alphaPct)) / 100).toFixed(2) + ")";
  }

  function applyProjectorConfig(cfg) {
    const root = document.documentElement.style;
    const preset = PROJECTOR_PRESETS[cfg.preset] || PROJECTOR_PRESETS.balanced;

    const mediaSize = Math.max(60, Math.min(100, typeof cfg.mediaSize === "number" ? cfg.mediaSize : 88));
    const pad = (100 - mediaSize) / 2;
    root.setProperty("--proj-fg-inset-top", pad + "%");
    root.setProperty("--proj-fg-inset-right", pad + "%");
    root.setProperty("--proj-fg-inset-bottom", pad + "%");
    root.setProperty("--proj-fg-inset-left", pad + "%");
    root.setProperty("--proj-fg-shrink", "1");

    const cx = (typeof cfg.centerX === "number" ? cfg.centerX : 50) + "%";
    const cy = (typeof cfg.centerY === "number" ? cfg.centerY : 50) + "%";
    root.setProperty("--proj-fg-obj-pos", cx + " " + cy);
    root.setProperty("--proj-vignette-cx", cx);
    root.setProperty("--proj-vignette-cy", cy);

    const fadeAmt = Math.max(0, Math.min(100, typeof cfg.edgeFade === "number" ? cfg.edgeFade : 50)) / 100;
    const intensity = preset.vignette * fadeAmt * 2;
    const inner = Math.max(20, 78 - intensity * 28);
    const outer = Math.min(100, inner + 18 + intensity * 10);
    root.setProperty("--proj-vignette-inner", inner.toFixed(1) + "%");
    root.setProperty("--proj-vignette-outer", outer.toFixed(1) + "%");
    root.setProperty("--proj-vignette-alpha", Math.min(0.85, intensity * 0.4).toFixed(2));
    root.setProperty("--proj-extra-blur-px", (preset.blurPx * (0.4 + fadeAmt)).toFixed(2) + "px");

    const bgI = (typeof cfg.bgFillIntensity === "number" ? cfg.bgFillIntensity : 0) / 100;
    root.setProperty("--proj-bg-blur-px", (bgI * 22).toFixed(1) + "px");
    root.setProperty("--proj-bg-brightness", (1 - bgI * 0.5).toFixed(2));
    root.setProperty("--proj-bg-opacity", (1 - bgI * 0.35).toFixed(2));
    window.NUR_PROJECTOR._bgEnabled = bgI > 0;

    const title = cfg.title || {};
    root.setProperty("--proj-title-font-size", (typeof title.fontSize === "number" ? title.fontSize : 18) + "px");
    root.setProperty("--proj-title-color", title.color || "var(--muted)");
    root.setProperty("--proj-title-opacity", typeof title.opacity === "number" ? title.opacity : 0.85);
    if (titleEl) titleEl.textContent = title.text || "";
    if (playBtn) playBtn.textContent = cfg.playButtonText || "ببینش";
    if (retryBtn) retryBtn.textContent = cfg.retryText || "دوباره تلاش کن";
    if (skipBtn) skipBtn.textContent = cfg.skipText || "ادامه بدون فیلم";
    if (replayBtn) replayBtn.textContent = cfg.replayText || "پخش دوباره";
    if (continueBtn) continueBtn.textContent = cfg.continueText || "ادامه";

    // Overlay appearance (Module 2/3 - admin's "ظاهر پیام‌های روی ویدیو").
    // Static per-config, unlike --proj-overlay-blur/dim/desat above which
    // toggle per gate state (see setOverlayActive()).
    const ov = cfg.overlay || {};
    const tintStrong = hexToRgba(ov.tint, typeof ov.tintOpacity === "number" ? ov.tintOpacity : 55);
    const tintSoft = hexToRgba(ov.tint, (typeof ov.tintOpacity === "number" ? ov.tintOpacity : 55) * 0.7);
    root.setProperty("--proj-overlay-tint-strong", tintStrong || "rgba(17,13,8,.42)");
    root.setProperty("--proj-overlay-tint-soft", tintSoft || "rgba(17,13,8,.3)");
    root.setProperty("--proj-overlay-text", ov.textColor || "#f6efe0");
    root.setProperty("--proj-overlay-accent", ov.accentColor || "#f6efe0");
  }

  /* -------------------------------------------------------------------- *
   *  One-time DOM wiring, shared by start() and previewEnter() - grabs
   *  every element reference and attaches every click handler exactly
   *  once, regardless of which entry point gets called first.
   *  ---------------------------------------------------------------------*/
  function wireOnce() {
    if (started) return;
    started = true;
    frameEl = document.getElementById("memoryFrame");
    layers = Array.from(document.querySelectorAll("#stage-projector .media-layer"));
    frameMediaEl = document.querySelector("#stage-projector .frame-media");
    captionEl = document.getElementById("projCaption");
    titleEl = document.getElementById("projTitle");
    ambientGlowEl = document.querySelector("#stage-projector .proj-ambient-glow");
    posterEl = document.getElementById("projPoster");
    previewBadgeEl = document.getElementById("projPreviewBadge");
    gateEl = document.getElementById("projGate");
    gateTextEl = document.getElementById("projGateText");
    playBtn = document.getElementById("projPlayBtn");
    gateActionsEl = document.getElementById("projGateActions");
    retryBtn = document.getElementById("projRetryBtn");
    skipBtn = document.getElementById("projSkipBtn");
    endedActionsEl = document.getElementById("projEndedActions");
    replayBtn = document.getElementById("projReplayBtn");
    continueBtn = document.getElementById("projContinueBtn");
    youtubeEl = document.getElementById("projYouTube");

    const overlay = document.getElementById("projFrameOverlay");
    if (overlay) {
      overlay.addEventListener("load", () => overlay.classList.add("ready"), { once: true });
      overlay.src = FRAME_OVERLAY_SRC;
    }
    if (!maskWarmed) {
      maskWarmed = true;
      new Image().src = FRAME_MASK_SRC; // warm the HTTP cache for the CSS mask-image below
    }

    playBtn.addEventListener("click", beginPlayback);
    retryBtn.addEventListener("click", retryCurrent);
    skipBtn.addEventListener("click", callFinish);
    replayBtn.addEventListener("click", replayFromStart);
    continueBtn.addEventListener("click", callFinish);
  }

  /* Shared by start()/previewEnter() - applies config, rebuilds the
     memory list, resets every timer/gate, and reveals the entrance. Never
     touches onDoneCallback - that is each entry point's own concern. */
  function resetToEntry(cfg) {
    clearTimers();
    hidePoster();
    resetYoutubePlayback();
    cfgCache = cfg || {};
    applyProjectorConfig(cfgCache);
    syncMemoriesFromConfig(cfgCache.items);
    const isYoutube = cfgCache.source === "youtube";
    setFrameEmpty(!isYoutube && memories.length === 0);
    armEntrance();
    // Nothing configured for the active source yet (Projector turned on
    // before any memory was uploaded, or YouTube mode with no URL yet) -
    // skip the play prompt entirely rather than inviting a tap that leads
    // nowhere; go straight to the one control that's actually meaningful
    // here (Module 12: Final must always stay reachable, including when
    // media is simply missing).
    const hasMedia = isYoutube ? !!extractYouTubeId(cfgCache.youtubeUrl) : memories.length > 0;
    if (!hasMedia) {
      showEndedGate();
    } else {
      showPreplayGate();
    }
  }

  /* -------------------------------------------------------------------- *
   *  Public API.
   *  ---------------------------------------------------------------------*/

  /* The ONLY path a real visitor ever takes - app.js's
     goToFinalOrProjector() calls this once, with the real "go to Final"
     callback. See the file header for exactly why this must never be
     reused for admin preview. */
  function start(cfg, onDone) {
    wireOnce();
    onDoneCallback = onDone;
    resetToEntry(cfg);
  }

  /* Admin-panel tab-preview only. Reuses onDoneCallback if one already
     exists (e.g. a real sequence is genuinely in progress and the admin
     is just glancing at the tab) instead of ever overwriting it - the
     fix for Module 2's bug. Falls back to a harmless no-op only if
     nothing has ever been set (nothing to route to yet in that case
     anyway). */
  function previewEnter(cfg) {
    wireOnce();
    if (!onDoneCallback) onDoneCallback = () => {};
    resetToEntry(cfg);
  }

  /* Live-preview only (admin panel sliders/color pickers/text fields) -
     appearance + every text surface update instantly; never touches
     playback state or the gate's current visibility, so it is safe to
     call on every keystroke without interrupting anything (Module 23). */
  function applyLive(cfg) {
    cfgCache = cfg || {};
    applyProjectorConfig(cfgCache);
    syncMemoriesFromConfig(cfgCache.items);
    // Only touch the poster while the preplay gate is actually the thing
    // showing (Module 23: instant feedback while it's relevant) - editing
    // it mid-playback or after the memory ended would just be invisible
    // until the next real entry anyway, so there is nothing to update.
    if (posterEl && playBtn && playBtn.classList.contains("show")) {
      applyPoster(currentPosterUrl());
    }
  }

  /* Called by app.js near the end of the countdown (only when Projector
     is enabled) - the ONE deliberate exception to "never load anything
     until start()/previewEnter()". Warms the frame's own decorative PNG/
     mask (Module 4/5 - so the entrance never has to wait for them) plus
     exactly the first memory item and its poster, nothing more: a hidden
     <video preload="auto"> (browsers fetch enough to start smoothly, not
     the whole file) or a plain Image() prefetch for a photo. If start()
     later plays that same first item, loadItem() reuses this exact
     element instead of creating a second one, so there is never a
     duplicate request. */
  function preload(cfg) {
    if (!cfg || !cfg.enabled) return;
    if (!maskWarmed) {
      maskWarmed = true;
      new Image().src = FRAME_MASK_SRC;
    }
    new Image().src = FRAME_OVERLAY_SRC;
    if (cfg.poster) {
      new Image().src = cfg.poster;
    } else if (cfg.source === "youtube") {
      const id = extractYouTubeId(cfg.youtubeUrl);
      if (id) new Image().src = "https://img.youtube.com/vi/" + id + "/maxresdefault.jpg";
    }
    // Module 17 - only the active source ever loads anything beyond the
    // frame's own decorative assets above (those are shared by both).
    if (cfg.source === "youtube") {
      if (extractYouTubeId(cfg.youtubeUrl)) loadYouTubeApi(); // script only - no player/video data yet
      return;
    }
    if (preloadEl) return;
    const items = Array.isArray(cfg.items) ? cfg.items : [];
    const first = items[0];
    if (!first || !first.url) return;
    if (first.type === "video") {
      preloadEl = document.createElement("video");
      preloadEl.muted = true;
      preloadEl.playsInline = true;
      preloadEl.preload = "auto";
      preloadEl.src = first.url;
      preloadUrl = first.url;
      preloadEl.load();
    } else if (first.type === "image") {
      preloadImage({ type: "image", src: first.url });
    }
  }

  /* -------------------------------------------------------------------- *
   *  State Preview - admin-only editor tool (Module 24-28). Every branch
   *  is a pure UI-visibility toggle already used by the real state
   *  machine above (or, for "finalTransition", the same admin-preview
   *  stage switch every other tab already does) - none of them touch
   *  onDoneCallback, write to config, or start a real fetch, so flipping
   *  through every state costs nothing and saves nothing (Module 27).
   *  Six states, not eleven: "Entry"/"Pre-Play"/"Poster" are one and the
   *  same visual moment in this architecture (title + poster + play
   *  button, nothing else renders differently between them), and
   *  "Stalled" and "Failed Media" already funnel into one identical gate
   *  - inventing separate previews for states that render identically
   *    would be showing the same screenshot twice under different names.
   *  ---------------------------------------------------------------------*/
  const PREVIEW_LABELS = {
    entry: "ورود / قبل از پخش",
    loading: "بارگذاری",
    longLoading: "بارگذاری طولانی",
    stalled: "قطع‌شدگی / خطا",
    ended: "پایان ویدیو",
    finalTransition: "انتقال به پایانی"
  };

  function showPreviewBadge(name) {
    if (!previewBadgeEl) return;
    previewBadgeEl.textContent = "پیش‌نمایش: " + (PREVIEW_LABELS[name] || name);
    previewBadgeEl.classList.add("show");
  }

  function previewState(name) {
    if (!started) return;
    clearTimers();
    if (name === "finalTransition") {
      if (window.NUR_APP) window.NUR_APP.previewStage("stage-final");
      return;
    }
    showPreviewBadge(name);
    if (name === "entry") { resetToEntry(cfgCache); return; }
    if (name === "loading") { showLoadingGate(false); return; }
    if (name === "longLoading") { showLoadingGate(true); return; }
    if (name === "stalled") { showStalledGate(); return; }
    if (name === "ended") { showEndedGate(); return; }
  }

  window.NUR_PROJECTOR = {
    start,
    previewEnter,
    applyLive,
    preload,
    previewState,
    _bgEnabled: false
  };
})();
