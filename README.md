# TizenPhim Web

A TizenBrew **mods** module: it opens **phimmoie.fm** directly on your TV and
**blocks the ads/popups**. Same idea as TizenTube (which mods youtube.com/tv).

## Why this instead of a scraper app
Every attempt to *scrape* these phim sites failed — they send no CORS and
Cloudflare blocks datacenter/proxy IPs. But loading the site by **browser
navigation** (what a mods module does) isn't subject to CORS and passes
Cloudflare from your TV's home IP. You get the site's real UI and its **clean
opstream90 streams** (0 discontinuities → no buffering), minus the ads.

## What the injected script does (`userScript.js`)
- **Blocks popunders/popups** — `window.open` is neutralised and cross-origin
  `target="_blank"` click-throughs are cancelled.
- **Blocks ad networks at creation** — overrides `document.createElement` so ad
  `<script>`/`<iframe>` srcs from known ad hosts (and any non-whitelisted
  cross-origin frame) never load.
- **Removes ad iframes/embeds** already present and as they're injected
  (MutationObserver).
- **Whitelists** the site + player (phimmoie/motchille, opstream, JW Player,
  reCAPTCHA, YouTube trailers) so nothing real breaks.

Verified in a browser: site loads, movie cards render, the opstream player is
intact, `window.open` is blocked, no errors.

## package.json (the mods manifest)
```json
{
  "packageType": "mods",
  "websiteURL": "https://phimmoie.fm/",
  "main": "userScript.js"
}
```

## Install (TizenBrew)
Add this module in TizenBrew the same way you add your other modules (by its
repo/jsDelivr URL or npm name). TizenBrew reads `packageType: "mods"`, navigates
the TV browser to `websiteURL`, and injects `main` into every page.

## Tuning the ad-block
Ads on these sites change. If one slips through on the TV:
1. Note the ad's iframe/script host (or that it's a popup).
2. Add the host to the `AD` regex (or the popup is already covered by the
   `window.open` block) in `userScript.js`, and re-publish.

## Notes
- Uses the site's own remote/D-pad navigation (Tizen webview spatial nav). If
  navigation feels rough, that's a separate enhancement (a focus-nav helper) we
  can add to the same script.
- Kept `motchille.cx` whitelisted too (it's a phimmoie mirror) — switch
  `websiteURL` to it if phimmoie is ever down.
