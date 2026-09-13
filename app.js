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

  /* ------------------------------------------------------------------ *
   *  Current streamer name — the public URL is always the same
   *  (daalvi.com/nur), so the name is no longer read from the path or
   *  a ?u= query param. Instead it's fetched from a tiny public Wix
   *  Velo HTTP function that reads a single field the user edits
   *  directly in Wix's own Content Manager (see DEPLOY.md). Until that's
   *  set up (or if the fetch ever fails), config.streamerName - the same
   *  field the admin panel's "Streamer Name" box edits - is the fallback,
   *  so there's always exactly one value in play, never two competing
   *  defaults.
   *
   *  A ?u= override is kept ONLY as a local-testing convenience (it
   *  skips the network call entirely) - it is never meant to be given
   *  out as a real link.
   * ------------------------------------------------------------------ */
  const CONFIG_URL = "https://www.daalvi.com/_functions/nurConfig";

  async function fetchWixStreamerName() {
    const override = new URLSearchParams(location.search).get("u");
    if (override) return override.replace(/^@/, "");

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(CONFIG_URL, { signal: controller.signal, cache: "no-store" });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error("nurConfig endpoint returned " + res.status);
      const data = await res.json();
      const name = data && data.name ? String(data.name).trim() : "";
      return name || null;
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

  /* Splits free text on blank lines into paragraphs, each rendered with
     white-space:pre-line (see styles.css) so a SINGLE manual line break
     within a paragraph is preserved exactly as typed in the admin panel -
     nothing here re-flows or strips the admin's own line breaks. */
  function renderParagraphs(container, text) {
    container.textContent = "";
    String(text || "")
      .split(/\n\s*\n/)
      .forEach((para) => {
        if (!para.trim()) return;
        const p = document.createElement("p");
        p.textContent = para;
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
    renderParagraphs(document.getElementById("introBody"), config.intro.body);

    root.setProperty("--nur-envelope-y", config.envelope.offsetY + "px");
    root.setProperty("--nur-envelope-line-gap", config.envelope.lineGap + "px");
    root.setProperty("--nur-envelope-gap-to-envelope", config.envelope.gapToEnvelope + "px");
    root.setProperty("--nur-envelope-font-size", config.envelope.fontSize + "px");
    document.getElementById("envelopeInstruction").textContent = config.envelope.instruction;

    root.setProperty("--nur-letter-name-x", config.letterName.x + "%");
    root.setProperty("--nur-letter-name-y", config.letterName.y + "%");
    root.setProperty("--nur-letter-name-font-size", config.letterName.fontSize + "px");
    root.setProperty("--nur-letter-name-rotation", config.letterName.rotation + "deg");
    root.setProperty("--nur-letter-name-gap", config.letterName.gapToAziz + "px");

    root.setProperty("--nur-final-y", config.final.offsetY + "px");
    root.setProperty("--nur-final-font-size", config.final.mainFontSize + "px");
    root.setProperty("--nur-final-sig-y", config.final.signatureOffsetY + "px");
    root.setProperty("--nur-final-sig-font-size", config.final.signatureFontSize + "px");
    document.getElementById("finalMain").textContent = config.final.main;
    document.getElementById("finalSub").textContent = config.final.sub;
    document.getElementById("finalSignature").textContent = config.final.signature;

    renderStreamerName(config);
  }

  applyConfig(currentConfig);
  fetchWixStreamerName().then((wixName) => {
    if (wixName) {
      effectiveStreamerName = wixName;
      renderStreamerName(currentConfig);
    }
  });

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
      applyConfig(config);
    }
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
  function show(id) {
    const current = document.querySelector("[data-stage].active");
    const next = document.getElementById(id);
    if (current === next) return;

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
  document.getElementById("toPage2").addEventListener("click", () => {
    letterFlipper.dataset.active = "2";
  });
  document.getElementById("toPage3").addEventListener("click", () => {
    letterFlipper.dataset.active = "3";
  });

  /* ------------------------------------------------------------------ *
   *  Receiving the light — a quiet 30-second countdown, then the closing
   *  line. No payment details are ever shown here; the actual donation is
   *  sent manually elsewhere while this plays.
   * ------------------------------------------------------------------ */
  const COUNTDOWN_SECONDS = 30;
  let countdownTimer = null;

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

  /* The "درست شده با عشق..." signature fades in a few seconds after the
     final message appears, then twinkles very gently forever after -
     see the .final-signature / .visible rules in index.html. */
  const SIGNATURE_DELAY_MS = 3800;

  function revealSignature() {
    const signature = document.getElementById("finalSignature");
    setTimeout(() => signature.classList.add("visible"), SIGNATURE_DELAY_MS);
  }

  const COUNTDOWN_EXIT_MS = 900; // must match @keyframes countdownExit's duration

  function startCountdown() {
    const numberEl = document.getElementById("countdownNumber");
    const countdownStage = document.getElementById("stage-countdown");
    let remaining = COUNTDOWN_SECONDS;
    numberEl.textContent = remaining;
    startDots();

    clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        // Never write "0" into the number - it stays frozen on "1" (its
        // last real value) for the rest of this sequence, so 0 never
        // renders even for a single frame.
        clearInterval(countdownTimer);
        stopDots();

        const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
        // Controlled exit: the countdown stage fades/blurs itself out as
        // a self-contained animation, fully centered and in `.active`
        // layout the entire time (see #stage-countdown.exiting in
        // index.html). Only once THAT finishes do we hand off to the
        // normal stage-swap - the final stage never starts entering
        // while the countdown is still visible, and the countdown never
        // loses its centering mid-exit (the bug this replaces).
        countdownStage.classList.add("exiting");
        const goToFinal = () => {
          countdownStage.classList.remove("exiting");
          show("stage-final");
          revealSignature();
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
})();
