// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-green; icon-glyph: microphone;
// Vom Kurzbefehl "Planer sagen" aufgerufen (Parameter: "DIKTAT: …" und optional "CLAUDE: …").
// In der App ohne Parameter: Text eintippen.
const SPR = importModule('planer/adapter/sprache');
const P = importModule('planer/adapter/planung');
let eingang = args.shortcutParameter;
if (eingang == null && args.plainTexts && args.plainTexts.length) eingang = args.plainTexts.join('\n');
if (Array.isArray(eingang)) eingang = eingang.join('\n');
try {
  const ergebnis = eingang && String(eingang).trim() ? await SPR.verarbeiten(String(eingang)) : await SPR.eintippen();
  Script.setShortcutOutput(ergebnis || '');
} catch (e) {
  await P.fehler(e);
  Script.setShortcutOutput(`Fehler: ${e && e.message ? e.message : e}`);
}
await P.abschluss();
Script.complete();
