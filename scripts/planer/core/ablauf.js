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
// regen(zeitpunkt) -> Regenwahrscheinlichkeit in % oder null; ab einst.regen.schwelle wird aus Rad Auto
// Ergebnis: fahrten, aufenthalte (Zeiten zuhause ohne Pause/Ruhe), strecken (alle abgefragten), termine
function berechneAblauf(termine, { einst, fahrzeit, regen }) {
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

  const rg = einst.regen || {};
  function merke(modus, von, nach) {
    const key = O.streckenSchluessel(modus, von, nach);
    if (!strecken.has(key)) strecken.set(key, { key, von, nach, modus });
    return key;
  }
  // zeit: ungefährer Zeitpunkt der Fahrt (für das Wetter)
  function dauer(vonT, nachT, direkt, zeit) {
    let modus = O.verkehrsmittel(vonT.art, nachT.art, direkt, v);
    const von = ziel(vonT), nach = ziel(nachT);
    let regenProz = null;
    if (modus === 'Fahrrad' && rg.an) {
      merke(v.sonst, von, nach); // Auto-Zeit immer mit abfragen, damit sie bei Regen bekannt ist
      regenProz = regen && zeit ? regen(zeit) : null;
      if (regenProz != null && regenProz >= rg.schwelle) modus = v.sonst;
    }
    const key = merke(modus, von, nach);
    const m = fahrzeit ? fahrzeit(key) : null;
    return { modus, min: m == null ? r.fallbackMin : m, geschaetzt: m == null, regen: modus !== O.verkehrsmittel(vonT.art, nachT.art, direkt, v) ? regenProz : null };
  }

  function fahrt(vonT, nachT, abfahrt, d, zuTermin) {
    const f = {
      abfahrt, ankunft: D.plusMin(abfahrt, d.min), minuten: d.min, modus: d.modus,
      geschaetzt: d.geschaetzt, vonArt: vonT.art, nachArt: nachT.art, regen: d.regen,
      zielName: nachT.art === 'zuhause' ? 'Zuhause' : nachT.titel, zuTermin,
    };
    fahrten.push(f);
    return f;
  }

  let akt = ZUHAUSE;          // wo bin ich (Termin oder zuhause)
  let aktEnde = null;         // Ende des aktuellen auswärtigen Aufenthalts
  let daheimAb = -Infinity;   // seit wann zuhause (inkl. Pause)

  function heimkommen(abfahrt) {
    const f = fahrt(akt, ZUHAUSE, abfahrt, dauer(akt, ZUHAUSE, false, abfahrt), false);
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
      const d = dauer(ZUHAUSE, n, false, n.start);
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
    const heim = dauer(vorher, ZUHAUSE, false, vorher.end);
    const hin = dauer(ZUHAUSE, n, false, n.start);
    const ankunftHeim = D.plusMin(vorher.end, heim.min);
    const abHeim = D.plusMin(n.start, -hin.min);
    // immer abfragen, damit Phase (a) alle möglichen Strecken kennt
    const direkt = gleicherOrt ? null : dauer(vorher, n, true, vorher.end);
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
