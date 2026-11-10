'use strict';
const test = require('node:test');
const assert = require('node:assert');
const D = require('../scripts/planer/core/datum');
const P = require('../scripts/planer/core/planer');
const { standardEinstellungen, standardAufgaben } = require('../scripts/planer/core/standard');

// Erfundene Testorte, keine echten Daten.
function einstellungen() {
  const e = standardEinstellungen();
  e.orte.zuhause.adresse = 'Teststraße 1, 11111 Teststadt';
  e.orte.arbeit.adresse = 'Werkweg 2, 11111 Teststadt';
  return e;
}
const DO = new Date(2026, 10, 12); // Donnerstag
const um = (tag, h, m = 0) => new Date(tag.getFullYear(), tag.getMonth(), tag.getDate(), h, m);
const zeit = d => D.hm(new Date(d));

// Andere Tage komplett belegt (Termin zuhause, ohne Ort)
function vollerTag(tag) { return { titel: 'belegt', start: um(tag, 0), end: um(tag, 23, 59), ort: '' }; }

function referenz(aufgaben) {
  const einst = einstellungen();
  const termine = [
    { titel: 'Arbeit', start: um(DO, 7), end: um(DO, 16), ort: 'Werkweg 2, 11111 Teststadt' },
    { titel: 'Ergo', start: um(DO, 17), end: um(DO, 17, 45), ort: 'Praxisplatz 3, Teststadt' },
    { titel: 'Training', start: um(DO, 20), end: um(DO, 21, 30), ort: 'Sporthalle Teststadt' },
  ];
  for (let i = 1; i < 7; i++) termine.push(vollerTag(D.plusTage(DO, i)));
  return P.planen({ termine, aufgaben, einst, fahrzeit: () => 15, jetzt: um(DO, 0) });
}

const nurBadUndSaugen = () => standardAufgaben()
  .filter(a => a.id === 'bad' || a.id === 'saugen')
  .map(a => ({ ...a, letzte: D.ymd(D.plusTage(DO, -7)) }));

test('Referenz-Test Donnerstag', () => {
  const plan = referenz(nurBadUndSaugen());
  const bloecke = plan.bloecke.map(b => `${zeit(b.start)}-${zeit(b.end)} ${b.name}`);
  assert.deepStrictEqual(bloecke, ['18:15-18:45 Bad putzen', '18:45-19:05 Staubsaugen']);

  // 16:15–16:45 nichts, ab 19:15 Ruhe: einzige Lücke 18:15–19:15
  const luecken = plan.tagesLuecken[0].luecken.map(l => `${zeit(l.start)}-${zeit(l.end)}`);
  assert.deepStrictEqual(luecken, ['18:15-19:15']);
  for (const t of plan.tagesLuecken.slice(1)) assert.strictEqual(t.luecken.length, 0);

  const fahrten = plan.ablauf.fahrten.map(f => `${zeit(f.abfahrt)}-${zeit(f.ankunft)} ${f.modus} ${f.zielName}`);
  assert.deepStrictEqual(fahrten, [
    '06:45-07:00 Fahrrad Arbeit',
    '16:00-16:15 Fahrrad Zuhause',
    '16:45-17:00 Auto Ergo',
    '17:45-18:00 Auto Zuhause',
    '19:45-20:00 Auto Training',
    '21:30-21:45 Auto Zuhause',
  ]);

  assert.deepStrictEqual(plan.wecker.map(w => `${w.zeit} ${w.name}`), [
    '06:40 Planer: In 5 min los zu Arbeit',
    '16:40 Planer: In 5 min los zu Ergo',
    '19:40 Planer: In 5 min los zu Training',
  ]);
  assert.deepStrictEqual(plan.warnungen, []);
});

test('Wecker nur für die nächsten 24 Stunden', () => {
  const einst = einstellungen();
  const termine = [
    { titel: 'A', start: um(DO, 10), end: um(DO, 11), ort: 'Irgendwo' },
    { titel: 'B', start: um(D.plusTage(DO, 1), 10), end: um(D.plusTage(DO, 1), 11), ort: 'Irgendwo' },
  ];
  const plan = P.planen({ termine, aufgaben: [], einst, fahrzeit: () => 10, jetzt: um(DO, 12) });
  assert.deepStrictEqual(plan.wecker.map(w => w.name), ['Planer: In 5 min los zu B']);
});

test('Direkt weiter, wenn die Zeit für den Heimweg nicht reicht', () => {
  const einst = einstellungen();
  const termine = [
    { titel: 'Arbeit', start: um(DO, 8), end: um(DO, 16), ort: 'Arbeit' },
    { titel: 'Arzt', start: um(DO, 16, 20), end: um(DO, 17), ort: 'Praxis' },
  ];
  const plan = P.planen({ termine, aufgaben: [], einst, fahrzeit: () => 15, jetzt: um(DO, 0) });
  const f = plan.ablauf.fahrten.map(x => `${zeit(x.abfahrt)} ${x.modus} ${x.zielName}`);
  assert.deepStrictEqual(f, ['07:45 Fahrrad Arbeit', '16:05 Fahrrad Arzt', '17:00 Auto Zuhause']);
  // Phase (a) muss alle möglichen Strecken abfragen: hin, heim, Arzt hin, direkt, Arzt heim
  assert.strictEqual(plan.ablauf.strecken.length, 5);
});

test('Unbekannte Fahrzeit nutzt Fallback 20 min und meldet die Strecke', () => {
  const einst = einstellungen();
  const termine = [{ titel: 'Kino', start: um(DO, 19), end: um(DO, 21), ort: 'Kino am Markt' }];
  const plan = P.planen({ termine, aufgaben: [], einst, fahrzeit: () => null, jetzt: um(DO, 0) });
  assert.strictEqual(zeit(plan.ablauf.fahrten[0].abfahrt), '18:40');
  assert.deepStrictEqual(plan.ablauf.strecken.map(s => `${s.modus}|${s.von}|${s.nach}`), [
    'Auto|Teststraße 1, 11111 Teststadt|Kino am Markt',
    'Auto|Kino am Markt|Teststraße 1, 11111 Teststadt',
  ]);
});

test('Freie Tage: Wäsche zweimal in 7 Tagen, höchstens 120 min pro Tag, Start 09:30', () => {
  const einst = einstellungen();
  einst.regeln.vorziehenTage = 0;
  const aufgaben = standardAufgaben(); // alle heute fällig
  const plan = P.planen({ termine: [], aufgaben, einst, fahrzeit: () => 15, jetzt: um(DO, 0) });
  const proTag = {};
  for (const b of plan.bloecke) {
    const t = D.ymd(b.start);
    proTag[t] = (proTag[t] || 0) + (b.end - b.start) / 60000;
  }
  for (const m of Object.values(proTag)) assert.ok(m <= 120);
  const waesche = plan.bloecke.filter(b => b.aufgabeId === 'waesche').map(b => D.ymd(b.start));
  assert.deepStrictEqual(waesche, ['2026-11-12', '2026-11-16']);
  // Pflicht zuerst: am ersten Tag 09:30 Bad putzen (freier Tag)
  assert.strictEqual(`${zeit(plan.bloecke[0].start)} ${plan.bloecke[0].name}`, '09:30 Bad putzen');
  // Freier Tag, höchstens 120 min: Pflicht 30+15+15 = 60, dann Fenster (60) = 120. Staubsaugen (20) erst am nächsten Tag.
  const fenster = plan.bloecke.find(b => b.aufgabeId === 'fenster');
  assert.strictEqual(D.ymd(fenster.start), '2026-11-12');
  const saugen = plan.bloecke.find(b => b.aufgabeId === 'saugen');
  assert.strictEqual(D.ymd(saugen.start), '2026-11-13');
});

test('Pflicht ohne Platz erzeugt Warnung', () => {
  const einst = einstellungen();
  const termine = [];
  for (let i = 0; i < 7; i++) termine.push(vollerTag(D.plusTage(DO, i)));
  const aufgaben = [{ id: 'bad', name: 'Bad putzen', intervall: 7, dauer: 30, pflicht: true, letzte: null }];
  const plan = P.planen({ termine, aufgaben, einst, fahrzeit: () => 15, jetzt: um(DO, 0) });
  assert.strictEqual(plan.bloecke.length, 0);
  assert.deepStrictEqual(plan.warnungen.map(w => w.name), ['Bad putzen']);
});

test('Vorziehen: am Fälligkeitstag kein Platz -> bis zu 2 Tage früher', () => {
  const einst = einstellungen();
  const sa = D.plusTage(DO, 2);
  const termine = [vollerTag(sa)];
  const aufgaben = [{ id: 'bad', name: 'Bad putzen', intervall: 7, dauer: 30, pflicht: true, letzte: D.ymd(D.plusTage(sa, -7)) }];
  const plan = P.planen({ termine, aufgaben, einst, fahrzeit: () => 15, jetzt: um(DO, 0) });
  assert.strictEqual(D.ymd(plan.bloecke[0].start), D.ymd(D.plusTage(DO, 1)));
});

test('Später: nicht vor dem Ende des alten Blocks', () => {
  const einst = einstellungen();
  const aufgaben = [{ id: 'bad', name: 'Bad putzen', intervall: 7, dauer: 30, pflicht: true, letzte: null, nichtVor: um(DO, 18, 45).toISOString() }];
  const plan = P.planen({ termine: [], aufgaben, einst, fahrzeit: () => 15, jetzt: um(DO, 18, 20) });
  assert.strictEqual(zeit(plan.bloecke[0].start), '18:45');
});

test('Einmalige Aufgabe: ab Fälligkeit, nicht nach "bis", keine Wiederholung', () => {
  const einst = einstellungen();
  einst.regeln.vorziehenTage = 0;
  const aufgaben = [{ id: 'geschenk-x', name: 'Geschenk für X', dauer: 30, pflicht: true, einmalig: true, faellig: '2026-11-14', bis: '2026-11-15' }];
  const plan = P.planen({ termine: [], aufgaben, einst, fahrzeit: () => 15, jetzt: um(DO, 0) });
  assert.deepStrictEqual(plan.bloecke.map(b => `${D.ymd(b.start)} ${zeit(b.start)}`), ['2026-11-14 09:30']);
  // Fälligkeit und Frist voll belegt -> Warnung, nicht danach planen
  const termine = [vollerTag(D.plusTage(DO, 2)), vollerTag(D.plusTage(DO, 3))];
  const p2 = P.planen({ termine, aufgaben, einst, fahrzeit: () => 15, jetzt: um(DO, 0) });
  assert.strictEqual(p2.bloecke.length, 0);
  assert.deepStrictEqual(p2.warnungen.map(w => w.name), ['Geschenk für X']);
});

test('Unterwegs: auf dem Heimweg nach der Arbeit, Heimweg verschiebt sich', () => {
  const einst = einstellungen();
  const termine = [{ titel: 'Arbeit', start: um(DO, 7), end: um(DO, 16), ort: 'Arbeit' }];
  for (let i = 1; i < 7; i++) termine.push(vollerTag(D.plusTage(DO, i)));
  const aufgaben = [
    { id: 'blumen', name: 'Blumen kaufen', dauer: 20, pflicht: true, einmalig: true, unterwegs: true, faellig: D.ymd(DO), bis: D.ymd(DO) },
    { id: 'bad', name: 'Bad putzen', intervall: 7, dauer: 30, pflicht: true, letzte: D.ymd(D.plusTage(DO, -7)) },
  ];
  const plan = P.planen({ termine, aufgaben, einst, fahrzeit: () => 15, jetzt: um(DO, 0) });
  assert.deepStrictEqual(plan.bloecke.map(b => `${zeit(b.start)}-${zeit(b.end)} ${b.name}${b.unterwegs ? ' (' + b.unterwegs + ')' : ''}`), [
    '16:00-16:20 Blumen kaufen (heimweg)',
    '16:50-17:20 Bad putzen', // heim 16:35 + 15 min Pause
  ]);
  const heim = plan.ablauf.fahrten.find(f => f.nachArt === 'zuhause');
  assert.strictEqual(`${zeit(heim.abfahrt)}-${zeit(heim.ankunft)}`, '16:20-16:35');
});

test('Unterwegs: morgens an freien Tagen, nicht an Arbeitstagen; zu spät -> normale Lücke', () => {
  const einst = einstellungen();
  const sa = D.plusTage(DO, 2);
  const termine = [
    { titel: 'Arbeit', start: um(DO, 7), end: um(DO, 16), ort: 'Arbeit' },
    { titel: 'Arbeit', start: um(D.plusTage(DO, 1), 7), end: um(D.plusTage(DO, 1), 13), ort: 'Arbeit' },
  ];
  const aufgaben = [{ id: 'blumen', name: 'Blumen kaufen', dauer: 20, pflicht: false, einmalig: true, unterwegs: true, faellig: D.ymd(sa), bis: D.ymd(D.plusTage(sa, 3)) }];
  const plan = P.planen({ termine, aufgaben, einst, fahrzeit: () => 15, jetzt: um(DO, 0) });
  assert.deepStrictEqual(plan.bloecke.map(b => `${D.ymd(b.start)} ${zeit(b.start)} ${b.unterwegs}`), [`${D.ymd(sa)} 09:30 morgens`]);

  // Heimweg erst 21:30 (Läden zu) und kein freier Morgen -> normale Lücke
  const t2 = [{ titel: 'Training', start: um(DO, 20), end: um(DO, 21, 30), ort: 'Halle' }];
  const morgensBelegt = { titel: 'belegt', start: um(DO, 0), end: um(DO, 10), ort: '' };
  const a2 = [{ id: 'blumen', name: 'Blumen kaufen', dauer: 20, einmalig: true, unterwegs: true, faellig: D.ymd(DO), bis: D.ymd(DO) }];
  const p2 = P.planen({ termine: t2.concat(morgensBelegt), aufgaben: a2, einst, fahrzeit: () => 15, jetzt: um(DO, 0) });
  assert.deepStrictEqual(p2.bloecke.map(b => `${zeit(b.start)} ${b.unterwegs || 'normal'}`), ['10:00 normal']);
});

// ---------- Stufe 1 ----------

const arbeitAm = tag => ({ titel: 'Arbeit', start: um(tag, 7), end: um(tag, 16), ort: 'Arbeit' });
const kurz = b => `${D.kurz(b.start)} ${zeit(b.start)} ${b.name}`;

test('Arbeitstag höchstens 60 min, freier Tag 120 min', () => {
  const einst = einstellungen();
  einst.regeln.vorziehenTage = 0;
  const termine = [arbeitAm(DO)];
  const heute = D.ymd(DO);
  const aufgaben = ['a', 'b', 'c', 'd'].map(id => ({ id, name: id, dauer: 25, pflicht: true, einmalig: true, faellig: heute }));
  const plan = P.planen({ termine, aufgaben, einst, fahrzeit: () => 15, jetzt: um(DO, 0) });
  const proTag = {};
  for (const b of plan.bloecke) proTag[D.ymd(b.start)] = (proTag[D.ymd(b.start)] || 0) + 25;
  assert.deepStrictEqual(proTag, { '2026-11-12': 50, '2026-11-13': 50 }); // Do Arbeit: 2 x 25, Fr frei: Rest
});

test('Lange Aufgaben (über 45 min) bevorzugt an freien Tagen', () => {
  const einst = einstellungen();
  const termine = [arbeitAm(DO), arbeitAm(D.plusTage(DO, 1))];
  const aufgaben = [{ id: 'fenster', name: 'Fenster putzen', intervall: 60, dauer: 60, pflicht: true, letzte: D.ymd(D.plusTage(DO, -60)) }];
  const plan = P.planen({ termine, aufgaben, einst, fahrzeit: () => 15, jetzt: um(DO, 0) });
  assert.deepStrictEqual(plan.bloecke.map(kurz), ['Sa 14.11. 09:30 Fenster putzen']);
});

test('Gesperrte Tage (krank, verreist, heute keine Aufgaben) bekommen keine Aufgaben', () => {
  const einst = einstellungen();
  const aufgaben = [{ id: 'bad', name: 'Bad putzen', intervall: 7, dauer: 30, pflicht: true, letzte: null }];
  const sperrTage = new Set([D.ymd(DO), D.ymd(D.plusTage(DO, 1))]);
  const plan = P.planen({ termine: [], aufgaben, einst, fahrzeit: () => 15, jetzt: um(DO, 0), sperrTage });
  assert.deepStrictEqual(plan.bloecke.map(kurz), ['Sa 14.11. 09:30 Bad putzen']);
});

test('Besorgungen nie an Sonn- und Feiertagen', () => {
  const einst = einstellungen();
  const so = D.plusTage(DO, 3); // Sonntag 15.11.
  const aufgaben = [{ id: 'blumen', name: 'Blumen kaufen', dauer: 20, pflicht: true, einmalig: true, unterwegs: true, vorziehen: 0, faellig: D.ymd(so), bis: D.ymd(D.plusTage(so, 2)) }];
  const plan = P.planen({ termine: [], aufgaben, einst, fahrzeit: () => 15, jetzt: um(DO, 0) });
  assert.deepStrictEqual(plan.bloecke.map(kurz), ['Mo 16.11. 09:30 Blumen kaufen']);
  einst.regeln.besorgungenSonntags = true;
  const p2 = P.planen({ termine: [], aufgaben, einst, fahrzeit: () => 15, jetzt: um(DO, 0) });
  assert.deepStrictEqual(p2.bloecke.map(kurz), ['So 15.11. 09:30 Blumen kaufen']);
});

test('Ruhezeiten sind eine Option: laute Aufgaben nicht sonntags und nur im Zeitfenster', () => {
  const einst = einstellungen();
  einst.regeln.vorziehenTage = 0;
  const so = D.plusTage(DO, 3);
  const aufgaben = [{ id: 'saugen', name: 'Staubsaugen', intervall: 7, dauer: 20, pflicht: true, laut: true, letzte: D.ymd(D.plusTage(so, -7)) }];
  // Standard: aus -> Sonntag ist erlaubt
  let plan = P.planen({ termine: [], aufgaben, einst, fahrzeit: () => 15, jetzt: um(DO, 0) });
  assert.strictEqual(kurz(plan.bloecke[0]), 'So 15.11. 09:30 Staubsaugen');
  einst.ruhezeiten.an = true;
  plan = P.planen({ termine: [], aufgaben, einst, fahrzeit: () => 15, jetzt: um(DO, 0) });
  assert.strictEqual(kurz(plan.bloecke[0]), 'Mo 16.11. 09:30 Staubsaugen');
  // Zeitfenster: abends nach 20:00 nicht mehr
  einst.ruhezeiten.bis = '20:00';
  const heuteFaellig = [{ ...aufgaben[0], letzte: null }];
  plan = P.planen({ termine: [], aufgaben: heuteFaellig, einst, fahrzeit: () => 15, jetzt: um(DO, 19, 50) });
  assert.strictEqual(kurz(plan.bloecke[0]), 'Fr 13.11. 09:30 Staubsaugen');
});

test('Verschobener Block gilt (fest), der Rest wird darum herum geplant', () => {
  const einst = einstellungen();
  const aufgaben = [
    { id: 'bad', name: 'Bad putzen', intervall: 7, dauer: 30, pflicht: true, letzte: null },
    { id: 'bett', name: 'Bettwäsche wechseln', intervall: 14, dauer: 15, pflicht: true, letzte: null },
  ];
  const fest = [{ aufgabeId: 'bad', start: um(DO, 15), end: um(DO, 15, 30) }];
  const plan = P.planen({ termine: [], aufgaben, einst, fahrzeit: () => 15, jetzt: um(DO, 0), fest });
  assert.deepStrictEqual(plan.bloecke.filter(b => D.ymd(b.start) === D.ymd(DO)).map(b => `${zeit(b.start)} ${b.name}${b.fest ? ' fest' : ''}`),
    ['09:30 Bettwäsche wechseln', '15:00 Bad putzen fest']);
  // nächster Termin der Aufgabe zählt ab dem festen Tag; abgelaufene feste Blöcke gelten nicht mehr
  const spaeter = P.planen({ termine: [], aufgaben, einst, fahrzeit: () => 15, jetzt: um(DO, 16), fest });
  assert.ok(!spaeter.bloecke.some(b => b.fest));
});

test('Planruhe: Blöcke bleiben an ihrer Zeit, auch wenn früher etwas frei wird', () => {
  const einst = einstellungen();
  const aufgaben = [{ id: 'bad', name: 'Bad putzen', intervall: 7, dauer: 30, pflicht: true, letzte: null }];
  const vormittag = { titel: 'Besuch', start: um(DO, 9), end: um(DO, 12), ort: '' };
  const erst = P.planen({ termine: [vormittag], aufgaben, einst, fahrzeit: () => 15, jetzt: um(DO, 0) });
  assert.strictEqual(zeit(erst.bloecke[0].start), '12:00');
  // Besuch sagt ab: ohne Planruhe 09:30, mit Planruhe bleibt 12:00
  const ruhig = P.planen({ termine: [], aufgaben, einst, fahrzeit: () => 15, jetzt: um(DO, 0), vorher: erst.bloecke });
  assert.strictEqual(zeit(ruhig.bloecke[0].start), '12:00');
  einst.regeln.planruhe = false;
  const neu = P.planen({ termine: [], aufgaben, einst, fahrzeit: () => 15, jetzt: um(DO, 0), vorher: erst.bloecke });
  assert.strictEqual(zeit(neu.bloecke[0].start), '09:30');
  // alte Zeit passt nicht mehr (neuer Termin): normale Suche
  einst.regeln.planruhe = true;
  const mittag = { titel: 'Arzt zuhause', start: um(DO, 11, 30), end: um(DO, 13), ort: '' };
  const weicht = P.planen({ termine: [mittag], aufgaben, einst, fahrzeit: () => 15, jetzt: um(DO, 0), vorher: erst.bloecke });
  assert.strictEqual(zeit(weicht.bloecke[0].start), '09:30');
});

test('Nicht nötig (basis) verschiebt die Fälligkeit, Dringlichkeit und Vorschläge', () => {
  assert.strictEqual(P.faelligAm({ intervall: 7, letzte: '2026-11-01', basis: '2026-11-10' }, '2026-11-12'), '2026-11-17');
  assert.strictEqual(P.faelligAm({ intervall: 7, letzte: '2026-11-11', basis: '2026-11-10' }, '2026-11-12'), '2026-11-18');
  assert.strictEqual(P.dringlichkeitText(P.dringlichkeit('2026-11-10', '2026-11-12')), 'fällig seit 2 Tagen');
  assert.strictEqual(P.dringlichkeitText(P.dringlichkeit('2026-11-12', '2026-11-12')), 'heute fällig');
  assert.strictEqual(P.dringlichkeitText(P.dringlichkeit('2026-11-15', '2026-11-12')), 'fällig in 3 Tagen');
  const einst = einstellungen();
  const aufgaben = [
    { id: 'bad', name: 'Bad putzen', intervall: 7, dauer: 30, pflicht: true, letzte: '2026-11-01' },      // überfällig, zu lang für 20 min
    { id: 'waesche', name: 'Wäsche waschen', intervall: 4, dauer: 15, pflicht: true, letzte: '2026-11-10' }, // fällig in 2 Tagen (vorziehbar)
    { id: 'saugen', name: 'Staubsaugen', intervall: 7, dauer: 20, pflicht: false, letzte: '2026-11-04' },  // seit gestern fällig
    { id: 'bett', name: 'Bettwäsche', intervall: 14, dauer: 15, pflicht: true, letzte: '2026-11-11' },     // noch lange nicht
    { id: 'spaeter', name: 'Später', intervall: 1, dauer: 10, pflicht: true, letzte: null, nichtVor: um(DO, 23).toISOString() },
  ];
  const v = P.vorschlaege({ aufgaben, minuten: 20, jetzt: um(DO, 18), regeln: einst.regeln });
  assert.deepStrictEqual(v.map(x => x.a.id), ['waesche', 'saugen']);
});
