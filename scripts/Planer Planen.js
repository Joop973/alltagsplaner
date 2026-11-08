// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-green; icon-glyph: route;
// Wird vom Kurzbefehl "Planer planen" aufgerufen.
// Parameter "a" (oder leer): benötigte Strecken ausgeben.
// Parameter "b" + Zeilen "s1|15 Min.": planen und Wecker ausgeben.
const P = importModule('planer/adapter/planung');

let param = args.shortcutParameter;
if (param == null && args.plainTexts && args.plainTexts.length) param = args.plainTexts;
if (Array.isArray(param)) param = param.join('\n');
const text = param == null ? '' : String(param);

try {
  if (config.runsInApp && param == null) {
    const plan = await P.ohneKurzbefehl();
    const a = new Alert();
    a.title = 'Geplant (ohne Wecker)';
    a.message = `${plan.bloecke.length} Aufgaben-Blöcke. Wecker stellt nur der Kurzbefehl "Planer planen".`;
    a.addAction('OK');
    await a.presentAlert();
  } else if (text.trim().toLowerCase().startsWith('b')) {
    Script.setShortcutOutput(await P.phaseB(text));
  } else {
    Script.setShortcutOutput(await P.phaseA());
  }
} catch (e) {
  await P.fehler(e);
  Script.setShortcutOutput({ fehler: String(e), strecken: [], anzahl: 0, wecker: [] });
}
Script.complete();
