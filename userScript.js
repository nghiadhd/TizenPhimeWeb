// TizenPhim Web — injected by TizenBrew into phimmoie.fm. Loads the site
// directly (browser navigation ⇒ no CORS, passes Cloudflare, plays the clean
// opstream90 streams) and strips the ads/popups that make these sites unusable.
(function () {
  'use strict';

  // Hosts that are part of the site/player and must NEVER be touched.
  var WHITELIST = /(^|\.)(phimmoie\.fm|motchille\.cx|opstream\d*\.com|kkphimplayer\d*\.com|jwpcdn\.com|jwplatform\.com|jwplayer\.com|ytimg\.com|youtube\.com|youtube-nocookie\.com|google\.com|gstatic\.com|googleapis\.com|cloudflare\.com|cloudflareinsights\.com|recaptcha\.net|jsdelivr\.net)$/i;

  // Known ad / popunder networks (matched anywhere in the URL).
  var AD = /(doubleclick|googlesyndication|googleadservices|pagead2|adservice|popads|popcash|popunder|propellerads|propel|adsterra|mgid|taboola|outbrain|revcontent|histats|adnxs|adsystem|clickadu|hilltopads|exoclick|juicyads|trafficjunky|a-ads|ad-maven|admaven|bidgear|monetag|richads|galaksion|onclckbn|onclickalgo|highperformanceformat|coinzillatag|adtng|adskeeper|adcenter)/i;

  function hostOf(u) { try { return new URL(u, location.href).hostname; } catch (e) { return ''; } }
  function isAdUrl(u) {
    if (!u) return false;
    var h = hostOf(u);
    if (h && WHITELIST.test(h)) return false;
    if (AD.test(String(u))) return true;
    // any cross-origin iframe/script not on the whitelist is treated as an ad
    return !!(h && h !== location.hostname && !WHITELIST.test(h));
  }

  // Timestamp of the last synthetic click our virtual cursor dispatched — lets the
  // click-laundering below skip the redundant native click OK also produces on the TV.
  var tpwebSyntheticTs = 0;

  // 0) Hide the site's OWN ad slots at document-start so they never render.
  // phimmoie fills <div class="ads-banner"> with betting ("nhà cái") banners
  // client-side; there's no close button and no mouse on the TV, so remove them
  // outright. These classes are the site's ad containers — safe to nuke.
  var AD_SELECTOR = '.ads-banner, ins.adsbygoogle, [id^="ad_"], [id^="ads-"], [class*="banner-ads"], [class*="ads-banner"], img[src*="adcenter"]';
  try {
    var st = document.createElement('style');
    st.textContent = AD_SELECTOR + '{display:none!important;height:0!important;overflow:hidden!important}';
    (document.head || document.documentElement).appendChild(st);
  } catch (e) {}

  // Ad images are matched by KNOWN ad host only (AD regex, e.g. adcenter.cx).
  // Do NOT blanket-block cross-origin images: legit posters come from CDNs like
  // img.ophim.live, and killing them would delete real movie cards.
  function isAdImg(img) {
    var src = img.currentSrc || img.src || (img.getAttribute && img.getAttribute('src')) || '';
    if (!src) return false;
    var h = hostOf(src);
    if (h && WHITELIST.test(h)) return false;
    return AD.test(String(src));
  }
  // NEVER remove nodes: phimmoie is a React/Next app and .remove()-ing a node it
  // owns triggers "removeChild NotFoundError" that unmounts the whole tree (incl.
  // the player). Hiding via inline !important keeps the DOM intact and React happy.
  function hide(el) {
    if (!el || el.getAttribute && el.getAttribute('data-tpweb-hidden')) return;
    try {
      el.style.setProperty('display', 'none', 'important');
      el.style.setProperty('visibility', 'hidden', 'important');
      el.style.setProperty('pointer-events', 'none', 'important');
      if (el.setAttribute) el.setAttribute('data-tpweb-hidden', '1');
    } catch (e) {}
  }
  function killImg(img) { hide(img.closest('a') || img); }

  // The site marks EVERY ad-close button with class `no-ads-under` (both the fixed
  // banner "Tắt QC ✕" and the full-screen "Đóng QC ✕" modal that covers the home
  // screen). Hide the whole overlay so there's nothing to close — the TV has no
  // mouse. We hide the nearest fixed-position ad container (never a real modal,
  // since only ad overlays carry a `.no-ads-under` button).
  function hideAdOverlays(root) {
    try {
      var closers = root.querySelectorAll ? root.querySelectorAll('.no-ads-under') : [];
      for (var i = 0; i < closers.length; i++) {
        hide(closers[i].closest('.ads-banner, .fixed, [class*="inset-0"]') || closers[i].parentElement);
      }
    } catch (e) {}
  }

  // 0b) Neutralise the JW pre-roll at the source: the player fetches a VAST ad tag
  // from phimmoie.fm/storage/ads/.../vast/...xml (the ad VIDEO lives on adcenter.cx).
  // Returning an EMPTY-but-valid VAST makes JW cleanly report "no ad" and play the
  // movie immediately — no stall (unlike aborting), no touching the JW global.
  var EMPTY_VAST = '<?xml version="1.0" encoding="UTF-8"?><VAST version="3.0"></VAST>';
  function isVastReq(u) { try { return /\/storage\/ads\/|\/vast\/|[-_]vast\b|adcenter\.cx/i.test(String(u)); } catch (e) { return false; } }
  try {
    var _fetch = window.fetch;
    if (_fetch) window.fetch = function (input) {
      var u = input && input.url ? input.url : input;
      if (isVastReq(u)) return Promise.resolve(new Response(EMPTY_VAST, { status: 200, headers: { 'Content-Type': 'text/xml' } }));
      return _fetch.apply(this, arguments);
    };
  } catch (e) {}
  try {
    var _open = XMLHttpRequest.prototype.open, _send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) { this.__tpwebVast = isVastReq(u); return _open.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function () {
      var xhr = this;
      if (xhr.__tpwebVast) {
        try {
          Object.defineProperty(xhr, 'readyState', { configurable: true, value: 4 });
          Object.defineProperty(xhr, 'status', { configurable: true, value: 200 });
          Object.defineProperty(xhr, 'responseText', { configurable: true, value: EMPTY_VAST });
          Object.defineProperty(xhr, 'response', { configurable: true, value: EMPTY_VAST });
        } catch (e) {}
        setTimeout(function () {
          try { if (typeof xhr.onreadystatechange === 'function') xhr.onreadystatechange(); } catch (e) {}
          try { xhr.dispatchEvent(new Event('readystatechange')); } catch (e) {}
          try { if (typeof xhr.onload === 'function') xhr.onload(); } catch (e) {}
          try { xhr.dispatchEvent(new Event('load')); } catch (e) {}
        }, 0);
        return;
      }
      return _send.apply(this, arguments);
    };
  } catch (e) {}

  // 0c) Skip the JW Player pre-roll (a betting VAST video ad from adcenter.cx).
  // We must NOT wrap window.jwplayer — doing so breaks JW's own setup and the
  // player never mounts. Instead poll for the mounted instance and skip any ad
  // the moment it starts, via JW's own event API. Non-destructive to the player.
  (function killJwAds() {
    var tries = 0;
    var iv = setInterval(function () {
      try {
        if (window.jwplayer) {
          var p = window.jwplayer();
          if (p && typeof p.on === 'function' && typeof p.getState === 'function') {
            var skip = function () { try { p.skipAd && p.skipAd(); } catch (e) {} };
            p.on('adStarted', skip);
            p.on('adImpression', skip);
            p.on('adPlay', skip);
            p.on('adBreakStart', skip);
            clearInterval(iv);
          }
        }
      } catch (e) {}
      if (++tries > 80) clearInterval(iv);
    }, 200);
  })();

  // 1) Kill popups / popunders — the worst offender on free phim sites. Define as
  // a getter with a no-op setter so an ad script can't restore the native open().
  try {
    var _noopen = function () { return null; };
    Object.defineProperty(window, 'open', { configurable: true, get: function () { return _noopen; }, set: function () {} });
  } catch (e) { try { window.open = function () { return null; }; } catch (e2) {} }

  // The REAL popunder mechanism (confirmed by instrumentation, not window.open at
  // all): the button's click handler creates an <a href="https://<betting-site>"
  // target="_blank"> and calls .click() on it directly — this fires the browser's
  // native "open new browsing context" behavior independent of window.open, so
  // blocking window.open alone never touched it. In a normal tabbed browser this
  // opens a closeable second tab; in TizenBrew's single-surface webview (no tab
  // chrome) the same request likely hijacks the one visible view with no way back.
  // Patch the CLICK METHOD ITSELF so a non-whitelisted cross-origin target="_blank"
  // anchor never fires its navigation, however it was created or clicked.
  try {
    var _aClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if ((this.target === '_blank' || this.target === '_new')) {
        var h = hostOf(this.href);
        if (h && h !== location.hostname && !WHITELIST.test(h)) return; // refuse to fire
      }
      return _aClick.apply(this, arguments);
    };
  } catch (e) {}
  // Same defense for a hidden <form target="_blank"> submission — a common sibling
  // technique to the anchor-click popunder.
  try {
    var _formSubmit = HTMLFormElement.prototype.submit;
    HTMLFormElement.prototype.submit = function () {
      if ((this.target === '_blank' || this.target === '_new')) {
        var h = hostOf(this.action || '');
        if (h && h !== location.hostname && !WHITELIST.test(h)) return;
      }
      return _formSubmit.apply(this, arguments);
    };
  } catch (e) {}

  // Take over link navigation: same-origin links (films/episodes) we navigate
  // ourselves and stop the site's handlers (which piggyback a popunder redirect);
  // cross-origin ad links are killed. NOTE: this covers link clicks only. Non-link
  // controls (vietsub/server buttons, play overlay) have the ad redirect FUSED into
  // their own click handler via `location.href =` — confirmed via 4 failed sink
  // probes (window.location setter, Location.prototype.href/assign/replace, CSP
  // navigate-to — all either unforgeable or simply not the call site used). No
  // event-level trick can separate "the button's real behavior" from the redirect
  // because they're the same function body. This is NOT fixable from a userscript;
  // see memory notes for the recommended pivot (own hls.js player, bypass the button
  // entirely).
  function onNav(ev) {
    // Kill the redundant NATIVE trusted click Tizen emits for an OK press. Our
    // virtual cursor already issued the intended action as a SYNTHETIC click; Tizen
    // ALSO fires a trusted click for the same OK. Guarded by recency so a stray
    // trusted click (real remote/mouse input) never leaves the UI dead.
    if (ev.isTrusted && (Date.now() - tpwebSyntheticTs) < 700 &&
        (ev.type === 'click' || ev.type === 'auxclick' || ev.type === 'mousedown' ||
         ev.type === 'mouseup' || ev.type === 'pointerdown' || ev.type === 'pointerup')) {
      ev.preventDefault(); ev.stopImmediatePropagation();
      return;
    }
    var a = ev.target && ev.target.closest && ev.target.closest('a[href]');
    if (!a) return;
    var raw = a.getAttribute('href') || '';
    if (!raw || raw.charAt(0) === '#' || /^(javascript|mailto|tel):/i.test(raw)) return;
    var url; try { url = new URL(a.href, location.href); } catch (e) { return; }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    if (url.hostname === location.hostname) {
      ev.stopImmediatePropagation();
      if (ev.type === 'click') { ev.preventDefault(); location.assign(url.href); }
    } else if (!WHITELIST.test(url.hostname)) {
      ev.preventDefault(); ev.stopImmediatePropagation(); // cross-origin ad link
    }
  }
  ['click', 'mousedown', 'pointerdown', 'pointerup', 'mouseup', 'touchstart', 'auxclick', 'contextmenu'].forEach(function (type) {
    // bind on window too — window's capture phase runs before document's, so we
    // intercept the popunder even if it registers a capture listener on document.
    try { window.addEventListener(type, onNav, true); } catch (e) {}
    document.addEventListener(type, onNav, true);
  });

  // 2) Block ad scripts/iframes at creation (before they can load).
  try {
    var origCreate = Document.prototype.createElement;
    Document.prototype.createElement = function (tag) {
      var el = origCreate.call(this, tag);
      var t = String(tag).toLowerCase();
      if (t === 'script' || t === 'iframe') {
        var proto = t === 'script' ? HTMLScriptElement.prototype : HTMLIFrameElement.prototype;
        var d = Object.getOwnPropertyDescriptor(proto, 'src');
        if (d && d.set) {
          Object.defineProperty(el, 'src', {
            configurable: true,
            get: function () { return d.get.call(el); },
            set: function (v) { if (isAdUrl(v)) return; d.set.call(el, v); }
          });
        }
      }
      return el;
    };
  } catch (e) {}

  // 3) Remove ad iframes/embeds already in the DOM and as they appear.
  function isAdNode(n) {
    if (!n || n.nodeType !== 1) return false;
    var tag = n.tagName;
    if (tag === 'IFRAME' || tag === 'INS' || tag === 'EMBED') {
      return isAdUrl(n.src || (n.getAttribute && n.getAttribute('src')) || '');
    }
    return false;
  }
  function sweep(root) {
    try {
      var els = root.querySelectorAll ? root.querySelectorAll('iframe, ins, embed') : [];
      for (var i = 0; i < els.length; i++) if (isAdNode(els[i])) hide(els[i]);
      // The site's own ad slots (betting banners) — hide the whole container.
      var slots = root.querySelectorAll ? root.querySelectorAll(AD_SELECTOR) : [];
      for (var k = 0; k < slots.length; k++) hide(slots[k]);
      // Cross-origin ad images (adcenter.cx etc.) anywhere on the page.
      var imgs = root.querySelectorAll ? root.querySelectorAll('img') : [];
      for (var m = 0; m < imgs.length; m++) if (isAdImg(imgs[m])) killImg(imgs[m]);
      // Full-screen ad modals / banners (identified by their `.no-ads-under` closer).
      hideAdOverlays(root);
    } catch (e) {}
  }
  var obs = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      if (muts[i].type === 'attributes') {
        var tgt = muts[i].target;
        if (tgt && tgt.tagName === 'IMG' && isAdImg(tgt)) killImg(tgt);
        else if (tgt && tgt.matches && tgt.matches(AD_SELECTOR)) hide(tgt);
        continue;
      }
      var a = muts[i].addedNodes;
      for (var j = 0; j < a.length; j++) {
        var n = a[j];
        if (isAdNode(n) || (n.nodeType === 1 && n.matches && n.matches(AD_SELECTOR))) hide(n);
        else if (n.nodeType === 1 && n.tagName === 'IMG' && isAdImg(n)) killImg(n);
        else if (n.nodeType === 1) sweep(n);
      }
    }
  });
  function start() { sweep(document); try { obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] }); } catch (e) {} }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  // 4) Remote-driven VIRTUAL MOUSE CURSOR. phimmoie is a mouse/touch SPA; the TV
  // has only a D-pad. Arrow keys move an on-screen cursor (with acceleration), OK
  // dispatches a real click at the cursor — so you can reach ANYTHING, including the
  // player controls. Deliberately NO CSS transform on page elements: a transform on
  // the player's ancestor knocks the <video> off the Tizen hardware plane (black
  // screen + audio only), which the old focus ring was likely causing.
  (function virtualCursor() {
    var cur = null, cx = 0, cy = 0, vel = 0, lastDir = '', lastT = 0, lastHover = null;

    function ensure() {
      if (cur && document.body && document.body.contains(cur)) return;
      cur = document.createElement('div');
      cur.setAttribute('data-tpweb-cursor', '1');
      cur.style.cssText = 'position:fixed;width:26px;height:26px;z-index:2147483647;pointer-events:none;' +
        'border-radius:50%;background:rgba(255,43,43,.30);border:2px solid #ff2b2b;' +
        'box-shadow:0 0 9px 2px rgba(255,43,43,.75),inset 0 0 4px rgba(255,255,255,.6);' +
        'transform:translate(-50%,-50%);transition:left .045s linear,top .045s linear;will-change:left,top';
      (document.body || document.documentElement).appendChild(cur);
      if (!cx && !cy) { cx = (window.innerWidth || 1280) / 2; cy = (window.innerHeight || 720) / 2; }
      draw();
    }
    function draw() { if (cur) { cur.style.left = cx + 'px'; cur.style.top = cy + 'px'; } }

    function move(dx, dy, dir) {
      ensure();
      var now = Date.now();
      vel = (dir === lastDir && now - lastT < 260) ? Math.min(vel * 1.4, 95) : 26;
      lastDir = dir; lastT = now;
      var W = window.innerWidth || 1280, H = window.innerHeight || 720;
      cx = Math.max(3, Math.min(W - 3, cx + dx * vel));
      cy = Math.max(3, Math.min(H - 3, cy + dy * vel));
      draw();
      // Edge scrolling: near the top/bottom edge and pushing that way, scroll the
      // page so you can reach content past the fold; left/right at the side edges
      // scrolls a horizontally-scrollable row under the cursor.
      var edge = 120, sc = Math.max(vel, 55);
      if (dy > 0 && cy > H - edge) window.scrollBy(0, sc);
      else if (dy < 0 && cy < edge) window.scrollBy(0, -sc);
      if (dx !== 0 && (cx > W - edge || cx < edge)) {
        var row = document.elementFromPoint(Math.max(3, Math.min(W - 3, cx)), cy);
        for (var g = 0; g < 6 && row; g++) {
          if (row.scrollWidth > row.clientWidth + 8) { row.scrollLeft += dx * sc; break; }
          row = row.parentElement;
        }
      }
      hover();
    }
    // A CSS `filter` on an element forces that element's WHOLE SUBTREE onto a
    // software compositing path (it rasterizes the group together) — on a TV,
    // applying `filter` to any ANCESTOR of a hardware-plane-composited <video> can
    // knock it off that plane (black picture, audio unaffected — decode and
    // display are separate pipelines). Excluding `tagName!=='VIDEO'` only skips
    // the video ITSELF; it does nothing if `.closest()` returns a wrapping
    // container that has the video as a descendant (e.g. a `cursor-pointer`
    // thumbnail wrapper around the player before/around playback). Guard against
    // that explicitly: skip the filter (and don't dispatch mousemove either, to
    // avoid triggering the site's OWN `:hover` CSS on that same ancestor chain —
    // a real TV remote never produces mousemove/hover at all, so this is a
    // TizenBrew-cursor-specific risk with no native-browser equivalent) whenever
    // the candidate contains a <video>.
    function containsVideo(el) { return !!(el && el.querySelector && el.querySelector('video')); }
    function hover() {
      if (cur) cur.style.display = 'none';
      var el = document.elementFromPoint(cx, cy);
      if (cur) cur.style.display = '';
      if (lastHover && lastHover !== el) { try { lastHover.style.removeProperty('filter'); } catch (e) {} }
      var t = el && el.closest ? el.closest('a[href],button,[role="button"],.jw-icon,[onclick],input,[class*="cursor-pointer"]') : null;
      var unsafe = t && (t.tagName === 'VIDEO' || containsVideo(t));
      if (t && !unsafe) { try { t.style.setProperty('filter', 'brightness(1.3)'); } catch (e) {} lastHover = t; }
      else lastHover = null;
      // Skip the synthetic mousemove entirely inside the player region (anything
      // that IS or CONTAINS a video) — no legitimate reason to trigger :hover
      // there, only risk.
      if (el && !(el.tagName === 'VIDEO' || el.closest && el.closest('[class*="aspect-video"]'))) {
        try { el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: cx, clientY: cy, view: window })); } catch (e) {}
      }
    }
    function clickAt() {
      ensure();
      if (cur) cur.style.display = 'none';
      var el = document.elementFromPoint(cx, cy);
      if (cur) cur.style.display = '';
      if (!el) return;
      tpwebSyntheticTs = Date.now(); // tell onNav to suppress the native gesture OK also emits
      // ONLY a single `click` — a full pointerdown+up+click gesture trips the site's
      // popunder, but a lone click still activates links / React / JW controls.
      var o = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, view: window };
      try { el.dispatchEvent(new MouseEvent('click', o)); } catch (e) {}
    }

    document.addEventListener('keydown', function (ev) {
      var k = ev.keyCode, a = document.activeElement, typing = a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
      if (k === 37 || k === 38 || k === 39 || k === 40) {
        if (typing) return; // let arrows edit text in a field
        ev.preventDefault(); ev.stopPropagation();
        if (k === 37) move(-1, 0, 'l'); else if (k === 39) move(1, 0, 'r');
        else if (k === 38) move(0, -1, 'u'); else move(0, 1, 'd');
      } else if (k === 13) {
        if (typing) return; // Enter submits/inserts in a field
        ev.preventDefault(); ev.stopPropagation(); clickAt();
      } else if (k === 10009 || k === 461) { // Tizen / LG BACK
        try { history.back(); } catch (e) {}
      }
    }, true);

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensure);
    else setTimeout(ensure, 500);
    // keep the cursor alive across SPA re-renders that wipe body children
    setInterval(function () { try { ensure(); if (cur) cur.style.zIndex = '2147483647'; } catch (e) {} }, 1500);
  })();

  // 5) DIAGNOSTIC (non-intrusive — a small corner label, never covers the video).
  // Reports ground truth on JW's own video once it starts playing: real pixel
  // dimensions (proves whether decode is happening at all) and whether anything
  // sits on top of it or carries a disqualifying CSS property (filter/transform/
  // opacity/mix-blend-mode/backdrop-filter) on its ancestor chain up to the player
  // container. This settles, with real on-TV data instead of more guessing,
  // whether the black screen is a compositing/CSS issue or genuine decode failure.
  (function playerDiagnostic() {
    if (!/\/tap-\d+/i.test(location.pathname)) return;
    var badge, reported = false;
    function ensureBadge() {
      if (badge && document.body && document.body.contains(badge)) return;
      badge = document.createElement('div');
      badge.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:2147483647;max-width:46vw;' +
        'background:rgba(0,0,0,.55);color:#0f0;font:11px/1.4 monospace;padding:5px 8px;' +
        'border-radius:6px;white-space:pre-wrap;pointer-events:none';
      (document.body || document.documentElement).appendChild(badge);
    }
    function suspectAncestors(el) {
      var bad = [], n = el, depth = 0;
      while (n && depth < 8) {
        var s = getComputedStyle(n);
        var flags = [];
        if (s.filter && s.filter !== 'none') flags.push('filter=' + s.filter);
        if (s.transform && s.transform !== 'none') flags.push('transform');
        if (s.opacity && parseFloat(s.opacity) < 1) flags.push('opacity=' + s.opacity);
        if (s.mixBlendMode && s.mixBlendMode !== 'normal') flags.push('blend=' + s.mixBlendMode);
        if (s.backdropFilter && s.backdropFilter !== 'none') flags.push('backdrop-filter');
        if (s.willChange && s.willChange !== 'auto') flags.push('will-change=' + s.willChange);
        if (flags.length) bad.push((n.tagName || '?') + '.' + String(n.className || '').slice(0, 20) + '[' + flags.join(',') + ']');
        n = n.parentElement; depth++;
      }
      return bad;
    }
    function report(v) {
      if (reported) return;
      var r = v.getBoundingClientRect();
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var topEl = document.elementFromPoint(cx, cy);
      var coveredBy = (topEl && topEl !== v && !v.contains(topEl)) ? (topEl.tagName + '.' + String(topEl.className || '').slice(0, 24)) : 'none';
      var bad = suspectAncestors(v);
      ensureBadge();
      badge.textContent = 'TPWEB DIAG videoSize=' + v.videoWidth + 'x' + v.videoHeight +
        ' rectSize=' + Math.round(r.width) + 'x' + Math.round(r.height) +
        ' readyState=' + v.readyState + ' paused=' + v.paused + ' t=' + v.currentTime.toFixed(1) +
        '\ncoveredBy=' + coveredBy +
        '\ncssHazards=' + (bad.length ? bad.join(' | ') : 'none found');
      reported = true;
      // Re-check once more a few seconds later in case the first read was mid-transition.
      setTimeout(function () { reported = false; report(v); }, 8000);
    }
    var iv = setInterval(function () {
      var v = document.querySelector('video');
      if (v && v.currentTime > 0.3) report(v);
    }, 1000);
    setTimeout(function () { clearInterval(iv); }, 120000);
  })();

  console.log('[TizenPhimWeb] ad-block + virtual cursor active on ' + location.hostname);
})();
