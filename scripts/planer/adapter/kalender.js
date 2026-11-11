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

function ohneKalender(einst) {
  return new Set([einst.kalender.planer, einst.geburtstage.kalender, einst.muell.kalender, ...(einst.kalender.ignorieren || [])].filter(Boolean));
}

// Termine aller Kalender außer Planer und ignorierten; ohne ganztägige.
async function termineLesen(einst, jetzt) {
  const ohne = ohneKalender(einst);
  const kalender = (await Calendar.forEvents()).filter(c => !ohne.has(c.title));
  if (!kalender.length) return [];
  const von = D.plusTage(D.tagesBeginn(jetzt), -1);
  const bis = D.plusTage(D.tagesBeginn(jetzt), einst.regeln.tage);
  const ev = await CalendarEvent.between(von, bis, kalender);
  return ev
    .filter(e => !e.isAllDay)
    .map(e => ({ titel: e.title, start: e.startDate, end: e.endDate, ort: e.location || '', kalender: e.calendar.title }));
}

// Ganztägige Einträge (Urlaub, krank, verreist …) aller Kalender außer Planer/Geburtstage/Müll
async function ganztaegigeLesen(einst, jetzt, tage) {
  const ohne = ohneKalender(einst);
  const kalender = (await Calendar.forEvents()).filter(c => !ohne.has(c.title));
  if (!kalender.length) return [];
  const von = D.tagesBeginn(jetzt);
  const ev = await CalendarEvent.between(von, D.plusTage(von, tage), kalender);
  return ev.filter(e => e.isAllDay).map(e => ({ titel: e.title, start: e.startDate, end: e.endDate }));
}

// Abonnierter Abfallkalender (Option)
async function muellLesen(einst, jetzt) {
  if (!einst.muell.an || !einst.muell.kalender) return [];
  const cal = await finde(einst.muell.kalender);
  if (!cal) return [];
  const von = D.tagesBeginn(jetzt);
  const ev = await CalendarEvent.between(von, D.plusTage(von, 9), [cal]);
  return ev.map(e => ({ titel: e.title, start: e.startDate }));
}

// Schichten 8 Wochen voraus, ab heute (auch wenn die Schicht schon läuft).
// Von Hand geänderte, verschobene oder gelöschte Schicht-Termine bleiben, wie sie sind.
// extra: {freieTage: Set, rec: {datum: "07:00-16:00"}} -> neues rec
async function schichtenSchreiben(einst, jetzt, log, extra) {
  const sch = einst.schichten;
  const rec = (extra && extra.rec) || {};
  if (!sch.referenzMontag && !(sch.aenderungen || []).length && !(sch.dienstplan && sch.dienstplan.von)) { await log('Schichten: Woche A/B noch nicht festgelegt.'); return rec; }
  const cal = await finde(einst.kalender.arbeit);
  if (!cal) { await log(`Schichten: Kalender "${einst.kalender.arbeit}" fehlt.`); return rec; }
  const tage = (sch.wochen || 8) * 7;
  const heute = D.tagesBeginn(jetzt);
  const bis = D.plusTage(heute, tage);
  const soll = S.schichtenErzeugen(heute, tage, sch, { freieTage: (extra && extra.freieTage) || new Set() });
  const ist = (await CalendarEvent.between(heute, bis, [cal]))
    .filter(e => (e.notes || '').includes(MARKE_SCHICHT))
    .map(e => ({ ev: e, datum: D.ymd(e.startDate), start: e.startDate, end: e.endDate }));
  const erzwingen = new Set((sch.aenderungen || []).map(a => a.datum));
  const r = S.schichtAbgleich({ ist, soll, rec, heute: D.ymd(heute), erzwingen });
  for (const v of r.loeschen) v.ev.remove();
  const ort = einst.orte.arbeit.adresse || einst.orte.arbeit.name || 'Arbeit';
  for (const s of r.anlegen) {
    const e = new CalendarEvent();
    e.calendar = cal;
    e.title = einst.orte.arbeit.name || 'Arbeit';
    e.startDate = s.start;
    e.endDate = s.end;
    e.location = ort;
    e.notes = `${MARKE_SCHICHT} (${s.typ === 'geändert' || s.typ === 'Dienstplan' ? s.typ : 'Woche ' + s.typ}) – vom Planer. Du kannst den Termin hier ändern oder löschen, der Planer lässt ihn dann so.`;
    await e.save();
  }
  await log(`Schichten: ${r.anlegen.length} neu, ${r.loeschen.length} entfernt${r.hand.length ? `, ${r.hand.length} von Hand geändert (bleiben)` : ''}${r.geleert ? ', Kalender war leer: neu aufgebaut' : ''}.`);
  // vergangene Tage aus der Aufzeichnung entfernen
  const neu = {};
  for (const [d, v] of Object.entries(r.rec)) if (d >= D.ymd(heute)) neu[d] = v;
  return neu;
}

// Bestehende Planer-Blöcke lesen. fest = vom Nutzer im Kalender verschoben (oder früher schon fest).
async function planerBloeckeLesen(einst, jetzt) {
  const cal = await finde(einst.kalender.planer);
  if (!cal) return [];
  const ev = await CalendarEvent.between(D.plusTage(jetzt, -1), D.plusTage(jetzt, 60), [cal]);
  const liste = [];
  for (const e of ev) {
    const m = (e.notes || '').match(/planer-aufgabe:([^|\s]+)(?:\|([^|\s]+))?(\|fest)?/);
    if (!m || e.endDate <= jetzt) continue;
    const geplant = m[2] ? new Date(m[2]) : null;
    const verschoben = geplant && !isNaN(geplant) && Math.abs(geplant.getTime() - e.startDate.getTime()) > 60000;
    liste.push({ aufgabeId: m[1], start: e.startDate, end: e.endDate, fest: !!m[3] || !!verschoben });
  }
  return liste;
}

// Planer-Kalender: alle noch nicht beendeten Einträge löschen und neu schreiben, alte (vor heute) entfernen.
async function planerSchreiben(einst, plan, jetzt, log) {
  const cal = await finde(einst.kalender.planer);
  if (!cal) throw new Error(`Kalender "${einst.kalender.planer}" fehlt. Bitte in der Ersteinrichtung anlegen lassen.`);
  const alt = await CalendarEvent.between(D.plusTage(jetzt, -1), D.plusTage(jetzt, 400), [cal]);
  let geloescht = 0;
  for (const e of alt) {
    if (e.endDate > jetzt) { e.remove(); geloescht++; }
  }
  // Einträge von gestern und früher löschen (heutige bleiben bis Mitternacht sichtbar).
  // Nur eigene: Notiz enthält "planer-". Von Hand angelegte Einträge bleiben.
  const heute = D.tagesBeginn(jetzt);
  let vorbei = 0;
  for (const e of await CalendarEvent.between(D.plusTage(heute, -800), heute, [cal])) {
    if (e.endDate <= heute && (e.notes || '').includes(MARKE_PLANER)) { e.remove(); vorbei++; }
  }
  if (vorbei) await log(`Planer-Kalender: ${vorbei} alte Einträge (vor heute) gelöscht.`);
  let neu = 0;
  for (const b of plan.bloecke) {
    const e = new CalendarEvent();
    e.calendar = cal;
    e.title = b.name;
    e.startDate = new Date(b.start);
    e.endDate = new Date(b.end);
    const schritte = b.schritte && b.schritte.length ? `\n${b.schritte.map(x => '- ' + x).join('\n')}` : '';
    e.notes = `${MARKE_PLANER}aufgabe:${b.aufgabeId}|${new Date(b.start).toISOString()}${b.fest ? '|fest' : ''}\nVerschieben ist erlaubt: der Planer behält deine Zeit.${schritte}`;
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

// Geburtstage-Kalender (ganztägige Einträge) -> [{titel, datum}]
async function geburtstageLesen(einst, jetzt, tage) {
  const cal = await finde(einst.geburtstage.kalender);
  if (!cal) return [];
  const von = D.tagesBeginn(jetzt);
  const ev = await CalendarEvent.between(von, D.plusTage(von, tage), [cal]);
  return ev.map(e => ({ titel: e.title, datum: D.ymd(e.startDate) }));
}

module.exports = {
  geburtstageLesen, finde, fehlendeKalender, alleNamen, termineLesen, ganztaegigeLesen, muellLesen,
  schichtenSchreiben, planerBloeckeLesen, planerSchreiben,
};
