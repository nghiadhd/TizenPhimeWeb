// TizenPhim Web — injected by TizenBrew into phimmoie.fm. Loads the site
// directly (browser navigation ⇒ no CORS, passes Cloudflare, plays the clean
// opstream90 streams) and strips the ads/popups that make these sites unusable.
(function () {
  'use strict';

  // Hosts that are part of the site/player and must NEVER be touched.
  var WHITELIST = /(^|\.)(phimmoie\.fm|motchille\.cx|opstream\d*\.com|kkphimplayer\d*\.com|jwpcdn\.com|jwplatform\.com|jwplayer\.com|ytimg\.com|youtube\.com|youtube-nocookie\.com|google\.com|gstatic\.com|googleapis\.com|cloudflare\.com|cloudflareinsights\.com|recaptcha\.net|jsdelivr\.net)$/i;

  // Known ad / popunder networks (matched anywhere in the URL).
  var AD = /(doubleclick|googlesyndication|googleadservices|pagead2|adservice|popads|popcash|popunder|propellerads|propel|adsterra|mgid|taboola|outbrain|revcontent|histats|adnxs|adsystem|clickadu|hilltopads|exoclick|juicyads|trafficjunky|a-ads|ad-maven|admaven|bidgear|monetag|richads|galaksion|onclckbn|onclickalgo|highperformanceformat|coinzillatag|adtng|adskeeper)/i;

  function hostOf(u) { try { return new URL(u, location.href).hostname; } catch (e) { return ''; } }
  function isAdUrl(u) {
    if (!u) return false;
    var h = hostOf(u);
    if (h && WHITELIST.test(h)) return false;
    if (AD.test(String(u))) return true;
    // any cross-origin iframe/script not on the whitelist is treated as an ad
    return !!(h && h !== location.hostname && !WHITELIST.test(h));
  }

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
    } catch (e) {}
  }
  var obs = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var a = muts[i].addedNodes;
      for (var j = 0; j < a.length; j++) {
        var n = a[j];
        if (isAdNode(n)) { try { n.remove(); } catch (e) {} }
        else if (n.nodeType === 1) sweep(n);
      }
    }
  });
  function start() { sweep(document); try { obs.observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {} }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  console.log('[TizenPhimWeb] ad-block active on ' + location.hostname);
})();
