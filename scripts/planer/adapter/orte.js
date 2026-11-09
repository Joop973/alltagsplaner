// Scriptable: Orte vorab mit der Karten-Suche prüfen. "Wegzeit abrufen" im Kurzbefehl
// bricht ab, wenn ein Ort nicht gefunden wird – darum nur gefundene Orte weitergeben.
'use strict';

function hole(p) {
  try { return importModule('planer/' + p); } catch (e) { return importModule('../' + p); }
}
const D = hole('core/datum');
const O = hole('core/orte');
const DAT = hole('adapter/dateien');

const DATEI = 'orte.json';

// text -> gefundene Adresse oder null. Ergebnisse werden 30 Tage gemerkt.
async function pruefer(heute) {
  const cache = await DAT.lesen(DATEI, {});
  let geaendert = false;
  async function suchen(text) {
    const k = O.norm(text);
    const alt = cache[k];
    if (alt && D.tageZwischen(D.ausYmd(alt.datum), D.ausYmd(heute)) <= 30) return alt.adresse;
    let adresse = null;
    try {
      const treffer = await Location.geocode(String(text), 'de');
      adresse = O.adresseAusOrt(treffer && treffer[0]);
    } catch (e) { adresse = null; }
    cache[k] = { adresse, datum: heute };
    geaendert = true;
    return adresse;
  }
  async function speichern() { if (geaendert) await DAT.schreiben(DATEI, cache); }
  return { suchen, speichern };
}

// strecken [{key, von, nach, modus}] -> {gut: [...mit gefundenen Adressen], schlecht: [{strecke, ort}]}
async function streckenPruefen(strecken, heute) {
  const p = await pruefer(heute);
  const gut = [], schlecht = [];
  for (const s of strecken) {
    const von = await p.suchen(s.von);
    const nach = await p.suchen(s.nach);
    if (von && nach) gut.push({ ...s, von, nach });
    else schlecht.push({ strecke: s, ort: !von ? s.von : s.nach });
  }
  await p.speichern();
  return { gut, schlecht };
}

module.exports = { streckenPruefen };
