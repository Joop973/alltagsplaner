// Alltags-Extras: Einkaufsliste, Medikamente, Folgeaufgaben, Müllabfuhr, Terminprüfung, Ort aus Titel.
// Reine Funktionen, keine Scriptable-Funktionen.
'use strict';

function hole(n) {
  if (typeof require === 'function') return require('./' + n);
  try { return importModule('planer/core/' + n); } catch (e) { return importModule(n); }
}
const D = hole('datum');
const O = hole('orte');

function plus(ymd, tage) { return D.ymd(D.plusTage(D.ausYmd(ymd), tage)); }
function kurzDatum(ymd) { return `${ymd.slice(8, 10)}.${ymd.slice(5, 7)}.`; }

// ---------- Einkaufsliste ----------
// offen: [{titel, seit: 'YYYY-MM-DD'}] (offene Einträge der Erinnerungen-Liste "Einkauf")
// cfg: {an, abAnzahl, abTagen, dauer}
// -> Unterwegs-Aufgabe "Einkaufen", sobald genug zusammenkommt oder etwas lange wartet.
function einkaufAufgabe(offen, cfg, heuteYmd) {
  if (!cfg || !cfg.an || !offen || !offen.length) return null;
  const aeltester = offen.map(e => e.seit || heuteYmd).sort()[0];
  const wartet = D.tageZwischen(D.ausYmd(aeltester), D.ausYmd(heuteYmd));
  const eilig = offen.some(e => /^(!|dringend\b)/i.test(String(e.titel || '').trim()));
  let faellig;
  if (eilig || offen.length >= cfg.abAnzahl) faellig = heuteYmd;
  else faellig = plus(aeltester, cfg.abTagen);
  if (faellig < heuteYmd) faellig = heuteYmd;
  return {
    id: `einkauf-${faellig}`,
    name: `Einkaufen (${offen.length} ${offen.length === 1 ? 'Sache' : 'Sachen'})`,
    dauer: cfg.dauer, pflicht: eilig || wartet >= cfg.abTagen, einmalig: true, unterwegs: true,
    faellig, bis: plus(faellig, 7),
    schritte: offen.map(e => e.titel).slice(0, 20),
  };
}

// ---------- Medikamente ----------
// med: {id, name, zeiten: ['08:00'], wochentage: [1..7] | null (täglich), vorrat, proEinnahme, nachkaufenTage, an}
// status: {genommen: {'<id>|<datum>|<zeit>': iso}}
// -> Mitteilungen für die nächsten "tage" Tage, je Einnahme eine Erinnerung und eine Nachfrage.
function medEinnahmen(meds, jetzt, tage) {
  const liste = [];
  for (const m of meds || []) {
    if (m.an === false) continue;
    for (let i = 0; i < tage; i++) {
      const tag = D.plusTage(D.tagesBeginn(jetzt), i);
      const wt = tag.getDay() === 0 ? 7 : tag.getDay();
      if (m.wochentage && m.wochentage.length && !m.wochentage.includes(wt)) continue;
      for (const z of m.zeiten || []) {
        liste.push({ med: m, datum: D.ymd(tag), zeit: z, zeitpunkt: D.mitUhrzeit(tag, z) });
      }
    }
  }
  return liste.sort((a, b) => a.zeitpunkt - b.zeitpunkt);
}

function einnahmeSchluessel(e) { return `${e.med.id}|${e.datum}|${e.zeit}`; }

function medMitteilungen(meds, status, jetzt, cfg) {
  const genommen = (status && status.genommen) || {};
  const m = [];
  for (const e of medEinnahmen(meds, jetzt, cfg.tage || 2)) {
    const k = einnahmeSchluessel(e);
    if (genommen[k]) continue;
    const id = `planer-med-${e.med.id}-${e.datum}-${e.zeit.replace(':', '')}`;
    m.push({
      id, zeit: e.zeitpunkt, titel: `Medikament: ${e.med.name}`,
      text: `${e.med.proEinnahme || 1} × ${e.med.name} (${e.zeit})`, aktion: { art: 'med', schluessel: k },
    });
    if (cfg.nachfrageMin > 0) {
      m.push({
        id: `${id}-nach`, zeit: D.plusMin(e.zeitpunkt, cfg.nachfrageMin), titel: `Noch nicht genommen? ${e.med.name}`,
        text: `Seit ${e.zeit} offen.`, aktion: { art: 'med', schluessel: k },
      });
    }
  }
  return m;
}

// Vorrat in Tagen; null, wenn kein Vorrat gepflegt
function medVorratTage(med) {
  if (med.vorrat == null) return null;
  const proTag = (med.zeiten || []).length * (med.proEinnahme || 1) * ((med.wochentage && med.wochentage.length) ? med.wochentage.length / 7 : 1);
  return proTag > 0 ? Math.floor(med.vorrat / proTag) : null;
}

// Nachkaufen: Unterwegs-Aufgabe "Apotheke", wenn der Vorrat bald reicht nicht mehr
function medNachkauf(meds, heuteYmd) {
  const knapp = (meds || []).filter(m => m.an !== false && medVorratTage(m) != null && medVorratTage(m) <= (m.nachkaufenTage || 7));
  if (!knapp.length) return null;
  const min = Math.min(...knapp.map(medVorratTage));
  return {
    id: `apotheke-${heuteYmd.slice(0, 7)}-${knapp.map(m => m.id).sort().join('-')}`,
    name: `Apotheke: ${knapp.map(m => m.name).join(', ')}`,
    dauer: 15, pflicht: true, einmalig: true, unterwegs: true,
    faellig: heuteYmd, bis: plus(heuteYmd, Math.max(0, min - 1)),
  };
}

// Genommen: Status merken, Vorrat herunterzählen
function medGenommen(meds, status, schluessel, jetzt) {
  const st = { genommen: { ...((status && status.genommen) || {}) } };
  if (st.genommen[schluessel]) return { meds, status: st };
  st.genommen[schluessel] = jetzt.toISOString();
  const id = schluessel.split('|')[0];
  const neu = (meds || []).map(m => (m.id === id && m.vorrat != null ? { ...m, vorrat: Math.max(0, m.vorrat - (m.proEinnahme || 1)) } : m));
  // Alte Einträge (älter als 60 Tage) weg
  const grenze = D.ymd(D.plusTage(jetzt, -60));
  for (const k of Object.keys(st.genommen)) if (k.split('|')[1] < grenze) delete st.genommen[k];
  return { meds: neu, status: st };
}

// ---------- Folgeaufgaben ----------
// aufgabe.folge = {name, nachMin, dauer, zuhause: true}
// -> Erinnerungen nach dem Erledigen: nach nachMin, dann alle 30 min, höchstens 3-mal.
function folgeMitteilungen(aufgabe, erledigtUm) {
  const f = aufgabe && aufgabe.folge;
  if (!f || !f.name) return [];
  const basis = D.plusMin(erledigtUm, Number(f.nachMin) || 0);
  return [0, 30, 60].map((plusMin, i) => ({
    id: `planer-folge-${aufgabe.id}-${i}`,
    zeit: D.plusMin(basis, plusMin),
    titel: i === 0 ? `Jetzt: ${f.name}` : `Noch offen: ${f.name}`,
    text: `Nach "${aufgabe.name}".`,
    aktion: { art: 'folge', id: aufgabe.id },
  }));
}

// ---------- Müllabfuhr (Option) ----------
// termine: ganztägige Einträge [{titel, start}] aus dem abonnierten Abfallkalender
// cfg: {an, vorabend: '19:00', morgens: '06:30' | ''}
function muellMitteilungen(termine, jetzt, cfg) {
  if (!cfg || !cfg.an) return [];
  const m = [];
  const heute = D.ymd(jetzt);
  const nachTag = new Map();
  for (const t of termine || []) {
    const d = D.ymd(new Date(t.start));
    if (d < heute) continue;
    if (!nachTag.has(d)) nachTag.set(d, []);
    nachTag.get(d).push(String(t.titel || 'Müll').trim());
  }
  for (const [d, arten] of nachTag) {
    const was = [...new Set(arten)].join(', ');
    if (cfg.vorabend) {
      m.push({ id: `planer-muell-${d}-abend`, zeit: D.mitUhrzeit(D.ausYmd(plus(d, -1)), cfg.vorabend), titel: 'Morgen Müllabfuhr', text: `${was} heute Abend rausstellen.` });
    }
    if (cfg.morgens) {
      m.push({ id: `planer-muell-${d}-morgen`, zeit: D.mitUhrzeit(D.ausYmd(d), cfg.morgens), titel: 'Heute Müllabfuhr', text: `${was} – steht die Tonne draußen?` });
    }
  }
  return m;
}

// ---------- Terminprüfung ----------
// fahrten aus dem Ablauf: Warnung, wenn man zu spät ankommt
function terminWarnungen(ablauf) {
  const w = [];
  for (const f of ablauf.fahrten || []) {
    if (!f.zuTermin) continue;
    const ziel = (ablauf.termine || []).find(t => t.titel === f.zielName && new Date(t.start) >= new Date(f.abfahrt));
    if (!ziel) continue;
    const zuSpaet = Math.round((new Date(f.ankunft) - new Date(ziel.start)) / 60000);
    if (zuSpaet > 0) {
      w.push({
        datum: D.ymd(new Date(ziel.start)),
        text: `${D.kurz(new Date(ziel.start))} ${ziel.titel}: Fahrzeit reicht nicht, ${zuSpaet} min zu spät`,
      });
    }
  }
  return w;
}

// ---------- Ort aus Titel ----------
// gesehen: {titelNorm: {ort, anzahl}} – Termine mit gleichem Titel hatten diesen Ort
function titelOrteLernen(gesehen, termine) {
  const g = { ...(gesehen || {}) };
  for (const t of termine || []) {
    const k = O.norm(t.titel);
    const ort = String(t.ort || '').trim();
    if (!k || !ort) continue;
    const alt = g[k];
    g[k] = alt && O.norm(alt.ort) === O.norm(ort) ? { ort, anzahl: Math.min(99, alt.anzahl + 1) } : { ort, anzahl: 1 };
  }
  return g;
}

// Termin ohne Ort, dessen Titel schon mindestens 2-mal denselben Ort hatte: Ort übernehmen
function ortErgaenzen(termine, gesehen) {
  return (termine || []).map(t => {
    if (String(t.ort || '').trim()) return t;
    const e = (gesehen || {})[O.norm(t.titel)];
    return e && e.anzahl >= 2 ? { ...t, ort: e.ort, ortGelernt: true } : t;
  });
}

module.exports = {
  einkaufAufgabe, medEinnahmen, einnahmeSchluessel, medMitteilungen, medVorratTage, medNachkauf, medGenommen,
  folgeMitteilungen, muellMitteilungen, terminWarnungen, titelOrteLernen, ortErgaenzen, kurzDatum,
};
