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
      fields: [
        { type: "text", path: ["streamerName"], label: "نام استریمر (Streamer Name)" }
      ]
    },
    {
      id: "intro",
      label: "اینترو",
      fields: [
        { type: "textarea", path: ["intro", "body"], label: "متن اینترو (خط خالی = پاراگراف جدید)" },
        { type: "slider", path: ["intro", "offsetX"], label: "جابجایی چپ/راست", min: -200, max: 200, step: 1, unit: "px" },
        { type: "slider", path: ["intro", "offsetY"], label: "جابجایی بالا/پایین", min: -200, max: 200, step: 1, unit: "px" },
        { type: "slider", path: ["intro", "greetingFontSize"], label: "اندازه فونت خوش‌آمد (درود...)", min: 18, max: 60, step: 1, unit: "px" },
        { type: "slider", path: ["intro", "greetingGap"], label: "فاصله خوش‌آمد تا متن اصلی", min: 0, max: 80, step: 1, unit: "px" },
        { type: "slider", path: ["intro", "fontSize"], label: "اندازه فونت متن اصلی", min: 12, max: 36, step: 1, unit: "px" },
        { type: "slider", path: ["intro", "lineHeight"], label: "فاصله خطوط", min: 1, max: 2.6, step: 0.05, unit: "" },
        { type: "slider", path: ["intro", "gap"], label: "فاصله بین پاراگراف‌ها", min: 0, max: 60, step: 1, unit: "px" }
      ]
    },
    {
      id: "envelope",
      label: "صفحه پاکت",
      fields: [
        { type: "text", path: ["envelope", "greeting"], label: "خوش‌آمد (از {name} برای اسم استفاده کن)" },
        { type: "textarea", path: ["envelope", "instruction"], label: "متن راهنما" },
        { type: "slider", path: ["envelope", "offsetY"], label: "جابجایی بالا/پایین", min: -200, max: 200, step: 1, unit: "px" },
        { type: "slider", path: ["envelope", "lineGap"], label: "فاصله بین دو خط", min: 0, max: 60, step: 1, unit: "px" },
        { type: "slider", path: ["envelope", "gapToEnvelope"], label: "فاصله تا پاکت", min: 0, max: 80, step: 1, unit: "px" },
        { type: "slider", path: ["envelope", "fontSize"], label: "اندازه فونت راهنما", min: 12, max: 32, step: 1, unit: "px" }
      ]
    },
    {
      id: "letter",
      label: "نامه - صفحه ۱",
      dragTarget: { path: ["letterPage1", "button"], elementId: "toPage2" },
      fields: [
        { type: "slider", path: ["letterName", "x"], label: "X (فاصله از راست)", min: 0, max: 45, step: 0.5, unit: "%" },
        { type: "slider", path: ["letterName", "y"], label: "Y (فاصله از بالا)", min: 0, max: 55, step: 0.5, unit: "%" },
        { type: "slider", path: ["letterName", "fontSize"], label: "اندازه فونت", min: 16, max: 90, step: 1, unit: "px" },
        { type: "slider", path: ["letterName", "rotation"], label: "چرخش (Rotation)", min: -30, max: 30, step: 1, unit: "deg" },
        { type: "slider", path: ["letterName", "gapToAziz"], label: "فاصله تا «عزیز»", min: 0, max: 40, step: 1, unit: "px" },
        { type: "textarea", path: ["letterPage1", "body"], label: "متن نامه - صفحه ۱ (خط خالی = پاراگراف جدید)" },
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
        { type: "slider", path: ["letterPage1", "button", "scale"], label: "دکمه: مقیاس", min: 0.5, max: 1.5, step: 0.05, unit: "" }
      ]
    },
    {
      id: "letter2",
      label: "نامه - صفحه ۲",
      dragTarget: { path: ["letterPage2", "button"], elementId: "toPage3" },
      fields: [
        { type: "textarea", path: ["letterPage2", "body"], label: "متن نامه - صفحه ۲ (خط خالی = پاراگراف جدید)" },
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
        { type: "slider", path: ["letterPage2", "button", "scale"], label: "دکمه: مقیاس", min: 0.5, max: 1.5, step: 0.05, unit: "" }
      ]
    },
    {
      id: "letter3",
      label: "نامه - صفحه ۳",
      dragTarget: { path: ["letterPage3", "button"], elementId: "toCountdown" },
      fields: [
        { type: "textarea", path: ["letterPage3", "body"], label: "متن نامه - صفحه ۳ (خط خالی = پاراگراف جدید)" },
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
        { type: "slider", path: ["letterPage3", "button", "scale"], label: "دکمه: مقیاس", min: 0.5, max: 1.5, step: 0.05, unit: "" }
      ]
    },
    {
      id: "countdown",
      label: "شمارش معکوس",
      fields: []
    },
    {
      id: "final",
      label: "پایانی",
      fields: [
        { type: "textarea", path: ["final", "main"], label: "خط اول (تاکید بیشتر)" },
        { type: "textarea", path: ["final", "sub"], label: "خط دوم" },
        { type: "slider", path: ["final", "offsetY"], label: "جابجایی بالا/پایین", min: -200, max: 200, step: 1, unit: "px" },
        { type: "slider", path: ["final", "mainFontSize"], label: "اندازه فونت خط اول", min: 20, max: 60, step: 1, unit: "px" },
        { type: "text", path: ["final", "signature"], label: "امضای دال‌وی" },
        { type: "slider", path: ["final", "signatureOffsetY"], label: "فاصله امضا تا متن اصلی", min: 20, max: 240, step: 2, unit: "px" },
        { type: "slider", path: ["final", "signatureFontSize"], label: "اندازه فونت امضا", min: 10, max: 24, step: 1, unit: "px" }
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

  function fieldRow(field) {
    const value = getPath(draft, field.path);
    const row = document.createElement("div");
    row.className = "nurap-row";

    const label = document.createElement("label");
    label.className = "nurap-label";
    label.textContent = field.label;
    row.appendChild(label);

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
  }

  function startDrag(tab) {
    stopDrag();
    const el = document.getElementById(tab.dragTarget.elementId);
    const face = el && el.closest(".letter-face");
    if (!el || !face) return;

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
    tab.fields.forEach((field) => body.appendChild(fieldRow(field)));
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
        renderTabs();
        renderTabContent();
      });
      tabsEl.appendChild(btn);
    });
  }

  function refreshAllFields() {
    renderTabs();
    renderTabContent();
  }

  const ADMIN_PW_KEY = "nurAdminPw";

  /* Pushes the saved config to the shared Wix endpoint so every future
     visitor gets it, not just this browser. The password is never stored
     anywhere but this tab's sessionStorage (cleared when the tab closes) -
     it is typed in at Save time, not shipped in this file, and the Wix
     backend is what actually checks it (see DEPLOY.md). If this fails for
     any reason, the local save above has already happened, so the admin
     never loses their edit - they just get told the global publish didn't
     go through, instead of a false "done". */
  async function pushConfigGlobal(config) {
    let password = sessionStorage.getItem(ADMIN_PW_KEY);
    if (!password) {
      password = window.prompt("رمز مدیریت برای انتشار سراسری تغییرات را وارد کن:");
      if (!password) {
        setStatus("فقط به‌صورت محلی ذخیره شد (رمز وارد نشد)");
        return;
      }
      sessionStorage.setItem(ADMIN_PW_KEY, password);
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
    const sectionKeys = [...new Set(tab.fields.map((f) => f.path[0]))];
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
        #nurAdminPanel .nurap-backdrop{
          position:absolute; inset:0;
          background:rgba(6,10,22,.55);
        }
        #nurAdminPanel .nurap-panel{
          position:absolute; top:0; left:0; bottom:0;
          width:min(360px,92vw);
          background:#12172a;
          color:#eef0f6;
          box-shadow:2px 0 24px rgba(0,0,0,.4);
          display:flex; flex-direction:column;
          font-size:13px;
        }
        #nurAdminPanel .nurap-header{
          display:flex; align-items:center; justify-content:space-between;
          padding:14px 16px; border-bottom:1px solid rgba(255,255,255,.08);
        }
        #nurAdminPanel .nurap-title{font-size:14px; font-weight:700}
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
        #nurAdminPanel .nurap-row{display:flex; flex-direction:column; gap:6px}
        #nurAdminPanel .nurap-label{color:#c7ccdc; font-size:12px}
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
        #nurAdminToggle{
          position:fixed; bottom:10px; left:10px; width:14px; height:14px; border-radius:50%;
          background:rgba(255,255,255,.06); border:0; cursor:pointer; z-index:99998;
          opacity:0; transition:opacity .2s ease;
        }
        #nurAdminToggle:hover, #nurAdminToggle:focus-visible{opacity:1}
      </style>
      <div class="nurap-backdrop"></div>
      <div class="nurap-panel">
        <div class="nurap-header">
          <span class="nurap-title">پنل کنترل نور</span>
          <button type="button" class="nurap-close" aria-label="بستن">✕</button>
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
