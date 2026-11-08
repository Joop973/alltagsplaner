// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-green; icon-glyph: check-circle;
// Knöpfe "Erledigt" / "Später" aus den Planer-Mitteilungen.
const P = importModule('planer/adapter/planung');
try {
  await P.aktion(args.queryParameters || {});
} catch (e) {
  await P.fehler(e);
}
Script.complete();
