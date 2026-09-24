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

  /* Multi-streamer: the streamer's slug comes in as ?s=<slug> (nur-shell.js
     adds it from the Wix page's own address, e.g. daalvi.com/ario -> ?s=ario).
     No slug (or "nur") = the ORIGINAL single-streamer behavior, exactly as
     before: same storage key, same endpoints. A slug only switches which
     stored config is read; everything else is unchanged. */
  const NUR_SLUG = (function () {
    try {
      const s = (new URLSearchParams(location.search).get("s") || "").toLowerCase();
      return /^[a-z0-9-]{1,30}$/.test(s) && s !== "nur" ? s : "";
    } catch (err) {
      return "";
    }
  })();
  const NUR_STORAGE_KEY = NUR_SLUG ? "nurConfig.v1." + NUR_SLUG : "nurConfig.v1";

  /* Single shared endpoint for the whole config, read by every visitor on
     load and written by the admin panel's Save button (password-gated
     server-side - see DEPLOY.md). app.js and admin-panel.js both read this
     from here so there is exactly one URL to ever change. */
  const REMOTE_CONFIG_URL = "https://www.daalvi.com/_functions/nurConfig";

  /* Per-streamer endpoints (see DEPLOY.md, "Multi-streamer"). The original
     REMOTE_CONFIG_URL above keeps serving the original streamer / /nur. */
  const REMOTE_STREAMER_URL = "https://www.daalvi.com/_functions/nurStreamer";
  const REMOTE_STREAMER_LIST_URL = "https://www.daalvi.com/_functions/nurStreamerList";
  const REMOTE_STREAMER_CREATE_URL = "https://www.daalvi.com/_functions/nurStreamerCreate";
  const REMOTE_STREAMER_SAVE_URL = "https://www.daalvi.com/_functions/nurStreamerSave";
  const PUBLIC_BASE_URL = "https://www.daalvi.com/";

  /* Password-gated endpoint that uploads an (already client-side WebP-
     optimized) paper image to the Wix Media Manager and returns its public
     URL - see admin-panel.js's image field type. Only that URL is ever
     saved into config/NurConfig; the image bytes themselves never pass
     through REMOTE_CONFIG_URL or get stored there. Paper images are tiny
     (re-encoded WebP), so proxying the bytes through this one JSON POST
     is fine - see REMOTE_UPLOAD_URL_DIRECT below for anything larger. */
  const REMOTE_UPLOAD_URL = "https://www.daalvi.com/_functions/nurUploadImage";

  /* Password-gated endpoint used for projector media (images AND video,
     admin-panel.js's media-manager field). Unlike REMOTE_UPLOAD_URL, this
     one does NOT carry the file bytes - it only returns a signed Wix
     Media Manager upload URL that the browser then PUTs the raw file to
     directly. Video files are commonly tens of MB; base64-JSON-through-
     our-own-function (REMOTE_UPLOAD_URL's approach) hits Wix's HTTP
     function request-size ceiling well before that and fails with an
     opaque "Failed to fetch" - this endpoint exists specifically to keep
     large files off that path. See DEPLOY.md for the backend code. */
  const REMOTE_UPLOAD_URL_DIRECT = "https://www.daalvi.com/_functions/nurUploadUrl";

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
      signature: { text: "Daalvi", x: 8, y: 94, fontSize: 12, opacity: 0.55, rotation: 0 },
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
      signature: { text: "Daalvi", x: 8, y: 94, fontSize: 12, opacity: 0.55, rotation: 0 },
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
      signature: { text: "Daalvi", x: 8, y: 94, fontSize: 12, opacity: 0.55, rotation: 0 },
      pageNumber: { text: "3", x: 90, y: 5, fontSize: 12 }
    },

    final: {
      main: "این نور دیگه حالا پیش توئه، مراقبش باش 🌠",
      sub: "ممنون که همراه این مسیر شدی؛ امیدوارم وقتی وقتش رسید، تو هم دلیل روشن شدن شب کسی دیگه باشی ❤️",
      /* offsetY moves the WHOLE final composition (phase 1 AND phase 2)
         together - unchanged, still here for that. mainOffsetY/subOffsetY
         are independent nudges for just the top line and just the
         continuation line, on top of that - this is what actually lets
         the admin control the GAP between the two by moving either one
         on its own, instead of only being able to move them together. */
      offsetY: 0,
      /* PHASE 1 is now the "ادامه‌دهندگان نور" page (index.html's
         .continuers). Its three text blocks live here: text + fontSize (px)
         + x/y (px, right/down positive) - nothing else about that page is
         configurable. main/sub/mainFontSize/... below are LEGACY (the old
         two-line message this page replaced): kept only so an existing
         saved config still merges cleanly; nothing reads them any more. */
      continuers: {
        top:    { text: "این نور دیگه بخشی از تو شده،\nولی پایان راه نیست.", fontSize: 32, x: 0, y: 0 },
        title:  { text: "ادامه‌دهندگان نور",                                   fontSize: 23, x: 0, y: 0 },
        bottom: { text: "مسیر بعدی نور، می‌تونه با تو ادامه پیدا کنه...",       fontSize: 17, x: 0, y: 0 }
      },
      mainFontSize: 34,
      mainOffsetY: 0,
      subFontSize: 22,
      subOffsetY: 0,
      wordSpacing: 0,
      /* PHASE 2 - after phase2DelaySec, the phase-1 message above fades
         out and this credit line + the social icons below it fade in, in
         the exact same spot - ONLY this text swaps, the shared night-sky
         background/bloom never re-transitions (see app.js's
         revealSignature() and the .final-phase1/.final-phase2 rules in
         index.html/styles.css). signature/signatureOffsetY/fontSize/
         wordSpacing are the SAME fields that already existed (kept as-is
         so an already-customized live value carries over unchanged) -
         only their role/behavior changed, from "extra line appended
         below the message" to "the credit line phase 2 reveals". */
      signature: "درست شده با عشق توسط دال‌وی",
      signatureOffsetY: 96,
      signatureFontSize: 15,
      signatureWordSpacing: 0,
      phase2DelaySec: 12, /* long enough to read the continuers page (was 4 for the old two-line message) */
      /* Layout controls for the social row (Module 33-40) - deliberately
         ONE shared value per property (gap/size/glow) rather than per-icon
         controls, since the four icons must always stay evenly spaced and
         visually identical to each other. socialsTopGap is the space
         between the credit line above and this row; socialGap is the
         space BETWEEN the icons themselves (real CSS `gap`, not manual
         per-icon margins, so they can never drift out of even spacing -
         see index.html's .final-socials). Defaults reproduce the exact
         old hardcoded clamp()'d look at a typical desktop width, so
         nothing shifts for an already-live streamer until touched. */
      socialsTopGap: 40,
      socialGap: 30,
      socialIconSize: 30,
      socialGlow: 55,
      /* Four fixed slots (not a free-form list) - the icon artwork itself
         is fixed per slot (assets/icon-*.webp, hand-painted line art
         already matching the project's other decorative art), only the
         destination URL is admin-editable. An empty url hides that one
         icon rather than linking nowhere. */
      socials: [
        { icon: "kick", url: "" },
        { icon: "instagram", url: "" },
        { icon: "youtube", url: "" },
        { icon: "telegram", url: "" }
      ]
    },

    /* Countdown duration + the optional cinematic pulse on each tick.
       "seconds" replaces app.js's old hardcoded COUNTDOWN_SECONDS=30. */
    countdown: {
      seconds: 30,
      pulseEnabled: true,
      pulseIntensity: 50
    },

    /* Shared night-sky colors - drive styles.css's existing --bg-1/--bg-2/
       --star custom properties (already there, previously fixed values).
       --bg-2 is not stored separately - app.js derives a slightly deeper
       shade of skyColor automatically, so one picker still gives the
       existing two-stop gradient depth. */
    sky: {
      color: "#0a1226",
      starColor: "#fdf6e3"
    },

    /* Optional Projector/Memory stage between the countdown and the final
       page - OFF by default (see admin-panel.js). When off, app.js never
       shows the stage NOR loads projector.js's media - see the "enabled"
       check at the call site in app.js.
       preset/mediaSize/edgeFade/centerX/centerY/bgFillIntensity mirror
       the simplified Projector Focus controls from the original prototype.
       `items` is the persistent memories list - each entry
       { id, type: "image"|"video", url, fileName, caption, pace,
       trimStart, trimEnd }, uploaded via admin-panel.js's media-manager
       field (REMOTE_UPLOAD_URL, same generic Wix upload endpoint the
       paper-image field already uses) and saved into this same config
       blob, so it persists globally through the normal Save flow - never
       session-local blob URLs, never embedded as base64. */
    projector: {
      enabled: false,
      preset: "balanced",
      mediaSize: 88,
      edgeFade: 50,
      centerX: 50,
      centerY: 50,
      bgFillIntensity: 0,
      items: [],
      /* Media source mode - "upload" (default) plays config.items through
         the existing multi-item engine untouched; "youtube" is a second,
         independent path that plays exactly ONE video from youtubeUrl
         (every module describing it says "the YouTube video", never a
         list - a paste-a-link feature, not an upload queue). Switching
         source never clears the other source's data (Module 16) - only
         the active one is ever read/loaded (Module 17). */
      source: "upload",
      youtubeUrl: "",
      /* Audio - uploaded-media videos were previously hard-muted with no
         way to turn them on. enabled/volume apply ONLY to the real
         foreground video the viewer sees (never the blurred background
         "bgFillIntensity" twin, which must always stay muted - two audio
         sources for the same clip would double/echo the sound). The
         intentional Play click is the user gesture that makes audible
         playback allowed by every browser's autoplay policy - see
         projector.js's applyAudioSettings()/loadItem(). If audible
         playback is ever rejected anyway (a real, known edge case on some
         mobile browsers when the click-to-play() gap is too long),
         playback falls back to muted rather than breaking the memory,
         and a small "فعال کردن صدا" action appears (Module 7) - never
         shown when normal audible playback already worked.
         hint* fields are the small, temporary "صدا روشنه" corner
         reminder (Module 3-5) - purely cosmetic, shown for hintDuration
         seconds after playback starts (and again after Replay), never
         blocking the video. hintX/hintY are free-form % position within
         the frame (manual placement replaced the old 4-corner presets -
         not flexible enough) - default places it near the bottom-right,
         same as the old "br" preset, until the admin drags it elsewhere. */
      audio: {
        enabled: true,
        volume: 100,
        hintEnabled: true,
        hintText: "صدا روشنه",
        hintDuration: 5,
        hintIconEnabled: true,
        hintIconSize: 20,
        hintIconColor: "#f6efe0",
        hintTextColor: "#f6efe0",
        hintTextSize: 13,
        hintOpacity: 90,
        hintGlow: 30,
        hintX: 88,
        hintY: 88
      },
      /* Media blur/dim behind the gate, and the status message's own
         text/plate color - see projector.js's setOverlayActive() (blur/
         dim, toggled per gate state) and applyProjectorConfig() (tint/
         tintOpacity/textColor, static). accentColor was removed - it
         used to double as the border-tint for action buttons, which now
         have their own independent `action` styling below (Module 6/9 -
         one global action style, never borrowed from the message plate). */
      overlay: {
        blur: 6,
        dim: 30,
        tint: "#171008",
        tintOpacity: 55,
        textColor: "#f6efe0"
      },
      /* ONE shared visual style for every "normal" Projector action still
         living inside the frame - Retry, Continue-Without-Video, Replay.
         Changing these updates all three together; there is no way for
         them to accidentally end up with different colors, since they're
         all driven by exactly this one object. opacity is a percent
         (0-100) applied to the whole pill. "صفحه بعد"/Continue moved
         outside the frame (see nextButton below) and deliberately does
         NOT use this style - it reuses the letter pages' own nav-button
         look instead, since it now lives in that same "outside the card"
         visual space. */
      action: {
        textColor: "#f6efe0",
        bgColor: "#e9e2d2",
        opacity: 85,
        fontSize: 15,
        gap: 14,
        radius: 10
      },
      /* "صفحه بعد" / Continue's OWN compact fine-tuning controls (Module
         4) - gap is the space below the frame, offsetX/Y are small nudges
         on top of the natural centered position, scale is an overall size
         multiplier. Defaults reproduce a natural centered-below-frame
         placement with no adjustment needed. */
      nextButton: {
        scale: 1,
        gap: 44,
        offsetX: 0,
        offsetY: 0
      },
      /* Pre-play reveal (see projector.js's state machine): the title
         shown above the frame before the viewer taps play, and the CTA
         button's own label/appearance. The Cover CTA is the ONE
         deliberate exception to the shared `action` style above (Module
         7) - it belongs to a different visual moment (an invitation
         painted over a still poster, not a response to a problem or an
         end-of-sequence choice), so it gets its own fully independent
         color/size/glow/blur. bgDim/bgBlur are OPTIONAL extra treatment
         for the poster/backdrop behind the CTA specifically (Module 8) -
         0 by default (no effect), never shared with the loading/stalled/
         ended states' own overlay.blur/dim above. */
      title: {
        text: "چند تکه از خاطراتی که با هم ساختیم",
        fontSize: 18,
        color: "#c9cddc",
        opacity: 0.85
      },
      /* Same branding/watermark control as letterPage1/2/3's `signature`
         (text/x/y/fontSize/opacity/rotation, x = distance from the RIGHT,
         y = distance from the TOP, both % of the frame) plus an on/off
         switch. Sits on the frame's paper border, bottom-left by default
         (the bottom-right already carries the tape/flower art). */
      signature: { enabled: true, text: "Daalvi", x: 78, y: 90, fontSize: 12, opacity: 0.55, rotation: 0 },
      playButtonText: "ببینش",
      coverCta: {
        fontSize: 15,
        textColor: "#f6efe0",
        bgColor: "#141009",
        opacity: 45,
        glow: 20,
        blur: 5,
        bgDim: 0,
        bgBlur: 0
      },
      /* "" = no uploaded poster, falls back to the frame's own warm
         parchment placeholder color (never a stark white hole) - see
         projector.js/projector.css. Any other value is a Wix Media
         Manager URL from the admin panel's Poster field (same upload
         path as letterPageN's paperImage). Deliberately no automatic
         still-frame extraction from the video (heavy/unreliable in-
         browser) - a dedicated upload is the whole feature.
         posterFit/Scale/X/Y are INTENTIONALLY separate from the video's
         own centerX/centerY/mediaSize - a poster the admin uploads can
         have any arbitrary aspect ratio/crop the video doesn't, so
         tying them together meant fixing the poster's fit could only
         ever come at the cost of also shifting the live video. contain/
         50/50/1 reproduces the exact old shared-var look until the admin
         actually touches these, so nothing shifts for an existing
         streamer's already-tuned poster. */
      poster: "",
      posterFit: "contain",
      posterScale: 1,
      posterX: 50,
      posterY: 50,
      /* Every viewer-facing Projector string, editable from the admin
         panel's "متن‌های پروژکتور" section instead of hardcoded - see
         projector.js's showXGate() functions, which all read from here
         with these exact strings as fallback.
         Two clearly separate states, never mixed (a real, confirmed
         reported bug): longLoadingText is a plain "still waiting"
         message with NO actions - it isn't an error yet, just patience.
         stalledText is the actual failure/sustained-stall state, the
         ONLY one that ever shows Retry/Continue-Without-Video. If long
         loading itself drags on too long with no progress, it escalates
         into this same stalled state automatically (see projector.js's
         armLongLoadingEscalation()) - the viewer is never stuck with a
         message and no way out. */
      loadingText: "دارم آماده‌ش می‌کنم...",
      longLoadingText: "یکم بیشتر زمان می‌خواد...",
      stalledText: "اتصال قطع شد",
      retryText: "دوباره تلاش کن",
      skipText: "ادامه بدون فیلم",
      replayText: "پخش دوباره",
      continueText: "ادامه",
      /* What happens once the last memory finishes: hold the last frame
         for continueDelaySec (the "brief emotional pause" - always
         happens, auto or not), then EITHER auto-advance to Final
         (autoContinue true) OR reveal the calm reaction gate - Replay +
         ادامه - and wait indefinitely for a manual tap (autoContinue
         false, now the DEFAULT - a streamer needs room to react to a
         memory on stream, not a silent jump to the next scene).
         showSkip/showReplay independently control the two escape
         hatches: showSkip is the loading/stalled "ادامه بدون فیلم" (Final
         must always stay reachable even when media fails), showReplay is
         the ended-state "پخش دوباره" (hidden if the admin would rather
         only offer Continue). loop is OFF by default (no more forever-
         looping single item) - an advanced/rare opt-in to replay the
         whole sequence automatically instead of ending, exposed under
         Projector's "تنظیمات پیشرفته" disclosure. */
      autoContinue: false,
      continueDelaySec: 1.3,
      showSkip: true,
      showReplay: true,
      loop: false
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
    SLUG: NUR_SLUG,
    REMOTE_CONFIG_URL,
    REMOTE_STREAMER_URL,
    REMOTE_STREAMER_LIST_URL,
    REMOTE_STREAMER_CREATE_URL,
    REMOTE_STREAMER_SAVE_URL,
    PUBLIC_BASE_URL,
    REMOTE_UPLOAD_URL,
    REMOTE_UPLOAD_URL_DIRECT,
    DEFAULT_CONFIG,
    deepClone,
    mergeWithDefaults,
    loadConfig,
    saveConfig,
    clearConfig
  };
})(window);
