/* Production Wix Classic Custom Element - hosts NUR full-viewport on the
 * published site. Desktop/laptop only.
 *
 * The element pins itself to position:fixed;inset:0;100vw/100vh (custom
 * elements are NOT sandboxed in an iframe on the published site, only in
 * Editor/Preview) and loads NUR in a plain child iframe sized 100%/100%,
 * so NUR's own 100vh is already the visitor's real window height - no
 * postMessage/Velo bridge is needed or used. */
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
