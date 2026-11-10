// Scriptable: Dienstplan-PDF einlesen, Vorschau zeigen, übernehmen, Schichten neu schreiben.
'use strict';

function hole(p) {
  try { return importModule('planer/' + p); } catch (e) { return importModule('../' + p); }
}
const D = hole('core/datum');
const DP = hole('core/dienstplan');
const DAT = hole('adapter/dateien');
const PDF = hole('adapter/pdf');
const PLAN = hole('adapter/planung');

const log = t => DAT.log(t);

async function frageText(titel, nachricht, wert) {
  const a = new Alert();
  a.title = titel;
  a.message = nachricht;
  a.addTextField('', wert || '');
  a.addAction('OK');
  a.addCancelAction('Abbrechen');
  if ((await a.presentAlert()) === -1) return null;
  return a.textFieldValue(0).trim();
}

async function info(titel, text) {
  const a = new Alert();
  a.title = titel;
  a.message = text;
  a.addAction('OK');
  await a.presentAlert();
}

function vorschau(r) {
  const z = Object.keys(r.tage).sort().map(d => `${D.kurz(D.ausYmd(d))}  ${r.tage[d] || 'frei'}`);
  return z.join('\n') + (r.hinweise.length ? `\n\nHinweise:\n${r.hinweise.join('\n')}` : '');
}

// pfad: Datei aus dem Teilen-Menü; ohne: Datei auswählen
async function importieren(pfad) {
  const { einst } = await PLAN.laden();
  if (!pfad) {
    const p = await DocumentPicker.open(['com.adobe.pdf']);
    if (!p || !p.length) return false;
    pfad = p[0];
  }
  let name = einst.dienstplan && einst.dienstplan.name;
  if (!name) {
    name = await frageText('Dein Name im Dienstplan', 'So, wie er in der ersten Spalte steht. Bleibt nur auf diesem iPhone.', '');
    if (!name) return false;
    einst.dienstplan = { ...(einst.dienstplan || {}), name };
    await PLAN.einstellungenSpeichern(einst);
  }
  await log(`Dienstplan einlesen: ${String(pfad).split('/').pop()}`);
  const items = await PDF.textStuecke(pfad, log);
  const r = DP.lesen(items, name, new Date());
  await log(`Dienstplan: ${Object.keys(r.tage).length} Tage erkannt${r.hinweise.length ? '; ' + r.hinweise.join('; ') : ''}`);
  if (!Object.keys(r.tage).length) {
    await info('Nichts erkannt', `${r.hinweise.join('\n')}\n\nStimmt der Name "${name}"? Änderbar unter Einstellungen → Dienstplan.`);
    return false;
  }
  const a = new Alert();
  a.title = `Dienstplan ${D.deutschDatum(r.von)} – ${D.deutschDatum(r.bis)}`;
  a.message = vorschau(r);
  a.addAction('Übernehmen');
  a.addCancelAction('Abbrechen');
  if ((await a.presentAlert()) === -1) return false;
  einst.schichten.dienstplan = DP.zusammenfuehren(einst.schichten.dienstplan, r, D.ymd(new Date()));
  await PLAN.einstellungenSpeichern(einst);
  await log('Dienstplan übernommen.');
  await PLAN.ohneKurzbefehl(); // Schichten schreiben und neu planen
  await info('Übernommen', 'Die Schichten stehen im Kalender "Arbeit". Danach gilt wieder das A/B-Muster. Für die Wecker einmal "Planer planen" starten.');
  return true;
}

module.exports = { importieren };
