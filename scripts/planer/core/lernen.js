// Lernen aus dem Gedächtnis (gedaechtnis.json). Reine Funktionen.
// Regeln: erst ab 3 Beobachtungen; kleine Anpassungen automatisch (Dauer bis ±50 %, Tageszeiten meiden),
// große nur als Vorschlag (Abstand, große Dauer-Änderung). Alles mit Begründung, damit es rückgängig gemacht werden kann.
'use strict';

function hole(n) {
  if (typeof require === 'function') return require('./' + n);
  try { return importModule('planer/core/' + n); } catch (e) { return importModule(n); }
}
const D = hole('datum');

const MIN_BEOBACHTUNGEN = 3;
const FENSTER_TAGE = 90;

function median(z) {
  const s = z.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function runden5(n) { return Math.max(5, Math.round(n / 5) * 5); }

// Tageszeit eines Zeitpunkts
function band(zeit) {
  const h = new Date(zeit).getHours();
  return h < 12 ? 'morgens' : h < 17 ? 'nachmittags' : 'abends';
}
const BAND_START = { morgens: 0, nachmittags: 12, abends: 17 };

// Nächster Start ab s (ms), der nicht in einer gemiedenen Tageszeit liegt; null = keiner am selben Tag
function erlaubterStart(s, meiden) {
  if (!meiden || !meiden.length) return s;
  let t = s;
  for (let i = 0; i < 3; i++) {
    const b = band(t);
    if (!meiden.includes(b)) return t;
    const d = new Date(t);
    const naechstes = b === 'morgens' ? 'nachmittags' : b === 'nachmittags' ? 'abends' : null;
    if (!naechstes) return null;
    t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), BAND_START[naechstes]).getTime();
  }
  return null;
}

function schluessel(id, feld) { return `${id}|${feld}`; }

// ged: {ereignisse}, aufgaben, stand: {abgelehnt: {schluessel: datum}}
// -> {auto: [{id, name, feld, alt, neu, grund}], vorschlaege: [...], hinweise: [text]}
function auswerten(ged, aufgaben, jetzt, stand) {
  const grenze = D.plusTage(jetzt, -FENSTER_TAGE).toISOString();
  const ev = ((ged && ged.ereignisse) || []).filter(e => e.t >= grenze);
  const abgelehnt = (stand && stand.abgelehnt) || {};
  const gesperrt = (id, feld) => {
    const d = abgelehnt[schluessel(id, feld)];
    return d && D.tageZwischen(D.ausYmd(d), jetzt) < 60;
  };
  const auto = [], vorschlaege = [], hinweise = [];

  for (const a of aufgaben) {
    if (a.aktiv === false || a.lernen === false) continue;
    const eigene = ev.filter(e => e.id === a.id);

    // 1) Dauer: Zeit vom geplanten Start bis "Erledigt" (unter 3 min = vorab gedrückt, zählt nicht)
    const dauern = eigene
      .filter(e => e.typ === 'erledigt' && e.geplantStart)
      .map(e => (new Date(e.t) - new Date(e.geplantStart)) / 60000)
      .filter(m => m >= 3 && m <= Number(a.dauer) * 3 + 30)
      .slice(-6);
    if (dauern.length >= MIN_BEOBACHTUNGEN && !gesperrt(a.id, 'dauer')) {
      const m = runden5(median(dauern));
      const diff = Math.abs(m - a.dauer);
      if (diff >= 5 && diff >= a.dauer * 0.2) {
        const e = { id: a.id, name: a.name, feld: 'dauer', alt: a.dauer, neu: Math.min(m, 180),
          grund: `${dauern.length}-mal nach etwa ${Math.round(median(dauern))} min erledigt` };
        (diff <= a.dauer * 0.5 ? auto : vorschlaege).push(e);
      }
    }

    // 2) Abstand: Tage zwischen Erledigungen; "Nicht nötig" spricht für längere Abstände
    if (!a.einmalig && !gesperrt(a.id, 'intervall')) {
      const tage = [...new Set(eigene.filter(e => ['erledigt', 'abgehakt'].includes(e.typ)).map(e => e.t.slice(0, 10)))].sort();
      const luecken = tage.slice(1).map((d, i) => D.tageZwischen(D.ausYmd(tage[i]), D.ausYmd(d))).filter(x => x > 0).slice(-5);
      const nichtNoetig = eigene.filter(e => e.typ === 'nichtnoetig').length;
      if (luecken.length >= MIN_BEOBACHTUNGEN) {
        const g = Math.round(median(luecken));
        if (Math.abs(g - a.intervall) >= Math.max(1, a.intervall * 0.25)) {
          vorschlaege.push({ id: a.id, name: a.name, feld: 'intervall', alt: a.intervall, neu: g,
            grund: `zuletzt im Schnitt alle ${g} Tage erledigt` });
        }
      } else if (nichtNoetig >= MIN_BEOBACHTUNGEN) {
        vorschlaege.push({ id: a.id, name: a.name, feld: 'intervall', alt: a.intervall, neu: Math.round(a.intervall * 1.5),
          grund: `${nichtNoetig}-mal "nicht nötig"` });
      }
    }

    // 3) Tageszeiten meiden: oft verschoben und dort nie erledigt
    if (!gesperrt(a.id, 'meiden')) {
      const verschoben = {}, erledigt = {};
      for (const e of eigene) {
        if (!e.geplantStart) continue;
        const b = band(e.geplantStart);
        if (e.typ === 'spaeter' || e.typ === 'heutenicht') verschoben[b] = (verschoben[b] || 0) + 1;
        if (e.typ === 'erledigt') erledigt[b] = (erledigt[b] || 0) + 1;
      }
      const meiden = new Set(a.meiden || []);
      for (const [b, n] of Object.entries(verschoben)) {
        if (n >= MIN_BEOBACHTUNGEN && !erledigt[b] && !meiden.has(b) && meiden.size < 2) {
          auto.push({ id: a.id, name: a.name, feld: 'meiden', alt: [...meiden], neu: [...meiden, b],
            grund: `${n}-mal ${b} verschoben, dort nie erledigt` });
          meiden.add(b);
        }
      }
    }
  }

  // 4) Abfahrten: fährst du regelmäßig später los als geplant?
  const verspaetung = ev.filter(e => e.typ === 'abfahrt' && e.geplant).map(e => (new Date(e.t) - new Date(e.geplant)) / 60000)
    .filter(m => Math.abs(m) <= 60).slice(-10);
  if (verspaetung.length >= 5) {
    const m = Math.round(median(verspaetung));
    if (m >= 5) hinweise.push(`Du fährst im Schnitt ${m} min später los als geplant. Tipp: "Ruhe vor jeder Abfahrt" verkürzen oder Wecker früher stellen.`);
    if (m <= -5) hinweise.push(`Du fährst im Schnitt ${-m} min früher los als geplant.`);
  }
  return { auto, vorschlaege, hinweise };
}

// Änderung auf die Aufgaben anwenden (auch für Rückgängig: mit wert = alt)
function anwenden(aufgaben, id, feld, wert) {
  return aufgaben.map(a => (a.id === id ? { ...a, [feld]: wert } : a));
}

// Wochenrückblick (Sonntag): Zahlen der letzten 7 Tage
function wochenrueckblick(ged, aufgaben, jetzt, faelligAm, anzahlVorschlaege) {
  const grenze = D.plusTage(jetzt, -7).toISOString();
  const ev = ((ged && ged.ereignisse) || []).filter(e => e.t >= grenze);
  const zahl = typ => ev.filter(e => e.typ === typ).length;
  const heute = D.ymd(jetzt);
  const liegen = aufgaben
    .filter(a => a.aktiv !== false)
    .map(a => ({ a, tage: D.tageZwischen(D.ausYmd(faelligAm(a, heute)), D.ausYmd(heute)) }))
    .filter(x => x.tage > 0)
    .sort((x, y) => y.tage - x.tage);
  const zeilen = [`Erledigt: ${zahl('erledigt') + zahl('abgehakt')} · verschoben: ${zahl('spaeter') + zahl('heutenicht')} · nicht nötig: ${zahl('nichtnoetig')}`];
  if (zahl('medikament')) zeilen.push(`Medikamente bestätigt: ${zahl('medikament')}`);
  if (liegen.length) zeilen.push(`Liegt am längsten: ${liegen.slice(0, 2).map(x => `${x.a.name} (${x.tage} T)`).join(', ')}`);
  else zeilen.push('Nichts überfällig – stark!');
  if (anzahlVorschlaege) zeilen.push(`${anzahlVorschlaege} Vorschlag/Vorschläge: Planer → Aufgaben → Gelernt`);
  return zeilen.join('\n');
}

// Nächster Sonntag 18:00 (heute, wenn Sonntag und noch davor)
function naechsterSonntag(jetzt, uhrzeit) {
  for (let i = 0; i < 8; i++) {
    const t = D.plusTage(D.tagesBeginn(jetzt), i);
    if (t.getDay() !== 0) continue;
    const z = D.mitUhrzeit(t, uhrzeit);
    if (z > jetzt) return z;
  }
  return null;
}

module.exports = { median, band, erlaubterStart, schluessel, auswerten, anwenden, wochenrueckblick, naechsterSonntag };
