// Scriptable: Kalender lesen, Schichten in "Arbeit" und Blöcke in "Planer" schreiben.
'use strict';

function hole(p) {
  try { return importModule('planer/' + p); } catch (e) { return importModule('../' + p); }
}
const D = hole('core/datum');
const S = hole('core/schichten');

const MARKE_SCHICHT = 'planer-schicht';
const MARKE_PLANER = 'planer-';

async function finde(titel) {
  const alle = await Calendar.forEvents();
  return alle.find(c => c.title === titel) || null;
}

async function fehlendeKalender(einst) {
  const fehlt = [];
  for (const t of [einst.kalender.planer, einst.kalender.arbeit]) {
    if (!(await finde(t))) fehlt.push(t);
  }
  return fehlt;
}

async function alleNamen() { return (await Calendar.forEvents()).map(c => c.title); }

// Termine aller Kalender außer Planer und ignorierten; ohne ganztägige.
async function termineLesen(einst, jetzt) {
  const ohne = new Set([einst.kalender.planer, ...(einst.kalender.ignorieren || [])]);
  const kalender = (await Calendar.forEvents()).filter(c => !ohne.has(c.title));
  if (!kalender.length) return [];
  const von = D.plusTage(D.tagesBeginn(jetzt), -1);
  const bis = D.plusTage(D.tagesBeginn(jetzt), einst.regeln.tage);
  const ev = await CalendarEvent.between(von, bis, kalender);
  return ev
    .filter(e => !e.isAllDay)
    .map(e => ({ titel: e.title, start: e.startDate, end: e.endDate, ort: e.location || '', kalender: e.calendar.title }));
}

// Schichten 8 Wochen voraus. Nur selbst angelegte (markierte) Einträge werden geändert.
async function schichtenSchreiben(einst, jetzt, log) {
  const sch = einst.schichten;
  if (!sch.referenzMontag) { await log('Schichten: Woche A/B noch nicht festgelegt.'); return; }
  const cal = await finde(einst.kalender.arbeit);
  if (!cal) { await log(`Schichten: Kalender "${einst.kalender.arbeit}" fehlt.`); return; }
  const tage = (sch.wochen || 8) * 7;
  const bis = D.plusTage(D.tagesBeginn(jetzt), tage);
  const soll = S.schichtenErzeugen(jetzt, tage, sch).filter(s => s.start >= jetzt);
  const vorhanden = (await CalendarEvent.between(jetzt, bis, [cal]))
    .filter(e => (e.notes || '').includes(MARKE_SCHICHT) && e.startDate >= jetzt)
    .map(e => ({ ev: e, start: e.startDate, end: e.endDate }));
  const { loeschen, anlegen } = S.abgleich(vorhanden, soll);
  for (const v of loeschen) v.ev.remove();
  const ort = einst.orte.arbeit.adresse || einst.orte.arbeit.name || 'Arbeit';
  for (const s of anlegen) {
    const e = new CalendarEvent();
    e.calendar = cal;
    e.title = einst.orte.arbeit.name || 'Arbeit';
    e.startDate = s.start;
    e.endDate = s.end;
    e.location = ort;
    e.notes = `${MARKE_SCHICHT} (Woche ${s.typ}) – automatisch vom Planer. Änderungen bitte über Urlaub/Ausnahmen in der App.`;
    await e.save();
  }
  await log(`Schichten: ${anlegen.length} neu, ${loeschen.length} entfernt.`);
}

// Planer-Kalender: alle noch nicht beendeten Einträge löschen und neu schreiben.
async function planerSchreiben(einst, plan, jetzt, log) {
  const cal = await finde(einst.kalender.planer);
  if (!cal) throw new Error(`Kalender "${einst.kalender.planer}" fehlt. Bitte in der Ersteinrichtung anlegen lassen.`);
  const alt = await CalendarEvent.between(D.plusTage(jetzt, -1), D.plusTage(jetzt, 400), [cal]);
  let geloescht = 0;
  for (const e of alt) {
    if (e.endDate > jetzt) { e.remove(); geloescht++; }
  }
  let neu = 0;
  for (const b of plan.bloecke) {
    const e = new CalendarEvent();
    e.calendar = cal;
    e.title = b.name;
    e.startDate = new Date(b.start);
    e.endDate = new Date(b.end);
    e.notes = `${MARKE_PLANER}aufgabe:${b.aufgabeId}`;
    await e.save();
    neu++;
  }
  for (const f of (einst.kalender.fahrtenEintragen ? plan.ablauf.fahrten : [])) {
    if (new Date(f.ankunft) <= jetzt || f.minuten <= 0) continue;
    const e = new CalendarEvent();
    e.calendar = cal;
    e.title = (f.nachArt === 'zuhause' ? 'Fahrt nach Hause' : `Fahrt zu ${f.zielName}`) + ` (${f.modus})`;
    e.startDate = new Date(f.abfahrt);
    e.endDate = new Date(f.ankunft);
    e.notes = `${MARKE_PLANER}fahrt${f.geschaetzt ? ' (Fahrzeit geschätzt)' : ''}`;
    await e.save();
    neu++;
  }
  await log(`Planer-Kalender: ${geloescht} gelöscht, ${neu} geschrieben.`);
}

module.exports = { finde, fehlendeKalender, alleNamen, termineLesen, schichtenSchreiben, planerSchreiben };
