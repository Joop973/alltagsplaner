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
const ORT = hole('adapter/orte');
const SON = hole('adapter/sonder');
const SO = hole('core/sonder');
const AL = hole('core/alltag');
const ERI = hole('adapter/erinnerungen');

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
    return true;
  }
}

// ---------- Heute und Woche ----------

const ZEIGEN = { erledigt: 'Erledigt', heutenicht: 'Heute nicht (ab morgen neu einplanen)', spaeter: 'Später (nächste Lücke)', nichtnoetig: 'Nicht nötig (noch sauber – Abstand neu ab heute)' };

function zeile(t, text, untertitel, opt) {
  const r = new UITableRow();
  const c = r.addText(text, untertitel || null);
  c.titleFont = opt && opt.fett ? Font.boldSystemFont(16) : Font.systemFont(15);
  if (opt && opt.farbe) c.titleColor = opt.farbe;
  if (opt && opt.klein) c.subtitleFont = Font.systemFont(12);
  if (opt && opt.hoehe) r.height = opt.hoehe;
  if (opt && opt.waehlen) { r.onSelect = opt.waehlen; r.dismissOnSelect = true; }
  t.addRow(r);
  return r;
}

function kopf(t, text, untertitel) {
  const r = new UITableRow();
  r.isHeader = true;
  r.backgroundColor = new Color('#e8e8e8');
  r.addText(text, untertitel || null);
  t.addRow(r);
}

function eintraegeFuer(plan, datum) {
  const liste = [];
  for (const tm of plan.termine || []) {
    if (D.ymd(new Date(tm.start)) !== datum) continue;
    liste.push({ zeit: new Date(tm.start), text: `${D.hm(new Date(tm.start))}–${D.hm(new Date(tm.end))}  ${tm.titel}`, art: 'termin' });
  }
  for (const f of plan.fahrten || []) {
    if (D.ymd(new Date(f.abfahrt)) !== datum) continue;
    const ziel = f.nachArt === 'zuhause' ? 'nach Hause' : `zu ${f.zielName}`;
    liste.push({ zeit: new Date(f.abfahrt), text: `${D.hm(new Date(f.abfahrt))}  Fahrt ${ziel} (${f.modus}, ${f.minuten} min${f.geschaetzt ? ', geschätzt' : ''})`, art: 'fahrt' });
  }
  for (const b of plan.bloecke || []) {
    if (D.ymd(new Date(b.start)) !== datum) continue;
    const extra = [b.unterwegs ? 'unterwegs' : '', b.fest ? 'fest' : ''].filter(Boolean).join(', ');
    liste.push({ zeit: new Date(b.start), text: `${D.hm(new Date(b.start))}–${D.hm(new Date(b.end))}  ${b.name}${extra ? ` (${extra})` : ''}`, art: 'block', block: b });
  }
  return liste.sort((x, y) => x.zeit - y.zeit);
}

async function blockAktion(b) {
  const optionen = ['erledigt', 'heutenicht', 'spaeter'].concat(b.einmalig ? [] : ['nichtnoetig']);
  const schritte = b.schritte && b.schritte.length ? `\n${b.schritte.map(x => '- ' + x).join('\n')}` : '';
  const i = await auswahl(b.name, `${D.kurz(new Date(b.start))} ${D.hm(new Date(b.start))}–${D.hm(new Date(b.end))}${schritte}\nDanach wird neu geplant.`, optionen.map(o => ZEIGEN[o]));
  if (i === -1) return;
  await PLAN.aktion({ aktion: optionen[i], id: b.aufgabeId, ende: b.end });
}

async function zeitVorschlag() {
  const n = await zahlEingabe('Wie viele Minuten hast du?', '', 15);
  if (!n) return;
  const { einst, aufgaben } = await PLAN.laden();
  const v = PL.vorschlaege({ aufgaben, minuten: n, jetzt: new Date(), regeln: einst.regeln }).slice(0, 5);
  if (!v.length) { await info('Nichts Passendes', `Keine fällige Aufgabe passt in ${n} Minuten.`); return; }
  const heute = D.ymd(new Date());
  const i = await auswahl(`${n} Minuten`, 'Antippen = jetzt erledigt.', v.map(o => `${o.a.name} · ${o.a.dauer} min · ${PL.dringlichkeitText(PL.dringlichkeit(o.faellig, heute))}`));
  if (i === -1) return;
  await PLAN.aktion({ aktion: 'erledigt', id: v[i].a.id });
}

async function heute() {
  for (;;) {
    const plan = await DAT.lesen('plan.json', null);
    if (!plan) { await info('Noch kein Plan', 'Bitte zuerst "Jetzt planen".'); return; }
    const z = await PLAN.zustandLaden();
    const { aufgaben, einst } = await PLAN.laden();
    const jetzt = new Date();
    const hT = D.ymd(jetzt), mT = D.ymd(D.plusTage(jetzt, 1));
    const ueberfaellig = aufgaben.filter(a => a.aktiv !== false && PL.dringlichkeit(PL.faelligAm(a, hT), hT) > 3);
    let wahl = null;
    const t = new UITable();
    t.showSeparators = true;
    const k = new UITableRow();
    k.isHeader = true;
    k.addText(`Heute · ${D.kurz(jetzt)}`, `geplant ${D.kurz(new Date(plan.erstellt))} ${D.hm(new Date(plan.erstellt))} · Aufgabe antippen`);
    t.addRow(k);
    const hInfo = (plan.tagesInfo || {})[hT];
    if (hInfo && hInfo.grund) zeile(t, hInfo.krank ? 'Krank – heute keine Aufgaben' : hInfo.weg ? 'Abwesend – keine Aufgaben' : hInfo.keineAufgaben ? 'Heute keine Aufgaben' : `Frei: ${hInfo.grund}`, null, { farbe: Color.blue() });
    if (plan.warnText) zeile(t, 'Passt nicht:', plan.warnText, { farbe: Color.red(), hoehe: 70, klein: true });
    if (plan.terminText) zeile(t, 'Termine prüfen:', plan.terminText, { farbe: Color.red(), hoehe: 70, klein: true });
    const wecker = (plan.wecker || []).filter(w => new Date(w.zeitpunkt) > jetzt);
    if (wecker.length) zeile(t, `Wecker: ${wecker.map(w => w.zeit).join(', ')}`);
    zeile(t, 'Ich habe jetzt Zeit …', 'passende Aufgabe vorschlagen', { waehlen: () => { wahl = { art: 'zeit' }; } });
    const keine = z.keineAufgaben === hT;
    zeile(t, keine ? 'Heute wieder Aufgaben' : 'Heute keine Aufgaben', keine ? null : 'z. B. Besuch, kaputt, krank', { waehlen: () => { wahl = { art: 'keine' }; } });
    if (ueberfaellig.length >= 3) zeile(t, `Rückstand auflösen (${ueberfaellig.length} lange überfällig)`, 'alles gilt als erledigt, Abstände neu ab heute', { waehlen: () => { wahl = { art: 'rueckstand' }; } });
    zeile(t, 'Neu planen', 'mit gespeicherten Fahrzeiten, Wecker bleiben', { waehlen: () => { wahl = { art: 'neu' }; } });
    for (const [datum, titel] of [[hT, 'Heute'], [mT, 'Morgen']]) {
      kopf(t, `${titel} · ${D.kurz(D.ausYmd(datum))}`);
      const liste = eintraegeFuer(plan, datum).filter(e => datum !== hT || e.art === 'block' || new Date(e.zeit) >= D.plusMin(jetzt, -60));
      if (!liste.length) zeile(t, 'Nichts geplant.');
      for (const e of liste) {
        zeile(t, e.text, null, {
          fett: e.art === 'block', farbe: e.art === 'termin' ? Color.gray() : null,
          waehlen: e.block ? () => { wahl = { art: 'block', block: e.block }; } : null,
        });
      }
    }
    const geplant = new Set((plan.bloecke || []).map(b => b.aufgabeId));
    const offen = aufgaben.filter(a => a.aktiv !== false && !geplant.has(a.id) && PL.dringlichkeit(PL.faelligAm(a, hT), hT) >= 0);
    if (offen.length) {
      kopf(t, 'Fällig, aber nicht eingeplant');
      for (const a of offen) {
        zeile(t, a.name, PL.dringlichkeitText(PL.dringlichkeit(PL.faelligAm(a, hT), hT)), {
          klein: true, waehlen: () => { wahl = { art: 'offen', aufgabe: a }; },
        });
      }
    }
    await t.present();
    if (!wahl) return;
    if (wahl.art === 'block') await blockAktion(wahl.block);
    if (wahl.art === 'zeit') await zeitVorschlag();
    if (wahl.art === 'neu') { await PLAN.neuPlanen(); }
    if (wahl.art === 'keine') { await PLAN.heuteKeineAufgaben(!keine); await PLAN.neuPlanen(); }
    if (wahl.art === 'rueckstand' && await frage('Rückstand auflösen?', `${ueberfaellig.map(a => a.name).join(', ')}\n\nAlles gilt als "nicht nötig", die Abstände laufen neu ab heute.`)) {
      await PLAN.rueckstandAufloesen();
      await PLAN.neuPlanen();
    }
    if (wahl.art === 'offen') {
      const i = await auswahl(wahl.aufgabe.name, 'Nicht eingeplant (kein Platz oder gesperrt).', ['Erledigt', 'Nicht nötig']);
      if (i >= 0) await PLAN.aktion({ aktion: i === 0 ? 'erledigt' : 'nichtnoetig', id: wahl.aufgabe.id });
    }
    await DAT.logSchreiben();
  }
}

async function woche() {
  const plan = await DAT.lesen('plan.json', null);
  if (!plan) { await info('Noch kein Plan', 'Bitte zuerst "Jetzt planen".'); return; }
  const t = new UITable();
  t.showSeparators = true;
  const tage = plan.tagInfo || [];
  const naechsterFrei = tage.find(x => !x.arbeit && D.ymd(new Date()) < x.datum);
  const k = new UITableRow();
  k.isHeader = true;
  k.addText('Woche', naechsterFrei ? `Nächster freier Tag: ${D.kurz(D.ausYmd(naechsterFrei.datum))}` : '');
  t.addRow(k);
  for (const tag of tage) {
    const termine = (plan.termine || []).filter(x => D.ymd(new Date(x.start)) === tag.datum);
    const arbeit = termine.find(x => x.art === 'arbeit');
    const lueckeMin = ((plan.luecken || []).find(l => l.datum === tag.datum) || { luecken: [] }).luecken
      .reduce((s, l) => s + Math.round((l.end - l.start) / 60000), 0);
    const tInfo = (plan.tagesInfo || {})[tag.datum];
    const art = tInfo && tInfo.krank ? 'krank' : tInfo && tInfo.weg ? 'abwesend' : arbeit ? `Arbeit ${D.hm(new Date(arbeit.start))}–${D.hm(new Date(arbeit.end))}` : 'frei';
    kopf(t, `${D.kurz(D.ausYmd(tag.datum))} · ${art}`, `${lueckeMin} min frei für Aufgaben`);
    for (const x of termine.filter(x => x.art !== 'arbeit')) zeile(t, `${D.hm(new Date(x.start))}  ${x.titel}`, null, { farbe: Color.gray() });
    for (const b of (plan.bloecke || []).filter(b => D.ymd(new Date(b.start)) === tag.datum)) {
      zeile(t, `${D.hm(new Date(b.start))}  ${b.name}`, null, { fett: true });
    }
  }
  await t.present();
}

// ---------- Aufgaben ----------

const MONATE = ['', 'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

function aufgabeKurz(a) {
  const h = D.ymd(new Date());
  const f = PL.faelligAm(a, h);
  const merkmale = [a.pflicht ? 'Pflicht' : 'wenn Zeit', a.unterwegs ? 'unterwegs' : '', a.laut ? 'laut' : '', a.monate && a.monate.length ? a.monate.map(m => MONATE[m]).join('/') : ''].filter(Boolean).join(', ');
  return `${a.aktiv === false ? '(aus) ' : ''}${a.name} · ${PL.dringlichkeitText(PL.dringlichkeit(f, h))} · alle ${a.intervall} T · ${a.dauer} min · ${merkmale}`;
}

async function aufgabeBearbeiten(aufgaben, a) {
  for (;;) {
    const i = await auswahl(a.name, aufgabeKurz(a), [
      `Name: ${a.name}`,
      `Alle ${a.intervall} Tage`,
      `Dauer: ${a.dauer} min`,
      a.pflicht ? 'Art: Pflicht (ändern)' : 'Art: wenn Zeit (ändern)',
      `Zuletzt erledigt: ${a.letzte ? D.deutschDatum(a.letzte) : 'nie'}`,
      `Schritte: ${(a.schritte || []).join(', ') || 'keine'}`,
      `Folgeaufgabe: ${a.folge ? `${a.folge.name} nach ${a.folge.nachMin} min` : 'keine'}`,
      `Besorgung unterwegs: ${a.unterwegs ? 'ja' : 'nein'}`,
      `Laut (Ruhezeiten): ${a.laut ? 'ja' : 'nein'}`,
      `Nur in Monaten: ${a.monate && a.monate.length ? a.monate.map(m => MONATE[m]).join(', ') : 'immer'}`,
      a.aktiv === false ? 'Einschalten' : 'Ausschalten',
      'Löschen',
    ]);
    if (i === -1) return;
    if (i === 0) { const t = await eingabe('Name', '', a.name); if (t) a.name = t; }
    if (i === 1) { const n = await zahlEingabe('Alle wie viele Tage?', '', a.intervall); if (n) a.intervall = n; }
    if (i === 2) { const n = await zahlEingabe('Dauer in Minuten', '', a.dauer); if (n) a.dauer = n; }
    if (i === 3) a.pflicht = !a.pflicht;
    if (i === 4) { const d = await datumAbfragen('Zuletzt erledigt', a.letzte); if (d !== undefined) a.letzte = d; }
    if (i === 5) {
      const t = await eingabe('Schritte', 'Mit Komma trennen. Erscheinen in der Mitteilung.', (a.schritte || []).join(', '));
      if (t != null) a.schritte = t.split(',').map(x => x.trim()).filter(Boolean);
    }
    if (i === 6) {
      const name = await eingabe('Folgeaufgabe', 'Was danach? Leer = keine. Beispiel: Wäsche aufhängen', a.folge ? a.folge.name : '');
      if (name === '') delete a.folge;
      else if (name) {
        const nach = await zahlEingabe('Nach wie vielen Minuten?', 'Erinnert bis zu 3-mal, bis du sie bestätigst.', a.folge ? a.folge.nachMin : 120);
        if (nach != null) a.folge = { name, nachMin: nach, dauer: 15, zuhause: await frage('Zuhause nötig?', 'Aufgabe nur planen, wenn du danach noch zuhause bist?') };
      }
    }
    if (i === 7) a.unterwegs = !a.unterwegs;
    if (i === 8) a.laut = !a.laut;
    if (i === 9) {
      const t = await eingabe('Monate', 'Zahlen mit Komma, z. B. 3, 4 für März und April. Leer = immer.', (a.monate || []).join(', '));
      if (t != null) a.monate = t.split(',').map(x => Number(x.trim())).filter(x => x >= 1 && x <= 12);
    }
    if (i === 10) a.aktiv = a.aktiv === false;
    if (i === 11) {
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
    const h = D.ymd(new Date());
    const sortiert = aufgaben.slice().sort((x, y) => PL.dringlichkeit(PL.faelligAm(y, h), h) - PL.dringlichkeit(PL.faelligAm(x, h), h));
    const i = await auswahl('Aufgaben', 'Dringendste zuerst. Änderungen gelten beim nächsten Planen.', [...sortiert.map(aufgabeKurz), '+ Neue Aufgabe', '+ Aus Vorlage', 'Rückstand auflösen']);
    if (i === -1) return;
    if (i === sortiert.length) {
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
    if (i === sortiert.length + 1) {
      const v = S.vorlagenAufgaben().filter(x => !aufgaben.some(a => a.name === x.name));
      const k = await auswahl('Vorlage', 'Antippen zum Hinzufügen.', v.map(x => `${x.name} · alle ${x.intervall} T · ${x.dauer} min${x.monate ? ' · ' + x.monate.map(m => MONATE[m]).join('/') : ''}`));
      if (k === -1) continue;
      const d = await datumAbfragen(`${v[k].name}: zuletzt erledigt?`, null);
      if (d === undefined) continue;
      aufgaben.push({ id: `a${Date.now().toString(36)}`, ...v[k], letzte: d, aktiv: true });
      await PLAN.aufgabenSpeichern(aufgaben);
      continue;
    }
    if (i === sortiert.length + 2) {
      if (await frage('Rückstand auflösen?', 'Alles Überfällige gilt als "nicht nötig", die Abstände laufen neu ab heute. Praktisch nach Urlaub oder Krankheit.')) {
        const n = await PLAN.rueckstandAufloesen();
        await info('Erledigt', `${n} Aufgaben neu ab heute.`);
        return;
      }
      continue;
    }
    await aufgabeBearbeiten(aufgaben, sortiert[i]);
  }
}

// ---------- Einstellungen ----------

const REGELN = [
  ['pauseNachHeim', 'Pause nach dem Heimkommen (min)'],
  ['ruheVorAbfahrt', 'Ruhe vor jeder Abfahrt (min)'],
  ['minLuecke', 'Lücke mindestens (min)'],
  ['tagStart', 'Arbeitstage: Aufgaben ab (Uhrzeit)', 'zeit'],
  ['tagStartFrei', 'Freie Tage: Aufgaben ab (Uhrzeit)', 'zeit'],
  ['tagEnde', 'Aufgaben enden spätestens (Uhrzeit)', 'zeit'],
  ['unterwegsBis', 'Besorgungen spätestens bis (Uhrzeit)', 'zeit'],
  ['maxArbeitstag', 'Arbeitstag: höchstens Aufgaben (min)'],
  ['maxFreierTag', 'Freier Tag: höchstens Aufgaben (min)'],
  ['langAb', 'Ab so vielen min an freie Tage legen'],
  ['tage', 'Planung für so viele Tage'],
  ['vorziehenTage', 'Vorziehen um höchstens (Tage)'],
  ['weckerVorlauf', 'Wecker vor Abfahrt (min)'],
  ['weckerStunden', 'Wecker für die nächsten (Std.)'],
  ['fallbackMin', 'Fahrzeit, wenn unbekannt (min)'],
  ['cacheTage', 'Fahrzeiten neu abfragen nach (Tagen)'],
  ['planruhe', 'Planruhe: Blöcke bleiben an ihrer Zeit', 'schalter'],
  ['besorgungenSonntags', 'Besorgungen auch sonntags', 'schalter'],
];

async function regelnMenue(einst) {
  const r = einst.regeln;
  for (;;) {
    const i = await auswahl('Zeiten und Regeln', 'Vorziehen: Ist am Fälligkeitstag kein Platz, wird so viele Tage früher gesucht.', REGELN.map(([k, l, art]) => `${l}: ${art === 'schalter' ? (r[k] === false ? 'aus' : 'an') : r[k]}`));
    if (i === -1) return;
    const [k, l, art] = REGELN[i];
    if (art === 'schalter') { r[k] = r[k] === false; await PLAN.einstellungenSpeichern(einst); continue; }
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

async function ruhezeitenMenue(einst) {
  const r = einst.ruhezeiten;
  for (;;) {
    const i = await auswahl('Ruhezeiten (Option)', 'Gilt für Aufgaben, die als "laut" markiert sind (Standard: Staubsaugen): nicht an Sonn- und Feiertagen und nur im Zeitfenster.', [
      `Ruhezeiten: ${r.an ? 'an' : 'aus'}`, `Laut erst ab: ${r.von}`, `Laut nur bis: ${r.bis}`,
    ]);
    if (i === -1) return;
    if (i === 0) r.an = !r.an;
    if (i === 1) { const t = await uhrzeitEingabe('Laut erst ab', r.von); if (t) r.von = t; }
    if (i === 2) { const t = await uhrzeitEingabe('Laut nur bis', r.bis); if (t) r.bis = t; }
    await PLAN.einstellungenSpeichern(einst);
  }
}

async function stichwortMenue(einst) {
  const w = einst.tage;
  const arten = [['frei', 'frei (keine Schicht, Aufgaben ja)'], ['krank', 'krank (keine Schicht, keine Aufgaben)'], ['weg', 'abwesend (keine Schicht, keine Aufgaben)']];
  for (;;) {
    const i = await auswahl('Ganztägige Termine', 'Ein ganztägiger Termin mit diesem Wort im Titel (in jedem Kalender) gilt als … "urlaub*" = Wort beginnt so.', arten.map(([k, l]) => `${l}: ${w[k].join(', ')}`));
    if (i === -1) return;
    const [k, l] = arten[i];
    const t = await eingabe(l, 'Mit Komma trennen', w[k].join(', '));
    if (t != null) { w[k] = t.split(',').map(x => x.trim().toLowerCase()).filter(Boolean); await PLAN.einstellungenSpeichern(einst); }
  }
}

async function schichtAendernMenue(einst) {
  const sch = einst.schichten;
  for (;;) {
    const heute = D.ymd(new Date());
    sch.aenderungen = (sch.aenderungen || []).filter(a => a.datum >= heute).sort((x, y) => (x.datum < y.datum ? -1 : 1));
    const i = await auswahl('Einzelne Schicht ändern', 'Überstunden, Tausch, Zusatzschicht. Geht vor dem Muster. Antippen zum Löschen.',
      [...sch.aenderungen.map(a => `${D.kurz(D.ausYmd(a.datum))}: ${a.zeit || 'frei'}`), '+ Schicht ändern']);
    if (i === -1) return;
    if (i < sch.aenderungen.length) {
      if (await frage('Änderung löschen?', 'Dann gilt wieder das normale Muster.')) sch.aenderungen.splice(i, 1);
    } else {
      const datum = await datumAbfragen('Welcher Tag?', null);
      if (!datum) continue;
      const t = await eingabe('Neue Zeit', 'Format 07:00-17:30, leer = frei', '');
      if (t == null) continue;
      if (t !== '' && !/^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/.test(t)) { await info('Ungültig', `"${t}"`); continue; }
      sch.aenderungen = sch.aenderungen.filter(a => a.datum !== datum).concat([{ datum, zeit: t === '' ? null : t.replace(/\s/g, '') }]);
    }
    await PLAN.einstellungenSpeichern(einst);
  }
}

async function sicherungMenue() {
  const i = await auswahl('Daten sichern', 'Alle Einstellungen, Aufgaben, Orte usw. als eine Datei. iCloud sichert zusätzlich automatisch.', ['Sicherung speichern', 'Sicherung einspielen']);
  if (i === 0) {
    const s2 = DAT.sicherungErstellen();
    await DocumentPicker.exportString(JSON.stringify(s2, null, 2), `planer-sicherung-${D.ymd(new Date())}.json`);
  }
  if (i === 1) {
    const pfade = await DocumentPicker.open(['public.json', 'public.text']);
    if (!pfade || !pfade.length) return;
    const text = FileManager.local().readString(pfade[0]);
    if (!(await frage('Einspielen?', 'Deine jetzigen Daten werden überschrieben.'))) return;
    const n = await DAT.sicherungEinspielen(JSON.parse(text));
    await info('Eingespielt', `${n} Dateien. Danach "Jetzt planen".`);
  }
}

async function einstellungenMenue() {
  const { einst } = await PLAN.laden();
  for (;;) {
    const sch = einst.schichten;
    const punkte = [
      ['Zeiten und Regeln', () => regelnMenue(einst)],
      ['Urlaub / krank / abwesend', ausnahmenMenue],
      ['Einzelne Schicht ändern', () => schichtAendernMenue(einst)],
      ['Schichtzeiten (Woche A/B)', () => schichtzeitenMenue(einst)],
      [`Schichtwoche neu festlegen (jetzt: Woche ${sch.referenzMontag ? SCH.wochenTyp(new Date(), sch.referenzMontag, sch.referenzTyp) : '?'})`, async () => { if (await wocheFestlegen(einst)) await PLAN.einstellungenSpeichern(einst); }],
      ['Ganztägige Termine erkennen (Urlaub, krank …)', () => stichwortMenue(einst)],
      [`Weitere freie Tage: ${(sch.extraFrei || []).join(', ') || 'keine'}`, async () => {
        const t = await eingabe('Weitere freie Tage', 'Jedes Jahr frei, z. B. 24.12, 31.12 (Feiertage Niedersachsen sind automatisch frei)', (sch.extraFrei || []).join(', '));
        if (t != null) { sch.extraFrei = t.split(',').map(x => x.trim()).filter(Boolean); await PLAN.einstellungenSpeichern(einst); }
      }],
      [`Ruhezeiten für laute Aufgaben (Option): ${einst.ruhezeiten.an ? 'an' : 'aus'}`, () => ruhezeitenMenue(einst)],
      ['Orte (Zuhause, Arbeit)', () => orteMenue(einst)],
      ['Gelernte Orte', orteGelerntMenue],
      ['Verkehrsmittel', () => verkehrMenue(einst)],
      ['Kalender beachten / ignorieren', () => kalenderMenue(einst)],
      [`Fahrten im Kalender "Planer": ${einst.kalender.fahrtenEintragen ? 'an' : 'aus'}`, async () => { einst.kalender.fahrtenEintragen = !einst.kalender.fahrtenEintragen; await PLAN.einstellungenSpeichern(einst); }],
      [`Aufgaben in Erinnerungen-App (Liste "${einst.erinnerungen.liste}"): ${einst.erinnerungen.an ? 'an' : 'aus'}`, async () => { einst.erinnerungen.an = !einst.erinnerungen.an; await PLAN.einstellungenSpeichern(einst); }],
      [`Wachhund (Mitteilung, wenn der 06:00-Lauf fehlt): ${einst.wachhund.an ? 'an' : 'aus'}`, async () => { einst.wachhund.an = !einst.wachhund.an; await PLAN.einstellungenSpeichern(einst); }],
      ['Daten sichern / einspielen', sicherungMenue],
      ['Ersteinrichtung', ersteinrichtung],
      ['Test: planen ohne Kurzbefehl (ohne Wecker)', async () => {
        if (!(await kalenderPruefen(einst))) return;
        const p2 = await PLAN.ohneKurzbefehl();
        await info('Geplant', `${p2.bloecke.length} Aufgaben-Blöcke. Wecker stellt nur der Kurzbefehl.`);
      }],
      ['Update laden', async () => Safari.open(`scriptable:///run/${encodeURIComponent('Planer Update')}`)],
    ];
    const i = await auswahl('Einstellungen', '', punkte.map(p2 => p2[0]));
    if (i === -1) return;
    await punkte[i][1]();
    await DAT.logSchreiben();
  }
}

// ---------- Urlaub / Ausnahmen ----------

const ART_TEXT = { frei: 'frei', krank: 'krank', weg: 'abwesend' };

async function ausnahmenMenue() {
  const { einst } = await PLAN.laden();
  const liste = einst.schichten.ausnahmen;
  for (;;) {
    liste.sort((a, b) => (a.von < b.von ? -1 : 1));
    const i = await auswahl('Urlaub / krank / abwesend', 'frei: keine Schicht, Aufgaben ja. krank und abwesend: keine Schicht, keine Aufgaben. Ganztägige Kalendertermine wie "Urlaub" oder "Krank" erkennt der Planer auch selbst. Antippen zum Löschen.',
      [...liste.map(a => `${D.deutschDatum(a.von)}${a.bis !== a.von ? ' – ' + D.deutschDatum(a.bis) : ''} ${ART_TEXT[a.art || 'frei']}${a.text ? ': ' + a.text : ''}`), '+ Neuer Zeitraum']);
    if (i === -1) return;
    if (i === liste.length) {
      const b = await bereichAbfragen('Neuer Zeitraum');
      if (!b) continue;
      const k = await auswahl('Was?', '', ['frei / Urlaub zuhause', 'krank', 'abwesend / verreist']);
      if (k === -1) continue;
      const art = ['frei', 'krank', 'weg'][k];
      const text = await eingabe('Bezeichnung', 'optional, z. B. Urlaub', art === 'frei' ? 'Urlaub' : '');
      liste.push({ von: b.von, bis: b.bis, text: text || '', art });
      if (art !== 'frei') await info('Hinweis', 'Danach kannst du unter "Aufgaben" → "Rückstand auflösen" alles Liegengebliebene auf einmal als erledigt werten.');
    } else if (await frage('Löschen?', `${D.deutschDatum(liste[i].von)} – ${D.deutschDatum(liste[i].bis)}`)) {
      liste.splice(i, 1);
    }
    await PLAN.einstellungenSpeichern(einst);
  }
}

// ---------- Geburtstage ----------

function kurzTM(ymd) { return `${ymd.slice(8, 10)}.${ymd.slice(5, 7)}.`; }

async function tagMonatAbfragen(titel, wert) {
  for (;;) {
    const t = await eingabe(titel, 'Tag und Monat, z. B. 24.12.', wert || '', 'TT.MM.');
    if (t == null) return null;
    const d = D.datumEingabe(t, new Date());
    if (d) return d.slice(5); // "MM-DD"
    await info('Ungültiges Datum', `"${t}"`);
  }
}

async function geburtstageMenue() {
  const { einst } = await PLAN.laden();
  for (;;) {
    const geb = await SON.geburtstageLaden();
    const kal = await KAL.geburtstageLesen(einst, new Date(), 366);
    const liste = SO.geburtstagsListe(kal, geb.eigene, D.ymd(new Date()), 366);
    const zeilen = liste.map(p => `${kurzTM(p.datum)} ${p.name}${geb.geschenke[p.name] ? ' – Geschenk' : ''}${p.quelle === 'eigene' ? ' (eigener Eintrag)' : ''}`);
    const hinweis = kal.length ? 'Antippen: Geschenk-Erinnerung an/aus.' : `Kalender "${einst.geburtstage.kalender}" nicht gefunden oder leer – nur eigene Einträge.`;
    const i = await auswahl('Geburtstage', `${hinweis} Gratulieren: Mitteilung um ${einst.geburtstage.uhrzeit}. Geschenk: Aufgabe ab ${einst.geburtstage.geschenkVorTage} Tage vorher.`, [...zeilen, '+ Geburtstag hinzufügen']);
    if (i === -1) return;
    if (i === liste.length) {
      const name = await eingabe('Name', '');
      if (!name) continue;
      const datum = await tagMonatAbfragen(`Geburtstag von ${name}`);
      if (!datum) continue;
      geb.eigene.push({ name, datum });
      if (await frage('Geschenk?', `Soll ich dich an ein Geschenk für ${name} erinnern?`)) geb.geschenke[name] = true;
    } else {
      const p = liste[i];
      const opt = [geb.geschenke[p.name] ? 'Geschenk-Erinnerung aus' : 'Geschenk-Erinnerung an'];
      if (p.quelle === 'eigene') opt.push('Löschen');
      const w = await auswahl(p.name, `Geburtstag ${kurzTM(p.datum)}`, opt);
      if (w === 0) {
        if (geb.geschenke[p.name]) delete geb.geschenke[p.name]; else geb.geschenke[p.name] = true;
      }
      if (w === 1) geb.eigene = geb.eigene.filter(e => !(e.name === p.name && SO.naechstesDatum(e.datum, D.ymd(new Date())) === p.datum));
    }
    await SON.speichern('geburtstage.json', geb);
  }
}

// ---------- Fristen ----------

async function fristBearbeiten(fristen, f) {
  for (;;) {
    const i = await auswahl(f.name, `Fällig ${D.deutschDatum(f.datum)} · ${f.monate > 0 ? `alle ${f.monate} Monate` : 'einmalig'} · Erinnerung ${f.vorlaufWochen.join(' und ')} Wochen vorher`, [
      'Erledigt (nächste Frist eintragen)', `Name: ${f.name}`, `Datum: ${D.deutschDatum(f.datum)}`,
      `Wiederholung: ${f.monate > 0 ? `alle ${f.monate} Monate` : 'einmalig'}`, `Vorlauf: ${f.vorlaufWochen.join(', ')} Wochen`, 'Löschen',
    ]);
    if (i === -1) return;
    if (i === 0) {
      const r = SO.fristenFortschreiben([f], { erledigt: { [SO.fristAufgabeId(f)]: D.ymd(new Date()) } });
      fristen.splice(fristen.indexOf(f), 1, ...r.fristen);
      await SON.speichern('fristen.json', fristen);
      await info('Erledigt', r.meldungen.join('\n'));
      return;
    }
    if (i === 1) { const t = await eingabe('Name', '', f.name); if (t) f.name = t; }
    if (i === 2) { const d = await datumAbfragen('Fällig am', f.datum); if (d) f.datum = d; }
    if (i === 3) { const n = await zahlEingabe('Wiederholung', 'Alle wie viele Monate? 0 = einmalig (z. B. TÜV: 24, Versicherung: 12)', f.monate); if (n != null) f.monate = n; }
    if (i === 4) {
      const t = await eingabe('Vorlauf', 'Wochen vorher erinnern, mit Komma, z. B. 4, 1', f.vorlaufWochen.join(', '));
      if (t != null) { const w = t.split(',').map(x => Number(x.trim())).filter(x => x > 0); if (w.length) f.vorlaufWochen = w; }
    }
    if (i === 5 && await frage('Löschen?', f.name)) { fristen.splice(fristen.indexOf(f), 1); await SON.speichern('fristen.json', fristen); return; }
    await SON.speichern('fristen.json', fristen);
  }
}

async function fristenMenue() {
  for (;;) {
    const fristen = await SON.fristenLaden();
    fristen.sort((a, b) => (a.datum < b.datum ? -1 : 1));
    const i = await auswahl('Fristen', 'TÜV, Versicherungen usw. Erscheinen auch in der Erinnerungen-Liste "Fristen" – dort abhaken = erledigt.',
      [...fristen.map(f => `${D.deutschDatum(f.datum)} ${f.name}${f.monate > 0 ? ` (alle ${f.monate} Mon.)` : ''}`), '+ Neue Frist', '+ Aus Vorlage']);
    if (i === -1) return;
    if (i < fristen.length) { await fristBearbeiten(fristen, fristen[i]); continue; }
    let vorlage = null;
    if (i === fristen.length + 1) {
      const v = S.vorlagenFristen();
      const k = await auswahl('Vorlage', '', v.map(x => x.name));
      if (k === -1) continue;
      vorlage = v[k];
    }
    const name = vorlage ? vorlage.name : await eingabe('Neue Frist', 'Name, z. B. TÜV Auto oder Kündigung Handyvertrag');
    if (!name) continue;
    let vorschlag = null;
    if (vorlage && vorlage.datumMMTT) vorschlag = SO.naechstesDatum(vorlage.datumMMTT, D.ymd(new Date()));
    const datum = await datumAbfragen(`${name}: fällig am`, vorschlag);
    if (!datum) continue;
    const monate = vorlage ? vorlage.monate : await zahlEingabe('Wiederholung', 'Alle wie viele Monate? 0 = einmalig (TÜV: 24, Versicherung: 12)', 12);
    if (monate == null) continue;
    fristen.push({ id: `f${Date.now().toString(36)}`, name, datum, monate, vorlaufWochen: vorlage ? vorlage.vorlaufWochen : [4, 1], dauer: 15 });
    await SON.speichern('fristen.json', fristen);
  }
}

// ---------- Checklisten ----------

async function checklistenMenue() {
  for (;;) {
    const listen = await SON.checklistenLaden();
    const i = await auswahl('Checklisten', 'Kommt als Mitteilung zu Beginn der Ruhe vor der Abfahrt, wenn ein Stichwort am Wortanfang im Termintitel steht.',
      [...listen.map(l => `${l.an !== false ? 'an' : 'aus'}: ${l.name} (${(l.stichwoerter || []).slice(0, 3).join(', ')}${(l.stichwoerter || []).length > 3 ? ' …' : ''})`), '+ Neue Checkliste']);
    if (i === -1) return;
    if (i === listen.length) {
      const name = await eingabe('Neue Checkliste', 'Name');
      if (!name) continue;
      listen.push({ id: `c${Date.now().toString(36)}`, name, an: true, stichwoerter: [name.toLowerCase()], punkte: [] });
      await SON.speichern('checklisten.json', listen);
      continue;
    }
    const l = listen[i];
    const w = await auswahl(l.name, `Stichwörter: ${(l.stichwoerter || []).join(', ')}\nInhalt: ${(l.punkte || []).join(', ')}`,
      [l.an !== false ? 'Ausschalten' : 'Einschalten', 'Name', 'Stichwörter', 'Inhalt', 'Löschen']);
    if (w === 0) l.an = l.an === false;
    if (w === 1) { const t = await eingabe('Name', '', l.name); if (t) l.name = t; }
    if (w === 2) { const t = await eingabe('Stichwörter', 'Mit Komma trennen. Passt, wenn ein Wort im Termintitel so beginnt.', (l.stichwoerter || []).join(', ')); if (t != null) l.stichwoerter = t.split(',').map(x => x.trim().toLowerCase()).filter(Boolean); }
    if (w === 3) { const t = await eingabe('Inhalt', 'Mit Komma trennen', (l.punkte || []).join(', ')); if (t != null) l.punkte = t.split(',').map(x => x.trim()).filter(Boolean); }
    if (w === 4 && await frage('Löschen?', l.name)) listen.splice(i, 1);
    await SON.speichern('checklisten.json', listen);
  }
}

// ---------- Blumen ----------

async function blumenMenue() {
  for (;;) {
    const b = await SON.blumenLaden();
    const i = await auswahl('Blumen', 'Wird als Besorgung auf dem Heimweg oder morgens an freien Tagen geplant.', [
      `Blumen: ${b.an ? 'an' : 'aus'}`,
      `Zufällig alle ${b.minWochen} bis ${b.maxWochen} Wochen`,
      `Keine zufälligen Blumen ${b.sperreTage} Tage vor/nach Anlässen`,
      `Für Anlässe ${b.vorTage} Tage vorher besorgen`,
      `Dauer: ${b.dauer} min`,
      `Anlässe (${b.anlaesse.length})`,
    ]);
    if (i === -1) return;
    if (i === 0) b.an = !b.an;
    if (i === 1) {
      const a = await zahlEingabe('Frühestens nach … Wochen', '', b.minWochen);
      const z = a == null ? null : await zahlEingabe('Spätestens nach … Wochen', '', b.maxWochen);
      if (a && z && z >= a) { b.minWochen = a; b.maxWochen = z; b.naechste = null; }
    }
    if (i === 2) { const n = await zahlEingabe('Sperre um Anlässe (Tage)', '', b.sperreTage); if (n != null) { b.sperreTage = n; b.naechste = null; } }
    if (i === 3) { const n = await zahlEingabe('Tage vorher', '', b.vorTage); if (n != null) b.vorTage = n; }
    if (i === 4) { const n = await zahlEingabe('Dauer (min)', '', b.dauer); if (n) b.dauer = n; }
    if (i === 5) {
      for (;;) {
        const k = await auswahl('Anlässe', 'Antippen zum Löschen.', [...b.anlaesse.map(a => `${a.datum.slice(3, 5)}.${a.datum.slice(0, 2)}. ${a.name}`), '+ Anlass hinzufügen (z. B. Jahrestag, Geburtstag)']);
        if (k === -1) break;
        if (k === b.anlaesse.length) {
          const name = await eingabe('Anlass', 'z. B. Jahrestag oder Geburtstag');
          if (!name) continue;
          const datum = await tagMonatAbfragen(name);
          if (datum) { b.anlaesse.push({ name, datum }); b.naechste = null; }
        } else if (await frage('Löschen?', b.anlaesse[k].name)) {
          b.anlaesse.splice(k, 1);
        }
        await SON.speichern('blumen.json', b);
      }
    }
    await SON.speichern('blumen.json', b);
  }
}

// ---------- Einkauf ----------

async function einkaufMenue() {
  const { einst } = await PLAN.laden();
  const e = einst.einkauf;
  for (;;) {
    const i = await auswahl('Einkaufsliste', `Die Liste ist die Erinnerungen-Liste "${e.liste}" – dort, per Siri ("Füge Milch zu Einkauf hinzu") oder hier eintragen. Einkaufen wird als Besorgung geplant, sobald ${e.abAnzahl} Sachen draufstehen, etwas ${e.abTagen} Tage wartet oder ein Eintrag mit "!" beginnt. "Erledigt" hakt die Liste ab.`, [
      '+ Sache hinzufügen', `Einkaufen planen: ${e.an ? 'an' : 'aus'}`, `Ab ${e.abAnzahl} Sachen`, `Spätestens nach ${e.abTagen} Tagen`, `Dauer: ${e.dauer} min`,
    ]);
    if (i === -1) return;
    if (i === 0) {
      const t = await eingabe('Hinzufügen', 'Mehrere mit Komma. "!" am Anfang = dringend.', '');
      if (t) for (const x of t.split(',').map(y => y.trim()).filter(Boolean)) await ERI.einkaufHinzufuegen(einst, x, m => DAT.log(m));
      continue;
    }
    if (i === 1) e.an = !e.an;
    if (i === 2) { const n = await zahlEingabe('Ab wie vielen Sachen?', '', e.abAnzahl); if (n) e.abAnzahl = n; }
    if (i === 3) { const n = await zahlEingabe('Spätestens nach … Tagen', '', e.abTagen); if (n) e.abTagen = n; }
    if (i === 4) { const n = await zahlEingabe('Dauer (min)', '', e.dauer); if (n) e.dauer = n; }
    await PLAN.einstellungenSpeichern(einst);
  }
}

// ---------- Medikamente ----------

const WT = ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function medKurz(m) {
  const tage = m.wochentage && m.wochentage.length ? m.wochentage.map(x => WT[x]).join('/') : 'täglich';
  const vorrat = AL.medVorratTage(m);
  return `${m.an === false ? '(aus) ' : ''}${m.name} · ${(m.zeiten || []).join(', ')} · ${tage}${vorrat != null ? ` · Vorrat ${vorrat} Tage` : ''}`;
}

async function medBearbeiten(meds, m) {
  for (;;) {
    const i = await auswahl(m.name, medKurz(m), [
      `Name: ${m.name}`, `Uhrzeiten: ${(m.zeiten || []).join(', ')}`,
      `Wochentage: ${m.wochentage && m.wochentage.length ? m.wochentage.map(x => WT[x]).join(', ') : 'täglich'}`,
      `Stück pro Einnahme: ${m.proEinnahme || 1}`, `Vorrat (Stück): ${m.vorrat == null ? 'nicht zählen' : m.vorrat}`,
      `Packungsgröße: ${m.packung || '–'}`, `Nachkaufen, wenn Vorrat unter ${m.nachkaufenTage || 7} Tagen`,
      m.an === false ? 'Einschalten' : 'Ausschalten', 'Löschen',
    ]);
    if (i === -1) return;
    if (i === 0) { const t = await eingabe('Name', '', m.name); if (t) m.name = t; }
    if (i === 1) {
      const t = await eingabe('Uhrzeiten', 'Mit Komma, z. B. 08:00, 20:00', (m.zeiten || []).join(', '));
      if (t != null) {
        const z = t.split(',').map(x => x.trim()).filter(x => /^\d{1,2}:\d{2}$/.test(x)).map(x => x.padStart(5, '0'));
        if (z.length) m.zeiten = z;
      }
    }
    if (i === 2) {
      const t = await eingabe('Wochentage', 'Zahlen 1 = Mo … 7 = So, mit Komma. Leer = täglich.', (m.wochentage || []).join(', '));
      if (t != null) m.wochentage = t.split(',').map(x => Number(x.trim())).filter(x => x >= 1 && x <= 7);
    }
    if (i === 3) { const n = await zahlEingabe('Stück pro Einnahme', '', m.proEinnahme || 1); if (n) m.proEinnahme = n; }
    if (i === 4) {
      const t = await eingabe('Vorrat', 'Wie viele Stück hast du? Leer = nicht zählen.', m.vorrat == null ? '' : String(m.vorrat), '', true);
      if (t != null) m.vorrat = t === '' ? null : Math.max(0, Math.round(Number(t)) || 0);
    }
    if (i === 5) { const n = await zahlEingabe('Packungsgröße (Stück)', 'Nach "Apotheke erledigt" wird der Vorrat um so viel erhöht.', m.packung || 0); if (n != null) m.packung = n || null; }
    if (i === 6) { const n = await zahlEingabe('Nachkaufen ab … Tagen Restvorrat', '', m.nachkaufenTage || 7); if (n) m.nachkaufenTage = n; }
    if (i === 7) m.an = m.an === false;
    if (i === 8 && await frage('Löschen?', m.name)) { meds.splice(meds.indexOf(m), 1); await PLAN.medsSpeichern(meds); return; }
    await PLAN.medsSpeichern(meds);
  }
}

async function medikamenteMenue() {
  for (;;) {
    const meds = await PLAN.medsLaden();
    const i = await auswahl('Medikamente', 'Mitteilung zur Uhrzeit mit Knopf "Genommen" (lange drücken), Nachfrage nach 30 min. Mit Vorrat plant der Planer rechtzeitig "Apotheke" als Besorgung.', [...meds.map(medKurz), '+ Medikament']);
    if (i === -1) return;
    if (i < meds.length) { await medBearbeiten(meds, meds[i]); continue; }
    const name = await eingabe('Medikament', 'Name');
    if (!name) continue;
    const t = await eingabe('Uhrzeiten', 'Mit Komma, z. B. 08:00, 20:00', '08:00');
    if (!t) continue;
    const zeiten = t.split(',').map(x => x.trim()).filter(x => /^\d{1,2}:\d{2}$/.test(x)).map(x => x.padStart(5, '0'));
    if (!zeiten.length) continue;
    meds.push({ id: `m${Date.now().toString(36)}`, name, zeiten, proEinnahme: 1, vorrat: null, an: true });
    await PLAN.medsSpeichern(meds);
  }
}

// ---------- Müll (Option) ----------

async function muellMenue() {
  const { einst } = await PLAN.laden();
  const m = einst.muell;
  for (;;) {
    const i = await auswahl('Müllabfuhr (Option)', 'Voraussetzung: Der Abfallkalender deines Entsorgers ist in der Kalender-App abonniert (Kalender-App → Kalender → Kalenderabonnement hinzufügen).', [
      `Erinnerung: ${m.an ? 'an' : 'aus'}`, `Kalender: ${m.kalender || '(wählen)'}`, `Am Vorabend um: ${m.vorabend || 'aus'}`, `Am Morgen um: ${m.morgens || 'aus'}`,
    ]);
    if (i === -1) return;
    if (i === 0) m.an = !m.an;
    if (i === 1) {
      const namen = await KAL.alleNamen();
      const k = await auswahl('Abfallkalender', '', namen);
      if (k >= 0) m.kalender = namen[k];
    }
    if (i === 2) { const t = await eingabe('Vorabend', 'Uhrzeit, leer = aus', m.vorabend || '19:00'); if (t != null) m.vorabend = t; }
    if (i === 3) { const t = await eingabe('Morgens', 'Uhrzeit, leer = aus', m.morgens || '06:30'); if (t != null) m.morgens = t; }
    await PLAN.einstellungenSpeichern(einst);
  }
}

async function extrasMenue() {
  for (;;) {
    const punkte = [
      ['Einkaufsliste', einkaufMenue], ['Medikamente', medikamenteMenue], ['Geburtstage', geburtstageMenue],
      ['Fristen (TÜV, Versicherungen …)', fristenMenue], ['Checklisten', checklistenMenue], ['Blumen', blumenMenue],
      ['Müllabfuhr (Option)', muellMenue],
    ];
    const i = await auswahl('Extras', '', punkte.map(p2 => p2[0]));
    if (i === -1) return;
    await punkte[i][1]();
    await DAT.logSchreiben();
  }
}

// ---------- Orte ----------

const QUELLE = { suche: 'gefunden', hand: 'von dir', standort: 'Standort', ignoriert: 'ignoriert (Ersatzzeit)' };

async function orteGelerntMenue() {
  const n = await ORT.offeneNachsuchen(t => DAT.log(t));
  if (n) await info('Orte gefunden', `${n} Ort(e) wurden jetzt gefunden.`);
  for (;;) {
    const d = await ORT.laden();
    const offen = Object.values(d.offen);
    const bekannt = Object.values(d.eintraege).sort((a, b) => String(a.text).localeCompare(String(b.text)));
    const zeilen = [
      ...offen.map(o => `FEHLT: ${o.text}`),
      ...bekannt.map(e => `${e.text} → ${e.adresse || '–'} (${QUELLE[e.quelle] || e.quelle})`),
    ];
    if (!zeilen.length) { await info('Orte', 'Noch keine Orte gelernt.'); return; }
    const i = await auswahl('Orte', offen.length ? `FEHLT = nicht gefunden (${offen.length}). Antippen zum Eintragen.` : 'Alle Orte bekannt.', zeilen);
    if (i === -1) return;
    const text = i < offen.length ? offen[i].text : bekannt[i - offen.length].text;
    const w = await auswahl(text, '', ['Adresse eintippen', 'Ich bin gerade dort (Standort nehmen)', 'Ignorieren (immer Ersatz-Fahrzeit)', 'Vergessen']);
    if (w === 0) {
      const a = await eingabe('Adresse', `Für "${text}"`, '', 'Straße Nr, PLZ Ort');
      if (!a) continue;
      const r = await ORT.suchenMitVarianten(a);
      if (!r.adresse && !(await frage('Nicht gefunden', `Die Karten-Suche findet "${a}" nicht (${r.fehler}). Trotzdem speichern?`))) continue;
      await ORT.setzen(text, r.adresse || a, 'hand');
    }
    if (w === 1) {
      try {
        const a = await standortAdresse();
        await ORT.setzen(text, a, 'standort');
        await info('Gespeichert', a);
      } catch (e) { await info('Standort nicht verfügbar', String(e)); }
    }
    if (w === 2) await ORT.setzen(text, null, 'ignoriert');
    if (w === 3) await ORT.vergessen(text);
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
    const status = !einst.eingerichtet ? 'Noch nicht eingerichtet: bitte "Einstellungen" → "Ersteinrichtung".'
      : plan ? `Zuletzt geplant: ${D.kurz(new Date(plan.erstellt))} ${D.hm(new Date(plan.erstellt))}${plan.warnText ? '\nPasst nicht: ' + plan.warnText : ''}`
        : 'Noch nie geplant.';
    const punkte = [
      ['Heute', heute],
      ['Woche', woche],
      ['Jetzt planen (mit Fahrzeiten und Weckern)', async () => {
        if (!einst.eingerichtet) { await info('Erst einrichten', 'Bitte "Einstellungen" → "Ersteinrichtung".'); return false; }
        if (await kalenderPruefen(einst)) { PLAN.kurzbefehlStarten(); return true; }
        return false;
      }],
      ['Aufgaben', aufgabenMenue],
      ['Extras', extrasMenue],
      ['Einstellungen', einstellungenMenue],
      ['Log', logZeigen],
    ];
    const i = await auswahl('Planer', status, punkte.map(p2 => p2[0]), 'Schließen');
    if (i === -1) return;
    try {
      const verlassen = await punkte[i][1]();
      await DAT.logSchreiben();
      if (verlassen === true) return; // App wird verlassen
    } catch (e) {
      await DAT.log(`FEHLER im Menü: ${e && e.stack ? e.stack : e}`);
      await DAT.logSchreiben();
      await info('Fehler', String(e && e.message ? e.message : e));
    }
  }
}

module.exports = { hauptmenue, ersteinrichtung };
