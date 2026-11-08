// Datums-Hilfen. Alles in lokaler Zeit (iPhone bzw. TZ=Europe/Berlin).
'use strict';

const WOCHENTAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

function zwei(n) { return String(n).padStart(2, '0'); }

// Date -> "2026-11-12"
function ymd(d) { return `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`; }

// "2026-11-12" -> Date (00:00 lokal)
function ausYmd(s) {
  const [j, m, t] = String(s).split('-').map(Number);
  return new Date(j, m - 1, t);
}

// Date -> "16:45"
function hm(d) { return `${zwei(d.getHours())}:${zwei(d.getMinutes())}`; }

// Date -> "Do 12.11."
function kurz(d) { return `${WOCHENTAGE[d.getDay()]} ${zwei(d.getDate())}.${zwei(d.getMonth() + 1)}.`; }

// "07:30" -> Minuten seit Mitternacht
function minutenAus(s) {
  const [h, m] = String(s).split(':').map(Number);
  return h * 60 + (m || 0);
}

// Tag von d mit Uhrzeit "HH:MM"
function mitUhrzeit(d, s) {
  const min = minutenAus(s);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(min / 60), min % 60);
}

function tagesBeginn(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

function plusTage(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n,
    d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
}

function plusMin(d, n) { return new Date(d.getTime() + n * 60000); }

// Kalendertage von a bis b (b - a), sommerzeitfest
function tageZwischen(a, b) { return Math.round((tagesBeginn(b) - tagesBeginn(a)) / 86400000); }

function montagVon(d) {
  const t = tagesBeginn(d);
  return plusTage(t, -((t.getDay() + 6) % 7));
}

// auf volle 5 Minuten aufrunden
function aufrunden5(d) {
  const schritt = 5 * 60000;
  return new Date(Math.ceil(d.getTime() / schritt) * schritt);
}

function alsDatum(x) {
  if (x == null || x === '') return null;
  return x instanceof Date ? x : new Date(x);
}

// Eingabe aus der App -> "YYYY-MM-DD", null (= leer) oder undefined (= ungültig).
// "heute", "gestern", "3" (= vor 3 Tagen), "12.11.", "12.11.2026", "2026-11-12"
function datumEingabe(text, heute) {
  const s = String(text == null ? '' : text).trim().toLowerCase();
  if (!s) return null;
  if (s === 'heute') return ymd(heute);
  if (s === 'gestern') return ymd(plusTage(tagesBeginn(heute), -1));
  if (/^\d{1,4}$/.test(s)) return ymd(plusTage(tagesBeginn(heute), -Number(s)));
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return gueltig(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.?(\d{2,4})?$/);
  if (m) {
    let j = m[3] ? Number(m[3]) : heute.getFullYear();
    if (j < 100) j += 2000;
    return gueltig(j, Number(m[2]), Number(m[1]));
  }
  return undefined;
}
function gueltig(j, mo, t) {
  const d = new Date(j, mo - 1, t);
  return d.getMonth() === mo - 1 && d.getDate() === t ? ymd(d) : undefined;
}

// "2026-11-12" -> "12.11.2026"
function deutschDatum(s) {
  if (!s) return '';
  const [j, m, t] = String(s).split('-');
  return `${t}.${m}.${j}`;
}

module.exports = {
  datumEingabe, deutschDatum,
  WOCHENTAGE, zwei, ymd, ausYmd, hm, kurz, minutenAus, mitUhrzeit, tagesBeginn,
  plusTage, plusMin, tageZwischen, montagVon, aufrunden5, alsDatum,
};
