/* ============================================================================
   continuers-chain.js - draws the shared "ادامه‌دهندگان نور" chain (0..10 people + one "؟").
   Pure layout + markup builder: NUR_CHAIN.build(items, opts) -> { markup, viewBox, ar }.
   The caller (app.js) puts the markup in the <svg> and sets its viewBox.

   ONE layout rule for any number of people:
     - nodes are spaced EQUALLY around the orbit, symmetric about the top
       (first person on the right, the "؟" always right after the last person);
       step = 120deg up to 3 nodes (1 person = the approved layout exactly), then 360/n
     - every name sits directly BELOW its own avatar, centred, at the same distance
     - full names, never truncated: long ones wrap to at most 3 centred lines
     - a small soft clear zone is cut out of the ring / links / pulse behind every name
     - with many people the orbit radius grows just enough that no name touches a
       neighbouring avatar or name (up to 10 people).
   ============================================================================ */
(function (global) {
  "use strict";
  var MAX = 10, CX = 320, CY = 340, R0 = 170, GAP = 65, PAD_X = 11, PAD_Y = 6;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function f2(n) { return n.toFixed(2); }

  /* Full names are never cut. Long ones wrap at the most natural point: after _ - . or a
     space, else at a camelCase boundary, else the middle (max 3 lines). */
  function splitName(name, lim, depth) {
    var s = String(name || "").trim();
    if (s.length <= lim || (depth || 0) >= 2) return [s];
    var mid = s.length / 2, best = -1, bd = 1e9;
    for (var i = 1; i < s.length; i++) {
      var prev = s.charAt(i - 1), c = s.charAt(i), ok = false;
      if (/[_\-\s.]/.test(prev)) ok = true;
      else if (/[a-z0-9]/.test(prev) && /[A-Z]/.test(c)) ok = true;
      if (ok && Math.abs(i - mid) < bd) { bd = Math.abs(i - mid); best = i; }
    }
    if (best < 0) best = Math.ceil(s.length / 2);
    var a = s.slice(0, best).trim(), b = s.slice(best).trim();
    if (!b) return [a];
    return splitName(a, lim, (depth || 0) + 1).concat(splitName(b, lim, (depth || 0) + 1));
  }

  /* Text boxes are measured in an off-screen <svg> (independent of whether the stage is visible),
     relative to the baseline: { w, top, h }. */
  var mSvg = null;
  function measure(lines, fs) {
    var w = 0, top = -fs * 0.8, h = fs * 1.05 + (lines.length - 1) * fs * 1.15;
    try {
      if (!mSvg) {
        mSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        mSvg.setAttribute("width", "10"); mSvg.setAttribute("height", "10");
        mSvg.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none";
        document.body.appendChild(mSvg);
      }
      var t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", "0"); t.setAttribute("y", "0"); t.setAttribute("text-anchor", "middle");
      t.style.cssText = "font-size:" + fs + "px;letter-spacing:.05em;direction:ltr;unicode-bidi:isolate";
      lines.forEach(function (ln, i) {
        var ts = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
        ts.setAttribute("x", "0"); ts.setAttribute("dy", i ? String(fs * 1.15) : "0"); ts.textContent = ln; t.appendChild(ts);
      });
      mSvg.appendChild(t);
      var b = t.getBBox();
      mSvg.removeChild(t);
      if (b && b.width) { w = b.width; top = b.y; h = b.height; }
    } catch (e) { /* fall back to an estimate below */ }
    if (!w) lines.forEach(function (ln) { w = Math.max(w, ln.length * fs * 0.62); });
    return { w: w, top: top, h: h };
  }

  function nodePos(deg, R) { var r = deg * Math.PI / 180; return { x: CX + R * Math.sin(r), y: CY - R * Math.cos(r) }; }

  function build(items, o) {
    o = o || {};
    var cls = o.cls, idp = o.idp || "", narrow = !!o.narrow;
    items = (items || []).slice(0, MAX);
    var n = items.length + 1;                                   // + the "؟" node
    var step = n <= 3 ? 120 : 360 / n, span = (n - 1) * step;
    var fs = (n <= 3 ? 17 : n === 4 ? 16 : n === 5 ? 15 : n <= 7 ? 14 : n <= 9 ? 13 : 12.5) * (narrow ? 1.12 : 1);
    var lim = narrow ? 11 : 12, lineH = fs * 1.15;
    var labels = items.map(function (it) {
      var lines = splitName(it.name, lim);
      var m = measure(lines, fs);
      return { lines: lines, w: m.w, top: m.top, h: m.h };
    });
    var degs = [];
    for (var k = 0; k < n; k++) degs.push(n === 1 ? 0 : span / 2 - k * step);

    function place(R) {
      return degs.map(function (d) { var p = nodePos(d, R); return { x: p.x, y: p.y, deg: d }; });
    }
    function labelRect(nd, lb) {
      return { l: nd.x - lb.w / 2 - PAD_X, r: nd.x + lb.w / 2 + PAD_X, t: nd.y + GAP + lb.top - PAD_Y, b: nd.y + GAP + lb.top + lb.h + PAD_Y };
    }
    function collides(nodes) {
      var rects = labels.map(function (lb, i) { return labelRect(nodes[i], lb); });
      for (var i = 0; i < rects.length; i++) {
        for (var j = 0; j < nodes.length; j++) {              // label vs any OTHER avatar ring
          if (j === i) continue;
          var r = rects[i], cx = Math.max(r.l, Math.min(nodes[j].x, r.r)), cy = Math.max(r.t, Math.min(nodes[j].y, r.b));
          if (Math.hypot(cx - nodes[j].x, cy - nodes[j].y) < 45) return true;
        }
        for (var q = i + 1; q < rects.length; q++) {          // label vs label
          var a = rects[i], b = rects[q];
          if (!(a.r <= b.l || a.l >= b.r || a.b <= b.t || a.t >= b.b)) return true;
        }
      }
      for (var x = 0; x < nodes.length; x++) for (var y = x + 1; y < nodes.length; y++) {   // avatar vs avatar
        if (Math.hypot(nodes[x].x - nodes[y].x, nodes[x].y - nodes[y].y) < 90) return true;
      }
      return false;
    }
    var R = R0, nodes = place(R);
    if (n > 3) { while (R < 340 && collides(nodes)) { R += 4; nodes = place(R); } }   // grow the orbit only as much as needed
    nodes.forEach(function (nd, i) { nd.item = items[i] || null; nd.lab = labels[i] || null; nd.k = i; });

    /* ---- viewBox: exactly the approved 90 150 460 385 for the approved cases; grows only if content needs it ---- */
    var minY = Math.min.apply(null, nodes.map(function (nd) { return nd.y; })) - 46;
    var maxY = CY + R + 25, halfX = 230;
    nodes.forEach(function (nd) {
      halfX = Math.max(halfX, Math.abs(nd.x - CX) + 46);
      if (nd.lab) {
        var r = labelRect(nd, nd.lab);
        maxY = Math.max(maxY, r.b + 6); halfX = Math.max(halfX, Math.abs(r.l - CX) + 6, Math.abs(r.r - CX) + 6);
      } else maxY = Math.max(maxY, nd.y + 46);
    });
    var top = Math.min(150, Math.floor(minY)), bottom = Math.max(535, Math.ceil(maxY)), half = Math.ceil(halfX);
    var vb = [CX - half, top, half * 2, bottom - top];

    /* ---- markup ---- */
    var I = function (s) { return idp + s; };
    var defs = '<defs>' +
      '<radialGradient id="' + I("bloom") + '" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#fff6dc" stop-opacity=".78"/><stop offset="6%" stop-color="#fdf0c8" stop-opacity=".56"/><stop offset="14%" stop-color="#f3dea0" stop-opacity=".36"/><stop offset="26%" stop-color="#dcd097" stop-opacity=".2"/><stop offset="42%" stop-color="#a8c79a" stop-opacity=".1"/><stop offset="62%" stop-color="#8fc19a" stop-opacity=".045"/><stop offset="82%" stop-color="#8fc19a" stop-opacity=".014"/><stop offset="100%" stop-color="#8fc19a" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="' + I("core-soft") + '" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#ffffff" stop-opacity=".95"/><stop offset="35%" stop-color="#fffaf0" stop-opacity=".55"/><stop offset="70%" stop-color="#fff3cf" stop-opacity=".16"/><stop offset="100%" stop-color="#fff3cf" stop-opacity="0"/></radialGradient>' +
      '<filter id="' + I("core-blur") + '" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="1.1"/></filter>' +
      '<filter id="' + I("gap-blur") + '" filterUnits="userSpaceOnUse" x="-200" y="-200" width="1200" height="1200"><feGaussianBlur stdDeviation="2.4"/></filter>' +
      '<radialGradient id="' + I("halo") + '" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fdf6e3" stop-opacity=".5"/><stop offset="1" stop-color="#fdf6e3" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="' + I("g-ray") + '" gradientUnits="userSpaceOnUse" x1="' + CX + '" y1="' + CY + '" x2="' + f2(nodes[0].x) + '" y2="' + f2(nodes[0].y) + '"><stop offset="0" stop-color="#fffaf0" stop-opacity=".95"/><stop offset="1" stop-color="#fdf6e3" stop-opacity=".5"/></linearGradient>' +
      '<linearGradient id="' + I("g-arc") + '" gradientUnits="userSpaceOnUse" x1="' + f2(nodes[0].x) + '" y1="0" x2="' + f2(nodes[n - 1].x) + '" y2="0"><stop offset="0" stop-color="#fdf6e3" stop-opacity=".5"/><stop offset="1" stop-color="#fdf6e3" stop-opacity=".14"/></linearGradient>';
    nodes.forEach(function (nd) { defs += '<clipPath id="' + I("clip-") + nd.k + '"><circle cx="' + f2(nd.x) + '" cy="' + f2(nd.y) + '" r="34"/></clipPath>'; });
    defs += '<mask id="' + I("node-mask") + '" maskUnits="userSpaceOnUse" x="-300" y="-300" width="1240" height="1240"><rect x="-300" y="-300" width="1240" height="1240" fill="#fff"/>';
    nodes.forEach(function (nd) { defs += '<circle cx="' + f2(nd.x) + '" cy="' + f2(nd.y) + '" r="42" fill="#000"/>'; });
    nodes.forEach(function (nd) {       // the soft clear zone behind every name (same padding for all)
      if (!nd.lab) return;
      var r = labelRect(nd, nd.lab);
      defs += '<rect x="' + f2(r.l) + '" y="' + f2(r.t) + '" width="' + f2(r.r - r.l) + '" height="' + f2(r.b - r.t) + '" rx="9" fill="#000" filter="url(#' + I("gap-blur") + ')"/>';
    });
    defs += '</mask></defs>';

    var d = "M" + CX + " " + CY + " L" + f2(nodes[0].x) + " " + f2(nodes[0].y), arcD = "M" + f2(nodes[0].x) + " " + f2(nodes[0].y);
    for (var i = 1; i < n; i++) {
      var seg = " A" + f2(R) + " " + f2(R) + " 0 0 0 " + f2(nodes[i].x) + " " + f2(nodes[i].y);
      d += seg; arcD += seg;
    }
    var out = defs;
    out += '<circle cx="' + CX + '" cy="' + CY + '" r="' + f2(R) + '" fill="none" stroke="#f0eee6" stroke-opacity=".07" stroke-width="1" mask="url(#' + I("node-mask") + ')"/>';
    out += '<circle class="' + cls.breathe + '" cx="' + CX + '" cy="' + CY + '" r="225" fill="url(#' + I("bloom") + ')"/>';
    out += '<g mask="url(#' + I("node-mask") + ')">' +
      '<path d="M' + CX + ' ' + CY + ' L' + f2(nodes[0].x) + ' ' + f2(nodes[0].y) + '" fill="none" stroke="url(#' + I("g-ray") + ')" stroke-width="1.4"/>' +
      (n > 1 ? '<path d="' + arcD + '" fill="none" stroke="url(#' + I("g-arc") + ')" stroke-width="1.4"/>' : '') +
      '<path class="' + cls.pulse + '" d="' + d + '" pathLength="100"/></g>';
    out += '<g class="' + cls.flicker + '"><circle cx="' + CX + '" cy="' + CY + '" r="16" fill="url(#' + I("core-soft") + ')"/><circle cx="' + CX + '" cy="' + CY + '" r="3.4" fill="#ffffff" filter="url(#' + I("core-blur") + ')"/></g>';

    var total = R + R * (span * Math.PI / 180);
    nodes.forEach(function (nd) {
      var x = f2(nd.x), y = f2(nd.y);
      if (nd.item) {
        var frac = (R + R * ((nodes[0].deg - nd.deg) * Math.PI / 180)) / total;
        out += '<circle class="' + cls.ping + '" style="animation-delay:' + (3.4 * frac - 1.116).toFixed(2) + 's" cx="' + x + '" cy="' + y + '" r="62" fill="url(#' + I("halo") + ')"/>';
        out += '<circle cx="' + x + '" cy="' + y + '" r="39" fill="none" stroke="#e8cf8a" stroke-opacity=".6" stroke-width="1"/>';
        out += '<circle cx="' + x + '" cy="' + y + '" r="34" fill="#0d1731"/>';
        out += '<text class="' + cls.init + '" x="' + x + '" y="' + f2(nd.y + 10) + '">' + esc((nd.item.name || "?").charAt(0).toUpperCase()) + '</text>';
        if (nd.item.avatar) out += '<image href="' + esc(nd.item.avatar) + '" x="' + f2(nd.x - 34) + '" y="' + f2(nd.y - 34) + '" width="68" height="68" clip-path="url(#' + I("clip-") + nd.k + ')" preserveAspectRatio="xMidYMid slice"/>';
        var lab = '<text class="' + cls.user + '" style="font-size:' + fs + 'px" x="' + x + '" y="' + f2(nd.y + GAP) + '">';
        nd.lab.lines.forEach(function (ln, li) { lab += '<tspan x="' + x + '" dy="' + (li ? f2(lineH) : 0) + '">' + esc(ln) + '</tspan>'; });
        out += lab + '</text>';
      } else {
        out += '<circle cx="' + x + '" cy="' + y + '" r="34" fill="#0d1731" fill-opacity=".55" stroke="#f0eee6" stroke-opacity=".16" stroke-width="1"/>';
        out += '<circle class="' + cls.spin + '" cx="' + x + '" cy="' + y + '" r="39" fill="none" stroke="#f0eee6" stroke-opacity=".5" stroke-width="1" stroke-dasharray="2 6" stroke-linecap="round"/>';
        out += '<text class="' + cls.q + '" x="' + f2(nd.x - 0.03) + '" y="' + f2(nd.y + 8.3) + '">؟</text>';
      }
    });
    return { markup: out, viewBox: vb.map(function (v) { return Math.round(v * 100) / 100; }).join(" "), ar: vb[2] / vb[3] };
  }

  global.NUR_CHAIN = { MAX: MAX, build: build, splitName: splitName };
})(window);
