// Scriptable: Mitteilungen zum Blockstart mit Knöpfen "Erledigt" / "Später".
'use strict';

const PRAEFIX = 'planer-';
const MAX = 50; // iOS erlaubt nur begrenzt viele geplante Mitteilungen

function aktionsUrl(aktion, block) {
  const q = `aktion=${aktion}&id=${encodeURIComponent(block.aufgabeId)}&ende=${encodeURIComponent(new Date(block.end).toISOString())}`;
  return `scriptable:///run/${encodeURIComponent('Planer Aktion')}?${q}`;
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
    m.body = `${Math.round((new Date(b.end) - start) / 60000)} min – Erledigt, Später oder Heute nicht?`;
    m.sound = 'default';
    m.setTriggerDate(start);
    m.addAction('Erledigt', aktionsUrl('erledigt', b));
    m.addAction('Später', aktionsUrl('spaeter', b));
    m.addAction('Heute nicht', aktionsUrl('heutenicht', b));
    await m.schedule();
    n++;
  }
  return n;
}

async function sofort(titel, text) {
  const m = new Notification();
  m.identifier = `${PRAEFIX}hinweis-${Date.now()}`;
  m.threadIdentifier = 'planer';
  m.title = titel;
  m.body = text;
  await m.schedule();
}

module.exports = { alteEntfernen, bloeckeAnkuendigen, sofort, aktionsUrl };
