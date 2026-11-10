// Scriptable: Geburtstage, Fristen, Checklisten, Blumen vor dem Planen zusammentragen.
// Dateien in planer-daten/: geburtstage.json, fristen.json, checklisten.json, blumen.json, sonderstatus.json
'use strict';

function hole(p) {
  try { return importModule('planer/' + p); } catch (e) { return importModule('../' + p); }
}
const D = hole('core/datum');
const S = hole('core/standard');
const SO = hole('core/sonder');
const DAT = hole('adapter/dateien');
const KAL = hole('adapter/kalender');
const ERI = hole('adapter/erinnerungen');

async function geburtstageLaden() { return DAT.lesen('geburtstage.json', { eigene: [], geschenke: {} }); }
async function fristenLaden() { return DAT.lesen('fristen.json', []); }
async function checklistenLaden() { return (await DAT.lesen('checklisten.json', null)) || S.standardChecklisten(); }
async function blumenLaden() { return S.zusammenfuehren(S.standardBlumen(), await DAT.lesen('blumen.json', {})); }
async function statusLaden() { return DAT.lesen('sonderstatus.json', SO.leererStatus()); }

async function speichern(name, daten) { await DAT.schreiben(name, daten); }

// Ist die Aufgaben-ID eine Sonderaufgabe?
function istSonder(id) { return /^(geschenk|frist|blumen|einkauf|apotheke)-/.test(String(id || '')); }

// Knopf (Mitteilung / Tagesplan) für eine Sonderaufgabe
async function aktion(q, jetzt) {
  const st = SO.aktionAufStatus(await statusLaden(), q, jetzt);
  await speichern('sonderstatus.json', st);
  return `${q.aktion}: ${q.id}`;
}

// In der Erinnerungen-App abgehakt: [{id, datum}]
async function erledigtMelden(liste) {
  if (!liste.length) return;
  const st = await statusLaden();
  for (const e of liste) st.erledigt[e.id] = st.erledigt[e.id] || e.datum;
  await speichern('sonderstatus.json', st);
}

// -> {aufgaben, mitteilungen, checklisten}
async function vorbereiten(einst, jetzt, log) {
  const heute = D.ymd(jetzt);

  // Abgehakte Fristen aus der Erinnerungen-App übernehmen, dann Fristen weiterschieben
  let status = await statusLaden();
  for (const e of await ERI.fristenErledigteLesen(einst, log)) status.erledigt[e.id] = status.erledigt[e.id] || e.datum;
  const fw = SO.fristenFortschreiben(await fristenLaden(), status);
  for (const m of fw.meldungen) await log(m);
  if (fw.meldungen.length) await speichern('fristen.json', fw.fristen);
  status = SO.statusAufraeumen(status, heute);
  await speichern('sonderstatus.json', status);

  // Geburtstage: Kalender + eigene, 60 Tage voraus
  const geb = await geburtstageLaden();
  const kal = await KAL.geburtstageLesen(einst, jetzt, 60);
  const liste = SO.geburtstagsListe(kal, geb.eigene, heute, 60);

  // Blumen
  const bl = SO.blumenPlanen(await blumenLaden(), status, heute, Math.random);
  if (bl.cfg && bl.cfg.naechste !== (await blumenLaden()).naechste) await speichern('blumen.json', bl.cfg);

  const aufgaben = SO.statusAnwenden([
    ...SO.geburtstagsAufgaben(liste, geb.geschenke, einst.geburtstage, heute),
    ...SO.fristAufgaben(fw.fristen, heute),
    ...bl.aufgaben,
  ], status, jetzt);

  const mitteilungen = [
    // Gratulieren nur 8 Tage voraus (Platz für Mitteilungen ist begrenzt), Geschenk-Erinnerungen immer
    ...SO.geburtstagsMitteilungen(liste, geb.geschenke, status, einst.geburtstage)
      .filter(m => !m.id.startsWith('planer-geb-') || m.zeit <= D.plusTage(jetzt, 8)),
    ...SO.fristMitteilungen(fw.fristen, status, einst.fristen),
  ];

  await ERI.fristenSchreiben(einst, fw.fristen, SO.fristAufgabeId, log);
  await log(`Extras: ${liste.length} Geburtstage (60 Tage), ${fw.fristen.length} Fristen, ${aufgaben.length} Sonderaufgaben.`);
  return { aufgaben, mitteilungen, checklisten: await checklistenLaden() };
}

module.exports = {
  istSonder, aktion, erledigtMelden, vorbereiten,
  geburtstageLaden, fristenLaden, checklistenLaden, blumenLaden, statusLaden, speichern,
};
