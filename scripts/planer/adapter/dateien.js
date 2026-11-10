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

// Log sammeln und gebündelt schreiben (einmal pro Lauf statt je Zeile).
// global, damit mehrfach geladene Module denselben Puffer nutzen
const G = typeof globalThis !== 'undefined' ? globalThis : this;
const puffer = G.__planerLogPuffer || (G.__planerLogPuffer = []);

async function log(text) {
  for (const z of String(text).split('\n')) puffer.push(`${zeitstempel(new Date())} ${z}`);
  console.log(text);
  if (puffer.length >= 40) await logSchreiben();
}

async function logSchreiben() {
  if (!puffer.length) return;
  try {
    const alt = (await textLesen('log.txt')) || '';
    const zeilen = alt.split('\n').filter(Boolean).concat(puffer.splice(0));
    fm().writeString(pfad('log.txt'), zeilen.slice(-LOG_ZEILEN).join('\n') + '\n');
  } catch (e) { console.log('Log-Fehler: ' + e); }
}

async function logLesen() { await logSchreiben(); return (await textLesen('log.txt')) || '(Log ist leer)'; }

async function logLeeren() { puffer.splice(0); fm().writeString(pfad('log.txt'), ''); }

// Sicherung: alle Dateien in planer-daten als ein Objekt (ohne Log)
function sicherungErstellen() {
  const f = fm(), o = ordner(), daten = {};
  for (const n of f.listContents(o)) {
    if (!n.endsWith('.json')) continue;
    try { daten[n] = JSON.parse(f.readString(f.joinPath(o, n))); } catch (e) { /* überspringen */ }
  }
  return { art: 'planer-sicherung', erstellt: new Date().toISOString(), daten };
}

async function sicherungEinspielen(sicherung) {
  if (!sicherung || sicherung.art !== 'planer-sicherung' || !sicherung.daten) throw new Error('Keine Planer-Sicherung.');
  for (const [n, d] of Object.entries(sicherung.daten)) {
    if (!/^[\w.-]+\.json$/.test(n)) continue;
    await schreiben(n, d);
  }
  return Object.keys(sicherung.daten).length;
}

module.exports = { basisPfad, fm, ordner, pfad, lesen, schreiben, log, logSchreiben, logLesen, logLeeren, sicherungErstellen, sicherungEinspielen };
