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

  // Any image from a non-whitelisted cross-origin host is an ad here: all real
  // posters/thumbs on phimmoie are same-origin (or whitelisted CDNs). Remove the
  // image and its click wrapper so no betting banner flashes before CSS/observer.
  function isAdImg(img) {
    var src = img.currentSrc || img.src || (img.getAttribute && img.getAttribute('src')) || '';
    if (!src) return false;
    var h = hostOf(src);
    return !!(h && h !== location.hostname && !WHITELIST.test(h));
  }
  function killImg(img) { try { (img.closest('a') || img).remove(); } catch (e) { try { img.remove(); } catch (e2) {} } }

  // 1) Kill popups / popunders — the worst offender on free phim sites.
  try { window.open = function () { return null; }; } catch (e) {}

  // Block popunder click-throughs (cross-origin target=_blank links).
  ['click', 'mousedown', 'pointerdown', 'touchstart', 'auxclick', 'contextmenu'].forEach(function (type) {
    document.addEventListener(type, function (ev) {
      var a = ev.target && ev.target.closest && ev.target.closest('a[target="_blank"], a[href^="http"]');
      if (a && a.href) {
        var h = hostOf(a.href);
        if (h && h !== location.hostname && !WHITELIST.test(h)) { ev.preventDefault(); ev.stopPropagation(); }
      }
    }, true);
  }, true);

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
      for (var i = 0; i < els.length; i++) if (isAdNode(els[i])) els[i].remove();
      // The site's own ad slots (betting banners) — remove the whole container.
      var slots = root.querySelectorAll ? root.querySelectorAll(AD_SELECTOR) : [];
      for (var k = 0; k < slots.length; k++) { try { slots[k].remove(); } catch (e) {} }
      // Cross-origin ad images (adcenter.cx etc.) anywhere on the page.
      var imgs = root.querySelectorAll ? root.querySelectorAll('img') : [];
      for (var m = 0; m < imgs.length; m++) if (isAdImg(imgs[m])) killImg(imgs[m]);
    } catch (e) {}
  }
  var obs = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      if (muts[i].type === 'attributes') {
        var tgt = muts[i].target;
        if (tgt && tgt.tagName === 'IMG' && isAdImg(tgt)) killImg(tgt);
        continue;
      }
      var a = muts[i].addedNodes;
      for (var j = 0; j < a.length; j++) {
        var n = a[j];
        if (isAdNode(n) || (n.nodeType === 1 && n.matches && n.matches(AD_SELECTOR))) { try { n.remove(); } catch (e) {} }
        else if (n.nodeType === 1 && n.tagName === 'IMG' && isAdImg(n)) killImg(n);
        else if (n.nodeType === 1) sweep(n);
      }
    }
  });
  function start() { sweep(document); try { obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] }); } catch (e) {} }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  // 4) Remote D-pad navigation. phimmoie is a mouse/touch SPA; the TV has only a
  // remote. Arrow keys move a visible focus ring to the nearest focusable element
  // in that direction, Enter activates it. Tizen's native spatial nav is unreliable.
  (function spatialNav() {
    try {
      var fcss = document.createElement('style');
      fcss.textContent =
        '.tpweb-focus{outline:3px solid #ff2b2b!important;outline-offset:2px!important;' +
        'box-shadow:0 0 0 3px rgba(255,43,43,.6)!important;border-radius:6px!important;' +
        'scroll-margin:120px!important}';
      (document.head || document.documentElement).appendChild(fcss);
    } catch (e) {}

    var SEL = 'a[href],button,input,select,textarea,video,[tabindex]:not([tabindex="-1"]),[role="button"]';
    var current = null;

    function visible(el) {
      if (!el || !el.getClientRects().length) return false;
      var r = el.getBoundingClientRect();
      if (r.width < 6 || r.height < 6) return false;
      var s = getComputedStyle(el);
      return s.visibility !== 'hidden' && s.display !== 'none' && s.pointerEvents !== 'none';
    }
    function items() {
      var out = [], all = document.querySelectorAll(SEL);
      for (var i = 0; i < all.length; i++) if (visible(all[i])) out.push(all[i]);
      return out;
    }
    function center(el) { var r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r }; }

    function setFocus(el) {
      if (current) current.classList.remove('tpweb-focus');
      current = el;
      if (!el) return;
      el.classList.add('tpweb-focus');
      try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) {} }
      try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch (e) {}
    }

    function pick(dir) {
      var list = items();
      if (!list.length) return;
      if (!current || !visible(current) || list.indexOf(current) === -1) { setFocus(list[0]); return; }
      var c = center(current), best = null, bestScore = Infinity;
      for (var i = 0; i < list.length; i++) {
        if (list[i] === current) continue;
        var t = center(list[i]), dx = t.x - c.x, dy = t.y - c.y, primary, cross;
        if (dir === 'right') { if (dx <= 1) continue; primary = dx; cross = Math.abs(dy); }
        else if (dir === 'left') { if (dx >= -1) continue; primary = -dx; cross = Math.abs(dy); }
        else if (dir === 'down') { if (dy <= 1) continue; primary = dy; cross = Math.abs(dx); }
        else { if (dy >= -1) continue; primary = -dy; cross = Math.abs(dx); }
        var score = primary + cross * 2; // prefer aligned, then nearest
        if (score < bestScore) { bestScore = score; best = list[i]; }
      }
      if (best) setFocus(best);
    }

    function activate() {
      if (!current) return;
      var tag = current.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') { try { current.focus(); } catch (e) {} return; }
      try { current.click(); } catch (e) {}
    }

    document.addEventListener('keydown', function (ev) {
      var k = ev.keyCode, a = document.activeElement, typing = a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
      // 37 left, 38 up, 39 right, 40 down, 13 enter
      if (k === 37 || k === 39) { if (typing) return; ev.preventDefault(); ev.stopPropagation(); pick(k === 39 ? 'right' : 'left'); }
      else if (k === 38 || k === 40) { ev.preventDefault(); ev.stopPropagation(); pick(k === 40 ? 'down' : 'up'); }
      else if (k === 13) {
        if (typing && current === a) return; // let Enter submit inside a field
        ev.preventDefault(); ev.stopPropagation(); activate();
      }
    }, true);

    function seed() { if (!current) { var l = items(); if (l.length) setFocus(l[0]); } }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', seed);
    else setTimeout(seed, 300);
  })();

  console.log('[TizenPhimWeb] ad-block + remote nav active on ' + location.hostname);
})();
