// Standardwerte. Enthält KEINE persönlichen Daten – Adressen usw. stehen nur auf dem iPhone.
'use strict';

function standardEinstellungen() {
  return {
    version: 1,
    eingerichtet: false,
    kalender: { planer: 'Planer', arbeit: 'Arbeit', ignorieren: [], fahrtenEintragen: false },
    orte: {
      zuhause: { adresse: '', stichwoerter: ['zuhause', 'daheim'] },
      arbeit: { name: 'Arbeit', adresse: '', stichwoerter: ['arbeit'] },
    },
    // Aufgaben von heute und morgen zum Abhaken in der Erinnerungen-App
    erinnerungen: { an: true, liste: 'Planer', tage: 2 },
    geburtstage: { kalender: 'Geburtstage', uhrzeit: '06:00', geschenkVorTage: 14, geschenkDauer: 30 },
    fristen: { liste: 'Fristen', uhrzeit: '06:00' },
    // Ruhezeiten für laute Aufgaben (Option, Standard aus): nicht an Sonn- und Feiertagen, nur von–bis
    ruhezeiten: { an: false, von: '08:00', bis: '20:00' },
    // Ganztägige Kalendereinträge: "urlaub*" = Wort beginnt so, sonst ganzes Wort
    tage: {
      frei: ['urlaub*', 'frei', 'überstundenfrei', 'gleittag', 'brückentag', 'regenerationstag'],
      krank: ['krank', 'krankgeschrieben', 'krankmeldung'],
      weg: ['reise', 'verreist', 'abwesend'],
    },
    wachhund: { an: true, zeit: '07:30', laufBis: '06:30' },
    verkehr: { zuhauseArbeit: 'Fahrrad', direktVonArbeit: 'Fahrrad', sonst: 'Auto' },
    regeln: {
      pauseNachHeim: 15,
      ruheVorAbfahrt: 30,
      minLuecke: 20,
      tagStart: '08:00',       // Arbeitstage
      tagStartFrei: '09:30',   // freie Tage: Aufgaben und Besorgungen erst ab hier
      tagEnde: '21:00',
      unterwegsBis: '19:00', // Besorgungen (z. B. Blumen) nur, solange Läden offen sind
      besorgungenSonntags: false, // Läden sind an Sonn- und Feiertagen zu
      maxArbeitstag: 60,       // Minuten Aufgaben an Tagen mit Schicht
      maxFreierTag: 120,       // Minuten Aufgaben an freien Tagen
      langAb: 45,              // längere Aufgaben bevorzugt an freien Tagen
      planruhe: true,          // geplante Blöcke bleiben beim Neuplanen an ihrer Zeit, solange sie passen
      tage: 7,
      weckerVorlauf: 5,
      weckerStunden: 24,
      fallbackMin: 20,
      vorziehenTage: 2,
      cacheTage: 30,
    },
    schichten: {
      referenzMontag: null,
      referenzTyp: 'A',
      wochen: 8,
      // Wochentag: 1 = Montag ... 5 = Freitag
      zeiten: {
        A: { 1: '07:00-16:00', 2: '07:00-16:00', 3: '07:00-16:00', 4: '07:00-16:00', 5: '07:00-13:00' },
        B: { 1: '08:00-16:00', 2: '08:00-16:00', 3: '08:00-13:00', 4: '08:00-16:00', 5: '08:00-16:00' },
      },
      extraFrei: ['24.12', '31.12'],
      ausnahmen: [],    // [{von, bis, text, art: 'frei' | 'krank' | 'weg'}]
      aenderungen: [],  // [{datum, zeit: '08:00-17:30' | null}] einzelne Schicht ändern
    },
  };
}

function standardAufgaben() {
  return [
    { id: 'bad', name: 'Bad putzen', intervall: 7, dauer: 30, pflicht: true, letzte: null, aktiv: true },
    { id: 'saugen', name: 'Staubsaugen', intervall: 7, dauer: 20, pflicht: false, letzte: null, aktiv: true, laut: true },
    { id: 'bett', name: 'Bettwäsche wechseln', intervall: 14, dauer: 15, pflicht: true, letzte: null, aktiv: true },
    { id: 'waesche', name: 'Wäsche waschen', intervall: 4, dauer: 15, pflicht: true, letzte: null, aktiv: true },
    { id: 'fenster', name: 'Fenster putzen', intervall: 60, dauer: 60, pflicht: false, letzte: null, aktiv: true },
  ];
}

// Checklisten: Stichwort am Wortanfang im Termintitel -> Mitteilung zu Beginn der Ruhe vor der Abfahrt
function standardChecklisten() {
  return [
    { id: 'training', name: 'Trainingstasche', an: true,
      stichwoerter: ['training', 'sport', 'fitness', 'schwimm'],
      punkte: ['Sportsachen', 'Hallenschuhe', 'Handtuch', 'Duschzeug', 'Trinkflasche', 'Schloss'] },
    { id: 'behoerde', name: 'Behörde', an: true,
      stichwoerter: ['amt', 'behörde', 'bürgerbüro', 'bürgeramt', 'rathaus', 'finanzamt', 'zulassung', 'jobcenter', 'notar'],
      punkte: ['Personalausweis', 'Unterlagen / Formulare', 'Terminbestätigung', 'Portemonnaie', 'Kugelschreiber'] },
    { id: 'arzt', name: 'Arzt', an: true,
      stichwoerter: ['arzt', 'ärztin', 'zahnarzt', 'zahnärztin', 'hausarzt', 'klinik', 'krankenhaus', 'labor'],
      punkte: ['Versichertenkarte', 'Überweisung', 'Medikamentenliste', 'Befunde', 'Portemonnaie'] },
    { id: 'feier', name: 'Feier / Geburtstag', an: true,
      stichwoerter: ['geburtstag', 'feier', 'party', 'hochzeit', 'einladung', 'grillen'],
      punkte: ['Geschenk', 'Karte', 'Mitbringsel / Getränke', 'Portemonnaie'] },
    { id: 'reise', name: 'Reise', an: true,
      stichwoerter: ['urlaub', 'reise', 'flug', 'flughafen', 'bahnhof', 'zug'],
      punkte: ['Ausweis', 'Tickets', 'Ladekabel', 'Medikamente', 'Portemonnaie', 'Schlüssel'] },
  ];
}

// Blumen: zufällig alle 3–6 Wochen, nicht 14 Tage vor/nach festen Anlässen; Anlässe 2 Tage vorher
function standardBlumen() {
  return {
    an: true, minWochen: 3, maxWochen: 6, sperreTage: 14, dauer: 20, vorTage: 2, naechste: null,
    anlaesse: [{ name: 'Valentinstag', datum: '02-14' }, { name: 'Weltfrauentag', datum: '03-08' }],
  };
}

function istObjekt(x) { return x && typeof x === 'object' && !Array.isArray(x); }

// Gespeicherte Werte über Standardwerte legen (neue Einstellungen nach Updates bekommen Standard).
function zusammenfuehren(standard, gespeichert) {
  if (!istObjekt(gespeichert)) return standard;
  const r = { ...standard };
  for (const k of Object.keys(gespeichert)) {
    r[k] = istObjekt(standard[k]) && istObjekt(gespeichert[k])
      ? zusammenfuehren(standard[k], gespeichert[k])
      : gespeichert[k];
  }
  return r;
}

module.exports = { standardEinstellungen, standardAufgaben, standardChecklisten, standardBlumen, zusammenfuehren };
