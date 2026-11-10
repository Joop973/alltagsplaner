// Freie Lücken finden, Aufgaben einplanen, Wecker bestimmen.
'use strict';

function hole(n) {
  if (typeof require === 'function') return require('./' + n);
  try { return importModule('planer/core/' + n); } catch (e) { return importModule(n); }
}
const D = hole('datum');
const A = hole('ablauf');
const F = hole('feiertage');
const L = hole('lernen');

// Zeitraum [s,e) minus belegte Zeiträume
function abziehen(frei, belegt) {
  let rest = frei;
  for (const b of belegt) {
    const neu = [];
    for (const f of rest) {
      if (b.end <= f.start || b.start >= f.end) { neu.push(f); continue; }
      if (b.start > f.start) neu.push({ start: f.start, end: b.start });
      if (b.end < f.end) neu.push({ start: b.end, end: f.end });
    }
    rest = neu;
  }
  return rest;
}

// Je Planungstag: Arbeitstag? gesperrt (krank, verreist, "heute keine Aufgaben")? Sonn-/Feiertag?
function tagInfoBauen({ termine, jetzt, regeln, sperrTage }) {
  const arbeit = new Set((termine || []).filter(t => t.art === 'arbeit').map(t => D.ymd(new Date(t.start))));
  const liste = [];
  for (let i = 0; i < regeln.tage; i++) {
    const tag = D.plusTage(D.tagesBeginn(jetzt), i);
    const datum = D.ymd(tag);
    liste.push({
      datum,
      arbeit: arbeit.has(datum),
      gesperrt: !!(sperrTage && sperrTage.has(datum)),
      sonntag: tag.getDay() === 0,
      feiertag: !!F.freierTag(datum, []),
    });
  }
  return liste;
}

function maxFuer(info, regeln) {
  if (regeln.maxArbeitstag == null || regeln.maxFreierTag == null) return regeln.maxProTag;
  return info && info.arbeit ? regeln.maxArbeitstag : regeln.maxFreierTag;
}

// Darf die Aufgabe an diesem Tag überhaupt geplant werden?
function tagErlaubt(a, info, regeln, ruhe) {
  if (!info) return true;
  const ruhetag = info.sonntag || info.feiertag;
  if (a.unterwegs && !regeln.besorgungenSonntags && ruhetag) return false; // Läden zu
  if (ruhe && ruhe.an && a.laut && ruhetag) return false;
  return true;
}

// Zeitfenster für laute Aufgaben (ms) oder null
function ruheFenster(a, datum, ruhe) {
  if (!(ruhe && ruhe.an && a.laut)) return null;
  const tag = D.ausYmd(datum);
  return { von: D.mitUhrzeit(tag, ruhe.von).getTime(), bis: D.mitUhrzeit(tag, ruhe.bis).getTime() };
}

// Pro Tag die nutzbaren Lücken (Zeiten in ms). Liefert alle Tage, auch ohne Lücken.
function freieLuecken({ aufenthalte, termine, jetzt, regeln, tagInfo }) {
  const ab = D.aufrunden5(jetzt).getTime();
  const belegt = termine.map(t => ({ start: new Date(t.start).getTime(), end: new Date(t.end).getTime() }));
  const tage = [];
  for (let i = 0; i < regeln.tage; i++) {
    const tag = D.plusTage(D.tagesBeginn(jetzt), i);
    const info = tagInfo && tagInfo[i];
    if (info && info.gesperrt) { tage.push({ datum: D.ymd(tag), luecken: [] }); continue; }
    const startZeit = info && !info.arbeit && regeln.tagStartFrei ? regeln.tagStartFrei : regeln.tagStart;
    const tStart = D.mitUhrzeit(tag, startZeit).getTime();
    const tEnde = D.mitUhrzeit(tag, regeln.tagEnde).getTime();
    let frei = [];
    for (const a of aufenthalte) {
      const s = Math.max(a.start, tStart, ab), e = Math.min(a.end, tEnde);
      if (e > s) frei.push({ start: s, end: e });
    }
    frei = abziehen(frei, belegt)
      .filter(f => f.end - f.start >= regeln.minLuecke * 60000)
      .sort((x, y) => x.start - y.start);
    tage.push({ datum: D.ymd(tag), luecken: frei });
  }
  return tage;
}

// Fälligkeit: Abstand ab der letzten Erledigung bzw. ab "nicht nötig" (basis), je nachdem, was später ist.
function faelligAm(a, heuteYmd) {
  if (a.faellig) return a.faellig; // einmalige Aufgaben (Geschenk, Frist, Blumen)
  const von = [a.letzte, a.basis].filter(Boolean).sort().pop();
  if (!von) return heuteYmd;
  return D.ymd(D.plusTage(D.ausYmd(von), Number(a.intervall)));
}

// > 0: seit so vielen Tagen fällig, 0: heute, < 0: in so vielen Tagen
function dringlichkeit(faellig, heuteYmd) { return D.tageZwischen(D.ausYmd(faellig), D.ausYmd(heuteYmd)); }

function dringlichkeitText(n) {
  if (n > 1) return `fällig seit ${n} Tagen`;
  if (n === 1) return 'fällig seit gestern';
  if (n === 0) return 'heute fällig';
  if (n === -1) return 'morgen fällig';
  return `fällig in ${-n} Tagen`;
}

// Reihenfolge der Tage, an denen ein Termin mit Fälligkeit f probiert wird:
// Fälligkeitstag, dann bis zu "vorziehen" Tage früher, dann später (höchstens bis "bis").
function tagReihenfolge(f, tage, vorziehen, bis) {
  const heute = tage[0].datum;
  let idx = tage.findIndex(t => t.datum === (f < heute ? heute : f));
  if (idx < 0) return [];
  const r = [idx];
  for (let i = idx - 1; i >= 0 && i >= idx - vorziehen; i--) r.push(i);
  for (let i = idx + 1; i < tage.length; i++) r.push(i);
  return bis ? r.filter(i => tage[i].datum <= bis) : r;
}

function vorziehenFuer(a, regeln) { return a.vorziehen != null ? a.vorziehen : (regeln.vorziehenTage || 0); }

// Tage für eine Aufgabe: erlaubte Tage; lange Aufgaben zuerst an freien Tagen (bis 3 Tage nach Fälligkeit).
function tageFuer(o, tage, regeln, tagInfo, ruhe) {
  let r = tagReihenfolge(o.faellig, tage, vorziehenFuer(o.a, regeln), o.a.bis);
  r = r.filter(i => inSaison(o.a, tage[i].datum));
  if (tagInfo) r = r.filter(i => tagErlaubt(o.a, tagInfo[i], regeln, ruhe));
  if (tagInfo && r.length && regeln.langAb != null && Number(o.a.dauer) > regeln.langAb) {
    const grenze = r[0] + 3;
    const frei = r.filter(i => !tagInfo[i].arbeit && i <= grenze);
    r = frei.concat(r.filter(i => !frei.includes(i)));
  }
  return r;
}

function aktivUndGueltig(a) {
  return a.aktiv !== false && Number(a.dauer) > 0 && (a.einmalig || Number(a.intervall) > 0);
}

// Saisonale Aufgaben (monate: [10, 11]): nur in diesen Monaten planen
function inSaison(a, datum) {
  if (!a.monate || !a.monate.length) return true;
  return a.monate.includes(Number(datum.slice(5, 7)));
}

function rangVergleich(x, y) {
  return (Number(!!y.a.pflicht) - Number(!!x.a.pflicht))
    || (x.faellig < y.faellig ? -1 : x.faellig > y.faellig ? 1 : 0)
    || String(x.a.name).localeCompare(String(y.a.name));
}

function nachId(liste) {
  const m = new Map();
  for (const b of (liste || []).slice().sort((x, y) => new Date(x.start) - new Date(y.start))) {
    if (!m.has(b.aufgabeId)) m.set(b.aufgabeId, []);
    m.get(b.aufgabeId).push({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() });
  }
  return m;
}

// aufgaben: [{id,name,intervall,dauer,pflicht,letzte,basis,aktiv,nichtVor,laut,einmalig,faellig,bis}]
// fest:   [{aufgabeId, start, end}] vom Nutzer im Kalender verschobene Blöcke – gelten, wie sie sind
// vorher: [{aufgabeId, start, end}] Blöcke des letzten Plans – bleiben, solange sie passen (Planruhe)
// aufenthalte: Zeiten zuhause (für Aufgaben mit Folgeaufgabe, z. B. Wäsche: danach noch zuhause sein)
function aufgabenPlanen({ aufgaben, tagesLuecken, regeln, tagInfo, ruhe, fest, vorher, ab, aufenthalte }) {
  if (!tagesLuecken.length) return { bloecke: [], warnungen: [] };
  const tage = tagesLuecken.map(t => ({ datum: t.datum, frei: t.luecken.map(l => ({ ...l })), minuten: 0 }));
  const heute = tage[0].datum, letzter = tage[tage.length - 1].datum;
  const jetztMs = ab == null ? -Infinity : ab;
  let offen = aufgaben
    .filter(aktivUndGueltig)
    .map(a => ({ a, faellig: faelligAm(a, heute), nr: 0 }));
  const bloecke = [], warnungen = [], gewarnt = new Set();
  const info = i => (tagInfo ? tagInfo[i] : null);

  const block = (o, s, e, extra) => ({
    aufgabeId: o.a.id, name: o.a.name, pflicht: !!o.a.pflicht, faellig: o.faellig,
    einmalig: !!o.a.einmalig, start: new Date(s), end: new Date(e), schritte: o.a.schritte, ...extra,
  });
  const naechste = (o, datum) => {
    if (o.a.einmalig) return;
    offen.push({ a: { ...o.a, nichtVor: null }, faellig: D.ymd(D.plusTage(D.ausYmd(datum), Number(o.a.intervall))), nr: o.nr + 1 });
  };

  // 1) Vom Nutzer verschobene Blöcke gelten genau so.
  const festNach = nachId(fest);
  for (const o of offen.slice()) {
    const p = (festNach.get(o.a.id) || [])[0];
    if (!p || p.end <= jetztMs) continue;
    const tag = tage.find(t => t.datum === D.ymd(new Date(p.start)));
    if (!tag) continue;
    tag.frei = abziehen(tag.frei, [p]);
    tag.minuten += Math.round((p.end - p.start) / 60000);
    bloecke.push(block(o, p.start, p.end, { fest: true }));
    offen = offen.filter(x => x !== o);
    naechste(o, tag.datum);
  }

  // Grenzen für eine Aufgabe an einem Tag: frühester Start und spätestes Ende (ms)
  function grenzen(i, a) {
    const tag = tage[i];
    if (tag.minuten + Number(a.dauer) > maxFuer(info(i), regeln)) return null;
    let von = a.nichtVor ? new Date(a.nichtVor).getTime() : -Infinity, bis = Infinity;
    const rf = ruheFenster(a, tag.datum, ruhe);
    if (rf) { von = Math.max(von, rf.von); bis = rf.bis; }
    // Folgeaufgabe zuhause (Wäsche aufhängen): Folge muss vor Tagesende und vor dem Losfahren liegen
    if (a.folge && a.folge.zuhause) {
      const extra = (Number(a.folge.nachMin) + Number(a.folge.dauer || 0)) * 60000;
      bis = Math.min(bis, D.mitUhrzeit(D.ausYmd(tag.datum), regeln.tagEnde).getTime() - extra + Number(a.dauer) * 60000);
      return { von, bis, folgeExtra: extra };
    }
    return { von, bis };
  }
  function belegen(i, a, idx, s) {
    const tag = tage[i], l = tag.frei[idx], dauer = Number(a.dauer) * 60000;
    const rest = [];
    if (s > l.start) rest.push({ start: l.start, end: s });
    if (l.end > s + dauer) rest.push({ start: s + dauer, end: l.end });
    tag.frei.splice(idx, 1, ...rest);
    tag.minuten += Number(a.dauer);
    return { start: s, end: s + dauer };
  }
  // Liegt [s, s+dauer+folgeExtra] ganz in einem Aufenthalt zuhause?
  function bleibtZuhause(s, dauer, g) {
    if (!g.folgeExtra || !aufenthalte) return true;
    const e = s + dauer + g.folgeExtra;
    return aufenthalte.some(x => x.start <= s && x.end >= e);
  }
  function suchen(i, a) {
    const g = grenzen(i, a);
    if (!g) return null;
    const dauer = Number(a.dauer) * 60000;
    for (let idx = 0; idx < tage[i].frei.length; idx++) {
      const l = tage[i].frei[idx];
      const s = L.erlaubterStart(Math.max(l.start, g.von), a.meiden);
      if (s == null || Math.min(l.end, g.bis) - s < dauer) continue;
      if (!bleibtZuhause(s, dauer, g)) {
        // spätester Start, damit die Folge noch zuhause liegt, gibt es in derselben Lücke nicht früher – nächste Lücke
        continue;
      }
      return belegen(i, a, idx, s);
    }
    return null;
  }
  // Genau die alte Zeit wieder nehmen, wenn sie noch passt
  function genau(i, a, s) {
    const g = grenzen(i, a);
    if (!g) return null;
    const dauer = Number(a.dauer) * 60000;
    if (s < g.von || s + dauer > g.bis || !bleibtZuhause(s, dauer, g)) return null;
    if (L.erlaubterStart(s, a.meiden) !== s) return null;
    const idx = tage[i].frei.findIndex(l => l.start <= s && s + dauer <= l.end);
    return idx < 0 ? null : belegen(i, a, idx, s);
  }

  // 2) Alle übrigen in Rangfolge
  const vorherNach = regeln.planruhe === false ? new Map() : nachId(vorher);
  while (offen.length) {
    offen.sort(rangVergleich);
    const o = offen.shift();
    if (o.faellig > letzter) continue;
    const reihenfolge = tageFuer(o, tage, regeln, tagInfo, ruhe);
    let platz = null, tagIdx = -1;
    const alt = (vorherNach.get(o.a.id) || [])[o.nr];
    if (alt && alt.start >= jetztMs && alt.end - alt.start === Number(o.a.dauer) * 60000) {
      const i = tage.findIndex(t => t.datum === D.ymd(new Date(alt.start)));
      if (i >= 0 && reihenfolge.includes(i)) {
        platz = genau(i, o.a, alt.start);
        if (platz) tagIdx = i;
      }
    }
    for (const i of platz ? [] : reihenfolge) {
      platz = suchen(i, o.a);
      if (platz) { tagIdx = i; break; }
    }
    if (!platz) {
      if (o.a.pflicht && !gewarnt.has(o.a.id)) {
        gewarnt.add(o.a.id);
        warnungen.push({ aufgabeId: o.a.id, name: o.a.name, faellig: o.faellig });
      }
      continue;
    }
    bloecke.push(block(o, platz.start, platz.end));
    naechste(o, tage[tagIdx].datum);
  }
  bloecke.sort((x, y) => x.start - y.start);
  return { bloecke, warnungen };
}

// Wecker nur für Fahrten zu Terminen, die in den nächsten X Stunden liegen.
function weckerListe(fahrten, jetzt, regeln) {
  const grenze = jetzt.getTime() + regeln.weckerStunden * 3600000;
  return fahrten
    .filter(f => f.zuTermin)
    .map(f => ({ zeitpunkt: D.plusMin(f.abfahrt, -regeln.weckerVorlauf), f }))
    .filter(w => w.zeitpunkt.getTime() > jetzt.getTime() && w.zeitpunkt.getTime() <= grenze)
    .map(w => ({
      zeit: D.hm(w.zeitpunkt),
      zeitpunkt: w.zeitpunkt.toISOString(),
      name: `Planer: In ${regeln.weckerVorlauf} min los zu ${w.f.zielName}`,
    }));
}

// Unterwegs-Aufgaben (z. B. Blumen kaufen): auf dem Heimweg direkt nach einem auswärtigen Termin
// oder morgens an Tagen ohne Arbeit. Der Heimweg verschiebt sich um die Dauer.
// Nicht an Sonn- und Feiertagen (Läden zu) und nicht an gesperrten Tagen.
// Nicht unterzubringende kommen als "rest" zurück und werden wie normale Aufgaben geplant.
function unterwegsPlanen({ aufgaben, ablauf, jetzt, regeln, tagInfo, ruhe }) {
  const r = regeln;
  const ab = D.aufrunden5(jetzt).getTime();
  const fahrten = ablauf.fahrten.map(f => ({ ...f }));
  const aufenthalte = ablauf.aufenthalte.map(a => ({ ...a }));
  const belegt = [];
  const tage = [];
  for (let i = 0; i < r.tage; i++) tage.push({ datum: D.ymd(D.plusTage(D.tagesBeginn(jetzt), i)) });
  if (!aufgaben.length) return { bloecke: [], rest: [], fahrten, aufenthalte, belegt };
  const infoZu = datum => (tagInfo ? tagInfo.find(t => t.datum === datum) : null);

  const vonZeit = r.unterwegsVon || r.tagStart, bisZeit = r.unterwegsBis || '19:00';
  const imFenster = (s, e) => {
    const t = new Date(s);
    return s >= D.mitUhrzeit(t, vonZeit).getTime() && e <= D.mitUhrzeit(t, bisZeit).getTime();
  };
  const arbeitsTage = new Set(ablauf.termine.filter(t => t.art === 'arbeit').map(t => D.ymd(new Date(t.start))));
  const benutzt = new Set();

  // Plätze sammeln
  const plaetze = [];
  fahrten.forEach((f, i) => {
    if (f.nachArt !== 'zuhause' || f.vonArt === 'zuhause') return;
    plaetze.push({ art: 'heimweg', i, start: new Date(f.abfahrt).getTime(), datum: D.ymd(new Date(f.abfahrt)) });
  });
  for (const t of tage) {
    if (arbeitsTage.has(t.datum)) continue;
    plaetze.push({ art: 'morgens', start: D.mitUhrzeit(D.ausYmd(t.datum), r.tagStartFrei || r.tagStart).getTime(), datum: t.datum });
  }

  function passt(p, dauerMs) {
    if (p.start < ab || benutzt.has(p) || !imFenster(p.start, p.start + dauerMs)) return false;
    const inf = infoZu(p.datum);
    if (inf && inf.gesperrt) return false;
    if (p.art === 'heimweg') {
      const f = fahrten[p.i];
      const heimAb = new Date(f.ankunft).getTime() + r.pauseNachHeim * 60000;
      const nach = aufenthalte.find(a => a.start === heimAb);
      return !!nach && nach.start + dauerMs <= nach.end;
    }
    const e = p.start + dauerMs;
    const zuhause = aufenthalte.some(a => a.start <= p.start && a.end >= e);
    const frei = !ablauf.termine.concat(belegt).some(t => new Date(t.start).getTime() < e && new Date(t.end).getTime() > p.start);
    return zuhause && frei;
  }

  const offen = aufgaben.filter(aktivUndGueltig).map(a => ({ a, faellig: faelligAm(a, tage[0].datum) })).sort(rangVergleich);
  const bloecke = [], rest = [];
  for (const o of offen) {
    const dauerMs = Number(o.a.dauer) * 60000;
    let gewaehlt = null;
    for (const i of tageFuer(o, tage, r, tagInfo, ruhe)) {
      gewaehlt = plaetze.filter(p => p.datum === tage[i].datum).sort((x, y) => x.start - y.start).find(p => passt(p, dauerMs));
      if (gewaehlt) break;
    }
    if (!gewaehlt) { rest.push(o.a); continue; }
    benutzt.add(gewaehlt);
    const s = gewaehlt.start, e = s + dauerMs;
    if (gewaehlt.art === 'heimweg') {
      const f = fahrten[gewaehlt.i];
      const heimAb = new Date(f.ankunft).getTime() + r.pauseNachHeim * 60000;
      aufenthalte.find(a => a.start === heimAb).start += dauerMs;
      f.abfahrt = new Date(new Date(f.abfahrt).getTime() + dauerMs);
      f.ankunft = new Date(new Date(f.ankunft).getTime() + dauerMs);
    } else {
      belegt.push({ start: new Date(s), end: new Date(e) });
    }
    bloecke.push({
      aufgabeId: o.a.id, name: o.a.name, pflicht: !!o.a.pflicht, faellig: o.faellig, einmalig: !!o.a.einmalig,
      start: new Date(s), end: new Date(e), unterwegs: gewaehlt.art, schritte: o.a.schritte,
    });
  }
  return { bloecke, rest, fahrten, aufenthalte, belegt };
}

// "Ich habe jetzt X Minuten": passende Aufgaben, dringendste zuerst.
function vorschlaege({ aufgaben, minuten, jetzt, regeln }) {
  const heute = D.ymd(jetzt);
  return aufgaben
    .filter(aktivUndGueltig)
    .filter(a => Number(a.dauer) <= minuten && !a.unterwegs)
    .filter(a => !(a.nichtVor && new Date(a.nichtVor) > jetzt))
    .map(a => ({ a, faellig: faelligAm(a, heute) }))
    .filter(o => dringlichkeit(o.faellig, heute) >= -vorziehenFuer(o.a, regeln))
    .sort(rangVergleich);
}

// Alles zusammen.
// sperrTage: Set "YYYY-MM-DD" ohne Aufgaben (krank, verreist, "heute keine Aufgaben")
function planen({ termine, aufgaben, einst, fahrzeit, jetzt, sperrTage, fest, vorher, regen }) {
  const regeln = einst.regeln, ruhe = einst.ruhezeiten;
  const ablauf0 = A.berechneAblauf(termine, { einst, fahrzeit, regen });
  const tagInfo = tagInfoBauen({ termine: ablauf0.termine, jetzt, regeln, sperrTage });
  const festIds = new Set((fest || []).map(f => f.aufgabeId));
  const istUnterwegs = a => a.unterwegs && !festIds.has(a.id);
  const u = unterwegsPlanen({ aufgaben: aufgaben.filter(istUnterwegs), ablauf: ablauf0, jetzt, regeln, tagInfo, ruhe });
  const ablauf = { ...ablauf0, fahrten: u.fahrten, aufenthalte: u.aufenthalte };
  const tagesLuecken = freieLuecken({ aufenthalte: u.aufenthalte, termine: ablauf.termine.concat(u.belegt), jetzt, regeln, tagInfo });
  const normal = aufgabenPlanen({
    aufgaben: aufgaben.filter(a => !istUnterwegs(a)).concat(u.rest),
    tagesLuecken, regeln, tagInfo, ruhe, fest, vorher, ab: D.aufrunden5(jetzt).getTime(), aufenthalte: u.aufenthalte,
  });
  const bloecke = u.bloecke.concat(normal.bloecke).sort((x, y) => x.start - y.start);
  const wecker = weckerListe(ablauf.fahrten, jetzt, regeln);
  return { ablauf, tagesLuecken, tagInfo, bloecke, warnungen: normal.warnungen, wecker };
}

module.exports = {
  inSaison, abziehen, tagInfoBauen, freieLuecken, faelligAm, dringlichkeit, dringlichkeitText, tagReihenfolge,
  aufgabenPlanen, unterwegsPlanen, vorschlaege, weckerListe, planen,
};
