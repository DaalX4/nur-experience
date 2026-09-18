/* Production Wix Classic Custom Element - hosts NUR full-viewport on the
 * published site, bypassing the fixed Editor-height limitation of the
 * "Embed a Site" HTML component (#html4). Desktop/laptop only, matches
 * the rest of the NUR project.
 *
 * Architecture: this element sets itself to position:fixed;inset:0;100vw/100vh
 * (confirmed possible on the published site - custom elements are NOT
 * sandboxed in an iframe there, unlike in Editor/Preview mode, where
 * Wix does sandbox them for security) and loads NUR inside a plain
 * child iframe sized 100%/100% of that box. Because the child iframe's
 * own box already equals the real window size (not a Wix-Editor-sized
 * box like #html4's), NUR's own 100vh is already correct with no
 * postMessage bridge needed - the existing --nur-vh listener in app.js
 * still exists and is harmless (it simply never fires here), so nothing
 * else in NUR needs to change or know which embed method is in use. */
class NurShell extends HTMLElement {
  connectedCallback() {
    this.style.position = "fixed";
    this.style.inset = "0";
    this.style.width = "100vw";
    this.style.height = "100vh";
    this.style.zIndex = "999999";
    this.style.display = "block";
    this.style.background = "#0a1226"; /* matches NUR's own bg-1, avoids a flash of white while the iframe loads */

    const iframe = document.createElement("iframe");
    iframe.src = "https://daalx4.github.io/nur-experience/";
    iframe.title = "Nur";
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "0";
    iframe.style.display = "block";
    iframe.allow = "autoplay; encrypted-media; picture-in-picture";
    this.appendChild(iframe);
  }
}
customElements.define("nur-shell", NurShell);
