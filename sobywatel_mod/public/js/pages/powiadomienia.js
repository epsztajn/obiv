(function () {
  var STORAGE_KEY = "notif-prefs";

  var DEFAULT_PREFS = {
    dokumenty: true,
    zastrzezPesel: true,
    eplatnosci: true,
    bezpiecznieWSieci: true,
  };

  function loadPrefs() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return Object.assign({}, DEFAULT_PREFS);
      var parsed = JSON.parse(raw);
      return Object.assign({}, DEFAULT_PREFS, parsed);
    } catch (_) {
      return Object.assign({}, DEFAULT_PREFS);
    }
  }

  function savePrefs(prefs) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch (_) {}
  }

  function setupBackLink() {
    var link = document.getElementById("notif-back-link");
    var label = document.getElementById("notif-back-label");
    if (!link) return;

    var params = new URLSearchParams(window.location.search);
    var from = params.get("from") || "documents";

    if (from === "more") {
      link.href = "more.html";
      if (label) label.textContent = "Więcej";
    } else {
      link.href = "documents.html";
      if (label) label.textContent = "Dokumenty";
    }
  }

  function markNotificationsSeen() {
    try {
      localStorage.setItem("licenseRead", "true");
    } catch (_) {}
  }

  function bindToggles() {
    var prefs = loadPrefs();
    var inputs = document.querySelectorAll(".notif-switch input[data-pref]");

    inputs.forEach(function (input) {
      var key = input.getAttribute("data-pref");
      if (!key) return;
      input.checked = !!prefs[key];

      input.addEventListener("change", function () {
        prefs[key] = input.checked;
        savePrefs(prefs);
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    setupBackLink();
    markNotificationsSeen();
    bindToggles();

    try {
      if (typeof initHeaderTitleObserver === "function") {
        initHeaderTitleObserver();
      }
    } catch (_) {}
  });
})();
