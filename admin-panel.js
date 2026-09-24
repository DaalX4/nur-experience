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
        { type: "text", path: ["streamerName"], label: "نام داخل متن صفحه (Streamer Name)" },
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

        { type: "slider", path: ["final", "phase2DelaySec"], label: "مدت نمایش صفحه ادامه‌دهندگان نور (تا رفتن به اعتبار)", min: 1, max: 15, step: 0.5, unit: " ثانیه", help: "چند ثانیه صفحه ادامه‌دهندگان نور نمایش داده می‌شود؛ بعد محو می‌شود و صفحه اعتبار جایگزینش می‌شود. باید به‌اندازه‌ی کافی باشد که متن‌ها خوانده شوند.", group: "مدت نمایش صفحه ادامه‌دهندگان نور" },

        { type: "buttons", path: ["projector", "audio", "enabled"], label: "پخش صدا", options: [{ label: "روشن", value: true }, { label: "خاموش", value: false }], group: "صدا" },
        { type: "slider", path: ["projector", "audio", "volume"], label: "بلندی صدا", min: 0, max: 100, step: 5, unit: "%", group: "صدا" },
        { type: "buttons", path: ["projector", "audio", "hintEnabled"], label: "نمایش یادآور صدا", options: [{ label: "روشن", value: true }, { label: "خاموش", value: false }], group: "صدا" },
        { type: "actionButton", label: "پیش‌نمایش یادآور صدا", help: "بدون نیاز به پخش ویدیو یا صبر کردن - فقط برای زمان ویرایش. روی بازدیدکننده واقعی اثری ندارد.", buttonLabel: "نمایش پیش‌نمایش", action: () => window.NUR_PROJECTOR && window.NUR_PROJECTOR.previewAudioHint(), group: "صدا" },
        { type: "text", path: ["projector", "audio", "hintText"], label: "متن یادآور صدا", group: "صدا" },
        { type: "slider", path: ["projector", "audio", "hintDuration"], label: "مدت نمایش", min: 2, max: 10, step: 0.5, unit: " ثانیه", group: "صدا" },
        { type: "slider", path: ["projector", "audio", "hintX"], label: "جای‌گذاری افقی", min: 0, max: 100, step: 1, unit: "%", group: "صدا" },
        { type: "slider", path: ["projector", "audio", "hintY"], label: "جای‌گذاری عمودی", min: 0, max: 100, step: 1, unit: "%", group: "صدا" },
        { type: "buttons", path: ["projector", "audio", "hintIconEnabled"], label: "نمایش آیکون", options: [{ label: "روشن", value: true }, { label: "خاموش", value: false }], group: "صدا" },
        { type: "slider", path: ["projector", "audio", "hintIconSize"], label: "اندازه آیکون", min: 14, max: 32, step: 1, unit: "px", group: "صدا" },
        { type: "color", path: ["projector", "audio", "hintIconColor"], label: "رنگ آیکون", group: "صدا" },
        { type: "slider", path: ["projector", "audio", "hintTextSize"], label: "اندازه متن", min: 10, max: 20, step: 1, unit: "px", group: "صدا" },
        { type: "color", path: ["projector", "audio", "hintTextColor"], label: "رنگ متن", group: "صدا" },
        { type: "slider", path: ["projector", "audio", "hintOpacity"], label: "شفافیت", min: 40, max: 100, step: 5, unit: "%", group: "صدا" },
        { type: "slider", path: ["projector", "audio", "hintGlow"], label: "شدت درخشش", min: 0, max: 100, step: 5, unit: "%", group: "صدا" },

        /* Branding/watermark on the frame - same fields as the letter pages'
           signature control, plus an on/off switch. */
        { type: "buttons", path: ["projector", "signature", "enabled"], label: "امضا/واترمارک روی قاب", options: [{ label: "روشن", value: true }, { label: "خاموش", value: false }], rerenderOnChange: true, group: "امضا/واترمارک (قاب پروژکتور)" },
        { type: "text", path: ["projector", "signature", "text"], label: "امضا/واترمارک", showIf: { path: ["projector", "signature", "enabled"], equals: true }, group: "امضا/واترمارک (قاب پروژکتور)" },
        { type: "slider", path: ["projector", "signature", "x"], label: "امضا: X (فاصله از راست)", min: 0, max: 100, step: 1, unit: "%", showIf: { path: ["projector", "signature", "enabled"], equals: true }, group: "امضا/واترمارک (قاب پروژکتور)" },
        { type: "slider", path: ["projector", "signature", "y"], label: "امضا: Y (فاصله از بالا)", min: 0, max: 100, step: 1, unit: "%", showIf: { path: ["projector", "signature", "enabled"], equals: true }, group: "امضا/واترمارک (قاب پروژکتور)" },
        { type: "slider", path: ["projector", "signature", "fontSize"], label: "امضا: اندازه فونت", min: 8, max: 30, step: 1, unit: "px", showIf: { path: ["projector", "signature", "enabled"], equals: true }, group: "امضا/واترمارک (قاب پروژکتور)" },
        { type: "slider", path: ["projector", "signature", "opacity"], label: "امضا: شفافیت", min: 0.1, max: 1, step: 0.05, unit: "", showIf: { path: ["projector", "signature", "enabled"], equals: true }, group: "امضا/واترمارک (قاب پروژکتور)" },
        { type: "slider", path: ["projector", "signature", "rotation"], label: "امضا: چرخش (اختیاری)", min: -45, max: 45, step: 1, unit: "deg", showIf: { path: ["projector", "signature", "enabled"], equals: true }, group: "امضا/واترمارک (قاب پروژکتور)" },

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
        { type: "text", path: ["projector", "longLoadingText"], label: "متن وقتی آماده شدن طول می‌کشد", help: "فقط یک پیام صبر است - دکمه‌ای نشان نمی‌دهد. اگر آماده شدن خیلی بیشتر طول بکشد، خودش به‌طور خودکار به حالت «قطع‌شدگی/خطا» زیر تبدیل می‌شود.", group: "متن‌ها: هنگام آماده شدن" },

        { type: "text", path: ["projector", "stalledText"], label: "متن هنگام گیر کردن یا قطع پخش", help: "تنها حالتی که دکمه‌های «تلاش دوباره» و «ادامه بدون فیلم» را نشان می‌دهد - وقتی ویدیو به‌دلیل اینترنت یا خطای واقعی (حتی وسط پخش) متوقف می‌شود.", group: "متن‌ها: هنگام مشکل پخش" },
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

        /* "صفحه بعد" now lives outside the frame, below it, reusing the
           letter pages' own nav-button look - these are fine-tuning only,
           the default already looks correct centered below the frame. */
        { type: "slider", path: ["projector", "nextButton", "scale"], label: "اندازه دکمه", min: 0.7, max: 1.4, step: 0.05, unit: "×", group: "دکمه «صفحه بعد» (بیرون قاب)" },
        { type: "slider", path: ["projector", "nextButton", "gap"], label: "فاصله از قاب", min: 20, max: 140, step: 2, unit: "px", group: "دکمه «صفحه بعد» (بیرون قاب)" },
        { type: "slider", path: ["projector", "nextButton", "offsetX"], label: "جای‌گذاری افقی (تنظیم ظریف)", min: -100, max: 100, step: 2, unit: "px", group: "دکمه «صفحه بعد» (بیرون قاب)" },
        { type: "slider", path: ["projector", "nextButton", "offsetY"], label: "جای‌گذاری عمودی (تنظیم ظریف)", min: -60, max: 60, step: 2, unit: "px", group: "دکمه «صفحه بعد» (بیرون قاب)" },

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
        { type: "continuersManager", label: "زنجیره‌ی ادامه‌دهندگان (مشترک بین همه‌ی استریمرها)", group: "زنجیره‌ی ادامه‌دهندگان نور (مشترک)" },
        // Same config value as the "مدت نمایش..." slider in تب "تنظیمات پروژکتور"
        // (final.phase2DelaySec) - added here too, in this section, just so it's
        // reachable while testing this page without switching tabs. One value,
        // two places to edit it; not a duplicate field.
        { type: "slider", path: ["final", "phase2DelaySec"], label: "مدت نمایش این صفحه (تا رفتن به اعتبار)", min: 1, max: 15, step: 0.5, unit: " ثانیه", help: "چند ثانیه این صفحه نمایش داده می‌شود؛ بعد محو می‌شود و صفحه اعتبار جایگزینش می‌شود.", group: "صفحه ادامه‌دهندگان نور (فاز اول)" },
        { type: "textarea", path: ["final", "continuers", "top", "text"], label: "پیام بالا", help: "خط‌های پیام را با Enter جدا کن.", group: "صفحه ادامه‌دهندگان نور (فاز اول)" },
        { type: "slider", path: ["final", "continuers", "top", "fontSize"], label: "پیام بالا: اندازه فونت", min: 12, max: 64, step: 1, unit: "px", group: "صفحه ادامه‌دهندگان نور (فاز اول)" },
        { type: "slider", path: ["final", "continuers", "top", "x"], label: "پیام بالا: جابجایی افقی (چپ / راست)", min: -240, max: 240, step: 1, unit: "px", group: "صفحه ادامه‌دهندگان نور (فاز اول)" },
        { type: "slider", path: ["final", "continuers", "top", "y"], label: "پیام بالا: جابجایی عمودی (بالا / پایین)", min: -140, max: 140, step: 1, unit: "px", group: "صفحه ادامه‌دهندگان نور (فاز اول)" },
        { type: "textarea", path: ["final", "continuers", "title", "text"], label: "عنوان", group: "صفحه ادامه‌دهندگان نور (فاز اول)" },
        { type: "slider", path: ["final", "continuers", "title", "fontSize"], label: "عنوان: اندازه فونت", min: 12, max: 64, step: 1, unit: "px", group: "صفحه ادامه‌دهندگان نور (فاز اول)" },
        { type: "slider", path: ["final", "continuers", "title", "x"], label: "عنوان: جابجایی افقی (چپ / راست)", min: -240, max: 240, step: 1, unit: "px", group: "صفحه ادامه‌دهندگان نور (فاز اول)" },
        { type: "slider", path: ["final", "continuers", "title", "y"], label: "عنوان: جابجایی عمودی (بالا / پایین)", min: -140, max: 140, step: 1, unit: "px", group: "صفحه ادامه‌دهندگان نور (فاز اول)" },
        { type: "textarea", path: ["final", "continuers", "bottom", "text"], label: "پیام پایین", group: "صفحه ادامه‌دهندگان نور (فاز اول)" },
        { type: "slider", path: ["final", "continuers", "bottom", "fontSize"], label: "پیام پایین: اندازه فونت", min: 12, max: 64, step: 1, unit: "px", group: "صفحه ادامه‌دهندگان نور (فاز اول)" },
        { type: "slider", path: ["final", "continuers", "bottom", "x"], label: "پیام پایین: جابجایی افقی (چپ / راست)", min: -240, max: 240, step: 1, unit: "px", group: "صفحه ادامه‌دهندگان نور (فاز اول)" },
        { type: "slider", path: ["final", "continuers", "bottom", "y"], label: "پیام پایین: جابجایی عمودی (بالا / پایین)", min: -140, max: 140, step: 1, unit: "px", group: "صفحه ادامه‌دهندگان نور (فاز اول)" },

        { type: "slider", path: ["final", "offsetY"], label: "جابجایی کل بخش اعتبار (بالا/پایین)", help: "فقط بخش اعتبار و شبکه‌های اجتماعی را جابجا می‌کند.", min: -200, max: 200, step: 1, unit: "px", group: "اعتبار و شبکه‌های اجتماعی (فاز دوم)" },

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

  /* ---- Multi-streamer state ----------------------------------------------
     pageSlug  = the streamer of the page being viewed ("" = the original one,
                 i.e. the /nur page - exactly the old single-streamer setup).
     adminSlug = the streamer this panel is currently EDITING. It starts equal
                 to pageSlug every time the panel opens and can be switched from
                 the Streamers bar. Save always goes to adminSlug only. */
  const pageSlug = api.SLUG || "";
  let adminSlug = pageSlug;
  let adminDisplayName = ""; // admin-list label of the streamer being edited (slug streamers only)
  function snap() { return JSON.stringify(draft) + "|" + adminDisplayName; }
  let savedSnapshot = snap();
  let streamerRows = null; // [{slug,name}] from the server, loaded when the list is opened

  function slugLink(slug) {
    return api.PUBLIC_BASE_URL + (slug || "nur");
  }

  /* Commit the draft to THIS page (local cache + what the page itself shows).
     Only when the panel is editing the page's own streamer - editing another
     streamer must never overwrite this page's cache or config. */
  function commitLocal() {
    if (adminSlug === pageSlug) {
      api.saveConfig(draft);
      window.NUR_APP.applyConfig(api.deepClone(draft));
    } else {
      window.NUR_APP.previewConfig(api.deepClone(draft));
    }
  }

  function livePreview() {
    window.NUR_APP.previewConfig(api.deepClone(draft));
    updateStreamerUi();
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
    } else if (field.type === "continuersManager") {
      row.appendChild(buildContinuersManager());
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
    } else if (field.type === "actionButton") {
      // Generic "just call this function" button - unlike resetButton,
      // doesn't touch draft/config at all. Used for the audio reminder's
      // admin-only live preview (Module 4): calling straight into
      // projector.js rather than writing/reading any config value.
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "nurap-btn nurap-btn--ghost";
      btn.textContent = field.buttonLabel || "اجرا";
      btn.addEventListener("click", () => { if (field.action) field.action(); });
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
      // 25s (was 6s): after the save itself, the server also removes
      // unused NUR media files from Wix, which can take a few seconds - a
      // 6s cap would report a failed publish for a save that succeeded.
      const timeoutId = setTimeout(() => controller.abort(), 25000);
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
      let cleanupNote = "";
      try {
        const data = await res.json();
        const mc = data && data.mediaCleanup;
        if (mc && mc.error) cleanupNote = " - پاکسازی فایل‌های قدیمی ناموفق: " + mc.error;
        else if (mc && mc.removed > 0) cleanupNote = " - " + mc.removed + " فایل قدیمی از وی‌ایکس پاک شد";
      } catch (e) { /* older backend / no JSON body: just no note */ }
      setStatus("ذخیره شد ✓ (سراسری برای همه)" + cleanupNote);
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
    commitLocal();
    setStatus("ذخیره شد ✓");
    if (adminSlug) {
      pushStreamerGlobal(adminSlug, api.deepClone(draft));
    } else {
      savedSnapshot = snap();
      pushConfigGlobal(api.deepClone(draft));
    }
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
    commitLocal();
    refreshAllFields();
    setStatus("این بخش به حالت پیش‌فرض برگشت");
  }

  function doResetAll() {
    draft = api.deepClone(api.DEFAULT_CONFIG);
    if (adminSlug === pageSlug) {
      api.clearConfig();
      window.NUR_APP.applyConfig(api.deepClone(draft));
    } else {
      window.NUR_APP.previewConfig(api.deepClone(draft));
    }
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
        commitLocal();
        refreshAllFields();
        setStatus("تنظیمات وارد شد و ذخیره شد ✓");
      } catch (err) {
        setStatus("فایل نامعتبر است");
      }
    };
    reader.readAsText(file);
  }

  /* ---- Streamers bar ---------------------------------------------------- */
  function copyText(text) {
    // The Clipboard API is blocked in a cross-origin iframe unless the parent
    // allows it, so fall back to the classic select+copy trick.
    return (async () => {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        try {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
          document.body.appendChild(ta);
          ta.select();
          const ok = document.execCommand("copy");
          ta.remove();
          return !!ok;
        } catch (err2) {
          return false;
        }
      }
    })();
  }

  function streamerDisplayName() {
    if (adminSlug && adminDisplayName) return adminDisplayName;
    return draft.streamerName || adminSlug || "پیش‌فرض";
  }

  function updateStreamerUi() {
    if (!panelEl) return;
    const badge = panelEl.querySelector('[data-role="st-badge"]');
    const save = panelEl.querySelector('[data-action="save"]');
    if (!badge || !save) return;
    const name = streamerDisplayName();
    badge.textContent = "در حال ویرایش: " + name + " — " + slugLink(adminSlug).replace(/^https?:\/\//, "");
    badge.classList.toggle("nurap-st-badge--other", adminSlug !== pageSlug);
    if (adminSlug !== pageSlug) {
      badge.textContent += "  (پیش‌نمایش روی این صفحه؛ صفحه‌ی خودش را با «باز کردن» ببین)";
    }
    save.textContent = "ذخیره برای " + name;
    const dn = panelEl.querySelector('[data-role="st-display"]');
    if (dn) {
      dn.style.display = adminSlug ? "block" : "none";
      if (document.activeElement !== dn) dn.value = adminDisplayName || "";
    }
  }

  function showStreamerInfo(text) {
    const info = panelEl.querySelector('[data-role="st-info"]');
    info.textContent = text || "";
    info.style.display = text ? "block" : "none";
  }

  function renderStreamerList() {
    const box = panelEl.querySelector('[data-role="st-list"]');
    box.textContent = "";
    const rows = [{ slug: "", name: "پیش‌فرض (اصلی) — /nur" }].concat(streamerRows || []);
    rows.forEach((r) => {
      const row = document.createElement("div");
      row.className = "nurap-st-row" + (r.slug === adminSlug ? " nurap-st-row--active" : "");
      const label = document.createElement("span");
      label.className = "nurap-st-name";
      label.textContent = r.slug ? r.name + " (" + r.slug + ")" : r.name;
      const mk = (text, fn) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "nurap-btn nurap-btn--ghost nurap-st-btn";
        b.textContent = text;
        b.addEventListener("click", fn);
        return b;
      };
      row.append(
        label,
        mk("ویرایش", () => switchStreamer(r.slug)),
        mk("باز کردن", () => window.open(slugLink(r.slug), "_blank", "noopener")),
        mk("کپی لینک", async () => setStatus((await copyText(slugLink(r.slug))) ? "لینک کپی شد" : "کپی نشد - لینک: " + slugLink(r.slug)))
      );
      box.appendChild(row);
    });
  }

  async function loadStreamerRows() {
    const password = getAdminPassword();
    if (!password) return false;
    try {
      const res = await fetch(api.REMOTE_STREAMER_LIST_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      if (res.status === 401) {
        sessionStorage.removeItem(ADMIN_PW_KEY);
        setStatus("رمز اشتباه است");
        return false;
      }
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error("list failed");
      streamerRows = data.streamers || [];
      return true;
    } catch (err) {
      setStatus("دریافت لیست استریمرها ناموفق بود");
      return false;
    }
  }

  async function toggleStreamerList() {
    const box = panelEl.querySelector('[data-role="st-list"]');
    if (box.style.display === "block") {
      box.style.display = "none";
      return;
    }
    if (!streamerRows && !(await loadStreamerRows())) return;
    renderStreamerList();
    box.style.display = "block";
  }

  async function switchStreamer(slug) {
    if (slug === adminSlug) return;
    if (snap() !== savedSnapshot && !window.confirm("تغییرات ذخیره‌نشده‌ی این استریمر از بین می‌رود. ادامه؟")) return;
    let cfg = null;
    let dispName = "";
    if (slug === pageSlug) {
      cfg = api.deepClone(window.NUR_APP.getConfig());
      dispName = slug ? await fetchStreamerName(slug) : "";
    } else {
      try {
        const url = slug ? api.REMOTE_STREAMER_URL + "?slug=" + encodeURIComponent(slug) : api.REMOTE_CONFIG_URL;
        const res = await fetch(url, { cache: "no-store" });
        const data = await res.json();
        if (slug ? data && data.found && data.config : data && data.config) cfg = api.mergeWithDefaults(data.config);
        if (slug && data && data.name) dispName = String(data.name);
      } catch (err) { /* cfg stays null */ }
    }
    if (!cfg) {
      setStatus("بارگذاری تنظیمات این استریمر ناموفق بود - چیزی عوض نشد");
      return;
    }
    adminSlug = slug;
    adminDisplayName = dispName;
    draft = cfg;
    savedSnapshot = snap();
    showStreamerInfo("");
    livePreview();
    refreshAllFields();
    renderStreamerList();
  }

  // Public read (no password): the admin-list label of a streamer, "" if unknown.
  async function fetchStreamerName(slug) {
    try {
      const res = await fetch(api.REMOTE_STREAMER_URL + "?slug=" + encodeURIComponent(slug), { cache: "no-store" });
      const data = await res.json();
      return data && data.found && data.name ? String(data.name) : "";
    } catch (err) {
      return "";
    }
  }

  /* ---- New-streamer card: one main field, everything else auto-filled ---- */
  function slugFromName(name) {
    return String(name || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30).replace(/-+$/g, "");
  }
  // Suggestion only (always editable): "BigHead_Farshid" -> "Farshid", "Ali Zodiac" -> "Ali".
  function pageNameFromName(name) {
    const n = String(name || "").trim().replace(/^@/, "");
    if (/[_-]/.test(n)) {
      const parts = n.split(/[_-]+/).filter(Boolean);
      return parts[parts.length - 1] || n;
    }
    return n.split(/\s+/)[0] || n;
  }

  let crSlugTouched = false;
  let crPageTouched = false;
  function crEls() {
    const c = panelEl.querySelector('[data-role="st-create"]');
    return {
      card: c,
      name: c.querySelector('[data-role="cr-name"]'),
      url: c.querySelector('[data-role="cr-url"]'),
      adv: c.querySelector('[data-role="cr-adv"]'),
      slug: c.querySelector('[data-role="cr-slug"]'),
      page: c.querySelector('[data-role="cr-page"]')
    };
  }
  function refreshCreateCard() {
    const e = crEls();
    const name = e.name.value.trim();
    if (!crSlugTouched) e.slug.value = slugFromName(name);
    if (!crPageTouched) e.page.value = pageNameFromName(name);
    e.url.textContent = e.slug.value ? "آدرس: " + slugLink(e.slug.value).replace(/^https?:\/\//, "") : name ? "برای این اسم آدرس انگلیسی لازم است (پیشرفته)" : "";
    if (name && !e.slug.value) e.adv.style.display = "block";
  }
  function toggleCreateCard() {
    const e = crEls();
    if (e.card.style.display === "block") {
      e.card.style.display = "none";
      return;
    }
    e.name.value = "";
    e.slug.value = "";
    e.page.value = "";
    crSlugTouched = false;
    crPageTouched = false;
    e.adv.style.display = "none";
    refreshCreateCard();
    e.card.style.display = "block";
    e.name.focus();
  }
  function submitCreateCard() {
    const e = crEls();
    createStreamer({ name: e.name.value.trim(), slug: slugFromName(e.slug.value), pageName: e.page.value.trim() });
  }

  async function createStreamer({ name, slug, pageName }) {
    if (!name) {
      setStatus("نام استریمر را بنویس");
      return;
    }
    if (!slug) {
      crEls().adv.style.display = "block";
      setStatus("آدرس انگلیسی لازم است - در بخش پیشرفته بنویس");
      return;
    }
    const password = getAdminPassword();
    if (!password) return;
    const cfg = api.deepClone(draft); // starts as a copy of the streamer you are on
    cfg.streamerName = pageName || name;
    try {
      const res = await fetch(api.REMOTE_STREAMER_CREATE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, name, slug, pageName: pageName || undefined, config: cfg })
      });
      if (res.status === 401) {
        sessionStorage.removeItem(ADMIN_PW_KEY);
        setStatus("رمز اشتباه است");
        return;
      }
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatus(data && data.needSlug ? "این آدرس قابل استفاده نیست (رزرو شده یا خالی) - آدرس دیگری بده" : "ساخت استریمر ناموفق بود");
        return;
      }
      const finalSlug = data.slug;
      const link = slugLink(finalSlug);
      const copied = await copyText(link);
      streamerRows = null; // reload next time the list is opened
      adminSlug = finalSlug;
      adminDisplayName = name;
      draft = cfg;
      savedSnapshot = snap();
      livePreview();
      refreshAllFields();
      panelEl.querySelector('[data-role="st-list"]').style.display = "none";
      crEls().card.style.display = "none";
      setStatus("استریمر ساخته شد ✓");
      showStreamerInfo(
        "لینک: " + link + (copied ? " (کپی شد)" : "") + (finalSlug !== slug ? "  (آدرس «" + slug + "» قبلاً بود؛ این آدرس ساخته شد)" : "") + "\n" +
        "مرحله‌ی وی‌ایکس: صفحه‌ی «NUR Template» را Duplicate کن ← آدرس (URL) صفحه را بگذار «" + finalSlug + "» ← Publish"
      );
    } catch (err) {
      setStatus("ساخت استریمر ناموفق بود (اتصال به سرور)");
    }
  }

  async function pushStreamerGlobal(slug, config) {
    const password = getAdminPassword();
    if (!password) {
      setStatus("ذخیره‌ی سراسری انجام نشد (رمز وارد نشد)");
      return;
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);
      const res = await fetch(api.REMOTE_STREAMER_SAVE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, slug, config, displayName: adminDisplayName || undefined }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (res.status === 401) {
        sessionStorage.removeItem(ADMIN_PW_KEY);
        setStatus("رمز اشتباه است - ذخیره‌ی سراسری انجام نشد");
        return;
      }
      if (res.status === 404) {
        setStatus("این استریمر روی سرور وجود ندارد - ذخیره‌ی سراسری انجام نشد");
        return;
      }
      if (!res.ok) throw new Error("nurStreamerSave returned " + res.status);
      let note = "";
      try {
        const data = await res.json();
        const mc = data && data.mediaCleanup;
        if (mc && mc.error) note = " - پاکسازی فایل‌های قدیمی ناموفق: " + mc.error;
        else if (mc && mc.removed > 0) note = " - " + mc.removed + " فایل قدیمی از وی‌ایکس پاک شد";
      } catch (e) { /* no JSON body */ }
      if (adminSlug === slug) savedSnapshot = snap();
      setStatus("ذخیره شد ✓ برای " + streamerDisplayName() + note);
    } catch (err) {
      setStatus("ذخیره‌ی سراسری ناموفق بود");
    }
  }

  /* ---- Shared Continuers chain manager --------------------------------------
     ONE global list for every streamer page. Every change (add / replace / remove / drag to
     reorder) is applied to the live page at once, cached locally and pushed to the shared
     endpoint (password once per session). Kick link -> name + avatar automatically; if Kick does
     not answer, name and photo can be given by hand (any image format). */
  function cmList() { return (window.NUR_APP.getContinuers() || []).map((x) => Object.assign({}, x)); }
  async function cmPush(list) {
    const password = getAdminPassword();
    if (!password) { setStatus("زنجیره فقط در این مرورگر عوض شد (رمز وارد نشد)"); return; }
    try {
      const controller = new AbortController();
      const tm = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(api.REMOTE_CONTINUERS_SAVE_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, items: list }), signal: controller.signal
      });
      clearTimeout(tm);
      if (res.status === 401) { sessionStorage.removeItem(ADMIN_PW_KEY); setStatus("رمز اشتباه است - زنجیره فقط در این مرورگر عوض شد"); return; }
      if (!res.ok) throw new Error("save " + res.status);
      setStatus("زنجیره ذخیره شد ✓ (برای همه‌ی صفحه‌ها)");
    } catch (err) {
      setStatus("ذخیره‌ی سراسری زنجیره ناموفق بود - فقط در این مرورگر عوض شد");
    }
  }
  function cmCommit(list) { window.NUR_APP.commitContinuers(list); cmPush(list); }

  function buildContinuersManager() {
    const MAXP = (window.NUR_CHAIN && window.NUR_CHAIN.MAX) || 10;
    const root = document.createElement("div");
    root.className = "nurcm";
    root.innerHTML =
      '<div class="nurcm-note">این زنجیره برای همه‌ی استریمرها مشترک است؛ هر تغییر همان لحظه روی همه‌ی صفحه‌ها ذخیره می‌شود. حداکثر ' + MAXP + ' نفر.</div>' +
      '<label>لینک کانال Kick را بچسبان</label>' +
      '<div class="nurcm-row"><input type="text" class="nurap-input" data-r="kick" dir="ltr" placeholder="https://kick.com/username"><button type="button" class="nurap-btn nurap-btn--ghost" data-r="fetch">دریافت</button></div>' +
      '<div class="nurcm-st" data-r="st"></div>' +
      '<div class="nurcm-prev" data-r="prev"><canvas data-r="pcv" width="136" height="136" title="عکس را بکش تا در وسط دایره بیفتد"></canvas><div style="flex:1;min-width:0"><label style="margin-top:0">نام</label><input type="text" class="nurap-input" data-r="pname" dir="ltr" placeholder="username"><label>بزرگنمایی</label><input type="range" data-r="pzoom" min="1" max="3" step="0.02" value="1" style="width:100%"></div></div>' +
      '<div class="nurcm-note">عکس را روی دایره بکش تا وسط بیفتد؛ اسلایدر = بزرگنمایی.</div>' +
      '<label>عکس: هر فرمتی (PNG، JPG، WebP، GIF…) - فایل، کشیدن‌ودراپ روی دایره، یا Ctrl+V</label>' +
      '<div class="nurcm-row"><input type="text" class="nurap-input" data-r="pav" dir="ltr" placeholder="https://..."><button type="button" class="nurap-btn nurap-btn--ghost" data-r="fileBtn">فایل…</button><input type="file" data-r="file" accept="image/*" style="display:none"></div>' +
      '<div class="nurcm-row"><button type="button" class="nurap-btn nurap-btn--primary" data-r="ok">افزودن</button><button type="button" class="nurap-btn nurap-btn--ghost" data-r="cancel" style="display:none">لغو</button></div>' +
      '<label>افراد فعلی <span data-r="cnt"></span></label><div data-r="list"></div>';
    const q = (n) => root.querySelector('[data-r="' + n + '"]');
    const cv = q("pcv"), c2d = cv.getContext("2d");
    let editIndex = -1, cur = { name: "", kick: "", avatar: "" }, lastSlug = "", reqId = 0, frTimer = null;
    let fr = { img: null, zoom: 1, cx: 0, cy: 0, src: "", raw: false };

    function setSt(msg, kind) { const e = q("st"); e.textContent = msg || ""; e.className = "nurcm-st" + (kind ? " " + kind : ""); }
    function slugFromLink(v) {
      v = String(v || "").trim();
      const m = v.match(/kick\.com\/([A-Za-z0-9_\-]+)/i);
      if (m) return m[1];
      return /^[A-Za-z0-9_\-]{2,40}$/.test(v) ? v : "";
    }
    /* --- framing: any photo -> one square, circle-centred crop, baked into a small WebP --- */
    function side() { return Math.min(fr.img.naturalWidth, fr.img.naturalHeight) / fr.zoom; }
    function clampFrame() {
      const s = side(), w = fr.img.naturalWidth, h = fr.img.naturalHeight;
      fr.cx = Math.max(s / 2, Math.min(w - s / 2, fr.cx)); fr.cy = Math.max(s / 2, Math.min(h - s / 2, fr.cy));
    }
    function drawFrame() {
      c2d.clearRect(0, 0, 136, 136);
      if (!fr.img) { c2d.fillStyle = "#0d1731"; c2d.fillRect(0, 0, 136, 136); return; }
      clampFrame();
      const s = side();
      c2d.drawImage(fr.img, fr.cx - s / 2, fr.cy - s / 2, s, s, 0, 0, 136, 136);
    }
    function commitFrame() {
      if (!fr.img) return;
      drawFrame();
      if (fr.raw) { cur.avatar = fr.src; return; }
      try { cur.avatar = cv.toDataURL("image/webp", 0.85); } catch (e) { cur.avatar = fr.src || ""; }
    }
    function clearAvatar() { fr = { img: null, zoom: 1, cx: 0, cy: 0, src: "", raw: false }; cur.avatar = ""; q("pzoom").value = 1; q("pav").value = ""; drawFrame(); }
    function autoFrame(img) {
      const w = img.naturalWidth, h = img.naturalHeight;
      fr.zoom = 1; fr.cx = w / 2; fr.cy = h > w * 1.05 ? h * 0.42 : h / 2; q("pzoom").value = 1;
      if ("FaceDetector" in window) {
        try {
          new window.FaceDetector({ fastMode: true, maxDetectedFaces: 3 }).detect(img).then((faces) => {
            if (!faces || !faces.length || fr.img !== img) return;
            const b = faces.map((x) => x.boundingBox).sort((a, c) => c.width * c.height - a.width * a.height)[0];
            fr.cx = b.x + b.width / 2; fr.cy = b.y + b.height / 2;
            fr.zoom = Math.max(1, Math.min(3, Math.min(w, h) / (Math.max(b.width, b.height) * 2.4)));
            q("pzoom").value = fr.zoom; commitFrame();
          }).catch(() => {});
        } catch (e) { /* no face detection here */ }
      }
    }
    function loadAvatar(src) {
      src = String(src || "").trim();
      if (!src) { clearAvatar(); return Promise.resolve(false); }
      return new Promise((resolve) => {
        const done = (img, raw) => {
          if (!img.naturalWidth) { setSt("این عکس باز نشد یا فرمتش پشتیبانی نمی‌شود", "warn"); resolve(false); return; }
          fr.img = img; fr.src = src; fr.raw = !!raw; autoFrame(img); commitFrame();
          q("pav").value = /^data:|^blob:/.test(src) ? "" : src; resolve(true);
        };
        const img = new Image();
        if (/^https?:/i.test(src)) img.crossOrigin = "anonymous";
        img.onload = () => done(img, false);
        img.onerror = () => {
          if (!/^https?:/i.test(src)) { setSt("این عکس باز نشد یا فرمتش پشتیبانی نمی‌شود", "warn"); resolve(false); return; }
          const img2 = new Image();
          img2.onload = () => done(img2, true);
          img2.onerror = () => { setSt("این عکس باز نشد", "warn"); resolve(false); };
          img2.src = src;
        };
        img.src = src;
      });
    }
    function loadFile(file) {
      if (!file) return;
      const url = URL.createObjectURL(file);
      loadAvatar(url).then((ok) => { if (ok) setSt("عکس آماده شد ✓ - در دایره جابجا/بزرگ کن", "ok"); URL.revokeObjectURL(url); });
    }
    (function dragFrame() {
      let drag = null;
      cv.addEventListener("pointerdown", (e) => { if (!fr.img || fr.raw) return; cv.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, cx: fr.cx, cy: fr.cy }; });
      cv.addEventListener("pointermove", (e) => {
        if (!drag) return;
        const k = side() / 96;
        fr.cx = drag.cx - (e.clientX - drag.x) * k; fr.cy = drag.cy - (e.clientY - drag.y) * k; drawFrame();
      });
      const end = () => { if (!drag) return; drag = null; commitFrame(); };
      cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
      q("pzoom").addEventListener("input", function () { if (!fr.img || fr.raw) return; fr.zoom = parseFloat(this.value) || 1; drawFrame(); clearTimeout(frTimer); frTimer = setTimeout(commitFrame, 120); });
    })();

    function resetForm() {
      editIndex = -1; cur = { name: "", kick: "", avatar: "" }; lastSlug = "";
      q("kick").value = ""; q("pname").value = ""; setSt(""); clearAvatar();
      q("ok").textContent = "افزودن"; q("cancel").style.display = "none";
      renderList();
    }
    function doFetch() {
      const slug = slugFromLink(q("kick").value);
      if (!slug) { setSt("لینک کیک معتبر نیست - نام و عکس را دستی وارد کن", "warn"); return; }
      const my = ++reqId;
      cur.kick = "https://kick.com/" + slug;
      if (slug !== lastSlug) { lastSlug = slug; cur.name = slug; q("pname").value = slug; clearAvatar(); }   // new person: never keep the previous picture/name
      setSt("در حال گرفتن مشخصات از Kick…");
      const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 4500);
      fetch("https://kick.com/api/v2/channels/" + encodeURIComponent(slug), { signal: ctl.signal, headers: { Accept: "application/json" } })
        .then((r) => { clearTimeout(tm); if (!r.ok) throw new Error("http " + r.status); return r.json(); })
        .then((j) => {
          if (my !== reqId) return;
          const u = j && j.user;
          if (!u) throw new Error("no user");
          cur.name = u.username || slug; q("pname").value = cur.name;
          if (u.profile_pic) {
            return loadAvatar(u.profile_pic).then((ok) => {
              if (my !== reqId) return;
              setSt(ok ? "مشخصات از Kick گرفته شد ✓ - در صورت نیاز عکس را وسط دایره تنظیم کن" : "نام گرفته شد ولی عکس باز نشد - عکس را دستی بده", ok ? "ok" : "warn");
            });
          }
          clearAvatar();
          setSt("نام گرفته شد؛ این کانال عکس پروفایل ندارد - عکس را دستی بده (فایل / کشیدن / Ctrl+V)", "warn");
        })
        .catch(() => { clearTimeout(tm); if (my !== reqId) return; setSt("خودکار گرفته نشد - نام از لینک پر شد؛ عکس را دستی بده (فایل / کشیدن / Ctrl+V)", "warn"); });
    }
    q("fetch").addEventListener("click", doFetch);
    q("kick").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doFetch(); } });
    q("kick").addEventListener("paste", () => setTimeout(doFetch, 30));
    q("pname").addEventListener("input", function () { cur.name = this.value; });
    q("pav").addEventListener("change", function () { loadAvatar(this.value); });
    q("fileBtn").addEventListener("click", () => q("file").click());
    q("file").addEventListener("change", function () { const f = this.files && this.files[0]; this.value = ""; loadFile(f); });
    const prev = q("prev");
    ["dragenter", "dragover"].forEach((ev) => prev.addEventListener(ev, (e) => { e.preventDefault(); prev.classList.add("drag"); }));
    ["dragleave", "drop"].forEach((ev) => prev.addEventListener(ev, (e) => { e.preventDefault(); prev.classList.remove("drag"); }));
    prev.addEventListener("drop", (e) => { const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) loadFile(f); });
    root.addEventListener("paste", (e) => {
      const f = e.clipboardData && e.clipboardData.files && e.clipboardData.files[0];
      if (f && /^image\//.test(f.type)) { e.preventDefault(); loadFile(f); }
    });

    q("ok").addEventListener("click", () => {
      const list = cmList();
      const name = (q("pname").value || cur.name || slugFromLink(q("kick").value) || "").trim();
      if (!name) { setSt("نام لازم است", "warn"); return; }
      const item = { id: editIndex >= 0 && list[editIndex] ? list[editIndex].id : "c" + Date.now().toString(36), name, kick: cur.kick || "", avatar: cur.avatar || "" };
      if (editIndex >= 0 && list[editIndex]) list[editIndex] = item;      // replace = update that same node
      else if (list.length < MAXP) list.push(item);
      else { setSt("حداکثر " + MAXP + " نفر", "warn"); return; }
      cmCommit(list); resetForm();
    });
    q("cancel").addEventListener("click", resetForm);

    function moveItem(from, to) {
      if (from === to) return;
      const list = cmList(), it = list.splice(from, 1)[0];
      list.splice(to, 0, it);
      if (editIndex === from) editIndex = to;
      else if (editIndex >= 0) {
        if (from < editIndex && to >= editIndex) editIndex--;
        else if (from > editIndex && to <= editIndex) editIndex++;
      }
      cmCommit(list); renderList();
    }
    function attachGrip(grip, row, from) {
      grip.addEventListener("pointerdown", (e) => {
        if (e.button !== undefined && e.button > 0) return;
        e.preventDefault();
        try { grip.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
        const rows = [].slice.call(q("list").querySelectorAll(".nurcm-item"));
        const mids = rows.map((r) => { const b = r.getBoundingClientRect(); return b.top + b.height / 2; });
        const h = row.getBoundingClientRect().height, startY = e.clientY;
        let target = from;
        row.classList.add("dragging");
        const onMove = (ev) => {
          const dy = ev.clientY - startY;
          row.style.transform = "translateY(" + dy + "px)";
          const center = mids[from] + dy;
          target = rows.filter((r, j) => j !== from && mids[j] < center).length;
          rows.forEach((r, j) => {
            if (j === from) return;
            let shift = 0;
            if (from < target && j > from && j <= target) shift = -h;
            else if (from > target && j >= target && j < from) shift = h;
            r.style.transform = shift ? "translateY(" + shift + "px)" : "";
          });
        };
        const onEnd = () => {
          grip.removeEventListener("pointermove", onMove); grip.removeEventListener("pointerup", onEnd); grip.removeEventListener("pointercancel", onEnd);
          if (target !== from) moveItem(from, target);
          else { rows.forEach((r) => { r.style.transform = ""; }); row.classList.remove("dragging"); }
        };
        grip.addEventListener("pointermove", onMove); grip.addEventListener("pointerup", onEnd); grip.addEventListener("pointercancel", onEnd);
      });
    }
    function renderList() {
      const list = cmList(), box = q("list");
      box.textContent = "";
      q("cnt").textContent = "(" + list.length + "/" + MAXP + ")";
      q("ok").disabled = editIndex < 0 && list.length >= MAXP;
      list.forEach((it, i) => {
        const row = document.createElement("div"); row.className = "nurcm-item" + (i === editIndex ? " editing" : "");
        const grip = document.createElement("span"); grip.className = "nurcm-grip"; grip.textContent = "\u22EE\u22EE"; grip.title = "بکش تا جای این نفر عوض شود";
        const im = document.createElement("img"); im.className = "nurcm-mini"; im.alt = ""; im.src = it.avatar || "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#0d1731"/></svg>');
        const nm = document.createElement("span"); nm.className = "nurcm-nm"; nm.textContent = (i + 1) + ". " + it.name;
        const rp = document.createElement("button"); rp.type = "button"; rp.className = "nurap-btn nurap-btn--ghost"; rp.textContent = "جایگزین";
        rp.addEventListener("click", () => {
          editIndex = i; cur = { name: it.name, kick: it.kick || "", avatar: it.avatar || "" };
          lastSlug = slugFromLink(it.kick || ""); q("kick").value = it.kick || ""; q("pname").value = it.name; loadAvatar(it.avatar || "");
          q("ok").textContent = "جایگزین کردن نفر " + (i + 1); q("ok").disabled = false; q("cancel").style.display = ""; setSt("");
          renderList();
        });
        const rm = document.createElement("button"); rm.type = "button"; rm.className = "nurap-btn nurap-btn--danger"; rm.textContent = "حذف";
        rm.addEventListener("click", () => {
          const l2 = cmList(); l2.splice(i, 1); cmCommit(l2);
          if (editIndex === i) resetForm(); else { if (editIndex > i) editIndex--; renderList(); }
        });
        row.append(grip, im, nm, rp, rm); box.appendChild(row);
        attachGrip(grip, row, i);
      });
      if (!list.length) box.innerHTML = '<div class="nurcm-note">هنوز کسی نیست - فقط «؟» نمایش داده می‌شود.</div>';
    }
    drawFrame(); renderList();
    return root;
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
        #nurAdminPanel .nurap-streamers{padding:8px 12px; border-bottom:1px solid rgba(255,255,255,.08); display:flex; flex-direction:column; gap:6px}
        #nurAdminPanel .nurap-st-badge{font-size:12px; font-weight:700; padding:6px 8px; border-radius:8px; background:rgba(143,193,154,.16); color:#dff3e3; line-height:1.5; direction:rtl}
        #nurAdminPanel .nurap-st-badge--other{background:rgba(224,170,60,.22); color:#ffe2a6}
        #nurAdminPanel .nurap-st-list{display:none; max-height:180px; overflow:auto; gap:4px; flex-direction:column}
        #nurAdminPanel .nurap-st-row{display:flex; align-items:center; gap:4px; padding:4px 6px; border-radius:8px; background:rgba(255,255,255,.04); flex-wrap:wrap}
        #nurAdminPanel .nurap-st-row--active{outline:1px solid rgba(143,193,154,.7)}
        #nurAdminPanel .nurap-st-name{flex:1 1 100%; font-size:12px}
        #nurAdminPanel .nurap-st-btn{flex:0 0 auto; min-width:0; padding:4px 8px; font-size:11px}
        #nurAdminPanel .nurap-st-actions{display:flex; gap:6px}
        #nurAdminPanel .nurap-st-create{display:none; flex-direction:column; gap:6px; padding:8px; border-radius:8px; background:rgba(255,255,255,.05)}
        #nurAdminPanel .nurap-st-create label{font-size:11px; opacity:.8}
        #nurAdminPanel .nurap-st-url{font-size:12px; direction:ltr; text-align:left; opacity:.9}
        #nurAdminPanel .nurap-st-adv{display:none; flex-direction:column; gap:4px}
        #nurAdminPanel .nurcm{display:flex; flex-direction:column; gap:6px}
        #nurAdminPanel .nurcm label{font-size:11.5px; opacity:.8; margin-top:4px}
        #nurAdminPanel .nurcm .nurcm-row{display:flex; gap:6px; align-items:center; flex-wrap:wrap}
        #nurAdminPanel .nurcm .nurcm-row > input[type=text]{flex:1; min-width:0}
        #nurAdminPanel .nurcm .nurcm-note{font-size:11px; opacity:.75; line-height:1.6}
        #nurAdminPanel .nurcm .nurcm-st{font-size:12px; min-height:16px; opacity:.9}
        #nurAdminPanel .nurcm .nurcm-st.ok{color:#a8dcb4} #nurAdminPanel .nurcm .nurcm-st.warn{color:#ffd58a}
        #nurAdminPanel .nurcm .nurcm-prev{display:flex; gap:10px; align-items:center; padding:8px; border-radius:10px; background:rgba(255,255,255,.04)}
        #nurAdminPanel .nurcm .nurcm-prev.drag{outline:2px dashed rgba(143,193,154,.8)}
        #nurAdminPanel .nurcm canvas{width:96px; height:96px; flex:0 0 96px; border-radius:50%; border:1px solid rgba(232,207,138,.6); background:#0d1731; cursor:grab; touch-action:none}
        #nurAdminPanel .nurcm .nurcm-item{position:relative; display:flex; align-items:center; gap:8px; padding:5px 0; border-radius:8px; transition:transform .14s ease}
        #nurAdminPanel .nurcm .nurcm-item.editing{outline:1px solid rgba(143,193,154,.6); padding:5px 6px}
        #nurAdminPanel .nurcm .nurcm-item.dragging{z-index:5; transition:none; background:rgba(40,56,100,.96); box-shadow:0 8px 22px rgba(0,0,0,.5)}
        #nurAdminPanel .nurcm .nurcm-grip{flex:0 0 18px; text-align:center; cursor:grab; user-select:none; touch-action:none; opacity:.7}
        #nurAdminPanel .nurcm .nurcm-mini{width:30px; height:30px; border-radius:50%; object-fit:cover; background:#0d1731; border:1px solid rgba(232,207,138,.5); flex:0 0 30px}
        #nurAdminPanel .nurcm .nurcm-nm{flex:1; min-width:0; direction:ltr; text-align:left; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
        #nurAdminPanel .nurap-st-info{display:none; font-size:11px; line-height:1.7; white-space:pre-line; padding:6px 8px; border-radius:8px; background:rgba(255,255,255,.06); direction:rtl; user-select:text}
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
        <div class="nurap-streamers">
          <div class="nurap-st-badge" data-role="st-badge"></div>
          <input type="text" class="nurap-input" data-role="st-display" placeholder="نام نمایشی در لیست ادمین" style="display:none">
          <div class="nurap-st-actions">
            <button type="button" class="nurap-btn nurap-btn--ghost nurap-st-btn" data-action="st-toggle">استریمرها ▾</button>
            <button type="button" class="nurap-btn nurap-btn--ghost nurap-st-btn" data-action="st-new">+ استریمر جدید</button>
          </div>
          <div class="nurap-st-create" data-role="st-create">
            <input type="text" class="nurap-input" data-role="cr-name" placeholder="نام استریمر (مثلاً BigHead_Farshid)">
            <div class="nurap-st-url" data-role="cr-url"></div>
            <button type="button" class="nurap-btn nurap-btn--ghost nurap-st-btn" data-action="cr-adv">پیشرفته ▾</button>
            <div class="nurap-st-adv" data-role="cr-adv">
              <label>آدرس صفحه (بعد از ساخت قفل می‌شود)</label>
              <input type="text" class="nurap-input" dir="ltr" data-role="cr-slug">
              <label>نام داخل متن صفحه</label>
              <input type="text" class="nurap-input" data-role="cr-page">
            </div>
            <div class="nurap-st-actions">
              <button type="button" class="nurap-btn nurap-btn--primary nurap-st-btn" data-action="cr-go">ساخت</button>
              <button type="button" class="nurap-btn nurap-btn--ghost nurap-st-btn" data-action="cr-cancel">لغو</button>
            </div>
          </div>
          <div class="nurap-st-list" data-role="st-list"></div>
          <div class="nurap-st-info" data-role="st-info"></div>
        </div>
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
    el.querySelector('[data-action="st-toggle"]').addEventListener("click", toggleStreamerList);
    el.querySelector('[data-action="st-new"]').addEventListener("click", toggleCreateCard);
    {
      const c = el.querySelector('[data-role="st-create"]');
      const nameIn = c.querySelector('[data-role="cr-name"]');
      nameIn.addEventListener("input", refreshCreateCard);
      nameIn.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); submitCreateCard(); } });
      c.querySelector('[data-role="cr-slug"]').addEventListener("input", () => { crSlugTouched = true; refreshCreateCard(); });
      c.querySelector('[data-role="cr-page"]').addEventListener("input", () => { crPageTouched = true; });
      c.querySelector('[data-action="cr-adv"]').addEventListener("click", () => {
        const adv = c.querySelector('[data-role="cr-adv"]');
        adv.style.display = adv.style.display === "block" ? "none" : "block";
      });
      c.querySelector('[data-action="cr-go"]').addEventListener("click", submitCreateCard);
      c.querySelector('[data-action="cr-cancel"]').addEventListener("click", () => { c.style.display = "none"; });
      el.querySelector('[data-role="st-display"]').addEventListener("input", (ev) => { adminDisplayName = ev.target.value; updateStreamerUi(); });
    }
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
    adminSlug = pageSlug;
    adminDisplayName = "";
    savedSnapshot = snap();
    showStreamerInfo("");
    updateStreamerUi();
    refreshAllFields();
    panelEl.classList.add("nurap-open");
    window.NUR_APP.setAdminHold(true);          // editing: the Continuers -> Credit timer is paused
    if (pageSlug) {
      fetchStreamerName(pageSlug).then((n) => {
        if (n && adminSlug === pageSlug && !adminDisplayName) {
          adminDisplayName = n;
          savedSnapshot = snap();
          updateStreamerUi();
        }
      });
    }
  }

  function closePanel() {
    stopDrag();
    if (panelEl) panelEl.classList.remove("nurap-open");
    /* Discard any unsaved live-preview edits, reverting the page back to
       the last actually-saved config - "Save" is the only thing that
       persists, closing without saving should not leave stray changes.
       previewConfig (not applyConfig) so this itself doesn't commit. */
    window.NUR_APP.previewConfig(api.deepClone(window.NUR_APP.getConfig()));
    window.NUR_APP.setAdminHold(false);         // normal timer again, from a clean start
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
