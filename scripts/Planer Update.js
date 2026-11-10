// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-green; icon-glyph: cloud-download-alt;
// Lädt alle Planer-Dateien laut manifest.json von GitHub (Zweig main).
// Der Ordner planer-daten/ (deine Daten) wird nie angefasst.
const QUELLE = 'https://raw.githubusercontent.com/Joop973/alltagsplaner/main/';

function ordnerVon(pfad) { return pfad.slice(0, pfad.lastIndexOf('/')); }

const basis = ordnerVon(module.filename);
let fm = FileManager.local();
try {
  const ic = FileManager.iCloud();
  if (ic.isFileStoredIniCloud(module.filename) || basis.startsWith(ic.documentsDirectory())) fm = ic;
} catch (e) { /* kein iCloud */ }

async function laden(pfad) {
  const r = new Request(QUELLE + pfad.split('/').map(encodeURIComponent).join('/') + '?t=' + Date.now());
  r.timeoutInterval = 30;
  const text = await r.loadString();
  const status = r.response && r.response.statusCode;
  if (status !== 200) throw new Error(`${pfad}: HTTP ${status}`);
  return text;
}

async function vorhanden(p) {
  if (!fm.fileExists(p)) return null;
  try { if (fm.isFileStoredIniCloud(p) && !fm.isFileDownloaded(p)) await fm.downloadFileFromiCloud(p); } catch (e) { /* lokal */ }
  return fm.readString(p);
}

const zeilen = [];
let fehler = 0;
try {
  const manifest = JSON.parse(await laden('manifest.json'));
  // erst alles laden, dann schreiben – so bleibt bei Netzfehlern alles beim Alten
  const neu = [];
  for (const datei of manifest.dateien) {
    if (datei.startsWith('planer-daten/') || datei.includes('..')) continue;
    neu.push({ datei, text: await laden('scripts/' + datei) });
  }
  for (const { datei, text } of neu) {
    if (!text || !text.trim()) { zeilen.push(`leer, übersprungen: ${datei}`); fehler++; continue; }
    const ziel = fm.joinPath(basis, datei);
    const ord = ordnerVon(ziel);
    if (!fm.fileExists(ord)) fm.createDirectory(ord, true);
    const alt = await vorhanden(ziel);
    if (alt === text) continue;
    fm.writeString(ziel, text);
    zeilen.push(`${alt == null ? 'neu' : 'aktualisiert'}: ${datei}`);
  }
  // installierte Version merken (für den Update-Hinweis)
  const vp = fm.joinPath(fm.joinPath(basis, 'planer'), 'version.json');
  if (!fm.fileExists(ordnerVon(vp))) fm.createDirectory(ordnerVon(vp), true);
  fm.writeString(vp, JSON.stringify({ version: manifest.version, installiert: new Date().toISOString() }));
  if (!zeilen.length) zeilen.push('Alles ist schon aktuell.');
  zeilen.unshift(`Version ${manifest.version}`);
} catch (e) {
  fehler++;
  zeilen.push(`FEHLER: ${e}`);
}

const a = new Alert();
a.title = fehler ? 'Update mit Fehlern' : 'Update fertig';
a.message = zeilen.join('\n');
a.addAction('OK');
if (config.runsInApp) await a.presentAlert();
else Script.setShortcutOutput(a.message);
Script.complete();
