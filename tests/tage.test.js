'use strict';
const test = require('node:test');
const assert = require('node:assert');
const D = require('../scripts/planer/core/datum');
const T = require('../scripts/planer/core/tage');
const S = require('../scripts/planer/core/schichten');
const P = require('../scripts/planer/core/planer');
const G = require('../scripts/planer/core/gedaechtnis');
const AK = require('../scripts/planer/core/aktion');
const { standardEinstellungen, standardAufgaben } = require('../scripts/planer/core/standard');

const woerter = standardEinstellungen().tage;
const tag = (t, h = 0, m = 0) => new Date(2026, 10, t, h, m);

test('Stichwörter in ganztägigen Terminen', () => {
  assert.strictEqual(T.artAusTitel('Urlaub', woerter), 'frei');
  assert.strictEqual(T.artAusTitel('Urlaubstag', woerter), 'frei');
  assert.strictEqual(T.artAusTitel('Frei', woerter), 'frei');
  assert.strictEqual(T.artAusTitel('Überstundenfrei', woerter), 'frei');
  assert.strictEqual(T.artAusTitel('Freizeitpark mit X', woerter), null);
  assert.strictEqual(T.artAusTitel('Krank', woerter), 'krank');
  assert.strictEqual(T.artAusTitel('Krankenhaus Besuch', woerter), null);
  assert.strictEqual(T.artAusTitel('Reise nach Y', woerter), 'weg');
  assert.strictEqual(T.artAusTitel('Geburtstag von Z', woerter), null);
});

test('Tagesinfo: frei, krank, verreist, heute keine Aufgaben', () => {
  const info = T.tagesInfo({
    ganztaegige: [
      { titel: 'Urlaub', start: tag(12), end: new Date(2026, 10, 13, 23, 59, 59) },   // 12.–13. (Ende 23:59:59)
      { titel: 'Krank', start: tag(16), end: tag(17) },                                // nur 16. (Ende 00:00 Folgetag)
      { titel: 'Elternabend', start: tag(18), end: tag(19) },
    ],
    ausnahmen: [{ von: '2026-11-20', bis: '2026-11-22', text: 'Kurztrip', art: 'weg' }, { von: '2026-11-25', bis: '2026-11-25', text: 'frei' }],
    woerter,
    keineAufgaben: '2026-11-14',
  });
  assert.deepStrictEqual(Object.keys(info).sort(), ['2026-11-12', '2026-11-13', '2026-11-14', '2026-11-16', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-25']);
  assert.deepStrictEqual([...T.freieTage(info)].sort(), ['2026-11-12', '2026-11-13', '2026-11-16', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-25']);
  assert.deepStrictEqual([...T.sperrTage(info)].sort(), ['2026-11-14', '2026-11-16', '2026-11-20', '2026-11-21', '2026-11-22']);
  assert.strictEqual(info['2026-11-16'].krank, true);
  assert.strictEqual(info['2026-11-21'].weg, true);
  assert.strictEqual(info['2026-11-12'].keineAufgaben, false); // Urlaub zuhause: Aufgaben ja
});

function sch() {
  const s = standardEinstellungen().schichten;
  s.referenzMontag = '2026-11-09';
  s.referenzTyp = 'A';
  return s;
}
const kurz = l => l.map(x => `${x.datum} ${D.hm(x.start)}-${D.hm(x.end)}`);

test('Schichten: freie Tage aus dem Kalender und einzelne Änderungen', () => {
  const s = sch();
  s.aenderungen = [{ datum: '2026-11-10', zeit: '07:00-17:30' }, { datum: '2026-11-11', zeit: null }, { datum: '2026-11-14', zeit: '09:00-12:00' }];
  const liste = S.schichtenErzeugen(tag(9), 7, s, { freieTage: new Set(['2026-11-12']) });
  assert.deepStrictEqual(kurz(liste), [
    '2026-11-09 07:00-16:00',
    '2026-11-10 07:00-17:30', // Überstunden
    // 11.: Änderung "frei", 12.: Urlaub im Kalender
    '2026-11-13 07:00-13:00',
    '2026-11-14 09:00-12:00', // Samstag ausnahmsweise
  ]);
});

test('Schicht-Abgleich: Handänderungen im Kalender bleiben', () => {
  const s = sch();
  const soll = S.schichtenErzeugen(tag(9), 5, s);
  const heute = '2026-11-09';
  const ev = (d, von, bis, extra) => ({ datum: `2026-11-${d}`, start: tag(d, ...von), end: tag(d, ...bis), ...extra });

  // 1) Erster Lauf: alles anlegen, aufschreiben
  let r = S.schichtAbgleich({ ist: [], soll, rec: {}, heute });
  assert.strictEqual(r.anlegen.length, 5);
  assert.strictEqual(r.rec['2026-11-09'], '07:00-16:00');
  const rec = r.rec;
  const kalender = soll.map(x => ({ ...x }));

  // 2) Unverändert: nichts tun
  r = S.schichtAbgleich({ ist: kalender, soll, rec, heute });
  assert.deepStrictEqual([r.anlegen.length, r.loeschen.length, r.hand.length], [0, 0, 0]);

  // 3) Dienstag von Hand verlängert, Mittwoch gelöscht, Donnerstag auf Samstag verschoben
  const ist = [
    kalender[0],
    ev(10, [7, 0], [18, 0]),
    ev(14, [7, 0], [16, 0]),
    kalender[4],
  ];
  r = S.schichtAbgleich({ ist, soll, rec, heute });
  assert.deepStrictEqual([r.anlegen.length, r.loeschen.length], [0, 0]);
  assert.deepStrictEqual(r.hand, ['2026-11-10', '2026-11-14']);

  // 4) Muster ändert sich (Freitag frei): eigener Termin wird gelöscht, Handänderungen bleiben
  const soll2 = soll.filter(x => x.datum !== '2026-11-13');
  r = S.schichtAbgleich({ ist, soll: soll2, rec, heute });
  assert.deepStrictEqual(r.loeschen.map(x => x.datum), ['2026-11-13']);
  assert.strictEqual(r.rec['2026-11-13'], undefined);

  // 5) Änderung aus der App geht vor Handänderung
  r = S.schichtAbgleich({ ist, soll, rec, heute, erzwingen: new Set(['2026-11-10']) });
  assert.deepStrictEqual(r.loeschen.map(x => x.datum), ['2026-11-10']);
  assert.deepStrictEqual(kurz(r.anlegen), ['2026-11-10 07:00-16:00']);

  // 6) Update von alter Version: markierte Termine ohne Aufzeichnung werden übernommen
  r = S.schichtAbgleich({ ist: kalender, soll, rec: {}, heute });
  assert.deepStrictEqual([r.anlegen.length, r.loeschen.length, Object.keys(r.rec).length], [0, 0, 5]);

  // 7) Kalender geleert: neu aufbauen statt "von Hand gelöscht"
  const soll3 = S.schichtenErzeugen(tag(9), 14, s);
  const rec3 = S.schichtAbgleich({ ist: [], soll: soll3, rec: {}, heute }).rec;
  r = S.schichtAbgleich({ ist: [], soll: soll3, rec: rec3, heute });
  assert.strictEqual(r.geleert, true);
  assert.strictEqual(r.anlegen.length, soll3.length);
});

test('Nicht nötig, Rückstand auflösen, Gedächtnis', () => {
  const jetzt = tag(12, 18, 20);
  const r = AK.aktionAnwenden(standardAufgaben().map(a => ({ ...a, letzte: '2026-11-01' })), { aktion: 'nichtnoetig', id: 'bad' }, jetzt);
  const bad = r.aufgaben.find(a => a.id === 'bad');
  assert.deepStrictEqual([bad.letzte, bad.basis], ['2026-11-01', '2026-11-12']);
  assert.strictEqual(P.faelligAm(bad, '2026-11-12'), '2026-11-19');

  const aufgaben = [
    { id: 'a', intervall: 7, dauer: 10, letzte: '2026-11-01' }, // überfällig
    { id: 'b', intervall: 7, dauer: 10, letzte: '2026-11-10' }, // nicht fällig
    { id: 'c', intervall: 7, dauer: 10, letzte: '2026-10-01', aktiv: false },
  ];
  const a2 = AK.rueckstandAufloesen(aufgaben, '2026-11-12', P.faelligAm);
  assert.strictEqual(a2.anzahl, 1);
  assert.deepStrictEqual(a2.aufgaben.map(a => a.basis || null), ['2026-11-12', null, null]);

  let g = G.eintragen(null, { typ: 'erledigt', id: 'bad' }, tag(12, 18));
  g = G.eintragen(g, { typ: 'spaeter', id: 'bad' }, tag(13, 18));
  assert.deepStrictEqual(g.ereignisse.map(e => e.typ), ['erledigt', 'spaeter']);
  const spaet = new Date(2028, 0, 1);
  assert.strictEqual(G.eintragen(g, { typ: 'x', id: 'y' }, spaet).ereignisse.length, 1); // Altes fällt weg
  const b = G.passenderBlock([{ aufgabeId: 'bad', start: tag(12, 18, 15) }, { aufgabeId: 'bad', start: tag(19, 9, 30) }], 'bad', jetzt);
  assert.strictEqual(new Date(b.start).getDate(), 12);
});
