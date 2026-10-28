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

    /* Multi-streamer: the page's own first path segment is the streamer's
       slug (daalvi.com/ario -> "ario"). The original /nur page (and the home
       page, and anything unexpected) passes no slug, so it loads exactly as
       it always has. */
    let slug = "";
    try {
      const first = (location.pathname.split("/").filter(Boolean)[0] || "").toLowerCase();
      if (/^[a-z0-9-]{1,30}$/.test(first) && first !== "nur") slug = first;
    } catch (err) { /* keep "" */ }

    const iframe = document.createElement("iframe");
    /* STAGING: only the slugs listed here show the new film landing (landing/index.html); every other slug and /nur
       keep loading the original interactive experience exactly as before. Empty this list to roll the staging back. */
    const LANDING_SLUGS = ["zz-test"];
    const base = "https://daalx4.github.io/nur-experience/";
    iframe.src = LANDING_SLUGS.indexOf(slug) !== -1 ? base + "landing/" : base + (slug ? "?s=" + encodeURIComponent(slug) : "");
    iframe.title = "Nur";
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "0";
    iframe.style.display = "block";
    /* "fullscreen" is what lets the YouTube player nested inside the app go fullscreen: every cross-origin frame in
       the chain (this iframe -> the app's own YouTube iframe) has to allow it. */
    iframe.allow = "autoplay; encrypted-media; picture-in-picture; clipboard-write; fullscreen";
    iframe.setAttribute("allowfullscreen", "");
    this.appendChild(iframe);
  }
}
customElements.define("nur-shell", NurShell);
