// Gesetzliche Feiertage Niedersachsen plus selbst festgelegte freie Tage (z. B. 24.12.).
'use strict';

const D = (typeof require === 'function') ? require('./datum') : (function () {
  try { return importModule('planer/core/datum'); } catch (e) { return importModule('datum'); }
})();

// Ostersonntag (gregorianisch)
function ostersonntag(j) {
  const a = j % 19, b = Math.floor(j / 100), c = j % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31);
  const tag = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(j, monat - 1, tag);
}

function feiertage(j) {
  const o = ostersonntag(j);
  const f = (d, name) => ({ datum: D.ymd(d), name });
  return [
    f(new Date(j, 0, 1), 'Neujahr'),
    f(D.plusTage(o, -2), 'Karfreitag'),
    f(D.plusTage(o, 1), 'Ostermontag'),
    f(new Date(j, 4, 1), 'Tag der Arbeit'),
    f(D.plusTage(o, 39), 'Christi Himmelfahrt'),
    f(D.plusTage(o, 50), 'Pfingstmontag'),
    f(new Date(j, 9, 3), 'Tag der Deutschen Einheit'),
    f(new Date(j, 9, 31), 'Reformationstag'),
    f(new Date(j, 11, 25), '1. Weihnachtstag'),
    f(new Date(j, 11, 26), '2. Weihnachtstag'),
  ];
}

// "24.12." / "24.12" / "1.5" -> "24.12" / "01.05"
function tagMonat(s) {
  const teile = String(s).trim().replace(/\.$/, '').split('.');
  if (teile.length < 2) return null;
  return `${D.zwei(Number(teile[0]))}.${D.zwei(Number(teile[1]))}`;
}

// Name des freien Tages oder null. extraFrei z. B. ["24.12", "31.12"]
function freierTag(datumYmd, extraFrei) {
  const j = Number(datumYmd.slice(0, 4));
  const fe = feiertage(j).find(x => x.datum === datumYmd);
  if (fe) return fe.name;
  const tm = `${datumYmd.slice(8, 10)}.${datumYmd.slice(5, 7)}`;
  if ((extraFrei || []).map(tagMonat).includes(tm)) return `frei (${tm}.)`;
  return null;
}

module.exports = { ostersonntag, feiertage, freierTag, tagMonat };
