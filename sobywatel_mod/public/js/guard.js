(function() {
  window.GuardApi = {
    onAccessGranted: function(cb) { try { cb(); } catch(e) {} },
    isAccessGranted: function() { return true; }
  };
  function hide() {
    var el = document.getElementById('jsGuard');
    if (el) { el.hidden = true; el.style.display = 'none'; }
  }
  hide();
  document.addEventListener('DOMContentLoaded', hide);
})();
