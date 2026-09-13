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

  /* Every value here reproduces the CURRENT shipped design exactly - the
     admin panel starts out changing nothing until the user actually moves
     something. */
  const DEFAULT_CONFIG = {
    version: 1,
    streamerName: "ArioPlay",

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
      greetingGap: 22
    },

    envelope: {
      greeting: "خوش اومدی {name} عزیز",
      instruction: "یک قدم با نامه‌ات فاصله داری؛ کلیک کن وسط نامه تا برات باز بشه",
      offsetY: 0,
      lineGap: 9,
      gapToEnvelope: 10,
      fontSize: 20
    },

    letterName: {
      x: 6,
      y: 16,
      fontSize: 48,
      rotation: 0,
      gapToAziz: 8
    },

    final: {
      main: "این نور حالا پیش توئه🌠",
      sub: "ممنون که همراه این مسیر شدی، امیدوارم وقتی وقتش رسید، تو هم دلیل روشن شدن شب یکی دیگه باشی❤️",
      offsetY: 0,
      mainFontSize: 34,
      signature: "درست شده با عشق توسط دال‌وی",
      signatureOffsetY: 96,
      signatureFontSize: 15
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
    DEFAULT_CONFIG,
    deepClone,
    mergeWithDefaults,
    loadConfig,
    saveConfig,
    clearConfig
  };
})(window);
