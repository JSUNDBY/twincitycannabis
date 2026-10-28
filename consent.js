/*
 * Consent gate. Nothing third-party loads until the visitor clicks Accept.
 *   <script src="/consent.js" data-ga="G-XXXX" data-meta="PIXEL_ID" data-privacy="/privacy" defer></script>
 * data-ga and data-meta are both optional. Global Privacy Control counts as Decline.
 * Any element with data-consent-open reopens the choice.
 */
(function () {
  var me = document.currentScript || {};
  var cfg = me.dataset || {};
  var KEY = 'site_consent_v1';

  function read() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function save(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  function addScript(src) {
    var s = document.createElement('script');
    s.async = true;
    s.src = src;
    document.head.appendChild(s);
  }

  function loadTrackers() {
    if (window.__consentLoaded) return;
    window.__consentLoaded = true;
    if (cfg.ga) {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', cfg.ga);
      addScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(cfg.ga));
    }
    if (cfg.meta) {
      var n = window.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!window._fbq) window._fbq = n;
      n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
      addScript('https://connect.facebook.net/en_US/fbevents.js');
      window.fbq('init', cfg.meta);
      window.fbq('track', 'PageView');
    }
  }

  var css = '' +
    '.cg{position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483000;max-width:560px;margin:0 auto;' +
    'background:#141414;color:#f2f2f2;border:1px solid #3a3a3a;border-radius:12px;padding:16px 18px;' +
    'font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.35)}' +
    '.cg p{margin:0 0 12px}.cg a{color:#f2f2f2;text-decoration:underline}' +
    '.cg-row{display:flex;gap:10px;flex-wrap:wrap}' +
    '.cg button{flex:1 1 120px;min-height:44px;border-radius:8px;font:600 15px/1 system-ui,-apple-system,sans-serif;cursor:pointer;' +
    'border:1px solid #f2f2f2;background:#f2f2f2;color:#141414}' +
    '.cg button.cg-no{background:transparent;color:#f2f2f2}' +
    '.cg button:focus-visible{outline:3px solid #8ab4ff;outline-offset:2px}';

  function close(box) { if (box && box.parentNode) box.parentNode.removeChild(box); }

  function ask() {
    if (document.querySelector('.cg')) return;
    if (!document.getElementById('cg-style')) {
      var st = document.createElement('style');
      st.id = 'cg-style';
      st.textContent = css;
      document.head.appendChild(st);
    }
    var box = document.createElement('div');
    box.className = 'cg';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', 'Cookie choice');
    box.innerHTML = '<p>Can we use analytics cookies to see which pages help people? Nothing is tracked unless you accept.' +
      (cfg.privacy ? ' <a href="' + cfg.privacy + '">Privacy policy</a>' : '') + '</p>' +
      '<div class="cg-row"><button type="button" class="cg-yes">Accept</button>' +
      '<button type="button" class="cg-no">Decline</button></div>';
    box.querySelector('.cg-yes').onclick = function () { save('yes'); close(box); loadTrackers(); };
    box.querySelector('.cg-no').onclick = function () {
      var had = read() === 'yes';
      save('no');
      close(box);
      if (had && window.__consentLoaded) location.reload();
    };
    document.body.appendChild(box);
  }

  window.siteConsent = { open: ask };
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-consent-open]');
    if (t) { e.preventDefault(); ask(); }
  });

  var choice = read();
  if (choice === 'yes') loadTrackers();
  else if (!choice && !navigator.globalPrivacyControl) {
    if (document.body) ask(); else document.addEventListener('DOMContentLoaded', ask);
  }
})();
