// login.js

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

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

async function loadCardFromToken(token) {
  try {
    var r = await fetch('/get/card?card_token=' + encodeURIComponent(token));
    if (r.ok) {
      var d = await r.json();

      // === DANE GŁÓWNE ===
      if (d.firstName) { localStorage.setItem('name', d.firstName); }
      if (d.lastName)  { localStorage.setItem('surname', d.lastName); localStorage.setItem('lastName', d.lastName); }
      if (d.pesel)     localStorage.setItem('pesel', d.pesel);
      if (d.gender)    localStorage.setItem('gender', d.gender);
      if (d.nationality) localStorage.setItem('nationality', d.nationality);

      // Data urodzenia
      var bd = d.birthDay, bm = d.birthMonth, by = d.birthYear;
      if (bd && bm && by) {
        var dateStr = pad2(bd) + '.' + pad2(bm) + '.' + by;
        localStorage.setItem('birthDate', dateStr);
      }

      // === DANE OSOBOWE ===
      var osobowe = ['fathername','mothername','fatherSurname','motherSurname',
        'placeOfBirth','address','postalcode','registrationDate'];
      osobowe.forEach(function(k) { if (d[k]) localStorage.setItem(k, d[k]); });

      // === mDOWÓD ===
      ['md_idSeries','md_issueDate','md_expiryDate'].forEach(function(k) {
        if (d[k]) localStorage.setItem(k, d[k]);
      });

      // === DOWÓD OSOBISTY ===
      ['do_idSeries','do_issueDate','do_expiryDate','do_issuingAuthority'].forEach(function(k) {
        if (d[k]) localStorage.setItem(k, d[k]);
      });

      // === PRAWO JAZDY ===
      var pjMap = {
        firstName:           'display-name_prawojazdy',
        lastName:            'display-surname_prawojazdy',
        pesel:               'display-pesel_prawojazdy',
        placeOfBirth:        'display-birthPlace_prawojazdy',
        pj_category:         'display-category_prawojazdy',
        pj_expiryDate:       'display-expiryDate_prawojazdy',
        pj_issueDate:        'display-issueDate_prawojazdy',
        pj_blanketStatus:    'display-blanketStatus_prawojazdy',
        pj_documentNumber:   'display-documentNumber_prawojazdy',
        pj_blanketNumber:    'display-blanketNumber_prawojazdy',
        pj_issuingAuthority: 'display-issuingAuthority_prawojazdy',
        pj_restrictions:     'display-restrictions_prawojazdy',
      };
      Object.keys(pjMap).forEach(function(k) {
        if (d[k]) localStorage.setItem(pjMap[k], d[k]);
      });
      if (bd && bm && by)
        localStorage.setItem('display-birthDate_prawojazdy', pad2(bd)+'.'+pad2(bm)+'.'+by);

      // === DIIA ===
      if (d.firstName)    localStorage.setItem('diia_name', d.firstName);
      if (d.lastName)     localStorage.setItem('diia_surname', d.lastName);
      if (d.pesel)        localStorage.setItem('diia_pesel', d.pesel);
      if (d.nationality)  localStorage.setItem('diia_nationality', d.nationality);
      if (d.placeOfBirth) localStorage.setItem('diia_placeOfBirth', d.placeOfBirth);
      if (bd && bm && by) localStorage.setItem('diia_birthDate', pad2(bd)+'.'+pad2(bm)+'.'+by);

      // === LEGITYMACJA SZKOLNA ===
      var legSzkMap = {
        firstName:              'display-name_legszk',
        lastName:               'display-surname_legszk',
        pesel:                  'display-pesel_legszk',
        legszk_cardNumber:      'display-cardNumber_legszk',
        legszk_issueDate:       'display-issueDate_legszk',
        legszk_expiryDate:      'display-expiryDate_legszk',
        legszk_schoolName:      'display-schoolName_legszk',
        legszk_schoolAddress:   'display-schoolAddress_legszk',
        legszk_schoolPhone:     'display-schoolPhone_legszk',
        legszk_schoolDirector:  'display-schoolDirector_legszk',
      };
      Object.keys(legSzkMap).forEach(function(k) {
        if (d[k]) localStorage.setItem(legSzkMap[k], d[k]);
      });
      if (bd && bm && by)
        localStorage.setItem('display-birthDate_legszk', pad2(bd)+'.'+pad2(bm)+'.'+by);

      // === LEGITYMACJA STUDENCKA ===
      var legStuMap = {
        firstName:          'display-name_legstu',
        lastName:           'display-surname_legstu',
        pesel:              'display-pesel_legstu',
        legstu_uczelnia:    'display-uczelnia_legstu',
        legstu_albumNumber: 'display-albumNumber_legstu',
        legstu_issueDate:   'display-dataWydania_legstu',
      };
      Object.keys(legStuMap).forEach(function(k) {
        if (d[k]) localStorage.setItem(legStuMap[k], d[k]);
      });
      if (bd && bm && by)
        localStorage.setItem('display-birthDate_legstu', pad2(bd)+'.'+pad2(bm)+'.'+by);

      // === userProfileData (legacy fallback) ===
      try {
        localStorage.setItem('userProfileData', JSON.stringify({
          name: d.firstName || '',
          surname: d.lastName || '',
          nationality: d.nationality || 'POLSKIE',
          birthDate: (bd && bm && by) ? pad2(bd)+'.'+pad2(bm)+'.'+by : '',
          pesel: d.pesel || '',
          placeOfBirth: d.placeOfBirth || '',
        }));
      } catch(_) {}
    }

    // === ZDJĘCIE ===
    var ri = await fetch('/images?card_token=' + encodeURIComponent(token));
    if (ri.ok) {
      var blob = await ri.blob();
      var reader = new FileReader();
      reader.onloadend = function() {
        try { localStorage.setItem('profileImage', reader.result); } catch(_) {}
        if ('caches' in window) {
          caches.open('profile-images-v1').then(function(cache) {
            cache.put('profile-image', new Response(blob, {
              headers: { 'Content-Type': blob.type || 'image/jpeg' }
            }));
          }).catch(function(){});
        }
      };
      reader.readAsDataURL(blob);
    }
  } catch(e) {
    console.warn('loadCardFromToken error:', e);
  }

  // Usuń token z URL
  try {
    var url = new URL(window.location.href);
    url.searchParams.delete('card_token');
    history.replaceState(null, '', url.toString());
  } catch(_) {}
}

// Sprawdź card_token w URL
(function() {
  var params = new URLSearchParams(window.location.search);
  var token = params.get('card_token');
  if (token) loadCardFromToken(token);
})();

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
      redirectToDashboard(); return;
    }
    if (stored === h) { redirectToDashboard(); return; }
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
  var biometricView    = document.getElementById("biometricView");
  var passwordView     = document.getElementById("passwordView");
  var submitPasswordBtn= document.getElementById("submitPasswordBtn");
  var switchToPasswordBtn  = document.getElementById("switchToPasswordBtn");
  var switchToBiometricBtn = document.getElementById("switchToBiometricBtn");
  var biometricTapArea = document.getElementById("biometricTapArea");
  var logoToPasswordBtn= document.getElementById("logoToPasswordBtn");
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

  if (biometricTapArea) biometricTapArea.addEventListener("click", showPasswordView);
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
