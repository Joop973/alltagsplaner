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
// extra.freieTage: Set von "YYYY-MM-DD" (Urlaub, krank, verreist aus Kalender oder App)
// sch.aenderungen: [{datum, zeit: "08:00-17:30" | null}] einzelne Schicht ändern (null = frei), geht vor allem anderen
function schichtenErzeugen(von, tage, sch, extra) {
  const liste = [];
  if (!sch) return liste;
  const frei = (extra && extra.freieTage) || new Set();
  const aend = new Map((sch.aenderungen || []).map(a => [a.datum, a]));
  const start = D.tagesBeginn(von);
  for (let i = 0; i < tage; i++) {
    const tag = D.plusTage(start, i);
    const s = D.ymd(tag);
    const ae = aend.get(s);
    if (ae) {
      const z = zeitspanne(ae.zeit);
      if (z) liste.push({ datum: s, typ: 'geändert', start: D.mitUhrzeit(tag, z.von), end: D.mitUhrzeit(tag, z.bis) });
      continue;
    }
    if (frei.has(s)) continue;
    // Dienstplan aus der PDF geht vor dem Muster (null = frei laut Plan)
    const dp = sch.dienstplan && sch.dienstplan.tage;
    if (dp && Object.prototype.hasOwnProperty.call(dp, s)) {
      const z = zeitspanne(dp[s]);
      if (z) liste.push({ datum: s, typ: 'Dienstplan', start: D.mitUhrzeit(tag, z.von), end: D.mitUhrzeit(tag, z.bis) });
      continue;
    }
    if (!sch.referenzMontag) continue;
    if (F.freierTag(s, sch.extraFrei)) continue;
    if (ausnahmeAm(s, sch.ausnahmen)) continue;
    const typ = wochenTyp(tag, sch.referenzMontag, sch.referenzTyp);
    const z = zeitspanne((sch.zeiten[typ] || {})[String(tag.getDay())]);
    if (!z) continue;
    liste.push({ datum: s, typ, start: D.mitUhrzeit(tag, z.von), end: D.mitUhrzeit(tag, z.bis) });
  }
  return liste;
}

// Abgleich mit dem Kalender "Arbeit", der Änderungen von Hand respektiert.
// ist:  eigene (markierte) Termine [{datum, start, end, ...}]
// soll: [{datum, start, end}]
// rec:  {datum: "07:00-16:00"} – was der Planer zuletzt selbst geschrieben hat
// erzwingen: Set von Tagen mit einer Änderung aus der App (geht vor Handänderung im Kalender)
// Regeln je Tag:
//   Termin wie aufgeschrieben -> gehört dem Planer, wird bei Bedarf ersetzt oder gelöscht
//   Termin anders als aufgeschrieben (verschoben, Zeit geändert) -> von Hand geändert, bleibt
//   Termin fehlt, obwohl aufgeschrieben -> von Hand gelöscht, wird nicht neu angelegt
function schichtAbgleich({ ist, soll, rec, heute, erzwingen }) {
  const key = x => `${D.hm(new Date(x.start))}-${D.hm(new Date(x.end))}`;
  const recAlt = rec || {};
  const recTage = Object.keys(recAlt).filter(d => d >= heute);
  const fehlend = recTage.filter(d => !ist.some(x => x.datum === d));
  // Fehlen auf einmal fast alle eigenen Termine, wurde der Kalender geleert: neu aufbauen
  const geleert = fehlend.length >= 5 && fehlend.length > recTage.length / 2;
  const recLeer = geleert || Object.keys(recAlt).length === 0;
  const recNeu = {}, loeschen = [], anlegen = [], hand = [];
  const tage = new Set([...ist.map(x => x.datum), ...soll.map(x => x.datum), ...recTage]);
  for (const d of [...tage].sort()) {
    const istD = ist.filter(x => x.datum === d);
    const sollD = soll.find(x => x.datum === d) || null;
    const r = geleert ? undefined : recAlt[d];
    const zwang = !!(erzwingen && erzwingen.has(d));
    if (!istD.length) {
      if (r !== undefined && !zwang) { recNeu[d] = r; continue; } // von Hand gelöscht
      if (sollD) { anlegen.push(sollD); recNeu[d] = key(sollD); }
      continue;
    }
    const eigen = r === undefined ? recLeer : (istD.length === 1 && r === key(istD[0]));
    if (eigen || zwang) {
      if (sollD && istD.length === 1 && key(istD[0]) === key(sollD)) { recNeu[d] = key(sollD); continue; }
      loeschen.push(...istD);
      if (sollD) { anlegen.push(sollD); recNeu[d] = key(sollD); }
      continue;
    }
    hand.push(d); // von Hand geändert oder hierher verschoben: bleibt
    if (r !== undefined) recNeu[d] = r;
  }
  return { loeschen, anlegen, rec: recNeu, hand, geleert };
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

module.exports = { wochenTyp, ausnahmeAm, zeitspanne, schichtenErzeugen, schichtAbgleich, abgleich };
