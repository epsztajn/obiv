/**
 * Podgląd zapisanych danych — komenda /pokaz
 */
(function () {
  'use strict';

  var notify = null;

  var SECTIONS = [
    {
      title: 'Dane podstawowe',
      fields: [
        { label: 'Imię', key: 'name' },
        { label: 'Nazwisko', key: 'surname' },
        { label: 'PESEL', key: 'pesel' },
        { label: 'Data urodzenia', key: 'birthDate' },
        { label: 'Płeć', key: 'gender' },
        { label: 'Narodowość', key: 'nationality' },
        { label: 'Miejsce urodzenia', key: 'placeOfBirth' },
        { label: 'Adres', key: 'address' },
        { label: 'Kod pocztowy', key: 'postalcode' }
      ]
    },
    {
      title: 'mDowód',
      fields: [
        { label: 'Seria', key: 'md_idSeries' },
        { label: 'Data wydania', key: 'md_issueDate' },
        { label: 'Data ważności', key: 'md_expiryDate' }
      ]
    },
    {
      title: 'Dowód osobisty',
      fields: [
        { label: 'Seria', key: 'do_idSeries' },
        { label: 'Data wydania', key: 'do_issueDate' },
        { label: 'Data ważności', key: 'do_expiryDate' },
        { label: 'Organ wydający', key: 'do_issuingAuthority' }
      ]
    }
  ];

  var COPY_PRESETS = [
    { label: 'mDowód → Prawo jazdy', from: ['name', 'surname', 'pesel', 'birthDate', 'placeOfBirth'], to: [
      ['name', 'display-name_prawojazdy'],
      ['surname', 'display-surname_prawojazdy'],
      ['pesel', 'display-pesel_prawojazdy'],
      ['birthDate', 'display-birthDate_prawojazdy'],
      ['placeOfBirth', 'display-birthPlace_prawojazdy']
    ]},
    { label: 'mDowód → Legitymacja szkolna', from: ['name', 'surname', 'pesel', 'birthDate'], to: [
      ['name', 'display-name_legszk'],
      ['surname', 'display-surname_legszk'],
      ['pesel', 'display-pesel_legszk'],
      ['birthDate', 'display-birthDate_legszk']
    ]},
    { label: 'mDowód → Legitymacja studencka', from: ['name', 'surname', 'pesel', 'birthDate'], to: [
      ['name', 'display-name_legstu'],
      ['surname', 'display-surname_legstu'],
      ['pesel', 'display-pesel_legstu'],
      ['birthDate', 'display-birthDate_legstu']
    ]}
  ];

  function getVal(key) {
    try { return localStorage.getItem(key) || ''; } catch (_) { return ''; }
  }

  function escapeHtml(t) {
    return String(t)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return Promise.reject();
  }

  function renderList() {
    var listEl = document.getElementById('pokaz-sheet-list');
    if (!listEl) return;

    var html = '';
    var hasAny = false;

    SECTIONS.forEach(function (section) {
      var items = section.fields.filter(function (f) { return getVal(f.key).trim(); });
      if (!items.length) return;
      hasAny = true;
      html += '<div class="pokaz-data-block"><h3 class="pokaz-data-block__title">' + escapeHtml(section.title) + '</h3><ul class="pokaz-data-list">';
      items.forEach(function (f) {
        var val = getVal(f.key);
        html +=
          '<li class="pokaz-data-list__item">' +
          '<span class="pokaz-data-list__label">' + escapeHtml(f.label) + '</span>' +
          '<span class="pokaz-data-list__value">' + escapeHtml(val) + '</span>' +
          '<button type="button" class="pokaz-copy-field-btn" data-copy="' + escapeHtml(val) + '">Kopiuj</button>' +
          '</li>';
      });
      html += '</ul></div>';
    });

    if (getVal('profileImage')) {
      hasAny = true;
      html += '<div class="pokaz-data-block"><h3 class="pokaz-data-block__title">Zdjęcie</h3><p class="pokaz-data-empty" style="text-align:left">✓ Zdjęcie profilowe jest zapisane w aplikacji.</p></div>';
    }

    listEl.innerHTML = hasAny
      ? html
      : '<p class="pokaz-data-empty">Brak zapisanych danych.<br>Użyj <strong>/kreator</strong>, aby je dodać.</p>';

    listEl.querySelectorAll('.pokaz-copy-field-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var text = btn.getAttribute('data-copy') || '';
        copyText(text).then(function () {
          btn.textContent = '✓';
          setTimeout(function () { btn.textContent = 'Kopiuj'; }, 1500);
        }).catch(function () {});
      });
    });
  }

  function renderCopyTargets() {
    var el = document.getElementById('pokaz-copy-targets');
    if (!el) return;
    el.innerHTML = '';
    COPY_PRESETS.forEach(function (preset) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pokaz-copy-preset-btn';
      btn.textContent = preset.label;
      btn.addEventListener('click', function () {
        var copied = 0;
        preset.to.forEach(function (pair) {
          var val = getVal(pair[0]);
          if (val) {
            try { localStorage.setItem(pair[1], val); copied++; } catch (_) {}
          }
        });
        if (notify) notify('Skopiowano ' + copied + ' pól do ' + preset.label.split('→').pop().trim() + '.');
      });
      el.appendChild(btn);
    });
  }

  function openSheet() {
    var overlay = document.getElementById('pokaz-sheet-overlay');
    if (!overlay) return;

    renderCopyTargets();
    renderList();

    overlay.classList.add('is-visible');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('pokaz-sheet-active');

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        overlay.classList.add('is-open');
      });
    });
  }

  window.closePokazSheet = function (event) {
    if (event && event.target && event.target.closest) {
      if (event.target.closest('.pokaz-sheet-panel') && !event.target.closest('[data-close]')) {
        return;
      }
    }
    var overlay = document.getElementById('pokaz-sheet-overlay');
    if (!overlay) return;

    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');

    var panel = overlay.querySelector('.pokaz-sheet-panel');
    var done = false;
    var finish = function () {
      if (done) return;
      done = true;
      overlay.classList.remove('is-visible');
      document.body.classList.remove('pokaz-sheet-active');
    };

    if (panel) {
      var onEnd = function (e) {
        if (e.propertyName !== 'transform') return;
        panel.removeEventListener('transitionend', onEnd);
        finish();
      };
      panel.addEventListener('transitionend', onEnd);
      setTimeout(finish, 420);
    } else {
      finish();
    }
  };

  window.AssistantPokaz = {
    init: function (options) {
      notify = options && options.onNotify ? options.onNotify : null;
    },
    open: openSheet
  };
})();
