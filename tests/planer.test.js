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

test('Freier Tag: Wäsche zweimal in 7 Tagen, höchstens 90 min pro Tag', () => {
  const einst = einstellungen();
  einst.regeln.vorziehenTage = 0;
  const aufgaben = standardAufgaben(); // alle heute fällig
  const plan = P.planen({ termine: [], aufgaben, einst, fahrzeit: () => 15, jetzt: um(DO, 0) });
  const proTag = {};
  for (const b of plan.bloecke) {
    const t = D.ymd(b.start);
    proTag[t] = (proTag[t] || 0) + (b.end - b.start) / 60000;
  }
  for (const m of Object.values(proTag)) assert.ok(m <= 90);
  const waesche = plan.bloecke.filter(b => b.aufgabeId === 'waesche').map(b => D.ymd(b.start));
  assert.deepStrictEqual(waesche, ['2026-11-12', '2026-11-16']);
  // Pflicht zuerst: am ersten Tag 08:00 Bad putzen
  assert.strictEqual(`${zeit(plan.bloecke[0].start)} ${plan.bloecke[0].name}`, '08:00 Bad putzen');
  // Fenster (60 min, wenn Zeit) passt am ersten Tag nicht mehr (30+15+15+20=80) -> nächster Tag
  const fenster = plan.bloecke.find(b => b.aufgabeId === 'fenster');
  assert.strictEqual(D.ymd(fenster.start), '2026-11-13');
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
