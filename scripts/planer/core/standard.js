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
    verkehr: { zuhauseArbeit: 'Fahrrad', direktVonArbeit: 'Fahrrad', sonst: 'Auto' },
    regeln: {
      pauseNachHeim: 15,
      ruheVorAbfahrt: 30,
      minLuecke: 20,
      tagStart: '08:00',
      tagEnde: '21:00',
      maxProTag: 90,
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
      ausnahmen: [],
    },
  };
}

function standardAufgaben() {
  return [
    { id: 'bad', name: 'Bad putzen', intervall: 7, dauer: 30, pflicht: true, letzte: null, aktiv: true },
    { id: 'saugen', name: 'Staubsaugen', intervall: 7, dauer: 20, pflicht: false, letzte: null, aktiv: true },
    { id: 'bett', name: 'Bettwäsche wechseln', intervall: 14, dauer: 15, pflicht: true, letzte: null, aktiv: true },
    { id: 'waesche', name: 'Wäsche waschen', intervall: 4, dauer: 15, pflicht: true, letzte: null, aktiv: true },
    { id: 'fenster', name: 'Fenster putzen', intervall: 60, dauer: 60, pflicht: false, letzte: null, aktiv: true },
  ];
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

module.exports = { standardEinstellungen, standardAufgaben, zusammenfuehren };
