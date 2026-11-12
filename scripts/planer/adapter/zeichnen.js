// Scriptable: Bilder für Widget und App zeichnen (Zeitleiste, Balken, Ring, Farbmarke).
// mono = Sperrbildschirm: nur Weiß mit verschiedener Deckkraft (iOS färbt dort selbst ein).
'use strict';

function hole(p) {
  try { return importModule('planer/' + p); } catch (e) { return importModule('../' + p); }
}
const AN = hole('core/ansicht');
const F = AN.FARBEN;

function farbe(hex, alpha) { return new Color(hex, alpha == null ? 1 : alpha); }
function weiss(alpha) { return new Color('#FFFFFF', alpha); }

function leinwand(breite, hoehe) {
  const c = new DrawContext();
  c.size = new Size(breite, hoehe);
  c.opaque = false;
  c.respectScreenScale = true;
  return c;
}

function rundesRechteck(c, x, y, b, h, r, col) {
  const p = new Path();
  p.addRoundedRect(new Rect(x, y, b, h), r, r);
  c.addPath(p);
  c.setFillColor(col);
  c.fillPath();
}

// Zeitleiste eines Tages: farbige Abschnitte, Strich für "jetzt", optional Stunden darunter.
// segs: aus AN.segmente; opt: {von, bis, breite, hoehe, jetzt, mono, stunden}
function zeitleiste(segs, opt) {
  const breite = opt.breite || 300, balken = opt.hoehe || 12;
  const schrift = opt.stunden ? 11 : 0;
  const c = leinwand(breite, balken + (schrift ? schrift + 3 : 0));
  const von = opt.von.getTime(), bis = opt.bis.getTime();
  const x = t => Math.max(0, Math.min(breite, ((t - von) / (bis - von)) * breite));
  rundesRechteck(c, 0, 0, breite, balken, balken / 2, opt.mono ? weiss(0.18) : farbe(F.leer));
  // erst Pause/Ruhe, dann der Rest darüber
  const reihenfolge = ['pause', 'ruhe', 'arbeit', 'termin', 'fahrt', 'aufgabe'];
  for (const art of reihenfolge) {
    for (const s of segs.filter(z => z.art === art)) {
      const a = x(s.start.getTime()), e = x(s.end.getTime());
      if (e - a < 1) continue;
      const col = opt.mono ? weiss(AN.MONO[art] || 0.5) : farbe(AN.farbeFuer(art), art === 'pause' || art === 'ruhe' ? 0.7 : 1);
      rundesRechteck(c, a, 0, Math.max(2, e - a - 1), balken, Math.min(3, balken / 2), col);
    }
  }
  if (opt.jetzt && opt.jetzt.getTime() > von && opt.jetzt.getTime() < bis) {
    const j = x(opt.jetzt.getTime());
    c.setFillColor(opt.mono ? weiss(1) : farbe(F.text));
    c.fillRect(new Rect(Math.max(0, j - 1), -1, 2, balken + 2));
  }
  if (schrift) {
    c.setFont(Font.systemFont(schrift - 1));
    c.setTextColor(opt.mono ? weiss(0.7) : farbe(F.leise));
    for (let h = Math.ceil(von / 3600000); h * 3600000 <= bis; h++) {
      const t = h * 3600000;
      const stunde = new Date(t).getHours();
      if (stunde % 4 !== 0) continue;
      const px = x(t);
      c.drawTextInRect(String(stunde), new Rect(Math.min(breite - 18, Math.max(0, px - 9)), balken + 2, 18, schrift + 2));
    }
  }
  return c.getImage();
}

// Balken, der mit der Restzeit schrumpft (anteil 0..1)
function balken(anteil, opt) {
  const breite = opt.breite || 300, hoehe = opt.hoehe || 6;
  const c = leinwand(breite, hoehe);
  rundesRechteck(c, 0, 0, breite, hoehe, hoehe / 2, opt.mono ? weiss(0.25) : farbe(F.leer));
  const w = Math.max(0, Math.min(1, anteil || 0)) * breite;
  if (w >= 1) rundesRechteck(c, 0, 0, Math.max(hoehe, w), hoehe, hoehe / 2, opt.mono ? weiss(1) : farbe(opt.farbe || F.aufgabe));
  return c.getImage();
}

// Ring (für den runden Sperrbildschirm-Platz): Rest im Uhrzeigersinn ab 12 Uhr
function ring(anteil, opt) {
  const g = opt.groesse || 60, dicke = opt.dicke || 5;
  const c = leinwand(g, g);
  const m = g / 2, r = g / 2 - dicke / 2 - 1;
  const kreis = (bisAnteil, col) => {
    const schritte = Math.max(2, Math.round(120 * bisAnteil));
    const punkte = [];
    for (let i = 0; i <= schritte; i++) {
      const w = -Math.PI / 2 + (i / 120) * 2 * Math.PI;
      punkte.push(new Point(m + r * Math.cos(w), m + r * Math.sin(w)));
    }
    const p = new Path();
    p.addLines(punkte);
    c.addPath(p);
    c.setStrokeColor(col);
    c.setLineWidth(dicke);
    c.strokePath();
  };
  kreis(1, opt.mono ? weiss(0.25) : farbe(F.leer));
  const a = Math.max(0, Math.min(1, anteil || 0));
  if (a > 0.01) kreis(a, opt.mono ? weiss(1) : farbe(opt.farbe || F.aufgabe));
  return c.getImage();
}

// Kleine Farbmarke (für Listen in der App)
function marke(hex, hoehe) {
  const h = hoehe || 22;
  const c = leinwand(8, h);
  rundesRechteck(c, 0, 0, 6, h, 3, farbe(hex));
  return c.getImage();
}

module.exports = { farbe, zeitleiste, balken, ring, marke };
