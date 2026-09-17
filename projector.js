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
  const LOADING_TIMEOUT_MS = 6000;  // no progress on the very first load -> escalate to the "long loading" MESSAGE (no actions yet)
  const LONG_LOADING_ESCALATION_MS = 9000; // long loading itself drags on this much longer with still no progress -> treat it as a real stall (message + Retry/Skip)
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

  let frameEl, layers, frameMediaEl, captionEl, titleEl, ambientGlowEl, posterEl, previewBadgeEl, youtubeFrameEl, youtubeMountEl;
  let gateEl, gateTextEl, playBtn, gateActionsEl, retryBtn, skipBtn, endedActionsEl, replayBtn, continueBtn;
  let audioHintEl, audioHintTextEl;

  let loadingTimeoutId = null;
  let longLoadingEscalationId = null;
  let stallTimeoutId = null;
  let audioHintTimeoutId = null;
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
  let ytAudioHintShown = false;

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

  /* Fully tears down whatever the upload-media engine was showing/playing -
     pauses and detaches every <video> instead of just hiding it (a paused-
     but-still-`src`'d video can keep decoding/holding a network
     connection), clears both layers, and drops the caption. Split out from
     setFrameEmpty() so resetToEntry() can call this UNCONDITIONALLY on
     every entry (including into YouTube mode) - the actual fix for a real,
     confirmed bug: switching Media Source from Uploaded to YouTube never
     used to stop a still-active uploaded video, so it kept playing
     (video+audio) stacked underneath the new YouTube iframe. */
  function clearMediaLayers() {
    layers.forEach((l) => {
      l.classList.remove("active");
      l.querySelectorAll("video").forEach((v) => {
        v.pause();
        v.removeAttribute("src");
        v.load();
      });
      l.innerHTML = "";
    });
    captionEl.classList.remove("show");
    captionEl.textContent = "";
    currentEl = null;
  }

  function setFrameEmpty(empty) {
    frameMediaEl.classList.toggle("is-empty", empty);
    if (empty) clearMediaLayers();
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
   *  Audio - applies to the real foreground video ONLY. The blurred
   *  background twin (bgFillIntensity) and the preload() warm-up element
   *  stay hard-muted no matter what - either would double/echo the same
   *  clip's audio if ever unmuted. Called right before every real play()
   *  attempt (fresh load AND Replay's reused-element fast path), so a
   *  volume/mute change in admin takes effect the next time playback
   *  actually starts.
   *  ---------------------------------------------------------------------*/
  function applyAudioSettings(el) {
    const audio = (cfgCache && cfgCache.audio) || {};
    el.muted = audio.enabled === false;
    el.volume = typeof audio.volume === "number" ? Math.max(0, Math.min(100, audio.volume)) / 100 : 1;
  }

  function hideAudioHint() {
    if (!audioHintEl) return;
    clearTimeout(audioHintTimeoutId);
    audioHintTimeoutId = null;
    audioHintEl.classList.remove("show", "proj-audio-hint--action");
    audioHintEl.onclick = null;
  }

  /* Small temporary "صدا روشنه" corner reminder (Module 3-5) - purely
     informational, auto-hides itself after hintDuration seconds. Never
     shown if the admin turned it off, or if audio itself is off (nothing
     to remind anyone of). */
  function showAudioReminder() {
    if (!audioHintEl) return;
    const audio = (cfgCache && cfgCache.audio) || {};
    if (audio.enabled === false || audio.hintEnabled === false) return;
    hideAudioHint();
    audioHintTextEl.textContent = audio.hintText || "صدا روشنه";
    audioHintEl.classList.add("show");
    const durationMs = Math.max(1, typeof audio.hintDuration === "number" ? audio.hintDuration : 5) * 1000;
    audioHintTimeoutId = setTimeout(() => audioHintEl.classList.remove("show"), durationMs);
  }

  /* Admin-only preview (Module 4 - "I cannot see the reminder while
     editing, it only appears after playback starts"). Shows the exact
     same element with NO auto-hide timer, so the admin can freely tweak
     every "صدا" slider/color and see it update live without playing
     anything or waiting 5 seconds. Real visitors never call this - it's
     wired to a dedicated admin-panel button, not any real playback path.
     previewEnter()/resetToEntry() (run every time the admin switches
     tabs) already call hideAudioHint() via showPreplayGate(), so leaving
     the preview open never leaks into a real state. */
  function previewAudioHint() {
    if (!audioHintEl) return;
    const audio = (cfgCache && cfgCache.audio) || {};
    hideAudioHint();
    audioHintTextEl.textContent = audio.hintText || "صدا روشنه";
    audioHintEl.classList.add("show");
  }

  /* Module 7 - audible autoplay got rejected by browser policy and
     playback fell back to muted. A persistent (no auto-hide timer),
     clickable action instead of the plain reminder above - clicking it
     is itself a fresh user gesture, which is exactly what's needed to
     unlock audible playback on the ALREADY-playing element. */
  function showAudioFallbackAction(el) {
    if (!audioHintEl) return;
    hideAudioHint();
    audioHintEl.classList.add("show", "proj-audio-hint--action");
    audioHintTextEl.textContent = "فعال کردن صدا";
    audioHintEl.onclick = () => {
      try {
        applyAudioSettings(el);
        el.play().catch(() => {});
      } catch (err) { /* ignore */ }
      hideAudioHint();
    };
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

  /* Cover/pre-play state's OWN optional blur/dim (Module 8) - deliberately
     a separate function from setOverlayActive() above, never mixed with
     the loading/stalled/ended overlay.blur/dim - a poster's backdrop
     treatment is a different visual decision from "something needs your
     attention". 0/0 by default (identical to setOverlayActive(false)),
     so nothing changes for an admin who never touches these. */
  function setCoverOverlay() {
    const root = document.documentElement.style;
    const c = (cfgCache && cfgCache.coverCta) || {};
    const dim = Math.max(0, Math.min(100, typeof c.bgDim === "number" ? c.bgDim : 0));
    const blur = typeof c.bgBlur === "number" ? c.bgBlur : 0;
    root.setProperty("--proj-overlay-blur", blur + "px");
    root.setProperty("--proj-overlay-dim", (1 - dim / 100).toFixed(2));
    root.setProperty("--proj-overlay-desat", (1 - dim / 250).toFixed(2));
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
    clearTimeout(longLoadingEscalationId);
    clearTimeout(stallTimeoutId);
    clearTimeout(advanceTimer);
    clearTimeout(audioHintTimeoutId);
    loadingTimeoutId = null;
    longLoadingEscalationId = null;
    stallTimeoutId = null;
    audioHintTimeoutId = null;
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
    hideAudioHint();
    setCoverOverlay();
    applyPoster(currentPosterUrl());
    gateEl.classList.add("show");
    playBtn.classList.add("show");
    ambientGlowEl.classList.add("show");
    titleEl.classList.add("show");
  }

  /* LOADING and LONG LOADING are the SAME non-error waiting state, just
     escalated copy - neither ever shows Retry/Skip (a real, confirmed
     bug: long loading used to reveal both actions, making it visually
     indistinguishable from a real stall). If long loading itself drags
     on with still no progress, armLongLoadingEscalation() below promotes
     it into the real stalled state - the viewer is never stuck on a
     "still waiting" message with no way out, but the plain waiting
     message itself never carries actions. */
  function showLoadingGate(withEscape) {
    hideGate();
    hideAudioHint();
    setOverlayActive(true);
    gateEl.classList.add("show");
    gateTextEl.textContent = withEscape
      ? (cfgCache.longLoadingText || "یکم بیشتر زمان می‌خواد...")
      : (cfgCache.loadingText || "دارم آماده‌ش می‌کنم...");
    gateTextEl.classList.add("show");
    ambientGlowEl.classList.add("show");
    if (withEscape) armLongLoadingEscalation();
  }

  /* The ONLY state that ever shows Retry/Continue-Without-Video - a real
     failure or a sustained stall, never just "still waiting" (see
     showLoadingGate above). */
  function showStalledGate() {
    hideGate();
    hideAudioHint();
    setOverlayActive(true);
    gateEl.classList.add("show");
    gateTextEl.textContent = cfgCache.stalledText || "اتصال قطع شد";
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
    hideAudioHint();
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

  /* Long loading is a patience message, not an error - it never shows
     Retry/Skip on its own (see showLoadingGate). But if it drags on this
     much longer with STILL no progress, it really has become a stall in
     every practical sense, so promote it into the real stalled state
     (message + actions) rather than leaving the viewer stuck forever on
     a "still waiting" message with no way out. */
  function armLongLoadingEscalation() {
    clearTimeout(longLoadingEscalationId);
    longLoadingEscalationId = setTimeout(() => showStalledGate(), LONG_LOADING_ESCALATION_MS);
  }

  /* Whether media is ACTIVELY trying to play right now - the missing
     check behind a real, confirmed false-positive bug: the stall
     watchdog fired purely on "timeupdate/state hasn't progressed
     recently", with no check for WHY. A video that is simply paused
     (a real user pause, a backgrounded/throttled tab, or any other
     non-error reason `timeupdate` stops) would sit quietly for
     STALL_TIMEOUT_MS and then show "internet is weak" despite nothing
     being wrong. Module 3's explicit instruction - reliability over
     clever detection - means: if the media isn't even trying to play,
     don't warn about it stalling. */
  function isActivelyPlaying() {
    if (cfgCache && cfgCache.source === "youtube") {
      if (!ytPlayer || !window.YT) return false;
      try { return ytPlayer.getPlayerState() === window.YT.PlayerState.PLAYING; } catch (err) { return false; }
    }
    return !!(currentEl && currentEl.tagName === "VIDEO" && !currentEl.paused && !currentEl.ended);
  }

  function armStallWatchdog() {
    clearTimeout(stallTimeoutId);
    stallTimeoutId = setTimeout(() => {
      if (!isActivelyPlaying()) return; // not a stall - media simply isn't trying to play right now
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
    clearTimeout(longLoadingEscalationId);
    armLoadingTimeout();

    /* play()'s promise resolving only means playback was ACCEPTED, not
       that a frame has actually reached the screen yet - there can be a
       real, if brief, gap where the <video> has nothing decoded to paint.
       Since reveal() below hides the poster and cuts the incoming media
       layer straight to opacity:1 (no crossfade - see .media-layer's own
       comment), that gap exposed .frame-media's own background color
       (the "avoids a white flash" cream fill) as a visible flash before
       the real frame caught up. A double requestAnimationFrame (a
       standard wait-for-actual-paint technique, not a guessed delay) lets
       at least one real compositor frame land first - not a fixed
       timeout, since it's tied to the browser's own paint cycle rather
       than a guessed duration. */
    function revealAfterPaint(el) {
      requestAnimationFrame(() => requestAnimationFrame(() => reveal(el)));
    }

    function reveal(el) {
      if (requestToken !== showRequestSeq) return;
      clearTimeout(loadingTimeoutId);
      clearTimeout(longLoadingEscalationId);
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
      clearTimeout(longLoadingEscalationId);
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
        el.muted = true; // safe initial default only - applyAudioSettings() sets the real value right before play()
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
        applyAudioSettings(el);
        const wantedAudible = !el.muted;
        el.play().then(() => {
          revealAfterPaint(el);
          if (wantedAudible) showAudioReminder();
        }).catch(() => {
          if (wantedAudible) {
            // Audible autoplay was rejected by the browser's autoplay
            // policy (a real, known edge case when the gap between the
            // Play click and this loadeddata event runs long enough for
            // the user-gesture flag to lapse, mostly on mobile). Fall
            // back to muted rather than breaking the memory entirely
            // (Module 7), and offer a one-tap way back to sound.
            el.muted = true;
            el.play().then(() => {
              revealAfterPaint(el);
              showAudioFallbackAction(el);
            }).catch(() => {
              if (requestToken === showRequestSeq) onItemError();
            });
            return;
          }
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
      // The confirmed Replay bug: hideGate() only toggles the gate's own
      // CSS classes (show/hide) - it never touched --proj-overlay-blur/
      // dim/desat, which showEndedGate() had just turned ON. The normal
      // loadItem()->reveal() path always calls setOverlayActive(false)
      // when revealing media; this fast "reuse the existing element"
      // path skipped reveal() entirely and so skipped that reset too,
      // leaving the video visibly blurred/dimmed through the whole
      // replay. Explicit reset here closes that gap.
      setOverlayActive(false);
      hidePoster();
      try { currentEl.currentTime = first.trimStart || 0; } catch (err) { /* ignore */ }
      applyAudioSettings(currentEl);
      const wantedAudible = !currentEl.muted;
      currentEl.play().then(() => {
        armStallWatchdog();
        // Module 6 - show the reminder again on Replay (only if audio is
        // actually on) rather than assuming the viewer remembers from the
        // first play - a fresh watch-through deserves its own reminder.
        if (wantedAudible) showAudioReminder();
      }).catch(() => {
        if (wantedAudible) { currentEl.muted = true; currentEl.play().then(() => showAudioFallbackAction(currentEl)).catch(() => loadItem(0)); return; }
        loadItem(0);
      });
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
      youtubeFrameEl.hidden = false;
      if (ytPlayer && ytReady) {
        try { ytPlayer.loadVideoById(id); } catch (err) { showStalledGate(); }
        return;
      }
      if (ytPlayer) return; // constructing already, onReady below will pick it up
      // Hand YT the INNER mount div, never the outer wrapper - YT.Player
      // replaces whatever element it's given with its own <iframe>, so the
      // wrapper (which every hidden-toggle above/below targets) must stay
      // untouched or it goes stale the moment this line runs.
      ytPlayer = new YT.Player(youtubeMountEl, {
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

  // Same audio settings as the upload path, applied through the IFrame
  // API's own mute()/unMute()/setVolume() instead of a <video> element's
  // properties - YouTube has no equivalent of the upload path's "audible
  // autoplay got rejected" failure mode to fall back from (the player
  // handles its own autoplay policy internally), so this is the simpler
  // one-shot version of applyAudioSettings().
  function applyYoutubeAudioSettings() {
    if (!ytPlayer) return;
    const audio = (cfgCache && cfgCache.audio) || {};
    try {
      if (audio.enabled === false) {
        ytPlayer.mute();
      } else {
        ytPlayer.unMute();
        ytPlayer.setVolume(typeof audio.volume === "number" ? Math.max(0, Math.min(100, audio.volume)) : 100);
      }
    } catch (err) { /* ignore */ }
  }

  function playYoutube() {
    applyYoutubeAudioSettings();
    ytAudioHintShown = false;
    try { ytPlayer.playVideo(); } catch (err) { showStalledGate(); }
  }

  function onYoutubeStateChange(e) {
    if (!window.YT) return;
    const S = window.YT.PlayerState;
    if (e.data === S.PLAYING) {
      clearTimeout(loadingTimeoutId);
      clearTimeout(longLoadingEscalationId);
      hideGate();
      setOverlayActive(false);
      hidePoster();
      armStallWatchdog();
      startYoutubeHeartbeat();
      // onStateChange can re-fire PLAYING after buffering resumes mid-
      // watch - only show the reminder once per play/replay, not every
      // time playback resumes.
      if (!ytAudioHintShown) {
        ytAudioHintShown = true;
        const audio = (cfgCache && cfgCache.audio) || {};
        if (audio.enabled !== false) showAudioReminder();
      }
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
    // Same fix as the upload path's replayFromStart() - a seekTo() on an
    // already-"playing" player does not reliably re-fire onStateChange,
    // so onYoutubeStateChange's PLAYING branch (which normally resets the
    // overlay) may never run here. Reset explicitly instead of assuming
    // it will happen.
    setOverlayActive(false);
    hidePoster();
    ytPendingPlay = true;
    if (ytPlayer && ytReady) {
      try {
        ytPlayer.seekTo(0);
        applyYoutubeAudioSettings();
        ytAudioHintShown = false; // Module 6 - reminder shows again on Replay
        ytPlayer.playVideo();
        armStallWatchdog();
        const audio = (cfgCache && cfgCache.audio) || {};
        if (audio.enabled !== false) { ytAudioHintShown = true; showAudioReminder(); }
      } catch (err) { beginPlaybackYoutube(); }
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
    ytAudioHintShown = false;
    stopYoutubeHeartbeat();
    if (ytPlayer && ytReady) {
      try { ytPlayer.pauseVideo(); } catch (err) { /* ignore */ }
    }
    if (youtubeFrameEl) youtubeFrameEl.hidden = true;
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

    root.setProperty("--proj-poster-fit", cfg.posterFit === "cover" ? "cover" : "contain");
    root.setProperty("--proj-poster-scale", typeof cfg.posterScale === "number" ? cfg.posterScale : 1);
    root.setProperty("--proj-poster-x", (typeof cfg.posterX === "number" ? cfg.posterX : 50) + "%");
    root.setProperty("--proj-poster-y", (typeof cfg.posterY === "number" ? cfg.posterY : 50) + "%");

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

    // ONE shared style for every normal action (Retry/Skip/Replay/
    // Continue) - Module 6/9: these can no longer accidentally diverge,
    // since there is exactly one set of vars driving all four.
    const act = cfg.action || {};
    root.setProperty("--proj-action-font-size", (typeof act.fontSize === "number" ? act.fontSize : 15) + "px");
    root.setProperty("--proj-action-text", act.textColor || "#f6efe0");
    root.setProperty("--proj-action-bg", hexToRgba(act.bgColor, 15) || "rgba(233,226,210,.15)");
    root.setProperty("--proj-action-opacity", (typeof act.opacity === "number" ? act.opacity : 85) / 100);
    root.setProperty("--proj-action-gap", (typeof act.gap === "number" ? act.gap : 14) + "px");
    root.setProperty("--proj-action-radius", (typeof act.radius === "number" ? act.radius : 10) + "px");

    // "صفحه بعد"/Continue's own compact fine-tuning vars - lives outside
    // the frame now, reusing the letter pages' nav-button look instead of
    // the `action` style above.
    const nextBtn = cfg.nextButton || {};
    root.setProperty("--proj-next-gap", (typeof nextBtn.gap === "number" ? nextBtn.gap : 44) + "px");
    root.setProperty("--proj-next-x", (typeof nextBtn.offsetX === "number" ? nextBtn.offsetX : 0) + "px");
    root.setProperty("--proj-next-y", (typeof nextBtn.offsetY === "number" ? nextBtn.offsetY : 0) + "px");
    root.setProperty("--proj-next-scale", typeof nextBtn.scale === "number" ? nextBtn.scale : 1);

    // Cover/pre-play CTA - fully independent styling (Module 7/8), never
    // shares a var with the action style above.
    const cover = cfg.coverCta || {};
    root.setProperty("--proj-cover-font-size", (typeof cover.fontSize === "number" ? cover.fontSize : 15) + "px");
    root.setProperty("--proj-cover-text", cover.textColor || "#f6efe0");
    root.setProperty("--proj-cover-bg", hexToRgba(cover.bgColor, typeof cover.opacity === "number" ? cover.opacity : 45) || "rgba(20,16,10,.45)");
    const glow = typeof cover.glow === "number" ? Math.max(0, Math.min(100, cover.glow)) : 20;
    root.setProperty("--proj-cover-glow-blur", (14 + glow * 0.3).toFixed(0) + "px");
    root.setProperty("--proj-cover-glow-color", hexToRgba(cover.textColor, glow * 0.6) || "rgba(246,239,224,.14)");
    root.setProperty("--proj-cover-blur", (typeof cover.blur === "number" ? cover.blur : 5) + "px");
    root.setProperty("--proj-cover-bg-dim", (1 - Math.max(0, Math.min(100, typeof cover.bgDim === "number" ? cover.bgDim : 0)) / 100).toFixed(2));
    root.setProperty("--proj-cover-bg-blur", (typeof cover.bgBlur === "number" ? cover.bgBlur : 0) + "px");

    // Overlay - media blur/dim behind the gate (toggled per state, see
    // setOverlayActive()) and the status MESSAGE's own text/plate color
    // (static). No longer doubles as the action buttons' color source
    // (Module 6/9) - see `action` above. --proj-overlay-tint-soft used to
    // ALSO be reused as the action-row wrapper's own card background (the
    // confirmed "card inside card" bug) - that wrapper is gone, so this
    // is the message plate's color alone now.
    const ov = cfg.overlay || {};
    const tintStrong = hexToRgba(ov.tint, typeof ov.tintOpacity === "number" ? ov.tintOpacity : 55);
    root.setProperty("--proj-overlay-tint-strong", tintStrong || "rgba(17,13,8,.42)");
    root.setProperty("--proj-overlay-text", ov.textColor || "#f6efe0");

    // Audio reminder/fallback appearance + free-form placement (Module
    // 5) - manual X/Y replaced the old 4-corner presets.
    const audio = cfg.audio || {};
    root.setProperty("--proj-audio-hint-x", (typeof audio.hintX === "number" ? audio.hintX : 88) + "%");
    root.setProperty("--proj-audio-hint-y", (typeof audio.hintY === "number" ? audio.hintY : 88) + "%");
    root.setProperty("--proj-audio-hint-icon-display", audio.hintIconEnabled === false ? "none" : "inline");
    root.setProperty("--proj-audio-hint-icon-size", (typeof audio.hintIconSize === "number" ? audio.hintIconSize : 20) + "px");
    root.setProperty("--proj-audio-hint-icon-color", audio.hintIconColor || "#f6efe0");
    root.setProperty("--proj-audio-hint-text-color", audio.hintTextColor || "#f6efe0");
    root.setProperty("--proj-audio-hint-text-size", (typeof audio.hintTextSize === "number" ? audio.hintTextSize : 13) + "px");
    root.setProperty("--proj-audio-hint-opacity", (typeof audio.hintOpacity === "number" ? Math.max(0, Math.min(100, audio.hintOpacity)) : 90) / 100);
    root.setProperty("--proj-audio-hint-glow", (typeof audio.hintGlow === "number" ? Math.max(0, Math.min(100, audio.hintGlow)) * 0.12 : 3.6).toFixed(1) + "px");
    // Keep the TEXT itself live too while the admin preview (or a real
    // reminder) happens to already be showing - every other property
    // above is a CSS var and updates for free, but textContent needs an
    // explicit poke (same pattern as the poster's own "only while
    // relevant" live update below).
    if (audioHintEl && audioHintTextEl && audioHintEl.classList.contains("show") && !audioHintEl.classList.contains("proj-audio-hint--action")) {
      audioHintTextEl.textContent = audio.hintText || "صدا روشنه";
    }
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
    youtubeFrameEl = document.getElementById("projYouTubeFrame");
    youtubeMountEl = document.getElementById("projYouTube");
    audioHintEl = document.getElementById("projAudioHint");
    audioHintTextEl = document.getElementById("projAudioHintText");

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
    // Always tear down any upload-media playback here, unconditionally -
    // not just when memories.length === 0. This must run even when the
    // active source IS YouTube (or is about to become YouTube), otherwise
    // a video that was playing under the "Uploaded" source keeps running
    // in the background the moment the admin switches source and starts
    // the YouTube video - two sources rendering/playing at once.
    clearMediaLayers();
    cfgCache = cfg || {};
    applyProjectorConfig(cfgCache);
    syncMemoriesFromConfig(cfgCache.items);
    const isYoutube = cfgCache.source === "youtube";
    frameMediaEl.classList.toggle("is-empty", !isYoutube && memories.length === 0);
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
     fix for a real bug where opening the Projector tab silently replaced
     a real visitor's routing callback. Falls back to jumping the admin's
     OWN preview to the Final tab only if nothing has ever been set (a
     pure admin-preview session, never a real visitor's in-flight
     sequence) - this is what makes "صفحه بعد" visibly do something while
     an admin is just previewing/testing the Projector tab on its own,
     instead of silently no-op'ing (confirmed real complaint: clicking
     Continue while previewing looked "broken" because nothing happened -
     it never was routing a real visitor, there was simply nothing to
     route to). A real visitor's callback always wins - this branch can
     only ever run when onDoneCallback was never set to begin with. */
  function previewEnter(cfg) {
    wireOnce();
    if (!onDoneCallback) {
      onDoneCallback = () => { if (window.NUR_APP) window.NUR_APP.previewStage("stage-final"); };
    }
    resetToEntry(cfg);
  }

  /* Live-preview only (admin panel sliders/color pickers/text fields) -
     appearance + every text surface update instantly; never touches
     playback state or the gate's current visibility, so it is safe to
     call on every keystroke without interrupting anything (Module 23). */
  function applyLive(cfg) {
    cfg = cfg || {};
    // Media Source (Uploaded <-> YouTube) toggled while a memory or the
    // YouTube video was already playing - a plain appearance/text update
    // is NOT safe here: whichever source was active needs to be fully
    // stopped and torn down before the new one can start, or both end up
    // rendering/playing at once (the exact bug reported: switching source
    // left the old upload video running underneath the new YouTube
    // iframe). A full resetToEntry() is the same safe teardown+re-entry
    // every other real entry point already uses - it never touches
    // onDoneCallback, so it's safe to call from a live-preview edit.
    if (started && cfgCache && cfgCache.source !== cfg.source) {
      resetToEntry(cfg);
      return;
    }
    cfgCache = cfg;
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
    previewAudioHint,
    hideAudioHint,
    _bgEnabled: false
  };
})();
