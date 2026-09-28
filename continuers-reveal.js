/* ============================================================================
   continuers-reveal.js - the staged reveal of the "ادامه‌دهندگان نور" page.

   The page itself is unchanged: its markup, the chain drawn by continuers-chain.js into
   #contChain, and every style are the existing ones. This file only (a) hides the existing pieces
   and (b) brings them back one at a time, using nothing but opacity fades, the existing line drawn
   with stroke-dashoffset, a soft glow, and each avatar resolving out of light.

   Sequence: empty sky -> top sentence (with a very soft halo) -> "ادامه‌دهندگان نور" -> the center
   light -> the existing line draws to node 1 -> node 1 forms as light and resolves into its avatar,
   then its name -> next line / next node ... -> "؟" -> bottom sentence.
   When everything is visible it hands back to app.js, whose existing, configurable Continuers hold
   timer (config.final.phase2DelaySec) and fade to Credit then run exactly as before.

   API (used by app.js): NUR_CONT_REVEAL.start(onDone) / NUR_CONT_REVEAL.cancel().
   cancel() always leaves the page fully visible and exactly as the chain builder drew it.
   ============================================================================ */
(function () {
  "use strict";

  var stage = document.getElementById("stage-final"), svg = document.getElementById("contChain");
  if (!stage || !svg) return;
  var SVGNS = "http://www.w3.org/2000/svg";

  /* All pacing in one place (ms). */
  var T = {
    emptySky: 700,          // 1) nothing but the sky
    top: 1800,              // 2) top sentence
    gapToTitle: 700,        // 3) label starts shortly after the top sentence has settled
    title: 1500,
    gapToLight: 600,        // 4) then the existing center light fades in
    light: 1600,
    gapToLine: 500,
    drawRay: 1700,          // 5) the existing line, center -> node 1 (slow)
    drawArc: 1400,          //    node -> next node
    nodeLeadUnits: 70,      // 6) a node starts forming when only ~70 chain-units of line are left to draw
    orbIn: 700,             //    the light (a wide soft glow) fades in
    orbHold: 100,
    orbOut: 2400,           //    the avatar resolves out of the light over this long
    labelAt: 1700,          //    username fades in (ms after the node starts)
    name: 1000,
    nextLineAt: 2000,       // 7) next line starts (ms after the node starts)
    haloTotal: 4200,        // very soft aura behind the first sentence: one gentle swell
    gapToBottom: 600,       // 8) bottom sentence, after the full chain
    bottom: 1700
  };
  var EASE_LINE = "cubic-bezier(.4,.05,.3,1)";
  var EASE_SOFT = "cubic-bezier(.37,0,.63,1)";

  /* time fraction at which the eased line has drawn fraction p of its length (inverse of EASE_LINE) */
  function timeAtProgress(p) {
    var x1 = 0.4, y1 = 0.05, x2 = 0.3, y2 = 1;
    function bez(a, b, s) { return 3 * (1 - s) * (1 - s) * s * a + 3 * (1 - s) * s * s * b + s * s * s; }
    var lo = 0, hi = 1;
    for (var k = 0; k < 40; k++) { var m = (lo + hi) / 2; if (bez(y1, y2, m) < p) lo = m; else hi = m; }
    return bez(x1, x2, (lo + hi) / 2);
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function flush(el) { void el.getBoundingClientRect(); }
  function $(id) { return document.getElementById(id); }
  function smooth(a, b, x) { var s = Math.max(0, Math.min(1, (x - a) / (b - a))); return s * s * (3 - 2 * s); }
  function svgEl(name, attrs) { var e = document.createElementNS(SVGNS, name); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  /* lerp every colour channel toward a warm white by w: an "over-exposed" version of whatever the image is */
  function washMatrix(w) { return (1 - w) + " 0 0 0 " + w + "  0 " + (1 - w) + " 0 0 " + (w * 0.965).toFixed(3) + "  0 0 " + (1 - w) + " 0 " + (w * 0.87).toFixed(3) + "  0 0 0 1 0"; }

  var runId = 0, running = false, onDoneCb = null, P = null;

  /* ---- take the chain apart into its existing pieces (no visual change) ---- */
  function wrap(el) {
    var g = svgEl("g", { "class": "cr-w" });
    el.parentNode.insertBefore(g, el); g.appendChild(el); return g;
  }
  function unwrapAll() {                               // deepest first (document order reversed)
    var ws = Array.prototype.slice.call(svg.querySelectorAll("g.cr-w")).reverse();
    ws.forEach(function (g) { while (g.firstChild) g.parentNode.insertBefore(g.firstChild, g); g.parentNode.removeChild(g); });
  }
  function analyse() {
    var core = svg.querySelector(":scope > g.cont-flicker"), bloom = svg.querySelector(":scope > circle.cont-breathe");
    var linesG = svg.querySelector(":scope > g[mask]");
    if (!core || !bloom || !linesG) return null;
    var ring = bloom.previousElementSibling;                       // the faint orbit ring, drawn just before the bloom
    var paths = Array.prototype.slice.call(linesG.querySelectorAll("path"));
    var pulse = paths.filter(function (p) { return p.classList.contains("cont-pulse"); })[0];
    var ray = paths[0], arc = paths.filter(function (p) { return p !== ray && p !== pulse; })[0] || null;
    if (!ray) return null;
    var nodes = [], cur = null;
    for (var el = core.nextElementSibling; el; el = el.nextElementSibling) {
      var startsReal = el.tagName === "circle" && el.classList.contains("cont-ping");
      var startsQ = el.tagName === "circle" && el.getAttribute("fill-opacity") === ".55";
      if (startsReal || startsQ) { cur = { els: [el], q: startsQ }; nodes.push(cur); } else if (cur) cur.els.push(el);
    }
    if (!nodes.length) return null;
    nodes.forEach(function (n) {
      n.g = svgEl("g", { "class": "cr-w" });
      n.els[0].parentNode.insertBefore(n.g, n.els[0]);
      n.els.forEach(function (e) { n.g.appendChild(e); });
      n.image = n.els.filter(function (e) { return e.tagName.toLowerCase() === "image"; })[0] || null;
      n.label = n.els.filter(function (e) { return e.tagName === "text" && e.classList.contains("cont-user"); })[0] || null;
      n.cx = n.els[0].getAttribute("cx"); n.cy = n.els[0].getAttribute("cy");
      if (n.q) {                                       // the "؟" node: everything resolves out of the light together
        n.inner = svgEl("g", { "class": "cr-w" });
        n.g.insertBefore(n.inner, n.els[0]); n.els.forEach(function (e) { n.inner.appendChild(e); });
        n.hide = [n.inner];
      } else {
        n.disc = n.els.filter(function (e) { return e.tagName === "circle" && e.getAttribute("fill") === "#0d1731"; })[0] || null;
        n.init = n.els.filter(function (e) { return e.tagName === "text" && e.classList.contains("cont-init"); })[0] || null;
        n.ring = n.els.filter(function (e) { return e.tagName === "circle" && e.getAttribute("fill") === "none" && !e.classList.contains("cont-spin"); })[0] || null;
        n.hide = [n.disc, n.init, n.image, n.ring].filter(Boolean);
      }
    });
    var ringCircle = ring && ring.tagName === "circle" ? ring : null;
    /* the faint full-circle orbit is a guide, not part of the story: it is hidden for the whole reveal (and stays
       hidden), so no path exists before the light has drawn it, and the gap between "؟" and the first node stays open */
    if (ringCircle) ringCircle.setAttribute("class", "cr-ring");
    return {
      ringCircle: ringCircle,
      ring: ringCircle ? wrap(ringCircle) : null,
      bloom: wrap(bloom), core: wrap(core),
      linesG: linesG, ray: ray, arc: arc, pulse: pulse, nodes: nodes
    };
  }

  function texts() { return [$("contTop"), $("contTitle"), $("contBottom")]; }
  function fade(el, ms) {                            // "" = the page's own value (e.g. the bottom line's .85)
    el.style.transition = "opacity " + ms + "ms ease"; flush(el); el.style.opacity = "";
  }
  function dash(path, from, to, ms) {                // draw part of an existing path, using stroke-dashoffset
    path.style.transition = "none"; path.style.strokeDashoffset = String(from); flush(path);
    path.style.transition = "stroke-dashoffset " + ms + "ms " + EASE_LINE; path.style.strokeDashoffset = String(to);
  }
  function clearStyle(e) { if (e) { e.style.transition = ""; e.style.opacity = ""; e.style.filter = ""; } }

  /* give the page back every property touched (styles, attributes, added elements) - the chain is
     then exactly what continuers-chain.js drew, apart from the harmless wrapper <g class="cr-w"> */
  function restoreStyles() {
    texts().forEach(clearStyle);
    var h = document.querySelector(".cr-halo"); if (h) h.parentNode.removeChild(h);
    var og = svg.querySelector("#cr-glow"); if (og) og.parentNode.removeChild(og);
    if (!P) return;
    [P.ray, P.arc].forEach(function (p) { if (p) { p.style.transition = ""; p.style.strokeDasharray = ""; p.style.strokeDashoffset = ""; } });
    if (P.pulse) P.pulse.style.visibility = "";
    [P.ring, P.bloom, P.core].forEach(clearStyle);
    P.nodes.forEach(function (n) {
      if (n.image) {
        n.image.removeAttribute("filter"); n.image.removeAttribute("mask");
        if (n.fx && n.fx.clip && !n.image.getAttribute("clip-path")) {     // original attribute position (byte-identical markup)
          var par = n.image.getAttribute("preserveAspectRatio"); n.image.removeAttribute("preserveAspectRatio");
          n.image.setAttribute("clip-path", n.fx.clip); if (par !== null) n.image.setAttribute("preserveAspectRatio", par);
        }
      }
      if (n.inner) n.inner.removeAttribute("filter");
      if (n.glow && n.glow.parentNode) n.glow.parentNode.removeChild(n.glow);
      if (n.fx) n.fx.nodes.forEach(function (x) { if (x.parentNode) x.parentNode.removeChild(x); });
      [n.g, n.image, n.label, n.disc, n.init, n.ring, n.inner].forEach(clearStyle);
    });
  }
  function restore() {                                 // full reset: styles, wrappers, stage classes
    restoreStyles(); unwrapAll();
    if (P && P.ringCircle) { P.ringCircle.removeAttribute("class"); }   // back to the exact markup the chain builder drew
    P = null;
    stage.classList.remove("cont-reveal"); stage.classList.remove("cont-light");
  }

  async function play(id) {
    var live = function () { return id === runId && stage.classList.contains("active"); };
    var defs = svg.querySelector(":scope > defs");
    var T0 = P.nodes.length, mine = P;

    /* a soft, wide, diffuse glow per node, plus (for avatars) the filter + mask that let the image
       itself come out of the light */
    var gg = svgEl("radialGradient", { id: "cr-glow" });
    [["0", "#fff6dc", ".5"], [".3", "#fdf0c8", ".3"], [".62", "#f3dea0", ".1"], ["1", "#f3dea0", "0"]].forEach(function (s) {
      gg.appendChild(svgEl("stop", { offset: s[0], "stop-color": s[1], "stop-opacity": s[2] }));
    });
    defs.appendChild(gg);
    mine.nodes.forEach(function (n, i) {
      var cx = +n.cx, cy = +n.cy;
      n.glow = svgEl("circle", { "class": "cr-glow", cx: n.cx, cy: n.cy, r: "70", fill: "url(#cr-glow)" });
      n.glow.style.opacity = "0"; n.g.insertBefore(n.glow, n.g.firstChild);
      n.fx = { nodes: [], clip: n.image ? n.image.getAttribute("clip-path") : null };
      if (n.image || n.q) {
        var fid = "cr-f" + i;
        var f = svgEl("filter", { id: fid, filterUnits: "userSpaceOnUse", x: cx - 70, y: cy - 70, width: 140, height: 140, "color-interpolation-filters": "sRGB" });
        n.blur = svgEl("feGaussianBlur", { stdDeviation: 0 }); f.appendChild(n.blur);
        if (n.image) { n.cm = svgEl("feColorMatrix", { type: "matrix", values: washMatrix(0) }); f.appendChild(n.cm); }
        defs.appendChild(f); n.fx.fid = fid; n.fx.nodes.push(f);
      }
      if (n.image) {
        var gid = "cr-mg" + i, mid = "cr-m" + i;
        var mg = svgEl("radialGradient", { id: gid });
        mg.appendChild(svgEl("stop", { offset: 0, "stop-color": "#fff" }));
        n.s2 = svgEl("stop", { offset: 0, "stop-color": "#fff" }); n.s3 = svgEl("stop", { offset: 1, "stop-color": "#fff", "stop-opacity": 0 });
        mg.appendChild(n.s2); mg.appendChild(n.s3);
        var mk = svgEl("mask", { id: mid, maskUnits: "userSpaceOnUse", x: cx - 40, y: cy - 40, width: 80, height: 80 });
        mk.appendChild(svgEl("circle", { cx: n.cx, cy: n.cy, r: "40", fill: "url(#" + gid + ")" }));
        defs.appendChild(mg); defs.appendChild(mk);
        n.fx.mid = mid; n.fx.nodes.push(mg, mk);
      }
    });

    /* One node, one continuous resolve (every value is driven from ONE progress p, so nothing can step
       or drift apart): the light is a wide soft glow; the avatar itself starts as a blurred, over-exposed,
       soft-edged version of itself and comes into focus, colour and a crisp circle as the glow thins. */
    function resolveNode(n, ms) {
      var t0 = performance.now();
      if (n.image) { n.image.removeAttribute("clip-path"); n.image.setAttribute("mask", "url(#" + n.fx.mid + ")"); n.image.setAttribute("filter", "url(#" + n.fx.fid + ")"); }
      else if (n.q) n.inner.setAttribute("filter", "url(#" + n.fx.fid + ")");
      n.glow.style.transition = "none";
      function apply(p) {
        n.glow.style.opacity = (1 - smooth(0.3, 1, p)).toFixed(3);
        if (n.image) {
          n.image.style.opacity = smooth(0, 0.5, p).toFixed(3);
          n.blur.setAttribute("stdDeviation", (8 * Math.pow(1 - smooth(0, 0.95, p), 2)).toFixed(2));
          n.cm.setAttribute("values", washMatrix(0.85 * (1 - smooth(0.05, 0.9, p))));
          var m = smooth(0.1, 1, p);
          n.s2.setAttribute("offset", (0.85 * m).toFixed(3)); n.s3.setAttribute("offset", (1 - 0.145 * m).toFixed(3));
          if (n.disc) n.disc.style.opacity = smooth(0.5, 1, p).toFixed(3);
          if (n.ring) n.ring.style.opacity = smooth(0.55, 1, p).toFixed(3);
        } else if (n.q) {
          n.inner.style.opacity = smooth(0, 0.6, p).toFixed(3);
          n.blur.setAttribute("stdDeviation", (5 * Math.pow(1 - smooth(0, 0.95, p), 2)).toFixed(2));
        } else {                                        // a node without an avatar: its disc + initial come out of the light
          [n.disc, n.init].forEach(function (e) { if (e) e.style.opacity = smooth(0.3, 0.9, p).toFixed(3); });
          if (n.ring) n.ring.style.opacity = smooth(0.55, 1, p).toFixed(3);
        }
      }
      function finish() {
        if (n.image) {
          n.image.removeAttribute("filter"); n.image.removeAttribute("mask");
          if (n.fx.clip) {                               // back in its original attribute position (byte-identical markup)
            var par = n.image.getAttribute("preserveAspectRatio"); n.image.removeAttribute("preserveAspectRatio");
            n.image.setAttribute("clip-path", n.fx.clip); if (par !== null) n.image.setAttribute("preserveAspectRatio", par);
          }
          n.image.style.opacity = ""; if (n.disc) n.disc.style.opacity = ""; if (n.ring) n.ring.style.opacity = "";
        } else if (n.q) { n.inner.removeAttribute("filter"); n.inner.style.opacity = ""; }
        else { [n.disc, n.ring].forEach(function (e) { if (e) e.style.opacity = ""; }); }
        n.fx.nodes.forEach(function (x) { if (x.parentNode) x.parentNode.removeChild(x); });
        n.fx.nodes = [];
        if (n.glow.parentNode) n.glow.parentNode.removeChild(n.glow);
      }
      (function frame(now) {
        if (id !== runId) return;                        // cancelled or restarted: restore() owns the cleanup
        var p = Math.min(1, (now - t0) / ms);
        apply(p);
        if (p < 1) requestAnimationFrame(frame); else finish();
      })(t0);
    }

    /* 1) empty sky: hide every piece the page shows */
    texts().forEach(function (el) { el.style.transition = "none"; el.style.opacity = "0"; });
    [mine.ring, mine.bloom, mine.core].forEach(function (g) { if (g) { g.style.transition = "none"; g.style.opacity = "0"; } });
    var rayLen = mine.ray.getTotalLength(), arcLen = mine.arc ? mine.arc.getTotalLength() : 0, segLen = T0 > 1 ? arcLen / (T0 - 1) : 0;
    mine.ray.style.strokeDasharray = rayLen + " " + rayLen; mine.ray.style.strokeDashoffset = String(rayLen);
    if (mine.arc) { mine.arc.style.strokeDasharray = arcLen + " " + arcLen; mine.arc.style.strokeDashoffset = String(arcLen); }
    if (mine.pulse) mine.pulse.style.visibility = "hidden";   // the traveling pulse is part of the finished page
    mine.nodes.forEach(function (n) {
      n.g.style.transition = "none"; n.g.style.opacity = "0";
      n.hide.forEach(function (e) { e.style.transition = "none"; e.style.opacity = "0"; });
      if (n.label) { n.label.style.transition = "none"; n.label.style.opacity = "0"; }
    });
    await sleep(T.emptySky); if (!live()) return;

    /* 2-3) sentences (with one very soft aura behind the first) */
    (function halo() {
      var cont = $("continuers"), top = $("contTop"); if (!cont || !top) return;
      var h = document.createElement("div"); h.className = "cr-halo";
      var w = Math.max(top.offsetWidth * 1.3, 320), ht = Math.max(top.offsetHeight * 3.4, 150);
      h.style.cssText = "width:" + w + "px;height:" + ht + "px;left:" + (top.offsetLeft + top.offsetWidth / 2) + "px;top:" + (top.offsetTop + top.offsetHeight / 2) + "px;animation-duration:" + T.haloTotal + "ms";
      cont.insertBefore(h, cont.firstChild);
    })();
    fade($("contTop"), T.top); await sleep(T.top + T.gapToTitle); if (!live()) return;
    fade($("contTitle"), T.title); await sleep(T.title + T.gapToLight); if (!live()) return;

    /* 4) the existing center light (its own breathing/flicker keeps running inside the wrappers); the
          page's own soft bloom starts with it */
    stage.classList.add("cont-light");
    [mine.ring, mine.bloom, mine.core].forEach(function (g) { if (g) { g.style.transition = "opacity " + T.light + "ms ease"; flush(g); g.style.opacity = "1"; } });
    await sleep(T.light + T.gapToLine); if (!live()) return;

    /* 5-7) line -> node, node by node. The node starts forming while the line is still finishing,
          as a soft light; then the avatar resolves out of it, then the name. */
    for (var i = 0; i < T0; i++) {
      var n = mine.nodes[i], draw = i === 0 ? T.drawRay : T.drawArc, len = i === 0 ? rayLen : segLen;
      if (i === 0) dash(mine.ray, rayLen, 0, draw);
      else dash(mine.arc, arcLen - (i - 1) * segLen, arcLen - i * segLen, draw);
      var startMs = Math.round(timeAtProgress(Math.max(0, (len - T.nodeLeadUnits) / len)) * draw);
      await sleep(startMs); if (!live()) return;

      n.g.style.transition = "opacity " + T.orbIn + "ms " + EASE_SOFT;
      n.glow.style.transition = "opacity " + T.orbIn + "ms " + EASE_SOFT;
      flush(n.g); n.g.style.opacity = "1"; n.glow.style.opacity = "1";
      await sleep(T.orbIn + T.orbHold); if (!live()) return;

      resolveNode(n, T.orbOut);
      await sleep(T.labelAt - T.orbIn - T.orbHold); if (!live()) return;

      if (n.label) { n.label.style.transition = "opacity " + T.name + "ms ease"; flush(n.label); n.label.style.opacity = "1"; }
      await sleep(T.nextLineAt - T.labelAt); if (!live()) return;
    }

    /* 8) bottom sentence */
    await sleep(T.gapToBottom); if (!live()) return;
    fade($("contBottom"), T.bottom); await sleep(T.bottom); if (!live()) return;

    /* 9) everything is visible: give the page back every property touched, then hand over to app.js
          (its existing hold timer + fade to Credit) */
    restoreStyles();
    running = false;
    var cb = onDoneCb; onDoneCb = null;
    if (cb) cb();
  }

  function start(onDone) {
    restore();                                          // always from a clean, exactly-as-drawn chain
    var reduced = false;
    try { reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { /* ignore */ }
    if (reduced || !stage.classList.contains("active")) { if (onDone) onDone(); return; }
    stage.classList.add("cont-reveal");                 // css hooks (index.html): no block entrance, no sparkle trio, bloom waits
    P = analyse();
    if (!P) { stage.classList.remove("cont-reveal"); if (onDone) onDone(); return; }
    runId++; running = true; onDoneCb = onDone || null;
    play(runId);
  }
  function cancel() { runId++; running = false; onDoneCb = null; restore(); }

  /* if the chain is redrawn mid-reveal (fonts loading, the shared list arriving), start over on the new drawing */
  new MutationObserver(function () {
    if (!running) return;
    if (svg.querySelector(":scope > g.cont-flicker") && !svg.querySelector(":scope > g.cr-w")) start(onDoneCb);
  }).observe(svg, { childList: true });

  window.NUR_CONT_REVEAL = { start: start, cancel: cancel };
})();
