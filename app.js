(() => {
  "use strict";

  /* ------------------------------------------------------------------ *
   *  Current streamer name — the public URL is always the same
   *  (daalvi.com/nur), so the name is no longer read from the path or
   *  a ?u= query param. Instead it's fetched from a tiny public Wix
   *  Velo HTTP function that reads a single field the user edits
   *  directly in Wix's own Content Manager. See DEPLOY.md for the
   *  one-time Wix setup this endpoint depends on.
   *
   *  A ?u= override is kept ONLY as a local-testing convenience (it
   *  skips the network call entirely) - it is never meant to be given
   *  out as a real link.
   * ------------------------------------------------------------------ */
  const CONFIG_URL = "https://www.daalvi.com/_functions/nurConfig";
  const DEFAULT_STREAMER_NAME = "ArioPlay";

  async function loadStreamerName() {
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
      return name || DEFAULT_STREAMER_NAME;
    } catch (err) {
      return DEFAULT_STREAMER_NAME;
    }
  }

  function setHandle(el, handle) {
    let bdi = el.classList.contains("handle") ? el : el.querySelector(".handle");
    if (!bdi) {
      bdi = document.createElement("bdi");
      bdi.className = "handle";
      el.appendChild(bdi);
    }
    bdi.textContent = handle.replace(/^@/, "");
  }

  loadStreamerName().then((name) => {
    setHandle(document.getElementById("introHandle"), name);
    setHandle(document.getElementById("beforeOpenHandle"), name);

    const nameOverlay = document.getElementById("letterNameOverlay");
    const bdi = document.createElement("bdi");
    bdi.className = "handle";
    bdi.textContent = name.replace(/^@/, "");
    nameOverlay.appendChild(bdi);
    nameOverlay.append(" عزیز");
  });

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

  function startCountdown() {
    const numberEl = document.getElementById("countdownNumber");
    let remaining = COUNTDOWN_SECONDS;
    numberEl.textContent = remaining;
    startDots();

    clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
      remaining -= 1;
      numberEl.textContent = Math.max(remaining, 0);
      if (remaining <= 0) {
        clearInterval(countdownTimer);
        stopDots();
        setTimeout(() => {
          show("stage-final");
          revealSignature();
        }, 600);
      }
    }, 1000);
  }

  document.getElementById("toCountdown").addEventListener("click", () => {
    show("stage-countdown");
    startCountdown();
  });
})();
