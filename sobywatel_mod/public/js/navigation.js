document.addEventListener("DOMContentLoaded", function() {
  try {
    if (window.Theme && typeof window.Theme.apply === "function") {
      window.Theme.apply(window.Theme.getMode());
    }
  } catch (_) {}

  if (!("serviceWorker" in navigator)) return;
  if (window.location.protocol === "file:") return;

  var hadControllerOnLoad = !!navigator.serviceWorker.controller;
  var isReloadingForUpdate = false;

  window.addEventListener("load", function() {
    navigator.serviceWorker.register("sw.js?v=101")
      .then(function(reg) {
        reg.update();
        if (reg.waiting && hadControllerOnLoad) reg.waiting.postMessage({ type: "SKIP_WAITING" });
      })
      .catch(function() {});

    navigator.serviceWorker.addEventListener("controllerchange", function() {
      if (!hadControllerOnLoad || isReloadingForUpdate) return;
      isReloadingForUpdate = true;
      window.location.reload();
    });
  });
});
