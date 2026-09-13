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
  async function fetchRemoteConfig() {
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
  function renderParagraphs(container, text) {
    container.textContent = "";
    String(text || "")
      .split(/\n/)
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
    root.setProperty("--nur-intro-greeting-font-size", config.intro.greetingFontSize + "px");
    root.setProperty("--nur-intro-greeting-gap", config.intro.greetingGap + "px");
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

  const nameOverride = new URLSearchParams(location.search).get("u");
  if (nameOverride) {
    // Local-testing convenience only - skips the network fetch entirely.
    effectiveStreamerName = nameOverride.replace(/^@/, "");
    renderStreamerName(currentConfig);
  } else {
    fetchRemoteConfig().then((remoteConfig) => {
      if (!remoteConfig) return; // fetch failed/timed out - keep the local cache/defaults already rendered
      const merged = configApi.mergeWithDefaults(remoteConfig);
      configApi.saveConfig(merged); // refresh the local cache so the next load starts from this
      currentConfig = merged;
      applyConfig(merged);
    });
  }

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

  function startCountdown() {
    let remaining = COUNTDOWN_SECONDS;
    let isEnding = false; // one-time guard: the end sequence below can only ever run once per countdown
    numberEl.textContent = remaining;
    startDots();

    clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
      if (isEnding) return; // extra safety net - should be unreachable since the interval is cleared below
      remaining -= 1;

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
