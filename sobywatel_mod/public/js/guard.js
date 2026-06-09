(function () {
  "use strict";

  var PUBLIC_PAGES = new Set([
    "",
    "index.html",
    "login",
    "activate.html",
    "zaloguj.html",
    "generator.html",
    "admin-panel.html",
    "admin.html"
  ]);

  var APP_PAGES = new Set([
    "login.html",
    "documents.html",
    "dowod.html",
    "prawojazdy.html",
    "legszk.html",
    "legstu.html",
    "diia.html",
    "more.html",
    "services.html",
    "powiadomienia.html",
    "profiledata.html",
    "qr.html",
    "pesel.html",
    "search.html",
    "add.html",
    "assistant.html",
    "dashboard.html",
    "pojazdy.html",
    "incydent.html",
    "zastrzez.html",
    "sprawdz_pesel.html",
    "sprawdz_dowod.html"
  ]);

  var accessGranted = false;
  var pendingCallbacks = [];

  function currentPage() {
    var path = window.location.pathname || "";
    var parts = path.split("/");
    return parts[parts.length - 1] || "";
  }

  function pageQuery() {
    try { return new URLSearchParams(window.location.search); } catch (_) { return new URLSearchParams(); }
  }

  function hasCardTokenInUrl() {
    var q = pageQuery();
    return !!(q.get("card_token") || q.get("key"));
  }

  function hasStoredCardToken() {
    try { return !!localStorage.getItem("card_token"); } catch (_) { return false; }
  }

  function isSessionUnlocked() {
    try { return sessionStorage.getItem("userUnlocked") === "1"; } catch (_) { return false; }
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      var request = indexedDB.open("access-control", 1);
      request.onupgradeneeded = function () {
        request.result.createObjectStore("auth");
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  function getStoredHash() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction("auth", "readonly");
        var req = tx.objectStore("auth").get("hash");
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    }).catch(function () { return null; });
  }

  function hasActivationKey() {
    try {
      if (localStorage.getItem("moj_tajny_klucz")) return true;
    } catch (_) {}
    return getStoredHash().then(function (hash) { return !!hash; });
  }

  function denyAccess() {
    window.location.replace("/");
  }

  function grantAccess() {
    accessGranted = true;
    hideGuard();
    var cbs = pendingCallbacks.slice();
    pendingCallbacks = [];
    cbs.forEach(function (cb) {
      try { cb(); } catch (_) {}
    });
  }

  function hideGuard() {
    var el = document.getElementById("jsGuard");
    if (el) {
      el.hidden = true;
      el.style.display = "none";
    }
    try { document.body.classList.remove("guard-active"); } catch (_) {}
  }

  function showGuard() {
    var el = document.getElementById("jsGuard");
    if (el) {
      el.hidden = false;
      el.style.display = "";
    }
    try { document.body.classList.add("guard-active"); } catch (_) {}
  }

  function buildLoginRedirect() {
    var token = null;
    try { token = localStorage.getItem("card_token"); } catch (_) {}
    if (token) return "login.html?card_token=" + encodeURIComponent(token);
    return "login.html";
  }

  async function checkAccess() {
    var page = currentPage();

    if (PUBLIC_PAGES.has(page)) {
      grantAccess();
      return;
    }

    if (page === "login.html") {
      if (hasCardTokenInUrl() || hasStoredCardToken()) {
        grantAccess();
        return;
      }
      if (isSessionUnlocked()) {
        grantAccess();
        return;
      }
      if (await hasActivationKey()) {
        grantAccess();
        return;
      }
      denyAccess();
      return;
    }

    if (APP_PAGES.has(page)) {
      if (isSessionUnlocked()) {
        grantAccess();
        return;
      }
      if (hasStoredCardToken() || hasCardTokenInUrl()) {
        window.location.replace(buildLoginRedirect());
        return;
      }
      if (await hasActivationKey()) {
        window.location.replace("login.html");
        return;
      }
      denyAccess();
      return;
    }

    grantAccess();
  }

  window.GuardApi = {
    onAccessGranted: function (cb) {
      if (accessGranted) {
        try { cb(); } catch (_) {}
      } else if (typeof cb === "function") {
        pendingCallbacks.push(cb);
      }
    },
    isAccessGranted: function () {
      return accessGranted;
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", checkAccess, { once: true });
  } else {
    checkAccess();
  }
})();
