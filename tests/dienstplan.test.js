'use strict';
// Ausgedachte Tabelle im Aufbau des echten Dienstplans (keine echten Namen!).
const test = require('node:test');
const assert = require('node:assert');
const DP = require('../scripts/planer/core/dienstplan');
const S = require('../scripts/planer/core/schichten');
const D = require('../scripts/planer/core/datum');
const { standardEinstellungen } = require('../scripts/planer/core/standard');

// Spalten: 5 Werktage, Wochensumme, 5 Werktage, Wochensumme
const tage = ['2.11', '3.11', '4.11', '5.11', '6.11', null, '9.11', '10.11', '11.11', '12.11', '13.11', null];
const X0 = 100, DX = 40;
function tabelle() {
  const items = [{ s: 'Dienstplan November 2026 Team', x: 10, y: 800, w: 200 }];
  tage.forEach((t, i) => { if (t) items.push({ s: t, x: X0 + i * DX - 8, y: 760, w: 16 }); });
  // Person "Testperson": 4 Zeilen ab y = 740, Abstand 10
  const zeilen = {
    '2.11': ['07:00', '11:00', '11:30', '16:00'], '3.11': ['07:00', '12:00', '12:30', '16:00'],
    '4.11': [], '5.11': [], // farbig = frei (Urlaub)
    '6.11': ['07:00', '13:00'],
    '9.11': ['08:00', '12:00', '12:30', '16:00'], '10.11': ['08:00', '12:30', '13:00', '17:30'],
    '11.11': ['08:00', '13:00'], '12.11': ['08:00'], '13.11': ['8:00', '11:00', '11:30', '16:00'],
  };
  items.push({ s: 'Kollegin', x: 10, y: 790, w: 40 }); // Wort oben (Titelbereich), stört nicht
  items.push({ s: 'Testperson', x: 10, y: 740, w: 50 });
  items.push({ s: '39/7,8', x: 10, y: 730, w: 30 });
  tage.forEach((t, i) => {
    if (!t) { items.push({ s: '40,00', x: X0 + i * DX - 10, y: 740, w: 20 }); return; }
    (zeilen[t] || []).forEach((z, k) => items.push({ s: z, x: X0 + i * DX - 10, y: 740 - k * 10, w: 20 }));
  });
  // Nächste Person darunter mit eigenen Zeiten (dürfen nicht mitgelesen werden)
  // Name steht (wie im echten Plan) etwas tiefer als die erste Uhrzeit seiner Zeile
  items.push({ s: 'Andere', x: 10, y: 688.9, w: 40 });
  tage.forEach((t, i) => { if (t) { items.push({ s: '06:30', x: X0 + i * DX - 10, y: 690, w: 20 }); items.push({ s: '13:30', x: X0 + i * DX - 10, y: 660, w: 20 }); } });
  return items;
}

test('Dienstplan lesen: Beginn/Ende, Pausen ignoriert, leer = frei, Nachbarn nicht', () => {
  const r = DP.lesen(tabelle(), 'testperson', new Date(2026, 10, 10));
  assert.deepStrictEqual(r.tage, {
    '2026-11-02': '07:00-16:00', '2026-11-03': '07:00-16:00', '2026-11-04': null, '2026-11-05': null,
    '2026-11-06': '07:00-13:00', '2026-11-09': '08:00-16:00', '2026-11-10': '08:00-17:30', '2026-11-11': '08:00-13:00',
    '2026-11-13': '08:00-16:00',
  });
  assert.deepStrictEqual([r.von, r.bis], ['2026-11-02', '2026-11-13']);
  assert.deepStrictEqual(r.hinweise, ['12.11.2026: nur eine Uhrzeit (08:00) – übersprungen']);
  assert.match(DP.lesen(tabelle(), 'Niemand', new Date(2026, 10, 10)).hinweise[0], /nicht gefunden/);
});

test('Datum und Jahreswechsel', () => {
  const b = { jahr: 2026, monat: 12 };
  assert.strictEqual(DP.datumAus('28.12', b), '2026-12-28');
  assert.strictEqual(DP.datumAus('4.1.', b), '2027-01-04');
  assert.strictEqual(DP.datumAus('40,00', b), null);
  assert.strictEqual(DP.datumAus('31.2', b), null);
  assert.strictEqual(DP.datumAus('26.10', { jahr: 2026, monat: 11 }), '2026-10-26');
});

test('Dienstplan geht vor dem Muster, App-Änderung vor dem Dienstplan', () => {
  const sch = standardEinstellungen().schichten;
  sch.referenzMontag = '2026-11-09';
  sch.referenzTyp = 'B';
  const r = DP.lesen(tabelle(), 'Testperson', new Date(2026, 10, 10));
  sch.dienstplan = DP.zusammenfuehren(null, r, '2026-11-09');
  sch.aenderungen = [{ datum: '2026-11-13', zeit: '09:00-12:00' }];
  const liste = S.schichtenErzeugen(new Date(2026, 10, 9), 14, sch);
  const k = liste.map(x => `${x.datum.slice(8)} ${D.hm(x.start)}-${D.hm(x.end)} ${x.typ}`);
  assert.deepStrictEqual(k, [
    '09 08:00-16:00 Dienstplan', '10 08:00-17:30 Dienstplan', '11 08:00-13:00 Dienstplan',
    '12 08:00-16:00 B', // im Plan unklar -> Muster
    '13 09:00-12:00 geändert',
    '16 07:00-16:00 A', '17 07:00-16:00 A', '18 07:00-16:00 A', '19 07:00-16:00 A', '20 07:00-13:00 A', // nach dem Plan: Muster
  ]);
  const z = DP.zusammenfuehren({ tage: { '2026-10-01': '07:00-16:00', '2026-11-20': null } }, r, '2026-11-09');
  assert.ok(!('2026-10-01' in z.tage));
  assert.strictEqual(z.tage['2026-11-20'], null);
  assert.strictEqual(z.bis, '2026-11-20');
});
