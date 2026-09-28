/* ============================================================================
   video-prep.js - "prepared playback" for the Projector video.

   While the streamer reads the intro / letters, this quietly downloads the video into memory (a Blob) so the
   reveal ("نمایش") can start instantly and never stall: once the file is a Blob, playback makes no network
   requests at all. Foreground first: it never starts before Letter 1 is on screen and stable, pauses for every
   stage transition, and is rate-capped so it can't crowd a live streamer's connection.

   Tiers (chosen by real file SIZE measured from the host, not by names):
     safe - the lightest acceptable copy (original / 720p / 480p, whichever is smallest) - downloaded first;
     best - a higher-quality copy, only if the measured speed says it will arrive in reasonable time.
   The Wix "quality" URLs (…/video/<id>/<q>/mp4/file.mp4) are unofficial and not always present; every probe
   that fails simply removes that candidate. Anything unexpected -> the old native <video src> path.

   projector.js asks: status(url) / acquire(url) / whenReady(url) / rescue(url, current) / playStarted().
   app.js calls: stage(id) on every stage change.
   Debug (never shown to normal users): add ?debugvideo=1 (optional &vbase=http://host to rewrite the video host
   for local throttling tests).
   ============================================================================ */
(function () {
  "use strict";

  var CFG = {
    capMbps: 20,          // never pull faster than this (live-streamer friendliness)
    capFrac: 0.85,        // ...and never more than this share of the measured speed
    yieldMs: 1700,        // pause for this long after every stage change (transition + settle)
    startDelayMs: 1500,   // Letter 1 on screen this long before the first byte is requested
    bestMaxEtaSec: 120,   // start the better copy only if it should arrive within this long
    emergencyEtaSec: 60,  // safe copy would take longer than this at the measured speed -> switch to the light 360p copy (if it exists)
    waitMaxEtaSec: 120,   // pressed Play with nothing ready: WAIT (readiness state) if the prepared copy is this close - a light copy from memory beats a stream that may keep buffering
    hardWaitSec: 150,     // never make anyone wait longer than this for preparation
    retries: 3,
    probeTimeoutMs: 8000,
    lightMaxBytes: 30 * 1048576   // an original this light is used as-is (no 720p/480p probing)
  };

  var qs = location.search;
  var DEBUG = /[?&]debugvideo=1/.test(qs);
  var VBASE = DEBUG ? (function () { var m = qs.match(/[?&]vbase=([^&]+)/); return m ? decodeURIComponent(m[1]) : ""; })() : "";
  var HOST = "https://video.wixstatic.com";

  function supported() {
    try {
      if (typeof fetch !== "function" || typeof AbortController === "undefined" || typeof Blob === "undefined") return false;
      if (!(window.URL && URL.createObjectURL) || typeof ReadableStream === "undefined") return false;
      if (!(window.Response && Response.prototype && "body" in Response.prototype)) return false;
      var c = navigator.connection;
      if (c && c.saveData) return false;                 // the visitor asked the browser to save data
      return true;
    } catch (e) { return false; }
  }
  var OK = supported();

  var job = null;
  var t0 = performance.now();
  var timeline = [];
  var pauseUntil = 0;
  function now() { return performance.now(); }
  function mark(name, extra) { var o = { t: Math.round(now() - t0), e: name }; if (extra) for (var k in extra) o[k] = extra[k]; timeline.push(o); if (DEBUG) { try { console.debug("[video-prep]", o.t + "ms", name, extra || ""); } catch (e) { /* ignore */ } } }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function rw(u) { return VBASE && u.indexOf(HOST) === 0 ? VBASE + u.slice(HOST.length) : u; }
  function adminOpen() { return !!document.querySelector(".nurap-open"); }

  /* ---------------------------------------------------------------- job */
  function newJob(url) {
    var m = /^https:\/\/video\.wixstatic\.com\/video\/([^/]+)\/file$/.exec(url);
    return {
      url: url, id: m ? m[1] : null, state: "idle", mode: "smart",   // state: idle|probing|ready-to-run|running|done|failed ; mode: smart|native
      cands: [], plan: null, ready: {}, warm: null, dl: null,
      D0: 0, urgent: false, playing: false, startedAt: 0, firstReadyAt: 0, bestReadyAt: 0,
      waiters: [], nativeUrl: null, rescues: 0, stallEvents: 0
    };
  }
  function arm(cfg) {
    if (!OK || !cfg || !cfg.enabled || cfg.source === "youtube") return false;
    var it = (cfg.items || [])[0];
    if (!it || it.type !== "video" || !it.url) return false;
    if (job && job.url === it.url) return true;
    if (job) dispose();
    job = newJob(it.url);
    mark("armed", { url: it.url.slice(-40) });
    return true;
  }
  function dispose() {
    if (!job) return;
    if (job.dl) job.dl.abort = true, abortCtl(job.dl);
    Object.keys(job.ready).forEach(function (k) { try { URL.revokeObjectURL(job.ready[k].blobUrl); } catch (e) { /* ignore */ } });
    job = null;
  }
  function abortCtl(d) { try { if (d && d.ctl) d.ctl.abort(); } catch (e) { /* ignore */ } }

  /* -------------------------------------------------------------- probe */
  function candUrl(q) { return q === "orig" ? job.url : HOST + "/video/" + job.id + "/" + q + "/mp4/file.mp4"; }
  async function probeOne(name) {
    var url = candUrl(name), ctl = new AbortController(), timer = setTimeout(function () { ctl.abort(); }, CFG.probeTimeoutMs);
    try {
      /* HEAD: sizes only, no body, and (unlike a 1-byte range GET) it leaves no half-filled entry in the HTTP cache */
      var res = await fetch(rw(url), { method: "HEAD", signal: ctl.signal, cache: "no-store" });
      clearTimeout(timer);
      var size = res.status === 200 ? +(res.headers.get("Content-Length") || 0) : 0;
      if (!(size > 100000)) return null;
      return { name: name, url: url, size: size, rank: name === "orig" ? 3 : name === "720p" ? 2 : name === "480p" ? 1 : 0 };
    } catch (e) { clearTimeout(timer); return null; }
  }
  async function probe() {
    job.state = "probing";
    var names = job.id ? ["orig", "720p", "480p", "360p"] : ["orig"], out = [];
    for (var i = 0; i < names.length; i++) {
      await gate();
      var c = await probeOne(names[i]);
      if (c) out.push(c); else if (names[i] === "orig") { mark("probe-original-failed"); return false; }
      /* an already light original (the normal case) needs no heavier rendition: skip those probes (each missing one is a
         403 in the console) and look for the emergency 360p only if it is ever needed */
      if (names[i] === "orig" && c && c.size <= CFG.lightMaxBytes && job.id) { job.lazy = true; break; }
    }
    job.cands = out;
    mark("probed", { cands: out.map(function (c) { return c.name + ":" + (c.size / 1048576).toFixed(1) + "MB"; }).join(" ") });
    return true;
  }
  /* safe = lightest acceptable (orig / 720p / 480p) by REAL size; best = a higher-ranked copy, lightest of those;
     emergency = 360p, used only when the connection is too slow for even the safe copy. */
  function makePlan() {
    var c = job.cands, acceptable = c.filter(function (x) { return x.rank >= 1; });
    acceptable.sort(function (a, b) { return a.size - b.size; });
    var safe = acceptable[0] || c[0];
    var higher = acceptable.filter(function (x) { return x.rank > safe.rank && x.size > safe.size * 1.1; });
    higher.sort(function (a, b) { return a.size - b.size; });
    var emergency = c.filter(function (x) { return x.rank === 0 && x.size < safe.size; })[0] || null;
    job.plan = { safe: safe, best: higher[0] || null, emergency: emergency };
    mark("plan", { safe: safe.name, best: job.plan.best ? job.plan.best.name : "-", emergency: emergency ? "360p" : "-" });
  }

  /* --------------------------------------------------------- foreground */
  async function gate() {
    if (job && job.urgent) return;
    while (now() < pauseUntil) { await sleep(Math.min(200, pauseUntil - now() + 5)); if (job && job.urgent) return; }
  }
  function capBps() {
    var abs = CFG.capMbps * 125000;
    if (job && job.urgent) return Infinity;
    return job && job.D0 ? Math.min(abs, job.D0 * CFG.capFrac) : abs;
  }

  /* ----------------------------------------------------------- download */
  async function download(c) {
    var d = job.dl = { cand: c, chunks: [], got: 0, size: c.size, ctl: null, abort: false, tries: 0, t0: now(), sleptMs: 0, thr0: 0, thrBytes: 0, log: [] };
    mark("download-start", { tier: c.name, mb: +(c.size / 1048576).toFixed(1) });
    while (!d.abort) {
      try {
        d.ctl = new AbortController();
        var headers = d.got > 0 ? { Range: "bytes=" + d.got + "-" } : {};
        var res = await fetch(rw(c.url), { signal: d.ctl.signal, headers: headers, priority: "low" });
        if (d.got > 0 && res.status === 200) { d.chunks = []; d.got = 0; }        // server ignored the range: start over
        else if (res.status !== 200 && res.status !== 206) throw new Error("status " + res.status);
        var reader = res.body.getReader();
        for (;;) {
          await gate();
          if (d.abort) { abortCtl(d); return "aborted"; }
          var r = await reader.read();
          if (r.done) break;
          d.chunks.push(r.value); d.got += r.value.length;
          var t = now();
          if (!job.D0 && d.got >= 1048576) {                                        // speed measured on the first MB, uncapped
            job.D0 = d.got / Math.max(0.05, (t - d.t0) / 1000);
            d.thr0 = t; d.thrBytes = d.got;
            mark("speed", { mbps: +(job.D0 * 8 / 1e6).toFixed(1) });
          } else if (job.D0) {
            var cap = capBps();
            if (cap !== Infinity) {
              var due = d.thr0 + ((d.got - d.thrBytes) / cap) * 1000;
              if (due > t) { var s = due - t; d.sleptMs += s; await sleep(s); }
            }
            if (d.sleptMs === 0 && d.got > d.thrBytes + 4194304) {                 // link itself is the limit: keep the estimate honest
              var obs = (d.got - d.thrBytes) / Math.max(0.05, (t - d.thr0) / 1000);
              if (obs > job.D0) job.D0 = obs;
            }
          }
          if (job.state !== "failed" && job.mode === "smart") checkEmergency(d);
          if (d.abort) { abortCtl(d); return "aborted"; }
        }
        if (d.got !== d.size) throw new Error("short " + d.got + "/" + d.size);
        finish(d);
        return "done";
      } catch (e) {
        if (d.abort) return "aborted";
        d.tries++; mark("download-error", { tier: c.name, msg: String(e && e.message || e).slice(0, 60), got: d.got, tries: d.tries });
        if (d.tries > CFG.retries) return "failed";
        await sleep(600 * d.tries * d.tries);
      }
    }
    return "aborted";
  }
  var emergencyDone = false;
  function checkEmergency(d) {
    if (emergencyDone || !job.plan || d.cand !== job.plan.safe || !job.D0) return;
    var eta = (d.size - d.got) / Math.max(1, job.D0);
    if (!job.plan.emergency) { if (eta > CFG.emergencyEtaSec && d.got >= 1048576) lazyEmergency(); return; }
    if (eta > CFG.emergencyEtaSec && d.got >= 1048576) {
      emergencyDone = true;
      mark("emergency-360p", { etaSec: Math.round(eta) });
      job.plan.safe = job.plan.emergency; job.plan.best = null;
      d.abort = true; abortCtl(d);
    }
  }
  /* looks for the 360p rendition (once), only when the connection is too slow for the original or streaming natively */
  function lazyEmergency() {
    if (!job || !job.lazy || job.lazyTried) return;
    job.lazyTried = true;
    var j = job;
    probeOne("360p").then(function (c) {
      if (!c || job !== j) return;
      j.cands.push(c);
      if (j.plan && j.plan.safe && c.size < j.plan.safe.size) { j.plan.emergency = c; mark("emergency-found", { mb: +(c.size / 1048576).toFixed(1) }); }
    });
  }
  function finish(d) {
    var blob = new Blob(d.chunks, { type: "video/mp4" });
    d.chunks = [];
    var url = URL.createObjectURL(blob);
    job.ready[d.cand.name] = { name: d.cand.name, blobUrl: url, size: d.cand.size, at: now() };
    var isBest = job.plan && job.plan.best && d.cand.name === job.plan.best.name;
    if (!job.firstReadyAt) job.firstReadyAt = now();
    if (isBest) job.bestReadyAt = now();
    mark("ready", { tier: d.cand.name, sec: +((now() - d.t0) / 1000).toFixed(1) });
    warmUp(job.ready[d.cand.name]);
    wake();
  }
  /* a decoded-and-waiting <video> so the first frame is painted the instant Play is pressed */
  function warmUp(r) {
    try {
      var old = job.warm;
      var v = document.createElement("video");
      v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = r.blobUrl; v.load();
      job.warm = { el: v, tier: r.name };
      if (old && old.el) { old.el.removeAttribute("src"); old.el.load(); }
    } catch (e) { /* the projector builds its own element from the blob URL */ }
  }

  /* ------------------------------------------------------------- driver */
  async function run() {
    try {
      var ok = await probe();
      if (!ok || !job) { goNative("probe"); return; }
      makePlan();
      var plan = job.plan;
      job.state = "running";
      var res = await download(plan.safe);
      if (!job) return;
      if (res === "aborted" && emergencyDone && job.plan.safe.name === "360p") res = await download(job.plan.safe);
      if (res === "failed") { goNative("safe-failed"); return; }
      if (res !== "done") { wake(); return; }
      var best = job.plan.best;
      if (best && !job.playing && job.mode === "smart") {
        var eta = best.size / Math.max(1, job.D0 ? Math.min(job.D0, capBps()) : 1);
        if (eta <= CFG.bestMaxEtaSec) { var r2 = await download(best); if (r2 === "failed") mark("best-failed"); }
        else mark("best-skipped", { etaSec: Math.round(eta) });
      }
      job.state = "done"; wake();
    } catch (e) { mark("run-error", { msg: String(e && e.message || e) }); goNative("exception"); }
  }
  function goNative(why) {
    if (!job || job.mode === "native") return;
    var pick = job.plan && job.plan.safe ? job.plan.safe : null;
    /* on a very slow link the native stream must be the lightest copy, never the heavier original */
    if (job.plan && job.plan.emergency && job.D0 && job.D0 * 8 / 1e6 < 4 && pick && job.plan.emergency.size < pick.size) pick = job.plan.emergency;
    job.mode = "native";
    job.nativeUrl = pick ? pick.url : job.url;
    lazyEmergency();   // so a native stall can still drop to 360p
    if (job.dl) { job.dl.abort = true; abortCtl(job.dl); }
    job.state = job.state === "done" ? "done" : "failed";
    mark("native", { why: why, url: job.nativeUrl.slice(-30) });
    wake();
  }
  function start() {
    if (!OK) return;
    if (!job) { try { arm((window.NUR_APP && NUR_APP.getConfig().projector) || null); } catch (e) { /* ignore */ } }
    if (!job || job.state !== "idle") return;
    job.startedAt = now(); job.state = "probing"; mark("start");
    run();
  }

  /* ------------------------------------------------------- readiness API */
  function bestReady() {
    if (!job) return null;
    var order = ["orig", "720p", "480p", "360p"], plan = job.plan, best = null;
    if (plan && plan.best && job.ready[plan.best.name]) return job.ready[plan.best.name];
    if (plan && plan.safe && job.ready[plan.safe.name]) return job.ready[plan.safe.name];
    for (var i = 0; i < order.length; i++) if (job.ready[order[i]]) { best = job.ready[order[i]]; break; }
    return best;
  }
  function status(url) {
    if (!OK || !job || job.url !== url) return "off";
    if (bestReady()) return "ready";
    if (job.mode === "native") return "native";
    return "wait";
  }
  function acquire(url) {
    if (!OK || !job || job.url !== url) return null;
    var r = bestReady();
    if (r) {
      var el = null;
      if (job.warm && job.warm.tier === r.name) { el = job.warm.el; job.warm = null; }
      mark("acquire", { kind: "blob", tier: r.name, warm: !!el });
      return { kind: "blob", src: r.blobUrl, el: el, tier: r.name };
    }
    if (job.mode === "native") { mark("acquire", { kind: "native" }); return { kind: "native", src: job.nativeUrl || url, el: null, tier: "native" }; }
    return null;
  }
  var waiters = [];
  function wake() { var w = waiters.slice(); waiters = []; w.forEach(function (f) { f(); }); }
  /* Play was pressed and nothing safe is ready: prepare urgently (no yielding, no cap), and decide whether to wait or to stream. */
  function whenReady(url) {
    return new Promise(function (resolve) {
      if (!job || job.url !== url) { resolve(); return; }
      job.urgent = true; pauseUntil = 0;
      if (job.state === "idle") start();
      var t0w = now(), settled = false;
      function done() { if (settled) return; settled = true; clearInterval(iv); resolve(); }
      waiters.push(done);
      var iv = setInterval(function () {
        if (!job) { done(); return; }
        if (status(url) !== "wait") { done(); return; }
        var waited = (now() - t0w) / 1000;
        var d = job.dl, eta = null;
        if (d && job.D0) eta = (d.size - d.got) / Math.max(1, job.D0);
        if (job.state === "failed") { goNative("failed-while-waiting"); return; }
        if (waited > CFG.hardWaitSec || (eta !== null && eta > CFG.waitMaxEtaSec && waited > 3)) {
          if (!job.plan) makePlan2();
          goNative(waited > CFG.hardWaitSec ? "hard-wait" : "eta " + Math.round(eta) + "s");
        }
      }, 700);
      mark("waiting-for-ready");
    });
  }
  function makePlan2() { try { if (job.cands.length) makePlan(); } catch (e) { /* ignore */ } }
  function playStarted() {
    if (!job) return;
    job.playing = true; job.urgent = false;
    mark("play-started", { tier: (bestReady() || {}).name || job.mode });
    if (job.dl && job.plan && job.plan.best && job.dl.cand.name === job.plan.best.name && bestReady() && bestReady().name !== job.plan.best.name) {
      job.dl.abort = true; abortCtl(job.dl); mark("best-aborted-at-play");   // playing the safe copy from memory: stop fetching more
    }
  }
  /* stall rescue (native streaming only): the next lighter real copy, or null */
  function rescue(url, currentSrc) {
    if (!job || job.url !== url || !job.cands.length) return null;
    var list = job.cands.slice().sort(function (a, b) { return b.size - a.size; });
    var idx = -1;
    for (var i = 0; i < list.length; i++) if (list[i].url === currentSrc) idx = i;
    var next = list[idx + 1] || null;
    if (!next) return null;
    job.rescues++; mark("rescue", { to: next.name });
    return { src: next.url, tier: next.name };
  }
  function noteStall(kind) { if (job) { job.stallEvents++; } mark("stall", { kind: kind }); }

  /* ------------------------------------------------------------- stages */
  var started = false, delayedStart = null;
  function stage(id) {
    pauseUntil = Math.max(pauseUntil, now() + CFG.yieldMs);
    mark("stage", { id: id });
    if (!OK || started || adminOpen()) return;
    if (id === "stage-letter") {
      started = true;
      delayedStart = setTimeout(function () { pauseUntil = Math.max(pauseUntil, now()); start(); }, CFG.startDelayMs);
    } else if (id === "stage-countdown" || id === "stage-projector") {
      started = true; start();
    }
  }

  /* ---------------------------------------------------------- debugging */
  function stats() {
    var d = job && job.dl;
    return {
      supported: OK, mode: job && job.mode, state: job && job.state,
      mbps: job && job.D0 ? +(job.D0 * 8 / 1e6).toFixed(1) : null,
      plan: job && job.plan ? { safe: job.plan.safe.name, best: job.plan.best && job.plan.best.name } : null,
      cands: job ? job.cands.map(function (c) { return c.name + ":" + (c.size / 1048576).toFixed(1) + "MB"; }) : [],
      progress: d ? { tier: d.cand.name, pct: Math.round(d.got / d.size * 100), mb: +(d.got / 1048576).toFixed(1) } : null,
      ready: job ? Object.keys(job.ready) : [], rescues: job ? job.rescues : 0, stalls: job ? job.stallEvents : 0,
      firstReadySec: job && job.firstReadyAt ? +((job.firstReadyAt - job.startedAt) / 1000).toFixed(1) : null,
      bestReadySec: job && job.bestReadyAt ? +((job.bestReadyAt - job.startedAt) / 1000).toFixed(1) : null,
      timeline: timeline
    };
  }
  if (DEBUG) {
    var box = document.createElement("pre");
    box.style.cssText = "position:fixed;left:6px;bottom:6px;z-index:2147483647;margin:0;padding:6px 8px;font:11px/1.35 monospace;color:#9fe;background:rgba(0,0,0,.7);max-width:46vw;white-space:pre-wrap;pointer-events:none";
    document.addEventListener("DOMContentLoaded", function () { document.body.appendChild(box); });
    setInterval(function () { var s = stats(); box.textContent = "video-prep " + (s.mode || "-") + "/" + (s.state || "-") + "\n" + (s.mbps ? s.mbps + " Mbps " : "") + (s.progress ? s.progress.tier + " " + s.progress.pct + "% " : "") + "ready:[" + s.ready.join(",") + "]\nplan:" + JSON.stringify(s.plan) + " rescues:" + s.rescues + " stalls:" + s.stalls; }, 500);
  }

  window.NUR_VIDEO_PREP = {
    enabled: function () { return OK; },
    arm: arm, start: start, stage: stage,
    status: status, acquire: acquire, whenReady: whenReady, playStarted: playStarted, rescue: rescue, noteStall: noteStall,
    stats: stats, _dispose: dispose, _cfg: CFG
  };
})();
