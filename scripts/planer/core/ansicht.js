// Anzeige: ruhige dunkle Farben, Symbole, Zeitleiste und "Jetzt / Als Nächstes". Reine Funktionen.
// Farben angelehnt an die Okabe-Ito-Palette (auch bei Farbenschwäche unterscheidbar), gedämpft für dunklen Hintergrund.
'use strict';

function hole(n) {
  if (typeof require === 'function') return require('./' + n);
  try { return importModule('planer/core/' + n); } catch (e) { return importModule(n); }
}
const D = hole('datum');

const FARBEN = {
  hintergrund: '#1A1D21',
  karte: '#24282E',
  leer: '#2F343B',
  text: '#E3E5E8',
  leise: '#8F96A0',
  aufgabe: '#4FA38A',  // Blaugrün
  termin: '#6FA8CC',   // Himmelblau
  arbeit: '#4F7FA8',   // Blau
  fahrt: '#C99A4B',    // Orange
  ruhe: '#9C7F96',     // Rötliches Lila
  pause: '#6B7280',    // Grau
  hinweis: '#C2866A',  // gedämpftes Zinnober (statt Rot)
  erfolg: '#7FB59A',
};

// Deckkraft je Art für den Sperrbildschirm (dort nur eine Farbe)
const MONO = { aufgabe: 1, fahrt: 0.85, termin: 0.6, arbeit: 0.6, ruhe: 0.35, pause: 0.3 };

const NAMEN = { pause: 'Pause', ruhe: 'Ruhe vor der Abfahrt' };

// SF Symbols (in iOS enthalten)
const SYMBOLE = [
  [/bad|dusche|wc|toilette/i, 'shower.fill'],
  [/aufhäng|aufhaeng/i, 'tshirt.fill'],
  [/bettwäsche|bettwaesche|bett/i, 'bed.double.fill'],
  [/wäsche|waesche|wasch/i, 'washer.fill'],
  [/saug|staub|wisch|putz|fenster/i, 'sparkles'],
  [/einkauf|besorg|kaufen/i, 'cart.fill'],
  [/apotheke|medikament|tablette/i, 'pills.fill'],
  [/geschenk/i, 'gift.fill'],
  [/blume|pflanz|gieß|giess/i, 'leaf.fill'],
  [/müll|muell|abfall|tonne/i, 'trash.fill'],
  [/küche|kueche|abwasch|spül|spuel|koch/i, 'fork.knife'],
  [/frist|tüv|tuev|steuer|vertrag|antrag|formular/i, 'doc.text.fill'],
];

function symbolFuer(e) {
  if (!e) return 'circle';
  if (e.art === 'fahrt') return e.modus === 'Fahrrad' ? 'bicycle' : 'car.fill';
  if (e.art === 'arbeit') return 'briefcase.fill';
  if (e.art === 'pause') return 'cup.and.saucer.fill';
  if (e.art === 'ruhe') return 'hourglass';
  if (e.art === 'termin') return 'calendar';
  const name = e.titel || e.name || '';
  for (const [re, s] of SYMBOLE) if (re.test(name)) return s;
  return 'checkmark.circle';
}

function farbeFuer(art) { return FARBEN[art] || FARBEN.leise; }

// Alle Abschnitte eines Tages: Termine, Arbeit, Fahrten, Aufgaben, Pause nach dem Heimkommen,
// Ruhe vor der Abfahrt. opt: {pause, ruhe} in Minuten.
// -> [{start: Date, end: Date, art, titel, modus?}] nach Beginn sortiert
function segmente(plan, datum, opt) {
  const o = { pause: 15, ruhe: 30, ...(opt || {}) };
  const tagVon = D.ausYmd(datum), tagBis = D.plusTage(tagVon, 1);
  const liste = [];
  const dazu = (start, end, art, titel, extra) => {
    const s = new Date(Math.max(new Date(start), tagVon)), e = new Date(Math.min(new Date(end), tagBis));
    if (e > s) liste.push({ start: s, end: e, art, titel, ...(extra || {}) });
  };
  for (const t of (plan && plan.termine) || []) dazu(t.start, t.end, t.art === 'arbeit' ? 'arbeit' : 'termin', t.titel);
  for (const f of (plan && plan.fahrten) || []) {
    if (!(f.minuten > 0)) continue;
    const ziel = f.nachArt === 'zuhause' ? 'nach Hause' : `zu ${f.zielName}`;
    dazu(f.abfahrt, f.ankunft, 'fahrt', `${f.modus === 'Fahrrad' ? 'Rad' : 'Auto'} ${ziel}`, { modus: f.modus });
    if (f.nachArt === 'zuhause' && o.pause > 0) dazu(f.ankunft, D.plusMin(new Date(f.ankunft), o.pause), 'pause', NAMEN.pause);
    if (f.vonArt === 'zuhause' && o.ruhe > 0) dazu(D.plusMin(new Date(f.abfahrt), -o.ruhe), f.abfahrt, 'ruhe', NAMEN.ruhe);
  }
  for (const b of (plan && plan.bloecke) || []) dazu(b.start, b.end, 'aufgabe', b.name, { aufgabeId: b.aufgabeId });
  return liste.sort((a, b) => a.start - b.start || RANG[a.art] - RANG[b.art]);
}

// Wichtigeres zuerst, wenn sich Abschnitte überlappen
const RANG = { aufgabe: 0, fahrt: 1, termin: 2, arbeit: 3, ruhe: 4, pause: 5 };

// Was ist jetzt, was kommt als Nächstes, wie viel Zeit bleibt?
// -> {aktuell, naechstes, bis: Date|null, anteil: 0..1 (Rest, schrumpft), text: "noch 25 min" / "in 40 min"}
function jetztUndDanach(plan, jetzt, opt) {
  const heute = D.ymd(jetzt), morgen = D.ymd(D.plusTage(jetzt, 1));
  const alle = [...segmente(plan, heute, opt), ...segmente(plan, morgen, opt)];
  const laufend = alle.filter(s => s.start <= jetzt && jetzt < s.end).sort((a, b) => RANG[a.art] - RANG[b.art]);
  const aktuell = laufend[0] || null;
  const kommend = alle.filter(s => s.start > jetzt && s.art !== 'pause');
  const naechstes = kommend.find(s => !aktuell || s.start >= aktuell.end || RANG[s.art] < RANG[aktuell.art]) || null;
  if (aktuell) {
    const dauer = aktuell.end - aktuell.start;
    const rest = aktuell.end - jetzt;
    return { aktuell, naechstes, bis: aktuell.end, anteil: dauer > 0 ? rest / dauer : 0, text: `noch ${dauerText(rest / 60000)}` };
  }
  if (naechstes) {
    // Balken: von der letzten Sache (höchstens 3 Std. zurück) bis zum Beginn des Nächsten
    const vorher = alle.filter(s => s.end <= jetzt).map(s => s.end).sort((a, b) => b - a)[0];
    const von = new Date(Math.max(vorher ? vorher.getTime() : 0, D.plusMin(jetzt, -180).getTime(), Math.min(jetzt, naechstes.start - 60 * 60000)));
    const ganz = naechstes.start - von;
    const rest = naechstes.start - jetzt;
    return { aktuell: null, naechstes, bis: naechstes.start, anteil: ganz > 0 ? Math.min(1, rest / ganz) : 0, text: `in ${dauerText(rest / 60000)}` };
  }
  return { aktuell: null, naechstes: null, bis: null, anteil: 0, text: '' };
}

function dauerText(min) {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} Std. ${r} min` : `${h} Std.`;
}

// Die nächsten Punkte nach "jetzt" (ohne Pause/Ruhe), für die Liste im Widget
function naechste(plan, jetzt, anzahl, opt) {
  const heute = D.ymd(jetzt), morgen = D.ymd(D.plusTage(jetzt, 1));
  return [...segmente(plan, heute, opt), ...segmente(plan, morgen, opt)]
    .filter(s => s.start > jetzt && s.art !== 'pause' && s.art !== 'ruhe')
    .slice(0, anzahl)
    .map(s => ({ ...s, zeit: D.ymd(s.start) === heute ? D.hm(s.start) : `${D.kurz(s.start).slice(0, 2)} ${D.hm(s.start)}` }));
}

// Anfang und Ende für die Zeitleiste eines Tages: 06:00–22:00, erweitert, wenn früher/später etwas ist
function tagesFenster(segs, datum) {
  const tag = D.ausYmd(datum);
  let von = D.mitUhrzeit(tag, '06:00'), bis = D.mitUhrzeit(tag, '22:00');
  for (const s of segs) {
    if (s.start < von) von = new Date(Math.max(tag, s.start - (s.start % 3600000)));
    if (s.end > bis) bis = new Date(Math.min(D.plusTage(tag, 1), s.end));
  }
  return { von, bis };
}

// Wie viele Aufgaben wurden heute erledigt? (aus dem Gedächtnis)
const GESCHAFFT = new Set(['erledigt', 'folge', 'abgehakt']);
function geschafftAm(ged, datum) {
  return ((ged && ged.ereignisse) || []).filter(e => GESCHAFFT.has(e.typ) && e.t && D.ymd(new Date(e.t)) === datum).length;
}

// Freundliche Texte statt Warnungen
function ohnePlatzText(warnText) { return warnText ? `Noch ohne Platz: ${warnText}` : ''; }

module.exports = { FARBEN, MONO, symbolFuer, farbeFuer, segmente, jetztUndDanach, naechste, tagesFenster, dauerText, geschafftAm, ohnePlatzText };
