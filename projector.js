/* ============================================================================
   NUR — Projector / Memory stage.
   ----------------------------------------------------------------------------
   Playback engine ported from memory-page-prototype.html (the standalone
   prototype), trimmed for production integration:
   - Reads its appearance settings from config.js's config.projector section
     (the SAME config object/admin panel every other stage uses - no second
     config system).
   - Never touches the DOM or fetches any media until start() is actually
     called - app.js only calls that when config.projector.enabled is true,
     so a visitor with the feature off never loads a single byte of this
     stage's media. preload() (see bottom) is the one deliberate exception -
     app.js calls it near the end of the countdown, and even then it only
     warms the FIRST item, never the whole list.
   - Memory items are persistent: they live in config.projector.items
     (each { id, type, url, caption, pace, trimStart, trimEnd }), uploaded
     via admin-panel.js's media-manager field and saved through the normal
     config Save flow, so every visitor and every future admin session
     sees the same memories - never session-local blob URLs.

   State machine: preplay -> loading -> playing -> (stalled <-> playing/
   loading) -> ended-hold -> ended (Replay/Continue, waits indefinitely by
   default) -> done. Every path that can go wrong (missing media, network
   error, decode error, stall, timeout, explicit skip) funnels into the
   SAME "stalled" gate with Retry/Skip - there is exactly one way out of
   trouble, not a different dead end for each failure mode. A memory
   finishing normally does NOT jump straight to done: it holds briefly,
   then reveals a calm Replay/Continue gate and waits for the viewer to
   decide (Auto Continue, off by default, skips straight to done instead
   after the same hold). "done" always calls the same onDone callback
   app.js already wires to stage-final, so Final is reachable from every
   single one of those paths.
   ============================================================================ */
(() => {
  "use strict";

  const PACE_MS = { quick: 900, normal: 2000, hold: 4000 };
  const LOADING_TIMEOUT_MS = 6000;  // no progress on the very first load -> reveal retry/skip
  const STALL_TIMEOUT_MS = 9000;    // no timeupdate progress mid-playback -> reveal retry/skip

  const PROJECTOR_PRESETS = {
    soft:     { vignette: 0.5, blurPx: 0.15 },
    balanced: { vignette: 1.0, blurPx: 0.35 },
    deep:     { vignette: 1.5, blurPx: 0.55 }
  };

  let started = false;
  let memories = [];
  let currentId = null;
  let currentEl = null;
  let nextLayer = 0;
  let advanceTimer = null;
  let showRequestSeq = 0;
  let onDoneCallback = null;
  let cfgCache = null;

  let layers, frameMediaEl, captionEl, titleEl, ambientGlowEl;
  let gateEl, gateTextEl, playBtn, gateActionsEl, retryBtn, skipBtn, endedActionsEl, replayBtn, continueBtn;

  let loadingTimeoutId = null;
  let stallTimeoutId = null;
  let preloadEl = null;   // the hidden warm-up <video> from preload(), reused for real item-0 playback if it matches
  let preloadUrl = null;

  function makeItem(id, type, src, caption, pace, trimStart, trimEnd) {
    return { id, type, src, caption: caption || "", pace: pace || "normal", trimStart: trimStart || 0, trimEnd: trimEnd || null };
  }

  /* Rebuilds the playable list from the persisted config every time
     start()/applyLive() runs, so both a real visitor and the admin's
     live-preview always reflect whatever was last saved - never a stale
     in-memory list. Never auto-plays anything by itself - see resetGate(). */
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
   *  The gate - one overlay, one function per state. Every state clears
   *  whatever the previous one showed instead of layering flags, so there
   *  is never a stuck "loading text + play button both visible" glitch.
   *  ---------------------------------------------------------------------*/
  function clearTimers() {
    clearTimeout(loadingTimeoutId);
    clearTimeout(stallTimeoutId);
    clearTimeout(advanceTimer);
    loadingTimeoutId = null;
    stallTimeoutId = null;
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
    gateEl.classList.add("show");
    playBtn.classList.add("show");
    ambientGlowEl.classList.add("show");
    titleEl.classList.add("show");
  }

  function showLoadingGate(withEscape) {
    hideGate();
    gateEl.classList.add("show");
    gateTextEl.textContent = "دارم خاطره رو آماده می‌کنم...";
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
    gateEl.classList.add("show");
    gateTextEl.textContent = "انگار این خاطره کمی دیرتر می‌رسه...";
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
     it is the sole way out once Auto Continue is off. */
  function showEndedGate() {
    hideGate();
    gateEl.classList.add("show");
    endedActionsEl.classList.add("show");
    if (memories.length > 0 && cfgCache.showReplay !== false) replayBtn.classList.add("show");
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
     Continue now defaults OFF: a streamer needs room to react to a
     memory, not a silent jump to the next scene). */
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

  function callFinish() {
    clearTimers();
    if (onDoneCallback) onDoneCallback();
  }

  function beginPlayback() {
    hideGate();
    titleEl.classList.remove("show");
    if (memories.length === 0) { setFrameEmpty(true); showEndedGate(); return; }
    showLoadingGate(false);
    loadItem(0);
  }

  function retryCurrent() {
    const idx = currentIndex();
    loadItem(idx === -1 ? 0 : idx);
  }

  /* Replay restarts the WHOLE sequence from the first memory (Module 4:
     "restart from the beginning"), not just whichever item happened to
     be last - in the common case (one clip) these are the same thing.
     Reuses the exact, already-buffered <video> element in place instead
     of tearing it down and recreating it whenever that element is still
     the one showing - no redundant re-fetch of something already
     sitting in memory. Falls back to a normal (fresh) loadItem(0) only
     if that element is somehow gone or was a different item/type. */
  function replayFromStart() {
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
   *  Config application - reads config.projector (the real config object,
   *  same one every other stage uses) and drives the same CSS vars the
   *  prototype's applyMemoryConfig did, just for a much smaller control
   *  set (Preset/Media Size/Edge Fade/Center - see admin-panel.js's
   *  "projector" tab), plus the title text block.
   *  ---------------------------------------------------------------------*/
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
    if (playBtn) playBtn.textContent = cfg.playButtonText || "بذار ببینمش";
  }

  /* -------------------------------------------------------------------- *
   *  Public API - app.js calls start() only when config.projector.enabled
   *  is true, and only once the countdown finishes (never eagerly, never
   *  when the feature is off) - that single call site is what guarantees
   *  no media for this stage ever loads unless it is actually needed.
   *  Each call resets fully to the pre-play gate - it never resumes
   *  mid-sequence, so re-entering (or the admin's live-preview) always
   *  starts from the same deliberate beginning.
   *  ---------------------------------------------------------------------*/
  function start(cfg, onDone) {
    onDoneCallback = onDone;
    cfgCache = cfg || {};
    if (!started) {
      started = true;
      layers = Array.from(document.querySelectorAll("#stage-projector .media-layer"));
      frameMediaEl = document.querySelector("#stage-projector .frame-media");
      captionEl = document.getElementById("projCaption");
      titleEl = document.getElementById("projTitle");
      ambientGlowEl = document.querySelector("#stage-projector .proj-ambient-glow");
      gateEl = document.getElementById("projGate");
      gateTextEl = document.getElementById("projGateText");
      playBtn = document.getElementById("projPlayBtn");
      gateActionsEl = document.getElementById("projGateActions");
      retryBtn = document.getElementById("projRetryBtn");
      skipBtn = document.getElementById("projSkipBtn");
      endedActionsEl = document.getElementById("projEndedActions");
      replayBtn = document.getElementById("projReplayBtn");
      continueBtn = document.getElementById("projContinueBtn");

      const overlay = document.getElementById("projFrameOverlay");
      if (overlay) {
        overlay.addEventListener("load", () => overlay.classList.add("ready"), { once: true });
        overlay.src = "assets/memory-frame.png";
      }

      playBtn.addEventListener("click", beginPlayback);
      retryBtn.addEventListener("click", retryCurrent);
      skipBtn.addEventListener("click", callFinish);
      replayBtn.addEventListener("click", replayFromStart);
      continueBtn.addEventListener("click", callFinish);
    }
    clearTimers();
    applyProjectorConfig(cfgCache);
    syncMemoriesFromConfig(cfgCache.items);
    setFrameEmpty(memories.length === 0);
    // Nothing uploaded yet (Projector turned on before any memory was
    // added) - skip the "بذار ببینمش" prompt entirely rather than
    // inviting a tap that leads nowhere; go straight to the one control
    // that's actually meaningful here (see Module 5: Final must always
    // stay reachable, including when media is simply missing).
    if (memories.length === 0) {
      showEndedGate();
    } else {
      showPreplayGate();
    }
  }

  /* Live-preview only (admin panel sliders/color pickers) - appearance +
     title text update instantly; never touches playback state, so it is
     safe to call on every keystroke without interrupting anything. */
  function applyLive(cfg) {
    cfgCache = cfg || {};
    applyProjectorConfig(cfgCache);
    syncMemoriesFromConfig(cfgCache.items);
  }

  /* Called by app.js near the end of the countdown (only when Projector
     is enabled) - the ONE deliberate exception to "never load media until
     start()". Warms exactly the first item, nothing more: a hidden
     <video preload="auto"> (browsers fetch enough to start smoothly, not
     the whole file) or a plain Image() prefetch for a photo. If start()
     later plays that same first item, loadItem() reuses this exact
     element instead of creating a second one, so there is never a
     duplicate request. */
  function preload(cfg) {
    if (!cfg || !cfg.enabled || preloadEl) return;
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

  window.NUR_PROJECTOR = {
    start,
    applyLive,
    preload,
    _bgEnabled: false
  };
})();
