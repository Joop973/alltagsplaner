'use strict';
const test = require('node:test');
const assert = require('node:assert');
const SP = require('../scripts/planer/core/sprache');
const { standardAufgaben } = require('../scripts/planer/core/standard');

const heute = new Date(2026, 10, 12, 9); // Donnerstag
const k = { heute, aufgaben: standardAufgaben(), meds: [{ id: 'm1', name: 'Ibuprofen' }] };
const eins = satz => { const r = SP.verstehen(satz, k); return r.absichten.map(a => a.beschreibung).join(' | '); };

test('Datum, Uhrzeit, Dauer', () => {
  assert.strictEqual(SP.datumAus('morgen', heute).datum, '2026-11-13');
  assert.strictEqual(SP.datumAus('übermorgen', heute).datum, '2026-11-14');
  assert.strictEqual(SP.datumAus('am Dienstag', heute).datum, '2026-11-17');
  assert.strictEqual(SP.datumAus('Donnerstag', heute).datum, '2026-11-19');
  assert.strictEqual(SP.datumAus('nächsten Montag', heute).datum, '2026-11-16');
  assert.strictEqual(SP.datumAus('am 3.12.', heute).datum, '2026-12-03');
  assert.strictEqual(SP.datumAus('am 3.1.', heute).datum, '2027-01-03');
  assert.strictEqual(SP.datumAus('am 5. März', heute).datum, '2027-03-05');
  assert.strictEqual(SP.datumAus('in 3 Tagen', heute).datum, '2026-11-15');
  assert.strictEqual(SP.datumAus('in zwei Wochen', heute).datum, '2026-11-26');
  assert.strictEqual(SP.zeitAus('um 10 Uhr').zeit, '10:00');
  assert.strictEqual(SP.zeitAus('10:30').zeit, '10:30');
  assert.strictEqual(SP.zeitAus('15 Uhr 45').zeit, '15:45');
  assert.strictEqual(SP.zeitAus('um halb 3').zeit, '02:30');
  assert.strictEqual(SP.dauerAus('für 2 Stunden').min, 120);
  assert.strictEqual(SP.dauerAus('45 Minuten').min, 45);
});

test('Regeln ohne KI', () => {
  assert.strictEqual(eins('Bad putzen erledigt'), '"Bad putzen" als erledigt markieren');
  assert.strictEqual(eins('Ich habe die Wäsche gewaschen'), '"Wäsche waschen" als erledigt markieren');
  assert.strictEqual(eins('Staubsaugen nicht nötig'), '"Staubsaugen" nicht nötig (Abstand neu ab heute)');
  assert.strictEqual(eins('Fenster heute nicht'), '"Fenster putzen" heute nicht');
  assert.strictEqual(eins('Einkaufen Milch, Brot und Eier'), 'Auf die Einkaufsliste: Milch, Brot, Eier');
  assert.strictEqual(eins('Zahnpasta auf die Einkaufsliste'), 'Auf die Einkaufsliste: Zahnpasta');
  assert.strictEqual(eins('Termin Arzt Dienstag 10 Uhr in Musterstadt'), 'Termin "Arzt" am Di 17.11. um 10:00 (60 min) in Musterstadt');
  assert.strictEqual(eins('Treffen mit Max morgen um 18:30 für 2 Stunden'), 'Termin "Treffen mit Max" am Fr 13.11. um 18:30 (120 min)');
  assert.strictEqual(eins('Friseur am 3.12. um 15 Uhr'), 'Termin "Friseur" am Do 03.12. um 15:00 (60 min)');
  assert.strictEqual(eins('Neue Aufgabe Pflanzen gießen alle 3 Tage 10 Minuten'), 'Neue Aufgabe "Pflanzen gießen" alle 3 Tage, 10 min');
  assert.strictEqual(eins('Ich bin krank'), 'Krank am Do 12.11.');
  assert.strictEqual(eins('Urlaub vom 1.12. bis 5.12.'), 'Frei vom Di 01.12. bis Sa 05.12.');
  assert.strictEqual(eins('Heute keine Aufgaben'), 'Heute keine Aufgaben');
  assert.strictEqual(eins('Frist TÜV am 20.12.'), 'Frist "TÜV" am So 20.12.');
  assert.strictEqual(eins('Geburtstag von Oma am 5. März'), 'Geburtstag von Oma am 05.03.');
  assert.strictEqual(eins('Ibuprofen genommen'), 'Ibuprofen genommen');
  assert.match(eins('Blabla Wetter'), /Nicht verstanden/);
  assert.match(eins('Kochen erledigt'), /Keine Aufgabe "kochen"/);
});

test('Claude-Antwort: JSON in Text, Datum rechnet Scriptable', () => {
  const eingang = 'DIKTAT: Morgen um zehn zum Zahnarzt nach Musterdorf und Milch kaufen\nCLAUDE: Hier ist das JSON:\n```json\n{"aktionen":[{"aktion":"termin","titel":"zahnarzt","datum":"morgen","uhrzeit":"10:00","ort":"Musterdorf"},{"aktion":"einkauf","sachen":["milch"]}]}\n```';
  const r = SP.verstehen(eingang, k);
  assert.strictEqual(r.quelle, 'claude');
  assert.deepStrictEqual(r.absichten.map(a => a.beschreibung), ['Termin "Zahnarzt" am Fr 13.11. um 10:00 (60 min) in Musterdorf', 'Auf die Einkaufsliste: Milch']);
  // unbrauchbare Claude-Antwort -> Regeln mit dem Diktat
  const r2 = SP.verstehen('DIKTAT: Bad putzen erledigt\nCLAUDE: Das kann ich leider nicht.', k);
  assert.deepStrictEqual([r2.quelle, r2.absichten[0].beschreibung], ['regeln', '"Bad putzen" als erledigt markieren']);
  // nur Diktat (Kurzbefehl ohne Claude)
  assert.strictEqual(SP.verstehen('DIKTAT: Staubsaugen später', k).absichten[0].beschreibung, '"Staubsaugen" später');
  assert.strictEqual(SP.verstehen('{"aktion":"abwesend","art":"weg","datum":"1.12.","bis":"3.12."}', k).absichten[0].beschreibung, 'Abwesend vom Di 01.12. bis Do 03.12.');
  assert.match(SP.CLAUDE_ANWEISUNG, /NUR mit JSON/);
});
