'use strict';
const test = require('node:test');
const assert = require('node:assert');
const O = require('../scripts/planer/core/orte');
const F = require('../scripts/planer/core/fahrzeiten');
const { standardEinstellungen } = require('../scripts/planer/core/standard');

test('Orte erkennen', () => {
  const orte = standardEinstellungen().orte;
  orte.zuhause.adresse = 'Teststraße 1, 11111 Teststadt';
  orte.arbeit.adresse = 'Werkweg 2, 11111 Teststadt';
  assert.strictEqual(O.ortArt('', orte), 'zuhause');
  assert.strictEqual(O.ortArt('   ', orte), 'zuhause');
  assert.strictEqual(O.ortArt('Zuhause', orte), 'zuhause');
  assert.strictEqual(O.ortArt('Teststraße 1\n11111 Teststadt\nDeutschland', orte), 'zuhause');
  assert.strictEqual(O.ortArt('Werkweg 2, 11111 Teststadt, Deutschland', orte), 'arbeit');
  assert.strictEqual(O.ortArt('Arbeit', orte), 'arbeit');
  assert.strictEqual(O.ortArt('Arbeitsamt Teststadt', orte), 'fremd');
  assert.strictEqual(O.ortArt('Sporthalle', orte), 'fremd');
});

test('Verkehrsmittel', () => {
  const v = standardEinstellungen().verkehr;
  assert.strictEqual(O.verkehrsmittel('zuhause', 'arbeit', false, v), 'Fahrrad');
  assert.strictEqual(O.verkehrsmittel('arbeit', 'zuhause', false, v), 'Fahrrad');
  assert.strictEqual(O.verkehrsmittel('arbeit', 'fremd', true, v), 'Fahrrad');
  assert.strictEqual(O.verkehrsmittel('fremd', 'fremd', true, v), 'Auto');
  assert.strictEqual(O.verkehrsmittel('zuhause', 'fremd', false, v), 'Auto');
});

test('Fahrzeit-Text lesen', () => {
  assert.strictEqual(F.minutenAusText('15 Min.'), 15);
  assert.strictEqual(F.minutenAusText('15 min'), 15);
  assert.strictEqual(F.minutenAusText('1 Std. 5 Min.'), 65);
  assert.strictEqual(F.minutenAusText('1 h 5 min'), 65);
  assert.strictEqual(F.minutenAusText('1:05'), 65);
  assert.strictEqual(F.minutenAusText('900'), 15);
  assert.strictEqual(F.minutenAusText('12'), 12);
  assert.strictEqual(F.minutenAusText(12.4), 12);
  assert.strictEqual(F.minutenAusText(''), null);
  assert.strictEqual(F.minutenAusText('unbekannt'), null);
});

test('Ergebnisse lesen und cachen', () => {
  const offen = { s1: { key: 'Auto|a|b' }, s2: { key: 'Fahrrad|a|c' } };
  const erg = F.ergebnisseLesen('b\ns1|15 Min.\ns2|\nquatsch', offen);
  assert.deepStrictEqual(erg.map(e => [e.key, e.min]), [['Auto|a|b', 15], ['Fahrrad|a|c', null]]);
  const cache = F.cacheAktualisieren({}, erg, '2026-11-12');
  assert.deepStrictEqual(cache, { 'Auto|a|b': { min: 15, datum: '2026-11-12' } });
  assert.strictEqual(F.istFrisch(cache, 'Auto|a|b', '2026-12-12', 30), true);
  assert.strictEqual(F.istFrisch(cache, 'Auto|a|b', '2026-12-13', 30), false);
  assert.strictEqual(F.cacheWert(cache, 'x'), null);
});
