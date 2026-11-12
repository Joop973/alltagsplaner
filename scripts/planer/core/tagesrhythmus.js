// Tagesrhythmus: Aufstehwecker, Tagesabschluss am Abend, Morgen-Überblick, Wetter, Widget-Zeilen.
// Reine Funktionen, keine Scriptable-Funktionen.
'use strict';

function hole(n) {
  if (typeof require === 'function') return require('./' + n);
  try { return importModule('planer/core/' + n); } catch (e) { return importModule(n); }
}
const D = hole('datum');

// ---------- Wetter (Open-Meteo, stündlich) ----------
// daten: Antwort von Open-Meteo {hourly: {time: ['2026-11-12T07:00', ...], precipitation_probability: [..]}}
// -> Funktion zeitpunkt -> Regenwahrscheinlichkeit (%) der Stunde, oder null
function regenFunktion(daten) {
  const h = daten && daten.hourly;
  if (!h || !Array.isArray(h.time) || !Array.isArray(h.precipitation_probability)) return () => null;
  const nachStunde = new Map();
  h.time.forEach((t, i) => nachStunde.set(String(t).slice(0, 13), h.precipitation_probability[i]));
  return zeitpunkt => {
    const d = new Date(zeitpunkt);
    const k = `${D.ymd(d)}T${D.zwei(d.getHours())}`;
    const w = nachStunde.get(k);
    return typeof w === 'number' ? w : null;
  };
}

// Koordinaten auf 2 Nachkommastellen runden (ca. 1 km) – mehr verlässt das iPhone nicht
function runden(koord) { return Math.round(Number(koord) * 100) / 100; }

function wetterUrl(lat, lon) {
  return `https://api.open-meteo.com/v1/forecast?latitude=${runden(lat)}&longitude=${runden(lon)}`
    + '&hourly=precipitation_probability&timezone=Europe%2FBerlin&forecast_days=3';
}

// ---------- Aufstehwecker ----------
// Erste Abfahrt des Tages zu einem Termin vor "nurVor" -> Wecker "vorlauf" Minuten vorher.
// cfg: {an, vorlauf, nurVor}
function erstesLos(fahrten, datum) {
  return (fahrten || [])
    .filter(f => f.zuTermin && D.ymd(new Date(f.abfahrt)) === datum)
    .sort((a, b) => new Date(a.abfahrt) - new Date(b.abfahrt))[0] || null;
}

function aufstehZeit(fahrten, datum, cfg) {
  if (!cfg || !cfg.an) return null;
  const f = erstesLos(fahrten, datum);
  if (!f) return null;
  const ab = new Date(f.abfahrt);
  if (ab >= D.mitUhrzeit(D.ausYmd(datum), cfg.nurVor)) return null;
  return { zeitpunkt: D.plusMin(ab, -cfg.vorlauf), fahrt: f };
}

function aufstehWecker(fahrten, jetzt, regeln, cfg) {
  const grenze = jetzt.getTime() + regeln.weckerStunden * 3600000;
  const w = [];
  for (let i = 0; i < 2; i++) {
    const a = aufstehZeit(fahrten, D.ymd(D.plusTage(jetzt, i)), cfg);
    if (!a || a.zeitpunkt <= jetzt || a.zeitpunkt.getTime() > grenze) continue;
    w.push({
      zeit: D.hm(a.zeitpunkt), zeitpunkt: a.zeitpunkt.toISOString(),
      name: `Planer: Aufstehen (los ${D.hm(new Date(a.fahrt.abfahrt))} zu ${a.fahrt.zielName})`,
    });
  }
  return w;
}

// ---------- Texte ----------
function regenHinweis(f) {
  return f && f.regen != null ? ` – Regen ${f.regen} %: ${f.modus} statt Rad` : '';
}

function tagesTeile(plan, datum) {
  const termine = (plan.termine || []).filter(t => D.ymd(new Date(t.start)) === datum);
  const bloecke = (plan.bloecke || []).filter(b => D.ymd(new Date(b.start)) === datum);
  const fahrten = (plan.fahrten || []).filter(f => f.zuTermin && D.ymd(new Date(f.abfahrt)) === datum);
  const teile = [];
  for (const t of termine) {
    const f = fahrten.find(x => x.zielName === t.titel && new Date(x.abfahrt) <= new Date(t.start));
    const los = f ? ` (los ${D.hm(new Date(f.abfahrt))}${regenHinweis(f)})` : '';
    teile.push({ zeit: new Date(t.start), text: `${D.hm(new Date(t.start))} ${t.titel}${los}` });
  }
  for (const b of bloecke) teile.push({ zeit: new Date(b.start), text: `${D.hm(new Date(b.start))} ${b.name}` });
  return teile.sort((a, b) => a.zeit - b.zeit).map(x => x.text);
}

// Morgen-Überblick: zur Aufstehzeit, sonst zum Aufgabenbeginn des Tages
// cfg: {an}, aufstehen: Aufsteh-Einstellungen, regeln: für tagStart / tagStartFrei
function morgenUeberblick(plan, datum, jetzt, cfg, aufstehen, regeln) {
  if (!cfg || !cfg.an) return null;
  const teile = tagesTeile(plan, datum);
  if (!teile.length) return null;
  const a = aufstehZeit(plan.fahrten, datum, aufstehen);
  const info = (plan.tagInfo || []).find(t => t.datum === datum);
  const start = a ? a.zeitpunkt : D.mitUhrzeit(D.ausYmd(datum), info && !info.arbeit && regeln.tagStartFrei ? regeln.tagStartFrei : regeln.tagStart);
  if (start <= jetzt) return null;
  return {
    id: `planer-morgen-${datum}`, zeit: start, titel: `Dein Tag · ${D.kurz(D.ausYmd(datum))}`,
    text: teile.join('\n'),
  };
}

// Tagesabschluss am Abend: offene Aufgaben von heute + Aufstehen/Bettzeit für morgen.
// erledigtHeute: Set von Aufgaben-IDs, die heute schon erledigt/abgehakt wurden
function tagesabschluss(plan, jetzt, cfg, aufstehen, erledigtHeute, geschafft) {
  if (!cfg || !cfg.an) return null;
  const heute = D.ymd(jetzt);
  const morgen = D.ymd(D.plusTage(jetzt, 1));
  const zeit = D.mitUhrzeit(jetzt, cfg.zeit);
  if (zeit <= jetzt) return null;
  const offen = (plan.bloecke || []).filter(b => D.ymd(new Date(b.start)) === heute && new Date(b.start) < zeit && !(erledigtHeute && erledigtHeute.has(b.aufgabeId)));
  const a = aufstehZeit(plan.fahrten, morgen, aufstehen);
  const zeilen = [];
  if (geschafft) zeilen.push(`Heute geschafft: ${geschafft}.`);
  if (offen.length) zeilen.push(`Offen von heute: ${offen.map(b => b.name).join(', ')}`);
  if (a) {
    const bett = D.plusMin(a.zeitpunkt, -(aufstehen.schlafStunden || 8) * 60);
    zeilen.push(`Morgen: aufstehen ${D.hm(a.zeitpunkt)}, los ${D.hm(new Date(a.fahrt.abfahrt))} zu ${a.fahrt.zielName}${regenHinweis(a.fahrt)}.`);
    zeilen.push(`Für ${aufstehen.schlafStunden || 8} Stunden Schlaf: ins Bett um ${D.hm(bett)}.`);
  }
  if (!zeilen.length) return null;
  return {
    id: `planer-abschluss-${heute}`, zeit, titel: 'Tagesabschluss', text: zeilen.join('\n'),
    aktion: offen.length ? { art: 'abschluss', ids: offen.map(b => b.aufgabeId) } : null,
  };
}

// Hinweis am Blockende (Option): "Zeit um – fertig?"
function blockEndeMitteilungen(bloecke, jetzt, cfg) {
  if (!cfg || !cfg.an) return [];
  return (bloecke || [])
    .filter(b => new Date(b.end) > jetzt && !b.unterwegs)
    .map(b => ({
      id: `planer-ende-${b.aufgabeId}-${new Date(b.end).getTime()}`, zeit: new Date(b.end),
      titel: `Zeit um: ${b.name}`, text: 'Fertig?', aktion: { art: 'blockende', id: b.aufgabeId, ende: new Date(b.end).toISOString() },
    }));
}

// ---------- Widget ----------
// Die nächsten n Punkte ab jetzt (Abfahrten, Termine, Aufgaben) als kurze Zeilen
function widgetZeilen(plan, jetzt, n) {
  const p = [];
  for (const f of plan.fahrten || []) {
    if (!f.zuTermin) continue;
    p.push({ zeit: new Date(f.abfahrt), ende: new Date(f.ankunft), text: `los zu ${f.zielName}${f.regen != null ? ' (Auto, Regen)' : ''}`, art: 'fahrt' });
  }
  for (const t of plan.termine || []) p.push({ zeit: new Date(t.start), ende: new Date(t.end), text: t.titel, art: 'termin' });
  for (const b of plan.bloecke || []) p.push({ zeit: new Date(b.start), ende: new Date(b.end), text: b.name, art: 'aufgabe' });
  return p
    .filter(x => x.ende > jetzt)
    .sort((a, b) => a.zeit - b.zeit)
    .slice(0, n)
    .map(x => ({
      art: x.art,
      text: x.text,
      zeit: D.ymd(x.zeit) === D.ymd(jetzt) ? D.hm(x.zeit) : `${D.kurz(x.zeit).slice(0, 2)} ${D.hm(x.zeit)}`,
      zeitpunkt: x.zeit.toISOString(),
    }));
}

module.exports = {
  regenFunktion, runden, wetterUrl, erstesLos, aufstehZeit, aufstehWecker, tagesTeile,
  morgenUeberblick, tagesabschluss, blockEndeMitteilungen, widgetZeilen,
};
