// Knöpfe aus Mitteilungen: "Erledigt" und "Später".
'use strict';

function hole(n) {
  if (typeof require === 'function') return require('./' + n);
  try { return importModule('planer/core/' + n); } catch (e) { return importModule(n); }
}
const D = hole('datum');

// q = {aktion: 'erledigt'|'spaeter'|'heutenicht', id, ende (ISO)} -> {aufgaben (neu), meldung}
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
  if (q.aktion === 'heutenicht') {
    b.nichtVor = D.plusTage(D.tagesBeginn(jetzt), 1).toISOString();
    return { aufgaben: neu, meldung: `Heute nicht: ${b.name}` };
  }
  return { aufgaben, meldung: `Unbekannte Aktion "${q.aktion}".` };
}

// In der Erinnerungen-App abgehakt: erledigt = [{id, datum: 'YYYY-MM-DD'}]
// -> letzte Erledigung = spätestes Datum (nie zurück), "später" aufheben.
function erledigteUebernehmen(aufgaben, erledigt) {
  const neu = aufgaben.map(x => ({ ...x }));
  const meldungen = [];
  for (const e of erledigt || []) {
    const a = neu.find(x => x.id === e.id);
    if (!a || !e.datum) continue;
    if (!a.letzte || e.datum > a.letzte) {
      a.letzte = e.datum;
      a.nichtVor = null;
      meldungen.push(`Abgehakt: ${a.name} (${e.datum})`);
    }
  }
  return { aufgaben: neu, meldungen };
}

module.exports = { aktionAnwenden, erledigteUebernehmen };
