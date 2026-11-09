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

// Strecken für den Kurzbefehl aufteilen: eine Liste fürs Rad, eine fürs Auto.
// noetig: [{key, von, nach, modus}] -> {ausgabe: {rad, auto, anzahl}, offen: {strecken, rad, auto}}
function streckenAufteilen(noetig) {
  const offen = { strecken: {}, rad: [], auto: [] };
  const ausgabe = { rad: [], auto: [], anzahl: noetig.length };
  noetig.forEach((s, i) => {
    const id = `s${i + 1}`;
    offen.strecken[id] = s;
    const teil = s.modus === 'Fahrrad' ? 'rad' : 'auto';
    offen[teil].push(id);
    ausgabe[teil].push({ von: s.von, nach: s.nach });
  });
  return { ausgabe, offen };
}

// Ist der Text vom Kurzbefehl die Rückgabe der Fahrzeiten (Phase b)?
function istPhaseB(text) {
  const t = String(text || '');
  return /^\s*b\s*$/im.test(t.split(/\r?\n/)[0] || '') || /^\s*(RAD|AUTO)\s*$/im.test(t);
}

// Text vom Kurzbefehl, z. B.
//   RAD
//   15 Min.        <- Fahrzeiten in derselben Reihenfolge wie die Liste "rad"
//   AUTO
//   20 Min.
// Leere Zeilen werden übersprungen. Altes Format "s1|15 Min." geht auch.
// offen: {strecken: {s1: {key}}, rad: [ids], auto: [ids]} -> [{key, id, min, roh}]
function ergebnisseLesen(text, offen) {
  const o = offen || {};
  const strecken = o.strecken || {};
  const ergebnisse = [];
  const zaehler = { rad: 0, auto: 0 };
  let teil = null;
  for (const roheZeile of String(text || '').split(/\r?\n/)) {
    const zeile = roheZeile.trim();
    if (!zeile) continue;
    const gross = zeile.toUpperCase();
    if (gross === 'RAD' || gross === 'AUTO') { teil = gross.toLowerCase(); continue; }
    const i = zeile.indexOf('|');
    if (i > 0 && strecken[zeile.slice(0, i).trim()]) {
      const id = zeile.slice(0, i).trim();
      const roh = zeile.slice(i + 1).trim();
      ergebnisse.push({ id, key: strecken[id].key, roh, min: minutenAusText(roh) });
      continue;
    }
    if (!teil) continue; // z. B. "b"
    const id = (o[teil] || [])[zaehler[teil]++];
    if (!id || !strecken[id]) continue;
    ergebnisse.push({ id, key: strecken[id].key, roh: zeile, min: minutenAusText(zeile) });
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

module.exports = { minutenAusText, streckenAufteilen, istPhaseB, ergebnisseLesen, cacheAktualisieren, cacheWert, istFrisch };
