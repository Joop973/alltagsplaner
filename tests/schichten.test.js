'use strict';
const test = require('node:test');
const assert = require('node:assert');
const D = require('../scripts/planer/core/datum');
const F = require('../scripts/planer/core/feiertage');
const S = require('../scripts/planer/core/schichten');
const { standardEinstellungen } = require('../scripts/planer/core/standard');

test('Ostersonntag', () => {
  assert.strictEqual(D.ymd(F.ostersonntag(2026)), '2026-04-05');
  assert.strictEqual(D.ymd(F.ostersonntag(2027)), '2027-03-28');
  assert.strictEqual(D.ymd(F.ostersonntag(2030)), '2030-04-21');
});

test('Feiertage Niedersachsen 2026', () => {
  const liste = F.feiertage(2026).map(f => f.datum);
  assert.deepStrictEqual(liste, [
    '2026-01-01', '2026-04-03', '2026-04-06', '2026-05-01', '2026-05-14',
    '2026-05-25', '2026-10-03', '2026-10-31', '2026-12-25', '2026-12-26',
  ]);
  assert.strictEqual(F.freierTag('2026-10-31', []), 'Reformationstag');
  assert.strictEqual(F.freierTag('2026-12-24', ['24.12']), 'frei (24.12.)');
  assert.strictEqual(F.freierTag('2026-12-24', []), null);
  assert.strictEqual(F.freierTag('2026-06-04', []), null); // Fronleichnam gilt nicht in NI
});

test('Woche A/B wechselt alle zwei Wochen', () => {
  assert.strictEqual(S.wochenTyp(new Date(2026, 10, 12), '2026-11-09', 'A'), 'A');
  assert.strictEqual(S.wochenTyp(new Date(2026, 10, 16), '2026-11-09', 'A'), 'B');
  assert.strictEqual(S.wochenTyp(new Date(2026, 10, 23), '2026-11-09', 'A'), 'A');
  assert.strictEqual(S.wochenTyp(new Date(2026, 10, 8), '2026-11-09', 'A'), 'B'); // Sonntag davor
});

test('Schichten: Zeiten, Wochenende, Feiertage, Urlaub', () => {
  const sch = standardEinstellungen().schichten;
  sch.referenzMontag = '2026-11-09';
  sch.referenzTyp = 'A';
  sch.ausnahmen = [{ von: '2026-11-19', bis: '2026-11-20', text: 'Urlaub' }];
  const liste = S.schichtenErzeugen(new Date(2026, 10, 9), 14, sch);
  const kurz = liste.map(s => `${s.datum} ${D.hm(s.start)}-${D.hm(s.end)}`);
  assert.deepStrictEqual(kurz, [
    '2026-11-09 07:00-16:00', '2026-11-10 07:00-16:00', '2026-11-11 07:00-16:00',
    '2026-11-12 07:00-16:00', '2026-11-13 07:00-13:00',
    '2026-11-16 08:00-16:00', '2026-11-17 08:00-16:00', '2026-11-18 08:00-13:00',
  ]);
  const dez = S.schichtenErzeugen(new Date(2026, 11, 21), 14, sch).map(s => s.datum);
  for (const frei of ['2026-12-24', '2026-12-25', '2026-12-26', '2026-12-31', '2027-01-01']) {
    assert.ok(!dez.includes(frei), frei);
  }
  assert.ok(dez.includes('2026-12-23'));
});

test('Abgleich löscht nur Abweichungen', () => {
  const a = { id: 1, start: new Date(2026, 10, 9, 7), end: new Date(2026, 10, 9, 16) };
  const b = { id: 2, start: new Date(2026, 10, 10, 7), end: new Date(2026, 10, 10, 16) };
  const neu = { start: new Date(2026, 10, 10, 8), end: new Date(2026, 10, 10, 16) };
  const r = S.abgleich([a, b], [{ start: a.start, end: a.end }, neu]);
  assert.deepStrictEqual(r.loeschen.map(x => x.id), [2]);
  assert.strictEqual(r.anlegen.length, 1);
  assert.strictEqual(r.anlegen[0], neu);
});
