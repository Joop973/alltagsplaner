'use strict';
const test = require('node:test');
const assert = require('node:assert');
const D = require('../scripts/planer/core/datum');
const R = require('../scripts/planer/core/tagesrhythmus');
const P = require('../scripts/planer/core/planer');
const { standardEinstellungen } = require('../scripts/planer/core/standard');

const um = (t, h, m = 0) => new Date(2026, 10, t, h, m);
function einst() {
  const e = standardEinstellungen();
  e.orte.zuhause.adresse = 'Teststraße 1, 11111 Teststadt';
  e.orte.arbeit.adresse = 'Werkweg 2, 11111 Teststadt';
  return e;
}
const arbeit = t => ({ titel: 'Arbeit', start: um(t, 7), end: um(t, 16), ort: 'Arbeit' });
// Rad 15 min, Auto 10 min
const fz = key => (key.startsWith('Fahrrad') ? 15 : 10);

test('Wetter: Regenwahrscheinlichkeit je Stunde, Koordinaten gerundet', () => {
  const regen = R.regenFunktion({ hourly: { time: ['2026-11-13T06:00', '2026-11-13T07:00'], precipitation_probability: [80, 20] } });
  assert.strictEqual(regen(um(13, 6, 45)), 80);
  assert.strictEqual(regen(um(13, 7, 30)), 20);
  assert.strictEqual(regen(um(14, 7)), null);
  assert.strictEqual(R.regenFunktion(null)(um(13, 7)), null);
  assert.match(R.wetterUrl(52.123456, 7.98765), /latitude=52\.12&longitude=7\.99&hourly=precipitation_probability/);
});

test('Regen: Auto statt Rad zur Arbeit, Abfahrt passt sich an', () => {
  const e = einst();
  const regen = z => (new Date(z).getDate() === 13 && new Date(z).getHours() < 8 ? 80 : 10);
  const plan = P.planen({ termine: [arbeit(12), arbeit(13)], aufgaben: [], einst: e, fahrzeit: fz, jetzt: um(12, 0), regen });
  const hin = plan.ablauf.fahrten.filter(f => f.zielName === 'Arbeit').map(f => `${D.kurz(f.abfahrt)} ${D.hm(f.abfahrt)} ${f.modus}${f.regen != null ? ' ' + f.regen : ''}`);
  assert.deepStrictEqual(hin, ['Do 12.11. 06:45 Fahrrad', 'Fr 13.11. 06:50 Auto 80']);
  // ohne Regen-Schalter bleibt es beim Rad
  e.regen.an = false;
  const p2 = P.planen({ termine: [arbeit(13)], aufgaben: [], einst: e, fahrzeit: fz, jetzt: um(12, 0), regen });
  assert.strictEqual(p2.ablauf.fahrten[0].modus, 'Fahrrad');
});

test('Aufstehwecker: 60 min vor der ersten Abfahrt vor 10 Uhr, nur 24 Std.', () => {
  const e = einst();
  const termine = [arbeit(12), arbeit(13), { titel: 'Arzt', start: um(14, 11), end: um(14, 12), ort: 'Praxis' }];
  const plan = P.planen({ termine, aufgaben: [], einst: e, fahrzeit: fz, jetzt: um(12, 0), regen: () => 0 });
  const w = R.aufstehWecker(plan.ablauf.fahrten, um(12, 0), e.regeln, e.aufstehen);
  assert.deepStrictEqual(w.map(x => `${x.zeit} ${x.name}`), ['05:45 Planer: Aufstehen (los 06:45 zu Arbeit)']);
  const w2 = R.aufstehWecker(plan.ablauf.fahrten, um(12, 20), e.regeln, e.aufstehen);
  assert.deepStrictEqual(w2.map(x => x.zeit), ['05:45']); // Freitag
  const w3 = R.aufstehWecker(plan.ablauf.fahrten, um(13, 20), e.regeln, e.aufstehen);
  assert.deepStrictEqual(w3, []); // Samstag: Arzt erst 11 Uhr
  assert.deepStrictEqual(R.aufstehWecker(plan.ablauf.fahrten, um(12, 0), e.regeln, { ...e.aufstehen, an: false }), []);
});

test('Tagesabschluss und Morgen-Überblick', () => {
  const e = einst();
  const termine = [arbeit(12), arbeit(13), { titel: 'Ergo', start: um(13, 17), end: um(13, 17, 45), ort: 'Praxis' }];
  const regen = z => (new Date(z).getDate() === 13 && new Date(z).getHours() < 8 ? 70 : 0);
  const aufgaben = [{ id: 'bad', name: 'Bad putzen', intervall: 7, dauer: 30, pflicht: true, letzte: null }];
  const p = P.planen({ termine, aufgaben, einst: e, fahrzeit: fz, jetzt: um(12, 0), regen });
  const plan = { bloecke: p.bloecke, fahrten: p.ablauf.fahrten, termine: p.ablauf.termine, tagInfo: p.tagInfo };
  assert.strictEqual(D.hm(p.bloecke[0].start), '16:30');

  const ab = R.tagesabschluss(plan, um(12, 20), e.abschluss, e.aufstehen, new Set());
  assert.strictEqual(D.hm(ab.zeit), '20:30');
  assert.strictEqual(ab.text, 'Offen von heute: Bad putzen\nMorgen: aufstehen 05:50, los 06:50 zu Arbeit – Regen 70 %: Auto statt Rad.\nFür 8 Stunden Schlaf: ins Bett um 21:50.');
  assert.deepStrictEqual(ab.aktion, { art: 'abschluss', ids: ['bad'] });
  const ab2 = R.tagesabschluss(plan, um(12, 20), e.abschluss, e.aufstehen, new Set(['bad']));
  assert.ok(!ab2.text.includes('Offen'));
  assert.strictEqual(R.tagesabschluss(plan, um(12, 20, 45), e.abschluss, e.aufstehen, new Set()), null); // schon vorbei

  const mo = R.morgenUeberblick(plan, '2026-11-13', um(12, 20), e.morgen, e.aufstehen, e.regeln);
  assert.strictEqual(D.hm(mo.zeit), '05:50');
  assert.strictEqual(mo.text, '07:00 Arbeit (los 06:50 – Regen 70 %: Auto statt Rad)\n17:00 Ergo (los 16:50)');
});

test('Widget: die nächsten Punkte ab jetzt', () => {
  const e = einst();
  const aufgaben = [{ id: 'bad', name: 'Bad putzen', intervall: 7, dauer: 30, pflicht: true, letzte: null }];
  const p = P.planen({ termine: [arbeit(12), arbeit(13)], aufgaben, einst: e, fahrzeit: fz, jetzt: um(12, 0) });
  const plan = { bloecke: p.bloecke, fahrten: p.ablauf.fahrten, termine: p.ablauf.termine };
  const z = R.widgetZeilen(plan, um(12, 10), 4);
  assert.deepStrictEqual(z.map(x => `${x.zeit} ${x.text}`), ['07:00 Arbeit', '16:30 Bad putzen', 'Fr 06:45 los zu Arbeit', 'Fr 07:00 Arbeit']);
});

test('Hinweis am Blockende (Option)', () => {
  const b = [{ aufgabeId: 'bad', name: 'Bad putzen', start: um(12, 18), end: um(12, 18, 30) }];
  assert.deepStrictEqual(R.blockEndeMitteilungen(b, um(12, 9), { an: false }), []);
  const m = R.blockEndeMitteilungen(b, um(12, 9), { an: true });
  assert.deepStrictEqual(m.map(x => `${D.hm(x.zeit)} ${x.titel}`), ['18:30 Zeit um: Bad putzen']);
});

test('Tagesabschluss nennt, was heute geschafft wurde', () => {
  const R2 = require('../scripts/planer/core/tagesrhythmus');
  const m = R2.tagesabschluss({ bloecke: [], fahrten: [] }, new Date(2026, 10, 12, 9), { an: true, zeit: '20:30' }, { an: false }, new Set(), 3);
  assert.strictEqual(m.text, 'Heute geschafft: 3.');
  assert.strictEqual(R2.tagesabschluss({ bloecke: [], fahrten: [] }, new Date(2026, 10, 12, 9), { an: true, zeit: '20:30' }, { an: false }, new Set(), 0), null);
});
