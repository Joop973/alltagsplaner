// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-green; icon-glyph: file-alt; share-sheet-inputs: file-url;
// Dienstplan-PDF einlesen: PDF öffnen -> Teilen -> Scriptable -> "Planer Dienstplan".
const DPA = importModule('planer/adapter/dienstplan');
const P = importModule('planer/adapter/planung');
try {
  const pfad = (args.fileURLs && args.fileURLs[0]) || null;
  await DPA.importieren(pfad ? String(pfad).replace(/^file:\/\//, '') : null);
} catch (e) {
  await P.fehler(e);
  const a = new Alert();
  a.title = 'Dienstplan: Fehler';
  a.message = String(e && e.message ? e.message : e);
  a.addAction('OK');
  await a.presentAlert();
}
await P.abschluss();
Script.complete();
