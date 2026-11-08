// Scriptable: Dateien in planer-daten/ lesen und schreiben, Log führen.
'use strict';

const DATEN = 'planer-daten';
const LOG_ZEILEN = 400;

// Scriptable-Hauptordner (dort liegen Planer.js usw.)
function basisPfad() {
  const f = String(module.filename || '');
  const m = f.match(/^(.*)\/planer\/adapter\/[^/]+$/);
  if (m) return m[1];
  return FileManager.iCloud().documentsDirectory();
}

function fm() {
  const basis = basisPfad();
  try {
    const ic = FileManager.iCloud();
    if (basis.startsWith(ic.documentsDirectory())) return ic;
  } catch (e) { /* kein iCloud */ }
  return FileManager.local();
}

function ordner() {
  const f = fm();
  const p = f.joinPath(basisPfad(), DATEN);
  if (!f.fileExists(p)) f.createDirectory(p, true);
  return p;
}

function pfad(name) { return fm().joinPath(ordner(), name); }

async function herunterladen(f, p) {
  try {
    if (f.isFileStoredIniCloud(p) && !f.isFileDownloaded(p)) await f.downloadFileFromiCloud(p);
  } catch (e) { /* lokal */ }
}

async function textLesen(name) {
  const f = fm(), p = pfad(name);
  if (!f.fileExists(p)) return null;
  await herunterladen(f, p);
  return f.readString(p);
}

async function lesen(name, standard) {
  const t = await textLesen(name);
  if (t == null || t.trim() === '') return standard;
  try { return JSON.parse(t); } catch (e) {
    await log(`FEHLER: ${name} ist beschädigt (${e}). Standardwerte benutzt.`);
    return standard;
  }
}

async function schreiben(name, daten) {
  fm().writeString(pfad(name), JSON.stringify(daten, null, 2));
}

function zeitstempel(d) {
  const z = n => String(n).padStart(2, '0');
  return `${z(d.getDate())}.${z(d.getMonth() + 1)}. ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
}

async function log(text) {
  try {
    const alt = (await textLesen('log.txt')) || '';
    const zeilen = alt.split('\n').filter(Boolean);
    for (const z of String(text).split('\n')) zeilen.push(`${zeitstempel(new Date())} ${z}`);
    fm().writeString(pfad('log.txt'), zeilen.slice(-LOG_ZEILEN).join('\n') + '\n');
  } catch (e) { console.log('Log-Fehler: ' + e); }
  console.log(text);
}

async function logLesen() { return (await textLesen('log.txt')) || '(Log ist leer)'; }

async function logLeeren() { fm().writeString(pfad('log.txt'), ''); }

module.exports = { basisPfad, fm, ordner, pfad, lesen, schreiben, log, logLesen, logLeeren };
