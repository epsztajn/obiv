/**
 * Panel edycji danych w czacie — komenda /dane
 */
(function () {
  'use strict';

  var loaded = false;
  var loading = false;

  function getHost() {
    return document.getElementById('dane-sheet-host');
  }

  window.ensureDaneSheetContent = function () {
    if (loaded || loading) return;
    var host = getHost();
    if (!host) return;

    loading = true;
    host.innerHTML = '<p class="dane-sheet-loading">Ładowanie edytora…</p>';

    fetch('profiledata.html')
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(function (html) {
        var parser = new DOMParser();
        var doc = parser.parseFromString(html, 'text/html');
        var container = doc.querySelector('.container.profiledata-card');
        if (!container) throw new Error('Brak formularza');

        host.innerHTML = '';
        var clone = container.cloneNode(true);
        host.appendChild(clone);

        // Usuń duplikaty ID w dokumencie — prefiks dla bezpieczeństwa nie jest potrzebny,
        // bo oryginalny kontener nie jest w DOM
        if (typeof window.initProfileDataEditor === 'function') {
          window.__profileDataEditorInited = false;
          window.initProfileDataEditor();
        }
        if (typeof window.bindProfilePhotoPicker === 'function') {
          window.bindProfilePhotoPicker();
        }
        if (typeof window.loadCachedProfileImage === 'function') {
          window.loadCachedProfileImage();
        }

        loaded = true;
        loading = false;
      })
      .catch(function () {
        loading = false;
        host.innerHTML = '<p class="dane-sheet-error">Nie udało się załadować edytora danych.</p>';
      });
  };
})();
