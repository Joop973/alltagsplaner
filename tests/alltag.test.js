'use strict';
const test = require('node:test');
const assert = require('node:assert');
const D = require('../scripts/planer/core/datum');
const AL = require('../scripts/planer/core/alltag');
const P = require('../scripts/planer/core/planer');
const { standardEinstellungen, standardAufgaben } = require('../scripts/planer/core/standard');

const HEUTE = '2026-11-12';
const um = (t, h, m = 0) => new Date(2026, 10, t, h, m);
const cfgEinkauf = () => standardEinstellungen().einkauf;

test('Einkauf: ab 5 Sachen, nach 3 Tagen oder bei "!"', () => {
  assert.strictEqual(AL.einkaufAufgabe([], cfgEinkauf(), HEUTE), null);
  let a = AL.einkaufAufgabe([{ titel: 'Milch', seit: HEUTE }, { titel: 'Brot', seit: HEUTE }], cfgEinkauf(), HEUTE);
  assert.deepStrictEqual([a.faellig, a.pflicht, a.unterwegs, a.name], ['2026-11-15', false, true, 'Einkaufen (2 Sachen)']);
  a = AL.einkaufAufgabe([{ titel: 'Milch', seit: '2026-11-08' }], cfgEinkauf(), HEUTE);
  assert.deepStrictEqual([a.faellig, a.pflicht], [HEUTE, true]);
  a = AL.einkaufAufgabe([{ titel: '! Windeln', seit: HEUTE }], cfgEinkauf(), HEUTE);
  assert.deepStrictEqual([a.faellig, a.pflicht], [HEUTE, true]);
  const fuenf = ['a', 'b', 'c', 'd', 'e'].map(t => ({ titel: t, seit: HEUTE }));
  a = AL.einkaufAufgabe(fuenf, cfgEinkauf(), HEUTE);
  assert.deepStrictEqual([a.faellig, a.schritte.length], [HEUTE, 5]);
  assert.strictEqual(AL.einkaufAufgabe(fuenf, { ...cfgEinkauf(), an: false }, HEUTE), null);
});

test('Medikamente: Erinnerung, Nachfrage, Genommen, Vorrat, Apotheke', () => {
  const meds = [
    { id: 'm1', name: 'Tablette A', zeiten: ['08:00', '20:00'], proEinnahme: 1, vorrat: 10, nachkaufenTage: 7 },
    { id: 'm2', name: 'Vitamin D', zeiten: ['09:00'], wochentage: [7], proEinnahme: 1 }, // nur sonntags
  ];
  const cfg = standardEinstellungen().medikamente;
  const jetzt = um(14, 7); // Samstag 07:00
  const ms = AL.medMitteilungen(meds, { genommen: {} }, jetzt, cfg);
  assert.deepStrictEqual(ms.map(m => `${D.kurz(m.zeit)} ${D.hm(m.zeit)} ${m.titel}`), [
    'Sa 14.11. 08:00 Medikament: Tablette A', 'Sa 14.11. 08:30 Noch nicht genommen? Tablette A',
    'Sa 14.11. 20:00 Medikament: Tablette A', 'Sa 14.11. 20:30 Noch nicht genommen? Tablette A',
    'So 15.11. 08:00 Medikament: Tablette A', 'So 15.11. 08:30 Noch nicht genommen? Tablette A',
    'So 15.11. 09:00 Medikament: Vitamin D', 'So 15.11. 09:30 Noch nicht genommen? Vitamin D',
    'So 15.11. 20:00 Medikament: Tablette A', 'So 15.11. 20:30 Noch nicht genommen? Tablette A',
  ]);
  const r = AL.medGenommen(meds, { genommen: {} }, 'm1|2026-11-14|08:00', um(14, 8, 5));
  assert.strictEqual(r.meds[0].vorrat, 9);
  assert.strictEqual(AL.medMitteilungen(r.meds, r.status, jetzt, cfg).filter(m => m.id.includes('2026-11-14-0800')).length, 0);
  // doppelt drücken zählt nicht doppelt
  assert.strictEqual(AL.medGenommen(r.meds, r.status, 'm1|2026-11-14|08:00', um(14, 8, 6)).meds[0].vorrat, 9);
  assert.strictEqual(AL.medVorratTage(r.meds[0]), 4);
  const ap = AL.medNachkauf(r.meds, '2026-11-14');
  assert.deepStrictEqual([ap.name, ap.bis, ap.unterwegs], ['Apotheke: Tablette A', '2026-11-17', true]);
  assert.strictEqual(AL.medNachkauf([{ ...meds[0], vorrat: 40 }], HEUTE), null);
});

test('Folgeaufgabe: 3 Erinnerungen ab 2 Stunden nach dem Erledigen', () => {
  const w = standardAufgaben().find(a => a.id === 'waesche');
  const m = AL.folgeMitteilungen(w, um(12, 17));
  assert.deepStrictEqual(m.map(x => `${D.hm(x.zeit)} ${x.titel}`), ['19:00 Jetzt: Wäsche aufhängen', '19:30 Noch offen: Wäsche aufhängen', '20:00 Noch offen: Wäsche aufhängen']);
  assert.deepStrictEqual(AL.folgeMitteilungen({ id: 'x', name: 'x' }, um(12, 17)), []);
});

test('Wäsche nur, wenn man danach noch 2 Stunden zuhause ist und es vor 21 Uhr fertig wird', () => {
  const e = standardEinstellungen();
  e.orte.zuhause.adresse = 'Teststraße 1, 11111 Teststadt';
  const w = standardAufgaben().find(a => a.id === 'waesche');
  // zuhause 16:15–19:15 (Abfahrt 19:45 minus Ruhe): 16:30 + 15 + 120 = 18:45 passt
  const termine = [
    { titel: 'Arbeit', start: um(12, 7), end: um(12, 16), ort: 'Arbeit' },
    { titel: 'Training', start: um(12, 20), end: um(12, 21, 30), ort: 'Halle' },
  ];
  let plan = P.planen({ termine, aufgaben: [w], einst: e, fahrzeit: () => 15, jetzt: um(12, 0) });
  assert.strictEqual(`${D.kurz(plan.bloecke[0].start)} ${D.hm(plan.bloecke[0].start)}`, 'Do 12.11. 16:30');
  // Training schon 18:00: zuhause nur bis 17:15 -> nicht am Donnerstag
  termine[1] = { titel: 'Training', start: um(12, 18), end: um(12, 21, 30), ort: 'Halle' };
  plan = P.planen({ termine, aufgaben: [w], einst: e, fahrzeit: () => 15, jetzt: um(12, 0) });
  assert.notStrictEqual(D.ymd(plan.bloecke[0].start), '2026-11-12');
  // freier Tag 19:00 geht nicht mehr (19:15 + 120 > 21:00)
  plan = P.planen({ termine: [], aufgaben: [w], einst: e, fahrzeit: () => 15, jetzt: um(12, 19) });
  assert.strictEqual(D.ymd(plan.bloecke[0].start), '2026-11-13');
});

test('Saisonale Aufgaben nur in ihren Monaten', () => {
  const e = standardEinstellungen();
  const reifen = { id: 'r', name: 'Reifen', intervall: 365, dauer: 60, pflicht: true, monate: [3, 4], letzte: null };
  const plan = P.planen({ termine: [], aufgaben: [reifen], einst: e, fahrzeit: () => 15, jetzt: um(12, 0) });
  assert.strictEqual(plan.bloecke.length, 0);
  assert.ok(P.inSaison(reifen, '2027-03-02'));
});

test('Müll (Option): Vorabend und morgens', () => {
  const termine = [{ titel: 'Gelbe Tonne', start: um(13, 0) }, { titel: 'Restmüll', start: um(13, 0) }, { titel: 'Papier', start: um(5, 0) }];
  assert.deepStrictEqual(AL.muellMitteilungen(termine, um(12, 9), { an: false }), []);
  const m = AL.muellMitteilungen(termine, um(12, 9), { an: true, vorabend: '19:00', morgens: '06:30' });
  assert.deepStrictEqual(m.map(x => `${D.kurz(x.zeit)} ${D.hm(x.zeit)} ${x.text}`), [
    'Do 12.11. 19:00 Gelbe Tonne, Restmüll heute Abend rausstellen.',
    'Fr 13.11. 06:30 Gelbe Tonne, Restmüll – steht die Tonne draußen?',
  ]);
});

test('Terminprüfung und Ort aus Titel', () => {
  const e = standardEinstellungen();
  e.orte.arbeit.adresse = 'Werkweg 2';
  const termine = [
    { titel: 'Arbeit', start: um(12, 7), end: um(12, 16), ort: 'Arbeit' },
    { titel: 'Arzt', start: um(12, 16, 5), end: um(12, 17), ort: 'Praxis' },
  ];
  const plan = P.planen({ termine, aufgaben: [], einst: e, fahrzeit: () => 15, jetzt: um(12, 0) });
  assert.deepStrictEqual(AL.terminWarnungen(plan.ablauf).map(w => w.text), ['Do 12.11. Arzt: Fahrzeit reicht nicht, 10 min zu spät']);

  let g = AL.titelOrteLernen({}, [{ titel: 'Training', ort: 'Halle Nord' }]);
  assert.strictEqual(AL.ortErgaenzen([{ titel: 'Training', ort: '' }], g)[0].ort, '');
  g = AL.titelOrteLernen(g, [{ titel: 'training', ort: 'Halle Nord' }]);
  const t = AL.ortErgaenzen([{ titel: 'Training', ort: '' }, { titel: 'Kochen', ort: '' }], g);
  assert.deepStrictEqual(t.map(x => x.ort), ['Halle Nord', '']);
  assert.strictEqual(t[0].ortGelernt, true);
  g = AL.titelOrteLernen(g, [{ titel: 'Training', ort: 'Halle Süd' }]);
  assert.strictEqual(g.training.anzahl, 1);
});

test('Früher zuhause: laufender Termin woanders endet (Ankunft minus Heimweg)', () => {
  const { standardEinstellungen } = require('../scripts/planer/core/standard');
  const O = require('../scripts/planer/core/orte');
  const einst = standardEinstellungen();
  einst.orte.zuhause.adresse = 'Teststraße 1, 11111 Teststadt';
  einst.orte.arbeit.adresse = 'Werkweg 2, 11111 Teststadt';
  const um = (h, m = 0) => new Date(2026, 11 - 1, 12, h, m);
  const termine = [
    { titel: 'Arbeit', start: um(7), end: um(16), ort: 'Werkweg 2, 11111 Teststadt' },
    { titel: 'Arzt', start: um(17), end: um(18), ort: 'Praxis Mitte' },
    { titel: 'Kochen', start: um(15), end: um(17), ort: '' }, // zuhause: bleibt
  ];
  const radHeim = O.streckenSchluessel('Fahrrad', 'Werkweg 2, 11111 Teststadt', 'Teststraße 1, 11111 Teststadt');
  const r = AL.fruehHeim(termine, um(15, 20).toISOString(), einst, k => (k === radHeim ? 15 : null));
  assert.strictEqual(D.hm(r[0].end), '15:05');
  assert.ok(r[0].fruehHeim);
  assert.strictEqual(r[1].end, termine[1].end, 'Arzt läuft noch nicht');
  assert.strictEqual(r[2].end, termine[2].end, 'Termin zuhause bleibt');
  // ohne bekannte Fahrzeit: Ersatzzeit 20 min
  assert.strictEqual(D.hm(AL.fruehHeim(termine, um(17, 30).toISOString(), einst, () => null)[1].end), '17:10');
  assert.strictEqual(AL.fruehHeim(termine, null, einst, () => null), termine);
});
