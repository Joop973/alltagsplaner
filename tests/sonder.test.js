'use strict';
const test = require('node:test');
const assert = require('node:assert');
const D = require('../scripts/planer/core/datum');
const S = require('../scripts/planer/core/sonder');
const ST = require('../scripts/planer/core/standard');

const HEUTE = '2026-11-12';
const cfgGeb = () => ST.standardEinstellungen().geburtstage;

test('Hilfen: nächstes Datum, Monate addieren', () => {
  assert.strictEqual(S.naechstesDatum('11-20', HEUTE), '2026-11-20');
  assert.strictEqual(S.naechstesDatum('11-12', HEUTE), '2026-11-12');
  assert.strictEqual(S.naechstesDatum('02-14', HEUTE), '2027-02-14');
  assert.strictEqual(S.naechstesDatum('1990-03-08', HEUTE), '2027-03-08');
  assert.strictEqual(S.plusMonate('2026-01-31', 1), '2026-02-28');
  assert.strictEqual(S.plusMonate('2026-11-30', 24), '2028-11-30');
  assert.strictEqual(S.slug('Jürgen Müller-Groß'), 'juergen-mueller-gross');
});

test('Namen aus dem Geburtstage-Kalender', () => {
  assert.strictEqual(S.nameAusTitel('Max Mustermanns Geburtstag'), 'Max Mustermann');
  assert.strictEqual(S.nameAusTitel('Hans’ Geburtstag'), 'Hans');
  assert.strictEqual(S.nameAusTitel('Geburtstag von Erika Muster'), 'Erika Muster');
  assert.strictEqual(S.nameAusTitel("Max's Birthday"), 'Max');
  assert.strictEqual(S.nameAusTitel('Oma'), 'Oma');
});

test('Geburtstage: Liste, Geschenk-Aufgabe, Mitteilungen', () => {
  const liste = S.geburtstagsListe(
    [{ titel: 'Max Mustermanns Geburtstag', datum: '2026-11-30' }, { titel: 'Erika Musters Geburtstag', datum: '2027-03-01' }],
    [{ name: 'Oma', datum: '11-14' }, { name: 'Max Mustermann', datum: '11-30' }], HEUTE, 60);
  assert.deepStrictEqual(liste.map(p => `${p.datum} ${p.name}`), ['2026-11-14 Oma', '2026-11-30 Max Mustermann']);

  const auf = S.geburtstagsAufgaben(liste, { 'Max Mustermann': true, Oma: true }, cfgGeb(), HEUTE);
  assert.deepStrictEqual(auf.map(a => [a.id, a.faellig, a.bis]), [
    ['geschenk-oma-2026', '2026-10-31', '2026-11-13'],
    ['geschenk-max-mustermann-2026', '2026-11-16', '2026-11-29'],
  ]);
  assert.ok(auf.every(a => a.einmalig && a.pflicht && a.dauer === 30));

  const m = S.geburtstagsMitteilungen(liste, { 'Max Mustermann': true }, { erledigt: {} }, cfgGeb());
  const kurz = m.map(x => `${D.ymd(x.zeit)} ${D.hm(x.zeit)} ${x.titel}`);
  assert.deepStrictEqual(kurz, [
    '2026-11-14 06:00 Geburtstag heute',
    '2026-11-30 06:00 Geburtstag heute',
    '2026-11-23 06:00 Geschenk fehlt noch',
  ]);
  const m2 = S.geburtstagsMitteilungen(liste, { 'Max Mustermann': true }, { erledigt: { 'geschenk-max-mustermann-2026': '2026-11-20' } }, cfgGeb());
  assert.strictEqual(m2.filter(x => x.titel === 'Geschenk fehlt noch').length, 0);
});

test('Status: erledigt, später, heute nicht', () => {
  const jetzt = new Date(2026, 10, 12, 18, 0);
  let st = S.aktionAufStatus(S.leererStatus(), { aktion: 'heutenicht', id: 'a' }, jetzt);
  assert.strictEqual(st.nichtVor.a, new Date(2026, 10, 13).toISOString());
  st = S.aktionAufStatus(st, { aktion: 'erledigt', id: 'b' }, jetzt);
  const auf = S.statusAnwenden([{ id: 'a' }, { id: 'b' }, { id: 'c' }], st, jetzt);
  assert.deepStrictEqual(auf.map(x => [x.id, x.nichtVor || null]), [['a', new Date(2026, 10, 13).toISOString()], ['c', null]]);
  const alt = { erledigt: { x: '2024-01-01', y: '2026-11-01' }, nichtVor: {} };
  assert.deepStrictEqual(Object.keys(S.statusAufraeumen(alt, HEUTE).erledigt), ['y']);
});

test('Fristen: Aufgabe, Mitteilungen, nach Erledigung weiter', () => {
  const fristen = [
    { id: 'tuev', name: 'TÜV', datum: '2026-12-20', monate: 24, vorlaufWochen: [4, 1], dauer: 15 },
    { id: 'kuend', name: 'Kündigung Handy', datum: '2026-12-01', monate: 0, vorlaufWochen: [2] },
  ];
  const auf = S.fristAufgaben(fristen, HEUTE);
  assert.deepStrictEqual(auf.map(a => [a.id, a.faellig, a.bis]), [
    ['frist-tuev-2026-12-20', '2026-11-22', '2026-12-20'],
    ['frist-kuend-2026-12-01', '2026-11-17', '2026-12-01'],
  ]);
  const m = S.fristMitteilungen(fristen, {}, { uhrzeit: '06:00' }).map(x => `${D.ymd(x.zeit)} ${x.titel}`);
  assert.deepStrictEqual(m, ['2026-11-22 Frist in 4 Wochen', '2026-12-13 Frist in 1 Woche', '2026-12-20 Frist heute',
    '2026-11-17 Frist in 2 Wochen', '2026-12-01 Frist heute']);
  const r = S.fristenFortschreiben(fristen, { erledigt: { 'frist-tuev-2026-12-20': '2026-11-25', 'frist-kuend-2026-12-01': '2026-11-20' } });
  assert.deepStrictEqual(r.fristen.map(f => `${f.id} ${f.datum}`), ['tuev 2028-12-20']);
  assert.strictEqual(r.meldungen.length, 2);
});

test('Checklisten: Stichwort am Wortanfang, Zeitpunkt = Beginn der Ruhe', () => {
  assert.ok(S.wortBeginn('Arzttermin Dr. X', 'arzt'));
  assert.ok(!S.wortBeginn('Samstag Kaffee', 'amt'));
  assert.ok(S.wortBeginn('Bürgeramt / Amt für Soziales', 'amt'));
  const jetzt = new Date(2026, 10, 12, 9);
  const fahrten = [
    { zuTermin: true, zielName: 'Training Fußball', abfahrt: new Date(2026, 10, 12, 19, 45) },
    { zuTermin: true, zielName: 'Arbeit', abfahrt: new Date(2026, 10, 13, 6, 45) },
    { zuTermin: false, zielName: 'Zuhause', abfahrt: new Date(2026, 10, 12, 21, 30) },
    { zuTermin: true, zielName: 'Training früh', abfahrt: new Date(2026, 10, 12, 9, 10) },
  ];
  const listen = ST.standardChecklisten();
  const m = S.checklistenFuer(fahrten, listen, jetzt, 30);
  assert.deepStrictEqual(m.map(x => `${D.hm(x.zeit)} ${x.titel}`), ['19:15 Checkliste: Training Fußball', '09:01 Checkliste: Training früh']);
  assert.match(m[0].text, /^Trainingstasche\n- Sportsachen/);
  listen.find(l => l.id === 'training').an = false;
  assert.strictEqual(S.checklistenFuer(fahrten, listen, jetzt, 30).length, 0);
});

test('Blumen: Anlässe 2 Tage vorher, Zufall 3–6 Wochen, Sperre 14 Tage um Anlässe', () => {
  const cfg = { ...ST.standardBlumen(), anlaesse: [{ name: 'Jahrestag', datum: '12-10' }, { name: 'Valentinstag', datum: '02-14' }] };
  // Zufall = 0 -> genau 3 Wochen: 03.12. liegt in der Sperre um den 10.12. -> 25.12.
  let r = S.blumenPlanen(cfg, { erledigt: {} }, HEUTE, () => 0);
  assert.strictEqual(r.cfg.naechste, '2026-12-25');
  const jt = r.aufgaben.find(a => a.id === 'blumen-jahrestag-2026-12-10');
  assert.deepStrictEqual([jt.faellig, jt.bis, jt.unterwegs, jt.pflicht], ['2026-12-08', '2026-12-10', true, true]);
  const zuf = r.aufgaben.find(a => a.id.startsWith('blumen-zufall'));
  assert.deepStrictEqual([zuf.faellig, zuf.bis, zuf.pflicht], ['2026-12-25', '2027-01-01', false]);
  // bleibt stabil, solange nicht erledigt
  r = S.blumenPlanen(r.cfg, { erledigt: {} }, '2026-11-20', () => 0.99);
  assert.strictEqual(r.cfg.naechste, '2026-12-25');
  // erledigt am 26.12. -> neu ab dann; Zufall 0.5 -> 21 + 11 = 32 Tage = 27.01.2027 (Valentinstag-Sperre beginnt 31.01.)
  r = S.blumenPlanen(r.cfg, { erledigt: { 'blumen-zufall-2026-12-25': '2026-12-26' } }, '2026-12-26', () => 0.5);
  assert.strictEqual(r.cfg.naechste, '2027-01-27');
  // Anlass erledigt -> keine Aufgabe mehr
  r = S.blumenPlanen(r.cfg, { erledigt: { 'blumen-valentinstag-2027-02-14': '2027-02-13' } }, '2027-02-13', () => 0);
  assert.ok(!r.aufgaben.some(a => a.id === 'blumen-valentinstag-2027-02-14'));
  assert.deepStrictEqual(S.blumenPlanen({ ...cfg, an: false }, {}, HEUTE, () => 0).aufgaben, []);
});
