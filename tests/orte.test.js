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
  const offen = { strecken: { s1: { key: 'Auto|a|b' }, s2: { key: 'Fahrrad|a|c' } } };
  const erg = F.ergebnisseLesen('b\ns1|15 Min.\ns2|\nquatsch', offen);
  assert.deepStrictEqual(erg.map(e => [e.key, e.min]), [['Auto|a|b', 15], ['Fahrrad|a|c', null]]);
  const cache = F.cacheAktualisieren({}, erg, '2026-11-12');
  assert.deepStrictEqual(cache, { 'Auto|a|b': { min: 15, datum: '2026-11-12' } });
  assert.strictEqual(F.istFrisch(cache, 'Auto|a|b', '2026-12-12', 30), true);
  assert.strictEqual(F.istFrisch(cache, 'Auto|a|b', '2026-12-13', 30), false);
  assert.strictEqual(F.cacheWert(cache, 'x'), null);
});

test('Strecken aufteilen und Antwort im Format RAD/AUTO lesen', () => {
  const noetig = [
    { key: 'Fahrrad|z|w', von: 'z', nach: 'w', modus: 'Fahrrad' },
    { key: 'Auto|z|p', von: 'z', nach: 'p', modus: 'Auto' },
    { key: 'Fahrrad|w|z', von: 'w', nach: 'z', modus: 'Fahrrad' },
    { key: 'Auto|p|z', von: 'p', nach: 'z', modus: 'Auto' },
  ];
  const { ausgabe, offen } = F.streckenAufteilen(noetig);
  assert.deepStrictEqual(ausgabe.rad, [{ von: 'z', nach: 'w' }, { von: 'w', nach: 'z' }]);
  assert.deepStrictEqual(ausgabe.auto, [{ von: 'z', nach: 'p' }, { von: 'p', nach: 'z' }]);
  assert.strictEqual(ausgabe.anzahl, 4);
  const text = 'RAD\n15 Min.\n\n16 Min.\nAUTO\n20 Min.\n1 Std. 5 Min.\n';
  const erg = F.ergebnisseLesen(text, offen);
  assert.deepStrictEqual(erg.map(e => [e.key, e.min]), [
    ['Fahrrad|z|w', 15], ['Fahrrad|w|z', 16], ['Auto|z|p', 20], ['Auto|p|z', 65],
  ]);
  // Rad-Liste leer: Zeile bleibt leer
  const nurAuto = F.streckenAufteilen([noetig[1]]);
  assert.deepStrictEqual(F.ergebnisseLesen('RAD\n\nAUTO\n12 Min.', nurAuto.offen).map(e => e.min), [12]);
});

test('Phase b erkennen', () => {
  assert.strictEqual(F.istPhaseB(''), false);
  assert.strictEqual(F.istPhaseB('a'), false);
  assert.strictEqual(F.istPhaseB('RAD\n\nAUTO\n'), true);
  assert.strictEqual(F.istPhaseB('rad\n15 Min.\nauto'), true);
  assert.strictEqual(F.istPhaseB('b\ns1|15'), true);
  assert.strictEqual(F.istPhaseB('Bahnhof'), false);
});

test('Adresse aus Kartenergebnis', () => {
  assert.strictEqual(O.adresseAusOrt({ thoroughfare: 'Weg', subThoroughfare: '2', postalCode: '11111', locality: 'Stadt' }), 'Weg 2, 11111 Stadt');
  assert.strictEqual(O.adresseAusOrt({ name: 'Sporthalle', locality: 'Stadt' }), 'Sporthalle, Stadt');
  assert.strictEqual(O.adresseAusOrt({ location: { latitude: 52.1, longitude: 8.2 } }), '52.1,8.2');
  assert.strictEqual(O.adresseAusOrt(undefined), null);
  assert.strictEqual(O.adresseAusOrt({}), null);
});

test('Suchvarianten für unordentliche Ort-Texte', () => {
  assert.deepStrictEqual(O.suchVarianten('Nordort, XY  (123456): Am Platz/Neuer Weg, 12345 Musterstadt (OT Nord)'), [
    'Nordort, XY (123456): Am Platz/Neuer Weg, 12345 Musterstadt (OT Nord)',
    'Am Platz/Neuer Weg, 12345 Musterstadt',
    'Am Platz, 12345 Musterstadt',
    '12345 Musterstadt',
  ]);
  assert.deepStrictEqual(O.suchVarianten('Teststraße 1, 11111 Teststadt'), ['Teststraße 1, 11111 Teststadt', '11111 Teststadt']);
  assert.deepStrictEqual(O.suchVarianten('Sporthalle'), ['Sporthalle']);
  assert.deepStrictEqual(O.suchVarianten(''), []);
});

test('OpenStreetMap-Treffer -> Adresse und Koordinaten', () => {
  const O = require('../scripts/planer/core/orte');
  const x = { lat: '52.5', lon: '7.25', name: '', address: { road: 'Musterweg', house_number: '3', postcode: '12345', town: 'Musterstadt' } };
  const o = O.ausNominatim(x);
  assert.strictEqual(O.adresseAusOrt(o), 'Musterweg 3, 12345 Musterstadt');
  assert.deepStrictEqual(o.location, { latitude: 52.5, longitude: 7.25 });
  assert.strictEqual(O.ausNominatim(undefined), null);
  // nur Ort (z. B. Variante "PLZ Ort")
  assert.strictEqual(O.adresseAusOrt(O.ausNominatim({ lat: '1', lon: '2', name: 'Musterstadt', address: { postcode: '12345', village: 'Musterstadt' } })), '12345 Musterstadt');
});

test('Fahrzeit aus Luftlinie schätzen', () => {
  const F = require('../scripts/planer/core/fahrzeiten');
  const a = { lat: 52.0, lon: 7.0 }, b = { lat: 52.09, lon: 7.0 }; // ca. 10 km
  assert.strictEqual(F.schaetzung(a, b, 'Auto'), 21);   // 13 km / 45 km/h + 4
  assert.strictEqual(F.schaetzung(a, b, 'Fahrrad'), 54); // 13 km / 15 km/h + 2
  assert.strictEqual(F.schaetzung(a, null, 'Auto'), null);
  // Schätzungen gelten nur am selben Tag
  const cache = { k: { min: 10, datum: '2026-11-11', geschaetzt: true }, e: { min: 10, datum: '2026-11-11' } };
  assert.strictEqual(F.istFrisch(cache, 'k', '2026-11-11', 30), true);
  assert.strictEqual(F.istFrisch(cache, 'k', '2026-11-12', 30), false);
  assert.strictEqual(F.istFrisch(cache, 'e', '2026-11-12', 30), true);
});

test('OpenStreetMap-Routing: Adresse und Minuten mit Puffer', () => {
  const F = require('../scripts/planer/core/fahrzeiten');
  const a = { lat: 52.5, lon: 7.25 }, b = { lat: 52.6, lon: 7.3 };
  assert.strictEqual(F.routingUrl('Fahrrad', a, b), 'https://routing.openstreetmap.de/routed-bike/route/v1/driving/7.250000,52.500000;7.300000,52.600000?overview=false&alternatives=false&steps=false');
  assert.match(F.routingUrl('Auto', a, b), /\/routed-car\//);
  assert.strictEqual(F.minutenAusRouting({ code: 'Ok', routes: [{ duration: 720 }] }, 'Auto', { pufferAuto: 3 }), 15);
  assert.strictEqual(F.minutenAusRouting({ code: 'Ok', routes: [{ duration: 840 }] }, 'Fahrrad', {}), 15);
  assert.strictEqual(F.minutenAusRouting({ code: 'NoRoute', routes: [] }, 'Auto', {}), null);
  assert.strictEqual(F.minutenAusRouting(null, 'Auto', {}), null);
});
