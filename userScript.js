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
          // Some VAST parsers read responseXML (browser-parsed XML DOM) instead of
          // parsing responseText themselves — without this, JW may hang waiting for
          // a responseXML that never arrives, instead of cleanly reporting "no ad".
          try {
            var xmlDoc = new DOMParser().parseFromString(EMPTY_VAST, 'text/xml');
            Object.defineProperty(xhr, 'responseXML', { configurable: true, value: xmlDoc });
          } catch (e2) {}
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
    function hover() {
      if (cur) cur.style.display = 'none';
      var el = document.elementFromPoint(cx, cy);
      if (cur) cur.style.display = '';
      if (lastHover && lastHover !== el) { try { lastHover.style.removeProperty('filter'); } catch (e) {} }
      var t = el && el.closest ? el.closest('a[href],button,[role="button"],.jw-icon,[onclick],input,[class*="cursor-pointer"]') : null;
      if (t && t.tagName !== 'VIDEO') { try { t.style.setProperty('filter', 'brightness(1.3)'); } catch (e) {} lastHover = t; }
      else lastHover = null;
      if (el) try { el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: cx, clientY: cy, view: window })); } catch (e) {}
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

  // 5) CUSTOM PLAYER. phimmoie's own JW player is where the black screen (ad→
  // content source-swap on one <video> element likely freezing Tizen's hw decode
  // plane) and the fused-handler popunders on vietsub/server buttons both live. We
  // bypass it entirely: extract the movie's own .m3u8 via network sniffing while JW
  // resolves it INVISIBLY in the background (its container hidden from the start),
  // then play that URL in our OWN fresh <video>+hls.js — same proven config as the
  // sibling TizenPhim app. The user never sees or touches JW's UI or its buttons, so
  // the popunder never has anything to fire from. Only runs on episode/player pages;
  // our link-hijack does full page loads (not SPA routing), so this check at
  // script-start reliably reflects the current page every time.
  (function customPlayer() {
    if (!/\/tap-\d+/i.test(location.pathname)) return;

    // Do NOT hide phimmoie's own player container — hiding it before JW ever
    // initializes seems to stop JW's setup from running at all (jwplayer() returns
    // the bare namespace, no player instance, no getState). Let JW initialize
    // completely untouched underneath; our poster is a full-screen z-index:999998
    // overlay with an opaque background, so it visually covers the JW area
    // regardless of that area's own hidden state — no need to touch it at all.

    // Extraction has two independent signals, combined:
    //  1) PRIMARY — JW's own event API. `firstFrame`/`playlistItem` fire with the
    //     resolved source once JW has it. The initial `sources:[{file:"/1s_blank.mp4"}]`
    //     from setup is NOT a placeholder that's silently replaced — it's genuinely
    //     what plays if nothing else is selected, so we must keep listening past a
    //     blank-file event rather than treating the first firstFrame as final.
    //  2) BACKUP — network sniffing (chained onto the existing VAST-blocking fetch/
    //     XHR wrappers) in case a source is fetched via .m3u8 directly.
    var resolvedUrl = null, resolvedWaiters = [];
    function onResolved(cb) { if (resolvedUrl) cb(resolvedUrl); else resolvedWaiters.push(cb); }
    function captureResolved(u) {
      if (resolvedUrl || !u || /1s_blank\.mp4/i.test(String(u))) return; // ignore the dummy clip
      resolvedUrl = String(u);
      var w = resolvedWaiters; resolvedWaiters = [];
      for (var i = 0; i < w.length; i++) { try { w[i](resolvedUrl); } catch (e) {} }
    }
    function captureFromPlaylistItem(item) {
      if (!item) return;
      if (item.file) captureResolved(item.file);
      if (item.sources && item.sources.length) {
        for (var i = 0; i < item.sources.length; i++) if (item.sources[i].file) captureResolved(item.sources[i].file);
      }
    }
    // Backup signal: chain onto the fetch/XHR already wrapped above (for
    // VAST-blocking) to also catch a .m3u8 fetched directly, in case some
    // source/server routes through fetch/XHR rather than JW's internal resolution.
    try {
      var _fetchP = window.fetch;
      window.fetch = function (input) {
        var u = input && input.url ? input.url : input;
        if (/\.m3u8(\?|$)/i.test(String(u))) captureResolved(u);
        return _fetchP.apply(this, arguments);
      };
    } catch (e) {}
    try {
      var _openP = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function (m, u) {
        if (/\.m3u8(\?|$)/i.test(String(u))) captureResolved(u);
        return _openP.apply(this, arguments);
      };
    } catch (e) {}

    var poster, statusEl, started = false;
    function el(tag, css, parent) {
      var e = document.createElement(tag);
      if (css) e.style.cssText = css;
      (parent || document.body).appendChild(e);
      return e;
    }
    function buildPoster() {
      poster = el('div', 'position:fixed;inset:0;z-index:999998;background:#000;display:flex;' +
        'align-items:center;justify-content:center;flex-direction:column;gap:16px');
      var title = (document.title || '').replace(/\s*-\s*PhimMoi.*$/i, '').replace(/^Xem phim\s*/i, '');
      var titleEl = el('div', 'color:#fff;font-size:1.4rem;font-weight:600;text-align:center;max-width:80%', poster);
      titleEl.textContent = title;
      var btn = el('div', 'width:88px;height:88px;border-radius:50%;background:rgba(255,43,43,.9);' +
        'display:flex;align-items:center;justify-content:center;font-size:2.2rem;color:#fff;cursor:pointer', poster);
      btn.id = 'tpweb-play-btn';
      btn.textContent = '▶';
      statusEl = el('div', 'color:#aaa;font-size:.95rem;min-height:1.2em', poster);
      btn.addEventListener('click', startExtraction);
    }
    function setStatus(t) { if (statusEl) statusEl.textContent = t; }

    function loadHlsJs(cb) {
      if (window.Hls) return cb();
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js';
      s.onload = cb;
      s.onerror = function () { setStatus('Không tải được trình phát. Thử lại.'); started = false; };
      document.head.appendChild(s);
    }

    // The player's initial `sources:[{file:"/1s_blank.mp4"}]` is genuinely what
    // plays if nothing else is selected — pressing Play alone never resolves past
    // it. A server (e.g. "S - Vietsub") must be explicitly selected first, same as
    // a real visitor would. That control is a plain <button> (not a link) whose own
    // click handler ALSO attempts the popunder redirect — but our anchor-click patch
    // already neutralises that mechanism regardless of what triggers it, so clicking
    // it here is safe; only its legitimate "select this source" behavior takes effect.
    function selectDefaultServer() {
      var b = [].slice.call(document.querySelectorAll('button')).filter(function (e) {
        if (e.offsetParent === null) return false;
        var t = (e.textContent || '').trim();
        return t.length < 20 && /vietsub|thuyết minh|sv\s*\d/i.test(t);
      })[0];
      if (b) { try { b.click(); } catch (e) {} }
      return !!b;
    }

    function startExtraction() {
      if (started) return; started = true;
      setStatus('Đang tải phim…');
      selectDefaultServer();
      var tries = 0, jw = null;
      var iv = setInterval(function () {
        try {
          if (window.jwplayer) {
            var p = window.jwplayer();
            if (p && typeof p.play === 'function') {
              jw = p;
              // Listen on JW's own event API as one signal — but NOT `firstFrame`:
              // that only fires once a VIDEO FRAME actually paints, which is exactly
              // what may never happen in the black-screen scenario this player exists
              // to work around. `playlistItem` fires on source assignment regardless
              // of rendering, and `play`/`time` fire as long as the media element is
              // progressing (audio alone is enough for these to fire).
              try {
                p.on('playlistItem', function (data) { captureFromPlaylistItem(data); });
                p.on('play', function () { try { captureFromPlaylistItem(p.getPlaylistItem()); } catch (e) {} });
                p.on('time', function () { try { captureFromPlaylistItem(p.getPlaylistItem()); } catch (e) {} });
              } catch (e) {}
              p.play(true);
              clearInterval(iv);
            }
          }
        } catch (e) {}
        if (++tries > 50 && !resolvedUrl) { clearInterval(iv); setStatus('Không tìm thấy trình phát. Thử lại.'); started = false; }
      }, 500); // give selectDefaultServer's React state update time to settle before play()
      // Backup: poll getPlaylistItem() directly, independent of any specific JW event
      // firing correctly — the most robust signal, since it doesn't depend on video
      // rendering, network-request visibility, or any particular event semantics.
      var poll = setInterval(function () {
        if (jw) { try { captureFromPlaylistItem(jw.getPlaylistItem()); } catch (e) {} }
      }, 1000);
      var slow = setTimeout(function () { if (!resolvedUrl) setStatus('Đang chờ nguồn phim…'); }, 6000);
      var giveUp = setTimeout(function () {
        clearInterval(poll);
        if (!resolvedUrl) { setStatus('Không lấy được nguồn phim. Thử lại.'); started = false; }
      }, 30000);
      onResolved(function (url) {
        clearTimeout(slow); clearTimeout(giveUp); clearInterval(poll);
        loadHlsJs(function () { mountPlayer(url); });
      });
    }

    function mountPlayer(url) {
      if (poster) { poster.remove(); poster = null; }
      var wrap = el('div', 'position:fixed;inset:0;z-index:999998;background:#000');
      var video = document.createElement('video');
      video.setAttribute('playsinline', '');
      video.style.cssText = 'width:100%;height:100%;background:#000';
      wrap.appendChild(video);
      var bar = el('div', 'position:fixed;left:0;right:0;bottom:0;z-index:999999;padding:14px 24px;' +
        'background:linear-gradient(transparent,rgba(0,0,0,.85));display:flex;align-items:center;gap:14px;' +
        'color:#fff;font-size:1rem;font-family:sans-serif');
      var playIcon = el('div', 'font-size:1.4rem;width:1.5em', bar);
      playIcon.textContent = '⏸';
      var timeEl = el('div', 'white-space:nowrap', bar);
      timeEl.textContent = '0:00 / 0:00';
      var seekTrack = el('div', 'flex:1;height:4px;background:rgba(255,255,255,.25);border-radius:2px;position:relative', bar);
      var seekFill = el('div', 'position:absolute;left:0;top:0;bottom:0;width:0%;background:#ff2b2b;border-radius:2px', seekTrack);

      function fmt(s) { s = Math.max(0, s | 0); var m = (s / 60) | 0, r = s % 60; return m + ':' + (r < 10 ? '0' : '') + r; }
      video.addEventListener('timeupdate', function () {
        timeEl.textContent = fmt(video.currentTime) + ' / ' + fmt(video.duration || 0);
        if (video.duration) seekFill.style.width = (video.currentTime / video.duration * 100) + '%';
      });
      video.addEventListener('play', function () { playIcon.textContent = '⏸'; });
      video.addEventListener('pause', function () { playIcon.textContent = '▶'; });
      video.addEventListener('error', function () {
        var code = video.error && video.error.code;
        setStatus('Lỗi phát video (#' + code + ')');
      });

      // Same proven config as the sibling TizenPhim app's 'normal' buffer preset —
      // these streams' manifests are full of #EXT-X-DISCONTINUITY, which hls.js's
      // software remuxer tolerates (native HLS decoders reject them outright).
      var hls = new window.Hls({
        backBufferLength: 30,
        maxBufferLength: 60, maxMaxBufferLength: 120, maxBufferSize: 90 * 1000 * 1000,
        fragLoadingMaxRetry: 8, fragLoadingRetryDelay: 1000,
        manifestLoadingMaxRetry: 6, levelLoadingMaxRetry: 6,
      });
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(window.Hls.Events.MANIFEST_PARSED, function () { video.play().catch(function () {}); });
      hls.on(window.Hls.Events.ERROR, function (_e, data) {
        if (data && data.fatal) setStatus('Lỗi phát HLS (' + data.type + '): ' + (data.details || ''));
      });

      // Playback keys — while our player is mounted, arrows/media-keys control
      // playback directly (matching TizenPhim's remote UX) instead of driving the
      // browsing cursor. No CSS transform is ever applied to this <video>, avoiding
      // the hardware-plane issue the black screen investigation pointed at.
      var PLAY = 415, PAUSE = 19, PLAYPAUSE = 10252, STOP = 413, FF = 417, REW = 412;
      var BACK = 10009, LGBACK = 461;
      function teardown() {
        try { hls.destroy(); } catch (e) {}
        wrap.remove(); bar.remove();
        document.removeEventListener('keydown', onPlayerKey, true);
      }
      function onPlayerKey(ev) {
        var k = ev.keyCode;
        if (k === 37 || k === REW) {
          ev.preventDefault(); ev.stopImmediatePropagation();
          video.currentTime = Math.max(0, video.currentTime - 10);
        } else if (k === 39 || k === FF) {
          ev.preventDefault(); ev.stopImmediatePropagation();
          video.currentTime = Math.min(video.duration || 1e9, video.currentTime + 10);
        } else if (k === 13 || k === PLAYPAUSE) {
          ev.preventDefault(); ev.stopImmediatePropagation();
          if (video.paused) video.play().catch(function () {}); else video.pause();
        } else if (k === PLAY) {
          ev.preventDefault(); ev.stopImmediatePropagation(); video.play().catch(function () {});
        } else if (k === PAUSE) {
          ev.preventDefault(); ev.stopImmediatePropagation(); video.pause();
        } else if (k === BACK || k === LGBACK || k === STOP) {
          ev.preventDefault(); ev.stopImmediatePropagation();
          teardown();
          try { history.back(); } catch (e) {}
        }
      }
      document.addEventListener('keydown', onPlayerKey, true);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildPoster);
    else buildPoster();
  })();

  console.log('[TizenPhimWeb] ad-block + virtual cursor + custom player active on ' + location.hostname);
})();
