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
    bdi.textContent = "@" + handle.replace(/^@/, "");
  }

  loadStreamerName().then((name) => {
    setHandle(document.getElementById("introHandle"), name);
    setHandle(document.getElementById("beforeOpenHandle"), name);

    const nameOverlay = document.getElementById("letterNameOverlay");
    const bdi = document.createElement("bdi");
    bdi.className = "handle";
    bdi.textContent = "@" + name.replace(/^@/, "");
    nameOverlay.appendChild(bdi);
    nameOverlay.append(" عزیز");
  });

  /* ------------------------------------------------------------------ *
   *  The letter itself — page 1 (front) is now a single baked image
   *  (assets/note-page1.png) with its own text and salutation drawn
   *  directly into the artwork, so there is no DOM text to set for it
   *  here. NOTE: that also means the "@ArioPlay" salutation on page 1
   *  is fixed pixel content, not the dynamic ?u=/URL handle — the
   *  personalization system below only still reaches the intro and
   *  before-open screens (and the back face, which is still live HTML
   *  text). A different recipient needs their own baked page-1 image.
   *  LETTER_PAGE2 holds the remainder of the original single-page text
   *  (including the opening "نترس..." joke, which the page-1 artwork
   *  dropped), staged for the page-2 screen once its asset arrives —
   *  not wired to any DOM yet. The old gift-note back face has since
   *  been replaced the same way page 1 was: assets/note-page3.png is a
   *  baked image (the user's own reworded/updated gift text), so
   *  there's no LETTER_BACK string anymore either.
   * ------------------------------------------------------------------ */
  const LETTER_PAGE2 =
    "نترس، این یک نامه‌ی عاشقانه نیست :)\n" +
    "اما با تمام وجود و از ته دل نوشته شده.\n\n" +
    "با همه‌ی بالا و پایین‌های زندگی، تو ادامه دادی،\n" +
    "و من، به عنوان عضوی کوچک از این کامیونیتی، بهت افتخار می‌کنم و قدردان حضورت هستم.\n" +
    "ما نمی‌دانیم پایان این تاریکی چه زمانی است،\n" +
    "اما تو می‌توانی تا آن زمان یکی از ستاره‌های این شب باشی؛\n" +
    "یک ستاره‌ی روشن که آدم‌ها با دیدنش دوباره به زندگی امیدوار شوند.\n\n" +
    "می‌خواهم دعوتت کنم که تو ستاره‌ی نورانی بعدی این مسیر باشی.\n" +
    "به‌زودی بخشی از نور من برای تو فرستاده می‌شود.\n" +
    "یادت باشد تعداد محبت‌های یک نور را نشماری؛\n" +
    "به آسمانی فکر کن که روزی در تاریک‌ترین شکل خودش بوده، اما به خاطر حضور و قدم‌های تو، کم‌کم به یک آسمان پرستاره تبدیل شده.\n\n" +
    "از اینجا به بعد انتخاب با توست:\n" +
    "می‌توانی این نور را فقط برای خودت نگه داری،\n" +
    "یا به هر روشی که در توانت هست، باعث شوی یک ستاره‌ی نورانی دیگر هم به وجود بیاید.";

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
   *  Letter flip: front → back, same physical card turning over
   * ------------------------------------------------------------------ */
  document.getElementById("toLetterBack").addEventListener("click", () => {
    document.getElementById("letterFlipper").classList.add("flipped");
    document.getElementById("stage-letter").classList.add("flipped");
  });

  /* ------------------------------------------------------------------ *
   *  Receiving the light — a quiet 30-second countdown, then the closing
   *  line. No payment details are ever shown here; the actual donation is
   *  sent manually elsewhere while this plays.
   * ------------------------------------------------------------------ */
  const COUNTDOWN_SECONDS = 30;
  let countdownTimer = null;

  function startCountdown() {
    const numberEl = document.getElementById("countdownNumber");
    let remaining = COUNTDOWN_SECONDS;
    numberEl.textContent = remaining;

    clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
      remaining -= 1;
      numberEl.textContent = Math.max(remaining, 0);
      if (remaining <= 0) {
        clearInterval(countdownTimer);
        setTimeout(() => show("stage-final"), 600);
      }
    }, 1000);
  }

  document.getElementById("toCountdown").addEventListener("click", () => {
    show("stage-countdown");
    startCountdown();
  });
})();
