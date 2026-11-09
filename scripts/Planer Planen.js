// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-green; icon-glyph: route;
// Wird vom Kurzbefehl "Planer planen" aufgerufen.
// Parameter leer (oder "a"): benötigte Strecken ausgeben.
// Parameter = Text mit Zeilen "RAD", Fahrzeiten, "AUTO", Fahrzeiten: planen und Wecker ausgeben.
const P = importModule('planer/adapter/planung');
const F = importModule('planer/core/fahrzeiten');

let param = args.shortcutParameter;
if (param == null && args.plainTexts && args.plainTexts.length) param = args.plainTexts;
if (Array.isArray(param)) param = param.join('\n');
const text = param == null ? '' : String(param);

try {
  if (F.istPhaseB(text)) {
    Script.setShortcutOutput(await P.phaseB(text));
  } else {
    Script.setShortcutOutput(await P.phaseA());
  }
} catch (e) {
  await P.fehler(e);
  Script.setShortcutOutput({ fehler: String(e), rad: [], auto: [], anzahl: 0, wecker: [] });
}
Script.complete();
