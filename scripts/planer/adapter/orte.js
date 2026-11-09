// Scriptable: Orte finden und lernen.
// "Wegzeit abrufen" im Kurzbefehl bricht ab, wenn ein Ort nicht gefunden wird –
// darum werden Orte hier vorher gesucht und nur gefundene Adressen weitergegeben.
//
// Gelernte Orte (planer-daten/orte.json):
//   eintraege: { "<ort-text klein>": {text, adresse, quelle: suche|hand|standort|ignoriert, datum} }
//   offen:     { "<ort-text klein>": {text, seit, fehler} }   noch nicht gefunden
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

// Eine Variante mit der Karten-Suche prüfen -> {adresse} oder {fehler}
async function geocode(text) {
  try {
    const treffer = await Location.geocode(String(text));
    const adresse = O.adresseAusOrt(treffer && treffer[0]);
    return adresse ? { adresse } : { fehler: 'kein Treffer' };
  } catch (e) {
    return { fehler: String(e && e.message ? e.message : e) };
  }
}

async function suchenMitVarianten(text) {
  let fehler = 'kein Treffer';
  for (const v of O.suchVarianten(text)) {
    const r = await geocode(v);
    if (r.adresse) return { adresse: r.adresse, variante: v };
    fehler = r.fehler;
  }
  return { adresse: null, fehler };
}

function bekannt(d, k, heute) {
  const e = d.eintraege[k];
  if (!e) return null;
  if (e.quelle !== 'suche') return e; // von Hand, Standort, ignoriert: gilt immer
  return D.tageZwischen(D.ausYmd(e.datum), D.ausYmd(heute)) <= SUCHE_GUELTIG_TAGE ? e : null;
}

// strecken [{key, von, nach, modus}] -> {gut: [...mit gefundenen Adressen], schlecht: [{strecke, ort, fehler, ignoriert}]}
async function streckenPruefen(strecken, heute, log) {
  const d = await laden();
  const ergebnis = new Map();
  async function suchen(text) {
    const k = O.norm(text);
    if (ergebnis.has(k)) return ergebnis.get(k);
    let r;
    const e = bekannt(d, k, heute);
    if (e) {
      r = { adresse: e.adresse, ignoriert: e.quelle === 'ignoriert' };
    } else {
      r = await suchenMitVarianten(text);
      if (r.adresse) {
        d.eintraege[k] = { text, adresse: r.adresse, quelle: 'suche', datum: heute };
        delete d.offen[k];
        if (log && r.variante !== text) await log(`Ort gefunden über "${r.variante}": ${r.adresse}`);
      } else {
        d.offen[k] = { text, seit: (d.offen[k] && d.offen[k].seit) || heute, fehler: r.fehler };
      }
    }
    ergebnis.set(k, r);
    return r;
  }
  const gut = [], schlecht = [];
  for (const s of strecken) {
    const von = await suchen(s.von);
    const nach = await suchen(s.nach);
    if (von.adresse && nach.adresse) gut.push({ ...s, von: von.adresse, nach: nach.adresse });
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
      d.eintraege[k] = { text: t.ort, adresse, quelle: 'standort', datum: D.ymd(jetzt) };
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
      d.eintraege[k] = { text: o.text, adresse: r.adresse, quelle: 'suche', datum: heute };
      delete d.offen[k];
      gefunden++;
      await log(`Ort gefunden (in der App): "${o.text}" = ${r.adresse}`);
    } else {
      o.fehler = r.fehler;
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

module.exports = { laden, streckenPruefen, standortLernen, offeneNachsuchen, suchenMitVarianten, setzen, vergessen };
