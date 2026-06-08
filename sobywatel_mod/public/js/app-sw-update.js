(function (global) {
  var customAlertCallback = null;

  function showCustomAlert(title, message, callback) {
    var modal = document.getElementById("customAlertModal");
    var titleEl = document.getElementById("customAlertTitle");
    var messageEl = document.getElementById("customAlertMessage");
    if (!modal || !titleEl || !messageEl) {
      global.alert(title + "\n\n" + message);
      if (typeof callback === "function") callback();
      return;
    }
    titleEl.innerText = title;
    messageEl.innerText = message;
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
    customAlertCallback = typeof callback === "function" ? callback : null;
  }

  function closeCustomAlert() {
    var modal = document.getElementById("customAlertModal");
    if (modal) {
      modal.style.display = "none";
      modal.setAttribute("aria-hidden", "true");
    }
    if (customAlertCallback) {
      var cb = customAlertCallback;
      customAlertCallback = null;
      cb();
    }
  }

  function showSwResetModal() {
    var overlay = document.getElementById("swResetModalOverlay");
    if (overlay) {
      overlay.style.display = "flex";
      overlay.setAttribute("aria-hidden", "false");
    }
  }

  function closeSwResetModal() {
    var overlay = document.getElementById("swResetModalOverlay");
    if (overlay) {
      overlay.style.display = "none";
      overlay.setAttribute("aria-hidden", "true");
    }
  }

  async function executeSwReset() {
    closeSwResetModal();
    var hasChanges = false;

    if ("serviceWorker" in navigator) {
      var registrations = await navigator.serviceWorker.getRegistrations();
      for (var i = 0; i < registrations.length; i++) {
        await registrations[i].unregister();
        hasChanges = true;
      }
    }

    if ("caches" in window) {
      var cacheNames = await caches.keys();
      for (var j = 0; j < cacheNames.length; j++) {
        await caches.delete(cacheNames[j]);
        hasChanges = true;
      }
    }

    if (hasChanges) {
      showCustomAlert(
        "Aktualizacja",
        "Poprawnie wykonano aktualizację! Zamknij całkowicie aplikację, a następnie uruchom ją ponownie.",
        function () {
          window.location.reload(true);
        },
      );
    } else {
      showCustomAlert(
        "Błąd",
        "Błąd aktualizacji! Skontaktuj się z administratorem.",
        function () {
          window.location.reload(true);
        },
      );
    }
  }

  global.showCustomAlert = showCustomAlert;
  global.closeCustomAlert = closeCustomAlert;
  global.showSwResetModal = showSwResetModal;
  global.closeSwResetModal = closeSwResetModal;
  global.executeSwReset = executeSwReset;
})(typeof window !== "undefined" ? window : globalThis);
