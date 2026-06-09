/**
 * Kreator danych w czacie — komenda /kreator
 * Zbiera dane + zdjęcie, zapisuje do Neon i synchronizuje localStorage.
 */
(function () {
  'use strict';

  var ctx = null;
  var active = false;
  var stepIndex = 0;
  var mode = null; // 'steps' | 'paste'
  var collected = {};
  var photoInput = null;

  var STEPS = [
    { key: 'firstName', label: 'Imię', placeholder: 'np. Jan', required: true },
    { key: 'lastName', label: 'Nazwisko', placeholder: 'np. Kowalski', required: true },
    { key: 'birthDate', label: 'Data urodzenia', placeholder: 'DD.MM.RRRR', required: true, parse: parseBirthDate },
    { key: 'gender', label: 'Płeć', choices: [{ label: 'Mężczyzna', value: 'M' }, { label: 'Kobieta', value: 'K' }], required: true },
    { key: 'pesel', label: 'PESEL (11 cyfr)', placeholder: '00000000000', required: true, validate: validatePesel, random: true },
    { key: 'nationality', label: 'Narodowość', placeholder: 'POLSKIE', default: 'POLSKIE' },
    { key: 'placeOfBirth', label: 'Miejsce urodzenia', placeholder: 'np. Warszawa' },
    { key: 'address', label: 'Adres zameldowania', placeholder: 'ul. Przykładowa 1, Warszawa' },
    { key: 'postalcode', label: 'Kod pocztowy', placeholder: '00-000' },
    { key: 'fathername', label: 'Imię ojca', placeholder: 'opcjonalnie', optional: true },
    { key: 'mothername', label: 'Imię matki', placeholder: 'opcjonalnie', optional: true },
    { key: 'md_idSeries', label: 'Seria mDowodu', placeholder: 'ABC 123456', optional: true, random: true },
    { key: 'do_idSeries', label: 'Seria dowodu osobistego', placeholder: 'ABC 123456', optional: true, random: true },
  ];

  function validatePesel(v) {
    return /^\d{11}$/.test(String(v || '').trim()) ? null : 'PESEL musi mieć 11 cyfr.';
  }

  function parseBirthDate(v) {
    var m = String(v || '').trim().match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
    if (!m) return { error: 'Podaj datę jako DD.MM.RRRR' };
    var d = m[1].padStart(2, '0');
    var mo = m[2].padStart(2, '0');
    var y = m[3];
    collected.birthDay = d;
    collected.birthMonth = mo;
    collected.birthYear = y;
    return { ok: true };
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
        if (norm) return sha256Hex(norm);
      }
    } catch (_) {}
    return null;
  }

  function getCardToken() {
    try { return localStorage.getItem('card_token') || null; } catch (_) { return null; }
  }

  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) {
        var img = new Image();
        img.onload = function () {
          var canvas = document.createElement('canvas');
          var MAX = 800;
          var w = img.width;
          var h = img.height;
          if (w > h) { if (w > MAX) { h = h * MAX / w; w = MAX; } }
          else { if (h > MAX) { w = w * MAX / h; h = MAX; } }
          canvas.width = w;
          canvas.height = h;
          var c = canvas.getContext('2d', { alpha: false });
          c.fillStyle = '#ffffff';
          c.fillRect(0, 0, w, h);
          c.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.92));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function applyToLocalStorage(data) {
    if (data.firstName) localStorage.setItem('name', data.firstName);
    if (data.lastName) {
      localStorage.setItem('surname', data.lastName);
      localStorage.setItem('lastName', data.lastName);
    }
    if (data.pesel) localStorage.setItem('pesel', data.pesel);
    if (data.gender) localStorage.setItem('gender', data.gender);
    if (data.nationality) localStorage.setItem('nationality', data.nationality);
    if (data.birthDay && data.birthMonth && data.birthYear) {
      localStorage.setItem('birthDate', pad2(data.birthDay) + '.' + pad2(data.birthMonth) + '.' + data.birthYear);
    }
    ['fathername', 'mothername', 'fatherSurname', 'motherSurname', 'placeOfBirth',
      'address', 'postalcode', 'registrationDate', 'md_idSeries', 'md_issueDate',
      'md_expiryDate', 'do_idSeries', 'do_issueDate', 'do_expiryDate', 'do_issuingAuthority'
    ].forEach(function (k) {
      if (data[k]) localStorage.setItem(k, data[k]);
    });
    if (data.photo) {
      localStorage.setItem('profileImage', data.photo);
      if ('caches' in window) {
        fetch(data.photo).then(function (r) { return r.blob(); }).then(function (blob) {
          caches.open('profile-images-v1').then(function (cache) {
            cache.put('profile-image', new Response(blob, { headers: { 'Content-Type': 'image/jpeg' } }));
          });
        }).catch(function () {});
      }
    }
  }

  function parseBulkPaste(text) {
    var lines = String(text || '').split(/\r?\n/);
    var map = {
      'imię': 'firstName', 'imie': 'firstName', 'name': 'firstName',
      'nazwisko': 'lastName', 'surname': 'lastName',
      'pesel': 'pesel', 'płeć': 'gender', 'plec': 'gender', 'gender': 'gender',
      'data urodzenia': 'birthDate', 'urodziny': 'birthDate', 'birthdate': 'birthDate',
      'narodowość': 'nationality', 'narodowosc': 'nationality',
      'miejsce urodzenia': 'placeOfBirth', 'adres': 'address',
      'kod pocztowy': 'postalcode', 'imię ojca': 'fathername', 'imie ojca': 'fathername',
      'imię matki': 'mothername', 'imie matki': 'mothername',
      'seria mdowodu': 'md_idSeries', 'mdowód': 'md_idSeries', 'mdowod': 'md_idSeries',
      'dowód': 'do_idSeries', 'dowod': 'do_idSeries'
    };
    var result = {};
    lines.forEach(function (line) {
      var t = line.trim();
      if (!t) return;
      var sep = t.indexOf(':');
      if (sep === -1) sep = t.indexOf('=');
      if (sep === -1) return;
      var key = t.slice(0, sep).trim().toLowerCase();
      var val = t.slice(sep + 1).trim();
      var field = map[key];
      if (field) result[field] = val;
    });
    return result;
  }

  function buildPayload() {
    var data = Object.assign({}, collected);
    if (data.birthDate) {
      parseBirthDate(data.birthDate);
      delete data.birthDate;
    }
    return data;
  }

  async function saveToNeon() {
    var data = buildPayload();
    var cardToken = getCardToken();
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

  function say(html, actions) {
    if (ctx && ctx.dodajWiadomosc) ctx.dodajWiadomosc(html, 'bot', actions || null);
  }

  function askCurrentStep() {
    if (stepIndex >= STEPS.length) {
      askPhoto();
      return;
    }
    var step = STEPS[stepIndex];
    var actions = [];

    if (step.choices) {
      step.choices.forEach(function (c) {
        actions.push({ label: c.label, value: c.value });
      });
    }
    if (step.optional) {
      actions.push({ label: 'Pomiń', value: '__skip__', ghost: true });
    }
    if (step.random) {
      actions.push({ label: '⚡ Wygeneruj losowo', value: '__random__', random: true, utility: true });
    }

    var hint = step.placeholder ? ' <em>(' + step.placeholder + ')</em>' : '';
  var req = step.required ? '' : ' <span style="color:var(--text-muted)">(opcjonalnie)</span>';
    say('<strong>' + step.label + '</strong>' + req + hint + '<br>Wpisz wartość poniżej lub wybierz przycisk.', actions);
    if (ctx && ctx.setInputPlaceholder) {
      ctx.setInputPlaceholder(step.placeholder || 'Wpisz odpowiedź…');
    }
  }

  function askPhoto() {
    say(
      'Na koniec dodaj <strong>zdjęcie profilowe</strong>.<br>' +
      'Kliknij przycisk poniżej, aby wybrać plik z galerii.',
      [
        { label: '📷 Wybierz zdjęcie', value: '__pick_photo__' },
        { label: 'Pomiń zdjęcie', value: '__skip_photo__', ghost: true }
      ]
    );
    if (ctx && ctx.setInputPlaceholder) ctx.setInputPlaceholder('Wybierz zdjęcie przyciskiem powyżej…');
  }

  function askPasteMode() {
    say(
      'Wklej dane w formacie <code>Imię: Jan</code> (każda linia osobno).<br>' +
      'Przykład:<br><code>Imię: Jan<br>Nazwisko: Kowalski<br>PESEL: 12345678901<br>Data urodzenia: 01.01.1990<br>Płeć: M</code>',
      [{ label: 'Anuluj kreator', value: '__cancel__', ghost: true, utility: true }]
    );
    if (ctx && ctx.setInputPlaceholder) ctx.setInputPlaceholder('Wklej dane tutaj…');
  }

  function startWizard() {
    active = true;
    stepIndex = 0;
    collected = {};
    if (ctx && ctx.hideSuggestion) ctx.hideSuggestion();

    say(
      'Uruchamiam <strong>kreator danych</strong>. Dane zapiszę w bazie i zsynchronizuję z aplikacją.<br>' +
      (getCardToken()
        ? '✓ Masz aktywny link strony — dane zostaną zapisane do Twojej karty.'
        : 'ℹ️ Jeśli masz link od administratora, otwórz go najpierw w aplikacji.'),
      [
        { label: 'Krok po kroku', value: '__mode_steps__' },
        { label: 'Wklej dane naraz', value: '__mode_paste__' }
      ]
    );
  }

  function finishWizard() {
    active = false;
    mode = null;
    stepIndex = 0;
    if (ctx && ctx.setInputPlaceholder) ctx.setInputPlaceholder('Wpisz pytanie');
  }

  async function finalizeAndSave() {
    say('Zapisuję dane do bazy…');
    var result = await saveToNeon();
    finishWizard();
    if (result.ok) {
      say(
        '✅ <strong>Gotowe!</strong> Dane i zdjęcie zapisane w bazie Neon.<br>' +
        'Możesz je podejrzeć komendą <code>/pokaz</code> lub edytować przez <code>/dane</code>.'
      );
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
    } else if (step.key !== 'birthDate') {
      collected[step.key] = val || step.default || '';
    } else {
      collected.birthDate = val;
    }

    stepIndex += 1;
    if (stepIndex >= STEPS.length) askPhoto();
    else askCurrentStep();
  }

  function handlePasteInput(text) {
    var parsed = parseBulkPaste(text);
    if (!parsed.firstName && !parsed.lastName && !parsed.pesel) {
      say('⚠️ Nie rozpoznano danych. Użyj formatu <code>Imię: Jan</code> w każdej linii.');
      return;
    }
    Object.assign(collected, parsed);
    if (parsed.gender) {
      var g = String(parsed.gender).toUpperCase();
      collected.gender = g.startsWith('M') ? 'M' : g.startsWith('K') ? 'K' : parsed.gender;
    }
    if (parsed.birthDate) parseBirthDate(parsed.birthDate);
    mode = 'steps';
    stepIndex = STEPS.length;
    askPhoto();
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

    handleUserMessage: function (text) {
      if (!active) return;

      var t = String(text || '').trim();

      if (t === '__cancel__') {
        finishWizard();
        say('Kreator anulowany.');
        return;
      }

      if (t === '__mode_steps__') {
        mode = 'steps';
        stepIndex = 0;
        askCurrentStep();
        return;
      }

      if (t === '__mode_paste__') {
        mode = 'paste';
        askPasteMode();
        return;
      }

      if (t === '__skip__') {
        stepIndex += 1;
        if (stepIndex >= STEPS.length) askPhoto();
        else askCurrentStep();
        return;
      }

      if (t === '__random__') {
        var step = STEPS[stepIndex];
        if (step && step.key === 'pesel') {
          var p = genPeselFromBirth();
          if (!p) { say('⚠️ Najpierw podaj datę urodzenia i płeć.'); return; }
          collected.pesel = p;
          stepIndex += 1;
          if (stepIndex >= STEPS.length) askPhoto();
          else askCurrentStep();
          return;
        }
        if (step && (step.key === 'md_idSeries' || step.key === 'do_idSeries')) {
          collected[step.key] = genDocSeries();
          stepIndex += 1;
          if (stepIndex >= STEPS.length) askPhoto();
          else askCurrentStep();
          return;
        }
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

      if (mode === 'paste') {
        handlePasteInput(t);
        return;
      }

      if (mode === 'steps') {
        handleStepsInput(t);
        return;
      }

      // Wybór z przycisków (płeć itd.)
      if (stepIndex < STEPS.length) {
        var current = STEPS[stepIndex];
        if (current.choices) {
          var match = current.choices.find(function (c) { return c.value === t || c.label === t; });
          if (match) {
            collected[current.key] = match.value;
            stepIndex += 1;
            if (stepIndex >= STEPS.length) askPhoto();
            else askCurrentStep();
            return;
          }
        }
        handleStepsInput(t);
      }
    }
  };
})();
