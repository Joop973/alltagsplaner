// Scriptable: Gesprochenes/Getipptes verstehen, zurückfragen, ausführen, neu planen.
'use strict';

function hole(p) {
  try { return importModule('planer/' + p); } catch (e) { return importModule('../' + p); }
}
const D = hole('core/datum');
const SP = hole('core/sprache');
const DAT = hole('adapter/dateien');
const KAL = hole('adapter/kalender');
const ERI = hole('adapter/erinnerungen');
const SON = hole('adapter/sonder');
const PLAN = hole('adapter/planung');

const log = t => DAT.log(t);
const BEISPIELE = 'Beispiele:\n- Bad putzen erledigt\n- Staubsaugen nicht nötig\n- Milch und Brot auf die Einkaufsliste\n- Termin Arzt Dienstag 10 Uhr in Musterstadt\n- Training morgen erst um 20 Uhr\n- Arzt von Dienstag auf Donnerstag 11 Uhr verschieben\n- Ich bin krank\n- Urlaub vom 1.12. bis 5.12.\n- Neue Aufgabe Pflanzen gießen alle 3 Tage\n- Frist TÜV am 20.12.';

async function info(titel, text) {
  const a = new Alert();
  a.title = titel;
  a.message = text;
  a.addAction('OK');
  await a.presentAlert();
}

async function kalenderWaehlen(einst) {
  if (einst.sprache && einst.sprache.kalender && await KAL.finde(einst.sprache.kalender)) return KAL.finde(einst.sprache.kalender);
  const ohne = new Set([einst.kalender.planer, einst.kalender.arbeit, einst.geburtstage.kalender, einst.muell.kalender].filter(Boolean));
  const namen = (await KAL.alleNamen()).filter(n => !ohne.has(n));
  if (!namen.length) throw new Error('Kein Kalender für neue Termine gefunden.');
  const a = new Alert();
  a.title = 'In welchen Kalender?';
  a.message = 'Neue Termine per Sprache landen künftig dort (änderbar in den Einstellungen).';
  for (const n of namen) a.addAction(n);
  a.addCancelAction('Abbrechen');
  const i = await a.presentSheet();
  if (i === -1) return null;
  einst.sprache = { ...(einst.sprache || {}), kalender: namen[i] };
  await PLAN.einstellungenSpeichern(einst);
  return KAL.finde(namen[i]);
}

async function ausfuehren(a) {
  const jetzt = new Date();
  const { einst, aufgaben } = await PLAN.laden();
  switch (a.aktion) {
    case 'erledigt': case 'spaeter': case 'heutenicht': case 'nichtnoetig':
      await PLAN.aktion({ aktion: a.aktion, id: a.id }, { ohneNeuplanen: true });
      return;
    case 'genommen': {
      const med = (await PLAN.medsLaden()).find(m => m.id === a.id);
      const heute = D.ymd(jetzt);
      const zeiten = (med.zeiten || []).slice().sort();
      const passend = zeiten.filter(z => D.mitUhrzeit(jetzt, z) <= D.plusMin(jetzt, 60)).pop() || zeiten[0];
      await PLAN.aktion({ aktion: 'med', k: `${med.id}|${heute}|${passend}` }, { ohneNeuplanen: true });
      return;
    }
    case 'einkauf':
      for (const x of a.sachen) await ERI.einkaufHinzufuegen(einst, x, log);
      return;
    case 'termin': {
      const cal = await kalenderWaehlen(einst);
      if (!cal) return;
      const e = new CalendarEvent();
      e.calendar = cal;
      e.title = a.titel;
      if (a.uhrzeit) {
        e.startDate = D.mitUhrzeit(D.ausYmd(a.datum), a.uhrzeit);
        e.endDate = D.plusMin(e.startDate, a.dauer || 60);
      } else {
        e.isAllDay = true;
        e.startDate = D.ausYmd(a.datum);
        e.endDate = D.plusTage(D.ausYmd(a.datum), 1);
      }
      if (a.ort) e.location = a.ort;
      await e.save();
      return;
    }
    case 'aendern': {
      const e = a.ereignis;
      if (!e) return;
      e.startDate = new Date(a.neuStart);
      e.endDate = new Date(a.neuEnde);
      e.isAllDay = !!a.ganztag;
      if (a.ort) e.location = a.ort;
      await e.save();
      await log(`Sprache: Termin geändert: ${a.beschreibung}`);
      return;
    }
    case 'aufgabe':
      aufgaben.push({ id: `a${Date.now().toString(36)}`, name: a.name, intervall: a.intervall, dauer: a.dauer, pflicht: true, letzte: null, aktiv: true });
      await PLAN.aufgabenSpeichern(aufgaben);
      return;
    case 'abwesend':
      einst.schichten.ausnahmen.push({ von: a.von, bis: a.bis, art: a.art, text: 'per Sprache' });
      await PLAN.einstellungenSpeichern(einst);
      return;
    case 'keineaufgaben':
      await PLAN.heuteKeineAufgaben(true);
      return;
    case 'frist': {
      const fristen = await SON.fristenLaden();
      fristen.push({ id: `f${Date.now().toString(36)}`, name: a.name, datum: a.datum, monate: 0, vorlaufWochen: [4, 1], dauer: 15 });
      await SON.speichern('fristen.json', fristen);
      return;
    }
    case 'geburtstag': {
      const geb = await SON.geburtstageLaden();
      geb.eigene.push({ name: a.name, datum: a.datum.slice(5) });
      await SON.speichern('geburtstage.json', geb);
      return;
    }
    default:
  }
}

// eingang: Diktat/Text oder "DIKTAT: …\nCLAUDE: …" vom Kurzbefehl. Rückgabe: kurze Zusammenfassung.
// Termine aller Kalender (heute bis 60 Tage), damit "Training morgen erst um 20 Uhr" den Termin findet
async function termineLesen() {
  try {
    const von = D.tagesBeginn(new Date());
    const ev = await CalendarEvent.between(von, D.plusTage(von, 60), await Calendar.forEvents());
    return ev;
  } catch (e) {
    await log(`WARNUNG Sprache: Termine nicht lesbar: ${e}`);
    return [];
  }
}

async function verarbeiten(eingang) {
  const { aufgaben } = await PLAN.laden();
  const meds = await PLAN.medsLaden();
  const ereignisse = await termineLesen();
  const termine = ereignisse.map((e, nr) => ({ nr, titel: e.title, start: e.startDate, end: e.endDate, ganztag: !!e.isAllDay, kalender: e.calendar ? e.calendar.title : '' }));
  const r = SP.verstehen(eingang, { heute: new Date(), aufgaben, meds, termine });
  for (const a of r.absichten) if (a.aktion === 'aendern') a.ereignis = ereignisse[a.nr];
  await log(`Sprache (${r.quelle}): ${JSON.stringify(String(eingang).slice(0, 300))} -> ${r.absichten.map(a => a.beschreibung).join(' | ')}`);
  const ok = r.absichten.filter(a => a.aktion !== 'unklar');
  const unklar = r.absichten.filter(a => a.aktion === 'unklar').map(a => a.beschreibung);
  if (!ok.length) {
    await info('Nicht verstanden', `${unklar.join('\n')}\n\n${BEISPIELE}`);
    return 'Nicht verstanden.';
  }
  const a = new Alert();
  a.title = 'Verstanden';
  a.message = ok.map(x => `- ${x.beschreibung}`).join('\n') + (unklar.length ? `\n\nNicht verstanden:\n${unklar.join('\n')}` : '');
  a.addAction('Ausführen');
  a.addCancelAction('Abbrechen');
  if ((await a.presentAlert()) === -1) return 'Abgebrochen.';
  for (const x of ok) await ausfuehren(x);
  await log(`Sprache ausgeführt: ${ok.length} Aktion(en).`);
  await PLAN.neuPlanen();
  return `Erledigt: ${ok.map(x => x.beschreibung).join('; ')}`;
}

async function eintippen() {
  const a = new Alert();
  a.title = 'Was soll ich eintragen?';
  a.message = BEISPIELE;
  a.addTextField('z. B. Termin Friseur Freitag 15 Uhr', '');
  a.addAction('OK');
  a.addCancelAction('Abbrechen');
  if ((await a.presentAlert()) === -1) return null;
  const t = a.textFieldValue(0).trim();
  return t ? verarbeiten(t) : null;
}

module.exports = { verarbeiten, eintippen, BEISPIELE };
