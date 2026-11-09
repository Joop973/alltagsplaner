// Freie Lücken finden, Aufgaben einplanen, Wecker bestimmen.
'use strict';

function hole(n) {
  if (typeof require === 'function') return require('./' + n);
  try { return importModule('planer/core/' + n); } catch (e) { return importModule(n); }
}
const D = hole('datum');
const A = hole('ablauf');

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

// Pro Tag die nutzbaren Lücken (Zeiten in ms). Liefert alle Tage, auch ohne Lücken.
function freieLuecken({ aufenthalte, termine, jetzt, regeln }) {
  const ab = D.aufrunden5(jetzt).getTime();
  const belegt = termine.map(t => ({ start: new Date(t.start).getTime(), end: new Date(t.end).getTime() }));
  const tage = [];
  for (let i = 0; i < regeln.tage; i++) {
    const tag = D.plusTage(D.tagesBeginn(jetzt), i);
    const tStart = D.mitUhrzeit(tag, regeln.tagStart).getTime();
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

function faelligAm(a, heuteYmd) {
  if (a.faellig) return a.faellig; // einmalige Aufgaben (Geschenk, Frist, Blumen)
  if (!a.letzte) return heuteYmd;
  return D.ymd(D.plusTage(D.ausYmd(a.letzte), Number(a.intervall)));
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

function aktivUndGueltig(a) {
  return a.aktiv !== false && Number(a.dauer) > 0 && (a.einmalig || Number(a.intervall) > 0);
}

function rangVergleich(x, y) {
  return (Number(!!y.a.pflicht) - Number(!!x.a.pflicht))
    || (x.faellig < y.faellig ? -1 : x.faellig > y.faellig ? 1 : 0)
    || String(x.a.name).localeCompare(String(y.a.name));
}

// aufgaben: [{id,name,intervall,dauer,pflicht,letzte,aktiv,nichtVor}]
function aufgabenPlanen({ aufgaben, tagesLuecken, regeln }) {
  if (!tagesLuecken.length) return { bloecke: [], warnungen: [] };
  const tage = tagesLuecken.map(t => ({ datum: t.datum, frei: t.luecken.map(l => ({ ...l })), minuten: 0 }));
  const heute = tage[0].datum, letzter = tage[tage.length - 1].datum;
  const offen = aufgaben
    .filter(aktivUndGueltig)
    .map(a => ({ a, faellig: faelligAm(a, heute) }));
  const bloecke = [], warnungen = [], gewarnt = new Set();

  function suchen(tag, a) {
    const dauer = Number(a.dauer) * 60000;
    if (tag.minuten + Number(a.dauer) > regeln.maxProTag) return null;
    const nichtVor = a.nichtVor ? new Date(a.nichtVor).getTime() : -Infinity;
    for (let i = 0; i < tag.frei.length; i++) {
      const l = tag.frei[i];
      const s = Math.max(l.start, nichtVor);
      if (l.end - s < dauer) continue;
      const rest = [];
      if (s > l.start) rest.push({ start: l.start, end: s });
      if (l.end > s + dauer) rest.push({ start: s + dauer, end: l.end });
      tag.frei.splice(i, 1, ...rest);
      tag.minuten += Number(a.dauer);
      return { start: s, end: s + dauer };
    }
    return null;
  }

  while (offen.length) {
    offen.sort(rangVergleich);
    const o = offen.shift();
    if (o.faellig > letzter) continue;
    let platz = null, tag = null;
    for (const i of tagReihenfolge(o.faellig, tage, vorziehenFuer(o.a, regeln), o.a.bis)) {
      platz = suchen(tage[i], o.a);
      if (platz) { tag = tage[i]; break; }
    }
    if (!platz) {
      if (o.a.pflicht && !gewarnt.has(o.a.id)) {
        gewarnt.add(o.a.id);
        warnungen.push({ aufgabeId: o.a.id, name: o.a.name, faellig: o.faellig });
      }
      continue;
    }
    bloecke.push({
      aufgabeId: o.a.id, name: o.a.name, pflicht: !!o.a.pflicht, faellig: o.faellig,
      start: new Date(platz.start), end: new Date(platz.end),
    });
    if (!o.a.einmalig) {
      offen.push({ a: { ...o.a, nichtVor: null }, faellig: D.ymd(D.plusTage(D.ausYmd(tag.datum), Number(o.a.intervall))) });
    }
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
// Nicht unterzubringende kommen als "rest" zurück und werden wie normale Aufgaben geplant.
function unterwegsPlanen({ aufgaben, ablauf, jetzt, regeln }) {
  const r = regeln;
  const ab = D.aufrunden5(jetzt).getTime();
  const fahrten = ablauf.fahrten.map(f => ({ ...f }));
  const aufenthalte = ablauf.aufenthalte.map(a => ({ ...a }));
  const belegt = [];
  const tage = [];
  for (let i = 0; i < r.tage; i++) tage.push({ datum: D.ymd(D.plusTage(D.tagesBeginn(jetzt), i)) });
  if (!aufgaben.length) return { bloecke: [], rest: [], fahrten, aufenthalte, belegt };

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
    plaetze.push({ art: 'morgens', start: D.mitUhrzeit(D.ausYmd(t.datum), r.tagStart).getTime(), datum: t.datum });
  }

  function passt(p, dauerMs) {
    if (p.start < ab || benutzt.has(p) || !imFenster(p.start, p.start + dauerMs)) return false;
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
    for (const i of tagReihenfolge(o.faellig, tage, vorziehenFuer(o.a, r), o.a.bis)) {
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
      aufgabeId: o.a.id, name: o.a.name, pflicht: !!o.a.pflicht, faellig: o.faellig,
      start: new Date(s), end: new Date(e), unterwegs: gewaehlt.art,
    });
  }
  return { bloecke, rest, fahrten, aufenthalte, belegt };
}

// Alles zusammen.
function planen({ termine, aufgaben, einst, fahrzeit, jetzt }) {
  const ablauf0 = A.berechneAblauf(termine, { einst, fahrzeit });
  const u = unterwegsPlanen({ aufgaben: aufgaben.filter(a => a.unterwegs), ablauf: ablauf0, jetzt, regeln: einst.regeln });
  const ablauf = { ...ablauf0, fahrten: u.fahrten, aufenthalte: u.aufenthalte };
  const tagesLuecken = freieLuecken({ aufenthalte: u.aufenthalte, termine: ablauf.termine.concat(u.belegt), jetzt, regeln: einst.regeln });
  const normal = aufgabenPlanen({ aufgaben: aufgaben.filter(a => !a.unterwegs).concat(u.rest), tagesLuecken, regeln: einst.regeln });
  const bloecke = u.bloecke.concat(normal.bloecke).sort((x, y) => x.start - y.start);
  const wecker = weckerListe(ablauf.fahrten, jetzt, einst.regeln);
  return { ablauf, tagesLuecken, bloecke, warnungen: normal.warnungen, wecker };
}

module.exports = { abziehen, freieLuecken, faelligAm, tagReihenfolge, aufgabenPlanen, unterwegsPlanen, weckerListe, planen };
