// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-green; icon-glyph: route;
// Wird vom Kurzbefehl "Planer planen" aufgerufen.
// Parameter leer (oder "a"): benötigte Strecken ausgeben.
// Parameter "b" + Zeilen "s1|15 Min.": planen und Wecker ausgeben.
const P = importModule('planer/adapter/planung');

let param = args.shortcutParameter;
if (param == null && args.plainTexts && args.plainTexts.length) param = args.plainTexts;
if (Array.isArray(param)) param = param.join('\n');
const text = param == null ? '' : String(param);

try {
  if (text.trim().toLowerCase().startsWith('b')) {
    Script.setShortcutOutput(await P.phaseB(text));
  } else {
    Script.setShortcutOutput(await P.phaseA());
  }
} catch (e) {
  await P.fehler(e);
  Script.setShortcutOutput({ fehler: String(e), strecken: [], anzahl: 0, wecker: [] });
}
Script.complete();
