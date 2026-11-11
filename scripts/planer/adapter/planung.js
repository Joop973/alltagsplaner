// Scriptable: Abläufe "Planer Planen" (Phase a/b), Neuplanen ohne Kurzbefehl, Knöpfe aus Mitteilungen.
'use strict';

function hole(p) {
  try { return importModule('planer/' + p); } catch (e) { return importModule('../' + p); }
}
const D = hole('core/datum');
const S = hole('core/standard');
const F = hole('core/fahrzeiten');
const A = hole('core/ablauf');
const P = hole('core/planer');
const AK = hole('core/aktion');
const T = hole('core/tage');
const AL = hole('core/alltag');
const G = hole('core/gedaechtnis');
const SO = hole('core/sonder');
const R = hole('core/tagesrhythmus');
const L = hole('core/lernen');
const DAT = hole('adapter/dateien');
const KAL = hole('adapter/kalender');
const MIT = hole('adapter/mitteilungen');
const ORT = hole('adapter/orte');
const ERI = hole('adapter/erinnerungen');
const SON = hole('adapter/sonder');

const KURZBEFEHL = 'Planer planen';
const QUELLE = 'https://raw.githubusercontent.com/Joop973/alltagsplaner/main/';
const log = t => DAT.log(t);

async function laden() {
  const einst = S.zusammenfuehren(S.standardEinstellungen(), await DAT.lesen('einstellungen.json', {}));
  const aufgaben = (await DAT.lesen('aufgaben.json', null)) || S.standardAufgaben();
  const cache = await DAT.lesen('fahrzeiten.json', {});
  return { einst, aufgaben, cache };
}

async function zustandLaden() {
  return { folgen: [], medStatus: { genommen: {} }, titelOrte: {}, schichtRec: {}, ...(await DAT.lesen('zustand.json', {})) };
}
async function zustandSpeichern(z) { await DAT.schreiben('zustand.json', z); }
async function medsLaden() { return DAT.lesen('medikamente.json', []); }
async function medsSpeichern(m) { await DAT.schreiben('medikamente.json', m); }

async function einstellungenSpeichern(einst) { await DAT.schreiben('einstellungen.json', einst); }
async function aufgabenSpeichern(aufgaben) { await DAT.schreiben('aufgaben.json', aufgaben); }

function pruefen(einst) {
  if (!einst.eingerichtet) throw new Error('Bitte zuerst in "Planer" die Ersteinrichtung machen.');
}

// Termine lesen; Termine ohne Ort bekommen den Ort, den derselbe Titel schon öfter hatte.
async function termineMitOrt(einst, jetzt, z) {
  const roh = await KAL.termineLesen(einst, jetzt);
  z.titelOrte = AL.titelOrteLernen(z.titelOrte, roh);
  return AL.ortErgaenzen(roh, z.titelOrte);
}

// Tagesarten der nächsten "tage" Tage (frei, krank, verreist, heute keine Aufgaben)
async function tagesInfoLesen(einst, jetzt, z, tage) {
  const ganz = await KAL.ganztaegigeLesen(einst, jetzt, tage);
  const heute = D.ymd(jetzt);
  return T.tagesInfo({
    ganztaegige: ganz, ausnahmen: einst.schichten.ausnahmen, woerter: einst.tage,
    keineAufgaben: z.keineAufgaben === heute ? heute : null,
  });
}

// Phase (a): Schichten schreiben, benötigte Strecken an den Kurzbefehl geben
// (getrennte Listen "rad" und "auto" mit {von, nach}).
async function phaseA() {
  const { einst, cache } = await laden();
  pruefen(einst);
  const jetzt = new Date();
  const z = await zustandLaden();
  await log('--- Planen Phase a ---');
  const info = await tagesInfoLesen(einst, jetzt, z, (einst.schichten.wochen || 8) * 7);
  z.schichtRec = await KAL.schichtenSchreiben(einst, jetzt, log, { freieTage: T.freieTage(info), rec: z.schichtRec });
  const termine = await termineMitOrt(einst, jetzt, z);
  await zustandSpeichern(z);
  const ablauf = A.berechneAblauf(termine, { einst, fahrzeit: k => F.cacheWert(cache, k) });
  const heute = D.ymd(jetzt);
  const fehlen = ablauf.strecken.filter(s => !F.istFrisch(cache, s.key, heute, einst.regeln.cacheTage));
  const sichere = [einst.orte.zuhause.adresse, einst.orte.arbeit.adresse];
  let { gut, schlecht } = await ORT.streckenPruefen(fehlen, heute, log, sichere);
  // Nicht gefunden, aber der Termin läuft gerade? Dann bin ich dort: Standort lernen und neu prüfen.
  if (schlecht.length && await ORT.standortLernen(termine, jetzt, log)) {
    ({ gut, schlecht } = await ORT.streckenPruefen(fehlen, heute, log, sichere));
  }
  // Nur sichere Orte an "Wegzeit abrufen" geben (sonst bricht der ganze Kurzbefehl ab),
  // für die anderen die Fahrzeit aus der Luftlinie schätzen.
  const noetig = gut.filter(s => s.sicher);
  let geschaetzt = 0;
  for (const s of gut.filter(x => !x.sicher)) {
    const min = F.schaetzung(s.vonKoord, s.nachKoord, s.modus);
    if (min == null) { await log(`Fahrzeit unbekannt (keine Koordinaten): ${s.von} -> ${s.nach} – nehme ${einst.regeln.fallbackMin} min.`); continue; }
    cache[s.key] = { min, datum: heute, geschaetzt: true };
    geschaetzt++;
    await log(`Fahrzeit geschätzt (Luftlinie, ${s.modus}): ${s.von} -> ${s.nach} = ${min} min`);
  }
  if (geschaetzt) await DAT.schreiben('fahrzeiten.json', cache);
  for (const x of schlecht) {
    if (x.ignoriert) continue;
    await log(`WARNUNG Ort nicht gefunden: "${x.ort}" (${x.fehler}) – nehme ${einst.regeln.fallbackMin} min. In "Planer" → "Einstellungen" → "Gelernte Orte" kannst du die Adresse eintragen.`);
  }
  const { ausgabe, offen } = F.streckenAufteilen(noetig);
  await DAT.schreiben('offen.json', { erstellt: jetzt.toISOString(), ...offen });
  await log(`${termine.length} Termine, ${ablauf.strecken.length} Strecken, abfragen: ${ausgabe.rad.length} Rad, ${ausgabe.auto.length} Auto, ${schlecht.length} Ort(e) nicht gefunden.`);
  return ausgabe;
}

// Phase (b): Fahrzeiten übernehmen, planen, Kalender + Mitteilungen schreiben, Wecker zurückgeben.
async function phaseB(text) {
  const { einst, aufgaben, cache } = await laden();
  pruefen(einst);
  const jetzt = new Date();
  await log('--- Planen Phase b ---');
  const offen = await DAT.lesen('offen.json', { strecken: {}, rad: [], auto: [] });
  await log(`Vom Kurzbefehl erhalten: ${JSON.stringify(String(text).slice(0, 600))}`);
  const erg = F.ergebnisseLesen(text, offen);
  for (const e of erg) {
    const s = offen.strecken[e.id];
    await log(`Fahrzeit ${s.modus} ${s.von} -> ${s.nach}: "${e.roh}" = ${e.min == null ? 'unlesbar' : e.min + ' min'}`);
  }
  const fehlend = Object.keys(offen.strecken || {}).length - erg.filter(e => e.min != null).length;
  if (fehlend > 0) await log(`${fehlend} Fahrzeit(en) fehlen, nehme alte Werte oder ${einst.regeln.fallbackMin} min.`);
  F.cacheAktualisieren(cache, erg, D.ymd(jetzt));
  await DAT.schreiben('fahrzeiten.json', cache);
  const plan = await planenUndSchreiben(einst, aufgaben, cache, jetzt, { mitWecker: true });
  return { wecker: plan.wecker, anzahl: plan.wecker.length, bloecke: plan.bloecke.length };
}

// Wetter für Zuhause (Open-Meteo, ohne Anmeldung). Lage auf ca. 1 km gerundet, 2 Stunden gemerkt.
async function wetterLaden(einst, jetzt, z) {
  if (!einst.regen.an || !einst.orte.zuhause.adresse) return () => null;
  try {
    const adr = einst.orte.zuhause.adresse;
    if (!z.heimKoord || z.heimKoord.adresse !== adr) {
      const g = await ORT.koordinaten(adr);
      if (!g) { await log('WARNUNG Wetter: Adresse Zuhause nicht gefunden.'); return () => null; }
      z.heimKoord = { adresse: adr, lat: R.runden(g.lat), lon: R.runden(g.lon) };
    }
    const alt = z.wetter;
    if (!alt || jetzt - new Date(alt.abgerufen) > 2 * 3600000) {
      const r = new Request(R.wetterUrl(z.heimKoord.lat, z.heimKoord.lon));
      r.timeoutInterval = 10;
      z.wetter = { abgerufen: jetzt.toISOString(), daten: await r.loadJSON() };
    }
    return R.regenFunktion(z.wetter.daten);
  } catch (e) {
    await log(`WARNUNG Wetter nicht verfügbar: ${e}`);
    return z.wetter ? R.regenFunktion(z.wetter.daten) : () => null;
  }
}

// Heute schon erledigte Aufgaben (für den Tagesabschluss)
async function erledigtHeute(jetzt, aufgaben) {
  const heute = D.ymd(jetzt);
  const ged = await DAT.lesen('gedaechtnis.json', G.leer());
  const ids = new Set(ged.ereignisse.filter(e => e.t.slice(0, 10) === jetzt.toISOString().slice(0, 10) && ['erledigt', 'nichtnoetig', 'abgehakt'].includes(e.typ)).map(e => e.id));
  for (const a of aufgaben) if (a.letzte === heute) ids.add(a.id);
  return ids;
}

// Einkauf, Medikamente, Müll, Folgeaufgaben
async function alltagVorbereiten(einst, jetzt, z) {
  const heute = D.ymd(jetzt);
  const aufgaben = [], mitteilungen = [];
  try {
    const ek = AL.einkaufAufgabe(await ERI.einkaufLesen(einst, log), einst.einkauf, heute);
    if (ek) aufgaben.push(ek);
  } catch (e) { await log(`WARNUNG Einkaufsliste: ${e}`); }
  if (einst.medikamente.an) {
    const meds = await medsLaden();
    mitteilungen.push(...AL.medMitteilungen(meds, z.medStatus, jetzt, einst.medikamente));
    const ap = AL.medNachkauf(meds, heute);
    if (ap) aufgaben.push(ap);
  }
  try {
    mitteilungen.push(...AL.muellMitteilungen(await KAL.muellLesen(einst, jetzt), jetzt, einst.muell));
  } catch (e) { await log(`WARNUNG Müllkalender: ${e}`); }
  // offene Folgeaufgaben (höchstens 4 Stunden alt) wieder ankündigen
  const { aufgaben: alle } = await laden();
  z.folgen = (z.folgen || []).filter(f => jetzt - new Date(f.erledigtUm) < 4 * 3600000);
  for (const f of z.folgen) {
    const a = alle.find(x => x.id === f.id);
    if (a) mitteilungen.push(...AL.folgeMitteilungen(a, new Date(f.erledigtUm)));
  }
  return { aufgaben, mitteilungen };
}

// opt.mitWecker: vom Kurzbefehl (Wecker werden gestellt); sonst Neuplanen in Scriptable (Wecker bleiben)
async function planenUndSchreiben(einst, aufgabenAlt, cache, jetzt, opt) {
  const z = await zustandLaden();
  // In der Erinnerungen-App Abgehaktes zuerst übernehmen
  const abgehakt = await ERI.erledigteLesen(einst, log);
  await SON.erledigtMelden(abgehakt.filter(e => SON.istSonder(e.id)));
  const ueb = AK.erledigteUebernehmen(aufgabenAlt, abgehakt.filter(e => !SON.istSonder(e.id)));
  let aufgaben = ueb.aufgaben;
  if (ueb.meldungen.length) {
    await aufgabenSpeichern(aufgaben);
    for (const m of ueb.meldungen) await log(m);
  }
  for (const e of abgehakt) await gedaechtnis({ typ: 'abgehakt', id: e.id }, jetzt);
  // Einmal am Tag lernen (kleine Anpassungen automatisch, große als Vorschlag)
  if (einst.lernen.an && z.gelerntAm !== D.ymd(jetzt)) {
    aufgaben = await lernenAnwenden(aufgaben, jetzt);
    z.gelerntAm = D.ymd(jetzt);
  }
  // Geburtstage, Fristen, Blumen, Checklisten
  let extra = { aufgaben: [], mitteilungen: [], checklisten: [] };
  try {
    extra = await SON.vorbereiten(einst, jetzt, log);
  } catch (e) {
    await log(`FEHLER bei Geburtstagen/Fristen/Blumen: ${e && e.stack ? e.stack : e}`);
  }
  let alltag = { aufgaben: [], mitteilungen: [] };
  try {
    alltag = await alltagVorbereiten(einst, jetzt, z);
  } catch (e) {
    await log(`FEHLER bei Einkauf/Medikamenten/Müll: ${e && e.stack ? e.stack : e}`);
  }
  const sonderStatus = await SON.statusLaden();
  const alltagAufgaben = SO.statusAnwenden(alltag.aufgaben, sonderStatus, jetzt);

  const termine = await termineMitOrt(einst, jetzt, z);
  const info = await tagesInfoLesen(einst, jetzt, z, einst.regeln.tage + 1);
  const sperrTage = T.sperrTage(info);
  const bestehend = await KAL.planerBloeckeLesen(einst, jetzt);
  const fest = bestehend.filter(b => b.fest);
  const vorher = ((await DAT.lesen('plan.json', {})).bloecke || []);
  const regen = await wetterLaden(einst, jetzt, z);
  const plan = P.planen({
    termine, aufgaben: aufgaben.concat(extra.aufgaben, alltagAufgaben), einst, jetzt,
    fahrzeit: k => F.cacheWert(cache, k), sperrTage, fest, vorher, regen,
  });
  const aufsteh = R.aufstehWecker(plan.ablauf.fahrten, jetzt, einst.regeln, einst.aufstehen);
  plan.wecker = plan.wecker.concat(aufsteh).sort((a, b) => new Date(a.zeitpunkt) - new Date(b.zeitpunkt));
  for (const f of plan.ablauf.fahrten) if (f.regen != null) await log(`Regen ${f.regen} %: ${D.kurz(new Date(f.abfahrt))} ${D.hm(new Date(f.abfahrt))} ${f.modus} statt Rad zu ${f.zielName}`);
  const terminWarn = AL.terminWarnungen(plan.ablauf);
  await KAL.planerSchreiben(einst, plan, jetzt, log);
  await ERI.schreiben(einst, plan.bloecke, jetzt, log);
  const checks = SO.checklistenFuer(plan.ablauf.fahrten, extra.checklisten, jetzt, einst.regeln.ruheVorAbfahrt);
  if (checks.length) await log(`Checklisten: ${checks.map(c => `${D.kurz(new Date(c.zeit))} ${D.hm(new Date(c.zeit))} ${c.titel}`).join(', ')}`);
  // Tagesabschluss, Morgen-Überblick (heute und morgen), Hinweis am Blockende
  const kurzPlan = { bloecke: plan.bloecke, fahrten: plan.ablauf.fahrten, termine: plan.ablauf.termine, tagInfo: plan.tagInfo };
  const rhythmus = [
    R.tagesabschluss(kurzPlan, jetzt, einst.abschluss, einst.aufstehen, await erledigtHeute(jetzt, aufgaben)),
    R.morgenUeberblick(kurzPlan, D.ymd(jetzt), jetzt, einst.morgen, einst.aufstehen, einst.regeln),
    R.morgenUeberblick(kurzPlan, D.ymd(D.plusTage(jetzt, 1)), jetzt, einst.morgen, einst.aufstehen, einst.regeln),
  ].filter(Boolean).concat(R.blockEndeMitteilungen(plan.bloecke, jetzt, einst.blockEnde));
  // Wochenrückblick (Sonntag)
  if (einst.lernen.an) {
    const so = L.naechsterSonntag(jetzt, einst.lernen.rueckblick);
    const st = await lernstandLaden();
    if (so) {
      const text = L.wochenrueckblick(await DAT.lesen('gedaechtnis.json', G.leer()), aufgaben, jetzt, P.faelligAm, st.vorschlaege.length);
      rhythmus.push({ id: `planer-rueckblick-${D.ymd(so)}`, zeit: so, titel: 'Wochenrückblick', text: [text, ...st.hinweise].join('\n') });
    }
  }
  const entfernt = await MIT.alteEntfernen();
  const angekuendigt = await MIT.bloeckeAnkuendigen(plan.bloecke, jetzt);
  const weitere = await MIT.weitereAnkuendigen(alltag.mitteilungen.concat(rhythmus, checks, extra.mitteilungen), jetzt, angekuendigt);
  await MIT.wachhundStellen(einst.wachhund, jetzt, `${D.kurz(jetzt)} ${D.hm(jetzt)}`);
  await log(`Mitteilungen: ${entfernt} alte entfernt, ${angekuendigt} Aufgaben + ${weitere} weitere geplant.`);

  const vorherPlan = await DAT.lesen('plan.json', {});
  const warnText = plan.warnungen.map(w => `${w.name} (fällig ${D.deutschDatum(w.faellig)})`).join(', ');
  const terminText = terminWarn.map(w => w.text).join('; ');
  if (warnText && warnText !== vorherPlan.warnText) {
    await MIT.sofort('Planer: passt nicht', `Kein Platz in den nächsten ${einst.regeln.tage} Tagen für: ${warnText}`);
  }
  if (terminText && terminText !== vorherPlan.terminText) await MIT.sofort('Planer: Termine prüfen', terminText);
  if (warnText) await log(`WARNUNG kein Platz: ${warnText}`);
  if (terminText) await log(`WARNUNG Termine: ${terminText}`);
  for (const b of plan.bloecke) await log(`Block ${D.kurz(new Date(b.start))} ${D.hm(new Date(b.start))}-${D.hm(new Date(b.end))} ${b.name}${b.fest ? ' (fest)' : ''}`);
  for (const w of plan.wecker) await log(`Wecker ${w.zeit} ${w.name}`);

  // ohne Kurzbefehl bleiben die gestellten Wecker; vorbei sind nur die abgelaufenen
  const wecker = opt && opt.mitWecker ? plan.wecker : (vorherPlan.wecker || []).filter(w => new Date(w.zeitpunkt) > jetzt);
  await DAT.schreiben('plan.json', {
    erstellt: jetzt.toISOString(),
    bloecke: plan.bloecke,
    fahrten: plan.ablauf.fahrten,
    termine: plan.ablauf.termine.map(t => ({ titel: t.titel, start: t.start, end: t.end, art: t.art, ort: t.ort })),
    tagInfo: plan.tagInfo,
    tagesInfo: info,
    luecken: plan.tagesLuecken,
    wecker,
    warnungen: plan.warnungen,
    warnText,
    terminText,
  });
  z.letzterLauf = jetzt.toISOString();
  await zustandSpeichern(z);
  await updatePruefen(jetzt, z);
  return { ...plan, wecker };
}

// Einmal am Tag nachsehen, ob es eine neue Version gibt.
async function updatePruefen(jetzt, z) {
  const heute = D.ymd(jetzt);
  if (z.updateGeprueft === heute) return;
  try {
    const lokal = await lokaleVersion();
    if (!lokal) return;
    const r = new Request(`${QUELLE}manifest.json?t=${Date.now()}`);
    r.timeoutInterval = 10;
    const m = JSON.parse(await r.loadString());
    z.updateGeprueft = heute;
    await zustandSpeichern(z);
    if (m.version && m.version !== lokal) {
      await MIT.sofort('Planer: Update verfügbar', `Version ${m.version} (du hast ${lokal}). In Scriptable "Planer Update" antippen.`);
      await log(`Update verfügbar: ${m.version} (installiert ${lokal}).`);
    }
  } catch (e) { await log(`Update-Prüfung nicht möglich: ${e}`); }
}

async function lokaleVersion() {
  try {
    const f = DAT.fm();
    const p = f.joinPath(f.joinPath(DAT.basisPfad(), 'planer'), 'version.json');
    if (!f.fileExists(p)) return null;
    return JSON.parse(f.readString(p)).version || null;
  } catch (e) { return null; }
}

// ---------- Lernen ----------

async function lernstandLaden() {
  return { gelernt: [], abgelehnt: {}, vorschlaege: [], hinweise: [], ...(await DAT.lesen('lernen.json', {})) };
}
async function lernstandSpeichern(st) { await DAT.schreiben('lernen.json', st); }

async function lernenAnwenden(aufgaben, jetzt) {
  const st = await lernstandLaden();
  const r = L.auswerten(await DAT.lesen('gedaechtnis.json', G.leer()), aufgaben, jetzt, st);
  let neu = aufgaben;
  for (const a of r.auto) {
    neu = L.anwenden(neu, a.id, a.feld, a.neu);
    st.gelernt.unshift({ ...a, datum: D.ymd(jetzt) });
    await log(`Gelernt: ${a.name} ${a.feld} ${JSON.stringify(a.alt)} -> ${JSON.stringify(a.neu)} (${a.grund})`);
  }
  st.gelernt = st.gelernt.slice(0, 50);
  st.vorschlaege = r.vorschlaege;
  st.hinweise = r.hinweise;
  await lernstandSpeichern(st);
  if (r.auto.length) await aufgabenSpeichern(neu);
  return neu;
}

// Vorschlag übernehmen / ablehnen, Gelerntes rückgängig machen
async function lernAktion(art, eintrag) {
  const st = await lernstandLaden();
  const { aufgaben } = await laden();
  const k = L.schluessel(eintrag.id, eintrag.feld);
  if (art === 'uebernehmen') {
    await aufgabenSpeichern(L.anwenden(aufgaben, eintrag.id, eintrag.feld, eintrag.neu));
    st.gelernt.unshift({ ...eintrag, datum: D.ymd(new Date()) });
  }
  if (art === 'ablehnen' || art === 'rueckgaengig') st.abgelehnt[k] = D.ymd(new Date());
  if (art === 'rueckgaengig') {
    await aufgabenSpeichern(L.anwenden(aufgaben, eintrag.id, eintrag.feld, eintrag.alt));
    st.gelernt = st.gelernt.filter(g => g !== eintrag && !(g.id === eintrag.id && g.feld === eintrag.feld && g.datum === eintrag.datum));
  }
  st.vorschlaege = st.vorschlaege.filter(v => L.schluessel(v.id, v.feld) !== k);
  await lernstandSpeichern(st);
  await log(`Lernen: ${art} ${eintrag.name} ${eintrag.feld}`);
}

// Neu planen ohne Kurzbefehl (gespeicherte Fahrzeiten, Wecker bleiben)
async function neuPlanen() {
  const { einst, aufgaben, cache } = await laden();
  pruefen(einst);
  await log('--- Neu planen (ohne Kurzbefehl) ---');
  return planenUndSchreiben(einst, aufgaben, cache, new Date(), { mitWecker: false });
}

// Aus der App: Test mit Schichten, aber ohne Fahrzeit-Abfrage und ohne Wecker
async function ohneKurzbefehl() {
  await phaseA();
  return neuPlanen();
}

function kurzbefehlStarten(name) {
  Safari.open(`shortcuts://run-shortcut?name=${encodeURIComponent(name || KURZBEFEHL)}`);
}

// Knopf aus Mitteilung oder Tagesplan. Plant danach direkt neu (Aufgaben ändern keine Abfahrten).
// opt.ohneNeuplanen: mehrere Aktionen hintereinander (Sprache), danach einmal neu planen
async function aktion(q, opt) {
  q = q || {};
  opt = opt || {};
  const jetzt = new Date();
  const z = await zustandLaden();

  if (q.aktion === 'med') {
    const r = AL.medGenommen(await medsLaden(), z.medStatus, q.k, jetzt);
    await medsSpeichern(r.meds);
    z.medStatus = r.status;
    await zustandSpeichern(z);
    const [id, datum, zeit] = String(q.k).split('|');
    await MIT.entfernen([`planer-med-${id}-${datum}-${String(zeit).replace(':', '')}`]);
    await gedaechtnis({ typ: 'medikament', id }, jetzt);
    await log(`Medikament genommen: ${q.k}`);
    return;
  }
  if (q.aktion === 'folgeok') {
    z.folgen = (z.folgen || []).filter(f => f.id !== q.id);
    await zustandSpeichern(z);
    await MIT.entfernen([`planer-folge-${q.id}`]);
    await gedaechtnis({ typ: 'folge', id: q.id }, jetzt);
    await log(`Folgeaufgabe erledigt: ${q.id}`);
    return;
  }

  if (q.aktion === 'allesok') {
    const ids = String(q.ids || '').split(',').filter(Boolean);
    const { aufgaben } = await laden();
    let neu = aufgaben;
    for (const id of ids) {
      if (SON.istSonder(id)) await SON.aktion({ aktion: 'erledigt', id }, jetzt);
      else neu = AK.aktionAnwenden(neu, { aktion: 'erledigt', id }, jetzt).aufgaben;
      await gedaechtnis({ typ: 'erledigt', id, quelle: 'tagesabschluss' }, jetzt);
    }
    await aufgabenSpeichern(neu);
    await log(`Tagesabschluss: ${ids.length} als erledigt markiert.`);
    await neuPlanen();
    return;
  }

  const vorher = await DAT.lesen('plan.json', {});
  const block = G.passenderBlock(vorher.bloecke, q.id, jetzt);
  if (SON.istSonder(q.id)) {
    await log(`Knopf: ${await SON.aktion(q, jetzt)}`);
    const { einst } = await laden();
    if (q.aktion === 'erledigt' && /^einkauf-/.test(q.id)) await log(`Einkaufsliste: ${await ERI.einkaufAbhaken(einst, log)} Sachen abgehakt.`);
    if (q.aktion === 'erledigt' && /^apotheke-/.test(q.id)) await apothekeErledigt();
  } else {
    const { aufgaben } = await laden();
    const r = AK.aktionAnwenden(aufgaben, q, jetzt);
    await aufgabenSpeichern(r.aufgaben);
    await log(`Knopf: ${r.meldung}`);
    const a = r.aufgaben.find(x => x.id === q.id);
    if (q.aktion === 'erledigt' && a && a.folge) {
      z.folgen = (z.folgen || []).filter(f => f.id !== a.id).concat([{ id: a.id, erledigtUm: jetzt.toISOString() }]);
      await zustandSpeichern(z);
    }
  }
  await gedaechtnis({
    typ: q.aktion, id: q.id,
    geplantStart: block ? new Date(block.start).toISOString() : null,
    geplantEnde: block ? new Date(block.end).toISOString() : null,
  }, jetzt);
  if (!opt.ohneNeuplanen) await neuPlanen();
}

// Nach "Apotheke erledigt": Vorrat um eine Packung erhöhen (wenn Packungsgröße bekannt)
async function apothekeErledigt() {
  const meds = await medsLaden();
  const neu = meds.map(m => (m.packung && AL.medVorratTage(m) != null && AL.medVorratTage(m) <= (m.nachkaufenTage || 7)
    ? { ...m, vorrat: (m.vorrat || 0) + m.packung } : m));
  await medsSpeichern(neu);
  await log('Apotheke erledigt: Vorrat aufgefüllt, wo die Packungsgröße bekannt ist.');
}

async function gedaechtnis(ereignis, jetzt) {
  const g = G.eintragen(await DAT.lesen('gedaechtnis.json', G.leer()), ereignis, jetzt);
  await DAT.schreiben('gedaechtnis.json', g);
}

// Automation "Beim Verlassen von Zuhause": echte Abfahrt merken (für das Lernen)
async function abfahrtMerken() {
  const jetzt = new Date();
  const plan = await DAT.lesen('plan.json', {});
  const geplant = (plan.fahrten || [])
    .filter(f => f.vonArt === 'zuhause')
    .map(f => ({ f, abstand: Math.abs(new Date(f.abfahrt) - jetzt) }))
    .sort((a, b) => a.abstand - b.abstand)[0];
  const passt = geplant && geplant.abstand < 90 * 60000 ? geplant.f : null;
  await gedaechtnis({
    typ: 'abfahrt', ziel: passt ? passt.zielName : null, modus: passt ? passt.modus : null,
    geplant: passt ? new Date(passt.abfahrt).toISOString() : null,
  }, jetzt);
  await log(passt ? `Abfahrt zu ${passt.zielName}: geplant ${D.hm(new Date(passt.abfahrt))}, tatsächlich ${D.hm(jetzt)}.` : `Abfahrt ${D.hm(jetzt)} (keine geplante Fahrt in der Nähe).`);
}

// "Heute keine Aufgaben" an/aus
async function heuteKeineAufgaben(an) {
  const z = await zustandLaden();
  z.keineAufgaben = an ? D.ymd(new Date()) : null;
  await zustandSpeichern(z);
  await log(an ? 'Heute keine Aufgaben.' : 'Heute wieder Aufgaben.');
}

// Rückstand nach Urlaub/Krankheit: alles Überfällige gilt als "nicht nötig"
async function rueckstandAufloesen() {
  const { aufgaben } = await laden();
  const r = AK.rueckstandAufloesen(aufgaben, D.ymd(new Date()), P.faelligAm);
  await aufgabenSpeichern(r.aufgaben);
  await log(`Rückstand aufgelöst: ${r.anzahl} Aufgaben neu ab heute.`);
  return r.anzahl;
}

async function fehler(e) {
  await log(`FEHLER: ${e && e.stack ? e.stack : e}`);
  try { await MIT.sofort('Planer: Fehler', String(e && e.message ? e.message : e)); } catch (x) { /* egal */ }
  await DAT.logSchreiben();
}

async function abschluss() { await DAT.logSchreiben(); }

module.exports = {
  KURZBEFEHL, laden, einstellungenSpeichern, aufgabenSpeichern, zustandLaden, zustandSpeichern, medsLaden, medsSpeichern,
  phaseA, phaseB, neuPlanen, ohneKurzbefehl, kurzbefehlStarten, aktion, abfahrtMerken, heuteKeineAufgaben, rueckstandAufloesen,
  lernstandLaden, lernAktion, fehler, abschluss,
};
