// Scriptable: Widget für Home- und Sperrbildschirm.
'use strict';

function hole(p) {
  try { return importModule('planer/' + p); } catch (e) { return importModule('../' + p); }
}
const D = hole('core/datum');
const R = hole('core/tagesrhythmus');
const DAT = hole('adapter/dateien');

const FARBE = { fahrt: '#d9480f', termin: '#495057', aufgabe: '#2b8a3e' };

async function erstellen(familie) {
  const plan = await DAT.lesen('plan.json', null);
  const jetzt = new Date();
  const w = new ListWidget();
  w.url = `scriptable:///run/${encodeURIComponent('Planer')}`;
  const sperr = /^accessory/.test(familie);
  const anzahl = familie === 'large' ? 9 : familie === 'small' ? 3 : sperr ? (familie === 'accessoryInline' ? 1 : 2) : 4;
  const zeilen = plan ? R.widgetZeilen(plan, jetzt, anzahl) : [];

  if (familie === 'accessoryInline') {
    const z = zeilen[0];
    w.addText(z ? `${z.zeit} ${z.text}` : 'Planer: nichts geplant');
  } else {
    if (!sperr) {
      const t = w.addText(`Planer · ${D.kurz(jetzt)}`);
      t.font = Font.boldSystemFont(13);
      w.addSpacer(4);
    }
    if (!zeilen.length) w.addText(plan ? 'Nichts mehr geplant.' : 'Noch kein Plan.').font = Font.systemFont(12);
    for (const z of zeilen) {
      const s = w.addStack();
      const zt = s.addText(`${z.zeit} `);
      zt.font = Font.boldSystemFont(sperr ? 12 : 13);
      const tt = s.addText(z.text);
      tt.font = Font.systemFont(sperr ? 12 : 13);
      tt.lineLimit = 1;
      if (!sperr) zt.textColor = new Color(FARBE[z.art] || '#000000');
    }
    if (!sperr && plan && plan.warnText) {
      w.addSpacer(2);
      const wt = w.addText(`Passt nicht: ${plan.warnText}`);
      wt.font = Font.systemFont(10);
      wt.textColor = Color.red();
      wt.lineLimit = 1;
    }
    w.addSpacer();
  }
  // nach dem nächsten Punkt neu zeichnen, spätestens in 30 min
  const naechster = zeilen.length ? new Date(zeilen[0].zeitpunkt) : null;
  const halbeStunde = D.plusMin(jetzt, 30);
  w.refreshAfterDate = naechster && naechster > jetzt && naechster < halbeStunde ? naechster : halbeStunde;
  return w;
}

module.exports = { erstellen };
