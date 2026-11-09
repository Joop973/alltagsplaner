'use strict';
// Simuliert Scriptable (Kalender, Mitteilungen, Dateien, importModule) und lässt
// die echten iPhone-Scripts einmal komplett laufen. Fängt Lade- und Tippfehler ab.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const QUELLE = path.join(__dirname, '..', 'scripts');

function umgebung({ jetzt, nurRelativ }) {
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptable-'));
  fs.cpSync(QUELLE, wurzel, { recursive: true });

  const kalender = ['Planer', 'Arbeit', 'Privat', 'Geburtstage'].map(title => ({ title }));
  const termine = [];
  const mitteilungen = [];
  const geoeffnet = [];
  let ausgabe;

  class CalendarEvent {
    constructor() { this.notes = ''; this.location = ''; this.isAllDay = false; }
    static async between(s, e, cals) {
      const namen = new Set(cals.map(c => c.title));
      return termine.filter(t => namen.has(t.calendar.title) && t.endDate > s && t.startDate < e);
    }
    async save() { if (!termine.includes(this)) termine.push(this); }
    remove() { const i = termine.indexOf(this); if (i >= 0) termine.splice(i, 1); }
  }
  const erinnerungsListen = [];
  const erinnerungen = [];
  class Reminder {
    constructor() { this.notes = ''; this.isCompleted = false; this.completionDate = null; }
    static async all(cals) { const n = new Set(cals.map(c => c.title)); return erinnerungen.filter(r => n.has(r.calendar.title)); }
    async save() { if (!erinnerungen.includes(this)) erinnerungen.push(this); }
    remove() { const i = erinnerungen.indexOf(this); if (i >= 0) erinnerungen.splice(i, 1); }
  }
  class Notification {
    constructor() { this.actions = []; }
    static async allPending() { return mitteilungen.slice(); }
    static async removePending(ids) {
      for (const id of ids) { const i = mitteilungen.findIndex(m => m.identifier === id); if (i >= 0) mitteilungen.splice(i, 1); }
    }
    setTriggerDate(d) { this.trigger = d; }
    addAction(titel, url) { this.actions.push({ titel, url }); }
    async schedule() { mitteilungen.push(this); }
  }
  const dateimanager = {
    documentsDirectory: () => wurzel,
    joinPath: (a, b) => path.join(a, b),
    fileExists: p => fs.existsSync(p),
    createDirectory: p => fs.mkdirSync(p, { recursive: true }),
    readString: p => fs.readFileSync(p, 'utf8'),
    writeString: (p, t) => fs.writeFileSync(p, t),
    isFileStoredIniCloud: () => true,
    isFileDownloaded: () => true,
    downloadFileFromiCloud: async () => {},
  };
  const EchtesDate = Date;
  class TestDate extends EchtesDate {
    constructor(...a) { if (a.length === 0) super(jetzt.getTime()); else super(...a); }
    static now() { return jetzt.getTime(); }
  }

  const ctx = {
    console: { log() {} },
    Date: TestDate,
    Calendar: {
      forEvents: async () => kalender,
      forReminders: async () => erinnerungsListen,
      createForReminders: async title => { const l = { title }; erinnerungsListen.push(l); return l; },
    },
    Reminder,
    CalendarEvent,
    Notification,
    FileManager: { iCloud: () => dateimanager, local: () => dateimanager },
    Safari: { open: u => geoeffnet.push(u) },
    Script: { setShortcutOutput: x => { ausgabe = x; }, complete() {} },
    config: { runsInApp: false },
    // Adresssuche: Texte mit "unbekannt" werden nicht gefunden
    Location: {
      geocode: async text => (/unbekannt/i.test(text) ? []
        : [{ thoroughfare: `Gefunden ${text.split(',')[0]}`, subThoroughfare: '1', postalCode: '11111', locality: 'Teststadt' }]),
    },
    Alert: class { addAction() {} async presentAlert() { return 0; } },
    // Request: liefert Dateien aus diesem Repo wie raw.githubusercontent.com
    Request: class {
      constructor(url) { this.url = url; }
      async loadString() {
        const teil = decodeURIComponent(this.url.replace(/^https:\/\/raw\.githubusercontent\.com\/Joop973\/alltagsplaner\/main\//, '').replace(/\?.*$/, ''));
        const datei = path.join(__dirname, '..', teil);
        if (!fs.existsSync(datei)) { this.response = { statusCode: 404 }; return '404'; }
        this.response = { statusCode: 200 };
        return fs.readFileSync(datei, 'utf8');
      }
    },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);

  // importModule wie in Scriptable: relativ zum Hauptordner (Fallback relativ zum Modul)
  const cache = new Map();
  function machImport(vonDatei) {
    return function importModule(name) {
      const kandidaten = (nurRelativ ? [path.join(path.dirname(vonDatei), name)]
        : [path.join(wurzel, name), path.join(path.dirname(vonDatei), name)])
        .map(p => (p.endsWith('.js') ? p : p + '.js'));
      const datei = kandidaten.find(p => fs.existsSync(p));
      if (!datei) throw new Error(`Module not found: ${name}`);
      if (cache.has(datei)) return cache.get(datei).exports;
      const module = { filename: datei, exports: {} };
      cache.set(datei, module);
      const fn = vm.runInContext(`(function (module, exports, importModule) {${fs.readFileSync(datei, 'utf8')}\n})`, ctx, { filename: datei });
      fn(module, module.exports, machImport(datei));
      return module.exports;
    };
  }

  async function script(name, args) {
    const datei = path.join(wurzel, name);
    const module = { filename: datei, exports: {} };
    const fn = vm.runInContext(`(async function (module, importModule, args) {${fs.readFileSync(datei, 'utf8')}\n})`, ctx, { filename: datei });
    ausgabe = undefined;
    await fn(module, machImport(datei), args || {});
    return ausgabe;
  }

  function termin(kal, title, start, end, location, allDay) {
    const e = new CalendarEvent();
    Object.assign(e, { calendar: kalender.find(k => k.title === kal), title, startDate: start, endDate: end, location: location || '', isAllDay: !!allDay });
    termine.push(e);
  }

  const daten = n => path.join(wurzel, 'planer-daten', n);
  return { ctx, wurzel, script, termin, termine, mitteilungen, erinnerungen, geoeffnet, daten, setJetzt: d => { jetzt = d; } };
}

for (const nurRelativ of [false, true]) test(`Kompletter Ablauf: Phase a, Phase b, Knopf Erledigt (Pfade ${nurRelativ ? 'relativ' : 'vom Hauptordner'})`, async () => {
  const DO = new Date(2026, 10, 12); // Donnerstag
  const um = (h, m = 0) => new Date(2026, 10, 12, h, m);
  const u = umgebung({ jetzt: um(9), nurRelativ });

  fs.mkdirSync(path.join(u.wurzel, 'planer-daten'));
  fs.writeFileSync(u.daten('einstellungen.json'), JSON.stringify({
    eingerichtet: true,
    orte: { zuhause: { adresse: 'Teststraße 1, 11111 Teststadt' }, arbeit: { adresse: 'Werkweg 2, 11111 Teststadt' } },
    schichten: { referenzMontag: '2026-11-09', referenzTyp: 'A' },
  }));
  const letzte = '2026-11-05';
  fs.writeFileSync(u.daten('aufgaben.json'), JSON.stringify([
    { id: 'bad', name: 'Bad putzen', intervall: 7, dauer: 30, pflicht: true, letzte },
    { id: 'saugen', name: 'Staubsaugen', intervall: 7, dauer: 20, pflicht: false, letzte },
  ]));
  u.termin('Privat', 'Ergo', um(17), um(17, 45), 'Praxisplatz 3, Teststadt');
  u.termin('Privat', 'Training', um(20), um(21, 30), 'Sporthalle Teststadt');
  u.termin('Privat', 'Treffen', new Date(2026, 10, 15, 12), new Date(2026, 10, 15, 13), 'unbekannt irgendwo'); // Ort nicht auffindbar
  u.termin('Geburtstage', 'Geburtstag X', DO, new Date(2026, 10, 13), '', true); // ganztägig: ignoriert
  for (let i = 1; i < 7; i++) {
    const t = new Date(2026, 10, 12 + i);
    u.termin('Privat', 'voll', t, new Date(2026, 10, 12 + i, 23, 59), '');
  }
  // Ein Wochenend-Termin ohne Ort im Arbeit-Kalender (nicht von uns) darf nicht gelöscht werden
  u.termin('Arbeit', 'Fremder Eintrag', new Date(2026, 10, 14, 10), new Date(2026, 10, 14, 11), '');

  // Phase a: heute läuft die Schicht schon (07:00), wird also nicht neu angelegt
  const a = await u.script('Planer Planen.js', {}); // Parameter leer = Phase a
  assert.ok(!a.fehler, a.fehler);
  assert.ok(a.anzahl > 0);
  const schichten = u.termine.filter(t => t.calendar.title === 'Arbeit' && t.notes.includes('planer-schicht'));
  assert.ok(schichten.length >= 30, `Schichten: ${schichten.length}`);
  assert.ok(u.termine.some(t => t.title === 'Fremder Eintrag'));

  // Schicht von heute gibt es im Test nicht, darum selbst eintragen wie im echten Kalender
  u.termin('Arbeit', 'Arbeit', um(7), um(16), 'Werkweg 2, 11111 Teststadt');

  // Kurzbefehl liefert 15 Min. für alles
  const a2 = await u.script('Planer Planen.js', { shortcutParameter: 'a' });
  // Kurzbefehl: Text "RAD", Fahrzeiten, "AUTO", Fahrzeiten (Listen werden zeilenweise eingefügt)
  const text = ['RAD', ...Array.from(a2.rad, () => '15 Min.'), 'AUTO', ...Array.from(a2.auto, () => '15 Min.')].join('\n');
  assert.ok(a2.rad.length > 0 && a2.auto.length > 0);
  const alleOrte = [...Array.from(a2.rad), ...Array.from(a2.auto)].flatMap(s => [s.von, s.nach]);
  assert.ok(alleOrte.every(o => o.startsWith('Gefunden ')), alleOrte.join(' / '));
  assert.match(fs.readFileSync(u.daten('log.txt'), 'utf8'), /Ort nicht gefunden: "unbekannt irgendwo"/);
  const b = await u.script('Planer Planen.js', { shortcutParameter: text });
  assert.ok(!b.fehler, b.fehler);
  assert.deepStrictEqual(Array.from(b.wecker, w => w.zeit), ['16:40', '19:40', '06:40']); // 06:40 = Freitagsschicht

  const zeit = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const bloecke = u.termine.filter(t => t.calendar.title === 'Planer' && t.notes.startsWith('planer-aufgabe'))
    .map(t => `${zeit(t.startDate)} ${t.title}`);
  assert.deepStrictEqual(bloecke, ['18:15 Bad putzen', '18:45 Staubsaugen']);
  // Fahrten stehen standardmäßig nicht im Kalender
  assert.strictEqual(u.termine.filter(t => t.calendar.title === 'Planer' && t.notes.startsWith('planer-fahrt')).length, 0);
  assert.strictEqual(u.mitteilungen.filter(m => m.title.startsWith('Jetzt:')).length, 2);
  assert.strictEqual(u.mitteilungen.filter(m => m.title === 'Checkliste: Training').length, 1);
  assert.ok(u.mitteilungen[0].actions[0].url.startsWith('scriptable:///run/Planer%20Aktion?aktion=erledigt&id=bad'));

  // Erinnerungen zum Abhaken (heute + morgen)
  assert.deepStrictEqual(u.erinnerungen.map(r => r.title), ['Bad putzen · Do 12.11. 18:15', 'Staubsaugen · Do 12.11. 18:45']);
  assert.strictEqual(u.mitteilungen[0].actions.map(a => a.titel).join(','), 'Erledigt,Später,Heute nicht');

  // Nochmal planen: keine doppelten Einträge
  await u.script('Planer Planen.js', { shortcutParameter: text });
  assert.strictEqual(u.termine.filter(t => t.calendar.title === 'Planer' && t.notes.startsWith('planer-aufgabe')).length, 2);
  assert.strictEqual(u.mitteilungen.filter(m => m.title.startsWith('Jetzt:')).length, 2);
  assert.strictEqual(u.mitteilungen.filter(m => m.title === 'Checkliste: Training').length, 1);

  // Knopf "Erledigt" um 18:20
  u.setJetzt(um(18, 20));
  const url = new URL(u.mitteilungen[0].actions[0].url.replace('scriptable:///', 'http://x/'));
  await u.script('Planer Aktion.js', { queryParameters: Object.fromEntries(url.searchParams) });
  const aufgaben = JSON.parse(fs.readFileSync(u.daten('aufgaben.json'), 'utf8'));
  assert.strictEqual(aufgaben.find(x => x.id === 'bad').letzte, '2026-11-12');
  assert.deepStrictEqual(u.geoeffnet, ['shortcuts://run-shortcut?name=Planer%20planen']);

  // In der Erinnerungen-App "Staubsaugen" abhaken, dann neu planen
  const saugen = u.erinnerungen.find(r => r.title.startsWith('Staubsaugen'));
  saugen.isCompleted = true;
  saugen.completionDate = um(18, 25);
  const a3 = await u.script('Planer Planen.js', {});
  await u.script('Planer Planen.js', { shortcutParameter: ['RAD', ...Array.from(a3.rad, () => '15 Min.'), 'AUTO', ...Array.from(a3.auto, () => '15 Min.')].join('\n') });
  const nachher = JSON.parse(fs.readFileSync(u.daten('aufgaben.json'), 'utf8'));
  assert.strictEqual(nachher.find(x => x.id === 'saugen').letzte, '2026-11-12');
  assert.ok(!u.erinnerungen.some(r => r.isCompleted), 'abgehakte werden nach dem Einlesen entfernt');

  // "Heute nicht" per Mitteilungs-Knopf
  await u.script('Planer Aktion.js', { queryParameters: { aktion: 'heutenicht', id: 'saugen' } });
  const zuletzt = JSON.parse(fs.readFileSync(u.daten('aufgaben.json'), 'utf8'));
  assert.strictEqual(zuletzt.find(x => x.id === 'saugen').nichtVor, new Date(2026, 10, 13).toISOString());

  const log = fs.readFileSync(u.daten('log.txt'), 'utf8');
  assert.ok(!log.includes('FEHLER'), log);
  assert.match(log, /Abgehakt: Staubsaugen/);
});

test('Fehler (nicht eingerichtet) landet im Log und in der Ausgabe', async () => {
  const u = umgebung({ jetzt: new Date(2026, 10, 12, 9) });
  const a = await u.script('Planer Planen.js', { shortcutParameter: 'a' });
  assert.match(a.fehler, /Ersteinrichtung/);
  assert.match(fs.readFileSync(u.daten('log.txt'), 'utf8'), /FEHLER/);
});

test('Update lädt alle Dateien und lässt planer-daten in Ruhe', async () => {
  const u = umgebung({ jetzt: new Date(2026, 10, 12, 9) });
  // Ausgangslage am iPhone: nur "Planer Update.js" und eigene Daten
  for (const f of fs.readdirSync(u.wurzel)) if (f !== 'Planer Update.js') fs.rmSync(path.join(u.wurzel, f), { recursive: true });
  fs.mkdirSync(path.join(u.wurzel, 'planer-daten'));
  fs.writeFileSync(u.daten('aufgaben.json'), '[]');
  const meldung = await u.script('Planer Update.js');
  assert.match(meldung, /Version/);
  assert.doesNotMatch(meldung, /FEHLER/);
  assert.ok(fs.existsSync(path.join(u.wurzel, 'planer', 'core', 'planer.js')));
  assert.ok(fs.existsSync(path.join(u.wurzel, 'Planer.js')));
  assert.strictEqual(fs.readFileSync(u.daten('aufgaben.json'), 'utf8'), '[]');
  assert.match(await u.script('Planer Update.js'), /schon aktuell/);
});

test('Menü-Modul lädt ohne Fehler', async () => {
  const u = umgebung({ jetzt: new Date(2026, 10, 12, 9) });
  fs.writeFileSync(path.join(u.wurzel, 'laden.js'), "const M = importModule('planer/adapter/menue'); Script.setShortcutOutput(Object.keys(M).join(','));");
  assert.strictEqual(await u.script('laden.js'), 'hauptmenue,ersteinrichtung');
});

test('Orte: Varianten, Fehler nicht merken, Standort während des Termins lernen', async () => {
  const um = (h, m = 0) => new Date(2026, 10, 12, h, m);
  const u = umgebung({ jetzt: um(17, 20) });
  fs.mkdirSync(path.join(u.wurzel, 'planer-daten'));
  fs.writeFileSync(u.daten('einstellungen.json'), JSON.stringify({
    eingerichtet: true,
    orte: { zuhause: { adresse: 'Teststraße 1, 11111 Teststadt' }, arbeit: { adresse: 'Werkweg 2, 11111 Teststadt' } },
  }));
  fs.writeFileSync(u.daten('aufgaben.json'), '[]');
  const gesucht = [];
  let kaputt = true;
  u.ctx.Location = {
    // ganzer Text wirft einen Fehler, die bereinigte Variante wird gefunden; "Halle" nie
    geocode: async text => {
      gesucht.push(text);
      if (kaputt && text.includes('(')) throw new Error('geocode kaputt');
      if (/Halle/.test(text)) return [];
      return [{ thoroughfare: 'Gefunden', subThoroughfare: '1', postalCode: '22222', locality: 'Ort' }];
    },
    setAccuracyToHundredMeters() {},
    current: async () => ({ latitude: 52, longitude: 7 }),
    reverseGeocode: async () => [{ thoroughfare: 'Hallenweg', subThoroughfare: '5', postalCode: '33333', locality: 'Sportstadt' }],
  };
  u.termin('Privat', 'Termin', um(19), um(20), 'Nordort, XY (1234): Am Platz/Neuer Weg, 12345 Musterstadt (OT Nord)');
  u.termin('Privat', 'Training', um(17), um(18), 'Halle');

  const a = await u.script('Planer Planen.js', {});
  assert.ok(!a.fehler, a.fehler);
  const orte = JSON.parse(fs.readFileSync(u.daten('orte.json'), 'utf8'));
  // Variante ohne Klammern gefunden
  assert.strictEqual(orte.eintraege[Object.keys(orte.eintraege).find(k => k.startsWith('nordort'))].adresse, 'Gefunden 1, 22222 Ort');
  // "Halle" läuft gerade (17:20) und ist unbekannt -> Standort gelernt
  assert.strictEqual(orte.eintraege.halle.adresse, 'Hallenweg 5, 33333 Sportstadt');
  assert.strictEqual(orte.eintraege.halle.quelle, 'standort');
  assert.deepStrictEqual(Object.keys(orte.offen), []);
  const log = fs.readFileSync(u.daten('log.txt'), 'utf8');
  assert.match(log, /Ort gelernt \(du warst gerade dort\): "Halle"/);
});

test('Orte: nicht gefundene werden beim nächsten Lauf neu gesucht', async () => {
  const u = umgebung({ jetzt: new Date(2026, 10, 12, 9) });
  fs.mkdirSync(path.join(u.wurzel, 'planer-daten'));
  fs.writeFileSync(u.daten('einstellungen.json'), JSON.stringify({
    eingerichtet: true,
    orte: { zuhause: { adresse: 'Teststraße 1, 11111 Teststadt' }, arbeit: { adresse: 'Werkweg 2, 11111 Teststadt' } },
  }));
  fs.writeFileSync(u.daten('aufgaben.json'), '[]');
  let geht = false;
  u.ctx.Location = { geocode: async () => { if (!geht) throw new Error('aus'); return [{ name: 'Kino', locality: 'Teststadt' }]; } };
  u.termin('Privat', 'Kino', new Date(2026, 10, 12, 19), new Date(2026, 10, 12, 21), 'Kino am Markt');
  let a = await u.script('Planer Planen.js', {});
  assert.strictEqual(a.anzahl, 0);
  assert.match(fs.readFileSync(u.daten('log.txt'), 'utf8'), /Ort nicht gefunden: "Kino am Markt" \(aus\)/);
  geht = true;
  a = await u.script('Planer Planen.js', {});
  assert.ok(a.anzahl > 0, 'beim zweiten Mal gefunden');
});

test('Extras: Geburtstag mit Geschenk, Frist, Checkliste, Abhaken in der Fristen-Liste', async () => {
  const um = (t, h, m = 0) => new Date(2026, 10, t, h, m);
  const u = umgebung({ jetzt: um(12, 9) });
  fs.mkdirSync(path.join(u.wurzel, 'planer-daten'));
  fs.writeFileSync(u.daten('einstellungen.json'), JSON.stringify({
    eingerichtet: true,
    orte: { zuhause: { adresse: 'Teststraße 1, 11111 Teststadt' }, arbeit: { adresse: 'Werkweg 2, 11111 Teststadt' } },
  }));
  fs.writeFileSync(u.daten('aufgaben.json'), '[]');
  fs.writeFileSync(u.daten('geburtstage.json'), JSON.stringify({ eigene: [{ name: 'Oma', datum: '11-15' }], geschenke: { 'Max Mustermann': true } }));
  fs.writeFileSync(u.daten('fristen.json'), JSON.stringify([{ id: 'tuev', name: 'TÜV', datum: '2026-12-01', monate: 24, vorlaufWochen: [4, 1], dauer: 15 }]));
  u.termin('Geburtstage', 'Max Mustermanns Geburtstag', new Date(2026, 10, 24), new Date(2026, 10, 25), '', true);
  u.termin('Privat', 'Training', um(12, 20), um(12, 21, 30), 'Sporthalle Teststadt');

  await u.script('Planer Planen.js', {});
  await u.script('Planer Planen.js', { shortcutParameter: 'RAD\nAUTO\n' });

  const titel = u.mitteilungen.map(m => m.title);
  assert.ok(titel.includes('Checkliste: Training'), titel.join(' | '));
  assert.ok(titel.includes('Geburtstag heute'), 'Oma am 15.11.');
  assert.ok(titel.includes('Frist in 1 Woche'));
  assert.ok(titel.includes('Geschenk fehlt noch'), 'Max am 24.11. -> Erinnerung am 17.11.');
  assert.strictEqual(titel.filter(t => t === 'Geburtstag heute').length, 1, 'nur Oma (15.11.), Max (24.11.) ist weiter als 8 Tage');
  const check = u.mitteilungen.find(m => m.title === 'Checkliste: Training');
  assert.strictEqual(check.trigger.getHours() * 60 + check.trigger.getMinutes(), 19 * 60 + 10); // Abfahrt 19:40 (Ersatz 20 min) - 30
  // Geschenk für Max ab 10.11. fällig -> heute eingeplant; Frist-Aufgabe (ab 03.11.) auch
  const planer = u.termine.filter(t => t.calendar.title === 'Planer').map(t => t.title);
  assert.ok(planer.some(t => t.startsWith('Geschenk für Max Mustermann')), planer.join(' | '));
  assert.ok(planer.some(t => t.startsWith('TÜV (Frist')), planer.join(' | '));
  // Fristen-Liste in der Erinnerungen-App
  const fr = u.erinnerungen.find(r => r.calendar.title === 'Fristen');
  assert.strictEqual(fr.title, 'TÜV (fällig 01.12.2026)');

  // Frist abhaken -> nächstes Datum in 24 Monaten
  fr.isCompleted = true;
  fr.completionDate = um(12, 10);
  await u.script('Planer Planen.js', {});
  await u.script('Planer Planen.js', { shortcutParameter: 'RAD\nAUTO\n' });
  const fristen = JSON.parse(fs.readFileSync(u.daten('fristen.json'), 'utf8'));
  assert.strictEqual(fristen[0].datum, '2028-12-01');

  // Knopf "Erledigt" für das Geschenk
  await u.script('Planer Aktion.js', { queryParameters: { aktion: 'erledigt', id: 'geschenk-max-mustermann-2026' } });
  const st = JSON.parse(fs.readFileSync(u.daten('sonderstatus.json'), 'utf8'));
  assert.strictEqual(st.erledigt['geschenk-max-mustermann-2026'], '2026-11-12');
  const log = fs.readFileSync(u.daten('log.txt'), 'utf8');
  assert.ok(!log.includes('FEHLER'), log);
});

test('Manifest enthält alle Scripts', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
  const alle = [];
  (function lauf(d) {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) lauf(p); else if (f.name.endsWith('.js')) alle.push(path.relative(QUELLE, p));
    }
  })(QUELLE);
  assert.deepStrictEqual([...manifest.dateien].sort(), alle.sort());
});

test('Kern-Module benutzen keine Scriptable-Funktionen', () => {
  const kern = path.join(QUELLE, 'planer', 'core');
  for (const f of fs.readdirSync(kern)) {
    const t = fs.readFileSync(path.join(kern, f), 'utf8');
    for (const wort of ['Calendar', 'FileManager', 'Notification', 'Alert', 'Safari', 'Location', 'Script.', 'args.']) {
      assert.ok(!t.includes(wort), `${f} benutzt ${wort}`);
    }
  }
});
