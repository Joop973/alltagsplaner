// Tagesarten: frei (keine Schicht), krank, verreist, "heute keine Aufgaben".
// Quellen: ganztägige Kalendereinträge (Stichwörter), Einträge aus der App, Tagesschalter.
'use strict';

function hole(n) {
  if (typeof require === 'function') return require('./' + n);
  try { return importModule('planer/core/' + n); } catch (e) { return importModule(n); }
}
const D = hole('datum');
const O = hole('orte');

const BUCHSTABE = 'a-z0-9äöüß';

// Muster "urlaub*" = Wort beginnt so, sonst ganzes Wort.
function wortPasst(text, muster) {
  const m = String(muster || '').trim().toLowerCase();
  if (!m) return false;
  if (!m.endsWith('*')) return O.enthaeltWort(text, m);
  const w = m.slice(0, -1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return !!w && new RegExp(`(^|[^${BUCHSTABE}])${w}`).test(String(text || '').toLowerCase());
}

function artAusTitel(titel, woerter) {
  const w = woerter || {};
  for (const art of ['krank', 'weg', 'frei']) {
    if ((w[art] || []).some(m => wortPasst(titel, m))) return art;
  }
  return null;
}

// Tage eines ganztägigen Eintrags als "YYYY-MM-DD" (Ende 00:00 des Folgetags zählt nicht mit)
function tageVon(start, end) {
  const s = D.tagesBeginn(new Date(start));
  let e = new Date(end);
  if (e > s) e = new Date(e.getTime() - 1000);
  const liste = [];
  for (let t = s, i = 0; t <= e && i < 400; t = D.plusTage(t, 1), i++) liste.push(D.ymd(t));
  return liste.length ? liste : [D.ymd(s)];
}

// ganztaegige: [{titel, start, end}], ausnahmen: [{von, bis, text, art}], keineAufgaben: 'YYYY-MM-DD'
// -> { 'YYYY-MM-DD': {frei, krank, weg, keineAufgaben, grund} } nur für betroffene Tage
function tagesInfo({ ganztaegige, ausnahmen, woerter, keineAufgaben }) {
  const info = {};
  const setze = (datum, art, grund) => {
    const x = info[datum] || (info[datum] = { frei: false, krank: false, weg: false, keineAufgaben: false, grund: '' });
    x.frei = true; // krank und verreist heißen immer auch: keine Schicht
    if (art === 'krank') x.krank = true;
    if (art === 'weg') x.weg = true;
    if (art === 'krank' || art === 'weg') x.keineAufgaben = true;
    if (!x.grund || art !== 'frei') x.grund = grund;
  };
  for (const g of ganztaegige || []) {
    const art = artAusTitel(g.titel, woerter);
    if (!art) continue;
    for (const d of tageVon(g.start, g.end)) setze(d, art, g.titel);
  }
  for (const a of ausnahmen || []) {
    const art = a.art || 'frei';
    // "bis" ist der letzte Tag einschließlich
    for (const d of tageVon(D.ausYmd(a.von), D.plusTage(D.ausYmd(a.bis || a.von), 1))) setze(d, art, a.text || art);
  }
  if (keineAufgaben) {
    const x = info[keineAufgaben] || (info[keineAufgaben] = { frei: false, krank: false, weg: false, keineAufgaben: false, grund: '' });
    x.keineAufgaben = true;
    if (!x.grund) x.grund = 'Heute keine Aufgaben';
  }
  return info;
}

function freieTage(info) { return new Set(Object.keys(info).filter(d => info[d].frei)); }
function sperrTage(info) { return new Set(Object.keys(info).filter(d => info[d].keineAufgaben)); }

module.exports = { wortPasst, artAusTitel, tageVon, tagesInfo, freieTage, sperrTage };
