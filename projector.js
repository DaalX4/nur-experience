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
     stage's media.
   - Memory items themselves stay session-local for this pass (drag/drop a
     memory-prep-tool.html export, or plain files, onto the frame) - the
     same explicit scope boundary the prototype had; per-streamer persistent
     upload is a separate, later piece of work.
   ============================================================================ */
(() => {
  "use strict";

  const PACE_MS = { quick: 900, normal: 2000, hold: 4000 };

  const PROJECTOR_PRESETS = {
    soft:     { vignette: 0.5, blurPx: 0.15 },
    balanced: { vignette: 1.0, blurPx: 0.35 },
    deep:     { vignette: 1.5, blurPx: 0.55 }
  };

  let started = false;
  let memories = [];
  let nextItemId = 1;
  let currentId = null;
  let currentEl = null;
  let nextLayer = 0;
  let advanceTimer = null;
  let showRequestSeq = 0;
  let onDoneCallback = null;

  let layers, frameMediaEl, captionEl, dropzoneEl;

  function makeItem(type, src, caption, pace, extra) {
    return Object.assign(
      { id: nextItemId++, type, src, caption: caption || "", pace: pace || "normal", trimStart: 0, trimEnd: null },
      extra || {}
    );
  }

  function currentIndex() {
    return memories.findIndex((m) => m.id === currentId);
  }

  function preload(item) {
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

  function show(index) {
    if (memories.length === 0) { setFrameEmpty(true); return; }
    setFrameEmpty(false);
    const item = memories[index];
    currentId = item.id;
    const layer = layers[nextLayer];
    const other = layers[1 - nextLayer];
    const requestToken = ++showRequestSeq;

    layer.innerHTML = "";
    clearTimeout(advanceTimer);

    function reveal(el) {
      if (requestToken !== showRequestSeq) return;
      layer.classList.add("active");
      other.classList.remove("active");
      currentEl = el;

      captionEl.classList.remove("show");
      captionEl.textContent = item.caption || "";
      void captionEl.offsetWidth;
      captionEl.classList.add("show");

      if (item.type === "video") {
        el.addEventListener("ended", advance);
        if (item.trimEnd) {
          el.addEventListener("timeupdate", () => {
            if (el.currentTime >= item.trimEnd) advance();
          });
        }
      } else {
        advanceTimer = setTimeout(advance, PACE_MS[item.pace] || PACE_MS.normal);
      }
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
      el = document.createElement("video");
      el.muted = true;
      el.playsInline = true;
      el.preload = "auto";
      el.src = item.src;
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
        el.play().catch(() => {});
        syncBgStart();
        reveal(el);
      });
      el.addEventListener("error", () => reveal(el));
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
      if (el.decode) {
        el.decode().then(() => reveal(el)).catch(() => reveal(el));
      } else {
        reveal(el);
      }
    }
    nextLayer = 1 - nextLayer;
    preload(memories[(index + 1) % memories.length]);
  }

  function advance() {
    if (memories.length === 0) { setFrameEmpty(true); return; }
    const idx = currentIndex();
    const nextIdx = idx === -1 ? 0 : (idx + 1) % memories.length;
    show(nextIdx);
  }

  /* -------------------------------------------------------------------- *
   *  Session-local ingestion - drag/drop a memory-prep-tool.html export
   *  (manifest.json + files) or plain image/video files onto the frame.
   *  Admin-only in practice (a visitor never drags a file onto this page),
   *  not gated behind any login since there is nothing sensitive here -
   *  same scope/security posture as the prototype this was ported from.
   *  ---------------------------------------------------------------------*/
  function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("خواندن فایل ناموفق بود"));
      reader.readAsDataURL(file);
    });
  }

  function onMemoriesChanged() {
    if (memories.length === 0) {
      currentId = null;
      clearTimeout(advanceTimer);
      setFrameEmpty(true);
      return;
    }
    if (currentIndex() === -1) show(0);
  }

  async function ingestFiles(fileList) {
    const files = Array.from(fileList);
    const manifestFile = files.find((f) => /\.json$/i.test(f.name));
    const byName = new Map(
      files.filter((f) => f.type.startsWith("video/") || f.type.startsWith("image/")).map((f) => [f.name, f])
    );

    if (manifestFile) {
      try {
        const manifest = JSON.parse(await manifestFile.text());
        if (manifest && Array.isArray(manifest.items)) {
          for (const entry of manifest.items) {
            const file = byName.get(entry.file);
            if (!file) continue;
            try {
              const src = await readAsDataURL(file);
              memories.push(makeItem(entry.type === "video" ? "video" : "image", src, entry.caption, entry.pace, {
                trimStart: entry.trimStart || 0,
                trimEnd: entry.trimEnd || null
              }));
              onMemoriesChanged();
            } catch (err) { /* unreadable file - skip it, rest of the manifest still proceeds */ }
            byName.delete(entry.file);
            if (entry.poster) byName.delete(entry.poster);
          }
          return;
        }
      } catch (err) {
        /* invalid/unreadable manifest.json - fall through to plain ingestion */
      }
    }

    for (const file of byName.values()) {
      try {
        const src = await readAsDataURL(file);
        memories.push(makeItem(file.type.startsWith("video/") ? "video" : "image", src, "", "normal"));
        onMemoriesChanged();
      } catch (err) { /* unreadable file - skip it, rest of the batch still proceeds */ }
    }
  }

  function wireDropzone() {
    ["dragenter", "dragover"].forEach((evt) => {
      dropzoneEl.addEventListener(evt, (e) => { e.preventDefault(); dropzoneEl.classList.add("dragover"); });
    });
    ["dragleave", "drop"].forEach((evt) => {
      dropzoneEl.addEventListener(evt, (e) => { e.preventDefault(); dropzoneEl.classList.remove("dragover"); });
    });
    dropzoneEl.addEventListener("drop", (e) => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) ingestFiles(e.dataTransfer.files);
    });
  }

  /* -------------------------------------------------------------------- *
   *  Config application - reads config.projector (the real config object,
   *  same one every other stage uses) and drives the same CSS vars the
   *  prototype's applyMemoryConfig did, just for a much smaller control
   *  set (Preset/Media Size/Edge Fade/Center/Background Fill - see
   *  admin-panel.js's "projector" tab).
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
  }

  /* -------------------------------------------------------------------- *
   *  Public API - app.js calls start() only when config.projector.enabled
   *  is true, and only once the countdown finishes (never eagerly, never
   *  when the feature is off) - that single call site is what guarantees
   *  no media for this stage ever loads unless it is actually needed.
   *  ---------------------------------------------------------------------*/
  function start(cfg, onDone) {
    onDoneCallback = onDone;
    if (!started) {
      started = true;
      layers = Array.from(document.querySelectorAll("#stage-projector .media-layer"));
      frameMediaEl = document.querySelector("#stage-projector .frame-media");
      captionEl = document.getElementById("projCaption");
      dropzoneEl = document.getElementById("projDropzone");
      wireDropzone();

      const overlay = document.getElementById("projFrameOverlay");
      if (overlay) {
        overlay.addEventListener("load", () => overlay.classList.add("ready"), { once: true });
        overlay.src = "assets/memory-frame.png";
      }

      document.getElementById("projContinue").addEventListener("click", finish);
    }
    applyProjectorConfig(cfg || {});
    setFrameEmpty(memories.length === 0);
    if (memories.length) show(currentIndex() === -1 ? 0 : currentIndex());
  }

  function finish() {
    clearTimeout(advanceTimer);
    if (onDoneCallback) onDoneCallback();
  }

  window.NUR_PROJECTOR = {
    start,
    applyLive: applyProjectorConfig,
    _bgEnabled: false
  };
})();
