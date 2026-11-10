// Gedächtnis fürs Lernen: was wurde wann erledigt, verschoben, übersprungen.
// Liegt nur auf dem iPhone (planer-daten/gedaechtnis.json).
'use strict';

function hole(n) {
  if (typeof require === 'function') return require('./' + n);
  try { return importModule('planer/core/' + n); } catch (e) { return importModule(n); }
}
const D = hole('datum');

const MAX_TAGE = 400;
const MAX_ANZAHL = 3000;

function leer() { return { ereignisse: [] }; }

// ereignis: {typ, id, name, geplantStart, geplantEnde, ...}. typ: erledigt | spaeter | heutenicht | nichtnoetig | abgehakt | ...
function eintragen(ged, ereignis, jetzt) {
  const g = ged && Array.isArray(ged.ereignisse) ? ged : leer();
  const grenze = D.plusTage(jetzt, -MAX_TAGE).toISOString();
  const liste = g.ereignisse.filter(e => e.t >= grenze);
  liste.push({ t: jetzt.toISOString(), ...ereignis });
  return { ...g, ereignisse: liste.slice(-MAX_ANZAHL) };
}

// Der Block aus dem letzten Plan, auf den sich ein Knopfdruck bezieht (nächster zur aktuellen Zeit).
function passenderBlock(bloecke, id, jetzt) {
  const kandidaten = (bloecke || []).filter(b => b.aufgabeId === id);
  if (!kandidaten.length) return null;
  const abstand = b => Math.abs(new Date(b.start).getTime() - jetzt.getTime());
  return kandidaten.slice().sort((a, b) => abstand(a) - abstand(b))[0];
}

module.exports = { leer, eintragen, passenderBlock };
