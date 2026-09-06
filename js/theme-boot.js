/** Apply saved theme before paint to avoid a dark↔light flash. */
(function () {
  try {
    var t = localStorage.getItem("sqb-theme");
    if (t === "light" || t === "dark") {
      document.documentElement.setAttribute("data-theme", t);
    }
  } catch (e) {
    /* ignore */
  }
})();
