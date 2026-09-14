/* ============================================================================
   NUR — single configuration object.
   ----------------------------------------------------------------------------
   Everything the admin panel (admin-panel.js) can edit lives here, in one
   plain JSON-serializable object. app.js reads this at boot to render text
   and apply positions; nothing in app.js hardcodes copy or layout numbers
   that this file also controls.

   Persistence: two layers. localStorage (NUR_STORAGE_KEY) is the fast local
   cache every visitor reads first, so the page renders instantly with no
   loading screen. REMOTE_CONFIG_URL is the actual source of truth for
   production - app.js fetches it on every load and refreshes the local
   cache from it; admin-panel.js's Save button pushes to it (password-
   checked server-side, see DEPLOY.md) so a saved edit reaches every future
   visitor, not just the browser that made it.
   ============================================================================ */
(function (global) {
  "use strict";

  const NUR_STORAGE_KEY = "nurConfig.v1";

  /* Single shared endpoint for the whole config, read by every visitor on
     load and written by the admin panel's Save button (password-gated
     server-side - see DEPLOY.md). app.js and admin-panel.js both read this
     from here so there is exactly one URL to ever change. */
  const REMOTE_CONFIG_URL = "https://www.daalvi.com/_functions/nurConfig";

  /* Password-gated endpoint that uploads an (already client-side WebP-
     optimized) paper image to the Wix Media Manager and returns its public
     URL - see admin-panel.js's image field type. Only that URL is ever
     saved into config/NurConfig; the image bytes themselves never pass
     through REMOTE_CONFIG_URL or get stored there. */
  const REMOTE_UPLOAD_URL = "https://www.daalvi.com/_functions/nurUploadImage";

  /* Every value here reproduces the CURRENT shipped design exactly - the
     admin panel starts out changing nothing until the user actually moves
     something. */
  const DEFAULT_CONFIG = {
    version: 1,
    streamerName: "ArioPlay",

    /* wordSpacing (px) exists on every text section below, same as the
       letter pages already had - defaults to 0 everywhere so nothing
       visually changes until the admin actually moves that slider. */
    intro: {
      body:
        "در صفحه‌ی بعد نامه‌ ای برای تو نوشته شده\n\n" +
        "برای شکل گرفتن این مسیر، روزها وقت گذاشته شده؛ ازت می‌خوام با حوصله و صبر بازش کنی و بخونیش\n\n" +
        "اگر به هر دلیلی الان زمان خوبی نیست، لطفاً همین‌جا این صفحه را رها کن!",
      offsetX: 0,
      offsetY: 0,
      fontSize: 20,
      lineHeight: 1.7,
      gap: 10,
      greetingFontSize: 36,
      greetingGap: 22,
      wordSpacing: 0
    },

    envelope: {
      greeting: "خوش اومدی {name} عزیز",
      instruction: "یک قدم با نامه‌ات فاصله داری؛ کلیک کن وسط نامه تا برات باز بشه",
      offsetY: 0,
      lineGap: 9,
      gapToEnvelope: 10,
      fontSize: 20,
      wordSpacing: 0
    },

    letterName: {
      x: 6,
      y: 16,
      fontSize: 48,
      rotation: 0,
      gapToAziz: 8,
      wordSpacing: 0
    },

    /* The three letter pages used to be baked-text PNGs; the artwork is now
       blank paper (assets/note-page1/2/3.png) and this is the real HTML
       text laid over it, one section per page, all in the same shape so
       the admin panel can treat them identically. letterPage1's `body`
       intentionally does NOT repeat "{name} عزیز" - that line is still
       drawn by the separate letterName overlay above (so it always tracks
       the current streamer), never duplicated as literal text here.
       x/y/width are % (like letterName.x/y) since the whole letter card
       scales as one image at every viewport width - a fixed px position
       would overflow the card on narrow screens. fontSize/lineHeight/
       paragraphGap/wordSpacing are px/unitless, same as every other text
       control in this file.

       `button` is that page's own "صفحه‌ی بعد"/"دریافت نور" control -
       x/y are its CENTER point in % (matches drag semantics: a drag
       tracks a point, and centering makes width/height changes not
       shift the button's anchor), width/height/fontSize/borderRadius
       are px (scaled the same way as the text above via
       --nur-card-scale, see styles.css), scale is an optional extra
       multiplier, label is the button's own text. */
    letterPage1: {
      body:
        "اول از همه باید ازت تشکر کنم؛\n" +
        "برای شب‌هایی که شاید حال دلت خوب نبوده\n" +
        "اما اومدی اینجا و حتی اگر شده برای چند لحظه،\n" +
        "حال دل دیگران را بهتر کردی.\n" +
        "برای شب‌هایی که شاید تو باعث شدی کسی،\n" +
        "حتی برای چند دقیقه، کنار تو بودن را تجربه کند و مشکلاتش\n" +
        "را فراموش کند، برای روزهایی که با عشق کار کردی اما\n" +
        "به نتیجه‌ای که می‌خواستی نرسیدی، و با این حال ادامه دادی؛\n" +
        "ادامه دادی برای روزهای بهتر و برای آرزوهایی\n" +
        "که با گران شدن ارزها، دور و دورتر شدند.\n" +
        "می‌دانم شاید برای تو هم پیش آمده که به رها کردن این\n" +
        "مسیر و انتخاب یک شغل بهتر فکر کرده باشی.\n" +
        "اما ته دلت هنوز امیدی بوده که بالاخره این\n" +
        "شب سیاه تمام می‌شود و ما دوباره خورشید را می‌بینیم...",
      x: 6,
      y: 21,
      width: 80,
      fontSize: 17,
      lineHeight: 1.55,
      paragraphGap: 8,
      wordSpacing: 0,
      /* "" = use the bundled default asset (assets/note-page1.webp). Any
         other value is a Wix Media Manager URL from an admin-panel upload
         (see admin-panel.js's image field type) - set only via that flow,
         never hand-edited. */
      paperImage: "",
      button: { x: 50, y: 87, width: 96, height: 47, fontSize: 14, borderRadius: 999, scale: 1, label: "صفحه‌ی بعد" },
      /* Small subtle watermark and a separate page-number label, each with
         its own independent position/size (and opacity, for the
         signature only) so every page can be tuned on its own. */
      signature: { text: "Daalvi", x: 8, y: 94, fontSize: 12, opacity: 0.55 },
      pageNumber: { text: "1", x: 90, y: 5, fontSize: 12 }
    },

    letterPage2: {
      body:
        "با همه‌ی سختی‌ها، تغییرها و روزهای خوب و بد،\n" +
        "تو باز هم ادامه دادی و من، به عنوان عضوی کوچک\n" +
        "از جامعه استریم فارسی، به دیدن این مسیر و ادامه دادنت\n" +
        "افتخار می‌کنم و قدردان حضورت هستم.\n" +
        "ما نمی‌دونیم پایان این تاریکی چه زمانی است،\n" +
        "اما تو می‌تونی تا اون زمان یکی از ستاره‌های این شب باشی؛\n" +
        "یک ستاره‌ی روشن که آدما با دیدنش دوباره به زندگی امیدوار میشن!\n\n" +
        "می‌خوام دعوتت کنم که تو ستاره‌ی نورانی بعدی این مسیر باشی\n" +
        "به‌زودی بخشی از نور من برای تو فرستاده می‌شه\n" +
        "یادت باشه تعداد محبت‌های یک نور را نشماری؛\n" +
        "به آسمانی فکر کن که روزی در تاریک‌ترین\n" +
        "شکل خودش بوده، اما به خاطر حضور و قدم‌های تو، کم‌کم\n" +
        "به یک آسمان پر ستاره تبدیل شده...",
      x: 6,
      y: 13,
      width: 80,
      fontSize: 17,
      lineHeight: 1.55,
      paragraphGap: 8,
      wordSpacing: 0,
      paperImage: "",
      button: { x: 50, y: 88, width: 96, height: 47, fontSize: 14, borderRadius: 999, scale: 1, label: "صفحه‌ی بعد" },
      signature: { text: "Daalvi", x: 8, y: 94, fontSize: 12, opacity: 0.55 },
      pageNumber: { text: "2", x: 90, y: 5, fontSize: 12 }
    },

    letterPage3: {
      body:
        "یک قدم با هدیه‌ات فاصله داری\n" +
        "می‌تونی همه‌ش رو برای خودت برداری،\n" +
        "یا بخشی از این نور رو به نفر بعد برسونی؛ نه لزوماً به\n" +
        "همون شکل، شاید با کمی توجه، گوش شنوا بودن،\n" +
        "معرفی کردن یک نفر، یا هر کاری که از دستت برمیاد تا برای\n" +
        "چند دقیقه هم که شده، شب یکی کمی روشن‌تر بشه.\n\n" +
        "فراموش نکن که محبتِ نور رو نشماری؛ چون نور برای\n" +
        "شمرده شدن نیست، برای پخش شدنه\n" +
        "اگر نگهش داری، کوچیک می‌شه؛ اگر منتقلش کنی،\n" +
        "گسترش پیدا می‌کنه، با قلبت حسش کن و بذار\n" +
        "از تو، یک ستاره‌ی دیگه روشن بشه...",
      x: 6,
      y: 23,
      width: 80,
      fontSize: 17,
      lineHeight: 1.55,
      paragraphGap: 8,
      wordSpacing: 0,
      paperImage: "",
      button: { x: 50, y: 82, width: 88, height: 47, fontSize: 14, borderRadius: 999, scale: 1, label: "دریافت نور" },
      signature: { text: "Daalvi", x: 8, y: 94, fontSize: 12, opacity: 0.55 },
      pageNumber: { text: "3", x: 90, y: 5, fontSize: 12 }
    },

    final: {
      main: "این نور حالا پیش توئه🌠",
      sub: "ممنون که همراه این مسیر شدی، امیدوارم وقتی وقتش رسید، تو هم دلیل روشن شدن شب یکی دیگه باشی❤️",
      offsetY: 0,
      mainFontSize: 34,
      wordSpacing: 0,
      signature: "درست شده با عشق توسط دال‌وی",
      signatureOffsetY: 96,
      signatureFontSize: 15,
      signatureWordSpacing: 0
    }
  };

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /* Shallow-per-section merge: an old/partial saved config (e.g. saved
     before a new field was added to DEFAULT_CONFIG) still gets every
     default field it's missing, section by section. */
  function mergeWithDefaults(saved) {
    const merged = deepClone(DEFAULT_CONFIG);
    if (!saved || typeof saved !== "object") return merged;
    for (const key of Object.keys(merged)) {
      if (key === "version") continue;
      if (saved[key] && typeof saved[key] === "object" && !Array.isArray(saved[key])) {
        Object.assign(merged[key], saved[key]);
      } else if (saved[key] !== undefined && typeof merged[key] !== "object") {
        merged[key] = saved[key];
      }
    }
    return merged;
  }

  function loadConfig() {
    try {
      const raw = localStorage.getItem(NUR_STORAGE_KEY);
      if (!raw) return deepClone(DEFAULT_CONFIG);
      return mergeWithDefaults(JSON.parse(raw));
    } catch (err) {
      return deepClone(DEFAULT_CONFIG);
    }
  }

  function saveConfig(config) {
    try {
      localStorage.setItem(NUR_STORAGE_KEY, JSON.stringify(config));
      return true;
    } catch (err) {
      return false;
    }
  }

  function clearConfig() {
    try {
      localStorage.removeItem(NUR_STORAGE_KEY);
    } catch (err) {
      /* ignore */
    }
  }

  global.NUR_CONFIG_API = {
    STORAGE_KEY: NUR_STORAGE_KEY,
    REMOTE_CONFIG_URL,
    REMOTE_UPLOAD_URL,
    DEFAULT_CONFIG,
    deepClone,
    mergeWithDefaults,
    loadConfig,
    saveConfig,
    clearConfig
  };
})(window);
