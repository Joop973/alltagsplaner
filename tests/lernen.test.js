'use strict';
const test = require('node:test');
const assert = require('node:assert');
const D = require('../scripts/planer/core/datum');
const L = require('../scripts/planer/core/lernen');
const P = require('../scripts/planer/core/planer');
const { standardEinstellungen } = require('../scripts/planer/core/standard');

const um = (t, h, m = 0) => new Date(2026, 10, t, h, m);
const ev = (typ, id, t, geplantStart, extra) => ({ typ, id, t: t.toISOString(), geplantStart: geplantStart && geplantStart.toISOString(), ...extra });
const bad = () => ({ id: 'bad', name: 'Bad putzen', intervall: 7, dauer: 30, pflicht: true });

test('Dauer: nach 3 Beobachtungen automatisch, vorab gedrückt zählt nicht', () => {
  const ged = { ereignisse: [
    ev('erledigt', 'bad', um(1, 18, 20), um(1, 18)),
    ev('erledigt', 'bad', um(8, 18, 1), um(8, 18)), // vorab gedrückt
    ev('erledigt', 'bad', um(15, 18, 22), um(15, 18)),
  ] };
  assert.strictEqual(L.auswerten(ged, [bad()], um(16, 9), {}).auto.length, 0, 'erst 2 echte Beobachtungen');
  ged.ereignisse.push(ev('erledigt', 'bad', um(22, 18, 19), um(22, 18)));
  const r = L.auswerten(ged, [bad()], um(23, 9), {});
  assert.deepStrictEqual(r.auto.map(x => [x.feld, x.alt, x.neu]), [['dauer', 30, 20]]);
  assert.match(r.auto[0].grund, /3-mal nach etwa 20 min/);
  // abgelehnt (rückgängig gemacht): 60 Tage Ruhe
  assert.strictEqual(L.auswerten(ged, [bad()], um(23, 9), { abgelehnt: { 'bad|dauer': '2026-11-23' } }).auto.length, 0);
  // große Änderung (30 -> 75) nur als Vorschlag
  const lang = { ereignisse: [1, 8, 15].map(t => ev('erledigt', 'bad', um(t, 19, 15), um(t, 18))) };
  const r2 = L.auswerten(lang, [bad()], um(16, 9), {});
  assert.deepStrictEqual([r2.auto.length, r2.vorschlaege[0].neu], [0, 75]);
});

test('Abstand nur als Vorschlag; oft "nicht nötig" -> länger', () => {
  const ged = { ereignisse: ['2026-10-01', '2026-10-11', '2026-10-21', '2026-10-31'].map(d => ev('erledigt', 'bad', new Date(`${d}T18:30:00`), null)) };
  const r = L.auswerten(ged, [bad()], um(1, 9), {});
  assert.deepStrictEqual(r.vorschlaege.map(x => [x.feld, x.alt, x.neu]), [['intervall', 7, 10]]);
  assert.strictEqual(r.auto.length, 0);
  const nn = { ereignisse: [3, 10, 17].map(t => ev('nichtnoetig', 'bad', um(t, 9), null)) };
  assert.deepStrictEqual(L.auswerten(nn, [bad()], um(18, 9), {}).vorschlaege.map(x => x.neu), [11]);
});

test('Tageszeit meiden: 3-mal abends verschoben, nie abends erledigt', () => {
  const ged = { ereignisse: [
    ev('spaeter', 'bad', um(2, 19), um(2, 19)), ev('heutenicht', 'bad', um(5, 19), um(5, 19)), ev('spaeter', 'bad', um(9, 18), um(9, 18)),
    ev('erledigt', 'bad', um(10, 10, 30), um(10, 10)),
  ] };
  const r = L.auswerten(ged, [bad()], um(11, 9), {});
  assert.deepStrictEqual(r.auto.map(x => [x.feld, x.neu]), [['meiden', ['abends']]]);
  // Planer hält sich daran: freier Tag, Abend gemieden
  const e = standardEinstellungen();
  const a = { ...bad(), letzte: null, meiden: ['morgens'] };
  const plan = P.planen({ termine: [], aufgaben: [a], einst: e, fahrzeit: () => 15, jetzt: um(12, 0) });
  assert.strictEqual(D.hm(plan.bloecke[0].start), '12:00');
});

test('Abfahrt: Hinweis bei regelmäßiger Verspätung; Wochenrückblick', () => {
  const ged = { ereignisse: [1, 2, 3, 4, 5].map(t => ev('abfahrt', null, um(t, 6, 52), null, { geplant: um(t, 6, 45).toISOString() })) };
  assert.match(L.auswerten(ged, [], um(6, 9), {}).hinweise[0], /im Schnitt 7 min später/);

  const g2 = { ereignisse: [ev('erledigt', 'bad', um(10, 18), null), ev('spaeter', 'saugen', um(11, 18), null), ev('nichtnoetig', 'x', um(12, 9), null)] };
  const aufgaben = [{ ...bad(), letzte: '2026-11-10' }, { id: 'f', name: 'Fenster putzen', intervall: 60, dauer: 60, letzte: '2026-09-01' }];
  const t = L.wochenrueckblick(g2, aufgaben, um(15, 18), P.faelligAm, 2);
  assert.strictEqual(t, 'Erledigt: 1 · verschoben: 1 · nicht nötig: 1\nLiegt am längsten: Fenster putzen (15 T)\n2 Vorschlag/Vorschläge: Planer → Aufgaben → Gelernt');
  assert.strictEqual(D.kurz(L.naechsterSonntag(um(12, 9), '18:00')), 'So 15.11.');
  assert.strictEqual(L.erlaubterStart(um(12, 18).getTime(), ['abends']), null);
  assert.strictEqual(D.hm(new Date(L.erlaubterStart(um(12, 9).getTime(), ['morgens']))), '12:00');
});
