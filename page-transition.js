(() => {
  "use strict";

  // Flag lu par app.js pour ne pas doubler les listeners.
  window.GLOBAL_PAGE_TRANSITION = true;

  function ensureOverlay() {
    let overlay = document.getElementById("page-transition");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "page-transition";
      overlay.className = "page-transition";
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function shouldHandleLink(link) {
    if (!link) return false;
    const href = link.getAttribute("href");
    if (!href || href.startsWith("#")) return false;
    if (href.startsWith("tel:") || href.startsWith("mailto:")) return false;
    if (link.target && link.target === "_blank") return false;
    return true;
  }

  function attachTransitions() {
    const overlay = ensureOverlay();

    document.addEventListener("click", (event) => {
      const link = event.target.closest("a[href]");
      if (!shouldHandleLink(link)) return;
      const href = link.getAttribute("href");
      event.preventDefault();
      overlay.classList.add("active");
      // Par rafraîchissement via animation frame pour garantir l'activation visuelle.
      requestAnimationFrame(() => {
        setTimeout(() => {
          window.location.href = href;
        }, 220);
      });
    });

    window.addEventListener("pageshow", () => overlay.classList.remove("active"));
  }

  document.addEventListener("DOMContentLoaded", attachTransitions);
})();
