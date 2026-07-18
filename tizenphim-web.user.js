// ==UserScript==
// @name         TizenPhim Web (ad-block + remote cursor)
// @namespace    nghiadhd
// @version      3.3.0
// @description  Ad/popunder block + virtual mouse cursor for phimmoie.fm — mirrors the TizenBrew mods module. Desktop test harness.
// @match        https://phimmoie.fm/*
// @match        https://www.phimmoie.fm/*
// @match        https://motchille.cx/*
// @run-at       document-start
// @grant        none
// @require      https://cdn.jsdelivr.net/gh/nghiadhd/TizenPhimeWeb@bfd91c1/userScript.js
// ==/UserScript==
// The real logic lives in userScript.js (pinned to the deployed commit via @require),
// so this stays identical to what TizenBrew injects on the TV. Bump @version AND the
// @require hash together whenever a new build ships (forces Tampermonkey to refetch).
