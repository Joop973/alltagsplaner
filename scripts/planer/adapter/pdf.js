// Scriptable: Text mit Positionen aus einer PDF holen (pdf.js in einer unsichtbaren WebView).
// Das Leseprogramm pdf.js (frei, Apache-Lizenz) wird einmal geladen und dann offline genutzt.
'use strict';

function hole(p) {
  try { return importModule('planer/' + p); } catch (e) { return importModule('../' + p); }
}
const DAT = hole('adapter/dateien');

const VERSION = '3.11.174';
// zwei Quellen, falls eine nicht erreichbar ist
const QUELLEN = [
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${VERSION}/`,
  `https://cdn.jsdelivr.net/npm/pdfjs-dist@${VERSION}/build/`,
];
const DATEIEN = { lib: 'pdf.min.js', worker: 'pdf.worker.min.js' };

async function leserLaden(log) {
  const f = DAT.fm();
  const ordner = f.joinPath(DAT.basisPfad(), 'planer-pdfjs');
  if (!f.fileExists(ordner)) f.createDirectory(ordner, true);
  const texte = {};
  for (const [k, name] of Object.entries(DATEIEN)) {
    const p = f.joinPath(ordner, `${VERSION}-${name}`);
    if (f.fileExists(p)) {
      try { if (f.isFileStoredIniCloud(p) && !f.isFileDownloaded(p)) await f.downloadFileFromiCloud(p); } catch (e) { /* lokal */ }
      texte[k] = f.readString(p);
      continue;
    }
    await log(`Lade PDF-Leseprogramm: ${name}`);
    let t = null;
    for (const q of QUELLEN) {
      try {
        const r = new Request(q + name);
        r.timeoutInterval = 60;
        const x = await r.loadString();
        if (r.response && r.response.statusCode === 200 && x.length > 100000) { t = x; break; }
      } catch (e) { await log(`${q}: ${e}`); }
    }
    if (!t) throw new Error(`PDF-Leseprogramm nicht ladbar (${name}). Beim ersten Mal ist Internet nötig.`);
    f.writeString(p, t);
    texte[k] = t;
  }
  return texte;
}

// pfad: Dateipfad der PDF -> [{s, x, y, w, seite}]
async function textStuecke(pfad, log) {
  const { lib, worker } = await leserLaden(log);
  const b64 = Data.fromFile(pfad).toBase64String();
  const wv = new WebView();
  await wv.loadHTML('<html><head><meta charset="utf-8"></head><body></body></html>');
  // Beide Teile direkt in die Seite laden. Ist "pdfjsWorker" vorhanden, liest pdf.js ohne
  // eigenen Hintergrund-Prozess (kein Blob-Worker nötig). ";0" am Ende: Das letzte Ergebnis
  // muss eine Zahl sein, sonst meldet iOS "Nicht unterstützter Typ".
  await wv.evaluateJavaScript(`${lib}\n;0`, false);
  await wv.evaluateJavaScript(`${worker}\n;0`, false);
  const js = `
    (async () => {
      try {
        const roh = atob(${JSON.stringify(b64)});
        const bytes = new Uint8Array(roh.length);
        for (let i = 0; i < roh.length; i++) bytes[i] = roh.charCodeAt(i);
        const doc = await pdfjsLib.getDocument({ data: bytes, isEvalSupported: false }).promise;
        const out = [];
        for (let p = 1; p <= doc.numPages; p++) {
          const page = await doc.getPage(p);
          const tc = await page.getTextContent();
          for (const it of tc.items) {
            if (!it.str || !it.str.trim()) continue;
            out.push({ s: it.str, x: it.transform[4], y: it.transform[5], w: it.width, seite: p });
          }
        }
        completion(JSON.stringify(out));
      } catch (e) {
        completion(JSON.stringify({ fehler: String(e && e.message ? e.message : e) }));
      }
    })();
    0;`;
  const ergebnis = JSON.parse(await wv.evaluateJavaScript(js, true));
  if (ergebnis.fehler) throw new Error(`PDF nicht lesbar: ${ergebnis.fehler}`);
  return ergebnis;
}

module.exports = { textStuecke, leserLaden };
