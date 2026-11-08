// Tagesablauf: Wann bin ich wo? Welche Fahrten gibt es? Wann bin ich zuhause und frei?
'use strict';

function hole(n) {
  if (typeof require === 'function') return require('./' + n);
  try { return importModule('planer/core/' + n); } catch (e) { return importModule(n); }
}
const D = hole('datum');
const O = hole('orte');

// termine: [{titel, start, end, ort}] (keine ganztägigen, nicht aus dem Planer-Kalender)
// fahrzeit(key) -> Minuten oder null (dann Fallback)
// Ergebnis: fahrten, aufenthalte (Zeiten zuhause ohne Pause/Ruhe), strecken (alle abgefragten), termine
function berechneAblauf(termine, { einst, fahrzeit }) {
  const orte = einst.orte, r = einst.regeln, v = einst.verkehr;
  const liste = termine
    .map(t => ({ ...t, start: new Date(t.start), end: new Date(t.end), ort: t.ort || '' }))
    .map(t => ({ ...t, art: O.ortArt(t.ort, orte) }))
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const ZUHAUSE = { art: 'zuhause', titel: 'Zuhause', ort: '' };
  const ziel = t => t.art === 'zuhause' ? (orte.zuhause.adresse || 'Zuhause')
    : t.art === 'arbeit' ? (orte.arbeit.adresse || orte.arbeit.name || 'Arbeit')
      : t.ort.trim();
  const platz = t => t.art === 'fremd' ? 'f:' + O.norm(t.ort) : t.art;

  const strecken = new Map();
  const fahrten = [];
  const aufenthalte = [];

  function dauer(vonT, nachT, direkt) {
    const modus = O.verkehrsmittel(vonT.art, nachT.art, direkt, v);
    const von = ziel(vonT), nach = ziel(nachT);
    const key = O.streckenSchluessel(modus, von, nach);
    if (!strecken.has(key)) strecken.set(key, { key, von, nach, modus });
    const m = fahrzeit ? fahrzeit(key) : null;
    return { modus, min: m == null ? r.fallbackMin : m, geschaetzt: m == null };
  }

  function fahrt(vonT, nachT, abfahrt, d, zuTermin) {
    const f = {
      abfahrt, ankunft: D.plusMin(abfahrt, d.min), minuten: d.min, modus: d.modus,
      geschaetzt: d.geschaetzt, vonArt: vonT.art, nachArt: nachT.art,
      zielName: nachT.art === 'zuhause' ? 'Zuhause' : nachT.titel, zuTermin,
    };
    fahrten.push(f);
    return f;
  }

  let akt = ZUHAUSE;          // wo bin ich (Termin oder zuhause)
  let aktEnde = null;         // Ende des aktuellen auswärtigen Aufenthalts
  let daheimAb = -Infinity;   // seit wann zuhause (inkl. Pause)

  function heimkommen(abfahrt) {
    const f = fahrt(akt, ZUHAUSE, abfahrt, dauer(akt, ZUHAUSE, false), false);
    daheimAb = D.plusMin(f.ankunft, r.pauseNachHeim).getTime();
    akt = ZUHAUSE;
  }
  function losfahren(nach, abfahrt, d, vonZuhause) {
    if (vonZuhause) aufenthalte.push({ start: daheimAb, end: D.plusMin(abfahrt, -r.ruheVorAbfahrt).getTime() });
    fahrt(akt, nach, abfahrt, d, true);
    akt = nach;
    aktEnde = nach.end;
  }

  for (const n of liste) {
    if (akt.art === 'zuhause') {
      if (n.art === 'zuhause') continue; // Termin zuhause: belegt, aber keine Fahrt
      const d = dauer(ZUHAUSE, n, false);
      losfahren(n, D.plusMin(n.start, -d.min), d, true);
      continue;
    }
    // ich bin auswärts
    const vorher = { ...akt, end: aktEnde };
    akt = vorher;
    if (n.art === 'zuhause') { heimkommen(vorher.end); continue; }
    const gleicherOrt = platz(n) === platz(vorher);
    if (gleicherOrt && n.start <= vorher.end) { // direkt anschließend am selben Ort
      if (n.end > aktEnde) aktEnde = n.end;
      akt = { ...n, end: aktEnde };
      continue;
    }
    const heim = dauer(vorher, ZUHAUSE, false);
    const hin = dauer(ZUHAUSE, n, false);
    const ankunftHeim = D.plusMin(vorher.end, heim.min);
    const abHeim = D.plusMin(n.start, -hin.min);
    // immer abfragen, damit Phase (a) alle möglichen Strecken kennt
    const direkt = gleicherOrt ? null : dauer(vorher, n, true);
    if (ankunftHeim <= abHeim) {
      heimkommen(vorher.end);
      losfahren(n, abHeim, hin, true);
    } else if (gleicherOrt) { // Heimweg lohnt nicht: dableiben
      if (n.end > aktEnde) aktEnde = n.end;
      akt = { ...n, end: aktEnde };
    } else {
      const ab = new Date(Math.max(vorher.end.getTime(), D.plusMin(n.start, -direkt.min).getTime()));
      losfahren(n, ab, direkt, false);
    }
  }
  if (akt.art !== 'zuhause') {
    akt = { ...akt, end: aktEnde };
    heimkommen(aktEnde);
  }
  aufenthalte.push({ start: daheimAb, end: Infinity });

  return {
    termine: liste,
    fahrten,
    aufenthalte: aufenthalte.filter(a => a.end > a.start),
    strecken: [...strecken.values()],
  };
}

module.exports = { berechneAblauf };
