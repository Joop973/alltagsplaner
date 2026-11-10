// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-green; icon-glyph: walking;
// Von der Automation "Beim Verlassen von Zuhause" aufgerufen: echte Abfahrt merken.
const P = importModule('planer/adapter/planung');
try {
  await P.abfahrtMerken();
} catch (e) {
  await P.fehler(e);
}
await P.abschluss();
Script.complete();
