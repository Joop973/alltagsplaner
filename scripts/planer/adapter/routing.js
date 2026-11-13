// Scriptable: Fahrzeiten selbst berechnen (OpenStreetMap-Routing, kostenlos). Ersetzt "Wegzeit abrufen"
// im Kurzbefehl, das im Hintergrund zu langsam war und bei unbekannten Orten abbrach.
// Klappt eine Strecke nicht: Schätzung aus der Luftlinie (gilt nur einen Tag), sonst Ersatzzeit.
'use strict';

function hole(p) {
  try { return importModule('planer/' + p); } catch (e) { return importModule('../' + p); }
}
const F = hole('core/fahrzeiten');

const G = typeof globalThis !== 'undefined' ? globalThis : this;
function warten(ms) {
  if (ms <= 0 || typeof Timer === 'undefined') return Promise.resolve();
  return new Promise(r => Timer.schedule(ms, false, r));
}
function imVordergrund() { return typeof config !== 'undefined' && !!config.runsInApp; }

async function route(modus, a, b, regeln) {
  // höflich: höchstens eine Anfrage pro Sekunde
  await warten(1000 - (Date.now() - (G.__planerLetzteRoute || 0)));
  G.__planerLetzteRoute = Date.now();
  const r = new Request(F.routingUrl(modus, a, b));
  r.headers = { 'User-Agent': 'Alltagsplaner/3 (Scriptable; github.com/Joop973/alltagsplaner)' };
  r.timeoutInterval = 10;
  return F.minutenAusRouting(await r.loadJSON(), modus, regeln);
}

// strecken: aus ORT.streckenPruefen (mit vonKoord/nachKoord). Schreibt in cache.
// -> {berechnet, geschaetzt, ohne}
async function berechnen(strecken, cache, heute, regeln, log) {
  const start = Date.now();
  const hintergrund = !imVordergrund();
  const n = { berechnet: 0, geschaetzt: 0, ohne: 0 };
  for (const s of strecken) {
    if (!s.vonKoord || !s.nachKoord) {
      n.ohne++;
      await log(`Fahrzeit unbekannt (Ort ohne Koordinaten): ${s.von} -> ${s.nach} – nehme ${regeln.fallbackMin} min.`);
      continue;
    }
    let min = null, fehler = null;
    if (!(hintergrund && Date.now() - start > 10000)) {
      try { min = await route(s.modus, s.vonKoord, s.nachKoord, regeln); } catch (e) { fehler = String(e && e.message ? e.message : e); }
    } else fehler = 'später (zu viele neue Strecken auf einmal)';
    if (min != null) {
      cache[s.key] = { min, datum: heute, quelle: 'osm' };
      n.berechnet++;
      await log(`Fahrzeit ${s.modus}: ${s.von} -> ${s.nach} = ${min} min`);
      continue;
    }
    const g = F.schaetzung(s.vonKoord, s.nachKoord, s.modus);
    if (g != null) {
      cache[s.key] = { min: g, datum: heute, geschaetzt: true };
      n.geschaetzt++;
      await log(`Fahrzeit geschätzt (Luftlinie, ${s.modus}${fehler ? `; Routing: ${fehler}` : ''}): ${s.von} -> ${s.nach} = ${g} min`);
    }
  }
  return n;
}

module.exports = { berechnen };
