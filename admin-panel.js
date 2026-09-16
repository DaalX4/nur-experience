/* ============================================================================
   NUR — admin/control panel.
   ----------------------------------------------------------------------------
   A small, hidden visual editor sitting ON TOP of the working project. It
   never touches the DOM of the experience directly - every edit goes through
   window.NUR_APP.applyConfig(config) (defined in app.js), the same function
   the app itself calls at boot. That's what makes live preview trivial: the
   panel just mutates a draft copy of the config object and re-applies it.

   Open with Ctrl+Shift+E, or the small dot in the bottom-left corner
   (opacity 0 until hovered) - invisible to a normal visitor either way.
   ============================================================================ */
(() => {
  "use strict";

  const api = window.NUR_CONFIG_API;
  if (!api) return;

  /* -------------------------------------------------------------------- *
   *  Field schema — one entry per control. This is the ONLY place that
   *  needs to change to add/remove a panel control; everything else
   *  (rendering, wiring, save/reset) is generic over this list.
   * ---------------------------------------------------------------------*/
  const TABS = [
    {
      id: "general",
      label: "کلی",
      screen: { stage: "stage-intro" },
      fields: [
        { type: "text", path: ["streamerName"], label: "نام استریمر (Streamer Name)" },
        { type: "color", path: ["sky", "color"], label: "رنگ آسمان" },
        { type: "color", path: ["sky", "starColor"], label: "رنگ ستاره‌ها" }
      ]
    },
    {
      id: "intro",
      label: "اینترو",
      screen: { stage: "stage-intro" },
      fields: [
        { type: "textarea", path: ["intro", "body"], label: "متن اینترو (خط خالی = پاراگراف جدید)" },
        { type: "slider", path: ["intro", "offsetX"], label: "جابجایی چپ/راست", min: -200, max: 200, step: 1, unit: "px" },
        { type: "slider", path: ["intro", "offsetY"], label: "جابجایی بالا/پایین", min: -200, max: 200, step: 1, unit: "px" },
        { type: "slider", path: ["intro", "greetingFontSize"], label: "اندازه فونت خوش‌آمد (درود...)", min: 18, max: 60, step: 1, unit: "px" },
        { type: "slider", path: ["intro", "greetingGap"], label: "فاصله خوش‌آمد تا متن اصلی", min: 0, max: 80, step: 1, unit: "px" },
        { type: "slider", path: ["intro", "fontSize"], label: "اندازه فونت متن اصلی", min: 12, max: 36, step: 1, unit: "px" },
        { type: "slider", path: ["intro", "lineHeight"], label: "فاصله خطوط", min: 1, max: 2.6, step: 0.05, unit: "" },
        { type: "slider", path: ["intro", "gap"], label: "فاصله بین پاراگراف‌ها", min: 0, max: 60, step: 1, unit: "px" },
        { type: "slider", path: ["intro", "wordSpacing"], label: "فاصله کلمات", min: 0, max: 20, step: 1, unit: "px" }
      ]
    },
    {
      id: "envelope",
      label: "صفحه پاکت",
      screen: { stage: "stage-before-open" },
      fields: [
        { type: "text", path: ["envelope", "greeting"], label: "خوش‌آمد (از {name} برای اسم استفاده کن)" },
        { type: "textarea", path: ["envelope", "instruction"], label: "متن راهنما" },
        { type: "slider", path: ["envelope", "offsetY"], label: "جابجایی بالا/پایین", min: -200, max: 200, step: 1, unit: "px" },
        { type: "slider", path: ["envelope", "lineGap"], label: "فاصله بین دو خط", min: 0, max: 60, step: 1, unit: "px" },
        { type: "slider", path: ["envelope", "gapToEnvelope"], label: "فاصله تا پاکت", min: 0, max: 80, step: 1, unit: "px" },
        { type: "slider", path: ["envelope", "fontSize"], label: "اندازه فونت راهنما", min: 12, max: 32, step: 1, unit: "px" },
        { type: "slider", path: ["envelope", "wordSpacing"], label: "فاصله کلمات", min: 0, max: 20, step: 1, unit: "px" }
      ]
    },
    {
      id: "letter",
      label: "نامه - صفحه ۱",
      screen: { stage: "stage-letter", letterPage: 1 },
      dragTarget: { path: ["letterPage1", "button"], elementId: "toPage2" },
      fields: [
        { type: "slider", path: ["letterName", "x"], label: "X (فاصله از راست)", min: 0, max: 45, step: 0.5, unit: "%" },
        { type: "slider", path: ["letterName", "y"], label: "Y (فاصله از بالا)", min: 0, max: 55, step: 0.5, unit: "%" },
        { type: "slider", path: ["letterName", "fontSize"], label: "اندازه فونت", min: 16, max: 90, step: 1, unit: "px" },
        { type: "slider", path: ["letterName", "rotation"], label: "چرخش (Rotation)", min: -30, max: 30, step: 1, unit: "deg" },
        { type: "slider", path: ["letterName", "gapToAziz"], label: "فاصله تا «عزیز»", min: 0, max: 40, step: 1, unit: "px" },
        { type: "slider", path: ["letterName", "wordSpacing"], label: "فاصله کلمات", min: 0, max: 20, step: 1, unit: "px" },
        { type: "textarea", path: ["letterPage1", "body"], label: "متن نامه - صفحه ۱ (خط خالی = پاراگراف جدید)" },
        { type: "image", path: ["letterPage1", "paperImage"], label: "تصویر کاغذ (خالی = تصویر پیش‌فرض)", defaultSrc: "assets/note-page1.webp" },
        { type: "slider", path: ["letterPage1", "x"], label: "متن: X (فاصله از راست)", min: 0, max: 40, step: 1, unit: "%" },
        { type: "slider", path: ["letterPage1", "y"], label: "متن: Y (فاصله از بالا)", min: 0, max: 70, step: 1, unit: "%" },
        { type: "slider", path: ["letterPage1", "width"], label: "متن: عرض بلوک", min: 40, max: 95, step: 1, unit: "%" },
        { type: "slider", path: ["letterPage1", "fontSize"], label: "متن: اندازه فونت", min: 10, max: 28, step: 1, unit: "px" },
        { type: "slider", path: ["letterPage1", "lineHeight"], label: "متن: فاصله خطوط", min: 1, max: 2.6, step: 0.05, unit: "" },
        { type: "slider", path: ["letterPage1", "paragraphGap"], label: "متن: فاصله پاراگراف‌ها", min: 0, max: 40, step: 1, unit: "px" },
        { type: "slider", path: ["letterPage1", "wordSpacing"], label: "متن: فاصله کلمات", min: 0, max: 20, step: 1, unit: "px" },
        { type: "text", path: ["letterPage1", "button", "label"], label: "متن دکمه" },
        { type: "slider", path: ["letterPage1", "button", "x"], label: "دکمه: X (مرکز)", min: 0, max: 100, step: 1, unit: "%" },
        { type: "slider", path: ["letterPage1", "button", "y"], label: "دکمه: Y (مرکز)", min: 0, max: 100, step: 1, unit: "%" },
        { type: "slider", path: ["letterPage1", "button", "width"], label: "دکمه: عرض", min: 50, max: 260, step: 1, unit: "px" },
        { type: "slider", path: ["letterPage1", "button", "height"], label: "دکمه: ارتفاع", min: 28, max: 90, step: 1, unit: "px" },
        { type: "slider", path: ["letterPage1", "button", "fontSize"], label: "دکمه: اندازه فونت", min: 10, max: 28, step: 1, unit: "px" },
        { type: "slider", path: ["letterPage1", "button", "borderRadius"], label: "دکمه: گردی گوشه‌ها", min: 0, max: 999, step: 1, unit: "px" },
        { type: "slider", path: ["letterPage1", "button", "scale"], label: "دکمه: مقیاس", min: 0.5, max: 1.5, step: 0.05, unit: "" },
        { type: "text", path: ["letterPage1", "signature", "text"], label: "امضا/واترمارک" },
        { type: "slider", path: ["letterPage1", "signature", "x"], label: "امضا: X (فاصله از راست)", min: 0, max: 100, step: 1, unit: "%" },
        { type: "slider", path: ["letterPage1", "signature", "y"], label: "امضا: Y (فاصله از بالا)", min: 0, max: 100, step: 1, unit: "%" },
        { type: "slider", path: ["letterPage1", "signature", "fontSize"], label: "امضا: اندازه فونت", min: 8, max: 30, step: 1, unit: "px" },
        { type: "slider", path: ["letterPage1", "signature", "opacity"], label: "امضا: شفافیت", min: 0.1, max: 1, step: 0.05, unit: "" },
        { type: "slider", path: ["letterPage1", "signature", "rotation"], label: "امضا: چرخش (اختیاری)", min: -45, max: 45, step: 1, unit: "deg" },
        { type: "text", path: ["letterPage1", "pageNumber", "text"], label: "شماره صفحه" },
        { type: "slider", path: ["letterPage1", "pageNumber", "x"], label: "شماره صفحه: X (فاصله از راست)", min: 0, max: 100, step: 1, unit: "%" },
        { type: "slider", path: ["letterPage1", "pageNumber", "y"], label: "شماره صفحه: Y (فاصله از بالا)", min: 0, max: 100, step: 1, unit: "%" },
        { type: "slider", path: ["letterPage1", "pageNumber", "fontSize"], label: "شماره صفحه: اندازه فونت", min: 8, max: 30, step: 1, unit: "px" }
      ]
    },
    {
      id: "letter2",
      label: "نامه - صفحه ۲",
      screen: { stage: "stage-letter", letterPage: 2 },
      dragTarget: { path: ["letterPage2", "button"], elementId: "toPage3" },
      fields: [
        { type: "textarea", path: ["letterPage2", "body"], label: "متن نامه - صفحه ۲ (خط خالی = پاراگراف جدید)" },
        { type: "image", path: ["letterPage2", "paperImage"], label: "تصویر کاغذ (خالی = تصویر پیش‌فرض)", defaultSrc: "assets/note-page2.webp" },
        { type: "slider", path: ["letterPage2", "x"], label: "X (فاصله از راست)", min: 0, max: 40, step: 1, unit: "%" },
        { type: "slider", path: ["letterPage2", "y"], label: "Y (فاصله از بالا)", min: 0, max: 70, step: 1, unit: "%" },
        { type: "slider", path: ["letterPage2", "width"], label: "عرض بلوک", min: 40, max: 95, step: 1, unit: "%" },
        { type: "slider", path: ["letterPage2", "fontSize"], label: "اندازه فونت", min: 10, max: 28, step: 1, unit: "px" },
        { type: "slider", path: ["letterPage2", "lineHeight"], label: "فاصله خطوط", min: 1, max: 2.6, step: 0.05, unit: "" },
        { type: "slider", path: ["letterPage2", "paragraphGap"], label: "فاصله پاراگراف‌ها", min: 0, max: 40, step: 1, unit: "px" },
        { type: "slider", path: ["letterPage2", "wordSpacing"], label: "فاصله کلمات", min: 0, max: 20, step: 1, unit: "px" },
        { type: "text", path: ["letterPage2", "button", "label"], label: "متن دکمه" },
        { type: "slider", path: ["letterPage2", "button", "x"], label: "دکمه: X (مرکز)", min: 0, max: 100, step: 1, unit: "%" },
        { type: "slider", path: ["letterPage2", "button", "y"], label: "دکمه: Y (مرکز)", min: 0, max: 100, step: 1, unit: "%" },
        { type: "slider", path: ["letterPage2", "button", "width"], label: "دکمه: عرض", min: 50, max: 260, step: 1, unit: "px" },
        { type: "slider", path: ["letterPage2", "button", "height"], label: "دکمه: ارتفاع", min: 28, max: 90, step: 1, unit: "px" },
        { type: "slider", path: ["letterPage2", "button", "fontSize"], label: "دکمه: اندازه فونت", min: 10, max: 28, step: 1, unit: "px" },
        { type: "slider", path: ["letterPage2", "button", "borderRadius"], label: "دکمه: گردی گوشه‌ها", min: 0, max: 999, step: 1, unit: "px" },
        { type: "slider", path: ["letterPage2", "button", "scale"], label: "دکمه: مقیاس", min: 0.5, max: 1.5, step: 0.05, unit: "" },
        { type: "text", path: ["letterPage2", "signature", "text"], label: "امضا/واترمارک" },
        { type: "slider", path: ["letterPage2", "signature", "x"], label: "امضا: X (فاصله از راست)", min: 0, max: 100, step: 1, unit: "%" },
        { type: "slider", path: ["letterPage2", "signature", "y"], label: "امضا: Y (فاصله از بالا)", min: 0, max: 100, step: 1, unit: "%" },
        { type: "slider", path: ["letterPage2", "signature", "fontSize"], label: "امضا: اندازه فونت", min: 8, max: 30, step: 1, unit: "px" },
        { type: "slider", path: ["letterPage2", "signature", "opacity"], label: "امضا: شفافیت", min: 0.1, max: 1, step: 0.05, unit: "" },
        { type: "slider", path: ["letterPage2", "signature", "rotation"], label: "امضا: چرخش (اختیاری)", min: -45, max: 45, step: 1, unit: "deg" },
        { type: "text", path: ["letterPage2", "pageNumber", "text"], label: "شماره صفحه" },
        { type: "slider", path: ["letterPage2", "pageNumber", "x"], label: "شماره صفحه: X (فاصله از راست)", min: 0, max: 100, step: 1, unit: "%" },
        { type: "slider", path: ["letterPage2", "pageNumber", "y"], label: "شماره صفحه: Y (فاصله از بالا)", min: 0, max: 100, step: 1, unit: "%" },
        { type: "slider", path: ["letterPage2", "pageNumber", "fontSize"], label: "شماره صفحه: اندازه فونت", min: 8, max: 30, step: 1, unit: "px" }
      ]
    },
    {
      id: "letter3",
      label: "نامه - صفحه ۳",
      screen: { stage: "stage-letter", letterPage: 3 },
      dragTarget: { path: ["letterPage3", "button"], elementId: "toCountdown" },
      fields: [
        { type: "textarea", path: ["letterPage3", "body"], label: "متن نامه - صفحه ۳ (خط خالی = پاراگراف جدید)" },
        { type: "image", path: ["letterPage3", "paperImage"], label: "تصویر کاغذ (خالی = تصویر پیش‌فرض)", defaultSrc: "assets/note-page3.webp" },
        { type: "slider", path: ["letterPage3", "x"], label: "X (فاصله از راست)", min: 0, max: 40, step: 1, unit: "%" },
        { type: "slider", path: ["letterPage3", "y"], label: "Y (فاصله از بالا)", min: 0, max: 70, step: 1, unit: "%" },
        { type: "slider", path: ["letterPage3", "width"], label: "عرض بلوک", min: 40, max: 95, step: 1, unit: "%" },
        { type: "slider", path: ["letterPage3", "fontSize"], label: "اندازه فونت", min: 10, max: 28, step: 1, unit: "px" },
        { type: "slider", path: ["letterPage3", "lineHeight"], label: "فاصله خطوط", min: 1, max: 2.6, step: 0.05, unit: "" },
        { type: "slider", path: ["letterPage3", "paragraphGap"], label: "فاصله پاراگراف‌ها", min: 0, max: 40, step: 1, unit: "px" },
        { type: "slider", path: ["letterPage3", "wordSpacing"], label: "فاصله کلمات", min: 0, max: 20, step: 1, unit: "px" },
        { type: "text", path: ["letterPage3", "button", "label"], label: "متن دکمه" },
        { type: "slider", path: ["letterPage3", "button", "x"], label: "دکمه: X (مرکز)", min: 0, max: 100, step: 1, unit: "%" },
        { type: "slider", path: ["letterPage3", "button", "y"], label: "دکمه: Y (مرکز)", min: 0, max: 100, step: 1, unit: "%" },
        { type: "slider", path: ["letterPage3", "button", "width"], label: "دکمه: عرض", min: 50, max: 260, step: 1, unit: "px" },
        { type: "slider", path: ["letterPage3", "button", "height"], label: "دکمه: ارتفاع", min: 28, max: 90, step: 1, unit: "px" },
        { type: "slider", path: ["letterPage3", "button", "fontSize"], label: "دکمه: اندازه فونت", min: 10, max: 28, step: 1, unit: "px" },
        { type: "slider", path: ["letterPage3", "button", "borderRadius"], label: "دکمه: گردی گوشه‌ها", min: 0, max: 999, step: 1, unit: "px" },
        { type: "slider", path: ["letterPage3", "button", "scale"], label: "دکمه: مقیاس", min: 0.5, max: 1.5, step: 0.05, unit: "" },
        { type: "text", path: ["letterPage3", "signature", "text"], label: "امضا/واترمارک" },
        { type: "slider", path: ["letterPage3", "signature", "x"], label: "امضا: X (فاصله از راست)", min: 0, max: 100, step: 1, unit: "%" },
        { type: "slider", path: ["letterPage3", "signature", "y"], label: "امضا: Y (فاصله از بالا)", min: 0, max: 100, step: 1, unit: "%" },
        { type: "slider", path: ["letterPage3", "signature", "fontSize"], label: "امضا: اندازه فونت", min: 8, max: 30, step: 1, unit: "px" },
        { type: "slider", path: ["letterPage3", "signature", "opacity"], label: "امضا: شفافیت", min: 0.1, max: 1, step: 0.05, unit: "" },
        { type: "slider", path: ["letterPage3", "signature", "rotation"], label: "امضا: چرخش (اختیاری)", min: -45, max: 45, step: 1, unit: "deg" },
        { type: "text", path: ["letterPage3", "pageNumber", "text"], label: "شماره صفحه" },
        { type: "slider", path: ["letterPage3", "pageNumber", "x"], label: "شماره صفحه: X (فاصله از راست)", min: 0, max: 100, step: 1, unit: "%" },
        { type: "slider", path: ["letterPage3", "pageNumber", "y"], label: "شماره صفحه: Y (فاصله از بالا)", min: 0, max: 100, step: 1, unit: "%" },
        { type: "slider", path: ["letterPage3", "pageNumber", "fontSize"], label: "شماره صفحه: اندازه فونت", min: 8, max: 30, step: 1, unit: "px" }
      ]
    },
    {
      id: "countdown",
      label: "شمارش معکوس",
      screen: { stage: "stage-countdown" },
      fields: [
        { type: "slider", path: ["countdown", "seconds"], label: "شروع شمارش معکوس", min: 3, max: 120, step: 1, unit: " ثانیه" },
        { type: "buttons", path: ["countdown", "pulseEnabled"], label: "پالس شمارش معکوس", options: [{ label: "روشن", value: true }, { label: "خاموش", value: false }] },
        { type: "slider", path: ["countdown", "pulseIntensity"], label: "شدت پالس", min: 0, max: 100, step: 5, unit: "%" }
      ]
    },
    {
      id: "projectorSettings",
      label: "تنظیمات پروژکتور",
      screen: { stage: "stage-projector" },
      fields: [
        { type: "buttons", path: ["projector", "enabled"], label: "صفحه پروژکتور / خاطرات", options: [{ label: "روشن", value: true }, { label: "خاموش", value: false }], group: "عمومی" },
        { type: "buttons", path: ["projector", "preset"], label: "پیش‌فرض ظاهری (Preset)", options: [{ label: "Soft", value: "soft" }, { label: "Balanced", value: "balanced" }, { label: "Deep", value: "deep" }], group: "عمومی" },

        { type: "buttons", path: ["projector", "source"], label: "منبع ویدیو", help: "بین آپلود مستقیم فایل یا استفاده از یک ویدیوی یوتیوب انتخاب کن. تغییر این گزینه اطلاعات منبع دیگر را پاک نمی‌کند.", options: [{ label: "آپلود مستقیم", value: "upload" }, { label: "یوتیوب", value: "youtube" }], rerenderOnChange: true, group: "منبع ویدیو" },

        { type: "mediaManager", path: ["projector", "items"], label: "رسانه‌های پروژکتور / خاطرات", showIf: { path: ["projector", "source"], equals: "upload" }, group: "رسانه (آپلود مستقیم)" },

        { type: "youtubeSource", path: ["projector", "youtubeUrl"], label: "لینک ویدیو یوتیوب", help: "فرمت‌های watch؟v=، youtu.be و shorts پشتیبانی می‌شوند. برای بررسی سریع، از بخش «پیش‌نمایش حالت‌ها» پایین همین صفحه استفاده کن.", showIf: { path: ["projector", "source"], equals: "youtube" }, group: "یوتیوب" },

        { type: "buttons", path: ["projector", "audio", "enabled"], label: "پخش صدا", options: [{ label: "روشن", value: true }, { label: "خاموش", value: false }], group: "صدا" },
        { type: "slider", path: ["projector", "audio", "volume"], label: "بلندی صدا", min: 0, max: 100, step: 5, unit: "%", group: "صدا" },
        { type: "buttons", path: ["projector", "audio", "hintEnabled"], label: "نمایش یادآور صدا", options: [{ label: "روشن", value: true }, { label: "خاموش", value: false }], group: "صدا" },
        { type: "text", path: ["projector", "audio", "hintText"], label: "متن یادآور صدا", group: "صدا" },
        { type: "slider", path: ["projector", "audio", "hintDuration"], label: "مدت نمایش", min: 2, max: 10, step: 0.5, unit: " ثانیه", group: "صدا" },
        { type: "slider", path: ["projector", "audio", "hintIconSize"], label: "اندازه آیکون", min: 14, max: 32, step: 1, unit: "px", group: "صدا" },
        { type: "color", path: ["projector", "audio", "hintColor"], label: "رنگ آیکون / متن", group: "صدا" },
        { type: "slider", path: ["projector", "audio", "hintOpacity"], label: "شفافیت", min: 40, max: 100, step: 5, unit: "%", group: "صدا" },
        { type: "slider", path: ["projector", "audio", "hintGlow"], label: "شدت درخشش", min: 0, max: 100, step: 5, unit: "%", group: "صدا" },
        { type: "buttons", path: ["projector", "audio", "hintPosition"], label: "جایگاه", options: [{ label: "پایین راست", value: "br" }, { label: "پایین چپ", value: "bl" }, { label: "بالا راست", value: "tr" }, { label: "بالا چپ", value: "tl" }], group: "صدا" },

        /* Video/media size+position - own group, moved out of "پیشرفته"
           (a real complaint: these are basic, commonly-needed controls to
           fit an uploaded video inside the paper frame, not advanced/rare
           settings) and completely independent from the poster's own
           fit/scale/X/Y below - the poster used to share this same inset
           with the video (a real confirmed bug: moving Media Size also
           resized the poster), now fixed at the CSS level (see
           projector.css's .proj-poster). */
        { type: "slider", path: ["projector", "mediaSize"], label: "اندازه ویدیو در قاب", help: "فقط روی ویدیو/رسانه اثر می‌گذارد - روی پوستر هیچ اثری ندارد.", min: 60, max: 100, step: 2, unit: "%", group: "اندازه و جایگاه ویدیو" },
        { type: "slider", path: ["projector", "centerX"], label: "جایگاه افقی ویدیو", min: 20, max: 80, step: 1, unit: "%", group: "اندازه و جایگاه ویدیو" },
        { type: "slider", path: ["projector", "centerY"], label: "جایگاه عمودی ویدیو", min: 20, max: 80, step: 1, unit: "%", group: "اندازه و جایگاه ویدیو" },

        { type: "image", path: ["projector", "poster"], label: "پوستر / کاور", help: "قبل از شروع پخش نمایش داده می‌شود. اگر خالی بماند و منبع یوتیوب باشد، از تصویر بندانگشتی همان ویدیو استفاده می‌شود. هر بار که پوستر جدیدی آپلود کنی، جای‌گذاری آن به‌طور خودکار به حالت «کامل و وسط‌چین» برمی‌گردد تا نیازی به تنظیم دستی نباشد.", defaultSrc: "", buttonLabel: "انتخاب و آپلود پوستر", allowRemove: true, group: "پوستر / کاور",
          resetOnChange: [
            { path: ["projector", "posterFit"], value: "contain" },
            { path: ["projector", "posterScale"], value: 1 },
            { path: ["projector", "posterX"], value: 50 },
            { path: ["projector", "posterY"], value: 50 }
          ]
        },
        { type: "buttons", path: ["projector", "posterFit"], label: "نحوه جا شدن پوستر در قاب", help: "«نمایش کامل عکس» کل تصویر را بدون برش نشان می‌دهد - پیش‌فرض و توصیه‌شده برای بیشتر تصاویر. «پر کردن قاب» ممکن است لبه‌های تصویر را کمی ببرد.", options: [{ label: "نمایش کامل عکس", value: "contain" }, { label: "پر کردن قاب", value: "cover" }], group: "پوستر / کاور" },
        { type: "slider", path: ["projector", "posterScale"], label: "بزرگ‌نمایی پوستر (فقط برای تنظیم دستی ظریف)", min: 0.5, max: 2, step: 0.05, unit: "×", group: "پوستر / کاور" },
        { type: "slider", path: ["projector", "posterX"], label: "جای‌گذاری افقی پوستر (فقط برای تنظیم دستی ظریف)", min: 0, max: 100, step: 1, unit: "%", group: "پوستر / کاور" },
        { type: "slider", path: ["projector", "posterY"], label: "جای‌گذاری عمودی پوستر (فقط برای تنظیم دستی ظریف)", min: 0, max: 100, step: 1, unit: "%", group: "پوستر / کاور" },
        { type: "resetButton", label: "حالت پوستر را به‌هم ریختی؟", buttonLabel: "بازنشانی جایگاه پوستر", group: "پوستر / کاور",
          resetTo: [
            { path: ["projector", "posterFit"], value: "contain" },
            { path: ["projector", "posterScale"], value: 1 },
            { path: ["projector", "posterX"], value: 50 },
            { path: ["projector", "posterY"], value: 50 }
          ]
        },

        { type: "text", path: ["projector", "title", "text"], label: "عنوان بالای قاب", help: "همیشه از لحظه ورود تا پایان مرحله پروژکتور روی صفحه می‌ماند.", group: "متن‌ها: قبل از پخش" },
        { type: "slider", path: ["projector", "title", "fontSize"], label: "عنوان: اندازه فونت", min: 12, max: 32, step: 1, unit: "px", group: "متن‌ها: قبل از پخش" },
        { type: "color", path: ["projector", "title", "color"], label: "عنوان: رنگ", group: "متن‌ها: قبل از پخش" },
        { type: "slider", path: ["projector", "title", "opacity"], label: "عنوان: شفافیت", min: 0.2, max: 1, step: 0.05, unit: "", group: "متن‌ها: قبل از پخش" },
        { type: "text", path: ["projector", "playButtonText"], label: "متن دکمه شروع ویدیو", help: "روی پوستر، قبل از شروع پخش نمایش داده می‌شود.", group: "متن‌ها: قبل از پخش" },

        /* Cover/pre-play CTA - the ONE exception to the global action
           style below (Module 7/8): its own compact, fully independent
           set of controls, since it belongs to a different visual moment
           (an invitation painted over a still poster). */
        { type: "slider", path: ["projector", "coverCta", "fontSize"], label: "اندازه متن", min: 12, max: 20, step: 1, unit: "px", group: "ظاهر دکمه شروع روی کاور" },
        { type: "color", path: ["projector", "coverCta", "textColor"], label: "رنگ متن", group: "ظاهر دکمه شروع روی کاور" },
        { type: "color", path: ["projector", "coverCta", "bgColor"], label: "رنگ پس‌زمینه", group: "ظاهر دکمه شروع روی کاور" },
        { type: "slider", path: ["projector", "coverCta", "opacity"], label: "شفافیت پس‌زمینه", min: 10, max: 90, step: 5, unit: "%", group: "ظاهر دکمه شروع روی کاور" },
        { type: "slider", path: ["projector", "coverCta", "glow"], label: "نور (Glow)", min: 0, max: 100, step: 5, unit: "%", group: "ظاهر دکمه شروع روی کاور" },
        { type: "slider", path: ["projector", "coverCta", "blur"], label: "بلر پشت دکمه", min: 0, max: 14, step: 1, unit: "px", group: "ظاهر دکمه شروع روی کاور" },
        { type: "slider", path: ["projector", "coverCta", "bgDim"], label: "تاریکی پشت کاور (اختیاری)", help: "جدا از تنظیمات بالا - فقط روی لحظه کاور/قبل از پخش اثر می‌گذارد.", min: 0, max: 60, step: 5, unit: "%", group: "ظاهر دکمه شروع روی کاور" },
        { type: "slider", path: ["projector", "coverCta", "bgBlur"], label: "بلر پشت کاور (اختیاری)", min: 0, max: 10, step: 1, unit: "px", group: "ظاهر دکمه شروع روی کاور" },

        { type: "text", path: ["projector", "loadingText"], label: "متن هنگام آماده شدن ویدیو", help: "همون لحظه‌ای که کاربر دکمه شروع را زده و ویدیو در حال آماده شدن است.", group: "متن‌ها: هنگام آماده شدن" },
        { type: "text", path: ["projector", "longLoadingText"], label: "متن وقتی آماده شدن طول می‌کشد", help: "اگر آماده شدن بیشتر از حد معمول طول بکشد، جایگزین متن بالا می‌شود و دکمه‌های تلاش دوباره/ادامه بدون فیلم هم ظاهر می‌شوند.", group: "متن‌ها: هنگام آماده شدن" },

        { type: "text", path: ["projector", "stalledText"], label: "متن هنگام گیر کردن یا قطع پخش", help: "وقتی ویدیو به‌دلیل اینترنت یا خطای پخش (حتی وسط پخش) متوقف می‌شود نمایش داده می‌شود.", group: "متن‌ها: هنگام مشکل پخش" },
        { type: "text", path: ["projector", "retryText"], label: "متن دکمه تلاش دوباره", group: "متن‌ها: هنگام مشکل پخش" },
        { type: "text", path: ["projector", "skipText"], label: "متن دکمه ادامه بدون فیلم", help: "اگر ویدیو لود نشود، کاربر می‌تواند مستقیم به مرحله پایانی برود.", group: "متن‌ها: هنگام مشکل پخش" },

        { type: "text", path: ["projector", "replayText"], label: "متن دکمه پخش دوباره", group: "متن‌ها: بعد از پایان ویدیو" },
        { type: "text", path: ["projector", "continueText"], label: "متن دکمه رفتن به مرحله بعد", help: "اگر «ادامه خودکار» خاموش باشد، تنها راه رفتن به صفحه پایانی همین دکمه است.", group: "متن‌ها: بعد از پایان ویدیو" },

        /* ONE global style for every normal action (Retry/Skip/Replay/
           Continue) - Module 6/9/10/11: changing any of these updates all
           four together, they can never end up looking different from
           each other. */
        { type: "color", path: ["projector", "action", "textColor"], label: "رنگ متن دکمه‌ها", group: "ظاهر دکمه‌های پروژکتور" },
        { type: "color", path: ["projector", "action", "bgColor"], label: "رنگ پس‌زمینه دکمه‌ها", group: "ظاهر دکمه‌های پروژکتور" },
        { type: "slider", path: ["projector", "action", "opacity"], label: "شفافیت دکمه‌ها", min: 40, max: 100, step: 5, unit: "%", group: "ظاهر دکمه‌های پروژکتور" },
        { type: "slider", path: ["projector", "action", "fontSize"], label: "اندازه متن دکمه‌ها", min: 12, max: 20, step: 1, unit: "px", group: "ظاهر دکمه‌های پروژکتور" },
        { type: "slider", path: ["projector", "action", "gap"], label: "فاصله بین دکمه‌ها", min: 6, max: 36, step: 1, unit: "px", group: "ظاهر دکمه‌های پروژکتور" },
        { type: "slider", path: ["projector", "action", "radius"], label: "گردی گوشه دکمه‌ها", min: 0, max: 24, step: 1, unit: "px", group: "ظاهر دکمه‌های پروژکتور" },
        { type: "slider", path: ["projector", "overlay", "blur"], label: "شدت بلر پشت پیام", min: 0, max: 16, step: 1, unit: "px", group: "ظاهر دکمه‌های پروژکتور" },
        { type: "slider", path: ["projector", "overlay", "dim"], label: "میزان تاریکی پشت پیام", min: 0, max: 70, step: 5, unit: "%", group: "ظاهر دکمه‌های پروژکتور" },

        { type: "color", path: ["projector", "overlay", "tint"], label: "رنگ پس‌زمینه پیام وضعیت", group: "ظاهر پیام وضعیت" },
        { type: "slider", path: ["projector", "overlay", "tintOpacity"], label: "شفافیت پس‌زمینه پیام وضعیت", min: 10, max: 90, step: 5, unit: "%", group: "ظاهر پیام وضعیت" },
        { type: "color", path: ["projector", "overlay", "textColor"], label: "رنگ متن پیام وضعیت", group: "ظاهر پیام وضعیت" },

        /* Edge Fade is a visual/layout effect (the vignette softening the
           media's edges into the frame), not playback behavior - moved
           out of "رفتار پخش" into its own appearance group. */
        { type: "slider", path: ["projector", "edgeFade"], label: "محو شدن لبه‌ها (Edge Fade)", min: 0, max: 100, step: 5, unit: "%", group: "ظاهر رسانه" },

        { type: "buttons", path: ["projector", "autoContinue"], label: "ادامه خودکار بعد از پخش", options: [{ label: "روشن", value: true }, { label: "خاموش", value: false }], group: "رفتار پایان ویدیو" },
        { type: "slider", path: ["projector", "continueDelaySec"], label: "مکث بعد از پخش", min: 0, max: 4, step: 0.1, unit: " ثانیه", group: "رفتار پایان ویدیو" },
        { type: "buttons", path: ["projector", "showReplay"], label: "نمایش «پخش دوباره» بعد از پخش", options: [{ label: "روشن", value: true }, { label: "خاموش", value: false }], group: "رفتار پایان ویدیو" },
        { type: "buttons", path: ["projector", "showSkip"], label: "نمایش «ادامه بدون فیلم» هنگام تاخیر", options: [{ label: "روشن", value: true }, { label: "خاموش", value: false }], group: "رفتار پایان ویدیو" },

        { type: "previewButtons", group: "پیش‌نمایش حالت‌ها" },

        { type: "slider", path: ["projector", "bgFillIntensity"], label: "پرکردن پس‌زمینه با بلور (اختیاری - پیش‌فرض خاموش)", min: 0, max: 100, step: 10, unit: "%", group: "پیشرفته" },
        { type: "buttons", path: ["projector", "loop"], label: "تکرار پیوسته (پیش‌فرض خاموش - فقط آپلود مستقیم)", options: [{ label: "روشن", value: true }, { label: "خاموش", value: false }], group: "پیشرفته" }
      ]
    },
    {
      id: "final",
      label: "پایانی",
      screen: { stage: "stage-final" },
      fields: [
        { type: "textarea", path: ["final", "main"], label: "خط اول پیام (تاکید بیشتر)", help: "همون لحظه‌ای که صفحه پایانی باز می‌شود دیده می‌شود.", group: "پیام پایانی (فاز اول)" },
        { type: "textarea", path: ["final", "sub"], label: "ادامه پیام", group: "پیام پایانی (فاز اول)" },
        { type: "slider", path: ["final", "offsetY"], label: "جابجایی بالا/پایین", min: -200, max: 200, step: 1, unit: "px", group: "پیام پایانی (فاز اول)" },
        { type: "slider", path: ["final", "mainFontSize"], label: "اندازه فونت خط اول", min: 20, max: 60, step: 1, unit: "px", group: "پیام پایانی (فاز اول)" },
        { type: "slider", path: ["final", "wordSpacing"], label: "فاصله کلمات", min: 0, max: 20, step: 1, unit: "px", group: "پیام پایانی (فاز اول)" },

        { type: "slider", path: ["final", "phase2DelaySec"], label: "تاخیر قبل از نمایش اعتبار", min: 1, max: 15, step: 0.5, unit: " ثانیه", help: "چند ثانیه بعد از باز شدن صفحه پایانی، پیام بالا محو می‌شود و اعتبار/شبکه‌های اجتماعی جایگزینش می‌شود.", group: "اعتبار و شبکه‌های اجتماعی (فاز دوم)" },
        { type: "text", path: ["final", "signature"], label: "متن اعتبار (زیر پیام اصلی)", group: "اعتبار و شبکه‌های اجتماعی (فاز دوم)" },
        { type: "slider", path: ["final", "signatureOffsetY"], label: "فاصله اعتبار تا بالای بخش", min: 20, max: 240, step: 2, unit: "px", group: "اعتبار و شبکه‌های اجتماعی (فاز دوم)" },
        { type: "slider", path: ["final", "signatureFontSize"], label: "اندازه فونت اعتبار", min: 10, max: 64, step: 1, unit: "px", help: "در صفحه‌های کوچک، اگر عدد انتخابی خیلی بزرگ باشد به‌صورت خودکار کمی کوچک‌تر نمایش داده می‌شود تا از قاب بیرون نزند.", group: "اعتبار و شبکه‌های اجتماعی (فاز دوم)" },
        { type: "slider", path: ["final", "signatureWordSpacing"], label: "فاصله کلمات اعتبار", min: 0, max: 20, step: 1, unit: "px", group: "اعتبار و شبکه‌های اجتماعی (فاز دوم)" },
        { type: "slider", path: ["final", "socialsTopGap"], label: "فاصله بین متن اعتبار و آیکون‌ها", min: 0, max: 140, step: 2, unit: "px", group: "اعتبار و شبکه‌های اجتماعی (فاز دوم)" },
        { type: "slider", path: ["final", "socialGap"], label: "فاصله بین آیکون‌ها", min: 8, max: 70, step: 1, unit: "px", help: "یک تنظیم برای هر چهار آیکون با هم - همیشه فاصله‌شان از هم برابر می‌ماند.", group: "اعتبار و شبکه‌های اجتماعی (فاز دوم)" },
        { type: "slider", path: ["final", "socialIconSize"], label: "اندازه آیکون‌ها", min: 18, max: 56, step: 1, unit: "px", group: "اعتبار و شبکه‌های اجتماعی (فاز دوم)" },
        { type: "slider", path: ["final", "socialGlow"], label: "شدت درخشش آیکون‌ها", min: 0, max: 100, step: 5, unit: "%", group: "اعتبار و شبکه‌های اجتماعی (فاز دوم)" },
        { type: "text", path: ["final", "socials", 0, "url"], label: "لینک Kick", help: "اگر خالی بماند، آیکون نمایش داده نمی‌شود.", group: "اعتبار و شبکه‌های اجتماعی (فاز دوم)" },
        { type: "text", path: ["final", "socials", 1, "url"], label: "لینک اینستاگرام", group: "اعتبار و شبکه‌های اجتماعی (فاز دوم)" },
        { type: "text", path: ["final", "socials", 2, "url"], label: "لینک یوتیوب", group: "اعتبار و شبکه‌های اجتماعی (فاز دوم)" },
        { type: "text", path: ["final", "socials", 3, "url"], label: "لینک تلگرام", group: "اعتبار و شبکه‌های اجتماعی (فاز دوم)" }
      ]
    }
  ];

  function getPath(obj, path) {
    return path.reduce((o, k) => (o == null ? o : o[k]), obj);
  }
  function setPath(obj, path, value) {
    const parent = path.slice(0, -1).reduce((o, k) => o[k], obj);
    parent[path[path.length - 1]] = value;
  }

  let draft = api.deepClone(window.NUR_APP.getConfig());
  let activeTab = TABS[0].id;
  let panelEl = null;
  let statusTimer = null;

  function livePreview() {
    window.NUR_APP.previewConfig(api.deepClone(draft));
  }

  function setStatus(msg) {
    const el = panelEl.querySelector(".nurap-status");
    el.textContent = msg;
    el.classList.add("nurap-status--show");
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => el.classList.remove("nurap-status--show"), 2200);
  }

  const FOCUS_PREVIEW_KEY = "nurAdminFocusPreview";

  /* Purely a local admin preference (which browser/device is editing,
     not which visitor sees what) - localStorage, not sessionStorage or
     config, so it survives closing the tab but never touches the
     Wix-synced config blob or any real visitor. Defaults OFF: the canvas
     should show its true appearance unless the admin deliberately opts
     into the dimmed comparison view. */
  function getFocusPreviewPref() {
    try { return localStorage.getItem(FOCUS_PREVIEW_KEY) === "1"; } catch (err) { return false; }
  }

  function setFocusPreview(on, targetEl) {
    const el = targetEl || panelEl;
    if (!el) return;
    el.classList.toggle("nurap-focus-preview", on);
    const btn = el.querySelector('[data-action="focus-preview"]');
    if (btn) btn.textContent = "پیش‌نمایش با تمرکز: " + (on ? "روشن" : "خاموش");
    try { localStorage.setItem(FOCUS_PREVIEW_KEY, on ? "1" : "0"); } catch (err) { /* ignore */ }
  }

  function fieldRow(field) {
    const value = field.path ? getPath(draft, field.path) : undefined;
    const row = document.createElement("div");
    row.className = "nurap-row";

    if (field.label) {
      const label = document.createElement("label");
      label.className = "nurap-label";
      label.textContent = field.label;
      row.appendChild(label);
    }
    if (field.help) {
      const help = document.createElement("p");
      help.className = "nurap-help";
      help.textContent = field.help;
      row.appendChild(help);
    }

    if (field.type === "text") {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "nurap-input";
      input.value = value || "";
      input.addEventListener("input", () => {
        setPath(draft, field.path, input.value);
        livePreview();
      });
      row.appendChild(input);
    } else if (field.type === "youtubeSource") {
      // URL field + live "detected video ID" readout (Module 11) - no
      // network call, just the same extraction regex projector.js uses
      // for real playback, so what the admin sees here is exactly what
      // will actually play.
      const input = document.createElement("input");
      input.type = "text";
      input.className = "nurap-input";
      input.dir = "ltr";
      input.placeholder = "https://www.youtube.com/watch?v=...";
      input.value = value || "";

      const status = document.createElement("span");
      status.className = "nurap-value";
      status.style.cssText = "display:block; text-align:right; margin-top:2px;";

      function extractId(url) {
        if (!url) return null;
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
      function refreshStatus() {
        const id = extractId(input.value);
        status.textContent = id ? ("شناسه ویدیو شناسایی شد: " + id) : (input.value ? "لینک نامعتبر است" : "هنوز لینکی وارد نشده");
      }
      input.addEventListener("input", () => {
        setPath(draft, field.path, input.value);
        refreshStatus();
        livePreview();
      });

      // No way to clear a saved link once entered (had to overwrite the
      // whole text box, and mixed pasting a new link with clearing the old
      // one) - a plain, explicit remove button, same pattern as the
      // poster/paper-image fields' "حذف" button.
      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "nurap-btn nurap-btn--danger";
      clearBtn.style.cssText = "align-self:flex-start;";
      clearBtn.textContent = "حذف لینک";
      clearBtn.addEventListener("click", () => {
        input.value = "";
        setPath(draft, field.path, "");
        refreshStatus();
        livePreview();
      });

      refreshStatus();
      row.append(input, status, clearBtn);
    } else if (field.type === "textarea") {
      const ta = document.createElement("textarea");
      ta.className = "nurap-textarea";
      ta.rows = 4;
      ta.value = value || "";
      ta.dir = "rtl";
      ta.addEventListener("input", () => {
        setPath(draft, field.path, ta.value);
        livePreview();
      });
      row.appendChild(ta);
    } else if (field.type === "slider") {
      const sliderWrap = document.createElement("div");
      sliderWrap.className = "nurap-slider-wrap";

      const minusBtn = document.createElement("button");
      minusBtn.type = "button";
      minusBtn.className = "nurap-step-btn";
      minusBtn.textContent = "−";

      const slider = document.createElement("input");
      slider.type = "range";
      slider.className = "nurap-slider";
      slider.min = field.min;
      slider.max = field.max;
      slider.step = field.step;
      slider.value = value;

      const plusBtn = document.createElement("button");
      plusBtn.type = "button";
      plusBtn.className = "nurap-step-btn";
      plusBtn.textContent = "+";

      const valueLabel = document.createElement("span");
      valueLabel.className = "nurap-value";
      const fmt = (v) => (Number.isInteger(field.step) ? Math.round(v) : Number(v).toFixed(2)) + field.unit;
      valueLabel.textContent = fmt(value);

      function commit(newValue) {
        newValue = Math.min(field.max, Math.max(field.min, newValue));
        slider.value = newValue;
        valueLabel.textContent = fmt(newValue);
        setPath(draft, field.path, Number(newValue));
        livePreview();
      }

      slider.addEventListener("input", () => commit(Number(slider.value)));
      minusBtn.addEventListener("click", () => commit(Number(slider.value) - field.step));
      plusBtn.addEventListener("click", () => commit(Number(slider.value) + field.step));

      sliderWrap.append(minusBtn, slider, plusBtn, valueLabel);
      row.appendChild(sliderWrap);
    } else if (field.type === "image") {
      const wrap = document.createElement("div");
      wrap.style.cssText = "display:flex; align-items:center; gap:10px; flex-wrap:wrap;";

      const preview = document.createElement("img");
      preview.alt = "";
      preview.style.cssText = "width:56px; height:auto; max-height:90px; border-radius:6px; border:1px solid rgba(255,255,255,.15); background:#1c2238; object-fit:cover;";
      // Never set src="" - an empty string re-requests the current page in
      // some browsers instead of just showing nothing. No value and no
      // default just means no preview image yet (a poster is optional).
      const initialSrc = value || field.defaultSrc || "";
      preview.style.display = initialSrc ? "" : "none";
      if (initialSrc) preview.src = initialSrc;

      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "image/png,image/jpeg,image/webp";
      fileInput.style.display = "none";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "nurap-btn nurap-btn--ghost";
      btn.textContent = field.buttonLabel || "انتخاب و جایگزینی تصویر کاغذ";
      btn.addEventListener("click", () => fileInput.click());

      const status = document.createElement("span");
      status.className = "nurap-value";

      fileInput.addEventListener("change", async () => {
        const file = fileInput.files[0];
        fileInput.value = "";
        if (!file) return;
        btn.disabled = true;
        try {
          status.textContent = "در حال بهینه‌سازی...";
          const { blob, mimeType } = await optimizeImageForUpload(file);
          status.textContent = "در حال آپلود...";
          const url = await uploadPaperImage(blob, mimeType);
          setPath(draft, field.path, url);
          // A brand new image (very likely a different aspect ratio/crop
          // than whatever was there before) should look correct
          // immediately, not inherit scale/X/Y tuned for the OLD image
          // (Module 22-24: "upload -> looks good immediately -> done",
          // never "upload -> manually fix crop every time"). Only fields
          // that opted in via resetOnChange are touched - most "image"
          // fields (letter paper images) don't set this and are unaffected.
          if (field.resetOnChange) {
            field.resetOnChange.forEach((r) => setPath(draft, r.path, r.value));
          }
          preview.src = url;
          preview.style.display = "";
          livePreview();
          status.textContent = "آپلود شد ✓ (برای انتشار سراسری «ذخیره تغییرات» را بزن)";
          if (field.resetOnChange) renderTabContent();
        } catch (err) {
          status.textContent = "ناموفق: " + (err && err.message ? err.message : "خطای نامشخص");
        } finally {
          btn.disabled = false;
        }
      });

      wrap.append(preview, btn, fileInput, status);

      if (field.allowRemove) {
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "nurap-btn nurap-btn--danger";
        removeBtn.textContent = "حذف";
        removeBtn.addEventListener("click", () => {
          setPath(draft, field.path, "");
          if (field.resetOnChange) {
            field.resetOnChange.forEach((r) => setPath(draft, r.path, r.value));
          }
          preview.removeAttribute("src");
          preview.style.display = "none";
          livePreview();
          status.textContent = "حذف شد";
          if (field.resetOnChange) renderTabContent();
        });
        wrap.appendChild(removeBtn);
      }

      row.appendChild(wrap);
    } else if (field.type === "resetButton") {
      // Generic "reset these fields back to a known-good default" button
      // (Module 25 - "بازنشانی جایگاه" must restore a proper centered
      // state, never another broken one). Deliberately its own small
      // field type rather than overloading "buttons", since this doesn't
      // read/highlight a current value - it only ever fires an action.
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "nurap-btn nurap-btn--ghost";
      btn.textContent = field.buttonLabel || "بازنشانی";
      btn.addEventListener("click", () => {
        field.resetTo.forEach((r) => setPath(draft, r.path, r.value));
        livePreview();
        renderTabContent();
      });
      row.appendChild(btn);
    } else if (field.type === "buttons") {
      // Generic small button-group - used for both plain on/off toggles
      // (options: [{label,value:true},{label,value:false}]) and a
      // multi-choice pick like Projector's Preset, so this one type
      // covers both instead of two near-identical ones.
      const wrap = document.createElement("div");
      wrap.style.cssText = "display:flex; gap:6px; flex-wrap:wrap;";
      const buttons = [];
      function refresh() {
        const current = getPath(draft, field.path);
        buttons.forEach(({ btn, opt }) => {
          const active = opt.value === current;
          btn.className = "nurap-btn " + (active ? "nurap-btn--primary" : "nurap-btn--ghost");
          btn.style.flex = "0 0 auto";
        });
      }
      field.options.forEach((opt) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = opt.label;
        btn.addEventListener("click", () => {
          setPath(draft, field.path, opt.value);
          refresh();
          livePreview();
          // Other fields may be conditionally shown/hidden based on this
          // one's value (e.g. Media Source -> Uploaded/YouTube fields) -
          // a full re-render is the simplest way to keep that in sync
          // without every "buttons" field needing to know who depends on
          // it. Harmless for the (common) case where nothing does.
          if (field.rerenderOnChange) renderTabContent();
        });
        buttons.push({ btn, opt });
        wrap.appendChild(btn);
      });
      refresh();
      row.appendChild(wrap);
    } else if (field.type === "mediaManager") {
      // Persistent projector/memories media list - drag&drop or click to
      // upload image/video files (via uploadMediaFile, same Wix Media
      // Manager endpoint as the paper-image field), each becoming an
      // entry in config.projector.items. This is the ONLY place the
      // admin uploads projector media - it must be obvious, so it's
      // rendered as the first field of the Projector tab.
      const wrap = document.createElement("div");
      wrap.style.cssText = "display:flex; flex-direction:column; gap:10px;";

      const dropzone = document.createElement("div");
      dropzone.className = "nurap-dropzone";
      dropzone.textContent = "فایل‌های عکس/ویدیو را اینجا رها کن یا کلیک کن";

      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "image/*,video/*";
      fileInput.multiple = true;
      fileInput.style.display = "none";

      const status = document.createElement("span");
      status.className = "nurap-value";
      status.style.textAlign = "center";

      const list = document.createElement("div");
      list.style.cssText = "display:flex; flex-direction:column; gap:8px;";

      function renderList() {
        list.textContent = "";
        const items = getPath(draft, field.path) || [];
        if (items.length === 0) {
          const empty = document.createElement("p");
          empty.className = "nurap-empty";
          empty.textContent = "هنوز هیچ رسانه‌ای آپلود نشده.";
          list.appendChild(empty);
          return;
        }
        items.forEach((item) => {
          const row = document.createElement("div");
          row.style.cssText = "display:flex; align-items:center; gap:10px; background:rgba(255,255,255,.05); border-radius:8px; padding:6px 8px;";

          let thumb;
          if (item.type === "video") {
            thumb = document.createElement("video");
            thumb.src = item.url;
            thumb.muted = true;
          } else {
            thumb = document.createElement("img");
            thumb.src = item.url;
            thumb.alt = "";
          }
          thumb.style.cssText = "width:52px; height:38px; object-fit:cover; border-radius:6px; background:#1c2238; flex-shrink:0;";

          const name = document.createElement("span");
          name.textContent = (item.type === "video" ? "🎬 " : "🖼 ") + (item.fileName || "");
          name.style.cssText = "flex:1; font-size:12px; color:#c7ccdc; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;";

          const removeBtn = document.createElement("button");
          removeBtn.type = "button";
          removeBtn.className = "nurap-btn nurap-btn--danger";
          removeBtn.style.cssText = "flex:0 0 auto; min-width:0; padding:6px 10px;";
          removeBtn.textContent = "حذف";
          removeBtn.addEventListener("click", () => {
            const current = getPath(draft, field.path) || [];
            setPath(draft, field.path, current.filter((i) => i.id !== item.id));
            renderList();
            livePreview();
          });

          row.append(thumb, name, removeBtn);
          list.appendChild(row);
        });
      }

      async function handleFiles(files) {
        const arr = Array.from(files || []);
        if (arr.length === 0) return;
        dropzone.classList.remove("nurap-dropzone--drag");
        for (const file of arr) {
          const isVideo = file.type.startsWith("video/");
          const isImage = file.type.startsWith("image/");
          if (!isVideo && !isImage) continue;
          status.textContent = "در حال آپلود «" + file.name + "»...";
          try {
            const url = await uploadMediaFile(file);
            const current = getPath(draft, field.path) || [];
            current.push({
              id: "m" + Date.now() + Math.random().toString(36).slice(2, 8),
              type: isVideo ? "video" : "image",
              url,
              fileName: file.name,
              caption: "",
              pace: "normal",
              trimStart: 0,
              trimEnd: null
            });
            setPath(draft, field.path, current);
            renderList();
            livePreview();
          } catch (err) {
            status.textContent = "ناموفق: " + (err && err.message ? err.message : "خطای نامشخص");
            return;
          }
        }
        status.textContent = "آپلود شد ✓ (برای انتشار سراسری «ذخیره تغییرات» را بزن)";
      }

      dropzone.addEventListener("click", () => fileInput.click());
      dropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropzone.classList.add("nurap-dropzone--drag");
      });
      dropzone.addEventListener("dragleave", () => dropzone.classList.remove("nurap-dropzone--drag"));
      dropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        handleFiles(e.dataTransfer.files);
      });
      fileInput.addEventListener("change", () => {
        handleFiles(fileInput.files);
        fileInput.value = "";
      });

      renderList();
      wrap.append(dropzone, fileInput, status, list);
      row.appendChild(wrap);
    } else if (field.type === "color") {
      const wrap = document.createElement("div");
      wrap.style.cssText = "display:flex; align-items:center; gap:10px;";
      const input = document.createElement("input");
      input.type = "color";
      input.value = value || "#000000";
      input.style.cssText = "width:44px; height:32px; border:1px solid rgba(255,255,255,.15); border-radius:6px; background:#1c2238; padding:2px; cursor:pointer;";
      const valueLabel = document.createElement("span");
      valueLabel.className = "nurap-value";
      valueLabel.textContent = value;
      input.addEventListener("input", () => {
        setPath(draft, field.path, input.value);
        valueLabel.textContent = input.value;
        livePreview();
      });
      wrap.append(input, valueLabel);
      row.appendChild(wrap);
    } else if (field.type === "previewButtons") {
      // State Preview (Module 24-28) - each button is a pure call into
      // projector.js's previewState(), which only ever toggles the gate's
      // own CSS classes (the exact same ones the real state machine
      // already uses) - no config write, no real fetch, no touching
      // onDoneCallback. Requires the Projector stage to have been entered
      // at least once (previewEnter() runs automatically the moment this
      // tab is opened, via the existing tab-click -> previewStage wiring),
      // so by the time this row renders it's always ready to use.
      const hint = document.createElement("p");
      hint.className = "nurap-empty";
      hint.textContent = "برای دیدن سریع هر حالت روی دکمه‌اش بزن - چیزی ذخیره نمی‌شود.";
      row.appendChild(hint);

      const wrap = document.createElement("div");
      wrap.style.cssText = "display:flex; gap:8px; flex-wrap:wrap;";
      const states = [
        { key: "entry", label: "ورود / قبل از پخش" },
        { key: "loading", label: "بارگذاری" },
        { key: "longLoading", label: "بارگذاری طولانی" },
        { key: "stalled", label: "قطع‌شدگی / خطا" },
        { key: "ended", label: "پایان ویدیو" },
        { key: "finalTransition", label: "انتقال به صفحه پایانی" }
      ];
      states.forEach((s) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "nurap-btn nurap-btn--ghost";
        btn.style.cssText = "flex:0 0 auto; min-width:0;";
        btn.textContent = s.label;
        btn.addEventListener("click", () => {
          if (window.NUR_PROJECTOR && window.NUR_PROJECTOR.previewState) {
            window.NUR_PROJECTOR.previewState(s.key);
          }
        });
        wrap.appendChild(btn);
      });
      row.appendChild(wrap);
    }

    return row;
  }

  /* -------------------------------------------------------------------- *
   *  Drag-to-position — lets the admin click+drag a nav button directly
   *  on the live page (visible next to the panel) instead of only using
   *  sliders. Only one button can be in drag mode at a time; switching
   *  tabs or closing the panel always turns it off (see stopDrag calls
   *  in renderTabs/closePanel below).
   * ---------------------------------------------------------------------*/
  let activeDrag = null; // { tabId, cleanup() } | null

  function isDragActive(tab) {
    return !!activeDrag && activeDrag.tabId === tab.id;
  }

  function stopDrag() {
    if (activeDrag) activeDrag.cleanup();
    activeDrag = null;
    panelEl.classList.remove("nurap-drag-mode");
  }

  function startDrag(tab) {
    stopDrag();
    const el = document.getElementById(tab.dragTarget.elementId);
    const face = el && el.closest(".letter-face");
    if (!el || !face) return;
    // Let real mouse events reach the button underneath instead of being
    // swallowed by the full-viewport backdrop - see the CSS comment on
    // .nurap-drag-mode above for why this was the actual blocker.
    panelEl.classList.add("nurap-drag-mode");

    function onPointerDown(e) {
      e.preventDefault();
      const startClientX = e.clientX;
      const startClientY = e.clientY;
      const faceRect = face.getBoundingClientRect();
      const startX = getPath(draft, [...tab.dragTarget.path, "x"]);
      const startY = getPath(draft, [...tab.dragTarget.path, "y"]);
      let moved = false;
      let rafPending = false;
      let dx = 0;
      let dy = 0;

      function applyMove() {
        rafPending = false;
        if (Math.hypot(dx, dy) > 4) moved = true;
        const newX = Math.min(100, Math.max(0, startX + (dx / faceRect.width) * 100));
        const newY = Math.min(100, Math.max(0, startY + (dy / faceRect.height) * 100));
        setPath(draft, [...tab.dragTarget.path, "x"], Number(newX.toFixed(1)));
        setPath(draft, [...tab.dragTarget.path, "y"], Number(newY.toFixed(1)));
        livePreview();
      }

      function onMove(ev) {
        dx = ev.clientX - startClientX;
        dy = ev.clientY - startClientY;
        if (!rafPending) {
          rafPending = true;
          requestAnimationFrame(applyMove);
        }
      }

      function onUp() {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        if (moved) {
          // The click that follows this same press/release would normally
          // navigate the page - swallow exactly that one click so dragging
          // never also "clicks through" to the next stage. A plain click
          // (drag mode on, but never actually moved) is left alone, so the
          // button still works normally when the admin isn't dragging it.
          const blockClick = (ce) => {
            ce.preventDefault();
            ce.stopImmediatePropagation();
            el.removeEventListener("click", blockClick, true);
          };
          el.addEventListener("click", blockClick, true);
        }
        refreshAllFields();
      }

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp, { once: true });
    }

    el.addEventListener("pointerdown", onPointerDown);
    activeDrag = { tabId: tab.id, cleanup: () => el.removeEventListener("pointerdown", onPointerDown) };
  }

  function dragToggleRow(tab) {
    const row = document.createElement("div");
    row.className = "nurap-row";
    const btn = document.createElement("button");
    btn.type = "button";
    const active = isDragActive(tab);
    btn.className = "nurap-btn " + (active ? "nurap-btn--primary" : "nurap-btn--ghost");
    btn.textContent = active
      ? "جابجایی با ماوس فعال است - روی دکمه در صفحه بکش (برای خاموش کردن دوباره بزن)"
      : "فعال‌سازی جابجایی با ماوس برای این دکمه";
    btn.addEventListener("click", () => {
      if (isDragActive(tab)) stopDrag();
      else startDrag(tab);
      renderTabContent();
    });
    row.appendChild(btn);
    return row;
  }

  // Fields carrying a `group:"..."` label (Module 20: "collapsible
  // categories instead of nested tabs") get rendered under a named,
  // independently collapsible header instead of one flat wall of
  // controls - generic over any tab that uses it, not just Projector's.
  // Ungrouped fields (every other existing tab) render exactly as before,
  // flat, no header - fully backward compatible. Open/closed state is
  // per-group-name and resets on every tab switch (see renderTabs' click
  // handler) rather than persisting, since re-opening the panel should
  // always start from the same predictable layout. "پیشرفته" (Advanced)
  // starts closed - everything else starts open, since hiding routine
  // controls behind a click would defeat "fast to configure".
  let openGroups = {};

  function isGroupOpen(name) {
    if (!(name in openGroups)) openGroups[name] = name !== "پیشرفته";
    return openGroups[name];
  }

  // Fields can carry `showIf:{path,equals}` to hide themselves when
  // another field's current draft value doesn't match - e.g. the YouTube
  // URL field only makes sense when Media Source is actually "youtube".
  // Purely a rendering filter; the underlying config value is untouched
  // either way (Module 16 - switching source never deletes the other
  // source's data).
  function fieldVisible(field) {
    if (!field.showIf) return true;
    return getPath(draft, field.showIf.path) === field.showIf.equals;
  }

  function renderTabContent() {
    const body = panelEl.querySelector(".nurap-body");
    body.textContent = "";
    const tab = TABS.find((t) => t.id === activeTab);
    if (tab.fields.length === 0) {
      const empty = document.createElement("p");
      empty.className = "nurap-empty";
      empty.textContent = "برای این بخش هنوز تنظیمی وجود ندارد.";
      body.appendChild(empty);
      return;
    }
    if (tab.dragTarget) body.appendChild(dragToggleRow(tab));

    const visibleFields = tab.fields.filter(fieldVisible);
    const groups = []; // [{name, fields}], name === null for ungrouped (rendered flat, first)
    visibleFields.forEach((field) => {
      const name = field.group || null;
      let g = groups.find((x) => x.name === name);
      if (!g) { g = { name, fields: [] }; groups.push(g); }
      g.fields.push(field);
    });

    groups.forEach((g) => {
      if (g.name === null) {
        g.fields.forEach((field) => body.appendChild(fieldRow(field)));
        return;
      }
      const open = isGroupOpen(g.name);
      const headerRow = document.createElement("div");
      headerRow.className = "nurap-row";
      const headerBtn = document.createElement("button");
      headerBtn.type = "button";
      headerBtn.className = "nurap-group-header";
      headerBtn.textContent = (open ? "▾ " : "◂ ") + g.name;
      headerBtn.addEventListener("click", () => {
        openGroups[g.name] = !open;
        renderTabContent();
      });
      headerRow.appendChild(headerBtn);
      body.appendChild(headerRow);
      if (open) g.fields.forEach((field) => body.appendChild(fieldRow(field)));
    });
  }

  function renderTabs() {
    const tabsEl = panelEl.querySelector(".nurap-tabs");
    tabsEl.textContent = "";
    TABS.forEach((tab) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "nurap-tab" + (tab.id === activeTab ? " nurap-tab--active" : "");
      btn.textContent = tab.label;
      btn.addEventListener("click", () => {
        stopDrag();
        activeTab = tab.id;
        openGroups = {};
        renderTabs();
        renderTabContent();
        // Jump the live preview behind the panel to match this tab, so
        // editing doesn't require manually clicking through the whole
        // flow every time - admin/preview only, never wired to anything
        // a normal visitor can trigger.
        if (tab.screen) window.NUR_APP.previewStage(tab.screen.stage, tab.screen.letterPage);
      });
      tabsEl.appendChild(btn);
    });
  }

  function refreshAllFields() {
    renderTabs();
    renderTabContent();
  }

  const ADMIN_PW_KEY = "nurAdminPw";

  /* Shared by pushConfigGlobal (below) and the paper-image upload flow -
     one password, cached in this tab's sessionStorage only (cleared when
     the tab closes), never shipped in this file. Returns null if the
     admin cancels the prompt. */
  function getAdminPassword() {
    let password = sessionStorage.getItem(ADMIN_PW_KEY);
    if (!password) {
      password = window.prompt("رمز مدیریت را وارد کن:");
      if (!password) return null;
      sessionStorage.setItem(ADMIN_PW_KEY, password);
    }
    return password;
  }

  /* Pushes the saved config to the shared Wix endpoint so every future
     visitor gets it, not just this browser. The Wix backend is what
     actually checks the password (see DEPLOY.md). If this fails for any
     reason, the local save above has already happened, so the admin never
     loses their edit - they just get told the global publish didn't go
     through, instead of a false "done". */
  async function pushConfigGlobal(config) {
    const password = getAdminPassword();
    if (!password) {
      setStatus("فقط به‌صورت محلی ذخیره شد (رمز وارد نشد)");
      return;
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(api.REMOTE_CONFIG_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, config }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (res.status === 401) {
        sessionStorage.removeItem(ADMIN_PW_KEY); // wrong password - don't keep reusing a bad one
        setStatus("رمز اشتباه است - فقط محلی ذخیره شد");
        return;
      }
      if (!res.ok) throw new Error("nurConfig POST returned " + res.status);
      setStatus("ذخیره شد ✓ (سراسری برای همه)");
    } catch (err) {
      setStatus("ذخیره محلی شد، اما انتشار سراسری ناموفق بود");
    }
  }

  /* Paper-image upload (letterPage1/2/3's "Paper Image" control). Runs
     entirely in the admin's own browser except the final upload call -
     never touches configJson with image bytes, only the resulting Wix
     Media Manager URL ends up in config, via the normal Save flow. */

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = () => reject(new Error("خواندن فایل ناموفق بود"));
      reader.readAsDataURL(blob);
    });
  }

  /* WebP files are assumed already optimized (e.g. re-uploading a paper
     that was itself exported as WebP) and pass through untouched, so they
     are never re-compressed a second time. PNG/JPG go through a canvas at
     quality 0.93 - within the requested 90-95 range - sized to the
     source image's own natural pixel dimensions (never resized/cropped,
     since a taller or shorter paper is the whole point of this control)
     and with the canvas's normal transparent background, so alpha carries
     straight through for images that have it. */
  async function optimizeImageForUpload(file) {
    if (file.type === "image/webp") {
      return { blob: file, mimeType: "image/webp" };
    }
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("تبدیل تصویر به WebP ناموفق بود"))), "image/webp", 0.93);
    });
    return { blob, mimeType: "image/webp" };
  }

  async function uploadPaperImage(blob, mimeType) {
    const password = getAdminPassword();
    if (!password) throw new Error("رمز وارد نشد");
    const base64 = await blobToBase64(blob);
    const ext = mimeType === "image/webp" ? "webp" : mimeType === "image/png" ? "png" : "jpg";
    const fileName = "nur-paper-" + Date.now() + "." + ext;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);
    let res;
    try {
      res = await fetch(api.REMOTE_UPLOAD_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, fileName, mimeType, base64 }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }
    if (res.status === 401) {
      sessionStorage.removeItem(ADMIN_PW_KEY);
      throw new Error("رمز اشتباه است");
    }
    if (!res.ok) throw new Error("آپلود ناموفق (" + res.status + ")");
    const data = await res.json();
    if (!data.ok || !data.url) throw new Error(data.error || "پاسخ نامعتبر از سرور");
    return data.url;
  }

  /* Projector media upload (image or video) - a DIRECT-to-Wix-Media-Manager
     upload, not a proxy through our own function like the paper-image
     field uses. That proxy approach (send the whole file as base64 inside
     one JSON POST to our own Velo function) is fine for a re-encoded
     WebP paper image (tiny), but a real video is commonly tens of MB,
     which blows past Wix HTTP functions' own request-size ceiling and
     fails as an opaque "Failed to fetch" with zero bytes transferred -
     confirmed against the live endpoint. So this instead:
       1) asks our function for a signed upload URL only (password-gated,
          tiny JSON request - no size limit issue since no file bytes
          are in it), then
       2) PUTs the raw file straight from this browser to that Wix URL -
          exactly the flow Wix documents for external clients - so the
          file's bytes never pass through our own function at all.
     Only the resulting Wix Media Manager URL is ever stored in
     config.projector.items - never raw bytes, never a local blob URL -
     so it persists globally through the normal Save flow. Requires the
     nurUploadUrl backend function - see DEPLOY.md. */
  async function uploadMediaFile(file) {
    const password = getAdminPassword();
    if (!password) throw new Error("رمز وارد نشد");
    const mimeType = file.type || "application/octet-stream";
    const extFromName = (file.name.split(".").pop() || "").toLowerCase();
    const ext = extFromName || (mimeType.split("/")[1] || "bin");
    const fileName = "nur-projector-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;

    let urlRes;
    try {
      urlRes = await fetch(api.REMOTE_UPLOAD_URL_DIRECT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, fileName, mimeType })
      });
    } catch (err) {
      // A missing Wix function (not yet added - see DEPLOY.md) and a real
      // network drop both surface as this same generic browser error
      // (no CORS headers come back from a route Wix doesn't recognize),
      // so the message covers both rather than guessing which one it is.
      throw new Error("اتصال به سرور آپلود برقرار نشد - اگر تازه این قابلیت را اضافه کرده‌ای، مطمئن شو تابع nurUploadUrl طبق DEPLOY.md روی Wix اضافه و منتشر شده");
    }
    if (urlRes.status === 401) {
      sessionStorage.removeItem(ADMIN_PW_KEY);
      throw new Error("رمز اشتباه است");
    }
    if (!urlRes.ok) throw new Error("دریافت آدرس آپلود ناموفق (" + urlRes.status + ")");
    const urlData = await urlRes.json();
    if (!urlData.ok || !urlData.uploadUrl) throw new Error(urlData.error || "پاسخ نامعتبر از سرور");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000);
    let putRes;
    try {
      putRes = await fetch(urlData.uploadUrl + "?filename=" + encodeURIComponent(fileName), {
        method: "PUT",
        headers: { "Content-Type": mimeType },
        body: file,
        signal: controller.signal
      });
    } catch (err) {
      throw new Error("آپلود فایل به سرور رسانه ناموفق بود");
    } finally {
      clearTimeout(timeoutId);
    }
    if (!putRes.ok) throw new Error("آپلود فایل ناموفق (" + putRes.status + ")");
    const putData = await putRes.json();
    if (!putData || !putData.file || !putData.file.url) throw new Error("پاسخ نامعتبر از سرور رسانه");
    return putData.file.url;
  }

  function doSave() {
    api.saveConfig(draft);
    window.NUR_APP.applyConfig(api.deepClone(draft));
    setStatus("ذخیره شد ✓");
    pushConfigGlobal(api.deepClone(draft));
  }

  function doResetSection() {
    // A tab can span more than one config section (e.g. "letter" has both
    // letterName and letterPage1) - reset every distinct section that tab
    // actually shows fields for, not just the first one.
    const tab = TABS.find((t) => t.id === activeTab);
    const sectionKeys = [...new Set(tab.fields.filter((f) => f.path).map((f) => f.path[0]))];
    if (sectionKeys.length === 0) return;
    sectionKeys.forEach((sectionKey) => {
      if (sectionKey === "streamerName") {
        draft.streamerName = api.DEFAULT_CONFIG.streamerName;
      } else {
        draft[sectionKey] = api.deepClone(api.DEFAULT_CONFIG[sectionKey]);
      }
    });
    api.saveConfig(draft);
    window.NUR_APP.applyConfig(api.deepClone(draft));
    refreshAllFields();
    setStatus("این بخش به حالت پیش‌فرض برگشت");
  }

  function doResetAll() {
    draft = api.deepClone(api.DEFAULT_CONFIG);
    api.clearConfig();
    window.NUR_APP.applyConfig(api.deepClone(draft));
    refreshAllFields();
    setStatus("همه چیز به حالت پیش‌فرض برگشت");
  }

  function doExport() {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nur-config.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus("فایل تنظیمات دانلود شد");
  }

  function doImportFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        draft = api.mergeWithDefaults(parsed);
        api.saveConfig(draft);
        window.NUR_APP.applyConfig(api.deepClone(draft));
        refreshAllFields();
        setStatus("تنظیمات وارد شد و ذخیره شد ✓");
      } catch (err) {
        setStatus("فایل نامعتبر است");
      }
    };
    reader.readAsText(file);
  }

  function buildPanel() {
    const el = document.createElement("div");
    el.id = "nurAdminPanel";
    el.innerHTML = `
      <style>
        #nurAdminPanel{
          position:fixed; inset:0; z-index:99999;
          display:none;
          font-family:Tahoma,Arial,sans-serif;
          direction:rtl;
        }
        #nurAdminPanel.nurap-open{display:block}
        /* The backdrop covers the WHOLE viewport (inset:0) purely so a
           click outside the 360px panel strip closes it - it does NOT
           darken the live canvas by default. This is a live visual
           editor, not a modal dialog: while editing Projector/Countdown/
           Letters/Colors/Sky/Final, the canvas must render at its true
           brightness or every visual judgment made while the panel is
           open is wrong. See .nurap-focus-preview below for the one
           opt-in exception. */
        #nurAdminPanel .nurap-backdrop{
          position:absolute; inset:0;
          background:transparent;
          transition:background .25s ease;
        }
        /* Optional "Focus Preview" (header toggle, OFF by default,
           persisted in localStorage) - for the rare case a mild dim
           actually helps judge the Projector/countdown glow against a
           darker frame of reference. Even ON, this stays subtle (.35,
           lighter than the old always-on .55) and is never forced. */
        #nurAdminPanel.nurap-focus-preview .nurap-backdrop{
          background:rgba(6,10,22,.35);
        }
        /* The backdrop covers the WHOLE viewport (inset:0) so clicking
           anywhere outside the panel closes it - but that also means it
           sits on top of the live page everywhere except the panel's own
           360px strip, silently swallowing real mouse events aimed at a
           nav button during drag mode (this was the actual reason drag
           never worked for real mouse input, even though it worked fine
           when tested by dispatching events directly at the button in
           script - dispatchEvent bypasses hit-testing, a real click does
           not). While drag mode is on, let clicks pass straight through
           the backdrop to the page underneath; the panel sidebar itself
           is a separate element and keeps working normally. */
        #nurAdminPanel.nurap-drag-mode .nurap-backdrop{pointer-events:none}
        #nurAdminPanel .nurap-panel{
          position:absolute; top:0; left:0; bottom:0;
          width:min(360px,92vw);
          background:#12172a;
          color:#eef0f6;
          border-inline-end:1px solid rgba(255,255,255,.09);
          box-shadow:6px 0 32px rgba(0,0,0,.5);
          display:flex; flex-direction:column;
          font-size:13px;
        }
        #nurAdminPanel .nurap-header{
          display:flex; align-items:center; justify-content:space-between;
          gap:8px;
          padding:14px 16px; border-bottom:1px solid rgba(255,255,255,.08);
        }
        #nurAdminPanel .nurap-title{font-size:14px; font-weight:700}
        #nurAdminPanel .nurap-header-actions{display:flex; align-items:center; gap:10px}
        #nurAdminPanel .nurap-focus-toggle{
          background:rgba(255,255,255,.06); color:#aab0c4; border:0; border-radius:999px;
          padding:5px 10px; font-size:11px; cursor:pointer; font-family:inherit; white-space:nowrap;
        }
        #nurAdminPanel.nurap-focus-preview .nurap-focus-toggle{background:#8fc19a; color:#0f2015; font-weight:700}
        #nurAdminPanel .nurap-close{
          background:none; border:0; color:#aab0c4; cursor:pointer; font-size:18px; line-height:1;
          padding:4px 8px;
        }
        #nurAdminPanel .nurap-close:hover{color:#fff}
        #nurAdminPanel .nurap-tabs{
          display:flex; flex-wrap:wrap; gap:6px; padding:10px 14px;
          border-bottom:1px solid rgba(255,255,255,.08);
        }
        #nurAdminPanel .nurap-tab{
          background:rgba(255,255,255,.06); color:#c7ccdc; border:0; border-radius:999px;
          padding:6px 12px; font-size:12px; cursor:pointer; font-family:inherit;
        }
        #nurAdminPanel .nurap-tab--active{background:#8fc19a; color:#0f2015; font-weight:700}
        #nurAdminPanel .nurap-body{
          flex:1; overflow-y:auto; padding:14px 16px; display:flex; flex-direction:column; gap:14px;
        }
        #nurAdminPanel .nurap-empty{color:#8b91a8; font-size:12px}
        #nurAdminPanel .nurap-group-header{
          width:100%; text-align:right; background:rgba(255,255,255,.05); color:#c7ccdc;
          border:0; border-radius:8px; padding:8px 12px; font-size:12px; font-weight:700;
          cursor:pointer; font-family:inherit;
        }
        #nurAdminPanel .nurap-group-header:hover{background:rgba(255,255,255,.09)}
        #nurAdminPanel .nurap-row{display:flex; flex-direction:column; gap:6px}
        #nurAdminPanel .nurap-label{color:#c7ccdc; font-size:12px}
        #nurAdminPanel .nurap-help{color:#8b91a8; font-size:11px; line-height:1.5; margin:-2px 0 0}
        #nurAdminPanel .nurap-input{
          background:#1c2238; border:1px solid rgba(255,255,255,.12); color:#fff;
          border-radius:8px; padding:8px 10px; font-size:13px; font-family:inherit;
        }
        #nurAdminPanel .nurap-textarea{
          background:#1c2238; border:1px solid rgba(255,255,255,.12); color:#fff;
          border-radius:8px; padding:8px 10px; font-size:13px; font-family:inherit;
          resize:vertical; line-height:1.6;
        }
        #nurAdminPanel .nurap-slider-wrap{display:flex; align-items:center; gap:8px}
        #nurAdminPanel .nurap-slider{flex:1; accent-color:#8fc19a}
        #nurAdminPanel .nurap-step-btn{
          width:26px; height:26px; border-radius:6px; border:1px solid rgba(255,255,255,.15);
          background:#1c2238; color:#fff; cursor:pointer; font-size:15px; line-height:1;
          display:flex; align-items:center; justify-content:center; flex-shrink:0;
        }
        #nurAdminPanel .nurap-step-btn:hover{background:#252c47}
        #nurAdminPanel .nurap-value{
          min-width:56px; text-align:left; font-variant-numeric:tabular-nums; font-size:12px; color:#c7ccdc;
        }
        #nurAdminPanel .nurap-footer{
          padding:12px 16px; border-top:1px solid rgba(255,255,255,.08);
          display:flex; flex-wrap:wrap; gap:8px;
        }
        #nurAdminPanel .nurap-btn{
          flex:1; min-width:calc(50% - 4px); border:0; border-radius:8px; padding:9px 8px;
          font-size:12px; font-weight:600; cursor:pointer; font-family:inherit;
        }
        #nurAdminPanel .nurap-btn--primary{background:#8fc19a; color:#0f2015}
        #nurAdminPanel .nurap-btn--ghost{background:rgba(255,255,255,.08); color:#eef0f6}
        #nurAdminPanel .nurap-btn--danger{background:rgba(220,120,120,.18); color:#f3c9c9}
        #nurAdminPanel .nurap-status{
          text-align:center; font-size:12px; color:#aee0b4; height:0; overflow:hidden;
          transition:opacity .3s ease; opacity:0;
        }
        #nurAdminPanel .nurap-status--show{height:auto; opacity:1; padding-top:6px}
        #nurAdminPanel .nurap-dropzone{
          border:2px dashed rgba(255,255,255,.25); border-radius:10px;
          padding:18px 10px; text-align:center; font-size:12px; color:#c7ccdc;
          cursor:pointer; transition:border-color .2s ease, background .2s ease;
        }
        #nurAdminPanel .nurap-dropzone:hover{border-color:rgba(143,193,154,.6)}
        #nurAdminPanel .nurap-dropzone--drag{border-color:#8fc19a; background:rgba(143,193,154,.1)}
      </style>
      <div class="nurap-backdrop"></div>
      <div class="nurap-panel">
        <div class="nurap-header">
          <span class="nurap-title">پنل کنترل نور</span>
          <div class="nurap-header-actions">
            <button type="button" class="nurap-focus-toggle" data-action="focus-preview">پیش‌نمایش با تمرکز: خاموش</button>
            <button type="button" class="nurap-close" aria-label="بستن">✕</button>
          </div>
        </div>
        <!-- TEMPORARY - remove once the local-vs-deployed mismatch is
             confirmed resolved. Proves which physical build a given
             browser tab actually loaded. -->
        <div style="padding:4px 16px; font-size:10px; color:#6f7690; text-align:center; border-bottom:1px solid rgba(255,255,255,.06);">NUR BUILD: PROJECTOR-INTEGRATION-1</div>
        <div class="nurap-tabs"></div>
        <div class="nurap-body"></div>
        <div class="nurap-status"></div>
        <div class="nurap-footer">
          <button type="button" class="nurap-btn nurap-btn--primary" data-action="save">ذخیره تغییرات</button>
          <button type="button" class="nurap-btn nurap-btn--ghost" data-action="reset-section">ریست این بخش</button>
          <button type="button" class="nurap-btn nurap-btn--danger" data-action="reset-all">ریست همه چیز</button>
          <button type="button" class="nurap-btn nurap-btn--ghost" data-action="export">خروجی JSON</button>
          <button type="button" class="nurap-btn nurap-btn--ghost" data-action="import">وارد کردن JSON</button>
          <input type="file" accept="application/json" data-role="import-input" style="display:none">
        </div>
      </div>
    `;
    document.body.appendChild(el);

    const focusToggleBtn = el.querySelector('[data-action="focus-preview"]');
    focusToggleBtn.addEventListener("click", () => {
      setFocusPreview(!el.classList.contains("nurap-focus-preview"));
    });
    setFocusPreview(getFocusPreviewPref(), el);

    el.querySelector(".nurap-close").addEventListener("click", closePanel);
    el.querySelector(".nurap-backdrop").addEventListener("click", closePanel);
    el.querySelector('[data-action="save"]').addEventListener("click", doSave);
    el.querySelector('[data-action="reset-section"]').addEventListener("click", doResetSection);
    el.querySelector('[data-action="reset-all"]').addEventListener("click", doResetAll);
    el.querySelector('[data-action="export"]').addEventListener("click", doExport);
    const importInput = el.querySelector('[data-role="import-input"]');
    el.querySelector('[data-action="import"]').addEventListener("click", () => importInput.click());
    importInput.addEventListener("change", () => {
      if (importInput.files && importInput.files[0]) doImportFile(importInput.files[0]);
      importInput.value = "";
    });

    return el;
  }

  function openPanel() {
    if (!panelEl) panelEl = buildPanel();
    draft = api.deepClone(window.NUR_APP.getConfig());
    refreshAllFields();
    panelEl.classList.add("nurap-open");
  }

  function closePanel() {
    stopDrag();
    if (panelEl) panelEl.classList.remove("nurap-open");
    /* Discard any unsaved live-preview edits, reverting the page back to
       the last actually-saved config - "Save" is the only thing that
       persists, closing without saving should not leave stray changes.
       previewConfig (not applyConfig) so this itself doesn't commit. */
    window.NUR_APP.previewConfig(api.deepClone(window.NUR_APP.getConfig()));
  }

  function togglePanel() {
    if (panelEl && panelEl.classList.contains("nurap-open")) {
      closePanel();
    } else {
      openPanel();
    }
  }

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === "E" || e.key === "e")) {
      e.preventDefault();
      togglePanel();
    }
  });

  const toggleBtn = document.createElement("button");
  toggleBtn.id = "nurAdminToggle";
  toggleBtn.type = "button";
  toggleBtn.setAttribute("aria-label", "پنل کنترل");
  toggleBtn.addEventListener("click", togglePanel);
  document.body.appendChild(toggleBtn);
})();
