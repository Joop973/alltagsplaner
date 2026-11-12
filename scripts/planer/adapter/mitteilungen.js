// Scriptable: Mitteilungen zum Blockstart mit Knöpfen "Erledigt" / "Später".
'use strict';

const PRAEFIX = 'planer-';
const MAX = 50; // iOS erlaubt höchstens 64 geplante Mitteilungen
const MAX_GESAMT = 60;

function url(param) {
  const q = Object.entries(param).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return `scriptable:///run/${encodeURIComponent('Planer Aktion')}?${q}`;
}

function aktionsUrl(aktion, block) {
  return url({ aktion, id: block.aufgabeId, ende: new Date(block.end).toISOString() });
}

async function alteEntfernen() {
  const alle = await Notification.allPending();
  const ids = alle.map(n => n.identifier).filter(id => id && id.startsWith(PRAEFIX));
  if (ids.length) await Notification.removePending(ids);
  return ids.length;
}

async function bloeckeAnkuendigen(bloecke, jetzt) {
  let n = 0;
  for (const b of bloecke) {
    const start = new Date(b.start);
    if (start <= jetzt || n >= MAX) continue;
    const m = new Notification();
    m.identifier = `${PRAEFIX}${b.aufgabeId}-${start.getTime()}`;
    m.threadIdentifier = 'planer';
    m.title = `Jetzt: ${b.name}`;
    const min = Math.round((new Date(b.end) - start) / 60000);
    const schritte = b.schritte && b.schritte.length ? `\n${b.schritte.map(x => '- ' + x).join('\n')}` : '';
    m.body = `${min} min${b.unterwegs ? ' (unterwegs)' : ''}${schritte}`;
    m.sound = 'default';
    m.setTriggerDate(start);
    m.addAction('Erledigt', aktionsUrl('erledigt', b));
    m.addAction('5 Minuten anfangen', aktionsUrl('fuenf', b));
    m.addAction('Später', aktionsUrl('spaeter', b));
    m.addAction('Heute nicht', aktionsUrl('heutenicht', b));
    if (!b.einmalig) m.addAction('Nicht nötig', aktionsUrl('nichtnoetig', b));
    await m.schedule();
    n++;
  }
  return n;
}

// weitere: [{id, zeit, titel, text}] – nur zukünftige, nach Zeit, bis insgesamt MAX_GESAMT
async function weitereAnkuendigen(weitere, jetzt, schonGeplant) {
  let n = 0;
  const frei = Math.max(0, MAX_GESAMT - (schonGeplant || 0));
  const liste = weitere.filter(w => new Date(w.zeit) > jetzt).sort((a, b) => new Date(a.zeit) - new Date(b.zeit));
  for (const w of liste.slice(0, frei)) {
    const m = new Notification();
    m.identifier = w.id.startsWith(PRAEFIX) ? w.id : PRAEFIX + w.id;
    m.threadIdentifier = 'planer';
    m.title = w.titel;
    m.body = w.text;
    m.sound = 'default';
    m.setTriggerDate(new Date(w.zeit));
    if (w.aktion && w.aktion.art === 'med') {
      m.addAction('Genommen', url({ aktion: 'med', k: w.aktion.schluessel }));
    }
    if (w.aktion && w.aktion.art === 'folge') {
      m.addAction('Erledigt', url({ aktion: 'folgeok', id: w.aktion.id }));
    }
    if (w.aktion && w.aktion.art === 'abschluss') {
      m.addAction('Alles erledigt', url({ aktion: 'allesok', ids: w.aktion.ids.join(',') }));
    }
    if (w.aktion && w.aktion.art === 'blockende') {
      m.addAction('Erledigt', url({ aktion: 'erledigt', id: w.aktion.id, ende: w.aktion.ende }));
      m.addAction('Später', url({ aktion: 'spaeter', id: w.aktion.id, ende: w.aktion.ende }));
    }
    await m.schedule();
    n++;
  }
  return n;
}

// Wachhund: Mitteilung für morgen früh, die jeder erfolgreiche Lauf wieder nach hinten schiebt.
async function wachhundStellen(cfg, jetzt, letzterLauf) {
  if (!cfg || !cfg.an) return;
  const [h, mi] = String(cfg.zeit || '07:30').split(':').map(Number);
  const z = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate() + (jetzt.getHours() >= 5 ? 1 : 0), h, mi);
  const m = new Notification();
  m.identifier = `${PRAEFIX}wachhund`;
  m.threadIdentifier = 'planer';
  m.title = 'Planer lief heute früh nicht';
  m.body = `Letzter Lauf: ${letzterLauf}. Wecker und Plan sind evtl. veraltet. Bitte "Planer planen" starten oder die Automation prüfen.`;
  m.sound = 'default';
  m.setTriggerDate(z);
  m.addAction('Jetzt planen', `shortcuts://run-shortcut?name=${encodeURIComponent('Planer planen')}`);
  await m.schedule();
}

// Einzelne geplante Mitteilungen entfernen (z. B. Nachfrage nach "Genommen")
async function entfernen(praefixe) {
  const alle = await Notification.allPending();
  const ids = alle.map(n => n.identifier).filter(id => id && praefixe.some(p => id.startsWith(p)));
  if (ids.length) await Notification.removePending(ids);
  try {
    const da = await Notification.allDelivered();
    const dIds = da.map(n => n.identifier).filter(id => id && praefixe.some(p => id.startsWith(p)));
    if (dIds.length) await Notification.removeDelivered(dIds);
  } catch (e) { /* egal */ }
  return ids.length;
}

async function sofort(titel, text) {
  const m = new Notification();
  m.identifier = `${PRAEFIX}hinweis-${Date.now()}`;
  m.threadIdentifier = 'planer';
  m.title = titel;
  m.body = text;
  await m.schedule();
}

// "Nur 5 Minuten anfangen": in 5 Minuten nachfragen. Eigene Kennung (nicht "planer-"),
// damit ein Neuplanen in der Zwischenzeit sie nicht löscht.
async function fuenfMinuten(id, name, ende, jetzt) {
  const m = new Notification();
  m.identifier = `fuenf-${PRAEFIX}${id}`;
  m.threadIdentifier = 'planer';
  m.title = `5 Minuten um: ${name}`;
  m.body = 'Gut angefangen. Fertig, weitermachen oder später?';
  m.sound = 'default';
  m.setTriggerDate(new Date(jetzt.getTime() + 5 * 60000));
  m.addAction('Erledigt', url({ aktion: 'erledigt', id, ende }));
  m.addAction('Später', url({ aktion: 'spaeter', id, ende }));
  await m.schedule();
}

// Kleine Bestätigung mit Erfolgston (Scriptable-Ton "piano_success")
async function erfolg(titel, text) {
  const m = new Notification();
  m.identifier = `erfolg-${Date.now()}`;
  m.threadIdentifier = 'planer-erfolg';
  m.title = titel;
  m.body = text;
  m.sound = 'piano_success';
  await m.schedule();
}

module.exports = { fuenfMinuten, erfolg, alteEntfernen, bloeckeAnkuendigen, weitereAnkuendigen, wachhundStellen, entfernen, sofort, aktionsUrl };
