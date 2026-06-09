/**
 * Kreator danych w czacie — komenda /kreator
 * v2 - Izolacja localStorage per card_token, wszystkie pola obowiązkowe
 * Zbiera dane + zdjęcie, zapisuje do Neon i synchronizuje localStorage.
 */
(function () {
  'use strict';

  var ctx = null;
  var active = false;
  var stepIndex = 0;
  var mode = null;
  var docType = null;
  var collected = {};
  var photoInput = null;
  var editMode = false;
  var editCardToken = null;
  var STEPS = [];

  var DOC_TYPES = [
    { id: 'mdowod', label: 'mDowód' },
    { id: 'dowod', label: 'Dowód osobisty' },
    { id: 'prawojazdy', label: 'Prawo jazdy' },
    { id: 'pojazdy', label: 'Pojazdy' },
    { id: 'legszk', label: 'Legitymacja szkolna' },
    { id: 'legstu', label: 'Legitymacja studencka' },
    { id: 'diia', label: 'Diia' }
  ];

  var MALE_NAMES = ['Jan', 'Piotr', 'Krzysztof', 'Andrzej', 'Tomasz', 'Paweł', 'Marcin', 'Michał', 'Łukasz', 'Adam'];
  var FEMALE_NAMES = ['Anna', 'Maria', 'Katarzyna', 'Małgorzata', 'Agnieszka', 'Barbara', 'Ewa', 'Elżbieta', 'Zofia', 'Joanna'];
  var SURNAMES = ['Kowalski', 'Nowak', 'Wiśniewski', 'Wójcik', 'Kowalczyk', 'Kamiński', 'Lewandowski', 'Zieliński', 'Szymański', 'Woźniak'];
  var CITIES = ['Warszawa', 'Kraków', 'Łódź', 'Wrocław', 'Poznań', 'Gdańsk', 'Szczecin', 'Bydgoszcz', 'Lublin', 'Białystok'];
  var STREETS = ['Marszałkowska', 'Krakowskie Przedmieście', 'Piotrkowska', 'Długa', 'Świętojańska', 'Lipowa', 'Polna', 'Leśna'];
  var PJ_CATEGORIES = ['B', 'B1', 'AM', 'A1', 'A2', 'C', 'C1', 'D'];
  var AUTHORITIES = ['PREZYDENT M. ST. WARSZAWY', 'STAROSTA M. ST. WARSZAWY', 'PREZYDENT MIASTA KRAKOWA', 'WOJEWODA MAZOWIECKI'];

  var BASE_STEPS = [
    { key: 'firstName', label: 'Imię', placeholder: 'np. Jan', required: true },
    { key: 'lastName', label: 'Nazwisko', placeholder: 'np. Kowalski', required: true },
    { key: 'birthDate', label: 'Data urodzenia', placeholder: 'DD.MM.RRRR', required: true, parse: parseBirthDate },
    { key: 'gender', label: 'Płeć', choices: [{ label: 'Mężczyzna', value: 'M' }, { label: 'Kobieta', value: 'K' }], required: true },
    { key: 'pesel', label: 'PESEL (11 cyfr)', placeholder: '00000000000', required: true, validate: validatePesel },
    { key: 'nationality', label: 'Narodowość', placeholder: 'POLSKIE', default: 'POLSKIE', required: true },
    { key: 'placeOfBirth', label: 'Miejsce urodzenia', placeholder: 'np. Warszawa', required: true },
    { key: 'address', label: 'Adres zameldowania', placeholder: 'ul. Przykładowa 1, Warszawa', required: true },
    { key: 'postalcode', label: 'Kod pocztowy', placeholder: '00-000', required: true },
    { key: 'fathername', label: 'Imię ojca', placeholder: 'np. Jan', required: true },
    { key: 'mothername', label: 'Imię matki', placeholder: 'np. Anna', required: true },
    { key: 'fatherSurname', label: 'Nazwisko ojca', placeholder: 'np. Kowalski', required: true },
    { key: 'motherSurname', label: 'Nazwisko matki', placeholder: 'np. Kowalska', required: true }
  ];

  var DOC_EXTRA_STEPS = {
    mdowod: [
      { key: 'registrationDate', label: 'Data zameldowania', placeholder: 'DD.MM.RRRR', required: true },
      { key: 'md_idSeries', label: 'Seria mDowodu', placeholder: 'ABC 123456', required: true },
      { key: 'md_issueDate', label: 'Data wydania mDowodu (auto: ur. + 18)', placeholder: 'DD.MM.RRRR', required: true, readonly: true },
      { key: 'md_expiryDate', label: 'Data ważności mDowodu (auto: ur. + 23)', placeholder: 'DD.MM.RRRR', required: true, readonly: true }
    ],
    dowod: [
      { key: 'do_idSeries', label: 'Seria dowodu osobistego', placeholder: 'ABC 123456', required: true },
      { key: 'do_issueDate', label: 'Data wydania dowodu (auto: ur. + 18)', placeholder: 'DD.MM.RRRR', required: true, readonly: true },
      { key: 'do_expiryDate', label: 'Data ważności dowodu (auto: ur. + 28)', placeholder: 'DD.MM.RRRR', required: true, readonly: true },
      { key: 'do_issuingAuthority', label: 'Organ wydający', placeholder: 'PREZYDENT M. ST. WARSZAWY', required: true }
    ],
    prawojazdy: [
      { key: 'pj_category', label: 'Kategoria prawa jazdy', choices: PJ_CATEGORIES.map(function (c) { return { label: c, value: c }; }), required: true },
      { key: 'pj_documentNumber', label: 'Numer dokumentu PJ', placeholder: 'np. 12345/06/2020', required: true },
      { key: 'pj_issueDate', label: 'Data wydania PJ (auto: ur. + 18)', placeholder: 'DD.MM.RRRR', required: true, readonly: true },
      { key: 'pj_expiryDate', label: 'Data ważności PJ (auto: ur. + 28)', placeholder: 'DD.MM.RRRR', required: true, readonly: true },
      { key: 'pj_issuingAuthority', label: 'Organ wydający PJ', placeholder: 'STAROSTA...', required: true },
      { key: 'pj_blanketNumber', label: 'Numer blankietu', placeholder: 'np. 123456', required: true },
      { key: 'pj_blanketStatus', label: 'Status blankietu', placeholder: 'Wydany', required: true, default: 'Wydany' },
      { key: 'pj_restrictions', label: 'Ograniczenia', placeholder: 'brak', required: true, default: 'brak' }
    ],
    pojazdy: [
      { key: 'pojazdy_make', label: 'Marka pojazdu', placeholder: 'np. Toyota', required: true },
      { key: 'pojazdy_model', label: 'Model pojazdu', placeholder: 'np. Corolla', required: true },
      { key: 'pojazdy_vin', label: 'Numer VIN', placeholder: 'np. JTDCB21K823445234', required: true },
      { key: 'pojazdy_registrationPlate', label: 'Tablica rejestracyjna', placeholder: 'np. WA 12345', required: true },
      { key: 'pojazdy_issueDate', label: 'Data rejestracji (auto: ur. + 18)', placeholder: 'DD.MM.RRRR', required: true, readonly: true }
    ],
    legszk: [
      { key: 'legszk_cardNumber', label: 'Numer legitymacji', placeholder: 'np. 123/2024', required: true },
      { key: 'legszk_issueDate', label: 'Data wydania legitymacji (auto: ur. + 18)', placeholder: 'DD.MM.RRRR', required: true, readonly: true },
      { key: 'legszk_expiryDate', label: 'Data ważności legitymacji (auto: ur. + 28)', placeholder: 'DD.MM.RRRR', required: true, readonly: true },
      { key: 'legszk_schoolName', label: 'Nazwa szkoły', placeholder: 'np. LO im. Kopernika', required: true },
      { key: 'legszk_schoolAddress', label: 'Adres szkoły', placeholder: 'ul. Szkolna 1', required: true },
      { key: 'legszk_schoolPhone', label: 'Telefon szkoły', placeholder: '+48 12 345 67 89', required: true },
      { key: 'legszk_schoolDirector', label: 'Dyrektor szkoły', placeholder: 'np. Jan Kowalski', required: true }
    ],
    legstu: [
      { key: 'legstu_uczelnia', label: 'Uczelnia', placeholder: 'np. Uniwersytet Warszawski', required: true },
      { key: 'legstu_albumNumber', label: 'Numer albumu', placeholder: 'np. 123456', required: true },
      { key: 'legstu_issueDate', label: 'Data wydania legitymacji (auto: ur. + 18)', placeholder: 'DD.MM.RRRR', required: true, readonly: true }
    ],
    diia: [
      { key: 'diia_countryOfOrigin', label: 'Kraj pochodzenia', placeholder: 'np. Ukraina', required: true },
      { key: 'diia_documentNumber', label: 'Numer dokumentu DIIA', placeholder: 'np. 123456789', required: true }
    ]
  };

  // ════════════════════════════════════════════════════════════════
  // HELPERS
  // ════════════════════════════════════════════════════════════════

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function pad2(n) { var s = String(n); return s.length >= 2 ? s.slice(-2) : ('0' + s); }
  function randInt(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }

  function validatePesel(v) {
    return /^\d{11}$/.test(String(v || '').trim()) ? null : 'PESEL musi mieć 11 cyfr.';
  }

  function parseBirthDate(v) {
    var m = String(v || '').trim().match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
    if (!m) return { error: 'Podaj datę jako DD.MM.RRRR' };
    collected.birthDay = pad2(m[1]);
    collected.birthMonth = pad2(m[2]);
    collected.birthYear = m[3];
    return { ok: true };
  }

  function formatDateParts(day, month, year) {
    return pad2(day) + '.' + pad2(month) + '.' + year;
  }

  function addYearsToBirth(years) {
    if (!collected.birthDay || !collected.birthMonth || !collected.birthYear) return null;
    var y = parseInt(collected.birthYear, 10) + years;
    return formatDateParts(collected.birthDay, collected.birthMonth, String(y));
  }

  function randomBirthParts() {
    var now = new Date();
    var age = randInt(18, 60);
    var year = now.getFullYear() - age;
    var month = randInt(1, 12);
    var day = randInt(1, 28);
    return { day: pad2(day), month: pad2(month), year: String(year) };
  }

  function applyBirthParts(parts) {
    collected.birthDay = parts.day;
    collected.birthMonth = parts.month;
    collected.birthYear = parts.year;
    collected.birthDate = formatDateParts(parts.day, parts.month, parts.year);
    applyDerivedDates();
  }

  function applyDerivedDates() {
    var issue18 = addYearsToBirth(18);
    var expiry23 = addYearsToBirth(23);
    var expiry28 = addYearsToBirth(28);
    if (!issue18) return;

    if (docType === 'mdowod') {
      if (!collected.md_issueDate) collected.md_issueDate = issue18;
      if (!collected.md_expiryDate) collected.md_expiryDate = expiry23;
      if (!collected.registrationDate) collected.registrationDate = issue18;
    }
    if (docType === 'dowod') {
      if (!collected.do_issueDate) collected.do_issueDate = issue18;
      if (!collected.do_expiryDate) collected.do_expiryDate = expiry28;
      if (!collected.registrationDate) collected.registrationDate = issue18;
    }
    if (docType === 'prawojazdy') {
      if (!collected.pj_issueDate) collected.pj_issueDate = issue18;
      if (!collected.pj_expiryDate) collected.pj_expiryDate = expiry28;
    }
    if (docType === 'pojazdy') {
      if (!collected.pojazdy_issueDate) collected.pojazdy_issueDate = issue18;
    }
    if (docType === 'legszk') {
      if (!collected.legszk_issueDate) collected.legszk_issueDate = issue18;
      if (!collected.legszk_expiryDate) collected.legszk_expiryDate = expiry28;
    }
    if (docType === 'legstu') {
      if (!collected.legstu_issueDate) collected.legstu_issueDate = issue18;
    }
  }

  function genPeselFromBirth() {
    var day = collected.birthDay;
    var month = collected.birthMonth;
    var year = collected.birthYear;
    var gender = collected.gender;
    if (!day || !month || !year || !gender) return null;
    var yy = parseInt(year, 10) % 100;
    var mm = parseInt(month, 10) + (parseInt(year, 10) >= 2000 ? 20 : 0);
    var dd = parseInt(day, 10);
    var r1 = Math.floor(Math.random() * 10);
    var r2 = Math.floor(Math.random() * 10);
    var r3 = Math.floor(Math.random() * 10);
    var r4;
    if (gender === 'M') { do { r4 = Math.floor(Math.random() * 10); } while (r4 % 2 === 0); }
    else { do { r4 = Math.floor(Math.random() * 10); } while (r4 % 2 !== 0); }
    var digits = [
      Math.floor(yy / 10), yy % 10,
      Math.floor(mm / 10), mm % 10,
      Math.floor(dd / 10), dd % 10,
      r1, r2, r3, r4
    ];
    var weights = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
    var sum = 0;
    for (var i = 0; i < 10; i++) sum += digits[i] * weights[i];
    digits.push((10 - (sum % 10)) % 10);
    return digits.join('');
  }

  function genDocSeries() {
    var letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    var s = '';
    for (var i = 0; i < 3; i++) s += letters[Math.floor(Math.random() * 26)];
    s += ' ';
    for (var j = 0; j < 6; j++) s += Math.floor(Math.random() * 10);
    return s;
  }

  function genPostalCode() {
    return pad2(randInt(0, 99)) + '-' + pad2(randInt(100, 999));
  }

  function buildStepsForDoc(type) {
    var extras = DOC_EXTRA_STEPS[type] || [];
    return BASE_STEPS.concat(extras);
  }

  function hasExistingPhoto() {
    try {
      var token = getCardTokenForStorage();
      return !!(getLocalStorageForCard(token, 'profileImage') || getLocalStorageForCard(token, 'photo'));
    } catch (_) { return false; }
  }

  function needsPhotoStep() {
    if (docType === 'prawojazdy' || docType === 'legszk' || docType === 'legstu' || docType === 'diia' || docType === 'pojazdy') {
      return !hasExistingPhoto();
    }
    return docType === 'mdowod' || docType === 'dowod';
  }

  function generateRandomForStep(step) {
    if (!step) return false;

    if (step.choices && step.choices.length) {
      var choice = pick(step.choices);
      collected[step.key] = choice.value;
      return true;
    }

    switch (step.key) {
      case 'firstName':
        if (!collected.gender) collected.gender = pick(['M', 'K']);
        collected.firstName = collected.gender === 'K' ? pick(FEMALE_NAMES) : pick(MALE_NAMES);
        return true;
      case 'lastName':
        collected.lastName = pick(SURNAMES);
        return true;
      case 'gender':
        collected.gender = pick(['M', 'K']);
        return true;
      case 'birthDate':
        applyBirthParts(randomBirthParts());
        return true;
      case 'pesel':
        if (!collected.birthDay) applyBirthParts(randomBirthParts());
        if (!collected.gender) collected.gender = pick(['M', 'K']);
        collected.pesel = genPeselFromBirth();
        return true;
      case 'nationality':
        collected.nationality = 'POLSKIE';
        return true;
      case 'placeOfBirth':
        collected.placeOfBirth = pick(CITIES);
        return true;
      case 'address': {
        var city = pick(CITIES);
        collected.address = 'ul. ' + pick(STREETS) + ' ' + randInt(1, 120) + ', ' + city;
        if (!collected.postalcode) collected.postalcode = genPostalCode();
        return true;
      }
      case 'postalcode':
        collected.postalcode = genPostalCode();
        return true;
      case 'fathername':
        collected.fathername = pick(MALE_NAMES);
        return true;
      case 'mothername':
        collected.mothername = pick(FEMALE_NAMES);
        return true;
      case 'fatherSurname':
        collected.fatherSurname = pick(SURNAMES);
        return true;
      case 'motherSurname':
        collected.motherSurname = pick(SURNAMES);
        return true;
      case 'registrationDate':
        if (!collected.birthDay) applyBirthParts(randomBirthParts());
        collected.registrationDate = addYearsToBirth(18);
        return true;
      case 'md_idSeries':
      case 'do_idSeries':
        collected[step.key] = genDocSeries();
        return true;
      case 'md_issueDate':
      case 'do_issueDate':
      case 'pj_issueDate':
      case 'legszk_issueDate':
      case 'legstu_issueDate':
      case 'pojazdy_issueDate':
        if (!collected.birthDay) applyBirthParts(randomBirthParts());
        collected[step.key] = addYearsToBirth(18);
        return true;
      case 'md_expiryDate':
        if (!collected.birthDay) applyBirthParts(randomBirthParts());
        collected.md_expiryDate = addYearsToBirth(23);
        return true;
      case 'do_expiryDate':
      case 'pj_expiryDate':
      case 'legszk_expiryDate':
        if (!collected.birthDay) applyBirthParts(randomBirthParts());
        collected[step.key] = addYearsToBirth(28);
        return true;
      case 'do_issuingAuthority':
      case 'pj_issuingAuthority':
        collected[step.key] = pick(AUTHORITIES);
        return true;
      case 'pj_category':
        collected.pj_category = pick(PJ_CATEGORIES);
        return true;
      case 'pj_documentNumber':
        if (!collected.birthDay) applyBirthParts(randomBirthParts());
        collected.pj_documentNumber = randInt(10000, 99999) + '/' + pad2(randInt(1, 12)) + '/' + (collected.birthYear ? addYearsToBirth(18).split('.')[2] : randInt(2018, 2025));
        return true;
      case 'pj_blanketNumber':
        collected.pj_blanketNumber = String(randInt(100000, 999999));
        return true;
      case 'pj_blanketStatus':
        collected.pj_blanketStatus = 'Wydany';
        return true;
      case 'pj_restrictions':
        collected.pj_restrictions = 'brak';
        return true;
      case 'legszk_cardNumber':
        collected.legszk_cardNumber = randInt(1, 999) + '/' + new Date().getFullYear();
        return true;
      case 'legszk_schoolName':
        collected.legszk_schoolName = 'Liceum Ogólnokształcące nr ' + randInt(1, 50) + ' w ' + pick(CITIES);
        return true;
      case 'legszk_schoolAddress':
        collected.legszk_schoolAddress = 'ul. Szkolna ' + randInt(1, 50) + ', ' + pick(CITIES);
        return true;
      case 'legszk_schoolPhone':
        collected.legszk_schoolPhone = '+48 ' + randInt(500, 799) + ' ' + randInt(100, 999) + ' ' + randInt(100, 999);
        return true;
      case 'legszk_schoolDirector':
        collected.legszk_schoolDirector = pick(MALE_NAMES) + ' ' + pick(SURNAMES);
        return true;
      case 'legstu_uczelnia':
        collected.legstu_uczelnia = 'Uniwersytet w ' + pick(CITIES);
        return true;
      case 'legstu_albumNumber':
        collected.legstu_albumNumber = String(randInt(100000, 999999));
        return true;
      case 'pojazdy_make':
        collected.pojazdy_make = pick(['Toyota', 'Honda', 'BMW', 'Audi', 'Mercedes', 'Volkswagen']);
        return true;
      case 'pojazdy_model':
        collected.pojazdy_model = pick(['A4', 'Corolla', 'Civic', '3 Series', 'C-Class']);
        return true;
      case 'pojazdy_vin':
        collected.pojazdy_vin = 'JTDCB21K' + randInt(100000000, 999999999);
        return true;
      case 'pojazdy_registrationPlate':
        collected.pojazdy_registrationPlate = 'WA ' + randInt(10000, 99999);
        return true;
      case 'diia_countryOfOrigin':
        collected.diia_countryOfOrigin = 'Ukraina';
        return true;
      case 'diia_documentNumber':
        collected.diia_documentNumber = String(randInt(100000000, 999999999));
        return true;
      default:
        return false;
    }
  }

  // ════════════════════════════════════════════════════════════════
  // LOCALSTORAGE ISOLATION PER CARD_TOKEN
  // ════════════════════════════════════════════════════════════════

  function getCardTokenForStorage() {
    if (editCardToken) return editCardToken;
    try { return localStorage.getItem('card_token') || null; } catch (_) { return null; }
  }

  function getLocalStorageForCard(token, key) {
    try {
      if (!token) return localStorage.getItem(key);
      var namespaced = 'card_' + token + '_' + key;
      return localStorage.getItem(namespaced) || localStorage.getItem(key);
    } catch (_) { return null; }
  }

  function setLocalStorageForCard(token, key, value) {
    try {
      if (!token) {
        localStorage.setItem(key, value);
        return;
      }
      var namespaced = 'card_' + token + '_' + key;
      localStorage.setItem(namespaced, value);
    } catch (_) {}
  }

  // ════════════════════════════════════════════════════════════════
  // CRYPTO + DB
  // ════════════════════════════════════════════════════════════════

  async function sha256Hex(text) {
    var enc = new TextEncoder().encode(text);
    var buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map(function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  }

  async function normalizeKey(v) {
    var c = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (c.length !== 16) return null;
    return c.match(/.{1,4}/g).join('-');
  }

  async function getActivationHash() {
    try {
      var db = await new Promise(function (resolve, reject) {
        var r = indexedDB.open('access-control', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('auth'); };
        r.onsuccess = function () { resolve(r.result); };
        r.onerror = function () { reject(r.error); };
      });
      var hash = await new Promise(function (resolve, reject) {
        var tx = db.transaction('auth', 'readonly');
        var req = tx.objectStore('auth').get('hash');
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
      if (hash) return hash;
    } catch (_) {}

    try {
      var plain = localStorage.getItem('moj_tajny_klucz');
      if (plain) {
        var norm = await normalizeKey(plain);
        if (norm) return await sha256Hex(norm);
      }
    } catch (_) {}
    return null;
  }

  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) {
        var img = new Image();
        img.onload = function () {
          var canvas = document.createElement('canvas');
          var MAX = 1400;
          var w = img.width;
          var h = img.height;
          if (w > h) {
            if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
          } else {
            if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
          }
          canvas.width = w;
          canvas.height = h;
          var c = canvas.getContext('2d', { alpha: false });
          c.imageSmoothingEnabled = true;
          c.imageSmoothingQuality = 'high';
          c.fillStyle = '#ffffff';
          c.fillRect(0, 0, w, h);
          c.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.96));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function applyToLocalStorage(data) {
    var token = getCardTokenForStorage();
    
    // Wspólne pola
    setLocalStorageForCard(token, 'name', data.firstName);
    setLocalStorageForCard(token, 'surname', data.lastName);
    setLocalStorageForCard(token, 'lastName', data.lastName);
    setLocalStorageForCard(token, 'pesel', data.pesel);
    setLocalStorageForCard(token, 'gender', data.gender);
    setLocalStorageForCard(token, 'nationality', data.nationality);
    
    if (data.birthDay && data.birthMonth && data.birthYear) {
      var bdStr = pad2(data.birthDay) + '.' + pad2(data.birthMonth) + '.' + data.birthYear;
      setLocalStorageForCard(token, 'birthDate', bdStr);
    }

    var baseKeys = [
      'fathername', 'mothername', 'fatherSurname', 'motherSurname', 'placeOfBirth',
      'address', 'postalcode', 'registrationDate'
    ];
    baseKeys.forEach(function (k) {
      if (data[k]) setLocalStorageForCard(token, k, data[k]);
    });

    // Pola specyficzne dla dokumentów
    var allDocKeys = [
      'md_idSeries', 'md_issueDate', 'md_expiryDate',
      'do_idSeries', 'do_issueDate', 'do_expiryDate', 'do_issuingAuthority',
      'pj_category', 'pj_documentNumber', 'pj_issueDate', 'pj_expiryDate',
      'pj_issuingAuthority', 'pj_blanketNumber', 'pj_blanketStatus', 'pj_restrictions',
      'legszk_cardNumber', 'legszk_issueDate', 'legszk_expiryDate',
      'legszk_schoolName', 'legszk_schoolAddress', 'legszk_schoolPhone', 'legszk_schoolDirector',
      'legstu_uczelnia', 'legstu_albumNumber', 'legstu_issueDate',
      'pojazdy_make', 'pojazdy_model', 'pojazdy_vin', 'pojazdy_registrationPlate', 'pojazdy_issueDate',
      'diia_countryOfOrigin', 'diia_documentNumber'
    ];
    allDocKeys.forEach(function (k) {
      if (data[k]) setLocalStorageForCard(token, k, data[k]);
    });

    // Display fields dla poszczególnych stron
    if (data.firstName) setLocalStorageForCard(token, 'display-name', data.firstName);
    if (data.lastName) setLocalStorageForCard(token, 'display-surname', data.lastName);
    if (data.birthDay && data.birthMonth && data.birthYear) {
      var bdStr = pad2(data.birthDay) + '.' + pad2(data.birthMonth) + '.' + data.birthYear;
      setLocalStorageForCard(token, 'display-birthDate', bdStr);
    }

    if (data.photo) {
      setLocalStorageForCard(token, 'profileImage', data.photo);
      if ('caches' in window) {
        fetch(data.photo).then(function (r) { return r.blob(); }).then(function (blob) {
          caches.open('profile-images-v1').then(function (cache) {
            cache.put('profile-image', new Response(blob, { headers: { 'Content-Type': 'image/jpeg' } }));
          });
        }).catch(function () {});
      }
    }
  }

  function buildPayload() {
    var data = Object.assign({}, collected);
    if (data.birthDate) {
      parseBirthDate(data.birthDate);
      delete data.birthDate;
    }
    applyDerivedDates();
    Object.keys(data).forEach(function (k) {
      if (data[k] === undefined || data[k] === null || data[k] === '') delete data[k];
    });
    data.pageType = docType;
    return data;
  }

  async function saveToNeon() {
    var data = buildPayload();
    var cardToken = editMode ? editCardToken : getCardTokenForStorage();
    var hash = cardToken ? null : await getActivationHash();

    var body = { data: data };
    if (cardToken) body.card_token = cardToken;
    else if (hash) body.hash = hash;
    else {
      return { ok: false, error: 'Brak powiązanej strony. Otwórz link od administratora lub aktywuj klucz.' };
    }

    try {
      var r = await fetch('/api/kreator/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      var d = await r.json();
      if (!r.ok || !d.ok) {
        var msgs = {
          CARD_NOT_FOUND: 'Nie znaleziono strony — poproś o nowy link.',
          UNAUTHORIZED: 'Brak autoryzacji — aktywuj klucz w aplikacji.',
          CARD_LIMIT_REACHED: 'Osiągnięto limit kart.',
          RATE_LIMITED: 'Za dużo prób — spróbuj za chwilę.'
        };
        return { ok: false, error: msgs[d.error] || 'Błąd zapisu (' + (d.error || r.status) + ').' };
      }
      if (d.card_token) {
        try { localStorage.setItem('card_token', d.card_token); } catch (_) {}
      }
      applyToLocalStorage(data);
      return { ok: true, card_token: d.card_token };
    } catch (e) {
      return { ok: false, error: 'Błąd połączenia z serwerem.' };
    }
  }

  // ════════════════════════════════════════════════════════════════
  // LOAD EXISTING CARD FOR EDITING
  // ════════════════════════════════════════════════════════════════

  async function loadCardForEditing(cardToken) {
    try {
      var r = await fetch('/api/kreator/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_token: cardToken })
      });
      var d = await r.json();
      if (!r.ok || !d.ok) {
        return { ok: false, error: 'Nie znaleziono karty do edycji.' };
      }
      return { ok: true, data: d.data };
    } catch (e) {
      return { ok: false, error: 'Błąd pobierania karty.' };
    }
  }

  function say(html, actions) {
    if (ctx && ctx.dodajWiadomosc) ctx.dodajWiadomosc(html, 'bot', actions || null);
  }

  function afterStepAdvance() {
    if (stepIndex >= STEPS.length) {
      if (needsPhotoStep()) askPhoto();
      else finalizeAndSave();
      return;
    }
    askCurrentStep();
  }

  function askCurrentStep() {
    if (stepIndex >= STEPS.length) {
      if (needsPhotoStep()) askPhoto();
      else finalizeAndSave();
      return;
    }
    var step = STEPS[stepIndex];
    var actions = [];

    if (step.readonly) {
      // Skip readonly fields - they're auto-generated
      stepIndex += 1;
      afterStepAdvance();
      return;
    }

    if (step.choices) {
      step.choices.forEach(function (c) {
        actions.push({ label: c.label, value: c.value });
      });
    }
    
    actions.push({ label: '⚡ Wygeneruj losowo', value: '__random__', random: true, utility: true });

    var hint = step.placeholder ? ' <em>(' + step.placeholder + ')</em>' : '';
    var req = step.required ? '' : ' <span style="color:var(--text-muted)">(opcjonalnie)</span>';
    say('<strong>' + step.label + '</strong>' + req + hint + '<br>Wpisz wartość poniżej lub wybierz przycisk.', actions);
    if (ctx && ctx.setInputPlaceholder) {
      ctx.setInputPlaceholder(step.placeholder || 'Wpisz odpowiedź…');
    }
  }

  function askPhoto() {
    var extra = hasExistingPhoto()
      ? '<br><em>Masz już zdjęcie z wcześniejszego dokumentu — możesz je pominąć.</em>'
      : '';
    say(
      'Na koniec dodaj <strong>zdjęcie profilowe</strong>.' + extra + '<br>' +
      'Kliknij przycisk poniżej, aby wybrać plik z galerii.',
      [
        { label: '📷 Wybierz zdjęcie', value: '__pick_photo__' },
        { label: 'Pomiń zdjęcie', value: '__skip_photo__', ghost: true }
      ]
    );
    if (ctx && ctx.setInputPlaceholder) ctx.setInputPlaceholder('Wybierz zdjęcie przyciskiem powyżej…');
  }

  function askDocType() {
    var actions = DOC_TYPES.map(function (d) {
      return { label: d.label, value: '__doc_' + d.id };
    });
    actions.push({ label: 'Anuluj kreator', value: '__cancel__', ghost: true, utility: true });
    say('Wybierz <strong>typ dokumentu</strong>, dla którego chcesz wygenerować dane:', actions);
    if (ctx && ctx.setInputPlaceholder) ctx.setInputPlaceholder('Wybierz typ dokumentu…');
  }

  function startWizard() {
    active = true;
    stepIndex = 0;
    mode = 'pick_doc';
    docType = null;
    collected = {};
    STEPS = [];
    editMode = false;
    editCardToken = null;
    if (ctx && ctx.hideSuggestion) ctx.hideSuggestion();

    say(
      'Uruchamiam <strong>kreator danych</strong>. Dane zapiszę w bazie i zsynchronizuję z aplikacją.<br>' +
      (getCardTokenForStorage()
        ? '✓ Masz aktywny link strony — dane zostaną zapisane do Twojej karty.'
        : 'ℹ️ Jeśli masz link od administratora, otwórz go najpierw w aplikacji.')
    );
    askDocType();
  }

  function finishWizard() {
    active = false;
    mode = null;
    docType = null;
    stepIndex = 0;
    STEPS = [];
    editMode = false;
    editCardToken = null;
    if (ctx && ctx.setInputPlaceholder) ctx.setInputPlaceholder('Wpisz pytanie');
  }

  async function finalizeAndSave() {
    say('Zapisuję dane do bazy…');
    var result = await saveToNeon();
    finishWizard();
    if (result.ok) {
      var docLabel = (DOC_TYPES.find(function (d) { return d.id === docType; }) || {}).label || 'dokument';
      var msg = editMode
        ? '✅ <strong>Gotowe!</strong> Dane dla <strong>' + docLabel + '</strong> zaktualizowane w bazie.'
        : '✅ <strong>Gotowe!</strong> Dane dla <strong>' + docLabel + '</strong> zapisane w bazie.';
      say(msg + '<br>Możesz je podejrzeć komendą <code>/pokaz</code> lub edytować przez <code>/dane</code>.');
    } else {
      say('❌ ' + (result.error || 'Nie udało się zapisać danych.'));
    }
  }

  function handleStepsInput(text) {
    if (stepIndex >= STEPS.length) return;

    var step = STEPS[stepIndex];
    var val = String(text || '').trim();

    if (step.validate) {
      var err = step.validate(val);
      if (err) { say('⚠️ ' + err); return; }
    }
    if (step.parse) {
      var parsed = step.parse(val);
      if (parsed.error) { say('⚠️ ' + parsed.error); return; }
      applyDerivedDates();
    } else if (step.key !== 'birthDate') {
      collected[step.key] = val || step.default || '';
    } else {
      collected.birthDate = val;
      parseBirthDate(val);
      applyDerivedDates();
    }

    stepIndex += 1;
    afterStepAdvance();
  }

  function bindPhotoInput() {
    if (!photoInput || photoInput.dataset.kreatorBound === '1') return;
    photoInput.dataset.kreatorBound = '1';
    photoInput.addEventListener('change', async function () {
      var file = photoInput.files && photoInput.files[0];
      photoInput.value = '';
      if (!file || !active) return;
      try {
        collected.photo = await compressImage(file);
        say('✓ Zdjęcie dodane.');
        await finalizeAndSave();
      } catch (_) {
        say('⚠️ Nie udało się wczytać zdjęcia. Spróbuj ponownie.');
        askPhoto();
      }
    });
  }

  window.AssistantKreator = {
    init: function (options) {
      ctx = options || {};
      photoInput = document.getElementById('kreator-photo-input');
      bindPhotoInput();
    },

    isActive: function () {
      return active;
    },

    start: function () {
      if (ctx && ctx.scheduleBotReply) {
        ctx.scheduleBotReply(startWizard);
      } else {
        startWizard();
      }
    },

    editCard: async function (cardToken) {
      if (!cardToken) {
        say('❌ Podaj numer karty: <code>/edytuj CARD_TOKEN</code>');
        return;
      }
      say('⏳ Ładuję kartę do edycji...');
      var result = await loadCardForEditing(cardToken);
      if (!result.ok) {
        say('❌ ' + (result.error || 'Błąd ładowania karty.'));
        return;
      }
      
      editMode = true;
      editCardToken = cardToken;
      collected = result.data;
      docType = result.data.pageType || 'dowod';
      STEPS = buildStepsForDoc(docType);
      active = true;
      stepIndex = 0;
      mode = 'steps';
      
      if (ctx && ctx.hideSuggestion) ctx.hideSuggestion();
      say('✓ Karta załadowana. Edytujesz: <strong>' + (DOC_TYPES.find(function (d) { return d.id === docType; }) || {}).label + '</strong><br>Możesz zmienić dane lub wpisać <code>gotowe</code> aby zakończyć.');
      askCurrentStep();
    },

    handleUserMessage: function (text) {
      if (!active) return;

      var t = String(text || '').trim();

      if (t === '__cancel__') {
        finishWizard();
        say('Kreator anulowany.');
        return;
      }

      if (t === '__doc_mdowod' || t === '__doc_dowod' || t === '__doc_prawojazdy' || t === '__doc_pojazdy' || t === '__doc_legszk' || t === '__doc_legstu' || t === '__doc_diia') {
        docType = t.slice(6);
        STEPS = buildStepsForDoc(docType);
        mode = 'steps';
        stepIndex = 0;
        var label = (DOC_TYPES.find(function (d) { return d.id === docType; }) || {}).label || docType;
        say('Tworzę dane dla: <strong>' + label + '</strong>. Wszystkie pola są wymagane.');
        askCurrentStep();
        return;
      }

      if (t === '__random__') {
        var step = STEPS[stepIndex];
        if (!step) return;
        if (!generateRandomForStep(step)) {
          say('⚠️ Nie udało się wygenerować losowej wartości dla tego pola.');
          return;
        }
        if (step.key === 'birthDate' || step.key === 'pesel') applyDerivedDates();
        stepIndex += 1;
        afterStepAdvance();
        return;
      }

      if (t === '__pick_photo__') {
        if (photoInput) photoInput.click();
        return;
      }

      if (t === '__skip_photo__') {
        finalizeAndSave();
        return;
      }

      if (t === 'gotowe' && editMode) {
        finalizeAndSave();
        return;
      }

      if (mode === 'steps') {
        if (stepIndex < STEPS.length) {
          var current = STEPS[stepIndex];
          if (current.choices) {
            var match = current.choices.find(function (c) { return c.value === t || c.label === t; });
            if (match) {
              collected[current.key] = match.value;
              stepIndex += 1;
              afterStepAdvance();
              return;
            }
          }
        }
        handleStepsInput(t);
        return;
      }
    }
  };
})();
