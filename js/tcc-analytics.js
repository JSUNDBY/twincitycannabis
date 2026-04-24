/*!
 * TCC Analytics — honest anonymous tracking for twincitycannabis.com
 *
 * Loaded by the static dispensary pages at /dispensaries/<slug>/. Fires a
 * 'view' event on page load and an 'outbound' event when a visitor clicks
 * an external link. The SPA (index.html + js/app.js) does its own tracking
 * through the same worker endpoint — this file exists so static pages,
 * which don't load the SPA, count too.
 *
 * Privacy: no cookies, no PII, no cross-site tracking. A per-tab session id
 * lives in sessionStorage (cleared when the tab closes) and is used only to
 * dedupe repeated views/clicks within the same visit. Only {id, event} is
 * sent to the worker.
 */
(function () {
  'use strict';

  var ENDPOINT = 'https://dashboard.twincitycannabis.com/track';
  var SESSION_KEY = '__tcc_sess';
  var DEDUP_KEY = '__tcc_tracked';

  function ensureSession() {
    try {
      var s = sessionStorage.getItem(SESSION_KEY);
      if (!s) {
        s = (window.crypto && crypto.randomUUID)
          ? crypto.randomUUID()
          : String(Date.now()) + '-' + String(Math.random()).slice(2);
        sessionStorage.setItem(SESSION_KEY, s);
      }
      return s;
    } catch (_) {
      return null;
    }
  }

  function getDedup() {
    try {
      var raw = sessionStorage.getItem(DEDUP_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch (_) {
      return new Set();
    }
  }

  function saveDedup(set) {
    try {
      sessionStorage.setItem(DEDUP_KEY, JSON.stringify(Array.from(set)));
    } catch (_) {}
  }

  function slugFromPath() {
    var m = (window.location.pathname || '').match(/^\/dispensaries\/([a-z0-9-]+)\/?$/i);
    return m ? m[1].toLowerCase() : null;
  }

  function postEvent(id, event) {
    try {
      var body = JSON.stringify({ id: id, event: event });
      // Use text/plain so the browser treats the POST as a "simple"
      // request and skips the CORS preflight. The worker parses the body
      // with request.json() regardless of Content-Type.
      if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: 'text/plain' });
        if (navigator.sendBeacon(ENDPOINT, blob)) return;
      }
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: body,
        keepalive: true,
        mode: 'cors',
      }).catch(function () {});
    } catch (_) {}
  }

  function track(id, event, opts) {
    if (!id || !event) return;
    opts = opts || {};
    var bucket = opts.minuteBucket ? ':' + Math.floor(Date.now() / 60000) : '';
    var key = id + ':' + event + bucket;
    var set = getDedup();
    if (set.has(key)) return;
    set.add(key);
    saveDedup(set);
    postEvent(id, event);
  }

  ensureSession();

  // Fire profile view on page load.
  var slug = slugFromPath();
  if (slug) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { track(slug, 'view'); });
    } else {
      track(slug, 'view');
    }
  }

  // Track outbound-link clicks — dedup by (slug, minute) so double-clicks don't inflate.
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (!/^https?:\/\//i.test(href)) return;
    var u;
    try { u = new URL(href); } catch (_) { return; }
    if (!u.hostname) return;
    if (u.hostname === window.location.hostname) return;
    if (/(^|\.)twincitycannabis\.com$/i.test(u.hostname)) return;
    var s = slugFromPath();
    if (!s) return;
    track(s, 'outbound', { minuteBucket: true });
  }, true);

  // Expose a small API for future pages that want to fire custom events.
  window.TCCAnalytics = { track: track, slugFromPath: slugFromPath };
})();
