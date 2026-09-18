/* PROTOTYPE ONLY - tests whether a Wix Classic Custom Element can escape
 * the Editor's layout box and own the real browser viewport on the
 * published site. Not wired to NUR's real config/behavior - just proves
 * or disproves the positioning mechanism. Safe to delete after testing;
 * touches nothing else on the page. */
class NurViewportTest extends HTMLElement {
  connectedCallback() {
    this.style.position = "fixed";
    this.style.inset = "0";
    this.style.width = "100vw";
    this.style.height = "100vh";
    this.style.zIndex = "999999";
    this.style.display = "block";

    const iframe = document.createElement("iframe");
    iframe.src = "https://daalx4.github.io/nur-experience/";
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "0";
    iframe.style.display = "block";
    this.appendChild(iframe);

    /* Small on-page readout so the test result is visible without
     * opening devtools - shows real vs. reported size, confirms the
     * fixed positioning actually took effect. */
    const badge = document.createElement("div");
    badge.style.cssText =
      "position:fixed;top:8px;left:8px;z-index:1000000;background:#111;" +
      "color:#0f0;font:12px monospace;padding:6px 10px;border-radius:4px;" +
      "pointer-events:none;";
    const rect = () => this.getBoundingClientRect();
    const update = () => {
      const r = rect();
      badge.textContent =
        "CE box: " + Math.round(r.width) + "x" + Math.round(r.height) +
        " | window: " + window.innerWidth + "x" + window.innerHeight;
    };
    update();
    window.addEventListener("resize", update);
    document.body.appendChild(badge);
  }
}
customElements.define("nur-viewport-test", NurViewportTest);
