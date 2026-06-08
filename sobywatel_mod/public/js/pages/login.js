// login.js - hasło lokalne, po zalogowaniu wchodzi do documents.html

function showCustomModal(message, title, reloadOnClose) {
  var overlay = document.getElementById("customAlertOverlay");
  var titleEl = document.getElementById("customAlertTitle");
  var messageEl = document.getElementById("customAlertMessage");
  var closeBtn = document.getElementById("customAlertCloseBtn");
  if (!overlay) { alert(message); return; }
  titleEl.textContent = title || "Informacja";
  messageEl.textContent = message;
  overlay.style.display = "flex";
  var newBtn = closeBtn.cloneNode(true);
  closeBtn.parentNode.replaceChild(newBtn, closeBtn);
  newBtn.addEventListener("click", function() {
    overlay.style.display = "none";
    if (reloadOnClose) window.location.reload();
  });
}

function redirectToDashboard() {
  try { sessionStorage.setItem("from-login", "true"); } catch(e) {}
  try { sessionStorage.setItem("userUnlocked", "1"); } catch(e) {}
  window.location.href = "documents.html";
}

// Fix viewport height
(function() {
  function updateVh() {
    var h = (window.visualViewport && window.visualViewport.height) || window.innerHeight || 0;
    if (h > 0) document.documentElement.style.setProperty("--vh", (h * 0.01) + "px");
  }
  document.addEventListener("DOMContentLoaded", updateVh, {once: true});
  window.addEventListener("resize", updateVh);
  setTimeout(updateVh, 300);
})();

// Greeting
(function() {
  function setGreeting() {
    var title = document.querySelector(".login__title");
    if (!title) return;
    var h = new Date().getHours();
    title.textContent = (h >= 18 || h < 6) ? "Dobry wieczór!" : "Dzień dobry!";
  }
  document.addEventListener("DOMContentLoaded", setGreeting);
})();

async function sha256Hex(str) {
  const enc = new TextEncoder();
  const data = enc.encode(str);
  const buf = await (window.crypto && crypto.subtle && crypto.subtle.digest
    ? crypto.subtle.digest("SHA-256", data)
    : Promise.resolve(new Uint8Array()));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function handleLoginSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();
  var input = document.getElementById("passwordInput");
  var pwd = input && input.value ? String(input.value) : "";
  if (!pwd) { showPwdError("Wpisz hasło."); return; }

  var stored = null;
  try { stored = localStorage.getItem("userPasswordHash"); } catch(_) {}

  sha256Hex(pwd).then(function(h) {
    if (!stored) {
      try { localStorage.setItem("userPasswordHash", h); } catch(_) {}
      redirectToDashboard();
      return;
    }
    if (stored === h) {
      redirectToDashboard();
      return;
    }
    showPwdError("Wpisz poprawne hasło.");
  });
}

function showPwdError(msg) {
  var el = document.getElementById("passwordError");
  if (!el) return;
  if (msg) { el.textContent = msg; el.style.display = ""; }
  else { el.textContent = ""; el.style.display = "none"; }
}

document.addEventListener("DOMContentLoaded", function() {
  var biometricView = document.getElementById("biometricView");
  var passwordView = document.getElementById("passwordView");
  var submitPasswordBtn = document.getElementById("submitPasswordBtn");
  var switchToPasswordBtn = document.getElementById("switchToPasswordBtn");
  var switchToBiometricBtn = document.getElementById("switchToBiometricBtn");
  var biometricTapArea = document.getElementById("biometricTapArea");
  var logoToPasswordBtn = document.getElementById("logoToPasswordBtn");
  var eyeBtn = document.querySelector(".login__eye");
  var loginForm = document.getElementById("loginForm");

  function showBiometricView() {
    if (passwordView) passwordView.style.display = "none";
    if (submitPasswordBtn) submitPasswordBtn.style.display = "none";
    if (switchToBiometricBtn) switchToBiometricBtn.style.display = "none";
    if (biometricView) biometricView.style.display = "flex";
    if (switchToPasswordBtn) switchToPasswordBtn.style.display = "block";
  }
  function showPasswordView() {
    if (biometricView) biometricView.style.display = "none";
    if (switchToPasswordBtn) switchToPasswordBtn.style.display = "none";
    if (passwordView) passwordView.style.display = "block";
    if (submitPasswordBtn) submitPasswordBtn.style.display = "block";
  }

  showBiometricView();

  if (biometricTapArea) {
    biometricTapArea.addEventListener("click", function() {
      // Biometria nie jest dostępna bez PWA/HTTPS WebAuthn - przejdź do hasła
      showPasswordView();
    });
  }
  if (loginForm) loginForm.addEventListener("submit", handleLoginSubmit);
  if (submitPasswordBtn) submitPasswordBtn.addEventListener("click", handleLoginSubmit);
  if (switchToPasswordBtn) switchToPasswordBtn.addEventListener("click", showPasswordView);
  if (switchToBiometricBtn) switchToBiometricBtn.addEventListener("click", showBiometricView);
  if (logoToPasswordBtn) {
    logoToPasswordBtn.addEventListener("click", function() {
      if (passwordView && passwordView.style.display === "block") showBiometricView();
      else showPasswordView();
    });
  }
  if (eyeBtn) {
    eyeBtn.addEventListener("click", function(e) {
      e.preventDefault();
      var input = document.getElementById("passwordInput");
      if (input) input.type = (input.type === "password") ? "text" : "password";
    });
  }
  var forgot = document.querySelector(".login__forgot");
  if (forgot) {
    forgot.addEventListener("click", function(e) {
      e.preventDefault();
      if (confirm("Zresetować zapisane hasło?")) {
        try { localStorage.removeItem("userPasswordHash"); } catch(_) {}
        showCustomModal("Hasło zresetowane. Wpisz nowe.", "Sukces", true);
      }
    });
  }
});
