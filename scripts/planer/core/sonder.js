// Sonderaufgaben und -mitteilungen: Geburtstage, Fristen, Checklisten, Blumen.
// Erzeugt einmalige Aufgaben (einmalig, faellig, bis, unterwegs) für den Planer.
// Status (erledigt / später) liegt getrennt in sonderstatus.json: {erledigt: {id: datum}, nichtVor: {id: iso}}
'use strict';

function hole(n) {
  if (typeof require === 'function') return require('./' + n);
  try { return importModule('planer/core/' + n); } catch (e) { return importModule(n); }
}
const D = hole('datum');

// ---------- Hilfen ----------

function slug(s) {
  return String(s || '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';
}

function plus(ymd, tage) { return D.ymd(D.plusTage(D.ausYmd(ymd), tage)); }

function kurzDatum(ymd) { return `${ymd.slice(8, 10)}.${ymd.slice(5, 7)}.`; }

// "MM-DD" (oder "YYYY-MM-DD") -> nächstes Vorkommen ab heute als "YYYY-MM-DD"
function naechstesDatum(mmdd, heuteYmd) {
  const [mo, t] = String(mmdd).split('-').slice(-2).map(Number);
  const j = Number(heuteYmd.slice(0, 4));
  let d = D.ymd(new Date(j, mo - 1, t));
  if (d < heuteYmd) d = D.ymd(new Date(j + 1, mo - 1, t));
  return d;
}

// Monate addieren, Monatsende beachten (31.01. + 1 Monat = 28./29.02.)
function plusMonate(ymd, monate) {
  const [j, m, t] = ymd.split('-').map(Number);
  const ziel = new Date(j, m - 1 + monate, 1);
  const letzter = new Date(ziel.getFullYear(), ziel.getMonth() + 1, 0).getDate();
  return D.ymd(new Date(ziel.getFullYear(), ziel.getMonth(), Math.min(t, letzter)));
}

// ---------- Status (erledigt / später) ----------

function leererStatus() { return { erledigt: {}, nichtVor: {} }; }

function aktionAufStatus(status, q, jetzt) {
  const s = { erledigt: { ...(status.erledigt || {}) }, nichtVor: { ...(status.nichtVor || {}) } };
  if (q.aktion === 'erledigt') {
    s.erledigt[q.id] = D.ymd(jetzt);
    delete s.nichtVor[q.id];
  } else if (q.aktion === 'spaeter') {
    const ende = D.alsDatum(q.ende), frueh = D.plusMin(jetzt, 30);
    s.nichtVor[q.id] = (ende && ende > frueh ? ende : frueh).toISOString();
  } else if (q.aktion === 'heutenicht') {
    s.nichtVor[q.id] = D.plusTage(D.tagesBeginn(jetzt), 1).toISOString();
  }
  return s;
}

// Erledigte weglassen, "später" übernehmen
function statusAnwenden(aufgaben, status, jetzt) {
  const st = status || leererStatus();
  return aufgaben
    .filter(a => !(st.erledigt || {})[a.id])
    .map(a => {
      const nv = (st.nichtVor || {})[a.id];
      return nv && new Date(nv) > jetzt ? { ...a, nichtVor: nv } : a;
    });
}

// Alte Einträge (älter als 400 Tage) entfernen
function statusAufraeumen(status, heuteYmd) {
  const grenze = plus(heuteYmd, -400);
  const erledigt = {};
  for (const [k, v] of Object.entries(status.erledigt || {})) if (v >= grenze) erledigt[k] = v;
  const nichtVor = {};
  for (const [k, v] of Object.entries(status.nichtVor || {})) if (v.slice(0, 10) >= grenze) nichtVor[k] = v;
  return { erledigt, nichtVor };
}

// ---------- Geburtstage ----------

// Titel aus dem Geburtstage-Kalender -> Name
function nameAusTitel(titel) {
  const t = String(titel || '').trim();
  let m = t.match(/^geburtstag\s+von\s+(.+)$/i);
  if (m) return m[1].trim();
  m = t.match(/^(.+?)['’]s\s+birthday$/i);
  if (m) return m[1].trim();
  m = t.match(/^(.+?)\s+geburtstag$/i);
  if (m) {
    const n = m[1].trim();
    if (/['’]$/.test(n)) return n.slice(0, -1);
    if (/s$/.test(n) && n.length > 2) return n.slice(0, -1);
    return n;
  }
  return t;
}

// kalender: [{titel, datum}], eigene: [{name, datum: 'MM-DD'}] -> [{name, datum, quelle}] der nächsten "tage" Tage
function geburtstagsListe(kalender, eigene, heuteYmd, tage) {
  const bis = plus(heuteYmd, tage);
  const liste = [];
  const gesehen = new Set();
  const dazu = (name, datum, quelle) => {
    const k = `${slug(name)}|${datum}`;
    if (gesehen.has(k) || datum > bis) return;
    gesehen.add(k);
    liste.push({ name, datum, quelle });
  };
  for (const e of eigene || []) dazu(e.name, naechstesDatum(e.datum, heuteYmd), 'eigene');
  for (const k of kalender || []) dazu(nameAusTitel(k.titel), naechstesDatum(k.datum.slice(5), heuteYmd), 'kalender');
  return liste.sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : a.name.localeCompare(b.name)));
}

function geschenkId(p) { return `geschenk-${slug(p.name)}-${p.datum.slice(0, 4)}`; }

// Geschenk-Aufgaben für markierte Personen: ab 14 Tage vorher, spätestens am Vortag
function geburtstagsAufgaben(liste, geschenke, cfg, heuteYmd) {
  return liste
    .filter(p => (geschenke || {})[p.name])
    .map(p => ({
      id: geschenkId(p),
      name: `Geschenk für ${p.name} (Geburtstag ${kurzDatum(p.datum)})`,
      dauer: cfg.geschenkDauer, pflicht: true, einmalig: true,
      faellig: plus(p.datum, -cfg.geschenkVorTage), bis: plus(p.datum, -1),
    }))
    .filter(a => a.bis >= heuteYmd);
}

// Mitteilungen: Gratulieren am Tag (06:00), Geschenk-Erinnerung 7 Tage vorher, falls noch offen
function geburtstagsMitteilungen(liste, geschenke, status, cfg) {
  const m = [];
  for (const p of liste) {
    m.push({
      id: `planer-geb-${slug(p.name)}-${p.datum}`,
      zeit: D.mitUhrzeit(D.ausYmd(p.datum), cfg.uhrzeit),
      titel: 'Geburtstag heute',
      text: `${p.name} hat heute Geburtstag. Gratulieren!`,
    });
    if ((geschenke || {})[p.name] && !((status || {}).erledigt || {})[geschenkId(p)]) {
      m.push({
        id: `planer-geschenk-${slug(p.name)}-${p.datum}`,
        zeit: D.mitUhrzeit(D.ausYmd(plus(p.datum, -7)), cfg.uhrzeit),
        titel: 'Geschenk fehlt noch',
        text: `Noch kein Geschenk für ${p.name} (Geburtstag am ${kurzDatum(p.datum)}).`,
      });
    }
  }
  return m;
}

// ---------- Fristen ----------

// frist: {id, name, datum: 'YYYY-MM-DD', monate (0 = einmalig), vorlaufWochen: [4, 1], dauer}
function fristAufgabeId(f) { return `frist-${f.id}-${f.datum}`; }

// Erledigte Fristen weiterschieben (bzw. einmalige entfernen)
function fristenFortschreiben(fristen, status) {
  const erledigt = (status || {}).erledigt || {};
  const neu = [], meldungen = [];
  for (const f0 of fristen || []) {
    let f = { ...f0 };
    let weg = false;
    for (let schutz = 0; erledigt[fristAufgabeId(f)] && schutz < 50; schutz++) {
      if (!(f.monate > 0)) { weg = true; break; }
      f = { ...f, datum: plusMonate(f.datum, f.monate) };
      meldungen.push(`Frist erledigt: ${f.name}, nächste am ${D.deutschDatum(f.datum)}`);
    }
    if (weg) meldungen.push(`Frist erledigt und entfernt: ${f.name}`);
    else neu.push(f);
  }
  return { fristen: neu, meldungen };
}

function fristAufgaben(fristen, heuteYmd) {
  return (fristen || []).map(f => {
    const vorlauf = Math.max(0, ...(f.vorlaufWochen || [4]).map(Number));
    return {
      id: fristAufgabeId(f),
      name: `${f.name} (Frist ${D.deutschDatum(f.datum)})`,
      dauer: f.dauer || 15, pflicht: true, einmalig: true,
      faellig: plus(f.datum, -vorlauf * 7),
      bis: f.datum >= heuteYmd ? f.datum : undefined, // überfällig: so bald wie möglich
    };
  });
}

function fristMitteilungen(fristen, status, cfg) {
  const erledigt = (status || {}).erledigt || {};
  const m = [];
  for (const f of fristen || []) {
    if (erledigt[fristAufgabeId(f)]) continue;
    for (const w of f.vorlaufWochen || []) {
      m.push({
        id: `planer-frist-${f.id}-${f.datum}-${w}`,
        zeit: D.mitUhrzeit(D.ausYmd(plus(f.datum, -7 * w)), cfg.uhrzeit),
        titel: `Frist in ${w} Woche${w === 1 ? '' : 'n'}`,
        text: `${f.name}: fällig am ${D.deutschDatum(f.datum)}.`,
      });
    }
    m.push({
      id: `planer-frist-${f.id}-${f.datum}-0`,
      zeit: D.mitUhrzeit(D.ausYmd(f.datum), cfg.uhrzeit),
      titel: 'Frist heute',
      text: `${f.name}: heute fällig.`,
    });
  }
  return m;
}

// ---------- Checklisten ----------

const BUCHSTABE = 'a-z0-9äöüß';

// Beginnt ein Wort im Text mit dem Stichwort? ("Arzttermin" passt zu "arzt", "Samstag" nicht zu "amt")
function wortBeginn(text, wort) {
  const w = String(wort || '').toLowerCase().trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!w) return false;
  return new RegExp(`(^|[^${BUCHSTABE}])${w}`).test(String(text || '').toLowerCase());
}

// Für jede Fahrt zu einem Termin: passende Checklisten zu Beginn der Ruhe vor der Abfahrt
function checklistenFuer(fahrten, listen, jetzt, ruheMin) {
  const m = [];
  for (const f of fahrten || []) {
    if (!f.zuTermin) continue;
    const passend = (listen || []).filter(l => l.an !== false && (l.stichwoerter || []).some(w => wortBeginn(f.zielName, w)));
    if (!passend.length) continue;
    const abfahrt = new Date(f.abfahrt);
    if (abfahrt <= jetzt) continue;
    let zeit = D.plusMin(abfahrt, -ruheMin);
    if (zeit <= jetzt) zeit = D.plusMin(jetzt, 1);
    const punkte = [...new Set(passend.flatMap(l => l.punkte || []))];
    m.push({
      id: `planer-check-${abfahrt.getTime()}`,
      zeit,
      titel: `Checkliste: ${f.zielName}`,
      text: `${passend.map(l => l.name).join(', ')}\n${punkte.map(p => `- ${p}`).join('\n')}`,
    });
  }
  return m;
}

// ---------- Blumen ----------

function inSperre(datum, anlaesse, sperreTage) {
  for (const a of anlaesse || []) {
    const o = naechstesDatum(a.datum, plus(datum, -sperreTage));
    if (o <= plus(datum, sperreTage)) return o;
  }
  return null;
}

// cfg: {an, minWochen, maxWochen, sperreTage, dauer, vorTage, anlaesse: [{name, datum:'MM-DD'}], naechste}
// zufall: () => Zahl in [0, 1)
function blumenPlanen(cfg, status, heuteYmd, zufall) {
  if (!cfg || !cfg.an) return { cfg, aufgaben: [] };
  const erledigt = (status || {}).erledigt || {};
  const c = { ...cfg };
  const aufgaben = [];

  for (const a of c.anlaesse || []) {
    const o = naechstesDatum(a.datum, heuteYmd);
    const id = `blumen-${slug(a.name)}-${o}`;
    if (erledigt[id]) continue;
    aufgaben.push({
      id, name: `Blumen kaufen (${a.name} am ${kurzDatum(o)})`, dauer: c.dauer,
      pflicht: true, einmalig: true, unterwegs: true, vorziehen: 0,
      faellig: plus(o, -c.vorTage), bis: o,
    });
  }

  const zufallsId = d => `blumen-zufall-${d}`;
  let basis = null;
  if (!c.naechste) basis = heuteYmd;
  else if (erledigt[zufallsId(c.naechste)]) basis = erledigt[zufallsId(c.naechste)];
  else if (plus(c.naechste, 7) < heuteYmd) basis = heuteYmd; // verpasst: neu auslosen
  if (basis) {
    const min = c.minWochen * 7, max = Math.max(min, c.maxWochen * 7);
    let d = plus(basis, min + Math.floor(zufall() * (max - min + 1)));
    for (let schutz = 0; schutz < 20; schutz++) {
      const o = inSperre(d, c.anlaesse, c.sperreTage);
      if (!o) break;
      d = plus(o, c.sperreTage + 1);
    }
    c.naechste = d;
  }
  aufgaben.push({
    id: zufallsId(c.naechste), name: 'Blumen kaufen (einfach so)', dauer: c.dauer,
    pflicht: false, einmalig: true, unterwegs: true,
    faellig: c.naechste, bis: plus(c.naechste, 7),
  });
  return { cfg: c, aufgaben };
}

module.exports = {
  slug, naechstesDatum, plusMonate, leererStatus, aktionAufStatus, statusAnwenden, statusAufraeumen,
  nameAusTitel, geburtstagsListe, geschenkId, geburtstagsAufgaben, geburtstagsMitteilungen,
  fristAufgabeId, fristenFortschreiben, fristAufgaben, fristMitteilungen,
  wortBeginn, checklistenFuer, inSperre, blumenPlanen,
};
