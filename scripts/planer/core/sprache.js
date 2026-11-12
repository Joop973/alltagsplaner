// Spracheingabe: Satz (oder Claude-Antwort als JSON) -> Absichten. Reine Funktionen.
// Datum und Uhrzeit werden immer hier ausgerechnet (nie von der KI), damit nichts falsch wird.
'use strict';

function hole(n) {
  if (typeof require === 'function') return require('./' + n);
  try { return importModule('planer/core/' + n); } catch (e) { return importModule(n); }
}
const D = hole('datum');

const WOCHENTAGE = ['sonntag', 'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag'];
const MONATE = ['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];
const ZAHLWOERTER = { ein: 1, eine: 1, einen: 1, einer: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12, vierzehn: 14, zwanzig: 20, dreißig: 30 };

function norm(s) { return String(s || '').toLowerCase().replace(/[„“"']/g, '').replace(/\s+/g, ' ').trim(); }
function zahl(w) { const n = Number(w); return Number.isFinite(n) ? n : (ZAHLWOERTER[w] || null); }

// ---------- Datum ----------
// -> {datum: 'YYYY-MM-DD', rest: Text ohne die Datumsangabe} oder {datum: null, rest}
function datumAus(text, heute) {
  let t = ` ${norm(text)} `;
  const h = D.tagesBeginn(heute);
  const treffer = (re, f) => {
    const m = t.match(re);
    if (!m) return null;
    const d = f(m);
    if (!d) return null;
    t = t.replace(m[0], ' ');
    return D.ymd(d);
  };
  const ergebnis = treffer(/\s(?:am\s)?übermorgen\s/, () => D.plusTage(h, 2))
    || treffer(/\s(?:am\s)?morgen\s/, () => D.plusTage(h, 1))
    || treffer(/\s(?:für\s)?heute\s/, () => h)
    || treffer(/\sin\s(\d+|[a-zäöüß]+)\s(tag|tagen|woche|wochen)\s/, m => {
      const n = zahl(m[1]);
      return n ? D.plusTage(h, /woche/.test(m[2]) ? n * 7 : n) : null;
    })
    || treffer(/\s(?:am\s|ab\s|bis\s)?(nächsten\s|kommenden\s)?(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\s/, m => {
      const ziel = WOCHENTAGE.indexOf(m[2]);
      let diff = (ziel - h.getDay() + 7) % 7;
      if (diff === 0) diff = 7; // "Dienstag" am Dienstag = nächste Woche
      return D.plusTage(h, diff);
    })
    || treffer(/\s(?:am\s|ab\s|bis\s)?(\d{1,2})\.\s?(\d{1,2})\.?(?:\s?(\d{2,4}))?\s/, m => datumBauen(Number(m[1]), Number(m[2]), m[3], h))
    || treffer(new RegExp(`\\s(?:am\\s|ab\\s|bis\\s)?(\\d{1,2})\\.?\\s(${MONATE.join('|')})(?:\\s(\\d{4}))?\\s`), m => datumBauen(Number(m[1]), MONATE.indexOf(m[2]) + 1, m[3], h));
  return { datum: ergebnis || null, rest: t.replace(/\s+/g, ' ').trim() };
}

function datumBauen(tag, monat, jahrText, heute) {
  let jahr = jahrText ? Number(jahrText) : heute.getFullYear();
  if (jahr < 100) jahr += 2000;
  let d = new Date(jahr, monat - 1, tag);
  if (d.getMonth() !== monat - 1) return null;
  if (!jahrText && d < heute) d = new Date(jahr + 1, monat - 1, tag); // ohne Jahr: nächstes Vorkommen
  return d;
}

// Datum aus einem kurzen Feld (z. B. Claude: "Dienstag", "12.3.", "morgen")
function datumFeld(text, heute) {
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(text).trim())) return String(text).trim();
  return datumAus(String(text), heute).datum;
}

// ---------- Uhrzeit und Dauer ----------
function zeitAus(text) {
  let t = ` ${norm(text)} `;
  let zeit = null;
  const m = t.match(/\s(?:um\s)?(\d{1,2})[:.](\d{2})(?:\suhr)?\s/) || t.match(/\s(?:um\s)?(\d{1,2})\suhr(?:\s(\d{1,2}))?\s/) || t.match(/\sum\s(\d{1,2})\s/);
  if (m) {
    const hh = Number(m[1]), mm = Number(m[2] || 0);
    if (hh < 24 && mm < 60) { zeit = `${D.zwei(hh)}:${D.zwei(mm)}`; t = t.replace(m[0], ' '); }
  }
  const halb = !zeit && t.match(/\s(?:um\s)?halb\s(\d{1,2})\s/);
  if (halb) { zeit = `${D.zwei((Number(halb[1]) + 23) % 24)}:30`; t = t.replace(halb[0], ' '); }
  return { zeit, rest: t.replace(/\s+/g, ' ').trim() };
}

function dauerAus(text) {
  let t = ` ${norm(text)} `;
  let min = null;
  const m = t.match(/\s(?:für\s|dauer\s)?(\d+|[a-zäöüß]+)\s?(stunden|stunde|std\.?|h)\s(?:(\d+)\s?(minuten|min)\s)?/) ;
  if (m && zahl(m[1])) { min = zahl(m[1]) * 60 + (m[3] ? Number(m[3]) : 0); t = t.replace(m[0], ' '); }
  const n = !min && t.match(/\s(?:für\s|dauer\s)?(\d+)\s?(minuten|min)\s/);
  if (n) { min = Number(n[1]); t = t.replace(n[0], ' '); }
  if (!min && /\shalbe stunde\s/.test(t)) { min = 30; t = t.replace(/\s(?:eine\s)?halbe stunde\s/, ' '); }
  return { min, rest: t.replace(/\s+/g, ' ').trim() };
}

// ---------- Namen zuordnen ----------
// Wortstamm grob: "gewaschen" -> "wasch", "putzen" -> "putz"
function stamm(w) { return w.replace(/^ge(?=[a-zäöü]{4})/, '').replace(/(en|t|e|n)$/, ''); }
function wortPasst(a, b) {
  if (a === b) return 2;
  const sa = stamm(a), sb = stamm(b);
  if (sa.length >= 4 && sb.length >= 4 && (sa.startsWith(sb) || sb.startsWith(sa))) return 1;
  return 0;
}
// bestes Element der Liste zum gesagten Namen (Wort für Wort), null wenn nichts passt
function passend(name, liste) {
  const n = norm(name);
  if (!n) return null;
  const genau = liste.find(x => norm(x.name) === n);
  if (genau) return genau;
  const woerter = n.split(' ').filter(w => w.length > 2);
  let best = null, bestWert = 0;
  for (const x of liste) {
    const xw = norm(x.name).split(' ');
    let wert = 0;
    for (const w of woerter) wert += Math.max(0, ...xw.map(y => wortPasst(w, y)));
    if (wert > bestWert || (wert === bestWert && wert > 0 && best && norm(x.name).length < norm(best.name).length)) { best = x; bestWert = wert; }
  }
  if (best) return best;
  return liste.find(x => norm(x.name).includes(n) || n.includes(norm(x.name))) || null;
}

function gross(s) { const t = String(s || '').trim(); return t ? t[0].toUpperCase() + t.slice(1) : t; }

// ---------- Termin ändern ----------
const WOCHENTAG_RE = /(^|\s)(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)(\s|$)/;
const AENDERN_WORT = /(^|\s)(verschieb\w*|verleg\w*|erst|schon|bereits|anfängt|beginnt|startet|fängt)(\s|$)/;
const FUELLWORTE = new Set(['dass', 'das', 'der', 'die', 'den', 'dem', 'mein', 'meine', 'meinen', 'meinem', 'meiner', 'termin', 'erst', 'schon', 'bereits',
  'um', 'uhr', 'am', 'vom', 'von', 'ist', 'wird', 'soll', 'bitte', 'an', 'sag', 'sage', 'planer', 'und', 'auf', 'zu', 'heute', 'morgen', 'übermorgen',
  'anfängt', 'beginnt', 'startet', 'fängt', 'los', 'geht', 'verschoben', 'verlegt']);

function titelAus(text) {
  return norm(text).split(' ').filter(w => w && !FUELLWORTE.has(w) && !/^(verschieb|verleg)/.test(w)).join(' ');
}

// -> {aktion: 'aendern', titel, datum (bisheriger Tag oder null), neuDatum, uhrzeit, dauer} oder null
function aenderungAus(s, k, gross) {
  if (!AENDERN_WORT.test(s)) return null;
  let altTeil = s, neuTeil = s;
  const auf = /(verschieb|verleg)/.test(s) && s.match(/^(.*?)\s(?:auf|zu)\s(.+)$/);
  if (auf) { altTeil = auf[1]; neuTeil = auf[2]; }
  const zeit = zeitAus(neuTeil);
  const dauer = dauerAus(zeit.rest);
  let datum = null, neuDatum = null, rest;
  if (auf) {
    const a = datumAus(altTeil, k.heute);
    datum = a.datum;
    neuDatum = datumAus(dauer.rest, k.heute).datum;
    rest = a.rest;
  } else {
    const a = datumAus(dauer.rest, k.heute);
    datum = a.datum;
    rest = a.rest;
  }
  const titel = titelAus(rest);
  if (!titel || (!zeit.zeit && !neuDatum && !dauer.min)) return null;
  return { aktion: 'aendern', titel: gross(titel), datum, neuDatum, neuWochentag: auf ? WOCHENTAG_RE.test(neuTeil) : false, uhrzeit: zeit.zeit, dauer: dauer.min || null, ort: '' };
}

// Passenden Termin suchen und neue Zeiten ausrechnen.
// termine: [{nr, titel, start, end, ganztag, kalender}]
function aenderungAufloesen(a, k) {
  const ab = D.tagesBeginn(k.heute);
  let kand = (k.termine || []).filter(t => new Date(t.end) > ab).map(t => ({ ...t, name: t.titel }))
    .sort((x, y) => new Date(x.start) - new Date(y.start));
  if (a.datum) kand = kand.filter(t => D.ymd(new Date(t.start)) === a.datum);
  const t = passend(a.titel, kand);
  if (!t) return { aktion: 'unklar', text: `Keinen Termin "${a.titel}"${a.datum ? ` am ${dd(a.datum)}` : ''} gefunden.` };
  if (!a.uhrzeit && !a.neuDatum && !a.dauer && !a.ort) return { aktion: 'unklar', text: `Was soll sich bei "${t.titel}" ändern?` };
  const altStart = new Date(t.start), altEnde = new Date(t.end);
  let tag = a.neuDatum ? D.ausYmd(a.neuDatum) : D.tagesBeginn(altStart);
  // "von Dienstag auf Donnerstag": der Donnerstag nach dem bisherigen Termin
  while (a.neuWochentag && tag < D.tagesBeginn(altStart)) tag = D.plusTage(tag, 7);
  const zeit = a.uhrzeit || (t.ganztag ? null : D.hm(altStart));
  let start, ende, ganztag = false;
  if (zeit) {
    start = D.mitUhrzeit(tag, zeit);
    ende = D.plusMin(start, a.dauer || (t.ganztag ? 60 : Math.round((altEnde - altStart) / 60000)));
  } else {
    ganztag = true;
    start = tag;
    ende = D.plusTage(tag, Math.max(1, D.tageZwischen(altStart, altEnde)));
  }
  const wann = (d, g) => (g ? D.kurz(d) : `${D.kurz(d)} ${D.hm(d)}`);
  return {
    aktion: 'aendern', nr: t.nr, titel: t.titel, kalender: t.kalender, ort: a.ort || '',
    neuStart: start.toISOString(), neuEnde: ende.toISOString(), ganztag,
    beschreibung: `"${t.titel}" (${t.kalender}): ${wann(altStart, t.ganztag)} -> ${wann(start, ganztag)}${ganztag ? '' : `–${D.hm(ende)}`}${a.ort ? `, Ort ${a.ort}` : ''}`,
  };
}

// ---------- Regeln (ohne KI) ----------
// kontext: {aufgaben, meds, heute: Date}
function regeln(satz, k) {
  const s = norm(satz).replace(/[.!?]+$/, '');
  // Originalschreibung (Groß/klein) für Namen, Titel, Orte zurückholen
  const orig = String(satz || '').replace(/[„“"']/g, '').replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');
  const gross = x => {
    const t = String(x || '').trim();
    if (!t) return t;
    const i = orig.length === s.length ? s.indexOf(t) : -1;
    const o = i >= 0 ? orig.slice(i, i + t.length) : t;
    return o[0].toUpperCase() + o.slice(1);
  };
  if (!s) return [{ aktion: 'unklar', text: 'Nichts verstanden.' }];
  // mehrere Sätze ("... und ...") nur bei Einkäufen trennen
  let m;
  if (/^heute keine aufgaben/.test(s)) return [{ aktion: 'keineaufgaben' }];
  if ((m = s.match(/^(?:auf die einkaufsliste|einkaufsliste|einkauf|einkaufen|kaufen|besorgen|wir brauchen|ich brauche)[:\s]+(.+)$/)) || (m = s.match(/^(.+?)\s(?:auf die einkaufsliste|einkaufen|kaufen|besorgen)$/))) {
    return [{ aktion: 'einkauf', sachen: m[1].split(/,|\sund\s/).map(x => gross(x.trim())).filter(Boolean) }];
  }
  if ((m = s.match(/^(?:ich bin |bin )?(krank|urlaub|frei|abwesend|verreist|weg)(.*)$/)) || (m = s.match(/^(.*?)(?:bin ich )?(krank|urlaub|frei|abwesend|verreist)$/))) {
    const wort = /krank/.test(m[1]) || /krank/.test(m[2]) ? 'krank' : /abwesend|verreist|weg/.test(s) ? 'weg' : 'frei';
    const teile = s.split(/\sbis\s/);
    const von = datumAus(teile[0].replace(/\svom\s/, ' '), k.heute).datum || D.ymd(k.heute);
    const bis = teile[1] ? datumAus(teile[1], k.heute).datum : von;
    return [{ aktion: 'abwesend', art: wort, von, bis: bis && bis >= von ? bis : von }];
  }
  if ((m = s.match(/^(?:ich habe |hab )?(.+?)\s(genommen|eingenommen)$/))) {
    return [{ aktion: 'genommen', name: m[1].replace(/^(die|das|den|meine|mein)\s/, '') }];
  }
  if ((m = s.match(/^(?:ich habe |hab )?(.+?)\s(erledigt|gemacht|fertig|geschafft|gewaschen|geputzt|gesaugt|gewechselt)$/))) {
    const verb = ['erledigt', 'gemacht', 'fertig', 'geschafft'].includes(m[2]) ? '' : ` ${m[2]}`;
    return [{ aktion: 'erledigt', name: m[1].replace(/^(das|die|den)\s/, '') + verb }];
  }
  if ((m = s.match(/^(.+?)\s(?:ist )?(nicht nötig|noch sauber|braucht nicht|unnötig)$/))) return [{ aktion: 'nichtnoetig', name: m[1] }];
  if ((m = s.match(/^(.+?)\s(heute nicht|nicht heute)$/))) return [{ aktion: 'heutenicht', name: m[1] }];
  if ((m = s.match(/^(.+?)\s(später)$/))) return [{ aktion: 'spaeter', name: m[1] }];
  if ((m = s.match(/^neue aufgabe\s(.+)$/))) {
    let r = m[1];
    const iv = r.match(/\salle\s(\d+|[a-zäöüß]+)\s(tage|tag|wochen|woche)/);
    const intervall = iv ? zahl(iv[1]) * (/woche/.test(iv[2]) ? 7 : 1) : 7;
    if (iv) r = r.replace(iv[0], '');
    const d = dauerAus(r);
    return [{ aktion: 'aufgabe', name: gross(d.rest.replace(/\s(jede woche|wöchentlich)$/, '')), intervall: intervall || 7, dauer: d.min || 15 }];
  }
  if ((m = s.match(/^frist\s(.+)$/))) {
    const d = datumAus(m[1], k.heute);
    return [{ aktion: 'frist', name: gross(d.rest.replace(/\s(am|bis)$/, '').replace(/^(am|bis)\s/, '')), datum: d.datum }];
  }
  if ((m = s.match(/^geburtstag(?:\svon)?\s(.+)$/))) {
    const d = datumAus(m[1], k.heute);
    return [{ aktion: 'geburtstag', name: gross(d.rest.replace(/\s(am|hat)$/, '')), datum: d.datum }];
  }
  // Bestehenden Termin ändern: "Training morgen erst um 20 Uhr", "Arzt von Dienstag auf Donnerstag 10 Uhr verschieben"
  const aend = aenderungAus(s, k, gross);
  if (aend) return [aend];
  // Termin: "Termin Arzt Dienstag 10 Uhr in Musterstadt" oder alles mit Datum und Uhrzeit
  const z = zeitAus(s);
  const dt = datumAus(z.rest, k.heute);
  const istTermin = /^(termin|treffen|verabredung)\b/.test(s) || (/(^|\s)(termin|treffen|verabredung)(\s|$)/.test(s) && dt.datum);
  if (istTermin || (z.zeit && dt.datum)) {
    const du = dauerAus(dt.rest);
    let rest = du.rest.replace(/^(termin|verabredung)\s/, '').replace(/^(beim|bei der|bei|mit|zum|zur)\s/, (x) => x);
    let ort = '';
    const o = rest.match(/\s(?:in|im|an der|am)\s(.+)$/);
    if (o) { ort = o[1]; rest = rest.slice(0, o.index); }
    return [{ aktion: 'termin', titel: gross(rest.replace(/\s(am|um)$/, '')), datum: dt.datum || D.ymd(k.heute), uhrzeit: z.zeit, dauer: du.min || 60, ort: gross(ort) }];
  }
  return [{ aktion: 'unklar', text: `Nicht verstanden: "${satz}"` }];
}

// ---------- Claude-Antwort ----------
function jsonAus(text) {
  const t = String(text || '');
  const start = t.search(/[[{]/);
  if (start < 0) return null;
  const ende = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (ende <= start) return null;
  try { return JSON.parse(t.slice(start, ende + 1)); } catch (e) { return null; }
}

const ERLAUBT = ['erledigt', 'spaeter', 'heutenicht', 'nichtnoetig', 'einkauf', 'termin', 'aendern', 'aufgabe', 'abwesend', 'keineaufgaben', 'frist', 'geburtstag', 'genommen', 'unklar'];

// Claude-Felder in dieselbe Form wie die Regeln bringen; Datum hier ausrechnen
function ausClaude(objekt, k) {
  const liste = Array.isArray(objekt) ? objekt : Array.isArray(objekt && objekt.aktionen) ? objekt.aktionen : [objekt];
  return liste.filter(Boolean).map(x => {
    const aktion = String(x.aktion || '').toLowerCase().replace(/[^a-zäöü]/g, '').replace('später', 'spaeter');
    if (!ERLAUBT.includes(aktion)) return { aktion: 'unklar', text: 'Antwort von Claude nicht verständlich.' };
    const r = { aktion };
    if (x.name) r.name = String(x.name);
    if (aktion === 'einkauf') r.sachen = (Array.isArray(x.sachen) ? x.sachen : String(x.sachen || x.name || '').split(',')).map(y => gross(String(y).trim())).filter(Boolean);
    if (aktion === 'termin') {
      r.titel = gross(x.titel || x.name || 'Termin');
      r.datum = datumFeld(x.datum, k.heute) || D.ymd(k.heute);
      const z = x.uhrzeit ? zeitAus(` um ${String(x.uhrzeit).replace(/\s?uhr/i, '')} `).zeit || zeitAus(String(x.uhrzeit)).zeit : null;
      r.uhrzeit = z;
      r.dauer = Number(x.dauer) > 0 ? Math.round(Number(x.dauer)) : 60;
      r.ort = gross(x.ort || '');
    }
    if (aktion === 'aendern') {
      r.titel = gross(x.titel || x.name || '');
      r.datum = datumFeld(x.datum, k.heute) || null;
      r.neuDatum = datumFeld(x.neudatum || x.neuDatum, k.heute) || null;
      r.neuWochentag = WOCHENTAG_RE.test(norm(x.neudatum || x.neuDatum || ''));
      r.uhrzeit = x.uhrzeit ? zeitAus(` um ${String(x.uhrzeit).replace(/\s?uhr/i, '')} `).zeit || zeitAus(String(x.uhrzeit)).zeit : null;
      r.dauer = Number(x.dauer) > 0 ? Math.round(Number(x.dauer)) : null;
      r.ort = gross(x.ort || '');
    }
    if (aktion === 'aufgabe') { r.name = gross(x.name || 'Aufgabe'); r.intervall = Number(x.intervall) > 0 ? Math.round(x.intervall) : 7; r.dauer = Number(x.dauer) > 0 ? Math.round(x.dauer) : 15; }
    if (aktion === 'abwesend') {
      r.art = ['krank', 'weg', 'frei'].includes(x.art) ? x.art : 'frei';
      r.von = datumFeld(x.datum || x.von, k.heute) || D.ymd(k.heute);
      const b = datumFeld(x.bis, k.heute);
      r.bis = b && b >= r.von ? b : r.von;
    }
    if (aktion === 'frist' || aktion === 'geburtstag') { r.name = gross(x.name || ''); r.datum = datumFeld(x.datum, k.heute); }
    if (aktion === 'unklar') r.text = String(x.text || 'Claude hat es nicht verstanden.');
    return r;
  });
}

// Eingang vom Kurzbefehl: "DIKTAT: …" und optional "CLAUDE: …" (oder nur ein Satz)
function verstehen(eingang, k) {
  const t = String(eingang || '');
  const diktat = (t.match(/DIKTAT:\s*([\s\S]*?)(?:\n\s*CLAUDE:|$)/i) || [])[1];
  const claude = (t.match(/CLAUDE:\s*([\s\S]*)$/i) || [])[1];
  const json = jsonAus(claude != null ? claude : (diktat == null ? t : ''));
  let absichten = json ? ausClaude(json, k) : null;
  let quelle = absichten && absichten.some(a => a.aktion !== 'unklar') ? 'claude' : 'regeln';
  // Claude hat (z. B. mit alter Anweisung) einen neuen Termin gemacht, gemeint ist aber eine Änderung
  if (quelle === 'claude' && diktat && !absichten.some(a => a.aktion === 'aendern')) {
    const r = regeln(diktat.trim(), k);
    if (r.length === 1 && r[0].aktion === 'aendern' && absichten.every(a => a.aktion === 'termin' || a.aktion === 'unklar')) quelle = 'regeln';
  }
  if (quelle === 'regeln') absichten = regeln(diktat != null ? diktat.trim() : t.trim(), k);
  return { quelle, absichten: absichten.map(a => aufloesen(a, k)).map(a => (a.beschreibung ? a : { ...a, beschreibung: beschreiben(a) })) };
}

// Namen auf Aufgaben/Medikamente beziehen, Beschreibung bauen
function aufloesen(a, k) {
  const r = { ...a };
  if (['erledigt', 'spaeter', 'heutenicht', 'nichtnoetig'].includes(a.aktion)) {
    const auf = passend(a.name, k.aufgaben || []);
    if (!auf) return { aktion: 'unklar', text: `Keine Aufgabe "${a.name}" gefunden.` };
    r.id = auf.id;
    r.name = auf.name;
  }
  if (a.aktion === 'genommen') {
    const med = passend(a.name, k.meds || []);
    if (!med) return { aktion: 'unklar', text: `Kein Medikament "${a.name}" gefunden.` };
    r.id = med.id;
    r.name = med.name;
  }
  if (a.aktion === 'aendern') return aenderungAufloesen(a, k);
  if ((a.aktion === 'frist' || a.aktion === 'geburtstag') && !a.datum) return { aktion: 'unklar', text: `Datum für "${a.name}" fehlt.` };
  if (a.aktion === 'einkauf' && !(a.sachen || []).length) return { aktion: 'unklar', text: 'Was soll auf die Einkaufsliste?' };
  r.beschreibung = beschreiben(r);
  return r;
}

function dd(ymd) { return ymd ? D.kurz(D.ausYmd(ymd)) : ''; }

function beschreiben(a) {
  switch (a.aktion) {
    case 'erledigt': return `"${a.name}" als erledigt markieren`;
    case 'spaeter': return `"${a.name}" später`;
    case 'heutenicht': return `"${a.name}" heute nicht`;
    case 'nichtnoetig': return `"${a.name}" nicht nötig (Abstand neu ab heute)`;
    case 'einkauf': return `Auf die Einkaufsliste: ${a.sachen.join(', ')}`;
    case 'termin': return `Termin "${a.titel}" am ${dd(a.datum)}${a.uhrzeit ? ` um ${a.uhrzeit} (${a.dauer} min)` : ' (ganztägig)'}${a.ort ? ` in ${a.ort}` : ''}`;
    case 'aendern': return `Termin "${a.titel}" ändern`;
    case 'aufgabe': return `Neue Aufgabe "${a.name}" alle ${a.intervall} Tage, ${a.dauer} min`;
    case 'abwesend': return `${{ krank: 'Krank', weg: 'Abwesend', frei: 'Frei' }[a.art]} ${a.von === a.bis ? `am ${dd(a.von)}` : `vom ${dd(a.von)} bis ${dd(a.bis)}`}`;
    case 'keineaufgaben': return 'Heute keine Aufgaben';
    case 'frist': return `Frist "${a.name}" am ${dd(a.datum)}`;
    case 'geburtstag': return `Geburtstag von ${a.name} am ${a.datum ? `${a.datum.slice(8)}.${a.datum.slice(5, 7)}.` : ''}`;
    case 'genommen': return `${a.name} genommen`;
    default: return a.text || 'Nicht verstanden.';
  }
}

// Text für den Kurzbefehl "Claude fragen" (steht auch in docs/kurzbefehle.md)
const CLAUDE_ANWEISUNG = 'Wandle den folgenden gesprochenen Satz für meinen Alltagsplaner in JSON um. Antworte NUR mit JSON, ohne Erklärung, im Format {"aktionen":[{...}]}. Felder: aktion (erledigt, spaeter, heutenicht, nichtnoetig, einkauf, termin, aendern, aufgabe, abwesend, keineaufgaben, frist, geburtstag, genommen oder unklar), name (Aufgabe, Medikament, Person oder Frist), sachen (Liste, nur bei einkauf), titel, datum, uhrzeit (HH:MM), dauer (Minuten), ort (bei termin und aendern), neudatum (nur bei aendern), bis (letzter Tag bei abwesend), art (frei, krank oder weg bei abwesend), intervall (Tage bei aufgabe). termin = neuer Termin. aendern = einen bestehenden Termin verschieben oder ändern (z. B. "Training morgen erst um 20 Uhr", "Arzt von Dienstag auf Donnerstag verschieben"): titel = Name des Termins, datum = bisheriger Tag (nur wenn gesagt), neudatum = neuer Tag, uhrzeit = neue Uhrzeit. Datum genau so übernehmen, wie es gesagt wurde (z. B. "morgen", "Dienstag", "12.3."), nicht ausrechnen. Satz:';

module.exports = { datumAus, datumFeld, zeitAus, dauerAus, passend, aenderungAus, aenderungAufloesen, regeln, jsonAus, ausClaude, verstehen, beschreiben, CLAUDE_ANWEISUNG };
