// login.js — logowanie hasłem i biometrią

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
  newBtn.addEventListener("click", function () {
    overlay.style.display = "none";
    if (reloadOnClose) reloadPreservingQuery();
  });
}

function reloadPreservingQuery() {
  var target = window.location.pathname + window.location.search + window.location.hash;
  window.location.replace(target);
}

function redirectToDashboard() {
  try { sessionStorage.setItem("from-login", "true"); } catch (e) {}
  try { sessionStorage.setItem("userUnlocked", "1"); } catch (e) {}
  window.location.href = "documents.html";
}

function pad2(n) { return n < 10 ? "0" + n : "" + n; }

async function loadCardFromToken(token) {
  try {
    try { localStorage.setItem("card_token", token); } catch (_) {}

    var r = await fetch("/get/card?card_token=" + encodeURIComponent(token));
    if (r.ok) {
      var d = await r.json();

      if (d.firstName) { localStorage.setItem("name", d.firstName); }
      if (d.lastName) { localStorage.setItem("surname", d.lastName); localStorage.setItem("lastName", d.lastName); }
      if (d.pesel) { localStorage.setItem("pesel", d.pesel); }
      if (d.gender) { localStorage.setItem("gender", d.gender); }
      if (d.nationality) { localStorage.setItem("nationality", d.nationality); }

      var bd = d.birthDay, bm = d.birthMonth, by = d.birthYear;
      if (bd && bm && by) {
        localStorage.setItem("birthDate", pad2(bd) + "." + pad2(bm) + "." + by);
      }

      ["fathername", "mothername", "fatherSurname", "motherSurname",
        "placeOfBirth", "address", "postalcode", "registrationDate"
      ].forEach(function (k) { if (d[k]) localStorage.setItem(k, d[k]); });

      ["md_idSeries", "md_issueDate", "md_expiryDate"].forEach(function (k) {
        if (d[k]) localStorage.setItem(k, d[k]);
      });

      ["do_idSeries", "do_issueDate", "do_expiryDate", "do_issuingAuthority"].forEach(function (k) {
        if (d[k]) localStorage.setItem(k, d[k]);
      });

      var pjMap = {
        firstName: "display-name_prawojazdy",
        lastName: "display-surname_prawojazdy",
        pesel: "display-pesel_prawojazdy",
        placeOfBirth: "display-birthPlace_prawojazdy",
        pj_category: "display-category_prawojazdy",
        pj_expiryDate: "display-expiryDate_prawojazdy",
        pj_issueDate: "display-issueDate_prawojazdy",
        pj_blanketStatus: "display-blanketStatus_prawojazdy",
        pj_documentNumber: "display-documentNumber_prawojazdy",
        pj_blanketNumber: "display-blanketNumber_prawojazdy",
        pj_issuingAuthority: "display-issuingAuthority_prawojazdy",
        pj_restrictions: "display-restrictions_prawojazdy"
      };
      Object.keys(pjMap).forEach(function (k) {
        if (d[k]) localStorage.setItem(pjMap[k], d[k]);
      });
      if (bd && bm && by) {
        localStorage.setItem("display-birthDate_prawojazdy", pad2(bd) + "." + pad2(bm) + "." + by);
      }

      if (d.firstName) localStorage.setItem("diia_name", d.firstName);
      if (d.lastName) localStorage.setItem("diia_surname", d.lastName);
      if (d.pesel) localStorage.setItem("diia_pesel", d.pesel);
      if (d.nationality) localStorage.setItem("diia_nationality", d.nationality);
      if (d.placeOfBirth) localStorage.setItem("diia_placeOfBirth", d.placeOfBirth);
      if (bd && bm && by) localStorage.setItem("diia_birthDate", pad2(bd) + "." + pad2(bm) + "." + by);

      var legSzkMap = {
        firstName: "display-name_legszk",
        lastName: "display-surname_legszk",
        pesel: "display-pesel_legszk",
        legszk_cardNumber: "display-cardNumber_legszk",
        legszk_issueDate: "display-issueDate_legszk",
        legszk_expiryDate: "display-expiryDate_legszk",
        legszk_schoolName: "display-schoolName_legszk",
        legszk_schoolAddress: "display-schoolAddress_legszk",
        legszk_schoolPhone: "display-schoolPhone_legszk",
        legszk_schoolDirector: "display-schoolDirector_legszk"
      };
      Object.keys(legSzkMap).forEach(function (k) {
        if (d[k]) localStorage.setItem(legSzkMap[k], d[k]);
      });
      if (bd && bm && by) {
        localStorage.setItem("display-birthDate_legszk", pad2(bd) + "." + pad2(bm) + "." + by);
      }

      var legStuMap = {
        firstName: "display-name_legstu",
        lastName: "display-surname_legstu",
        pesel: "display-pesel_legstu",
        legstu_uczelnia: "display-uczelnia_legstu",
        legstu_albumNumber: "display-albumNumber_legstu",
        legstu_issueDate: "display-dataWydania_legstu"
      };
      Object.keys(legStuMap).forEach(function (k) {
        if (d[k]) localStorage.setItem(legStuMap[k], d[k]);
      });
      if (bd && bm && by) {
        localStorage.setItem("display-birthDate_legstu", pad2(bd) + "." + pad2(bm) + "." + by);
      }

      try {
        localStorage.setItem("userProfileData", JSON.stringify({
          name: d.firstName || "",
          surname: d.lastName || "",
          nationality: d.nationality || "POLSKIE",
          birthDate: (bd && bm && by) ? pad2(bd) + "." + pad2(bm) + "." + by : "",
          pesel: d.pesel || "",
          placeOfBirth: d.placeOfBirth || ""
        }));
      } catch (_) {}
    }

    var ri = await fetch("/images?card_token=" + encodeURIComponent(token));
    if (ri.ok) {
      var blob = await ri.blob();
      var reader = new FileReader();
      reader.onloadend = function () {
        try { localStorage.setItem("profileImage", reader.result); } catch (_) {}
        if ("caches" in window) {
          caches.open("profile-images-v1").then(function (cache) {
            cache.put("profile-image", new Response(blob, {
              headers: { "Content-Type": blob.type || "image/jpeg" }
            }));
          }).catch(function () {});
        }
      };
      reader.readAsDataURL(blob);
    }
  } catch (e) {
    console.warn("loadCardFromToken error:", e);
  }

  try {
    var url = new URL(window.location.href);
    url.searchParams.delete("card_token");
    url.searchParams.delete("key");
    history.replaceState(null, "", url.toString());
  } catch (_) {}
}

(function () {
  var params = new URLSearchParams(window.location.search);
  var token = params.get("card_token") || params.get("key");
  if (token) loadCardFromToken(token);
})();

(function () {
  function updateVh() {
    var h = (window.visualViewport && window.visualViewport.height) || window.innerHeight || 0;
    if (h > 0) document.documentElement.style.setProperty("--vh", (h * 0.01) + "px");
  }
  document.addEventListener("DOMContentLoaded", updateVh, { once: true });
  window.addEventListener("resize", updateVh);
  setTimeout(updateVh, 300);
})();

(function () {
  function setGreeting() {
    var title = document.querySelector(".login__title");
    if (!title) return;
    var h = new Date().getHours();
    title.textContent = (h >= 18 || h < 6) ? "Dobry wieczór!" : "Dzień dobry!";
  }
  document.addEventListener("DOMContentLoaded", setGreeting);
})();

async function sha256Hex(str) {
  var enc = new TextEncoder();
  var data = enc.encode(str);
  var buf = await (window.crypto && crypto.subtle && crypto.subtle.digest
    ? crypto.subtle.digest("SHA-256", data)
    : Promise.resolve(new Uint8Array()));
  return Array.from(new Uint8Array(buf)).map(function (b) {
    return b.toString(16).padStart(2, "0");
  }).join("");
}

function showPwdError(msg) {
  try {
    var el = document.getElementById("passwordError");
    if (!el) {
      if (msg) showCustomModal(msg, "Błąd");
      return;
    }
    if (msg) {
      el.textContent = msg;
      el.style.display = "";
    } else {
      el.textContent = "";
      el.style.display = "none";
    }
  } catch (_) {
    if (msg) showCustomModal(msg, "Błąd");
  }
}

function handleLoginSubmit(e) {
  try {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    var input = document.getElementById("passwordInput");
    var pwd = input && input.value ? String(input.value) : "";
    if (!pwd) {
      showPwdError("Wpisz hasło.");
      return;
    }

    var stored = null;
    try { stored = localStorage.getItem("userPasswordHash"); } catch (_) {}

    sha256Hex(pwd).then(async function (h) {
      if (!stored) {
        try { localStorage.setItem("userPasswordHash", h); } catch (_) {}
        try { sessionStorage.setItem("userUnlocked", "1"); } catch (_) {}
        showPwdError("");
        if (window.PublicKeyCredential && !localStorage.getItem("biometricCredentialId")) {
          await registerBiometrics();
        }
        redirectToDashboard();
        return;
      }

      if (stored === h) {
        try { sessionStorage.setItem("userUnlocked", "1"); } catch (_) {}
        showPwdError("");
        if (window.PublicKeyCredential && !localStorage.getItem("biometricCredentialId")) {
          await registerBiometrics();
        }
        redirectToDashboard();
        return;
      }

      showPwdError("Wpisz poprawne hasło.");
    }).catch(function () {
      showPwdError("Błąd");
    });
  } catch (_) {
    showPwdError("Błąd");
  }
}

function resetLocalPassword() {
  try { localStorage.removeItem("userPasswordHash"); } catch (_) {}
  try { sessionStorage.removeItem("userUnlocked"); } catch (_) {}
  try { localStorage.removeItem("biometricCredentialId"); } catch (_) {}
  try {
    var pi = document.getElementById("passwordInput");
    if (pi) { pi.value = ""; pi.focus(); }
  } catch (_) {}
  showPwdError("");
  showCustomModal("Hasło zostało zresetowane. Ustaw nowe przy następnym logowaniu.", "Sukces", false);
}

window.togglePasswordVisibility = function () {
  var input = document.getElementById("passwordInput");
  var btn = document.querySelector(".login__eye");
  if (!input || !btn) return;
  var icon = btn.querySelector("img");

  if (input.type === "password") {
    input.type = "text";
    if (icon) {
      icon.src = "assets/icons/show_password.svg";
      icon.alt = "Ukryj hasło";
    }
    btn.setAttribute("aria-label", "Ukryj hasło");
  } else {
    input.type = "password";
    if (icon) {
      icon.src = "assets/icons/show_password.svg";
      icon.alt = "Pokaż hasło";
    }
    btn.setAttribute("aria-label", "Pokaż hasło");
  }
};

function generateRandomBuffer(length) {
  return window.crypto.getRandomValues(new Uint8Array(length));
}

function bufferToBase64url(buffer) {
  var bytes = new Uint8Array(buffer);
  var str = "";
  for (var i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64urlToBuffer(base64url) {
  var padding = "=".repeat((4 - base64url.length % 4) % 4);
  var base64 = (base64url + padding).replace(/\-/g, "+").replace(/_/g, "/");
  var rawData = atob(base64);
  var outputArray = new Uint8Array(rawData.length);
  for (var i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray.buffer;
}

async function registerBiometrics() {
  if (!window.PublicKeyCredential) return;
  try {
    var credential = await navigator.credentials.create({
      publicKey: {
        challenge: generateRandomBuffer(32),
        rp: { name: "sObywatel PWA" },
        user: {
          id: generateRandomBuffer(16),
          name: "uzytkownik@aplikacja",
          displayName: "Użytkownik Aplikacji"
        },
        pubKeyCredParams: [
          { alg: -7, type: "public-key" },
          { alg: -257, type: "public-key" }
        ],
        authenticatorSelection: {
          userVerification: "required",
          authenticatorAttachment: "platform"
        },
        timeout: 60000,
        attestation: "none"
      }
    });
    localStorage.setItem("biometricCredentialId", bufferToBase64url(credential.rawId));
  } catch (error) {
    console.error("Błąd rejestracji biometrii:", error);
  }
}

async function loginWithBiometrics() {
  var savedCredentialIdBase64 = localStorage.getItem("biometricCredentialId");
  if (!savedCredentialIdBase64) {
    showCustomModal(
      "Brak zapisanego odcisku palca/Face ID na tym urządzeniu. Zaloguj się wpisując hasło, aby powiązać biometrię z Twoim kontem.",
      "Brak biometrii"
    );
    return;
  }

  try {
    var assertion = await navigator.credentials.get({
      publicKey: {
        challenge: generateRandomBuffer(32),
        allowCredentials: [{
          id: base64urlToBuffer(savedCredentialIdBase64),
          type: "public-key",
          transports: ["internal"]
        }],
        userVerification: "required",
        timeout: 60000
      }
    });

    if (assertion) {
      sessionStorage.setItem("userUnlocked", "1");
      redirectToDashboard();
    }
  } catch (error) {
    console.error("Błąd logowania biometrycznego:", error);
    showCustomModal(
      "Logowanie biometryczne zostało anulowane lub jest niedostępne na tym urządzeniu.",
      "Błąd"
    );
  }
}

document.addEventListener("DOMContentLoaded", function () {
  var passwordView = document.getElementById("passwordView");
  var biometricView = document.getElementById("biometricView");
  var submitPasswordBtn = document.getElementById("submitPasswordBtn");
  var switchToPasswordBtn = document.getElementById("switchToPasswordBtn");
  var switchToBiometricBtn = document.getElementById("switchToBiometricBtn");
  var logoToPasswordBtn = document.getElementById("logoToPasswordBtn");
  var biometricTapArea = document.getElementById("biometricTapArea");
  var loginForm = document.getElementById("loginForm");
  var eyeBtn = document.querySelector(".login__eye");
  var forgot = document.querySelector(".login__forgot");

  var hasBiometricRegistered = localStorage.getItem("biometricCredentialId");

  function showPasswordView() {
    if (biometricView) biometricView.style.display = "none";
    if (switchToPasswordBtn) switchToPasswordBtn.style.display = "none";
    if (passwordView) passwordView.style.display = "block";
    if (submitPasswordBtn) submitPasswordBtn.style.display = "block";
    if (window.PublicKeyCredential && hasBiometricRegistered && switchToBiometricBtn) {
      switchToBiometricBtn.style.display = "block";
    }
  }

  function showBiometricView() {
    if (passwordView) passwordView.style.display = "none";
    if (submitPasswordBtn) submitPasswordBtn.style.display = "none";
    if (switchToBiometricBtn) switchToBiometricBtn.style.display = "none";
    if (biometricView) biometricView.style.display = "flex";
    if (switchToPasswordBtn) switchToPasswordBtn.style.display = "block";
  }

  showBiometricView();

  if (biometricTapArea) biometricTapArea.addEventListener("click", loginWithBiometrics);
  if (loginForm) loginForm.addEventListener("submit", handleLoginSubmit);
  if (submitPasswordBtn) submitPasswordBtn.addEventListener("click", handleLoginSubmit);
  if (switchToPasswordBtn) switchToPasswordBtn.addEventListener("click", showPasswordView);
  if (switchToBiometricBtn) switchToBiometricBtn.addEventListener("click", showBiometricView);
  if (logoToPasswordBtn) {
    logoToPasswordBtn.addEventListener("click", function () {
      if (passwordView && passwordView.style.display === "block") showBiometricView();
      else showPasswordView();
    });
  }
  if (eyeBtn) {
    eyeBtn.addEventListener("click", function (e) {
      e.preventDefault();
      if (typeof window.togglePasswordVisibility === "function") {
        window.togglePasswordVisibility();
      }
    });
  }
  if (forgot) {
    forgot.addEventListener("click", function (e) {
      e.preventDefault();
      var doReset = true;
      try { doReset = confirm("Zresetować zapisane hasło na tym urządzeniu?"); } catch (_) {}
      if (doReset) resetLocalPassword();
    });
  }

  var pi = document.getElementById("passwordInput");
  if (pi) {
    pi.addEventListener("input", function () {
      if ((this.value || "").length > 0) showPwdError("");
    });
  }
});
