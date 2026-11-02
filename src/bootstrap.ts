// Blocking classic script: establish the theme before styles and first paint, and
// mark html.js so section reveals hide content only when app.js will show it again.
(() => {
  document.documentElement.classList.add("js");
  try {
    const saved_theme = localStorage.getItem("jr-portfolio:theme");
    document.documentElement.dataset.theme = saved_theme === "light" ? "light" : "dark";
  } catch {
    // The HTML dark default remains valid if file-origin storage is unavailable.
  }
})();
