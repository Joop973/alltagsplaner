// Orte erkennen (zuhause / arbeit / fremd) und Verkehrsmittel wählen.
'use strict';

function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

const BUCHSTABE = 'a-z0-9äöüß';

// Wort als ganzes Wort im Text? ("arbeit" passt nicht auf "arbeitsamt")
function enthaeltWort(text, wort) {
  const w = norm(wort).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!w) return false;
  return new RegExp(`(^|[^${BUCHSTABE}])${w}($|[^${BUCHSTABE}])`).test(norm(text));
}

function passtAdresse(text, adresse) {
  const t = norm(text), a = norm(adresse);
  if (!a) return false;
  if (t.includes(a)) return true;
  const teil = norm(a.split(',')[0]); // Straße + Hausnummer
  return teil.length >= 5 && t.includes(teil);
}

// Ort-Text eines Termins -> 'zuhause' | 'arbeit' | 'fremd'. Leer = zuhause.
function ortArt(text, orte) {
  if (!norm(text)) return 'zuhause';
  for (const art of ['zuhause', 'arbeit']) {
    const o = (orte && orte[art]) || {};
    if (passtAdresse(text, o.adresse)) return art;
    if ((o.stichwoerter || []).some(w => enthaeltWort(text, w))) return art;
  }
  return 'fremd';
}

// Verkehrsmittel für eine Fahrt. direkt = ohne Umweg über zuhause.
function verkehrsmittel(vonArt, nachArt, direkt, v) {
  const paar = [vonArt, nachArt].sort().join('-');
  if (paar === 'arbeit-zuhause') return v.zuhauseArbeit;
  if (direkt && vonArt === 'arbeit') return v.direktVonArbeit;
  return v.sonst;
}

function streckenSchluessel(modus, von, nach) { return `${modus}|${norm(von)}|${norm(nach)}`; }

module.exports = { norm, enthaeltWort, passtAdresse, ortArt, verkehrsmittel, streckenSchluessel };
