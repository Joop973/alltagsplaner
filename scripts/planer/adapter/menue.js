// Scriptable: Hauptmenü und alle Bearbeitungs-Dialoge.
'use strict';

function hole(p) {
  try { return importModule('planer/' + p); } catch (e) { return importModule('../' + p); }
}
const D = hole('core/datum');
const S = hole('core/standard');
const PL = hole('core/planer');
const SCH = hole('core/schichten');
const DAT = hole('adapter/dateien');
const KAL = hole('adapter/kalender');
const PLAN = hole('adapter/planung');

// ---------- kleine Dialog-Helfer ----------

async function auswahl(titel, nachricht, optionen, zurueck) {
  const a = new Alert();
  a.title = titel;
  if (nachricht) a.message = nachricht;
  for (const o of optionen) a.addAction(o);
  a.addCancelAction(zurueck || 'Zurück');
  return a.presentSheet(); // -1 = Zurück
}

async function frage(titel, nachricht, ja, nein) {
  const a = new Alert();
  a.title = titel;
  if (nachricht) a.message = nachricht;
  a.addAction(ja || 'Ja');
  a.addCancelAction(nein || 'Nein');
  return (await a.presentAlert()) === 0;
}

async function info(titel, text) {
  const a = new Alert();
  a.title = titel;
  a.message = text || '';
  a.addAction('OK');
  await a.presentAlert();
}

// Rückgabe: Text oder null (= abgebrochen)
async function eingabe(titel, nachricht, wert, platzhalter, zahl) {
  const a = new Alert();
  a.title = titel;
  if (nachricht) a.message = nachricht;
  const f = a.addTextField(platzhalter || '', wert == null ? '' : String(wert));
  if (zahl) f.setNumberPadKeyboard();
  a.addAction('OK');
  a.addCancelAction('Abbrechen');
  if ((await a.presentAlert()) === -1) return null;
  return a.textFieldValue(0).trim();
}

async function zahlEingabe(titel, nachricht, wert) {
  for (;;) {
    const t = await eingabe(titel, nachricht, wert, '', true);
    if (t == null) return null;
    const n = Number(t.replace(',', '.'));
    if (Number.isFinite(n) && n >= 0) return Math.round(n);
    await info('Bitte eine Zahl eingeben', `"${t}" ist keine Zahl.`);
  }
}

async function uhrzeitEingabe(titel, wert) {
  for (;;) {
    const t = await eingabe(titel, 'Format HH:MM, z. B. 08:00', wert, '08:00');
    if (t == null) return null;
    const m = t.match(/^(\d{1,2})[:.](\d{2})$/);
    if (m && Number(m[1]) < 24 && Number(m[2]) < 60) return `${D.zwei(Number(m[1]))}:${m[2]}`;
    await info('Ungültige Uhrzeit', `"${t}"`);
  }
}

const DATUM_HILFE = 'Leer = noch nie (heute fällig). "heute", "gestern", Zahl = vor so vielen Tagen, oder Datum wie 12.11. bzw. 12.11.2026';

async function datumAbfragen(titel, wert) {
  for (;;) {
    const t = await eingabe(titel, DATUM_HILFE, wert ? D.deutschDatum(wert) : '', 'z. B. 3 oder 12.11.');
    if (t == null) return undefined; // abgebrochen
    const d = D.datumEingabe(t, new Date());
    if (d !== undefined) return d;
    await info('Ungültiges Datum', `"${t}"`);
  }
}

async function bereichAbfragen(titel) {
  const von = D.datumEingabe(await eingabe(titel, 'Erster Tag, z. B. 24.12.2026', '', 'TT.MM.JJJJ') || 'x', new Date());
  if (!von) return null;
  const bisText = await eingabe(titel, 'Letzter Tag (leer = nur ein Tag)', '', 'TT.MM.JJJJ');
  if (bisText == null) return null;
  const bis = bisText === '' ? von : D.datumEingabe(bisText, new Date());
  if (!bis || bis < von) { await info('Ungültiger Zeitraum', ''); return null; }
  return { von, bis };
}

// ---------- Ersteinrichtung ----------

async function standortAdresse() {
  Location.setAccuracyToHundredMeters();
  const l = await Location.current();
  const g = (await Location.reverseGeocode(l.latitude, l.longitude))[0] || {};
  const strasse = [g.thoroughfare, g.subThoroughfare].filter(Boolean).join(' ');
  const ort = [g.postalCode, g.locality].filter(Boolean).join(' ');
  return [strasse, ort].filter(Boolean).join(', ') || g.name || '';
}

async function adresseAbfragen(titel, alt, mitStandort) {
  if (mitStandort) {
    const i = await auswahl(titel, alt ? `Bisher: ${alt}` : '', ['Aktuellen Standort nehmen', 'Adresse eintippen']);
    if (i === -1) return null;
    if (i === 0) {
      try {
        const a = await standortAdresse();
        const ok = await eingabe(titel, 'Gefunden. Bei Bedarf korrigieren:', a);
        if (ok != null) return ok;
        return null;
      } catch (e) {
        await info('Standort nicht verfügbar', String(e));
      }
    }
  }
  return eingabe(titel, 'Straße Hausnummer, PLZ Ort', alt || '', 'Musterstraße 1, 12345 Ort');
}

async function wocheFestlegen(einst) {
  const mo = D.montagVon(new Date());
  const i = await auswahl('Schichtwoche', `Welche Woche ist diese Woche (ab Mo ${D.kurz(mo).slice(3)})?\n\nA: Mo–Do 07–16, Fr 07–13\nB: Mo, Di, Do, Fr 08–16, Mi 08–13`, ['Woche A', 'Woche B']);
  if (i === -1) return false;
  einst.schichten.referenzMontag = D.ymd(mo);
  einst.schichten.referenzTyp = i === 0 ? 'A' : 'B';
  return true;
}

async function kalenderPruefen(einst) {
  const fehlt = await KAL.fehlendeKalender(einst);
  if (!fehlt.length) return true;
  const i = await auswahl('Kalender fehlen', `Es fehlen: ${fehlt.join(', ')}.\n\nScriptable kann selbst keine Kalender anlegen. Das macht der Kurzbefehl "Planer Kalender" (Anleitung in docs/kurzbefehle.md). Danach "Planer" wieder öffnen.`, ['Kurzbefehl "Planer Kalender" starten', 'Ich lege sie selbst in der Kalender-App an (iCloud)']);
  if (i === 0) PLAN.kurzbefehlStarten('Planer Kalender');
  return false;
}

async function ersteinrichtung() {
  const { einst, aufgaben } = await PLAN.laden();
  await info('Ersteinrichtung', 'Ich frage: Adressen, Schichtwoche und wann du die Aufgaben zuletzt erledigt hast. Alles bleibt nur auf diesem iPhone.');

  const zu = await adresseAbfragen('Adresse Zuhause', einst.orte.zuhause.adresse, true);
  if (zu == null) return;
  einst.orte.zuhause.adresse = zu;
  const ar = await adresseAbfragen('Adresse Arbeit', einst.orte.arbeit.adresse, true);
  if (ar == null) return;
  einst.orte.arbeit.adresse = ar;
  if (!(await wocheFestlegen(einst))) return;
  await PLAN.einstellungenSpeichern(einst);

  for (const a of aufgaben) {
    const d = await datumAbfragen(`${a.name}: zuletzt erledigt?`, a.letzte);
    if (d === undefined) break;
    a.letzte = d;
  }
  await PLAN.aufgabenSpeichern(aufgaben);

  einst.eingerichtet = true;
  await PLAN.einstellungenSpeichern(einst);
  await DAT.log('Ersteinrichtung gespeichert.');
  if (!(await kalenderPruefen(einst))) return;
  if (await frage('Fertig', 'Jetzt zum ersten Mal planen? (startet den Kurzbefehl "Planer planen")', 'Jetzt planen', 'Später')) {
    PLAN.kurzbefehlStarten();
  }
}

// ---------- Tagesplan ----------

async function tagesplan() {
  const plan = await DAT.lesen('plan.json', null);
  if (!plan) { await info('Noch kein Plan', 'Bitte zuerst "Jetzt planen".'); return; }
  const eintraege = [];
  for (const b of plan.bloecke) eintraege.push({ zeit: new Date(b.start), text: `${D.hm(new Date(b.start))}–${D.hm(new Date(b.end))}  ${b.name}`, fett: true });
  for (const f of plan.fahrten) {
    if (new Date(f.ankunft) < new Date()) continue;
    const ziel = f.nachArt === 'zuhause' ? 'nach Hause' : `zu ${f.zielName}`;
    eintraege.push({ zeit: new Date(f.abfahrt), text: `${D.hm(new Date(f.abfahrt))}  Fahrt ${ziel} (${f.modus}, ${f.minuten} min${f.geschaetzt ? ', geschätzt' : ''})` });
  }
  eintraege.sort((a, b) => a.zeit - b.zeit);

  const t = new UITable();
  t.showSeparators = true;
  const kopf = new UITableRow();
  kopf.isHeader = true;
  kopf.addText('Tagesplan', `geplant ${D.kurz(new Date(plan.erstellt))} ${D.hm(new Date(plan.erstellt))}`);
  t.addRow(kopf);
  if (plan.warnText) {
    const w = new UITableRow();
    w.addText('Passt nicht:', plan.warnText).titleColor = Color.red();
    w.height = 70;
    t.addRow(w);
  }
  if (plan.wecker && plan.wecker.length) {
    const w = new UITableRow();
    w.addText('Wecker (24 Std.)', plan.wecker.map(x => x.zeit).join(', '));
    t.addRow(w);
  }
  let tag = '';
  for (const e of eintraege) {
    const k = D.kurz(e.zeit);
    if (k !== tag) {
      tag = k;
      const r = new UITableRow();
      r.isHeader = true;
      r.backgroundColor = new Color('#e8e8e8');
      r.addText(k);
      t.addRow(r);
    }
    const r = new UITableRow();
    const c = r.addText(e.text);
    if (e.fett) c.titleFont = Font.boldSystemFont(16);
    else c.titleFont = Font.systemFont(14);
    t.addRow(r);
  }
  if (!eintraege.length) {
    const r = new UITableRow();
    r.addText('Keine Aufgaben und Fahrten geplant.');
    t.addRow(r);
  }
  await t.present();
}

// ---------- Aufgaben ----------

function aufgabeKurz(a) {
  const f = PL.faelligAm(a, D.ymd(new Date()));
  return `${a.aktiv === false ? '(aus) ' : ''}${a.name} · alle ${a.intervall} T · ${a.dauer} min · ${a.pflicht ? 'Pflicht' : 'wenn Zeit'} · fällig ${D.deutschDatum(f)}`;
}

async function aufgabeBearbeiten(aufgaben, a) {
  for (;;) {
    const i = await auswahl(a.name, aufgabeKurz(a), [
      `Name: ${a.name}`,
      `Alle ${a.intervall} Tage`,
      `Dauer: ${a.dauer} min`,
      a.pflicht ? 'Art: Pflicht (ändern)' : 'Art: wenn Zeit (ändern)',
      `Zuletzt erledigt: ${a.letzte ? D.deutschDatum(a.letzte) : 'nie'}`,
      a.aktiv === false ? 'Einschalten' : 'Ausschalten',
      'Löschen',
    ]);
    if (i === -1) return;
    if (i === 0) { const t = await eingabe('Name', '', a.name); if (t) a.name = t; }
    if (i === 1) { const n = await zahlEingabe('Alle wie viele Tage?', '', a.intervall); if (n) a.intervall = n; }
    if (i === 2) { const n = await zahlEingabe('Dauer in Minuten', '', a.dauer); if (n) a.dauer = n; }
    if (i === 3) a.pflicht = !a.pflicht;
    if (i === 4) { const d = await datumAbfragen('Zuletzt erledigt', a.letzte); if (d !== undefined) a.letzte = d; }
    if (i === 5) a.aktiv = a.aktiv === false;
    if (i === 6) {
      if (await frage('Löschen?', a.name)) {
        aufgaben.splice(aufgaben.indexOf(a), 1);
        await PLAN.aufgabenSpeichern(aufgaben);
        return;
      }
    }
    await PLAN.aufgabenSpeichern(aufgaben);
  }
}

async function aufgabenMenue() {
  const { aufgaben } = await PLAN.laden();
  for (;;) {
    const i = await auswahl('Aufgaben', 'Änderungen gelten beim nächsten Planen.', [...aufgaben.map(aufgabeKurz), '+ Neue Aufgabe']);
    if (i === -1) return;
    if (i === aufgaben.length) {
      const name = await eingabe('Neue Aufgabe', 'Name');
      if (!name) continue;
      const intervall = await zahlEingabe('Alle wie viele Tage?', '', 7);
      if (!intervall) continue;
      const dauer = await zahlEingabe('Dauer in Minuten', '', 15);
      if (!dauer) continue;
      const pflicht = await frage('Pflicht?', 'Pflicht wird vor "wenn Zeit" geplant.', 'Pflicht', 'wenn Zeit');
      aufgaben.push({ id: `a${Date.now().toString(36)}`, name, intervall, dauer, pflicht, letzte: null, aktiv: true });
      await PLAN.aufgabenSpeichern(aufgaben);
      continue;
    }
    await aufgabeBearbeiten(aufgaben, aufgaben[i]);
  }
}

// ---------- Einstellungen ----------

const REGELN = [
  ['pauseNachHeim', 'Pause nach dem Heimkommen (min)'],
  ['ruheVorAbfahrt', 'Ruhe vor jeder Abfahrt (min)'],
  ['minLuecke', 'Lücke mindestens (min)'],
  ['tagStart', 'Aufgaben frühestens (Uhrzeit)', 'zeit'],
  ['tagEnde', 'Aufgaben enden spätestens (Uhrzeit)', 'zeit'],
  ['maxProTag', 'Höchstens Aufgaben pro Tag (min)'],
  ['tage', 'Planung für so viele Tage'],
  ['vorziehenTage', 'Vorziehen um höchstens (Tage)'],
  ['weckerVorlauf', 'Wecker vor Abfahrt (min)'],
  ['weckerStunden', 'Wecker für die nächsten (Std.)'],
  ['fallbackMin', 'Fahrzeit, wenn unbekannt (min)'],
  ['cacheTage', 'Fahrzeiten neu abfragen nach (Tagen)'],
];

async function regelnMenue(einst) {
  const r = einst.regeln;
  for (;;) {
    const i = await auswahl('Zeiten und Regeln', 'Vorziehen: Ist am Fälligkeitstag kein Platz, wird so viele Tage früher gesucht.', REGELN.map(([k, l]) => `${l}: ${r[k]}`));
    if (i === -1) return;
    const [k, l, art] = REGELN[i];
    const neu = art === 'zeit' ? await uhrzeitEingabe(l, r[k]) : await zahlEingabe(l, '', r[k]);
    if (neu != null) { r[k] = neu; await PLAN.einstellungenSpeichern(einst); }
  }
}

async function orteMenue(einst) {
  const o = einst.orte;
  for (;;) {
    const i = await auswahl('Orte', 'Termine ohne Ort gelten als zuhause. Stichwörter im Ort-Text erkennen Zuhause/Arbeit.', [
      `Zuhause: ${o.zuhause.adresse || '(leer)'}`,
      `Stichwörter Zuhause: ${o.zuhause.stichwoerter.join(', ')}`,
      `Arbeit: ${o.arbeit.adresse || '(leer)'}`,
      `Name Arbeit: ${o.arbeit.name}`,
      `Stichwörter Arbeit: ${o.arbeit.stichwoerter.join(', ')}`,
    ]);
    if (i === -1) return;
    if (i === 0) { const t = await adresseAbfragen('Adresse Zuhause', o.zuhause.adresse, true); if (t != null) o.zuhause.adresse = t; }
    if (i === 2) { const t = await adresseAbfragen('Adresse Arbeit', o.arbeit.adresse, true); if (t != null) o.arbeit.adresse = t; }
    if (i === 3) { const t = await eingabe('Name Arbeit', 'So heißen die Schicht-Termine.', o.arbeit.name); if (t) o.arbeit.name = t; }
    if (i === 1 || i === 4) {
      const ziel = i === 1 ? o.zuhause : o.arbeit;
      const t = await eingabe('Stichwörter', 'Mit Komma trennen', ziel.stichwoerter.join(', '));
      if (t != null) ziel.stichwoerter = t.split(',').map(x => x.trim()).filter(Boolean);
    }
    await PLAN.einstellungenSpeichern(einst);
  }
}

async function verkehrMenue(einst) {
  const v = einst.verkehr;
  const punkte = [['zuhauseArbeit', 'Zuhause <-> Arbeit'], ['direktVonArbeit', 'Von Arbeit direkt weiter'], ['sonst', 'Alle anderen Strecken']];
  for (;;) {
    const i = await auswahl('Verkehrsmittel', 'Antippen zum Wechseln zwischen Fahrrad und Auto.', punkte.map(([k, l]) => `${l}: ${v[k]}`));
    if (i === -1) return;
    const k = punkte[i][0];
    v[k] = v[k] === 'Fahrrad' ? 'Auto' : 'Fahrrad';
    await PLAN.einstellungenSpeichern(einst);
  }
}

const TAGE = [[1, 'Montag'], [2, 'Dienstag'], [3, 'Mittwoch'], [4, 'Donnerstag'], [5, 'Freitag'], [6, 'Samstag'], [0, 'Sonntag']];

async function schichtzeitenMenue(einst) {
  for (;;) {
    const w = await auswahl('Schichtzeiten', 'Welche Woche bearbeiten?', ['Woche A', 'Woche B']);
    if (w === -1) return;
    const typ = w === 0 ? 'A' : 'B';
    const z = einst.schichten.zeiten[typ];
    for (;;) {
      const i = await auswahl(`Woche ${typ}`, 'Format 07:00-16:00, leer = frei', TAGE.map(([n, l]) => `${l}: ${z[n] || 'frei'}`));
      if (i === -1) break;
      const [n, l] = TAGE[i];
      const t = await eingabe(`${l} (Woche ${typ})`, 'Format 07:00-16:00, leer = frei', z[n] || '');
      if (t == null) continue;
      if (t === '') delete z[n];
      else if (/^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/.test(t)) z[n] = t.replace(/\s/g, '');
      else { await info('Ungültig', `"${t}"`); continue; }
      await PLAN.einstellungenSpeichern(einst);
    }
  }
}

async function kalenderMenue(einst) {
  for (;;) {
    const namen = (await KAL.alleNamen()).filter(n => n !== einst.kalender.planer);
    const ign = new Set(einst.kalender.ignorieren || []);
    const i = await auswahl('Kalender beachten', 'Antippen zum Umschalten. Ignorierte Kalender blockieren keine Zeit. Ganztägige Termine werden immer ignoriert.', namen.map(n => `${ign.has(n) ? '✗ ignoriert' : '✓ belegt'}: ${n}`));
    if (i === -1) return;
    const n = namen[i];
    if (ign.has(n)) ign.delete(n); else ign.add(n);
    einst.kalender.ignorieren = [...ign];
    await PLAN.einstellungenSpeichern(einst);
  }
}

async function einstellungenMenue() {
  const { einst } = await PLAN.laden();
  for (;;) {
    const sch = einst.schichten;
    const i = await auswahl('Einstellungen', '', [
      'Zeiten und Regeln',
      'Orte',
      'Verkehrsmittel',
      'Schichtzeiten',
      `Schichtwoche neu festlegen (jetzt: Woche ${sch.referenzMontag ? SCH.wochenTyp(new Date(), sch.referenzMontag, sch.referenzTyp) : '?'})`,
      `Weitere freie Tage: ${(sch.extraFrei || []).join(', ') || 'keine'}`,
      'Kalender beachten / ignorieren',
    ]);
    if (i === -1) return;
    if (i === 0) await regelnMenue(einst);
    if (i === 1) await orteMenue(einst);
    if (i === 2) await verkehrMenue(einst);
    if (i === 3) await schichtzeitenMenue(einst);
    if (i === 4 && await wocheFestlegen(einst)) await PLAN.einstellungenSpeichern(einst);
    if (i === 5) {
      const t = await eingabe('Weitere freie Tage', 'Jedes Jahr frei, z. B. 24.12, 31.12 (Feiertage Niedersachsen sind automatisch frei)', (sch.extraFrei || []).join(', '));
      if (t != null) { sch.extraFrei = t.split(',').map(x => x.trim()).filter(Boolean); await PLAN.einstellungenSpeichern(einst); }
    }
    if (i === 6) await kalenderMenue(einst);
  }
}

// ---------- Urlaub / Ausnahmen ----------

async function ausnahmenMenue() {
  const { einst } = await PLAN.laden();
  const liste = einst.schichten.ausnahmen;
  for (;;) {
    liste.sort((a, b) => (a.von < b.von ? -1 : 1));
    const i = await auswahl('Urlaub / Ausnahmen', 'An diesen Tagen keine Schicht. Antippen zum Löschen.',
      [...liste.map(a => `${D.deutschDatum(a.von)}${a.bis !== a.von ? ' – ' + D.deutschDatum(a.bis) : ''} ${a.text || ''}`), '+ Neuer Zeitraum']);
    if (i === -1) return;
    if (i === liste.length) {
      const b = await bereichAbfragen('Neuer Zeitraum');
      if (!b) continue;
      const text = await eingabe('Bezeichnung', 'z. B. Urlaub', 'Urlaub');
      liste.push({ von: b.von, bis: b.bis, text: text || '' });
    } else if (await frage('Löschen?', `${D.deutschDatum(liste[i].von)} – ${D.deutschDatum(liste[i].bis)}`)) {
      liste.splice(i, 1);
    }
    await PLAN.einstellungenSpeichern(einst);
  }
}

// ---------- Log ----------

async function logZeigen() {
  const text = await DAT.logLesen();
  const zeilen = text.trim().split('\n').reverse(); // neueste oben
  const t = new UITable();
  const kopf = new UITableRow();
  kopf.isHeader = true;
  kopf.addText('Log (neueste oben)', 'Zeile antippen = Log leeren');
  kopf.onSelect = async () => {
    if (await frage('Log leeren?', '')) await DAT.logLeeren();
  };
  kopf.dismissOnSelect = true;
  t.addRow(kopf);
  for (const z of zeilen.slice(0, 300)) {
    const r = new UITableRow();
    const c = r.addText(z);
    c.titleFont = Font.systemFont(12);
    if (/FEHLER|WARNUNG/.test(z)) c.titleColor = Color.red();
    r.height = Math.max(30, Math.ceil(z.length / 45) * 18);
    t.addRow(r);
  }
  await t.present();
}

// ---------- Hauptmenü ----------

async function hauptmenue() {
  for (;;) {
    const { einst } = await PLAN.laden();
    const plan = await DAT.lesen('plan.json', null);
    const status = !einst.eingerichtet ? 'Noch nicht eingerichtet.'
      : plan ? `Zuletzt geplant: ${D.kurz(new Date(plan.erstellt))} ${D.hm(new Date(plan.erstellt))}${plan.warnText ? '\nPasst nicht: ' + plan.warnText : ''}`
        : 'Noch nie geplant.';
    const punkte = [
      ['Jetzt planen', async () => {
        if (!einst.eingerichtet) { await info('Erst einrichten', 'Bitte zuerst "Ersteinrichtung".'); return; }
        if (await kalenderPruefen(einst)) PLAN.kurzbefehlStarten();
      }],
      ['Tagesplan', tagesplan],
      ['Aufgaben bearbeiten', aufgabenMenue],
      ['Urlaub / Ausnahmen', ausnahmenMenue],
      ['Einstellungen', einstellungenMenue],
      ['Log', logZeigen],
      ['Ersteinrichtung', ersteinrichtung],
      ['Test: planen ohne Kurzbefehl (ohne Wecker)', async () => {
        if (!(await kalenderPruefen(einst))) return;
        const p = await PLAN.ohneKurzbefehl();
        await info('Geplant', `${p.bloecke.length} Aufgaben-Blöcke. Wecker werden nur über den Kurzbefehl gestellt.`);
      }],
      ['Update laden', async () => Safari.open(`scriptable:///run/${encodeURIComponent('Planer Update')}`)],
    ];
    const i = await auswahl('Planer', status, punkte.map(p => p[0]), 'Schließen');
    if (i === -1) return;
    try {
      await punkte[i][1]();
      if (i === 0 || i === punkte.length - 1) return; // App wird verlassen
    } catch (e) {
      await DAT.log(`FEHLER im Menü: ${e && e.stack ? e.stack : e}`);
      await info('Fehler', String(e && e.message ? e.message : e));
    }
  }
}

module.exports = { hauptmenue, ersteinrichtung };
