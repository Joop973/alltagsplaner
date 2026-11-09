// Scriptable: Aufgaben als Erinnerungen in der Liste "Planer" zum Abhaken.
// Beim Planen: abgehakte einlesen, dann alle eigenen löschen und für heute/morgen neu anlegen.
'use strict';

function hole(p) {
  try { return importModule('planer/' + p); } catch (e) { return importModule('../' + p); }
}
const D = hole('core/datum');

const MARKE = 'planer-aufgabe:';

async function liste(einst, log) {
  const name = einst.erinnerungen.liste;
  try {
    const l = (await Calendar.forReminders()).find(c => c.title === name);
    if (l) return l;
    return await Calendar.createForReminders(name);
  } catch (e) {
    await log(`WARNUNG Erinnerungen-Liste "${name}" nicht verfügbar: ${e}`);
    return null;
  }
}

function eigene(alle) { return alle.filter(r => (r.notes || '').includes(MARKE)); }

function aufgabeId(r) {
  const m = (r.notes || '').match(/planer-aufgabe:([^|\s]+)/);
  return m ? m[1] : null;
}

// -> [{id, datum}] aller abgehakten Planer-Erinnerungen
async function erledigteLesen(einst, log) {
  if (!einst.erinnerungen.an) return [];
  const l = await liste(einst, log);
  if (!l) return [];
  return eigene(await Reminder.all([l]))
    .filter(r => r.isCompleted)
    .map(r => ({ id: aufgabeId(r), datum: D.ymd(r.completionDate ? new Date(r.completionDate) : new Date()) }))
    .filter(x => x.id);
}

async function schreiben(einst, bloecke, jetzt, log) {
  if (!einst.erinnerungen.an) return;
  const l = await liste(einst, log);
  if (!l) return;
  let weg = 0;
  for (const r of eigene(await Reminder.all([l]))) { r.remove(); weg++; }
  const bis = D.plusTage(D.tagesBeginn(jetzt), einst.erinnerungen.tage || 2);
  let neu = 0;
  for (const b of bloecke) {
    const start = new Date(b.start);
    if (start >= bis) continue;
    const r = new Reminder();
    r.calendar = l;
    // ohne Fälligkeitsdatum: sonst kommt zusätzlich eine Erinnerungs-Mitteilung
    r.title = `${b.name} · ${D.kurz(start)} ${D.hm(start)}`;
    r.notes = `${MARKE}${b.aufgabeId}|${start.toISOString()}`;
    await r.save();
    neu++;
  }
  await log(`Erinnerungen: ${weg} alte entfernt, ${neu} neu.`);
}

module.exports = { erledigteLesen, schreiben };
