/* NUR landing prototype - the only script: a handful of twinkling stars (same recipe as the original app.js). */
(function () {
  "use strict";
  var layer = document.getElementById("stars");
  if (!layer) return;
  var n = window.innerWidth < 520 ? 16 : 24, frag = document.createDocumentFragment();
  for (var i = 0; i < n; i++) {
    var s = document.createElement("span"), size = 1 + Math.random() * 2.2;
    s.className = "star";
    s.style.left = Math.random() * 100 + "%";
    s.style.top = Math.random() * 100 + "%";
    s.style.width = size + "px";
    s.style.height = size + "px";
    s.style.setProperty("--dur", 5 + Math.random() * 5 + "s");
    s.style.setProperty("--delay", Math.random() * 6 + "s");
    frag.appendChild(s);
  }
  layer.appendChild(frag);
})();
