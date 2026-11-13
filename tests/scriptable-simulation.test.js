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

// Strenge Nachbildung der Scriptable-Oberfläche (Widget, Zeichnen, Tabellen): nur Funktionen,
// die es in Scriptable wirklich gibt. Unbekanntes führt zu einem Fehler – wie am iPhone.
function streng(name, obj) {
  return new Proxy(obj, {
    get(t, k) {
      if (k in t || typeof k === 'symbol' || k === 'then' || k === 'toJSON') return t[k];
      throw new Error(`${name}.${String(k)} gibt es in Scriptable nicht`);
    },
    set(t, k, v) {
      if (!(k in t)) throw new Error(`${name}.${String(k)} gibt es in Scriptable nicht`);
      t[k] = v;
      return true;
    },
  });
}
function oberflaeche(ctx, prot) {
  const p = prot || { texte: [], bilder: 0 };
  const text = t => { p.texte.push(String(t)); return streng('WidgetText', { font: null, textColor: null, lineLimit: 0, minimumScaleFactor: 1, textOpacity: 1, leftAlignText() {}, centerAlignText() {}, rightAlignText() {} }); };
  const datum = d => { if (!(d instanceof Date)) throw new Error('addDate braucht ein Datum'); p.texte.push(`[Uhr ${d.toISOString()}]`); return streng('WidgetDate', { font: null, textColor: null, lineLimit: 0, applyTimerStyle() {}, applyRelativeStyle() {}, applyTimeStyle() {}, applyDateStyle() {}, applyOffsetStyle() {}, leftAlignText() {}, centerAlignText() {}, rightAlignText() {} }); };
  const bild = i => { if (!i || !i.istBild) throw new Error('addImage braucht ein Bild'); p.bilder++; return streng('WidgetImage', { imageSize: null, tintColor: null, imageOpacity: 1, cornerRadius: 0, resizable: true, containerRelativeShape: false, leftAlignImage() {}, centerAlignImage() {}, rightAlignImage() {}, applyFittingContentMode() {}, applyFillingContentMode() {} }); };
  const stapelInhalt = name => ({
    backgroundColor: null, backgroundImage: null, spacing: 0, url: null, size: null, cornerRadius: 0, borderWidth: 0, borderColor: null,
    addText: text, addDate: datum, addImage: bild, addSpacer() {}, addStack: () => stapel(),
    setPadding() {}, layoutHorizontally() {}, layoutVertically() {}, topAlignContent() {}, centerAlignContent() {}, bottomAlignContent() {}, useDefaultPadding() {},
    _name: name,
  });
  const stapel = () => streng('WidgetStack', stapelInhalt('WidgetStack'));
  ctx.ListWidget = function ListWidget() {
    const w = { ...stapelInhalt('ListWidget'), refreshAfterDate: null, presentSmall: async () => {}, presentMedium: async () => {}, presentLarge: async () => {}, presentAccessoryCircular: async () => {}, presentAccessoryRectangular: async () => {}, presentAccessoryInline: async () => {} };
    delete w.layoutHorizontally; delete w.layoutVertically; delete w.topAlignContent; delete w.centerAlignContent; delete w.bottomAlignContent; delete w.size; delete w.cornerRadius; delete w.borderWidth; delete w.borderColor;
    return streng('ListWidget', w);
  };
  const bildObjekt = () => ({ istBild: true, size: { width: 1, height: 1 } });
  ctx.SFSymbol = { named: n => { p.symbole = (p.symbole || []).concat(n); return streng('SFSymbol', { image: bildObjekt(), applyFont() {}, applyLightWeight() {}, applyRegularWeight() {}, applyMediumWeight() {}, applySemiboldWeight() {}, applyBoldWeight() {} }); } };
  ctx.Size = function Size(w, h) { this.width = w; this.height = h; };
  ctx.Point = function Point(x, y) { this.x = x; this.y = y; };
  ctx.Rect = function Rect(x, y, w, h) { if ([x, y, w, h].some(v => typeof v !== 'number' || Number.isNaN(v))) throw new Error('Rect braucht Zahlen'); Object.assign(this, { x, y, width: w, height: h }); };
  ctx.Path = function Path() { return streng('Path', { move() {}, addLine() {}, addLines(l) { if (!Array.isArray(l)) throw new Error('addLines braucht Liste'); }, addRect() {}, addRoundedRect(r, a, b) { if (!(r instanceof ctx.Rect) || typeof a !== 'number' || typeof b !== 'number') throw new Error('addRoundedRect(rect, w, h)'); }, addEllipse() {}, addQuadCurve() {}, addCurve() {}, closeSubpath() {} }); };
  ctx.DrawContext = function DrawContext() {
    return streng('DrawContext', {
      size: null, opaque: true, respectScreenScale: false,
      getImage() { p.gezeichnet = (p.gezeichnet || 0) + 1; return bildObjekt(); },
      setFillColor() {}, setStrokeColor() {}, setLineWidth() {}, setFont() {}, setTextColor() {}, setTextAlignedLeft() {}, setTextAlignedCenter() {}, setTextAlignedRight() {},
      fillRect(r) { if (!(r instanceof ctx.Rect)) throw new Error('fillRect braucht Rect'); }, fillEllipse() {}, strokeRect() {}, strokeEllipse() {}, addPath() {}, fillPath() {}, strokePath() {},
      drawText() {}, drawTextInRect(t, r) { if (!(r instanceof ctx.Rect)) throw new Error('drawTextInRect braucht Rect'); }, drawImageAtPoint() {}, drawImageInRect() {},
    });
  };
  ctx.Color = Object.assign(function Color(hex, a) { if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) throw new Error(`Farbe ${hex}`); this.hex = hex; this.alpha = a; },
    { red: () => 'rot', blue: () => 'blau', gray: () => 'grau', white: () => 'weiß', black: () => 'schwarz', dynamic: (a) => a });
  ctx.Font = { boldSystemFont: () => 'f', systemFont: () => 'f', mediumSystemFont: () => 'f', semiboldSystemFont: () => 'f' };
  return p;
}

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

  // OpenStreetMap-Suche (Nominatim): Texte mit "unbekannt" werden nicht gefunden
  let suche = async text => (/unbekannt/i.test(text) ? []
    : [{ lat: '52.1', lon: '7.6', address: { road: `Gefunden ${text.split(',')[0]}`, house_number: '1', postcode: '11111', city: 'Teststadt' } }]);
  const osm = text => suche(text);
  // OpenStreetMap-Routing: Auto 12 min (+3 Puffer = 15), Rad 14 min (+1 = 15)
  let routing = async url => ({ code: 'Ok', routes: [{ duration: url.includes('routed-bike') ? 840 : 720, distance: 5000 }] });
  const route = url => { routenAnfragen.push(url); return routing(url); };
  const routenAnfragen = [];
  const treffer = (road, nr, plz, ort, lat = '52.1', lon = '7.6') => [{ lat, lon, address: { road, house_number: nr, postcode: plz, city: ort } }];

  const ctx = {
    console: { log() {} },
    Date: TestDate,
    Calendar: {
      forEvents: async () => kalender,
      defaultForEvents: async () => kalender.find(k => k.title === 'Privat'),
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
    // Scriptable hat KEIN Location.geocode (nur current/reverseGeocode)
    Location: {},
    Alert: class { addAction() {} async presentAlert() { return 0; } },
    // Request: liefert Dateien aus diesem Repo wie raw.githubusercontent.com
    Request: class {
      constructor(url) { this.url = url; }
      async loadJSON() {
        if (this.url.startsWith('https://nominatim.openstreetmap.org/search')) return osm(new URL(this.url).searchParams.get('q'));
        if (this.url.startsWith('https://routing.openstreetmap.de/')) return route(this.url);
        return JSON.parse(await this.loadString());
      }
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
    return e;
  }

  const daten = n => path.join(wurzel, 'planer-daten', n);
  return { ctx, wurzel, script, termin, termine, mitteilungen, erinnerungen, geoeffnet, daten, osm, treffer, routenAnfragen, setJetzt: d => { jetzt = d; }, setSuche: f => { suche = f; }, setRouting: f => { routing = f; } };
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
  // Ergo und Training: Adressen von Hand eingetragen -> sicher für "Wegzeit abrufen"
  fs.writeFileSync(u.daten('orte.json'), JSON.stringify({ eintraege: {
    'praxisplatz 3, teststadt': { text: 'Praxisplatz 3, Teststadt', adresse: 'Praxisplatz 3, 11111 Teststadt', quelle: 'hand', datum: '2026-11-01' },
    'sporthalle teststadt': { text: 'Sporthalle Teststadt', adresse: 'Hallenweg 1, 11111 Teststadt', quelle: 'hand', datum: '2026-11-01' },
  }, offen: {} }));
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

  // Alte Planer-Einträge: vor heute weg, heutige bleiben, fremde (ohne Kennung) bleiben
  u.termin('Planer', 'Alt 3 Tage', new Date(2026, 10, 9, 18), new Date(2026, 10, 9, 18, 30)).notes = 'planer-aufgabe:bad|x';
  u.termin('Planer', 'Alt 200 Tage', new Date(2026, 3, 26, 18), new Date(2026, 3, 26, 18, 30)).notes = 'planer-fahrt';
  u.termin('Planer', 'Heute früh', um(6), um(6, 30)).notes = 'planer-aufgabe:saugen|x';
  u.termin('Planer', 'Von Hand', new Date(2026, 10, 10, 12), new Date(2026, 10, 10, 13));

  // Phase a: heute läuft die Schicht schon (07:00), wird also nicht neu angelegt
  const a = await u.script('Planer Planen.js', {}); // Parameter leer = Phase a
  assert.ok(!a.fehler, a.fehler);
  assert.ok(a.anzahl > 0);
  const schichten = u.termine.filter(t => t.calendar.title === 'Arbeit' && t.notes.includes('planer-schicht'));
  assert.ok(schichten.length >= 30, `Schichten: ${schichten.length}`);
  assert.ok(u.termine.some(t => t.title === 'Fremder Eintrag'));

  // Schicht von heute gibt es im Test nicht, darum selbst eintragen wie im echten Kalender
  u.termin('Arbeit', 'Arbeit', um(7), um(16), 'Werkweg 2, 11111 Teststadt');

  // Kurzbefehl: ein Aufruf plant alles; Fahrzeiten über OpenStreetMap (Auto 12+3, Rad 14+1 = 15 min)
  const b = await u.script('Planer Planen.js', {});
  assert.ok(!b.fehler, b.fehler);
  assert.deepStrictEqual([Array.from(b.rad).length, Array.from(b.auto).length], [0, 0], 'keine Wegzeit-Abfragen mehr');
  assert.ok(u.routenAnfragen.some(x => x.includes('/routed-bike/')) && u.routenAnfragen.some(x => x.includes('/routed-car/')), u.routenAnfragen.join(' '));
  assert.match(fs.readFileSync(u.daten('log.txt'), 'utf8'), /Ort nicht gefunden: "unbekannt irgendwo"/);
  // älterer Kurzbefehl schickt danach noch "RAD … AUTO …": nur die Wecker zurück, nicht doppelt planen
  const text = 'RAD\n\nAUTO\n';
  const anfragen = u.routenAnfragen.length;
  const alt = await u.script('Planer Planen.js', { shortcutParameter: text });
  assert.deepStrictEqual(Array.from(alt.wecker, w => w.zeit), Array.from(b.wecker, w => w.zeit));
  assert.strictEqual(u.routenAnfragen.length, anfragen);
  assert.deepStrictEqual(Array.from(b.wecker, w => w.zeit), ['16:40', '19:40', '05:45', '06:40']); // 05:45 Aufstehen, 06:40 los zur Freitagsschicht

  const zeit = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const bloecke = u.termine.filter(t => t.calendar.title === 'Planer' && t.notes.startsWith('planer-aufgabe'))
    .map(t => `${zeit(t.startDate)} ${t.title}`);
  assert.deepStrictEqual(bloecke, ['06:00 Heute früh', '18:15 Bad putzen', '18:45 Staubsaugen']);
  const planerTitel = u.termine.filter(t => t.calendar.title === 'Planer').map(t => t.title);
  assert.ok(!planerTitel.includes('Alt 3 Tage') && !planerTitel.includes('Alt 200 Tage'), 'alte Einträge gelöscht');
  assert.ok(planerTitel.includes('Von Hand'), 'Einträge ohne Planer-Kennung bleiben');
  u.termine.splice(u.termine.findIndex(t => t.title === 'Heute früh'), 1);
  // Fahrten stehen standardmäßig nicht im Kalender
  assert.strictEqual(u.termine.filter(t => t.calendar.title === 'Planer' && t.notes.startsWith('planer-fahrt')).length, 0);
  assert.strictEqual(u.mitteilungen.filter(m => m.title.startsWith('Jetzt:')).length, 2);
  assert.strictEqual(u.mitteilungen.filter(m => m.title === 'Checkliste: Training').length, 1);
  assert.ok(u.mitteilungen[0].actions[0].url.startsWith('scriptable:///run/Planer%20Aktion?aktion=erledigt&id=bad'));

  // Erinnerungen zum Abhaken (heute + morgen)
  assert.deepStrictEqual(u.erinnerungen.map(r => r.title), ['Bad putzen · 18:15', 'Staubsaugen · 18:45']);
  assert.ok(u.erinnerungen.every(r => r.dueDate && r.dueDateIncludesTime === false), 'Erinnerungen mit Datum (Heute-Liste)');
  assert.strictEqual(u.mitteilungen[0].actions.map(a => a.titel).join(','), 'Erledigt,5 Minuten anfangen,Später,Heute nicht,Nicht nötig');

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
  // kleine Bestätigung mit Erfolgston
  const erfolg = u.mitteilungen.find(m => m.title === 'Geschafft: Bad putzen');
  assert.ok(erfolg && erfolg.sound === 'piano_success' && erfolg.body === 'Das erste für heute.', u.mitteilungen.map(m => m.title).join(' | '));
  // plant direkt in Scriptable neu, ohne in die Kurzbefehle-App zu springen
  assert.deepStrictEqual(u.geoeffnet, []);
  const nachErledigt = u.termine.filter(t => t.calendar.title === 'Planer' && t.notes.startsWith('planer-aufgabe'));
  assert.deepStrictEqual(nachErledigt.map(t => `${t.startDate.getHours()}:${t.startDate.getMinutes()} ${t.title}`), ['18:15 Bad putzen', '18:45 Staubsaugen'].slice(1),
    'Bad ist erledigt; Staubsaugen bleibt dank Planruhe um 18:45');
  const planNach = JSON.parse(fs.readFileSync(u.daten('plan.json'), 'utf8'));
  assert.deepStrictEqual(planNach.wecker.map(w => w.zeit), ['19:40', '05:45', '06:40'], 'Wecker aus dem letzten Kurzbefehl-Lauf bleiben');
  const ged = JSON.parse(fs.readFileSync(u.daten('gedaechtnis.json'), 'utf8'));
  assert.deepStrictEqual(ged.ereignisse.map(e => [e.typ, e.id, e.geplantStart && new Date(e.geplantStart).getHours()]), [['erledigt', 'bad', 18]]);

  // "5 Minuten anfangen" bei Staubsaugen: nichts umplanen, in 5 Minuten nachfragen; Neuplanen löscht das nicht
  const saugMit = u.mitteilungen.find(m => m.title === 'Jetzt: Staubsaugen');
  const fuenfUrl = new URL(saugMit.actions.find(a => a.titel === '5 Minuten anfangen').url.replace('scriptable:///', 'http://x/'));
  u.setJetzt(um(18, 45));
  await u.script('Planer Aktion.js', { queryParameters: Object.fromEntries(fuenfUrl.searchParams) });
  let fuenf = u.mitteilungen.find(m => m.title === '5 Minuten um: Staubsaugen');
  assert.ok(fuenf && fuenf.trigger.getTime() === um(18, 50).getTime());
  assert.deepStrictEqual(fuenf.actions.map(a => a.titel), ['Erledigt', 'Später']);
  await u.script('Planer Planen.js', { shortcutParameter: text });
  assert.ok(u.mitteilungen.some(m => m.title === '5 Minuten um: Staubsaugen'), 'bleibt nach dem Neuplanen');
  u.setJetzt(um(18, 20));

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
  // ganzer Text wirft einen Fehler, die bereinigte Variante wird gefunden; "Halle" nie
  u.setSuche(async text => {
    gesucht.push(text);
    if (kaputt && text.includes('(')) throw new Error('Suche kaputt');
    if (/Halle/.test(text)) return [];
    return u.treffer('Gefunden', '1', '22222', 'Ort');
  });
  u.ctx.Location = {
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

test('Orte: nicht gefundene im Hintergrund einmal am Tag neu gesucht, in der App sofort', async () => {
  const u = umgebung({ jetzt: new Date(2026, 10, 12, 9) });
  fs.mkdirSync(path.join(u.wurzel, 'planer-daten'));
  fs.writeFileSync(u.daten('einstellungen.json'), JSON.stringify({
    eingerichtet: true,
    orte: { zuhause: { adresse: 'Teststraße 1, 11111 Teststadt' }, arbeit: { adresse: 'Werkweg 2, 11111 Teststadt' } },
  }));
  fs.writeFileSync(u.daten('aufgaben.json'), '[]');
  let geht = false;
  u.setSuche(async () => { if (!geht) throw new Error('aus'); return [{ name: 'Kino', lat: '1', lon: '2', address: { city: 'Teststadt' } }]; });
  u.termin('Privat', 'Kino', new Date(2026, 10, 12, 19), new Date(2026, 10, 12, 21), 'Kino am Markt');
  let a = await u.script('Planer Planen.js', {});
  assert.ok(!a.fehler, a.fehler);
  assert.strictEqual(u.routenAnfragen.length, 0);
  assert.match(fs.readFileSync(u.daten('log.txt'), 'utf8'), /Ort nicht gefunden: "Kino am Markt" \(aus\)/);
  geht = true;
  let suchen = 0;
  const alt = u.osm;
  u.setSuche(async () => { suchen++; return [{ name: 'Kino', lat: '1', lon: '2', address: { city: 'Teststadt' } }]; });
  a = await u.script('Planer Planen.js', {});
  assert.strictEqual(suchen, 0, 'im Hintergrund heute nicht noch einmal');
  assert.match(fs.readFileSync(u.daten('log.txt'), 'utf8'), /heute schon gesucht/);
  u.setJetzt(new Date(2026, 10, 13, 9));
  u.termin('Privat', 'Kino', new Date(2026, 10, 13, 19), new Date(2026, 10, 13, 21), 'Kino am Markt');
  a = await u.script('Planer Planen.js', {});
  assert.ok(suchen > 0 && alt, 'am nächsten Tag neu gesucht');
  const orte = JSON.parse(fs.readFileSync(u.daten('orte.json'), 'utf8'));
  assert.ok(orte.eintraege['kino am markt'] && orte.eintraege['kino am markt'].lat === 1);
  // Fahrzeit über OpenStreetMap berechnet (Auto 12 + 3 min Puffer)
  let cache = JSON.parse(fs.readFileSync(u.daten('fahrzeiten.json'), 'utf8'));
  assert.ok(Object.values(cache).some(c => c.quelle === 'osm' && c.min === 15), JSON.stringify(cache));
  // Routing nicht erreichbar -> Schätzung aus der Luftlinie (gilt nur heute)
  u.setRouting(async () => { throw new Error('offline'); });
  u.setJetzt(new Date(2026, 10, 14, 9));
  u.termin('Privat', 'Schwimmen', new Date(2026, 10, 14, 15), new Date(2026, 10, 14, 16), 'Bad am See');
  await u.script('Planer Planen.js', {});
  assert.match(fs.readFileSync(u.daten('log.txt'), 'utf8'), /Fahrzeit geschätzt \(Luftlinie, Auto; Routing: offline\)/);
  cache = JSON.parse(fs.readFileSync(u.daten('fahrzeiten.json'), 'utf8'));
  assert.ok(Object.values(cache).some(c => c.geschaetzt));
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
  assert.strictEqual(check.trigger.getHours() * 60 + check.trigger.getMinutes(), 19 * 60 + 15); // Abfahrt 19:45 (Routing 15 min) - 30
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

test('Stufe 1: Krank, verschobener Block, Einkauf, Medikament, Folgeaufgabe, Wachhund, Update-Hinweis', async () => {
  const um = (t, h, m = 0) => new Date(2026, 10, t, h, m);
  const u = umgebung({ jetzt: um(12, 9) }); // Donnerstag
  fs.mkdirSync(path.join(u.wurzel, 'planer-daten'));
  fs.writeFileSync(u.daten('einstellungen.json'), JSON.stringify({
    eingerichtet: true,
    orte: { zuhause: { adresse: 'Teststraße 1, 11111 Teststadt' }, arbeit: { adresse: 'Werkweg 2, 11111 Teststadt' } },
    schichten: { referenzMontag: '2026-11-09', referenzTyp: 'A' },
  }));
  const S = require('../scripts/planer/core/standard');
  const aufgaben = S.standardAufgaben().map(a => ({ ...a, letzte: '2026-11-01' }));
  fs.writeFileSync(u.daten('aufgaben.json'), JSON.stringify(aufgaben));
  fs.writeFileSync(u.daten('medikamente.json'), JSON.stringify([{ id: 'm1', name: 'Tablette', zeiten: ['20:00'], proEinnahme: 1, vorrat: 30 }]));
  fs.mkdirSync(path.join(u.wurzel, 'planer'), { recursive: true });
  fs.writeFileSync(path.join(u.wurzel, 'planer', 'version.json'), JSON.stringify({ version: '0.9.0' }));
  // Freitag krank (ganztägig im Kalender Privat)
  u.termin('Privat', 'Krank', um(13, 0), um(14, 0), '', true);
  // Einkaufsliste mit 5 Sachen
  const liste = { title: 'Einkauf' };
  u.ctx.Calendar.forReminders = async () => [liste, ...(await Promise.resolve([]))];
  for (const t of ['Milch', 'Brot', 'Eier', 'Käse', 'Äpfel']) {
    const r = new u.ctx.Reminder(); r.calendar = liste; r.title = t; await r.save();
  }

  await u.script('Planer Planen.js', {});
  await u.script('Planer Planen.js', { shortcutParameter: 'RAD\nAUTO\n' });
  const arbeit = u.termine.filter(t => t.calendar.title === 'Arbeit' && t.notes.includes('planer-schicht'));
  const tage = arbeit.map(t => t.startDate.getDate());
  assert.ok(tage.includes(12), 'heutige Schicht wird eingetragen, obwohl sie um 07:00 begann');
  assert.ok(!tage.includes(13), 'krank: keine Schicht am Freitag');
  let planer = u.termine.filter(t => t.calendar.title === 'Planer');
  assert.ok(!planer.some(t => t.startDate.getDate() === 13), 'krank: keine Aufgaben am Freitag');
  const einkauf = planer.find(t => t.title.startsWith('Einkaufen (5 Sachen)'));
  assert.ok(einkauf, planer.map(t => t.title).join(' | '));
  const titel = u.mitteilungen.map(m => m.title);
  assert.ok(titel.includes('Medikament: Tablette'));
  assert.ok(titel.includes('Noch nicht genommen? Tablette'));
  assert.ok(titel.includes('Planer lief heute früh nicht'));
  assert.ok(u.mitteilungen.find(m => m.identifier === 'planer-wachhund').trigger.getDate() === 13);
  assert.ok(titel.includes('Planer: Update verfügbar'));

  // Bad-Block im Kalender von Hand verschieben -> bleibt beim Neuplanen fest
  const bad = planer.find(t => t.title === 'Bad putzen');
  const neuStart = new Date(bad.startDate.getTime() + 60 * 60000);
  bad.endDate = new Date(bad.endDate.getTime() + 60 * 60000);
  bad.startDate = neuStart;
  await u.script('Planer Planen.js', {});
  planer = u.termine.filter(t => t.calendar.title === 'Planer');
  const badNeu = planer.find(t => t.title === 'Bad putzen');
  assert.strictEqual(badNeu.startDate.getTime(), neuStart.getTime());
  assert.ok(badNeu.notes.includes('|fest'));

  // Medikament "Genommen": Vorrat sinkt, Mitteilungen weg
  const med = u.mitteilungen.find(m => m.title === 'Medikament: Tablette');
  const q = Object.fromEntries(new URL(med.actions[0].url.replace('scriptable:///', 'http://x/')).searchParams);
  await u.script('Planer Aktion.js', { queryParameters: q });
  assert.strictEqual(JSON.parse(fs.readFileSync(u.daten('medikamente.json'), 'utf8'))[0].vorrat, 29);
  assert.ok(!u.mitteilungen.some(m => m.identifier.startsWith('planer-med-m1-2026-11-12-2000')));

  // Wäsche erledigt -> Folgeaufgabe "Wäsche aufhängen" in 2 Stunden, bleibt beim Neuplanen erhalten
  u.setJetzt(um(12, 17));
  await u.script('Planer Aktion.js', { queryParameters: { aktion: 'erledigt', id: 'waesche' } });
  let folge = u.mitteilungen.filter(m => m.identifier.startsWith('planer-folge-waesche'));
  assert.deepStrictEqual(folge.map(m => `${m.trigger.getHours()}:${m.trigger.getMinutes()}`), ['19:0', '19:30', '20:0']);
  await u.script('Planer Planen.js', { shortcutParameter: 'RAD\nAUTO\n' });
  assert.strictEqual(u.mitteilungen.filter(m => m.identifier.startsWith('planer-folge-waesche')).length, 3);
  const ok = Object.fromEntries(new URL(u.mitteilungen.find(m => m.identifier.startsWith('planer-folge-waesche')).actions[0].url.replace('scriptable:///', 'http://x/')).searchParams);
  await u.script('Planer Aktion.js', { queryParameters: ok });
  assert.strictEqual(u.mitteilungen.filter(m => m.identifier.startsWith('planer-folge-waesche')).length, 0);

  // Einkaufen erledigt -> Liste abgehakt, keine Einkaufs-Aufgabe mehr
  const ekId = JSON.parse(fs.readFileSync(u.daten('plan.json'), 'utf8')).bloecke.find(b => b.aufgabeId.startsWith('einkauf-')).aufgabeId;
  await u.script('Planer Aktion.js', { queryParameters: { aktion: 'erledigt', id: ekId } });
  assert.ok(u.erinnerungen.filter(r => r.calendar === liste).every(r => r.isCompleted));
  assert.ok(!u.termine.some(t => t.calendar.title === 'Planer' && t.title.startsWith('Einkaufen') && t.endDate > um(12, 17)), 'keine zukünftige Einkaufs-Aufgabe mehr');

  const log = fs.readFileSync(u.daten('log.txt'), 'utf8');
  assert.ok(!log.includes('FEHLER'), log);
});

test('Menüs: einmal durch alle Bildschirme klicken (keine Laufzeitfehler)', async () => {
  const um = (t, h, m = 0) => new Date(2026, 10, t, h, m);
  const u = umgebung({ jetzt: um(12, 9) });
  fs.mkdirSync(path.join(u.wurzel, 'planer-daten'));
  fs.writeFileSync(u.daten('einstellungen.json'), JSON.stringify({
    eingerichtet: true,
    orte: { zuhause: { adresse: 'Teststraße 1, 11111 Teststadt' }, arbeit: { adresse: 'Werkweg 2, 11111 Teststadt' } },
    schichten: { referenzMontag: '2026-11-09', referenzTyp: 'A' },
  }));
  u.termin('Privat', 'Training', um(12, 20), um(12, 21, 30), 'Sporthalle Teststadt');
  await u.script('Planer Planen.js', {});
  await u.script('Planer Planen.js', { shortcutParameter: 'RAD\nAUTO\n' });
  fs.writeFileSync(u.daten('medikamente.json'), JSON.stringify([{ id: 'm1', name: 'Tablette', zeiten: ['20:00'], vorrat: 20 }]));

  // Antworten der Reihe nach; leer = "Zurück" (-1). Tabellen werden nur angezeigt.
  const antworten = [
    0,              // Hauptmenü: Heute (Tabelle)
    1,              // Woche (Tabelle)
    3, -1,          // Aufgaben -> zurück
    3, 0, -1, -1,   // Aufgaben -> erste Aufgabe -> zurück -> zurück
    4, 0, -1, 1, 0, -1, -1, 2, -1, 3, -1, 4, -1, 5, -1, 6, -1, -1, // Extras: jede Unterseite einmal
    5, 0, -1, 1, -1, 2, -1, 3, -1, 5, -1, 7, -1, 8, -1, 10, -1, 11, -1, -1, // Einstellungen: Unterseiten
    6,              // Log (Tabelle)
    -1,             // Schließen
  ];
  const gezeigt = [];
  class Alert {
    constructor() { this.aktionen = []; this.felder = []; }
    addAction(t) { this.aktionen.push(t); } addCancelAction() {} addDestructiveAction(t) { this.aktionen.push(t); }
    addTextField(p, w) { this.felder.push(w || ''); return { setNumberPadKeyboard() {}, setDecimalPadKeyboard() {} }; }
    textFieldValue(i) { return this.felder[i]; }
    async presentSheet() { gezeigt.push(this.title); return antworten.length ? antworten.shift() : -1; }
    async presentAlert() { gezeigt.push(this.title); return antworten.length ? antworten.shift() : -1; }
  }
  oberflaeche(u.ctx);
  const zelle = () => streng('UITableCell', { titleFont: null, titleColor: null, subtitleFont: null, subtitleColor: null, widthWeight: 0, onTap: null, dismissOnTap: false, leftAligned() {}, centerAligned() {}, rightAligned() {} });
  class UITable { constructor() { this.rows = []; this.showSeparators = false; } addRow(r) { this.rows.push(r); } removeAllRows() { this.rows = []; } reload() {} async present() { gezeigt.push(`Tabelle ${this.rows.length}`); } }
  function UITableRow() {
    return streng('UITableRow', {
      height: 44, backgroundColor: null, isHeader: false, cellSpacing: 0, onSelect: null, dismissOnSelect: true,
      addText(a, b) { this.texte = [a, b]; return zelle(); }, addImage(i) { if (!i || !i.istBild) throw new Error('addImage braucht ein Bild'); return zelle(); },
      addButton() { return zelle(); }, addCell() {}, texte: null,
    });
  }
  Object.assign(u.ctx, { Alert, UITable, UITableRow });
  await u.script('Planer.js', {});
  assert.deepStrictEqual(antworten, [], `nicht alle Antworten verbraucht; gezeigt: ${gezeigt.join(' > ')}`);
  for (const t of ['Planer', 'Aufgaben', 'Extras', 'Einkaufsliste', 'Medikamente', 'Tablette', 'Geburtstage', 'Fristen', 'Checklisten', 'Blumen', 'Müllabfuhr (Option)', 'Einstellungen', 'Zeiten und Regeln', 'Urlaub / krank / abwesend', 'Einzelne Schicht ändern']) {
    assert.ok(gezeigt.includes(t), `${t} fehlt: ${gezeigt.join(' > ')}`);
  }
  assert.ok(gezeigt.filter(x => String(x).startsWith('Tabelle')).length >= 3);
  const log = fs.readFileSync(u.daten('log.txt'), 'utf8');
  assert.ok(!log.includes('FEHLER'), log);
});

test('Stufe 2: Regen, Aufstehwecker, Tagesabschluss, Morgen-Überblick, Widget, Abfahrt', async () => {
  const um = (t, h, m = 0) => new Date(2026, 10, t, h, m);
  const u = umgebung({ jetzt: um(12, 9) }); // Donnerstag
  fs.mkdirSync(path.join(u.wurzel, 'planer-daten'));
  fs.writeFileSync(u.daten('einstellungen.json'), JSON.stringify({
    eingerichtet: true,
    orte: { zuhause: { adresse: 'Teststraße 1, 11111 Teststadt' }, arbeit: { adresse: 'Werkweg 2, 11111 Teststadt' } },
    schichten: { referenzMontag: '2026-11-09', referenzTyp: 'A' },
  }));
  fs.writeFileSync(u.daten('aufgaben.json'), JSON.stringify([{ id: 'bad', name: 'Bad putzen', intervall: 7, dauer: 30, pflicht: true, letzte: null }]));
  const urls = [];
  u.setSuche(async () => u.treffer('Teststraße', '1', '11111', 'Teststadt', '52.123456', '7.654321'));
  u.ctx.Request = class {
    constructor(url) { this.url = url; urls.push(url); }
    async loadJSON() {
      if (this.url.includes('nominatim')) return u.osm('x');
      // Routing: Rad 12 + 1 = 13 min, Auto 6 + 3 = 9 min
      if (this.url.includes('routing.openstreetmap.de')) return { code: 'Ok', routes: [{ duration: this.url.includes('routed-bike') ? 720 : 360 }] };
      // Freitag 06:00 und 07:00 Regen 80 %, sonst trocken
      const time = [], precipitation_probability = [];
      for (let d = 12; d <= 14; d++) for (let h = 0; h < 24; h++) {
        time.push(`2026-11-${d}T${String(h).padStart(2, '0')}:00`);
        precipitation_probability.push(d === 13 && (h === 6 || h === 7) ? 80 : 5);
      }
      return { hourly: { time, precipitation_probability } };
    }
    async loadString() { return JSON.stringify({ version: '0' }); }
  };
  await u.script('Planer Planen.js', {});
  const b = await u.script('Planer Planen.js', { shortcutParameter: 'RAD\n12 Min.\n12 Min.\nAUTO\n9 Min.\n9 Min.\n' });
  assert.ok(urls.some(x => x.includes('api.open-meteo.com') && x.includes('latitude=52.12&longitude=7.65')), urls.join(' '));
  // Freitag: Regen -> Auto (9 min): Abfahrt 06:51, Wecker 06:46, Aufstehen 05:51
  assert.deepStrictEqual(Array.from(b.wecker, w => `${w.zeit} ${w.name}`), [
    '05:51 Planer: Aufstehen (los 06:51 zu Arbeit)',
    '06:46 Planer: In 5 min los zu Arbeit',
  ]);
  const titel = u.mitteilungen.map(m => m.title);
  const abschluss = u.mitteilungen.find(m => m.title === 'Tagesabschluss');
  assert.ok(abschluss, titel.join(' | '));
  assert.match(abschluss.body, /Offen von heute: Bad putzen/);
  assert.match(abschluss.body, /Regen 80 %: Auto statt Rad/);
  assert.strictEqual(abschluss.actions[0].titel, 'Alles erledigt');
  const morgen = u.mitteilungen.find(m => m.title === 'Dein Tag · Fr 13.11.');
  assert.ok(morgen && morgen.trigger.getHours() === 5, titel.join(' | '));

  // Widget: alle Größen, Home und Sperrbildschirm
  for (const familie of ['small', 'medium', 'large', 'accessoryRectangular', 'accessoryCircular', 'accessoryInline']) {
    const prot = oberflaeche(u.ctx);
    let gesetzt = null;
    u.ctx.Script.setWidget = w => { gesetzt = w; };
    u.ctx.config = { runsInWidget: true, widgetFamily: familie };
    await u.script('Planer Widget.js', {});
    assert.ok(gesetzt && gesetzt.url.includes('Planer'), familie);
    assert.ok(gesetzt.refreshAfterDate > um(12, 9), familie);
    const alles = prot.texte.join(' | ');
    if (familie === 'medium') {
      // 09:00: als Nächstes der Block 18:15? Erst kommt die Ruhe vor dem Training (Abfahrt), davor Bad putzen
      assert.match(alles, /Bad putzen/, alles);
      assert.ok(!/\[Uhr /.test(alles), 'keine mitlaufende Uhr (zählt sonst hoch, wenn iOS nicht neu zeichnet)');
      assert.match(alles, /(bis|um) \d\d:\d\d/, alles);
      assert.ok(prot.bilder >= 3, 'Balken, Zeitleiste, Symbole');
      assert.ok(prot.symbole.includes('shower.fill'), prot.symbole.join(','));
    }
    if (familie === 'accessoryInline') assert.strictEqual(prot.texte.length, 1, alles);
    if (familie === 'accessoryRectangular') assert.match(alles, /bis \d\d:\d\d|noch .* \(Stand 09:00\)/, alles);
    if (familie === 'accessoryCircular') assert.match(alles, /^\d\d:\d\d$/m, alles);
    assert.ok(!/\[Uhr /.test(alles), familie);
  }
  u.ctx.config = { runsInApp: false };

  // Tagesabschluss-Knopf "Alles erledigt"
  u.setJetzt(um(12, 20, 30));
  const q = Object.fromEntries(new URL(abschluss.actions[0].url.replace('scriptable:///', 'http://x/')).searchParams);
  await u.script('Planer Aktion.js', { queryParameters: q });
  assert.strictEqual(JSON.parse(fs.readFileSync(u.daten('aufgaben.json'), 'utf8'))[0].letzte, '2026-11-12');

  // Abfahrt am Freitag um 06:55 merken
  u.setJetzt(um(13, 6, 55));
  await u.script('Planer Abfahrt.js', {});
  const ged = JSON.parse(fs.readFileSync(u.daten('gedaechtnis.json'), 'utf8')).ereignisse;
  const ab = ged.find(e => e.typ === 'abfahrt');
  assert.deepStrictEqual([ab.ziel, ab.modus, new Date(ab.geplant).getMinutes()], ['Arbeit', 'Auto', 51]);
  const log = fs.readFileSync(u.daten('log.txt'), 'utf8');
  assert.ok(!log.includes('FEHLER'), log);
  assert.match(log, /Regen 80 %: Fr 13\.11\. 06:51 Auto statt Rad zu Arbeit/);
});

test('Stufe 3: Dienstplan-PDF teilen, Vorschau, übernehmen, Schichten im Kalender', async () => {
  const um = (t, h, m = 0) => new Date(2026, 10, t, h, m);
  const u = umgebung({ jetzt: um(9, 9) }); // Montag
  fs.mkdirSync(path.join(u.wurzel, 'planer-daten'));
  fs.writeFileSync(u.daten('einstellungen.json'), JSON.stringify({
    eingerichtet: true,
    orte: { zuhause: { adresse: 'Teststraße 1, 11111 Teststadt' }, arbeit: { adresse: 'Werkweg 2, 11111 Teststadt' } },
    schichten: { referenzMontag: '2026-11-09', referenzTyp: 'A' },
  }));
  // ausgedachte Tabelle: Testperson Mo 08:00-16:00, Di frei, Mi 08:00-12:30-13:00-17:30
  const items = [{ s: 'Dienstplan November 2026', x: 10, y: 800, w: 100 }];
  ['9.11', '10.11', '11.11'].forEach((t, i) => items.push({ s: t, x: 100 + i * 40 - 8, y: 760, w: 16 }));
  items.push({ s: 'Testperson', x: 10, y: 739, w: 50 });
  [['08:00', '16:00'], [], ['08:00', '12:30', '13:00', '17:30']].forEach((z, i) => z.forEach((x, k) => items.push({ s: x, x: 90 + i * 40, y: 740 - k * 10, w: 20 })));
  let geladen = 0;
  u.ctx.Request = class { constructor(url) { this.url = url; } async loadString() { geladen++; this.response = { statusCode: 200 }; return 'x'.repeat(200000); } async loadJSON() { return {}; } };
  u.ctx.Data = { fromFile: () => ({ toBase64String: () => 'UERG' }) };
  u.ctx.WebView = class {
    async loadHTML() {}
    async evaluateJavaScript(js, asynchron) {
      // iOS: endet das Script mit einem Promise (z. B. async-IIFE), kommt "Nicht unterstützter Typ"
      if (/\}\)\(\);?\s*$/.test(js)) throw new Error('Failed evaluating JavaScript with error: Nicht unterstützter Typ');
      return asynchron ? JSON.stringify(items) : 0;
    }
  };
  const antworten = [0, 0, 0]; // Name OK, Übernehmen, Info OK
  const gezeigt = [];
  u.ctx.Alert = class {
    constructor() { this.felder = []; }
    addAction() {} addCancelAction() {}
    addTextField() { this.felder.push('Testperson'); return {}; }
    textFieldValue(i) { return this.felder[i]; }
    async presentAlert() { gezeigt.push(`${this.title}: ${this.message || ''}`); return antworten.length ? antworten.shift() : -1; }
  };
  await u.script('Planer Dienstplan.js', { fileURLs: ['file:///privat/Dienstplan.pdf'] });
  assert.strictEqual(geladen, 2, 'Leseprogramm einmal geladen (2 Dateien)');
  assert.ok(gezeigt.some(g => g.startsWith('Dienstplan 09.11.2026 – 11.11.2026') && g.includes('Di 10.11.  frei') && g.includes('Mi 11.11.  08:00-17:30')), gezeigt.join('\n'));
  const arbeit = u.termine.filter(t => t.calendar.title === 'Arbeit' && t.startDate.getMonth() === 10).map(t => `${t.startDate.getDate()} ${t.startDate.getHours()}-${t.endDate.getHours()}:${t.endDate.getMinutes()}`);
  assert.ok(arbeit.includes('9 8-16:0') && !arbeit.some(x => x.startsWith('10 ')) && arbeit.includes('11 8-17:30'), arbeit.join(' | '));
  assert.ok(arbeit.includes('12 7-16:0'), 'nach dem Plan: Muster (Woche A)');
  const e = JSON.parse(fs.readFileSync(u.daten('einstellungen.json'), 'utf8'));
  assert.strictEqual(e.dienstplan.name, 'Testperson');
  // zweiter Import: Leseprogramm liegt schon da
  antworten.push(0, 0);
  await u.script('Planer Dienstplan.js', { fileURLs: ['/privat/Dienstplan.pdf'] });
  assert.strictEqual(geladen, 2);
  const log = fs.readFileSync(u.daten('log.txt'), 'utf8');
  assert.ok(!log.includes('FEHLER'), log);
});

test('Stufe 4: Lernen, Wochenrückblick, Rückgängig', async () => {
  const um = (t, h, m = 0) => new Date(2026, 10, t, h, m);
  const u = umgebung({ jetzt: um(12, 9) });
  fs.mkdirSync(path.join(u.wurzel, 'planer-daten'));
  fs.writeFileSync(u.daten('einstellungen.json'), JSON.stringify({
    eingerichtet: true,
    orte: { zuhause: { adresse: 'Teststraße 1, 11111 Teststadt' }, arbeit: { adresse: 'Werkweg 2, 11111 Teststadt' } },
  }));
  fs.writeFileSync(u.daten('aufgaben.json'), JSON.stringify([{ id: 'bad', name: 'Bad putzen', intervall: 7, dauer: 30, pflicht: true, letzte: '2026-11-09' }]));
  const ev = (t) => ({ t: um(t, 18, 20).toISOString(), typ: 'erledigt', id: 'bad', geplantStart: um(t, 18).toISOString() });
  fs.writeFileSync(u.daten('gedaechtnis.json'), JSON.stringify({ ereignisse: [ev(1), ev(5), ev(9)] }));
  await u.script('Planer Planen.js', {});
  await u.script('Planer Planen.js', { shortcutParameter: 'RAD\nAUTO\n' });
  let auf = JSON.parse(fs.readFileSync(u.daten('aufgaben.json'), 'utf8'));
  assert.strictEqual(auf[0].dauer, 20);
  const st = JSON.parse(fs.readFileSync(u.daten('lernen.json'), 'utf8'));
  assert.strictEqual(st.gelernt[0].neu, 20);
  const rb = u.mitteilungen.find(m => m.title === 'Wochenrückblick');
  assert.ok(rb && rb.trigger.getDay() === 0 && rb.trigger.getHours() === 18);
  // Rückgängig über das Modul (wie im Menü)
  fs.writeFileSync(path.join(u.wurzel, 'zurueck.js'), "const P = importModule('planer/adapter/planung'); const st = await P.lernstandLaden(); await P.lernAktion('rueckgaengig', st.gelernt[0]); await P.abschluss();");
  await u.script('zurueck.js', {});
  auf = JSON.parse(fs.readFileSync(u.daten('aufgaben.json'), 'utf8'));
  assert.strictEqual(auf[0].dauer, 30);
  assert.ok(JSON.parse(fs.readFileSync(u.daten('lernen.json'), 'utf8')).abgelehnt['bad|dauer']);
  const log = fs.readFileSync(u.daten('log.txt'), 'utf8');
  assert.match(log, /Gelernt: Bad putzen dauer 30 -> 20/);
  assert.ok(!log.includes('FEHLER'), log);
});

test('Stufe 5: Planer sagen (Claude-Antwort und ohne Claude)', async () => {
  const um = (t, h, m = 0) => new Date(2026, 10, t, h, m);
  const u = umgebung({ jetzt: um(12, 9) }); // Donnerstag
  fs.mkdirSync(path.join(u.wurzel, 'planer-daten'));
  fs.writeFileSync(u.daten('einstellungen.json'), JSON.stringify({
    eingerichtet: true,
    orte: { zuhause: { adresse: 'Teststraße 1, 11111 Teststadt' }, arbeit: { adresse: 'Werkweg 2, 11111 Teststadt' } },
  }));
  fs.writeFileSync(u.daten('aufgaben.json'), JSON.stringify([{ id: 'bad', name: 'Bad putzen', intervall: 7, dauer: 30, pflicht: true, letzte: '2026-11-01' }]));
  const antworten = [];
  const gezeigt = [];
  u.ctx.Alert = class {
    constructor() { this.aktionen = []; this.felder = []; }
    addAction(t) { this.aktionen.push(t); } addCancelAction() {}
    addTextField(p2, w) { this.felder.push(w || ''); return {}; }
    textFieldValue(i) { return this.felder[i]; }
    async presentAlert() { gezeigt.push(`${this.title}: ${this.message}`); return antworten.length ? antworten.shift() : -1; }
    async presentSheet() { gezeigt.push(`${this.title}: ${this.aktionen.join(',')}`); const i = this.aktionen.indexOf('Privat'); return i; }
  };
  antworten.push(0); // "Ausführen"
  const claude = '{"aktionen":[{"aktion":"termin","titel":"Zahnarzt","datum":"Dienstag","uhrzeit":"10:00","ort":"Musterdorf"},{"aktion":"einkauf","sachen":["Milch","Brot"]},{"aktion":"erledigt","name":"Bad"}]}';
  const aus = await u.script('Planer Sprache.js', { shortcutParameter: `DIKTAT: Dienstag zehn Uhr Zahnarzt in Musterdorf, Milch und Brot kaufen, Bad ist erledigt\nCLAUDE: ${claude}` });
  assert.match(aus, /^Erledigt: Termin "Zahnarzt" am Di 17\.11\. um 10:00 \(60 min\) in Musterdorf; Auf die Einkaufsliste: Milch, Brot; "Bad putzen" als erledigt markieren$/);
  const zahn = u.termine.find(t => t.title === 'Zahnarzt');
  assert.ok(zahn && zahn.calendar.title === 'Privat' && zahn.startDate.getDate() === 17 && zahn.startDate.getHours() === 10 && zahn.location === 'Musterdorf');
  assert.deepStrictEqual(u.erinnerungen.filter(r => r.calendar.title === 'Einkauf').map(r => r.title), ['Milch', 'Brot']);
  assert.strictEqual(JSON.parse(fs.readFileSync(u.daten('aufgaben.json'), 'utf8'))[0].letzte, '2026-11-12');
  assert.strictEqual(JSON.parse(fs.readFileSync(u.daten('einstellungen.json'), 'utf8')).sprache.kalender, 'Privat');

  // ohne Claude: nur Diktat, Kalender schon gewählt
  antworten.push(0);
  await u.script('Planer Sprache.js', { shortcutParameter: 'DIKTAT: Ich bin krank' });
  const e = JSON.parse(fs.readFileSync(u.daten('einstellungen.json'), 'utf8'));
  assert.deepStrictEqual(e.schichten.ausnahmen.map(x => [x.von, x.art]), [['2026-11-12', 'krank']]);
  // Abbrechen ändert nichts
  await u.script('Planer Sprache.js', { shortcutParameter: 'DIKTAT: Neue Aufgabe Pflanzen gießen alle 3 Tage' });
  assert.strictEqual(JSON.parse(fs.readFileSync(u.daten('aufgaben.json'), 'utf8')).length, 1);
  // Bestehenden Termin verschieben (anderer Kalender als der Sprach-Kalender)
  u.termin('Arbeit', 'Training', um(13, 19), um(13, 20, 30), 'Sporthalle');
  antworten.push(0);
  const aus2 = await u.script('Planer Sprache.js', { shortcutParameter: 'DIKTAT: dass mein Training morgen erst um 20 Uhr anfängt' });
  assert.match(aus2, /"Training" \(Arbeit\): Fr 13\.11\. 19:00 -> Fr 13\.11\. 20:00–21:30/);
  const tr = u.termine.filter(t => t.title === 'Training');
  assert.strictEqual(tr.length, 1, 'kein zweiter Termin');
  assert.strictEqual(tr[0].startDate.getHours(), 20);
  assert.strictEqual(tr[0].endDate.getHours() * 60 + tr[0].endDate.getMinutes(), 21 * 60 + 30);
  // Über Siri: Scriptable kann kein Fenster zeigen -> ohne Rückfrage ausführen, Mitteilung
  const AltAlert = u.ctx.Alert;
  // wie am iPhone: schon "new Alert()" wirft über Siri
  u.ctx.Alert = class { constructor() { throw new Error('Alerts are not supported in Siri.'); } };
  const aus3 = await u.script('Planer Sprache.js', { shortcutParameter: 'DIKTAT: Morgen ist mein Training erst um 18:00 Uhr\nCLAUDE:{"aktionen":[{"aktion":"termin","titel":"Training","datum":"morgen","uhrzeit":"18:00"}]}' });
  u.ctx.Alert = AltAlert;
  assert.match(aus3, /^Erledigt: "Training" \(Arbeit\): Fr 13\.11\. 20:00 -> Fr 13\.11\. 18:00/);
  assert.strictEqual(u.termine.filter(t => t.title === 'Training').length, 1);
  assert.strictEqual(u.termine.find(t => t.title === 'Training').startDate.getHours(), 18);
  assert.ok(u.mitteilungen.some(m => m.title === 'Planer: Erledigt' && /Training/.test(m.body)));
  const log = fs.readFileSync(u.daten('log.txt'), 'utf8');
  assert.ok(!log.includes('FEHLER'), log);
  assert.match(log, /Sprache \(claude\)/);
  assert.match(log, /Termin geändert/);
  assert.match(log, /ohne Rückfrage/);
});

test('Planer sagen über Siri ohne Claude: Termin in den Standard-Kalender, Mitteilung statt Fenster', async () => {
  const u = umgebung({ jetzt: new Date(2026, 10, 12, 7, 24) });
  fs.mkdirSync(path.join(u.wurzel, 'planer-daten'));
  fs.writeFileSync(u.daten('einstellungen.json'), JSON.stringify({
    eingerichtet: true,
    orte: { zuhause: { adresse: 'Teststraße 1, 11111 Teststadt' }, arbeit: { adresse: 'Werkweg 2, 11111 Teststadt' } },
  }));
  fs.writeFileSync(u.daten('aufgaben.json'), '[]');
  u.ctx.config = { runsInApp: false, runsWithSiri: true };
  u.ctx.Alert = class { constructor() { throw new Error('Alerts are not supported in Siri.'); } };
  const aus = await u.script('Planer Sprache.js', { shortcutParameter: 'DIKTAT: Morgen Treffen mit Max und Moritz um 18 Uhr' });
  assert.match(aus, /^Erledigt: Termin "Treffen mit Max und Moritz" am Fr 13\.11\. um 18:00/);
  const t = u.termine.find(x => x.title === 'Treffen mit Max und Moritz');
  assert.ok(t && t.calendar.title === 'Privat');
  assert.strictEqual(JSON.parse(fs.readFileSync(u.daten('einstellungen.json'), 'utf8')).sprache.kalender, 'Privat');
  assert.ok(u.mitteilungen.some(m => m.title === 'Planer: Erledigt'));
  // nicht verstanden -> Mitteilung
  await u.script('Planer Sprache.js', { shortcutParameter: 'DIKTAT: blabla' });
  assert.ok(u.mitteilungen.some(m => m.title === 'Planer: Nicht verstanden'));
  assert.ok(!fs.readFileSync(u.daten('log.txt'), 'utf8').includes('FEHLER'));
});

test('Früher zuhause, Einladungen ohne Zusage nur als Info (Widget, Morgen-Überblick)', async () => {
  const um = (t, h, m = 0) => new Date(2026, 10, t, h, m);
  const u = umgebung({ jetzt: um(12, 15, 20) }); // Donnerstag
  fs.mkdirSync(path.join(u.wurzel, 'planer-daten'));
  fs.writeFileSync(u.daten('einstellungen.json'), JSON.stringify({
    eingerichtet: true,
    orte: { zuhause: { adresse: 'Teststraße 1, 11111 Teststadt' }, arbeit: { adresse: 'Werkweg 2, 11111 Teststadt' } },
  }));
  fs.writeFileSync(u.daten('aufgaben.json'), '[]');
  u.termin('Arbeit', 'Arbeit', um(12, 7), um(12, 16), 'Werkweg 2, 11111 Teststadt');
  const einladung = status => [{ isCurrentUser: false, name: 'Organisatorin', role: 'chair', status: 'accepted', type: 'person' }, { isCurrentUser: true, name: 'Ich', role: 'required', status, type: 'person' }];
  u.termin('Privat', 'Yoga', um(12, 18), um(12, 19), 'Studio Mitte').attendees = einladung('pending');
  u.termin('Privat', 'Yoga', um(13, 18), um(13, 19), 'Studio Mitte').attendees = einladung('pending');
  u.termin('Privat', 'Kino', um(12, 20), um(12, 22), 'Kino am Markt').attendees = einladung('accepted');

  const a = await u.script('Planer Planen.js', { shortcutParameter: 'heim' });
  assert.ok(!a.fehler, a.fehler);
  const plan = JSON.parse(fs.readFileSync(u.daten('plan.json'), 'utf8'));
  const arbeit = plan.termine.find(t => t.titel === 'Arbeit');
  assert.strictEqual(new Date(arbeit.end).getHours() * 60 + new Date(arbeit.end).getMinutes(), 15 * 60 + 5, 'Ankunft 15:20 minus 15 min Rad');
  assert.ok(!plan.termine.some(t => t.titel === 'Yoga'), 'Einladung ohne Zusage blockiert nichts');
  assert.ok(plan.termine.some(t => t.titel === 'Kino'), 'zugesagt = normaler Termin');
  assert.deepStrictEqual(plan.infos.map(i => i.titel), ['Yoga', 'Yoga']);
  assert.ok(!plan.fahrten.some(f => f.zielName === 'Yoga'), 'keine Fahrt zur Info');
  const log = fs.readFileSync(u.daten('log.txt'), 'utf8');
  assert.match(log, /Früher zuhause: "Arbeit" gilt bis 15:05 als beendet/);
  assert.match(log, /nur als Info/);
  // Morgen-Überblick für Freitag nennt die Info
  const morgen = u.mitteilungen.find(m => m.title === 'Dein Tag · Fr 13.11.');
  assert.ok(morgen && /Info: 18:00 Yoga/.test(morgen.body), u.mitteilungen.map(m => `${m.title}: ${m.body}`).join(' | '));
  // Widget zeigt die Info von heute
  const prot = oberflaeche(u.ctx);
  u.ctx.Script.setWidget = () => {};
  u.ctx.config = { runsInWidget: true, widgetFamily: 'medium' };
  await u.script('Planer Widget.js', {});
  assert.ok(prot.texte.includes('Info: 18:00 Yoga'), prot.texte.join(' | '));
  u.ctx.config = { runsInApp: false };
  // Wieder losgefahren: "früher zuhause" gilt nicht mehr
  await u.script('Planer Abfahrt.js', {});
  assert.strictEqual(JSON.parse(fs.readFileSync(u.daten('zustand.json'), 'utf8')).heimAb, null);
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
