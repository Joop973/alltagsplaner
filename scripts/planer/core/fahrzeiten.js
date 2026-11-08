// Fahrzeiten: Antworten des Kurzbefehls lesen und zwischenspeichern.
'use strict';

function hole(n) {
  if (typeof require === 'function') return require('./' + n);
  try { return importModule('planer/core/' + n); } catch (e) { return importModule(n); }
}
const D = hole('datum');

// "15 Min.", "1 Std. 5 Min.", "1 h 5 min", "1:05", "900" (Sekunden), 15 -> Minuten
function minutenAusText(x) {
  if (x == null) return null;
  if (typeof x === 'number') return x > 300 ? Math.round(x / 60) : Math.round(x);
  const s = String(x).toLowerCase().replace(/,/g, '.').trim();
  if (!s) return null;
  const uhr = s.match(/^(\d+):(\d{2})/);
  if (uhr) return Number(uhr[1]) * 60 + Number(uhr[2]);
  const h = s.match(/(\d+(?:\.\d+)?)\s*(?:h\b|std|stunde)/);
  const m = s.match(/(\d+(?:\.\d+)?)\s*(?:min|m\b)/);
  if (h || m) return Math.round((h ? parseFloat(h[1]) * 60 : 0) + (m ? parseFloat(m[1]) : 0));
  const sek = s.match(/(\d+(?:\.\d+)?)\s*(?:s\b|sek)/);
  if (sek) return Math.max(1, Math.round(parseFloat(sek[1]) / 60));
  if (/^\d+(\.\d+)?$/.test(s)) return minutenAusText(parseFloat(s));
  return null;
}

// Text vom Kurzbefehl: erste Zeile "b", dann je Zeile "s1|15 Min."
// offen: {s1: {key, ...}} -> [{key, id, min, roh}]
function ergebnisseLesen(text, offen) {
  const ergebnisse = [];
  for (const zeile of String(text || '').split(/\r?\n/)) {
    const i = zeile.indexOf('|');
    if (i < 0) continue;
    const id = zeile.slice(0, i).trim();
    const roh = zeile.slice(i + 1).trim();
    const strecke = (offen || {})[id];
    if (!strecke) continue;
    ergebnisse.push({ id, key: strecke.key, roh, min: minutenAusText(roh) });
  }
  return ergebnisse;
}

function cacheAktualisieren(cache, ergebnisse, heuteYmd) {
  for (const e of ergebnisse) {
    if (e.min != null && e.min >= 0) cache[e.key] = { min: e.min, datum: heuteYmd };
  }
  return cache;
}

function cacheWert(cache, key) {
  const e = cache && cache[key];
  return e && typeof e.min === 'number' ? e.min : null;
}

function istFrisch(cache, key, heuteYmd, maxTage) {
  const e = cache && cache[key];
  if (!e || typeof e.min !== 'number' || !e.datum) return false;
  return D.tageZwischen(D.ausYmd(e.datum), D.ausYmd(heuteYmd)) <= maxTage;
}

module.exports = { minutenAusText, ergebnisseLesen, cacheAktualisieren, cacheWert, istFrisch };
