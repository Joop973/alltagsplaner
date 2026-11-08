'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { aktionAnwenden } = require('../scripts/planer/core/aktion');
const S = require('../scripts/planer/core/standard');

test('Erledigt setzt letzte Erledigung auf heute', () => {
  const jetzt = new Date(2026, 10, 12, 18, 20);
  const vorher = S.standardAufgaben().map(a => a.id === 'bad' ? { ...a, nichtVor: 'x' } : a);
  const r = aktionAnwenden(vorher, { aktion: 'erledigt', id: 'bad' }, jetzt);
  const bad = r.aufgaben.find(a => a.id === 'bad');
  assert.strictEqual(bad.letzte, '2026-11-12');
  assert.strictEqual(bad.nichtVor, null);
  assert.strictEqual(vorher.find(a => a.id === 'bad').letzte, null); // Original unverändert
});

test('Später: nicht vor Blockende, mindestens 30 min', () => {
  const jetzt = new Date(2026, 10, 12, 18, 20);
  const ende = new Date(2026, 10, 12, 18, 45).toISOString();
  let r = aktionAnwenden(S.standardAufgaben(), { aktion: 'spaeter', id: 'bad', ende }, jetzt);
  assert.strictEqual(r.aufgaben.find(a => a.id === 'bad').nichtVor, new Date(2026, 10, 12, 18, 50).toISOString());
  r = aktionAnwenden(S.standardAufgaben(), { aktion: 'spaeter', id: 'bad', ende: new Date(2026, 10, 12, 20).toISOString() }, jetzt);
  assert.strictEqual(r.aufgaben.find(a => a.id === 'bad').nichtVor, new Date(2026, 10, 12, 20).toISOString());
  assert.strictEqual(r.aufgaben.find(a => a.id === 'bad').letzte, null);
});

test('Zusammenführen behält gespeicherte Werte und ergänzt neue', () => {
  const e = S.zusammenfuehren(S.standardEinstellungen(), { regeln: { maxProTag: 60 }, eingerichtet: true });
  assert.strictEqual(e.regeln.maxProTag, 60);
  assert.strictEqual(e.regeln.minLuecke, 20);
  assert.strictEqual(e.eingerichtet, true);
});

test('Datumseingabe', () => {
  const D = require('../scripts/planer/core/datum');
  const heute = new Date(2026, 10, 12, 9);
  assert.strictEqual(D.datumEingabe('', heute), null);
  assert.strictEqual(D.datumEingabe('heute', heute), '2026-11-12');
  assert.strictEqual(D.datumEingabe('Gestern', heute), '2026-11-11');
  assert.strictEqual(D.datumEingabe('3', heute), '2026-11-09');
  assert.strictEqual(D.datumEingabe('12.11.', heute), '2026-11-12');
  assert.strictEqual(D.datumEingabe('1.2.27', heute), '2027-02-01');
  assert.strictEqual(D.datumEingabe('2026-12-24', heute), '2026-12-24');
  assert.strictEqual(D.datumEingabe('31.02.2026', heute), undefined);
  assert.strictEqual(D.datumEingabe('morgen früh', heute), undefined);
  assert.strictEqual(D.deutschDatum('2026-11-12'), '12.11.2026');
});
