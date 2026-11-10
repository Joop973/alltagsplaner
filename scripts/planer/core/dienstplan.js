// Dienstplan aus einer PDF lesen. Eingabe: Textstücke mit Position (aus pdf.js), Ausgabe: Schichten je Tag.
//
// Aufbau der Tabelle (siehe CLAUDE.md): Spalten = Werktage mit Datum ("2.11"), je Person bis zu 4 Zeilen
// (Beginn, Pause von, Pause bis, Ende; ohne Pause nur Beginn + Ende). Leere Zelle (farbig) = frei.
// Wochensummen ("40,00") und Stundenangaben ("39/7,8") sind keine Uhrzeiten und werden übergangen.
'use strict';

function hole(n) {
  if (typeof require === 'function') return require('./' + n);
  try { return importModule('planer/core/' + n); } catch (e) { return importModule(n); }
}
const D = hole('datum');

const MONATE = ['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];

function norm(s) { return String(s || '').trim().toLowerCase(); }
function mitte(it) { return it.x + (it.w || 0) / 2; }

// Jahr und Monat aus dem Titel ("Dienstplan November 2026"); sonst aus "heute"
function bezug(items, heute) {
  let jahr = null, monat = null;
  for (const it of items) {
    const t = norm(it.s);
    const j = t.match(/\b(20\d\d)\b/);
    if (j && !jahr) jahr = Number(j[1]);
    const m = MONATE.findIndex(n => t.includes(n));
    if (m >= 0 && monat == null) monat = m + 1;
  }
  return { jahr: jahr || heute.getFullYear(), monat: monat || heute.getMonth() + 1 };
}

// "2.11" / "26.10." -> Datum; Jahr so wählen, dass es nahe am Titelmonat liegt
function datumAus(text, b) {
  const m = String(text).trim().match(/^(\d{1,2})\.(\d{1,2})\.?$/);
  if (!m) return null;
  const tag = Number(m[1]), mon = Number(m[2]);
  if (tag < 1 || tag > 31 || mon < 1 || mon > 12) return null;
  let jahr = b.jahr;
  if (mon - b.monat > 6) jahr--;
  if (b.monat - mon > 6) jahr++;
  const d = new Date(jahr, mon - 1, tag);
  return d.getMonth() === mon - 1 ? D.ymd(d) : null;
}

const UHRZEIT = /^([01]?\d|2[0-3]):([0-5]\d)$/;

// items: [{s, x, y, w, seite}] – y wie in PDF: größer = weiter oben
// -> {tage: {datum: "07:00-16:00" | null}, von, bis, hinweise: []}
function lesen(items, name, heute) {
  const hinweise = [];
  const b = bezug(items, heute || new Date());
  const ergebnis = { tage: {}, von: null, bis: null, hinweise };
  const seiten = [...new Set(items.map(i => i.seite || 1))];
  for (const seite of seiten) {
    const auf = items.filter(i => (i.seite || 1) === seite && String(i.s).trim());
    // Datumsspalten: Kopfzeile mit Datumsangaben
    const spalten = auf.map(i => ({ datum: datumAus(i.s, b), x: mitte(i), y: i.y })).filter(i => i.datum);
    if (spalten.length < 3) continue;
    spalten.sort((p, q) => p.x - q.x);
    const kopfY = Math.min(...spalten.map(s2 => s2.y));
    const abstand = Math.min(...spalten.slice(1).map((s2, i) => s2.x - spalten[i].x).filter(d => d > 1));
    // Zeile der Person
    const person = auf.find(i => norm(i.s) === norm(name) && i.y < kopfY);
    if (!person) continue;
    const ersteSpalte = spalten[0].x - abstand / 2;
    // Namen in der ersten Spalte unterhalb: Ende des eigenen Blocks
    const namen = auf.filter(i => mitte(i) < ersteSpalte && /^[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß .-]*$/.test(String(i.s).trim()) && i.y < person.y - 1)
      .sort((p, q) => q.y - p.y);
    // Namen stehen etwa auf Höhe der ersten Uhrzeit ihrer Zeile (leicht versetzt): halbe Zeilenhöhe Spielraum
    const alleZeiten = auf.filter(i => UHRZEIT.test(String(i.s).trim()));
    const ys = [...new Set(alleZeiten.map(i => Math.round(i.y)))].sort((p, q) => q - p);
    const schritte = ys.slice(1).map((y, i) => ys[i] - y).filter(d => d > 2).sort((p, q) => p - q);
    const zeile = schritte.length ? schritte[Math.floor(schritte.length / 2)] : 10;
    const unten = namen.length ? namen[0].y + zeile / 2 : -Infinity;
    const oben = person.y + zeile / 2;
    const zeiten = alleZeiten.filter(i => i.y <= oben && i.y > unten);
    for (const sp of spalten) {
      const inSpalte = zeiten.filter(z => Math.abs(mitte(z) - sp.x) < abstand / 2).sort((p, q) => q.y - p.y);
      if (!inSpalte.length) { ergebnis.tage[sp.datum] = null; continue; }
      if (inSpalte.length === 1) {
        hinweise.push(`${D.deutschDatum(sp.datum)}: nur eine Uhrzeit (${inSpalte[0].s}) – übersprungen`);
        continue;
      }
      const von = String(inSpalte[0].s).trim().padStart(5, '0');
      const bis = String(inSpalte[inSpalte.length - 1].s).trim().padStart(5, '0');
      if (bis <= von) { hinweise.push(`${D.deutschDatum(sp.datum)}: Ende vor Beginn – übersprungen`); continue; }
      ergebnis.tage[sp.datum] = `${von}-${bis}`;
    }
  }
  const tage = Object.keys(ergebnis.tage).sort();
  if (!tage.length) hinweise.push(`Name "${name}" oder Datumsspalten nicht gefunden.`);
  ergebnis.von = tage[0] || null;
  ergebnis.bis = tage[tage.length - 1] || null;
  return ergebnis;
}

// Neuen Dienstplan mit dem gespeicherten zusammenführen (neuere PDF gewinnt für ihre Tage)
function zusammenfuehren(alt, neu, heuteYmd) {
  const tage = { ...((alt && alt.tage) || {}), ...neu.tage };
  // Vergangenes älter als 14 Tage weg
  const grenze = D.ymd(D.plusTage(D.ausYmd(heuteYmd), -14));
  for (const d of Object.keys(tage)) if (d < grenze) delete tage[d];
  const liste = Object.keys(tage).sort();
  return { tage, von: liste[0] || null, bis: liste[liste.length - 1] || null, importiert: heuteYmd };
}

module.exports = { bezug, datumAus, lesen, zusammenfuehren };
