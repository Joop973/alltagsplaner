// Knöpfe aus Mitteilungen: "Erledigt" und "Später".
'use strict';

function hole(n) {
  if (typeof require === 'function') return require('./' + n);
  try { return importModule('planer/core/' + n); } catch (e) { return importModule(n); }
}
const D = hole('datum');

// q = {aktion: 'erledigt'|'spaeter', id, ende (ISO)} -> {aufgaben (neu), meldung}
function aktionAnwenden(aufgaben, q, jetzt) {
  const a = aufgaben.find(x => x.id === q.id);
  if (!a) return { aufgaben, meldung: `Aufgabe "${q.id}" nicht gefunden.` };
  const neu = aufgaben.map(x => ({ ...x }));
  const b = neu.find(x => x.id === q.id);
  if (q.aktion === 'erledigt') {
    b.letzte = D.ymd(jetzt);
    b.nichtVor = null;
    return { aufgaben: neu, meldung: `Erledigt: ${b.name}` };
  }
  if (q.aktion === 'spaeter') {
    const ende = D.alsDatum(q.ende);
    const frueh = D.plusMin(jetzt, 30);
    b.nichtVor = (ende && ende > frueh ? ende : frueh).toISOString();
    return { aufgaben: neu, meldung: `Später: ${b.name}` };
  }
  return { aufgaben, meldung: `Unbekannte Aktion "${q.aktion}".` };
}

module.exports = { aktionAnwenden };
