// Schichten im Zweiwochen-Wechsel (Woche A / B) erzeugen und mit dem Kalender abgleichen.
'use strict';

function hole(n) {
  if (typeof require === 'function') return require('./' + n);
  try { return importModule('planer/core/' + n); } catch (e) { return importModule(n); }
}
const D = hole('datum');
const F = hole('feiertage');

// Welche Woche (A/B) gilt am Datum? referenzMontag = Montag einer Woche mit Typ referenzTyp.
function wochenTyp(datum, referenzMontag, referenzTyp) {
  const wochen = Math.floor(D.tageZwischen(D.ausYmd(referenzMontag), D.montagVon(datum)) / 7);
  const gerade = ((wochen % 2) + 2) % 2 === 0;
  if (gerade) return referenzTyp;
  return referenzTyp === 'A' ? 'B' : 'A';
}

// Liegt der Tag in einer Ausnahme (Urlaub usw.)? ausnahmen: [{von, bis, text}]
function ausnahmeAm(datumYmd, ausnahmen) {
  return (ausnahmen || []).find(a => a.von <= datumYmd && datumYmd <= (a.bis || a.von)) || null;
}

// "07:00-16:00" -> {von:"07:00", bis:"16:00"} oder null
function zeitspanne(s) {
  const m = String(s || '').match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
  return m ? { von: m[1], bis: m[2] } : null;
}

// Schichten ab Tag von "von" für "tage" Tage. sch = einstellungen.schichten
function schichtenErzeugen(von, tage, sch) {
  const liste = [];
  if (!sch || !sch.referenzMontag) return liste;
  const start = D.tagesBeginn(von);
  for (let i = 0; i < tage; i++) {
    const tag = D.plusTage(start, i);
    const s = D.ymd(tag);
    if (F.freierTag(s, sch.extraFrei)) continue;
    if (ausnahmeAm(s, sch.ausnahmen)) continue;
    const typ = wochenTyp(tag, sch.referenzMontag, sch.referenzTyp);
    const z = zeitspanne((sch.zeiten[typ] || {})[String(tag.getDay())]);
    if (!z) continue;
    liste.push({ datum: s, typ, start: D.mitUhrzeit(tag, z.von), end: D.mitUhrzeit(tag, z.bis) });
  }
  return liste;
}

// vorhanden: [{id, start, end}], soll: [{start, end}] -> was löschen, was anlegen
function abgleich(vorhanden, soll) {
  const schl = x => `${new Date(x.start).getTime()}-${new Date(x.end).getTime()}`;
  const sollSchl = new Set(soll.map(schl));
  const vorhSchl = new Set(vorhanden.map(schl));
  return {
    loeschen: vorhanden.filter(v => !sollSchl.has(schl(v))),
    anlegen: soll.filter(s => !vorhSchl.has(schl(s))),
  };
}

module.exports = { wochenTyp, ausnahmeAm, zeitspanne, schichtenErzeugen, abgleich };
