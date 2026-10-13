/* ============================================================================
   projector-controls.js - tiny, isolated playback controls for the Projector video.

   Click / tap the video  or  Space  -> pause / resume (a brief centered icon, YouTube-style pattern)
   Left / Right arrow                -> back / forward 5 s (a brief "-5s" / "+5s")

   This file only ever calls play()/pause()/currentTime on the <video> that projector.js is already showing (found
   in the DOM, not owned or recreated here), and mirrors the same on its blurred background twin. It never touches
   the source, the prepared blob, the network, the stall rescue, Replay, Continue or any timer of projector.js /
   video-prep.js - those keep working exactly as before. Controls only act while the video is genuinely on screen
   and playing/paused: not while a gate (loading / weak-connection / ended+Replay) is showing, not after the video
   ended, not while the admin panel is open or focus is in a form control, and never on any other stage.
   ============================================================================ */
(function () {
  "use strict";

  var SEEK_SECONDS = 5;
  var END_MARGIN = 1;          // forward seeks stop this far before the end: the video then finishes by itself (the normal "ended" flow)
  var FIRST_CLICK_GUARD = 0.6; // a click within this many seconds of the video starting is the tail of the Play press, not a pause

  var stage = document.getElementById("stage-projector");
  var frameEl = document.getElementById("memoryFrame");
  if (!stage || !frameEl) return;
  var mediaEl = frameEl.querySelector(".frame-media");

  /* the <video> projector.js is showing right now, or null (the background twin lives in .media-bg, never matched) */
  function activeVideo() {
    if (!stage.classList.contains("active")) return null;
    var v = frameEl.querySelector(".media-layer.active .media-fg video");
    return v && v.readyState >= 2 && !v.ended ? v : null;
  }
  function gateShowing() { return !!frameEl.querySelector(".proj-gate.show"); }
  function adminOpen() { return !!document.querySelector(".nurap-open"); }

  /* ------------------------------------------------------------ feedback */
  var fx = null, fxTimer = 0;
  var ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>';
  var ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.2v13.6a1 1 0 0 0 1.5.86l11-6.8a1 1 0 0 0 0-1.72l-11-6.8A1 1 0 0 0 8 5.2z"/></svg>';
  function flash(kind, html) {
    if (!fx) {
      fx = document.createElement("div");
      fx.className = "proj-ctl-fx";
      fx.setAttribute("aria-hidden", "true");
      frameEl.appendChild(fx);
    }
    clearTimeout(fxTimer);
    fx.className = "proj-ctl-fx";
    fx.innerHTML = html;
    void fx.offsetWidth;                         // restart the CSS animation on rapid repeats
    fx.className = "proj-ctl-fx proj-ctl-fx--" + kind + " show";
    fxTimer = setTimeout(function () { if (fx) fx.className = "proj-ctl-fx"; }, 900);
  }

  /* ------------------------------------------------------------- actions */
  function twin(v) { return v.__bgTwin || null; }

  function toggle(v) {
    if (v.paused) {
      var tw = twin(v);
      if (tw) { try { tw.currentTime = v.currentTime; } catch (e) { /* ignore */ } tw.play().catch(function () {}); }
      v.play().catch(function () {});
      flash("play", ICON_PLAY);
    } else {
      v.pause();
      var tw2 = twin(v);
      if (tw2) tw2.pause();
      flash("pause", ICON_PAUSE);
    }
  }

  function seek(v, delta) {
    var dur = v.duration;
    if (!isFinite(dur) || dur <= 0) return;
    var t = v.currentTime + delta;
    t = Math.max(0, Math.min(t, Math.max(0, dur - END_MARGIN)));
    if (delta > 0 && t < v.currentTime) t = v.currentTime;   // already inside the last second: never jump backwards on "forward"
    try { v.currentTime = t; } catch (e) { return; }
    var tw = twin(v);
    if (tw) { try { tw.currentTime = t; } catch (e2) { /* ignore */ } }
    flash("seek", '<span>' + (delta < 0 ? "−" : "+") + SEEK_SECONDS + "s</span>");
  }

  /* ------------------------------------------------------------ keyboard */
  function liveButton(b) {
    var cs = getComputedStyle(b);
    return cs.pointerEvents !== "none" && cs.visibility !== "hidden" && cs.display !== "none" && b.getClientRects().length > 0;
  }
  document.addEventListener("keydown", function (e) {
    var space = e.code === "Space" || e.key === " ";
    var left = e.key === "ArrowLeft", right = e.key === "ArrowRight";
    if (!space && !left && !right) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.defaultPrevented) return;
    if (adminOpen() || !stage.classList.contains("active")) return;
    var t = e.target;
    if (t && t.closest) {
      if (t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], #nurAdminPanel')) return;
      var b = t.closest("button, a[href], [role=button]");
      if (b && liveButton(b)) return;            // a visible control owns the key; a hidden leftover (e.g. the Play button after its press) does not
    }
    var v = activeVideo();
    if (!v || gateShowing()) return;
    e.preventDefault();                          // no page scroll, no stray button activation
    if (space) { if (!e.repeat) toggle(v); }
    else seek(v, left ? -SEEK_SECONDS : SEEK_SECONDS);
  });

  /* --------------------------------------------------------- click / tap */
  if (mediaEl) {
    mediaEl.addEventListener("click", function (e) {
      if (adminOpen()) return;
      if (e.target.closest && e.target.closest("button, a, .proj-gate, .proj-audio-hint--action, .proj-note")) return;
      var v = activeVideo();
      if (!v || gateShowing()) return;
      if (!v.paused && v.currentTime < FIRST_CLICK_GUARD) return;   // tail of the Play press
      toggle(v);
    });
  }
})();
