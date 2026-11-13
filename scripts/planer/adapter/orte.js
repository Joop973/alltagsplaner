// Scriptable: Orte finden (OpenStreetMap-Suche) und lernen.
// "Wegzeit abrufen" im Kurzbefehl bricht ab, wenn ein Ort nicht gefunden wird –
// darum werden Orte hier vorher gesucht und nur gefundene Adressen weitergegeben.
//
// Gelernte Orte (planer-daten/orte.json):
//   eintraege: { "<ort-text klein>": {text, adresse, quelle: suche|hand|standort|ignoriert, datum} }
//   offen:     { "<ort-text klein>": {text, seit, fehler, versucht} }   noch nicht gefunden
'use strict';

function hole(p) {
  try { return importModule('planer/' + p); } catch (e) { return importModule('../' + p); }
}
const D = hole('core/datum');
const O = hole('core/orte');
const DAT = hole('adapter/dateien');

const DATEI = 'orte.json';
const SUCHE_GUELTIG_TAGE = 180;

async function laden() {
  const roh = await DAT.lesen(DATEI, {});
  if (roh && roh.eintraege) return { eintraege: roh.eintraege, offen: roh.offen || {} };
  // altes Format {k: {adresse, datum}}: nur gefundene übernehmen
  const eintraege = {};
  for (const [k, v] of Object.entries(roh || {})) {
    if (v && v.adresse) eintraege[k] = { text: k, adresse: v.adresse, quelle: 'suche', datum: v.datum };
  }
  return { eintraege, offen: {} };
}

async function speichern(d) { await DAT.schreiben(DATEI, d); }

// Adresssuche über OpenStreetMap (Nominatim): kostenlos, ohne Konto.
// Regeln von OpenStreetMap: höchstens 1 Anfrage pro Sekunde, Programm im User-Agent nennen.
// (Scriptable selbst hat keine Adresssuche, nur reverseGeocode.)
const SUCHE_URL = 'https://nominatim.openstreetmap.org/search';
const LAND = 'de';
const G = typeof globalThis !== 'undefined' ? globalThis : this;
function warten(ms) {
  if (ms <= 0 || typeof Timer === 'undefined') return Promise.resolve();
  return new Promise(r => Timer.schedule(ms, false, r));
}
async function osmSuche(text) {
  const pause = 1100 - (Date.now() - (G.__planerLetzteSuche || 0));
  await warten(pause);
  G.__planerLetzteSuche = Date.now();
  const r = new Request(`${SUCHE_URL}?format=jsonv2&addressdetails=1&limit=1&accept-language=de&countrycodes=${LAND}&q=${encodeURIComponent(String(text))}`);
  r.headers = { 'User-Agent': 'Alltagsplaner/3 (Scriptable; github.com/Joop973/alltagsplaner)' };
  r.timeoutInterval = 10;
  const j = await r.loadJSON();
  return O.ausNominatim(Array.isArray(j) ? j[0] : null);
}

// Eine Variante prüfen -> {adresse, ort} oder {fehler}
async function geocode(text) {
  try {
    const ort = await osmSuche(text);
    const adresse = O.adresseAusOrt(ort);
    return adresse ? { adresse, ort } : { fehler: 'kein Treffer' };
  } catch (e) {
    return { fehler: String(e && e.message ? e.message : e) };
  }
}

async function suchenMitVarianten(text) {
  let fehler = 'kein Treffer';
  for (const v of O.suchVarianten(text)) {
    const r = await geocode(v);
    if (r.adresse) return { adresse: r.adresse, variante: v, ort: r.ort };
    fehler = r.fehler;
  }
  return { adresse: null, fehler };
}

// Adresse -> {lat, lon} (für das Wetter)
async function koordinaten(text) {
  const r = await suchenMitVarianten(text);
  const l = r.ort && r.ort.location;
  return l ? { lat: l.latitude, lon: l.longitude } : null;
}

function imVordergrund() { return typeof config !== 'undefined' && !!config.runsInApp; }

function bekannt(d, k, heute) {
  const e = d.eintraege[k];
  if (!e) return null;
  if (e.quelle !== 'suche') return e; // von Hand, Standort, ignoriert: gilt immer
  if (!Number.isFinite(e.lat)) return null; // ältere Treffer ohne Koordinaten: einmal neu suchen
  return D.tageZwischen(D.ausYmd(e.datum), D.ausYmd(heute)) <= SUCHE_GUELTIG_TAGE ? e : null;
}

// strecken [{key, von, nach, modus}] -> {gut: [...mit Adressen und Koordinaten], schlecht: [{strecke, ort, fehler, ignoriert}]}
// gut[i].vonKoord / nachKoord: {lat, lon} für die Fahrzeit-Berechnung (null, wenn unbekannt).
// sichereTexte: eingestellte Adressen Zuhause/Arbeit (werden unverändert weitergegeben).
async function streckenPruefen(strecken, heute, log, sichereTexte) {
  const sicherSet = new Set((sichereTexte || []).filter(Boolean).map(O.norm));
  const d = await laden();
  const ergebnis = new Map();
  // Im Hintergrund (Kurzbefehl, Automation) ist die Laufzeit knapp: nicht gefundene Orte
  // höchstens einmal am Tag neu suchen und insgesamt höchstens 6 Sekunden suchen.
  const hintergrund = !imVordergrund();
  const startZeit = Date.now();
  const zeitUm = () => hintergrund && Date.now() - startZeit > 6000;
  async function suchen(text) {
    const k = O.norm(text);
    if (ergebnis.has(k)) return ergebnis.get(k);
    let r;
    const e = bekannt(d, k, heute);
    const o = d.offen[k];
    if (e) {
      r = { adresse: e.adresse, ignoriert: e.quelle === 'ignoriert', quelle: e.quelle, koord: Number.isFinite(e.lat) ? { lat: e.lat, lon: e.lon } : null };
      // von Hand eingetragene Adresse ohne Koordinaten: einmal suchen und merken
      if (!r.koord && !r.ignoriert && e.adresse && !zeitUm() && e.koordGesucht !== heute) {
        const g = await suchenMitVarianten(e.adresse);
        const l = g.ort && g.ort.location;
        e.koordGesucht = heute;
        if (l) { e.lat = l.latitude; e.lon = l.longitude; r.koord = { lat: e.lat, lon: e.lon }; }
      }
    } else if (hintergrund && o && o.versucht === heute) {
      r = { adresse: null, fehler: `${o.fehler || 'kein Treffer'}; heute schon gesucht` };
    } else if (zeitUm()) {
      r = { adresse: null, fehler: 'Suche verschoben (zu viele neue Orte auf einmal)' };
    } else {
      r = await suchenMitVarianten(text);
      if (r.adresse) {
        const l = r.ort && r.ort.location;
        r.quelle = 'suche';
        r.koord = l ? { lat: l.latitude, lon: l.longitude } : null;
        d.eintraege[k] = { text, adresse: r.adresse, quelle: 'suche', datum: heute, ...(r.koord || {}) };
        delete d.offen[k];
        if (log) await log(`Ort gefunden${r.variante !== text ? ` über "${r.variante}"` : ''}: ${r.adresse}`);
      } else {
        d.offen[k] = { text, seit: (o && o.seit) || heute, fehler: r.fehler, versucht: heute };
      }
    }
    ergebnis.set(k, r);
    return r;
  }
  const gut = [], schlecht = [];
  for (const s of strecken) {
    const von = await suchen(s.von);
    const nach = await suchen(s.nach);
    if (von.adresse && nach.adresse) {
      gut.push({ ...s, von: sicherSet.has(O.norm(s.von)) ? s.von : von.adresse, nach: sicherSet.has(O.norm(s.nach)) ? s.nach : nach.adresse,
        vonKoord: von.koord, nachKoord: nach.koord });
    }
    else {
      const f = !von.adresse ? { text: s.von, r: von } : { text: s.nach, r: nach };
      schlecht.push({ strecke: s, ort: f.text, fehler: f.r.fehler, ignoriert: !!f.r.ignoriert });
    }
  }
  await speichern(d);
  return { gut, schlecht };
}

// Läuft gerade ein Termin an einem unbekannten Ort? Dann den aktuellen Standort als Adresse lernen.
async function standortLernen(termine, jetzt, log) {
  const d = await laden();
  const laufend = termine.filter(t => new Date(t.start) <= jetzt && jetzt <= new Date(t.end) && d.offen[O.norm(t.ort)]);
  if (!laufend.length) return 0;
  try {
    Location.setAccuracyToHundredMeters();
    const l = await Location.current();
    const g = (await Location.reverseGeocode(l.latitude, l.longitude))[0];
    const adresse = O.adresseAusOrt(g) || `${l.latitude},${l.longitude}`;
    for (const t of laufend) {
      const k = O.norm(t.ort);
      d.eintraege[k] = { text: t.ort, adresse, quelle: 'standort', datum: D.ymd(jetzt), lat: l.latitude, lon: l.longitude };
      delete d.offen[k];
      await log(`Ort gelernt (du warst gerade dort): "${t.ort}" = ${adresse}`);
    }
    await speichern(d);
    return laufend.length;
  } catch (e) {
    await log(`WARNUNG Standort für Orte lernen nicht verfügbar: ${e}`);
    return 0;
  }
}

// In der App (Vordergrund) offene Orte noch einmal suchen.
async function offeneNachsuchen(log) {
  const d = await laden();
  const heute = D.ymd(new Date());
  let gefunden = 0;
  for (const [k, o] of Object.entries(d.offen)) {
    const r = await suchenMitVarianten(o.text);
    if (r.adresse) {
      const l = r.ort && r.ort.location;
      d.eintraege[k] = { text: o.text, adresse: r.adresse, quelle: 'suche', datum: heute, ...(l ? { lat: l.latitude, lon: l.longitude } : {}) };
      delete d.offen[k];
      gefunden++;
      await log(`Ort gefunden (in der App): "${o.text}" = ${r.adresse}`);
    } else {
      o.fehler = r.fehler;
      o.versucht = heute;
    }
  }
  await speichern(d);
  return gefunden;
}

async function setzen(text, adresse, quelle) {
  const d = await laden();
  const k = O.norm(text);
  d.eintraege[k] = { text, adresse, quelle, datum: D.ymd(new Date()) };
  delete d.offen[k];
  await speichern(d);
}

async function vergessen(text) {
  const d = await laden();
  const k = O.norm(text);
  delete d.eintraege[k];
  delete d.offen[k];
  await speichern(d);
}

module.exports = { laden, streckenPruefen, standortLernen, offeneNachsuchen, suchenMitVarianten, koordinaten, setzen, vergessen };
