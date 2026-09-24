(() => {
  "use strict";

  /* ------------------------------------------------------------------ *
   *  Config-driven rendering. Every piece of copy and every position
   *  this app shows lives in config.js's config object (window.NUR_CONFIG_API),
   *  editable live via admin-panel.js (Ctrl+Shift+E). This file's job is
   *  just to APPLY that object to the DOM/CSS, plus run the actual
   *  interaction logic (stage transitions, letter flip, countdown) which
   *  the panel never touches.
   * ------------------------------------------------------------------ */
  const configApi = window.NUR_CONFIG_API;
  let currentConfig = configApi.loadConfig();
  // Set once the admin commits a local edit (Save/Reset/Import - see
  // window.NUR_APP.applyConfig below) - guards the one-time boot fetch
  // below against clobbering that edit if it resolves late.
  let localConfigCommitted = false;

  /* Each letter page's own nav button has a different id (they do
     different things - advance vs. start the countdown) but the same
     config.letterPageN.button shape - this is the one place that maps
     page number to the actual button element. */
  const LETTER_BUTTON_IDS = { 1: "toPage2", 2: "toPage3", 3: "toCountdown" };

  /* ------------------------------------------------------------------ *
   *  Global config — the public URL is always the same (daalvi.com/nur),
   *  so every visitor fetches the SAME config from one tiny public Wix
   *  Velo HTTP function (see DEPLOY.md) rather than anything read from
   *  the path/query. Until that endpoint is set up (or if the fetch ever
   *  fails/times out), the local cache/DEFAULT_CONFIG - the same object
   *  the admin panel edits - is the fallback, so there's always exactly
   *  one value in play, never a broken or half-loaded page.
   *
   *  A ?u= override is kept ONLY as a local-testing convenience for the
   *  streamer name (it skips the network call entirely) - it is never
   *  meant to be given out as a real link.
   * ------------------------------------------------------------------ */
  // True when the config we ended up with is the ORIGINAL streamer's (used as
  // the safe fallback for a slug page whose own config could not be loaded) -
  // it is shown, but never written into that slug's local cache.
  let remoteIsFallback = false;
  async function fetchRemoteConfig() {
    remoteIsFallback = false;
    if (configApi.SLUG) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(configApi.REMOTE_STREAMER_URL + "?slug=" + encodeURIComponent(configApi.SLUG), { signal: controller.signal, cache: "no-store" });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          if (data && data.found && data.config && typeof data.config === "object") return data.config;
        }
      } catch (err) { /* fall through to the original single-streamer config */ }
      remoteIsFallback = true;
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(configApi.REMOTE_CONFIG_URL, { signal: controller.signal, cache: "no-store" });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error("nurConfig endpoint returned " + res.status);
      const data = await res.json();
      return data && data.config && typeof data.config === "object" ? data.config : null;
    } catch (err) {
      return null;
    }
  }

  function setHandle(el, name) {
    let bdi = el.classList.contains("handle") ? el : el.querySelector(".handle");
    if (!bdi) {
      bdi = document.createElement("bdi");
      bdi.className = "handle";
      el.appendChild(bdi);
    }
    bdi.textContent = name;
  }

  /* Renders a "...{name}..." template into `el` as text/bdi/text, so the
     Latin name keeps its own bidi-isolated run wherever it sits in the
     sentence (start, middle, or end). */
  function renderNameTemplate(el, template, name) {
    el.textContent = "";
    const parts = String(template || "").split("{name}");
    el.append(parts[0] || "");
    if (parts.length > 1) {
      const bdi = document.createElement("bdi");
      bdi.className = "handle";
      bdi.textContent = name;
      el.appendChild(bdi);
      el.append(parts.slice(1).join("{name}"));
    }
  }

  /* Splits free text on EVERY manual line break into its own paragraph
     (a blank line just means "no paragraph here", it's not rendered as
     an empty one) - so a line break the admin typed is preserved exactly,
     one-to-one, and the "gap" control has a real, visible margin to
     apply between every one of them, whether it was a single or double
     newline in the source. Nothing here re-flows or merges the admin's
     own line breaks. */
  /* Every line becomes its own <p>, blank lines included - a blank line
     gets a non-breaking space so it still has real height instead of
     collapsing to nothing, so its own paragraph-gap margin still applies
     and a double Enter reads as a visibly bigger break than a single one,
     with no special-casing needed. Multiple spaces within a line survive
     because the paragraph CSS uses white-space:pre-wrap - this function
     never trims/collapses whitespace itself. */
  function renderParagraphs(container, text) {
    container.textContent = "";
    String(text || "")
      .split(/\n/)
      .forEach((para) => {
        const p = document.createElement("p");
        if (para.trim() === "") {
          p.textContent = " ";
          p.setAttribute("aria-hidden", "true");
        } else {
          p.textContent = para;
        }
        container.appendChild(p);
      });
  }

  let effectiveStreamerName = null;

  function renderStreamerName(config) {
    const name = (effectiveStreamerName || config.streamerName || "").replace(/^@/, "");
    setHandle(document.getElementById("introHandle"), name);
    renderNameTemplate(document.getElementById("envelopeGreeting"), config.envelope.greeting, name);

    const nameOverlay = document.getElementById("letterNameOverlay");
    nameOverlay.textContent = "";
    const bdi = document.createElement("bdi");
    bdi.className = "handle";
    bdi.textContent = name;
    nameOverlay.appendChild(bdi);
    nameOverlay.append(" عزیز");
  }

  /* Applies EVERY config value to the page: text content, CSS custom
     properties for position/size. Called once at boot and again, live,
     on every admin-panel edit - see NUR_APP.applyConfig below. */
  function applyConfig(config) {
    const root = document.documentElement.style;

    root.setProperty("--nur-intro-x", config.intro.offsetX + "px");
    root.setProperty("--nur-intro-y", config.intro.offsetY + "px");
    root.setProperty("--nur-intro-font-size", config.intro.fontSize + "px");
    root.setProperty("--nur-intro-line-height", config.intro.lineHeight);
    root.setProperty("--nur-intro-gap", config.intro.gap + "px");
    root.setProperty("--nur-intro-greeting-font-size", config.intro.greetingFontSize + "px");
    root.setProperty("--nur-intro-greeting-gap", config.intro.greetingGap + "px");
    root.setProperty("--nur-intro-word-spacing", config.intro.wordSpacing + "px");
    renderParagraphs(document.getElementById("introBody"), config.intro.body);

    root.setProperty("--nur-envelope-y", config.envelope.offsetY + "px");
    root.setProperty("--nur-envelope-line-gap", config.envelope.lineGap + "px");
    root.setProperty("--nur-envelope-gap-to-envelope", config.envelope.gapToEnvelope + "px");
    root.setProperty("--nur-envelope-font-size", config.envelope.fontSize + "px");
    root.setProperty("--nur-envelope-word-spacing", config.envelope.wordSpacing + "px");
    document.getElementById("envelopeInstruction").textContent = config.envelope.instruction;

    root.setProperty("--nur-letter-name-x", config.letterName.x + "%");
    root.setProperty("--nur-letter-name-y", config.letterName.y + "%");
    root.setProperty("--nur-letter-name-font-size", config.letterName.fontSize + "px");
    root.setProperty("--nur-letter-name-rotation", config.letterName.rotation + "deg");
    root.setProperty("--nur-letter-name-gap", config.letterName.gapToAziz + "px");
    root.setProperty("--nur-letter-name-word-spacing", config.letterName.wordSpacing + "px");

    [1, 2, 3].forEach((n) => {
      const section = config["letterPage" + n];
      root.setProperty(`--nur-letter${n}-x`, section.x + "%");
      root.setProperty(`--nur-letter${n}-y`, section.y + "%");
      root.setProperty(`--nur-letter${n}-width`, section.width + "%");
      root.setProperty(`--nur-letter${n}-font-size`, section.fontSize + "px");
      root.setProperty(`--nur-letter${n}-line-height`, section.lineHeight);
      root.setProperty(`--nur-letter${n}-gap`, section.paragraphGap + "px");
      root.setProperty(`--nur-letter${n}-word-spacing`, section.wordSpacing + "px");
      renderParagraphs(document.getElementById("letterBody" + n), section.body);

      /* section.paperImage is "" (use the bundled default asset) or a Wix
         Media Manager URL from an admin-panel upload. data-applied tracks
         what's currently showing so this is a no-op on every other
         applyConfig call. Before the deferred first load has happened yet
         (data-loaded unset), just update the pending target so the normal
         deferred-load mechanism picks it up; afterward (live preview of a
         fresh upload, or a remote-config value arriving after boot),
         update src directly so the change is visible immediately. */
      const imgEl = document.getElementById("notePage" + n + "Img");
      const desiredImageUrl = section.paperImage || imgEl.dataset.defaultSrc;
      if (imgEl.dataset.applied !== desiredImageUrl) {
        imgEl.dataset.applied = desiredImageUrl;
        if (imgEl.dataset.loaded === "1") {
          imgEl.src = desiredImageUrl;
        } else {
          imgEl.dataset.src = desiredImageUrl;
        }
      }

      const btn = section.button;
      root.setProperty(`--nur-btn${n}-x`, btn.x + "%");
      root.setProperty(`--nur-btn${n}-y`, btn.y + "%");
      root.setProperty(`--nur-btn${n}-width`, btn.width + "px");
      root.setProperty(`--nur-btn${n}-height`, btn.height + "px");
      root.setProperty(`--nur-btn${n}-font-size`, btn.fontSize + "px");
      root.setProperty(`--nur-btn${n}-radius`, btn.borderRadius + "px");
      root.setProperty(`--nur-btn${n}-scale`, btn.scale);
      document.getElementById(LETTER_BUTTON_IDS[n]).textContent = btn.label;

      const sig = section.signature;
      root.setProperty(`--nur-sig${n}-x`, sig.x + "%");
      root.setProperty(`--nur-sig${n}-y`, sig.y + "%");
      root.setProperty(`--nur-sig${n}-font-size`, sig.fontSize + "px");
      root.setProperty(`--nur-sig${n}-opacity`, sig.opacity);
      root.setProperty(`--nur-sig${n}-rotation`, sig.rotation + "deg");
      document.getElementById("letterSignature" + n).textContent = sig.text;

      const pageNum = section.pageNumber;
      root.setProperty(`--nur-pagenum${n}-x`, pageNum.x + "%");
      root.setProperty(`--nur-pagenum${n}-y`, pageNum.y + "%");
      root.setProperty(`--nur-pagenum${n}-font-size`, pageNum.fontSize + "px");
      document.getElementById("letterPageNum" + n).textContent = pageNum.text;
    });

    const psig = (config.projector && config.projector.signature) || {};
    root.setProperty("--proj-sig-x", (typeof psig.x === "number" ? psig.x : 78) + "%");
    root.setProperty("--proj-sig-y", (typeof psig.y === "number" ? psig.y : 90) + "%");
    root.setProperty("--proj-sig-font-size", (typeof psig.fontSize === "number" ? psig.fontSize : 12) + "px");
    root.setProperty("--proj-sig-opacity", typeof psig.opacity === "number" ? psig.opacity : 0.55);
    root.setProperty("--proj-sig-rotation", (typeof psig.rotation === "number" ? psig.rotation : 0) + "deg");
    const projSigEl = document.getElementById("projSignature");
    if (projSigEl) {
      projSigEl.textContent = psig.text || "";
      projSigEl.hidden = !(psig.enabled !== false && psig.text);
    }

    root.setProperty("--nur-final-y", config.final.offsetY + "px");
    root.setProperty("--nur-final-font-size", config.final.mainFontSize + "px");
    root.setProperty("--nur-final-main-y", (typeof config.final.mainOffsetY === "number" ? config.final.mainOffsetY : 0) + "px");
    root.setProperty("--nur-final-sub-font-size", (typeof config.final.subFontSize === "number" ? config.final.subFontSize : 22) + "px");
    root.setProperty("--nur-final-sub-y", (typeof config.final.subOffsetY === "number" ? config.final.subOffsetY : 0) + "px");
    root.setProperty("--nur-final-word-spacing", config.final.wordSpacing + "px");
    root.setProperty("--nur-final-sig-y", config.final.signatureOffsetY + "px");
    root.setProperty("--nur-final-sig-font-size", config.final.signatureFontSize + "px");
    root.setProperty("--nur-final-sig-word-spacing", config.final.signatureWordSpacing + "px");

    // Social row layout (Module 33-40) - one shared value per property,
    // never per-icon, so the four icons can only ever move together and
    // stay evenly spaced (see index.html's .final-socials `gap`).
    const f = config.final;
    root.setProperty("--nur-final-social-top-gap", (typeof f.socialsTopGap === "number" ? f.socialsTopGap : 40) + "px");
    root.setProperty("--nur-final-social-gap", (typeof f.socialGap === "number" ? f.socialGap : 30) + "px");
    root.setProperty("--nur-final-social-size", (typeof f.socialIconSize === "number" ? f.socialIconSize : 30) + "px");
    // Glow strength (0-100) drives both the icons' resting and hover
    // drop-shadow - derived here (not raw CSS calc on a color) since
    // computing an rgba() alpha from a custom property isn't reliably
    // supported across browsers yet. Formula tuned so the OLD hardcoded
    // values (7px/.35 resting, 12px/.55 hover) fall out of the new default
    // of 55, so nothing shifts until the admin moves the slider.
    const glow = typeof f.socialGlow === "number" ? Math.max(0, Math.min(100, f.socialGlow)) : 55;
    root.setProperty("--nur-final-social-glow-blur", (3 + glow * 0.0909).toFixed(1) + "px");
    root.setProperty("--nur-final-social-glow-color", "rgba(232,207,138," + Math.min(0.9, 0.12 + glow * 0.00418).toFixed(2) + ")");
    root.setProperty("--nur-final-social-glow-blur-hover", (5.5 + glow * 0.1182).toFixed(1) + "px");
    root.setProperty("--nur-final-social-glow-color-hover", "rgba(232,207,138," + Math.min(0.95, 0.2 + glow * 0.00636).toFixed(2) + ")");

    // "ادامه‌دهندگان نور" page (final phase 1): three text blocks, each with
    // text + font size + x/y offset. Sizes/offsets are unitless numbers here;
    // index.html's .cont-* rules multiply by 1px.
    const cont = (config.final && config.final.continuers) || {};
    [["top", "contTop", 32], ["title", "contTitle", 23], ["bottom", "contBottom", 17]].forEach(([key, id, defaultFs]) => {
      const c = cont[key] || {};
      const el = document.getElementById(id);
      if (el) el.textContent = typeof c.text === "string" ? c.text : "";
      root.setProperty(`--nur-cont-${key}-fs`, typeof c.fontSize === "number" ? c.fontSize : defaultFs);
      root.setProperty(`--nur-cont-${key}-x`, typeof c.x === "number" ? c.x : 0);
      root.setProperty(`--nur-cont-${key}-y`, typeof c.y === "number" ? c.y : 0);
    });
    document.getElementById("finalSignature").textContent = config.final.signature;

    // Phase 2 social row - a fixed icon per slot (the artwork), only the
    // destination URL is config-driven. No URL configured for a slot ->
    // that icon stays hidden rather than linking nowhere (never a dead
    // link on a page this personal).
    const socialElIds = { kick: "finalSocialKick", instagram: "finalSocialInstagram", youtube: "finalSocialYoutube", telegram: "finalSocialTelegram" };
    (config.final.socials || []).forEach((s) => {
      const el = document.getElementById(socialElIds[s.icon]);
      if (!el) return;
      if (s.url) {
        el.href = s.url;
        el.hidden = false;
      } else {
        el.hidden = true;
      }
    });

    applySkyColors(config.sky);
    renderStreamerName(config);

    // Safe to call any time, even before the projector stage has ever
    // been shown - it only ever sets CSS custom properties, never
    // touches memories/media. This is what makes the admin panel's
    // Preset/Media Size/Edge Fade sliders live-preview correctly.
    if (config.projector && window.NUR_PROJECTOR) {
      window.NUR_PROJECTOR.applyLive(config.projector);
    }
  }

  /* Drives styles.css's existing --bg-1/--bg-2/--star custom properties
     (previously fixed values) from one admin-picked sky color - --bg-2 is
     derived automatically (a touch deeper/darker) so the existing two-
     stop gradient depth is preserved without a second picker. Shared by
     every stage in this document, the projector stage included, since
     they all sit in the same body. */
  function hexToRgb(hex) {
    const v = String(hex || "").replace("#", "");
    const full = v.length === 3 ? v.split("").map((c) => c + c).join("") : v;
    const n = parseInt(full, 16);
    if (Number.isNaN(n) || full.length !== 6) return [10, 18, 38]; // falls back to the original --bg-1
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(r, g, b) {
    return "#" + [r, g, b].map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")).join("");
  }
  function applySkyColors(sky) {
    if (!sky) return;
    const root = document.documentElement.style;
    const [r, g, b] = hexToRgb(sky.color);
    root.setProperty("--bg-1", sky.color);
    // A lighter, slightly more blue-shifted second stop - the exact same
    // fixed per-channel delta that the original hardcoded pair already
    // had (#0a1226 -> #16224a is +12/+16/+36 per channel), so any picked
    // color keeps that same gradient depth automatically.
    root.setProperty("--bg-2", rgbToHex(r + 12, g + 16, b + 36));
    root.setProperty("--star", sky.starColor || "#fdf6e3");
  }

  /* The envelope + all 3 letter-page images belong to LATER stages - the
     intro screen (the only thing a visitor sees at first) uses none of
     them. Left as plain eager <img src>, all ~1MB+ of them would compete
     on the wire with the CSS/JS/font the intro actually needs for first
     paint, which matters a lot on slow/high-latency mobile connections.
     Their real URL is deferred to data-src and swapped in here, kicked
     off right after the first paint via requestIdleCallback (not on
     click) - the intro takes several seconds to read, so by the time a
     visitor actually reaches the envelope or letter pages these have
     normally finished downloading in the background already, with no
     visible delay at the actual transition.
     Scheduled from inside boot(), AFTER the first applyConfig() call
     (below) - applyConfig is what actually sets each note-page image's
     data-src (default asset or an admin-uploaded override); scheduling
     this beforehand let it run before that ever happened, so it found
     nothing to preload and those images silently never loaded at all. */
  function preloadStageImages() {
    document.querySelectorAll("img[data-src]").forEach((img) => {
      img.src = img.dataset.src;
      img.dataset.loaded = "1";
    });
    // The continuers page's avatar is an SVG <image> inside a hidden stage,
    // which the browser may not fetch until it is first shown - warm the
    // cache now so it never pops in late.
    new Image().src = "assets/avatar-rezaayeene.webp";
  }

  /* Boot render — waits (briefly, bounded) for the remote config before
     the FIRST paint of any text. Root cause this closes: a brand-new
     visitor's browser has an empty localStorage, so calling applyConfig
     with the local cache/DEFAULT_CONFIG immediately would show the
     placeholder name ("ArioPlay") and placeholder copy first, then swap
     to the real streamer's config a moment later once the fetch resolves
     - visible as a large name/word flashing in and being replaced,
     exactly like the old countdown "1" flash (a default state rendering
     before the real one is ready). Racing the fetch against a short cap
     means a normal connection resolves well inside the cap (no flash,
     ever, for the common case) while a slow/broken one still falls back
     to the instant local render exactly as before - never a loading
     screen, just a very short, one-time wait before text appears. */
  const nameOverride = new URLSearchParams(location.search).get("u");
  let remoteApplied = false;
  function acceptRemoteConfig(remoteConfig) {
    if (!remoteConfig || localConfigCommitted) return false;
    const merged = configApi.mergeWithDefaults(remoteConfig);
    if (!remoteIsFallback) configApi.saveConfig(merged); // refresh the local cache so the next load starts from this
    currentConfig = merged;
    return true;
  }

  /* ------------------------------------------------------------------ *
   *  Shared Continuers chain. ONE global list (not part of any streamer's
   *  config), drawn by continuers-chain.js into #contChain. Cached locally for
   *  instant render; the server copy is fetched once in the background.
   *  Anything unexpected -> the built-in default chain (what NUR always showed).
   * ------------------------------------------------------------------ */
  const contSvg = document.getElementById("contChain");
  const CONT_CLS = { breathe: "cont-breathe", flicker: "cont-flicker", spin: "cont-spin", q: "cont-q", ping: "cont-ping", pulse: "cont-pulse", user: "cont-user", init: "cont-init" };
  let continuersList = null;
  let continuersCommitted = false;       // an admin edit in this tab wins over a late server answer
  let chainNarrow = window.innerWidth < 600;
  function validContinuers(a) {
    if (!Array.isArray(a)) return null;
    const out = [];
    a.slice(0, 10).forEach((x, i) => {
      if (x && typeof x.name === "string" && x.name.trim()) {
        out.push({ id: String(x.id || "c" + i), name: x.name.trim().slice(0, 40), kick: typeof x.kick === "string" ? x.kick : "", avatar: typeof x.avatar === "string" ? x.avatar : "" });
      }
    });
    return out;
  }
  function defaultContinuers() { return configApi.DEFAULT_CONTINUERS.map((x) => Object.assign({}, x)); }
  function loadContinuersCache() {
    try { return validContinuers(JSON.parse(localStorage.getItem(configApi.CONTINUERS_CACHE_KEY) || "null")); } catch (err) { return null; }
  }
  function saveContinuersCache(list) {
    try { localStorage.setItem(configApi.CONTINUERS_CACHE_KEY, JSON.stringify(list)); } catch (err) { /* ignore */ }
  }
  function renderChain(list) {
    continuersList = list;
    if (!contSvg || !window.NUR_CHAIN) return;
    try {
      const res = window.NUR_CHAIN.build(list, { cls: CONT_CLS, idp: "cont-", narrow: chainNarrow });
      contSvg.setAttribute("viewBox", res.viewBox);
      contSvg.style.setProperty("--ar", res.ar.toFixed(4));
      contSvg.innerHTML = res.markup;
    } catch (err) { /* keep whatever is drawn */ }
  }
  async function fetchContinuers() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(configApi.REMOTE_CONTINUERS_URL, { signal: controller.signal, cache: "no-store" });
      clearTimeout(timeoutId);
      if (!res.ok) return undefined;
      const data = await res.json();
      if (data && data.items === null) return null;          // nothing saved yet -> default
      return validContinuers(data && data.items) || undefined;
    } catch (err) {
      return undefined;                                       // unreachable -> keep what we have
    }
  }
  function initContinuers() {
    renderChain(loadContinuersCache() || defaultContinuers());
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => renderChain(continuersList));
    window.addEventListener("resize", () => {
      const nw = window.innerWidth < 600;
      if (nw !== chainNarrow) { chainNarrow = nw; renderChain(continuersList); }
    });
    fetchContinuers().then((remote) => {
      if (remote === undefined || continuersCommitted) return;
      const next = remote === null ? defaultContinuers() : remote;
      if (JSON.stringify(next) !== JSON.stringify(continuersList)) renderChain(next);
      if (remote === null) { try { localStorage.removeItem(configApi.CONTINUERS_CACHE_KEY); } catch (err) { /* ignore */ } }
      else saveContinuersCache(remote);
    });
  }

  (async function boot() {
    if (nameOverride) {
      // Local-testing convenience only - skips the network fetch entirely.
      effectiveStreamerName = nameOverride.replace(/^@/, "");
    } else {
      const fetchPromise = fetchRemoteConfig();
      // A first-ever visit has no local cache, so rendering early would show
      // the placeholder streamer name/copy (DEFAULT_CONFIG) before the real
      // config lands - wait for the fetch itself (already capped at 4s by
      // fetchRemoteConfig). A returning visitor's cache is already close to
      // right, so they keep the short 500ms cap.
      let hasLocalCache = false;
      try { hasLocalCache = !!localStorage.getItem(configApi.STORAGE_KEY); } catch (err) { /* ignore */ }
      const early = await Promise.race([
        fetchPromise,
        new Promise((resolve) => setTimeout(() => resolve(undefined), hasLocalCache ? 500 : 4500)),
      ]);
      if (early !== undefined && acceptRemoteConfig(early)) {
        remoteApplied = true;
      }
      // If the cap won the race, keep listening - the fetch is still in
      // flight and, if it lands late, must still correct the page (same
      // fallback guarantee as before this change).
      fetchPromise.then((remoteConfig) => {
        if (remoteApplied) return;
        // If the admin has committed a local edit (Save/Reset/Import) while
        // this boot-time fetch was still in flight, that edit must win - this
        // fetch reflects server state from BEFORE that edit, so applying it
        // now would silently revert what was just saved. Confirmed as a real
        // bug: uploading a paper image (read+encode+upload takes a few real
        // seconds) gives this fetch plenty of time to still be pending when
        // Save is clicked, and it was unconditionally overwriting currentConfig
        // when it resolved afterward.
        if (acceptRemoteConfig(remoteConfig)) applyConfig(currentConfig);
      });
    }
    applyConfig(currentConfig);
    initContinuers();
    (function releaseBootVeil() {
      const root = document.documentElement;
      if (!root.classList.contains("nur-boot")) return;
      root.classList.add("nur-boot-out");
      root.classList.remove("nur-boot");
      setTimeout(() => root.classList.remove("nur-boot-out"), 700);
    })();

    // Reveal the intro ONLY now, with real content already in place.
    // #stage-intro deliberately ships with no "active" class in the raw
    // HTML (unlike every other stage would, if they had one) - .stage's
    // entrance animation (sceneIn) is pure CSS and starts the instant the
    // class is present, with or without JS/config having run yet. Baking
    // "active" into the markup (as it used to be) meant the greeting's
    // static "درود" text - and, before that, the empty name/body divs -
    // was already fading in on its own the moment the browser painted,
    // finishing its animation before or independently of applyConfig()
    // ever populating the name/body text above. Whatever text existed at
    // that moment (a bare "درود", or the old localStorage/default config)
    // is what a visitor briefly saw. Adding "active" here instead, after
    // this same await, means the fade-in and the real content always
    // start together - never one before the other.
    document.getElementById("stage-intro").classList.add("active");

    if ("requestIdleCallback" in window) {
      requestIdleCallback(preloadStageImages, { timeout: 2000 });
    } else {
      setTimeout(preloadStageImages, 300);
    }
  })();

  /* Public hooks admin-panel.js uses - the panel never touches the DOM
     directly, only this config object.
     - previewConfig: visual only, does NOT commit. Used on every
       keystroke/slider-drag for live preview, and to revert the page
       back to the last real config if the panel is closed unsaved.
     - applyConfig: commits AND renders. Used by Save/Reset/Import,
       which are the only actions meant to change what "current config"
       actually is. Keeping these separate is what lets "close without
       saving" discard a live-previewed edit instead of accidentally
       keeping it. */
  window.NUR_APP = {
    getConfig: () => currentConfig,
    previewConfig: (config) => {
      applyConfig(config);
    },
    applyConfig: (config) => {
      currentConfig = config;
      localConfigCommitted = true;
      applyConfig(config);
    },
    LETTER_BUTTON_IDS,
    previewStage: (stageId, letterPage) => previewStage(stageId, letterPage),
    getContinuers: () => continuersList,
    previewContinuers: (list) => renderChain(list),
    commitContinuers: (list) => { continuersCommitted = true; saveContinuersCache(list); renderChain(list); }
  };

  /* ------------------------------------------------------------------ *
   *  The letter — three baked pages (assets/note-page1/2/3.png), each
   *  with its own text and artwork drawn directly into the image, so
   *  there is no DOM text to set for any of them. Page 1 is the only
   *  one with a live overlay on top (the dynamic streamer name). NOTE:
   *  that name overlay is the only dynamic personalization touching
   *  the letter itself — pages 1-3's own baked text is fixed, same for
   *  every recipient.
   * ------------------------------------------------------------------ */

  /* ------------------------------------------------------------------ *
   *  Night sky — a handful of soft, staggered, twinkling stars
   * ------------------------------------------------------------------ */
  function buildStars(count) {
    const layer = document.getElementById("stars");
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const star = document.createElement("span");
      star.className = "star";
      const size = 1 + Math.random() * 2.2;
      star.style.left = Math.random() * 100 + "%";
      star.style.top = Math.random() * 100 + "%";
      star.style.width = size + "px";
      star.style.height = size + "px";
      star.style.setProperty("--dur", 5 + Math.random() * 5 + "s");
      star.style.setProperty("--delay", Math.random() * 6 + "s");
      frag.appendChild(star);
    }
    layer.appendChild(frag);
  }
  buildStars(20);

  /* ------------------------------------------------------------------ *
   *  Scene switching — soft blur/fade crossfade, one scene at a time
   * ------------------------------------------------------------------ */
  /* Final-stage sequence timers (continuers page -> fade -> Credit; see
     revealSignature). Tracked here so a restart or leaving the stage can
     always cancel a pending one - untracked timers from an earlier entry
     used to fire later, fading a fresh visit early (or overlapping the
     Credit phase). */
  const finalSeq = { fade: null, show: null };
  function cancelFinalSequence() {
    clearTimeout(finalSeq.fade);
    clearTimeout(finalSeq.show);
    finalSeq.fade = null;
    finalSeq.show = null;
  }

  function show(id) {
    const current = document.querySelector("[data-stage].active");
    const next = document.getElementById(id);
    if (current === next) return;

    // Leaving Final for any other stage ends its sequence: nothing from it
    // may fire later against a stage that is no longer showing.
    if (current && current.id === "stage-final") cancelFinalSequence();

    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (current) {
      current.classList.remove("active");
      if (reduced) {
        current.classList.remove("leaving");
      } else {
        current.classList.add("leaving");
        current.addEventListener("animationend", () => current.classList.remove("leaving"), { once: true });
      }
    }

    next.classList.add("active");
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  }

  document.getElementById("toLeaving").addEventListener("click", () => show("stage-leaving"));
  document.getElementById("toBeforeOpen").addEventListener("click", () => show("stage-before-open"));

  /* ------------------------------------------------------------------ *
   *  Envelope → letter
   * ------------------------------------------------------------------ */
  const envelopeScene = document.getElementById("openEnvelope");
  function openEnvelope() {
    show("stage-letter");
  }
  envelopeScene.addEventListener("click", openEnvelope);
  envelopeScene.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openEnvelope();
    }
  });

  /* ------------------------------------------------------------------ *
   *  Turning the letter's pages: same physical card, one baked page
   *  crossfades to the next via the [data-active] attribute on the
   *  flipper (CSS shows only the matching .pageN face - see styles.css).
   * ------------------------------------------------------------------ */
  const letterFlipper = document.getElementById("letterFlipper");
  // Real, confirmed bug: turning a letter page never called show() (the
  // stage itself, #stage-letter, never changes - only the flipper's
  // data-active swaps which face is visible), so it never got the scroll
  // reset show() gives every actual stage change. Scrolling down to read
  // page 1, then tapping next, opened page 2 at that same scroll offset
  // instead of its own top. Same fix as show() - reset scroll explicitly
  // here too.
  function resetScroll() {
    // Instant, not smooth: swapping pages changes the document's height
    // mid-crossfade, and Chrome abandons an in-flight smooth scroll when
    // the layout shifts under it - confirmed intermittently leaving the
    // next page partway down instead of at its top.
    window.scrollTo({ top: 0, behavior: "auto" });
  }
  document.getElementById("toPage2").addEventListener("click", () => {
    letterFlipper.dataset.active = "2";
    resetScroll();
  });
  document.getElementById("toPage3").addEventListener("click", () => {
    letterFlipper.dataset.active = "3";
    resetScroll();
  });

  /* ------------------------------------------------------------------ *
   *  Receiving the light — a quiet countdown (duration now configurable,
   *  see config.countdown.seconds - was a hardcoded 30), then either the
   *  optional Projector/Memory stage or straight to the closing line. No
   *  payment details are ever shown here; the actual donation is sent
   *  manually elsewhere while this plays.
   * ------------------------------------------------------------------ */
  let countdownTimer = null;

  /* Subtle "something is approaching" pulse on the shared sky background,
     retriggered on every tick (not every second necessarily - only when
     the visible number actually changes, same trigger point as the
     existing tick flourish). Toggling a class that's already inert at
     rest (--nur-pulse-amount defaults to 0 in styles.css) means Pulse
     OFF is simply never adding the class - no separate code path. */
  function pulseBackground(intensityPercent) {
    const root = document.documentElement.style;
    root.setProperty("--nur-pulse-amount", (Math.max(0, Math.min(100, intensityPercent)) / 100).toFixed(2));
    document.body.classList.remove("nur-pulse");
    void document.body.offsetWidth; // restart the animation if it's already mid-pulse
    document.body.classList.add("nur-pulse");
  }

  /* Calm "typing" dots next to "در حال ارسال" - the phrase itself lives
     in its own RTL-isolated <bdi> and never moves; only this sibling
     <bdi>'s content cycles through a fixed-width slot (see styles.css
     .countdown-dots) so nothing shifts as the dots grow. */
  const DOTS_FRAMES = ["", ".", "..", "..."];
  const DOTS_STEP_MS = 550;
  let dotsTimer = null;

  function startDots() {
    const dotsEl = document.getElementById("countdownDots");
    let i = 0;
    dotsEl.textContent = DOTS_FRAMES[0];
    clearInterval(dotsTimer);
    dotsTimer = setInterval(() => {
      i = (i + 1) % DOTS_FRAMES.length;
      dotsEl.textContent = DOTS_FRAMES[i];
    }, DOTS_STEP_MS);
  }

  function stopDots() {
    clearInterval(dotsTimer);
  }

  /* PHASE 1 -> PHASE 2 swap (Module 12): after config.final.phase2DelaySec,
     the emotional message fades OUT, and only once that fade has actually
     finished does the credit line + socials fade IN, in the exact same
     spot (.scene-text's shared grid cell - see index.html). A real
     sequential handoff, not a simultaneous cross-dissolve, so there is
     never a moment where both look like they're competing for attention.
     The night-sky bloom/sparkle behind all of this is untouched - it
     already finished its own one-time entrance long before this fires. */
  const PHASE1_FADE_MS = 1400; // must stay <= .final-phase1's own CSS transition duration

  function revealSignature() {
    const cfg = currentConfig.final || {};
    const delayMs = Math.max(0, (typeof cfg.phase2DelaySec === "number" ? cfg.phase2DelaySec : 4) * 1000);
    const phase1 = document.getElementById("finalPhase1");
    const phase2 = document.getElementById("finalPhase2");
    // Defensive reset: neither class is ever removed once set (phase1's
    // fade-out and phase2's show are both one-way in normal use). Revisiting
    // Final within the same page load without a full reload - e.g. Replay
    // on the Projector, or the admin panel jumping stages - would otherwise
    // start this second run with phase2 already visible and phase1 already
    // faded, skipping the entrance sequence entirely. A real first-time
    // visitor never hits this, but it costs nothing to guarantee.
    cancelFinalSequence(); // a second entry must never inherit the first one's timers
    phase1.classList.remove("fade-out");
    phase2.classList.remove("show");
    const finalStage = document.getElementById("stage-final");
    finalSeq.fade = setTimeout(() => {
      finalSeq.fade = null;
      if (!finalStage.classList.contains("active")) return;
      phase1.classList.add("fade-out");
      finalSeq.show = setTimeout(() => {
        finalSeq.show = null;
        if (finalStage.classList.contains("active")) phase2.classList.add("show");
      }, PHASE1_FADE_MS);
    }, delayMs);
  }

  const COUNTDOWN_EXIT_MS = 900; // must match @keyframes countdownExit's duration
  const numberEl = document.getElementById("countdownNumber");
  const countdownStage = document.getElementById("stage-countdown");

  /* Tick flourish: a small replay-able animation on the number, retriggered
     whenever its text changes, plus once when the stage first enters (so
     "30" gets the same entrance as every later tick). This USED TO be a
     separate <script> block in index.html, observing #stage-countdown's
     class attribute unconditionally - it replayed the animation on ANY
     class change while "active" was still present, which includes the
     ".exiting" class this file adds a few lines below. That meant the
     controlled exit was retriggering the tick flourish on the FROZEN "1"
     at the exact moment it was supposed to just fade away - the actual
     root cause of the reported flicker/re-render-looking glitch. Moved
     here, fixed to only fire on a genuine not-active -> active transition,
     and hard-disconnected the instant the exit sequence begins so NOTHING
     can touch the number again after that point. */
  function replayTick() {
    numberEl.classList.remove("tick-magic");
    void numberEl.offsetWidth; // force reflow so the animation restarts
    numberEl.classList.add("tick-magic");
  }

  const numberObserver = new MutationObserver(replayTick);
  numberObserver.observe(numberEl, { childList: true, characterData: true, subtree: true });

  let countdownStageWasActive = countdownStage.classList.contains("active");
  const stageObserver = new MutationObserver(() => {
    const isActive = countdownStage.classList.contains("active");
    // Only a real entrance (was inactive, just became active) replays the
    // flourish - NOT every subsequent class change while already active
    // (that "while already active" case is exactly what caused the bug).
    if (isActive && !countdownStageWasActive) replayTick();
    countdownStageWasActive = isActive;
  });
  stageObserver.observe(countdownStage, { attributes: true, attributeFilter: ["class"] });

  /* One conditional branch point, not a duplicated flow: Projector OFF
     (the default) behaves EXACTLY as before this integration - straight
     to stage-final. Projector ON inserts exactly one extra stage before
     the same final destination. window.NUR_PROJECTOR.start() is the only
     place projector.js's code ever runs, and only when this branch is
     actually taken - so a visitor with the feature off never causes a
     single byte of projector.js's media to load. */
  function goToFinalOrProjector() {
    const proj = currentConfig.projector;
    if (proj && proj.enabled && window.NUR_PROJECTOR) {
      show("stage-projector");
      let handedOff = false; // a fast double-click on Continue must not run the Final entrance twice
      window.NUR_PROJECTOR.start(proj, () => {
        if (handedOff) return;
        handedOff = true;
        show("stage-final");
        revealSignature();
      });
    } else {
      show("stage-final");
      revealSignature();
    }
  }

  function startCountdown() {
    const cd = currentConfig.countdown || { seconds: 30 };
    let remaining = Math.max(1, Number(cd.seconds) || 30);
    let isEnding = false; // one-time guard: the end sequence below can only ever run once per countdown
    numberEl.textContent = remaining;
    startDots();
    if (cd.pulseEnabled) pulseBackground(cd.pulseIntensity);

    // Smart preloading (only when Projector is actually enabled): warm the
    // frame's own decorative PNGs plus the FIRST memory's metadata/initial
    // buffer while the countdown runs, so both the entrance (Module 4/5 -
    // no "mask before frame" flash) and a tap on the play button are fast -
    // never the whole memory list, never eagerly for a visitor who will
    // never reach this stage. See projector.js's preload() for exactly how
    // light this is.
    if (currentConfig.projector && currentConfig.projector.enabled && window.NUR_PROJECTOR) {
      window.NUR_PROJECTOR.preload(currentConfig.projector);
    }

    clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
      if (isEnding) return; // extra safety net - should be unreachable since the interval is cleared below
      remaining -= 1;

      if (cd.pulseEnabled && remaining > 0) {
        // A touch stronger in the last few seconds ("something is
        // approaching"), still capped well short of anything flashy.
        const finalBoost = remaining <= 3 ? 1.35 : 1;
        pulseBackground(cd.pulseIntensity * finalBoost);
      }

      if (remaining <= 0) {
        isEnding = true;
        clearInterval(countdownTimer);
        stopDots();

        // Hard stop: disconnect both observers so it is not just
        // "unlikely" but IMPOSSIBLE for anything to touch the number's
        // text, classes, or animation again after this point. The "1"
        // stays exactly as it is - frozen, centered, untouched.
        numberObserver.disconnect();
        stageObserver.disconnect();
        // Never write "0" into the number - it stays frozen on "1" (its
        // last real value) for the rest of this sequence, so 0 never
        // renders even for a single frame.

        // Defensive: the "1" tick's own magicalTick flourish (.82s) is
        // NORMALLY finished well before the next 1000ms tick fires, but
        // that's a timing assumption, not a guarantee - setInterval can
        // drift under load. If it were still mid-flight here, its own
        // transform/filter would fight with the exit animation's
        // transform/filter on the very next frame, reading as a glitch.
        // Cancelling it outright removes that possibility entirely,
        // regardless of timing.
        numberEl.classList.remove("tick-magic");

        const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
        // Controlled exit: the countdown stage fades/blurs itself out as
        // ONE self-contained animation, fully centered and in `.active`
        // layout the entire time (see #stage-countdown.exiting in
        // index.html). Only once THAT finishes do we hand off to the
        // normal stage-swap - the final stage never starts entering
        // while the countdown is still visible, and (now that the
        // observers above are disconnected) nothing can re-animate the
        // number mid-exit.
        countdownStage.classList.add("exiting");
        const goToFinal = () => {
          // Remove "active" here too, not just "exiting": show() looks for
          // whatever stage currently has "active" and puts IT through the
          // generic .leaving/sceneOut crossfade. The countdown stage kept
          // "active" the whole time the custom exit animation played, so
          // without this, show("stage-final") would find it, strip
          // "exiting" (snapping it back to full opacity - .exiting holds
          // opacity:0 only via fill:forwards, which is cancelled the
          // instant the class is removed), and immediately start a SECOND,
          // generic fade on top of the one that already finished. That
          // opacity 0 -> 1 -> 0 snap was the visible flicker on/around "1".
          // Clearing "active" first means show() sees no current stage to
          // exit, so stage-final just becomes active directly - one exit
          // animation, not two.
          countdownStage.classList.remove("exiting");
          countdownStage.classList.remove("active");
          goToFinalOrProjector();
        };
        if (reduced) {
          goToFinal();
        } else {
          setTimeout(goToFinal, COUNTDOWN_EXIT_MS);
        }
        return;
      }
      numberEl.textContent = remaining;
    }, 1000);
  }

  document.getElementById("toCountdown").addEventListener("click", () => {
    show("stage-countdown");
    startCountdown();
  });

  /* Admin-only: jump the live preview straight to any stage (and, for
     the letter, straight to a specific page) when a panel tab is
     clicked - called exclusively from admin-panel.js, never wired to
     anything a normal visitor can trigger, so the public flow is
     unaffected. Clears any in-flight real countdown first so jumping
     away from a countdown the admin was just testing can't silently
     pop the final screen up later while they're editing another tab. */
  function previewStage(stageId, letterPage) {
    clearInterval(countdownTimer);
    stopDots();
    show(stageId);
    // Showing Final from the panel runs the same timed sequence a visitor
    // gets (continuers page for the configured seconds, then Credit) - it
    // used to show the page with no timer at all, i.e. it never advanced.
    // Re-clicking the tab restarts it.
    if (stageId === "stage-final") revealSignature();
    if (stageId === "stage-projector" && window.NUR_PROJECTOR) {
      // Admin preview only - a real visitor only ever reaches this stage
      // through goToFinalOrProjector() above, which calls start() with
      // the REAL onDone callback. This used to call start() again here
      // too - harmless-looking, but start() unconditionally overwrites
      // that callback. Any admin who opened the panel and clicked the
      // Projector tab while a real visitor's playback was already
      // running (or even just testing their own stream) silently broke
      // Continue for the rest of that page's life - confirmed as the
      // actual cause of "Continue doesn't reliably reach Final". A
      // dedicated preview entry point that never touches onDoneCallback
      // fixes this at the root instead of trying to special-case it here.
      window.NUR_PROJECTOR.previewEnter(currentConfig.projector);
    }
    if (stageId === "stage-letter" && letterPage) {
      letterFlipper.dataset.active = String(letterPage);
    }
  }
})();
