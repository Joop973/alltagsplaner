// Scriptable: Abläufe "Planer Planen" (Phase a/b), Planen ohne Kurzbefehl, Knöpfe aus Mitteilungen.
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
const DAT = hole('adapter/dateien');
const KAL = hole('adapter/kalender');
const MIT = hole('adapter/mitteilungen');
const ORT = hole('adapter/orte');

const KURZBEFEHL = 'Planer planen';
const log = t => DAT.log(t);

async function laden() {
  const einst = S.zusammenfuehren(S.standardEinstellungen(), await DAT.lesen('einstellungen.json', {}));
  const aufgaben = await DAT.lesen('aufgaben.json', null) || S.standardAufgaben();
  const cache = await DAT.lesen('fahrzeiten.json', {});
  return { einst, aufgaben, cache };
}

async function einstellungenSpeichern(einst) { await DAT.schreiben('einstellungen.json', einst); }
async function aufgabenSpeichern(aufgaben) { await DAT.schreiben('aufgaben.json', aufgaben); }

function pruefen(einst) {
  if (!einst.eingerichtet) throw new Error('Bitte zuerst in "Planer" die Ersteinrichtung machen.');
}

// Phase (a): Schichten schreiben, benötigte Strecken an den Kurzbefehl geben
// (getrennte Listen "rad" und "auto" mit {von, nach}).
async function phaseA() {
  const { einst, cache } = await laden();
  pruefen(einst);
  const jetzt = new Date();
  await log('--- Planen Phase a ---');
  await KAL.schichtenSchreiben(einst, jetzt, log);
  const termine = await KAL.termineLesen(einst, jetzt);
  const ablauf = A.berechneAblauf(termine, { einst, fahrzeit: k => F.cacheWert(cache, k) });
  const heute = D.ymd(jetzt);
  const fehlen = ablauf.strecken.filter(s => !F.istFrisch(cache, s.key, heute, einst.regeln.cacheTage));
  const { gut: noetig, schlecht } = await ORT.streckenPruefen(fehlen, heute);
  for (const x of schlecht) {
    await log(`WARNUNG Ort nicht gefunden: "${x.ort}" – nehme ${einst.regeln.fallbackMin} min. Tipp: im Termin die genaue Adresse eintragen.`);
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
  const plan = await planenUndSchreiben(einst, aufgaben, cache, jetzt);
  return { wecker: plan.wecker, anzahl: plan.wecker.length, bloecke: plan.bloecke.length };
}

async function planenUndSchreiben(einst, aufgaben, cache, jetzt) {
  const termine = await KAL.termineLesen(einst, jetzt);
  const plan = P.planen({ termine, aufgaben, einst, jetzt, fahrzeit: k => F.cacheWert(cache, k) });
  await KAL.planerSchreiben(einst, plan, jetzt, log);
  const entfernt = await MIT.alteEntfernen();
  const angekuendigt = await MIT.bloeckeAnkuendigen(plan.bloecke, jetzt);
  await log(`Mitteilungen: ${entfernt} alte entfernt, ${angekuendigt} geplant.`);

  const vorher = await DAT.lesen('plan.json', {});
  const warnText = plan.warnungen.map(w => `${w.name} (fällig ${D.deutschDatum(w.faellig)})`).join(', ');
  if (warnText && warnText !== vorher.warnText) {
    await MIT.sofort('Planer: passt nicht', `Kein Platz in den nächsten ${einst.regeln.tage} Tagen für: ${warnText}`);
  }
  if (warnText) await log(`WARNUNG kein Platz: ${warnText}`);
  for (const b of plan.bloecke) await log(`Block ${D.kurz(new Date(b.start))} ${D.hm(new Date(b.start))}-${D.hm(new Date(b.end))} ${b.name}`);
  for (const w of plan.wecker) await log(`Wecker ${w.zeit} ${w.name}`);

  await DAT.schreiben('plan.json', {
    erstellt: jetzt.toISOString(),
    bloecke: plan.bloecke,
    fahrten: plan.ablauf.fahrten,
    wecker: plan.wecker,
    warnungen: plan.warnungen,
    warnText,
  });
  return plan;
}

// Aus der App: planen mit gespeicherten Fahrzeiten, ohne Wecker.
async function ohneKurzbefehl() {
  await phaseA();
  const { einst, aufgaben, cache } = await laden();
  return planenUndSchreiben(einst, aufgaben, cache, new Date());
}

function kurzbefehlStarten(name) {
  Safari.open(`shortcuts://run-shortcut?name=${encodeURIComponent(name || KURZBEFEHL)}`);
}

// Knopf aus Mitteilung
async function aktion(q) {
  const { aufgaben } = await laden();
  const r = AK.aktionAnwenden(aufgaben, q || {}, new Date());
  await aufgabenSpeichern(r.aufgaben);
  await log(`Knopf: ${r.meldung}`);
  kurzbefehlStarten(KURZBEFEHL); // sofort neu planen
}

async function fehler(e) {
  await log(`FEHLER: ${e && e.stack ? e.stack : e}`);
  try { await MIT.sofort('Planer: Fehler', String(e && e.message ? e.message : e)); } catch (x) { /* egal */ }
}

module.exports = {
  KURZBEFEHL, laden, einstellungenSpeichern, aufgabenSpeichern,
  phaseA, phaseB, ohneKurzbefehl, kurzbefehlStarten, aktion, fehler,
};
