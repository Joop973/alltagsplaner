// Scriptable: Widget für Home- und Sperrbildschirm (dunkel, ruhig).
// Oben: was jetzt ist (oder als Nächstes kommt) mit Restzeit, die live mitläuft, und einem Balken,
// der schrumpft. Darunter der Tag als Zeitleiste und die nächsten Punkte mit Symbol und Farbe.
'use strict';

function hole(p) {
  try { return importModule('planer/' + p); } catch (e) { return importModule('../' + p); }
}
const D = hole('core/datum');
const AN = hole('core/ansicht');
const DAT = hole('adapter/dateien');
const ZE = hole('adapter/zeichnen');

const F = AN.FARBEN;
const farbe = hex => new Color(hex);

function symbol(stack, name, groesse, hex) {
  const s = SFSymbol.named(name) || SFSymbol.named('circle');
  s.applyFont(Font.systemFont(groesse));
  const img = stack.addImage(s.image);
  img.imageSize = new Size(groesse + 2, groesse + 2);
  if (hex) img.tintColor = farbe(hex);
  return img;
}

function text(stack, t, groesse, hex, fett) {
  const x = stack.addText(t);
  x.font = fett ? Font.boldSystemFont(groesse) : Font.systemFont(groesse);
  if (hex) x.textColor = farbe(hex);
  x.lineLimit = 1;
  return x;
}

// Live laufende Restzeit (iOS zählt selbst weiter)
function restzeit(stack, bis, groesse, hex) {
  const d = stack.addDate(bis);
  d.applyTimerStyle();
  d.font = Font.systemFont(groesse);
  if (hex) d.textColor = farbe(hex);
  d.lineLimit = 1;
  return d;
}

async function daten() {
  const plan = await DAT.lesen('plan.json', null);
  const ged = await DAT.lesen('gedaechtnis.json', null);
  return { plan, ged };
}

// Kopf: Symbol, Titel, "bis 16:55 · noch 0:20:13" und Balken
function kopf(w, j, jetzt, opt) {
  const e = j.aktuell || j.naechstes;
  const z = w.addStack();
  z.centerAlignContent();
  symbol(z, AN.symbolFuer(e), opt.gross ? 20 : 16, opt.mono ? null : AN.farbeFuer(e.art));
  z.addSpacer(8);
  // Sperrbildschirm ist schmal: Uhrzeit in den Titel, darunter nur "noch …" (sonst wird gekürzt)
  const titel = opt.mono ? (j.aktuell ? e.titel : `${D.hm(e.start)} ${e.titel}`) : j.aktuell ? e.titel : `Als Nächstes: ${e.titel}`;
  text(z, titel, opt.gross ? 17 : opt.mono ? 13 : 14, opt.mono ? null : F.text, true);
  w.addSpacer(opt.mono ? 1 : 3);
  const u = w.addStack();
  u.centerAlignContent();
  const wann = opt.mono ? (j.aktuell ? 'noch ' : 'in ')
    : j.aktuell ? `bis ${D.hm(e.end)} · noch ` : `${D.ymd(e.start) === D.ymd(jetzt) ? 'um' : D.kurz(e.start).slice(0, 2)} ${D.hm(e.start)} · in `;
  text(u, wann, opt.gross ? 13 : 12, opt.mono ? null : F.leise);
  restzeit(u, j.bis, opt.gross ? 13 : 12, opt.mono ? null : F.leise);
  w.addSpacer(5);
  w.addImage(ZE.balken(j.anteil, { breite: opt.breite, hoehe: opt.mono ? 5 : 6, mono: opt.mono, farbe: AN.farbeFuer(e.art) })).imageSize = new Size(opt.breite, opt.mono ? 5 : 6);
}

function liste(w, punkte, opt) {
  for (const p of punkte) {
    const z = w.addStack();
    z.centerAlignContent();
    symbol(z, AN.symbolFuer(p), 11, AN.farbeFuer(p.art));
    z.addSpacer(6);
    text(z, p.zeit, 12, F.leise);
    z.addSpacer(6);
    text(z, p.titel, 12, F.text);
    w.addSpacer(opt.abstand || 2);
  }
}

async function erstellen(familie) {
  const { plan, ged } = await daten();
  const jetzt = new Date();
  const w = new ListWidget();
  w.url = `scriptable:///run/${encodeURIComponent('Planer')}`;
  const sperr = /^accessory/.test(familie);
  const regeln = (plan && plan.anzeige) || {};
  const j = plan ? AN.jetztUndDanach(plan, jetzt, regeln) : { aktuell: null, naechstes: null };
  const e = j.aktuell || j.naechstes;

  if (familie === 'accessoryInline') {
    w.addText(e ? `${e.titel} · ${j.aktuell ? `bis ${D.hm(e.end)}` : D.hm(e.start)}` : 'Planer: frei');
  } else if (familie === 'accessoryCircular') {
    // iOS entfernt auf dem Sperrbildschirm den Widget-Hintergrund: Ring darum als Hintergrund eines Stapels
    w.setPadding(0, 0, 0, 0);
    const k = w.addStack();
    k.size = new Size(66, 66);
    k.backgroundImage = ZE.ring(e ? j.anteil : 0, { groesse: 66, dicke: 5, mono: true });
    k.layoutVertically();
    k.addSpacer();
    const z = k.addStack();
    z.addSpacer();
    symbol(z, e ? AN.symbolFuer(e) : 'checkmark', 14, null);
    z.addSpacer();
    if (e) {
      const t = k.addStack();
      t.addSpacer(8);
      restzeit(t, j.bis, 10, null).centerAlignText();
      t.addSpacer(8);
    }
    k.addSpacer();
  } else if (familie === 'accessoryRectangular') {
    if (e) kopf(w, j, jetzt, { mono: true, breite: 150 });
    else text(w, plan ? 'Nichts mehr geplant' : 'Noch kein Plan', 13, null, true);
    w.addSpacer();
  } else {
    w.backgroundColor = farbe(F.hintergrund);
    const gross = familie === 'large';
    const klein = familie === 'small';
    w.setPadding(14, 14, 14, 14);
    const breite = klein ? 127 : 300;
    if (!plan) {
      text(w, 'Noch kein Plan', 14, F.text, true);
    } else if (!e) {
      text(w, 'Heute ist nichts mehr geplant.', 14, F.text, true);
    } else {
      kopf(w, j, jetzt, { breite, gross });
    }
    if (plan && !klein) {
      w.addSpacer(gross ? 12 : 8);
      const heute = D.ymd(jetzt);
      const segs = AN.segmente(plan, heute, regeln);
      const f = AN.tagesFenster(segs, heute);
      w.addImage(ZE.zeitleiste(segs, { ...f, breite, hoehe: gross ? 14 : 10, jetzt, stunden: gross })).imageSize = new Size(breite, gross ? 28 : 10);
      w.addSpacer(gross ? 12 : 7);
      const anzahl = gross ? 7 : 2;
      const danach = AN.naechste(plan, jetzt, anzahl + 1, regeln).filter(p => !e || p.start.getTime() !== e.start.getTime() || p.titel !== e.titel);
      liste(w, danach.slice(0, anzahl), { abstand: gross ? 5 : 2 });
    }
    if (plan && klein && j.naechstes && j.aktuell) {
      w.addSpacer(8);
      text(w, `Danach ${D.hm(j.naechstes.start)}: ${j.naechstes.titel}`, 11, F.leise);
    }
    w.addSpacer();
    // Randbemerkungen: Termine anderer ohne deine Zusage (nur Info)
    if (plan && !klein) {
      const heute = D.ymd(jetzt);
      const infos = (plan.infos || []).filter(i => D.ymd(new Date(i.start)) === heute && new Date(i.end) > jetzt)
        .sort((a, b) => new Date(a.start) - new Date(b.start)).slice(0, familie === 'large' ? 2 : 1);
      for (const i of infos) {
        text(w, `Info: ${D.hm(new Date(i.start))} ${i.titel}`, 11, F.leise);
        w.addSpacer(2);
      }
    }
    const fuss = w.addStack();
    const n = AN.geschafftAm(ged, D.ymd(jetzt));
    if (n) text(fuss, `Heute geschafft: ${n}`, 11, F.erfolg);
    if (plan && plan.warnText && !klein) {
      if (n) fuss.addSpacer(10);
      text(fuss, AN.ohnePlatzText(plan.warnText), 11, F.hinweis);
    }
  }
  // neu zeichnen, wenn sich etwas ändert, sonst alle 10 min (Balken)
  const wechsel = j.bis && j.bis > jetzt ? j.bis : null;
  const bald = D.plusMin(jetzt, 10);
  w.refreshAfterDate = wechsel && wechsel < bald ? wechsel : bald;
  return w;
}

module.exports = { erstellen };
