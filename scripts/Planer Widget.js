// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-green; icon-glyph: calendar-check;
// Widget: die nächsten Punkte (Abfahrten, Termine, Aufgaben). Tippen öffnet den Planer.
const W = importModule('planer/adapter/widget');
const widget = await W.erstellen(config.widgetFamily || 'medium');
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();
Script.complete();
