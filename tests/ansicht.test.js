'use strict';
const test = require('node:test');
const assert = require('node:assert');
const A = require('../scripts/planer/core/ansicht');

const um = (h, m = 0, t = 12) => new Date(2026, 10, t, h, m);
const iso = d => d.toISOString();
// Donnerstag: Arbeit 07–16 (Rad 15 min), Ergo 17:00–17:45 (Auto 15), Bad 18:15–18:45
const plan = {
  termine: [
    { titel: 'Arbeit', start: iso(um(7)), end: iso(um(16)), art: 'arbeit' },
    { titel: 'Ergo', start: iso(um(17)), end: iso(um(17, 45)), art: 'fremd' },
  ],
  fahrten: [
    { abfahrt: iso(um(6, 45)), ankunft: iso(um(7)), minuten: 15, vonArt: 'zuhause', nachArt: 'arbeit', zielName: 'Arbeit', modus: 'Fahrrad' },
    { abfahrt: iso(um(16)), ankunft: iso(um(16, 15)), minuten: 15, vonArt: 'arbeit', nachArt: 'zuhause', zielName: 'Zuhause', modus: 'Fahrrad' },
    { abfahrt: iso(um(16, 45)), ankunft: iso(um(17)), minuten: 15, vonArt: 'zuhause', nachArt: 'fremd', zielName: 'Ergo', modus: 'Auto' },
    { abfahrt: iso(um(17, 45)), ankunft: iso(um(18)), minuten: 15, vonArt: 'fremd', nachArt: 'zuhause', zielName: 'Zuhause', modus: 'Auto' },
  ],
  bloecke: [{ aufgabeId: 'bad', name: 'Bad putzen', start: iso(um(18, 15)), end: iso(um(18, 45)) }],
};

test('Abschnitte eines Tages mit Pause und Ruhe', () => {
  const s = A.segmente(plan, '2026-11-12', { pause: 15, ruhe: 30 });
  const kurz = s.map(x => `${x.start.getHours()}:${String(x.start.getMinutes()).padStart(2, '0')} ${x.art}`);
  assert.deepStrictEqual(kurz, [
    '6:15 ruhe', '6:45 fahrt', '7:00 arbeit', '16:00 fahrt', '16:15 ruhe', '16:15 pause', '16:45 fahrt',
    '17:00 termin', '17:45 fahrt', '18:00 pause', '18:15 aufgabe',
  ]);
  assert.strictEqual(s.find(x => x.art === 'fahrt').titel, 'Rad zu Arbeit');
});

test('Jetzt und danach: Restzeit schrumpft', () => {
  // während Bad putzen: 10 von 30 min vorbei
  let j = A.jetztUndDanach(plan, um(18, 25));
  assert.strictEqual(j.aktuell.titel, 'Bad putzen');
  assert.strictEqual(j.text, 'noch 20 min');
  assert.ok(Math.abs(j.anteil - 2 / 3) < 0.01);
  // in der Ruhe vor der Ergo-Fahrt: als Nächstes die Fahrt
  j = A.jetztUndDanach(plan, um(16, 30));
  assert.strictEqual(j.aktuell.art, 'ruhe');
  assert.strictEqual(j.naechstes.art, 'fahrt');
  assert.strictEqual(j.text, 'noch 15 min');
  // nach dem Bad: nichts mehr heute -> Ruhe vor der Arbeitsfahrt morgen? Plan hat morgen nichts
  j = A.jetztUndDanach(plan, um(19));
  assert.strictEqual(j.aktuell, null);
  assert.strictEqual(j.naechstes, null);
  // vor allem: Ruhe 6:15 kommt als Nächstes
  j = A.jetztUndDanach(plan, um(5, 45));
  assert.strictEqual(j.naechstes.art, 'ruhe');
  assert.strictEqual(j.text, 'in 30 min');
});

test('Nächste Punkte, Symbole, Farben, Texte', () => {
  const n = A.naechste(plan, um(16, 20), 3);
  assert.deepStrictEqual(n.map(x => `${x.zeit} ${x.titel}`), ['16:45 Auto zu Ergo', '17:00 Ergo', '17:45 Auto nach Hause']);
  assert.strictEqual(A.symbolFuer({ art: 'aufgabe', titel: 'Bad putzen' }), 'shower.fill');
  assert.strictEqual(A.symbolFuer({ art: 'aufgabe', titel: 'Wäsche waschen' }), 'washer.fill');
  assert.strictEqual(A.symbolFuer({ art: 'aufgabe', titel: 'Bettwäsche wechseln' }), 'bed.double.fill');
  assert.strictEqual(A.symbolFuer({ art: 'aufgabe', titel: 'Wäsche aufhängen' }), 'tshirt.fill');
  assert.strictEqual(A.symbolFuer({ art: 'fahrt', modus: 'Fahrrad' }), 'bicycle');
  assert.strictEqual(A.symbolFuer({ art: 'aufgabe', titel: 'Irgendwas' }), 'checkmark.circle');
  assert.match(A.farbeFuer('aufgabe'), /^#[0-9A-F]{6}$/);
  assert.strictEqual(A.dauerText(65), '1 Std. 5 min');
  assert.strictEqual(A.ohnePlatzText('Fenster putzen'), 'Noch ohne Platz: Fenster putzen');
  const f = A.tagesFenster(A.segmente(plan, '2026-11-12'), '2026-11-12');
  assert.strictEqual(f.von.getHours(), 6);
  assert.strictEqual(f.bis.getHours(), 22);
});

test('Heute geschafft zählt erledigte Aufgaben', () => {
  const ged = { ereignisse: [
    { t: iso(um(9)), typ: 'erledigt', id: 'bad' },
    { t: iso(um(10)), typ: 'spaeter', id: 'saugen' },
    { t: iso(um(11)), typ: 'folge', id: 'waesche' },
    { t: iso(um(11, 0, 11)), typ: 'erledigt', id: 'x' },
  ] };
  assert.strictEqual(A.geschafftAm(ged, '2026-11-12'), 2);
});
