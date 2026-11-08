# Alltagsplaner – Projektregeln

Privates Projekt, ein Nutzer. Nutzer arbeitet nur am iPhone, ca. 4 Std./Woche.
Kommunikation: Deutsch, kurz, ohne Fachjargon. Vor dem Programmieren offene Fragen gesammelt stellen.

## 1. ZIEL

iPhone-Lösung, die wiederkehrende Alltagsaufgaben automatisch in freie Lücken des Kalenders plant,
per Mitteilung erinnert und vor jeder Abfahrt einen Wecker stellt.

## 2. TECHNIK (fest entschieden)

- Scriptable (JavaScript auf dem iPhone, iOS 27.2) + Apple Kurzbefehle. Kein Mac, kein PC, keine App-Builds, kein npm im App-Code.
- Repo ist öffentlich: NIEMALS persönliche Daten (Adressen, Namen, Termine) ins Repo. Nutzerdaten nur auf dem iPhone als JSON im Scriptable-Ordner unter `planer-daten/`.
- Kernlogik als reine Funktionen ohne Scriptable-Globals in `scripts/planer/core/`, CommonJS (`module.exports`), testbar mit Node (`TZ=Europe/Berlin node --test`). Scriptable-Code nur in Adapter-Modulen (`scripts/planer/adapter/`). Module per `importModule()`.
- Kurzbefehle nur für das, was Scriptable nicht kann: Fahrzeiten ("Reisezeit abrufen") und Wecker. Kurzbefehle lassen sich nicht als Datei liefern: Schritt für Schritt in `docs/kurzbefehle.md` beschreiben (deutsche iOS-Begriffe, Bedienung am iPhone).
- Auf dem iPhone getestet und funktionieren: Kalender lesen/schreiben, Erinnerungen, geplante Mitteilungen, Standort, Kurzbefehle-Wecker, Reisezeit mit Fahrrad.
- Kontakte funktionieren in Scriptable NICHT (Status "eingeschränkt" wird nicht erkannt) – Kontakte nicht verwenden.
- Kein Debugger: Wichtiges in `planer-daten/log.txt` protokollieren, Log in der App anzeigbar.

## 3. AUFBAU

- `scripts/Planer.js` – Hauptmenü (UITable/Alert): Ersteinrichtung, Einstellungen, Aufgaben bearbeiten, Tagesplan, "Jetzt planen", Log.
- `scripts/Planer Planen.js` – vom Kurzbefehl aufgerufen, zwei Phasen:
  (a) benötigte Strecken als JSON per `Script.setShortcutOutput` ausgeben,
  (b) Fahrzeiten empfangen, planen, Abfahrts-Wecker als JSON ausgeben.
- `scripts/Planer Aktion.js` – verarbeitet Knöpfe aus Mitteilungen (`args.queryParameters`).
- `scripts/Planer Update.js` – lädt alle Dateien laut `manifest.json` von raw.githubusercontent.com (Zweig main) in den Scriptable-Ordner. Ordner über `module.filename` bestimmen; `FileManager.iCloud()`, wenn die Datei in iCloud liegt, sonst `local()`; iCloud-Dateien vor dem Lesen herunterladen. `planer-daten/` nie anfassen.
- `scripts/planer/` – Module (`core/`, `adapter/`).
- `tests/` – Node-Tests.
- `docs/kurzbefehle.md` – Anleitung.

## 4. KALENDER

- Eigene Blöcke nur im iCloud-Kalender "Planer". Beim Neuplanen nur zukünftige Planer-Einträge löschen und neu schreiben.
- Andere Kalender nie verändern, außer "Arbeit" (siehe 5).
- Termine aller anderen Kalender gelten als belegt.
- Falls Scriptable keine Kalender anlegen kann: in der Ersteinrichtung bitten, "Planer" und "Arbeit" in der Kalender-App anzulegen.

## 5. SCHICHTEN (bis der Dienstplan-PDF-Import kommt)

- Zweiwochen-Wechsel.
  - Woche A: Mo–Do 07:00–16:00, Fr 07:00–13:00.
  - Woche B: Mo, Di, Do, Fr 08:00–16:00, Mi 08:00–13:00.
- Ersteinrichtung fragt, ob die aktuelle Woche A oder B ist.
- Feiertage Niedersachsen frei (inkl. bewegliche und Reformationstag 31.10.). Urlaub/Ausnahmen als Datumsbereiche eintragbar.
- Schichten als Termine im Kalender "Arbeit", 8 Wochen voraus, Ort = Arbeit.

## 6. PLANUNGSREGELN (Standardwerte, alle in der App änderbar)

- Verkehrsmittel: Zuhause <-> Arbeit = Fahrrad, alle anderen Strecken = Auto. Termine ohne Ort = keine Fahrt.
- Unbekannte Orte: Ort-Text des Termins als Ziel an den Kurzbefehl geben. Fahrzeiten cachen, Fallback 20 min.
- Annahme: nach jedem Termin nach Hause; reicht die Zeit nicht, direkt zum nächsten Termin (Rad, wenn der vorherige Ort Arbeit ist, sonst Auto).
- Nach dem Heimkommen 15 min Pause. Vor jeder Abfahrt 30 min Ruhe. Nutzbare Lücke mindestens 20 min.
- Aufgaben frühestens 08:00, Ende spätestens 21:00, höchstens 90 min Aufgaben pro Tag.
- Planung immer für die nächsten 7 Tage. Pflicht vor "wenn Zeit", Überfälliges zuerst.
- Abfahrts-Wecker = Abfahrt minus 5 min, Text "Planer: In 5 min los zu <Ziel>".
- Mitteilung zum Blockstart mit Knöpfen "Erledigt" und "Später".
  - Erledigt -> letzte Erledigung = heute.
  - Später oder keine Reaktion -> bleibt fällig, kommt in die nächste passende Lücke.
- Mitteilungen mit Kennung "planer-...", beim Neuplanen alte entfernen.
- Standard-Aufgaben:
  | Aufgabe | alle | Dauer | Art |
  |---|---|---|---|
  | Bad putzen | 7 Tage | 30 min | Pflicht |
  | Staubsaugen | 7 Tage | 20 min | wenn Zeit |
  | Bettwäsche wechseln | 14 Tage | 15 min | Pflicht |
  | Wäsche waschen | 4 Tage | 15 min | Pflicht |
  | Fenster putzen | 60 Tage | 60 min | wenn Zeit |
- Referenz-Test (muss als Node-Test grün sein):
  Nur Bad putzen und Staubsaugen, beide Donnerstag fällig, andere Tage ohne Lücken.
  Donnerstag: Arbeit bis 16:00, Rad 15 min -> zuhause 16:15.
  Ergo 17:00–17:45, Auto 15 min -> Abfahrt 16:45, Wecker 16:40, zuhause 18:00.
  Training 20:00, Auto 15 min -> Abfahrt 19:45, Wecker 19:40.
  Erwartet: 16:15–16:45 nichts. 18:15–18:45 Bad putzen, 18:45–19:05 Staubsaugen, ab 19:15 Ruhe.

## 7. ABLÄUFE AUF DEM IPHONE

- Kurzbefehl "Planer planen": Planer Planen (Phase a) -> für jede Strecke "Reisezeit abrufen" -> Planer Planen (Phase b) -> Wecker erstellen.
  Vorher alte Wecker, deren Name mit "Planer:" beginnt, löschen, falls die Aktion existiert, sonst ausschalten. Beide Varianten beschreiben, Nutzer testet.
- Wecker sind nur Uhrzeiten: nur Wecker für die nächsten 24 Std. stellen.
- Automationen: täglich 06:00, täglich 20:00, beim Ankommen zuhause, jeweils "Sofort ausführen".

## Umfang

Jetzt nur Version 1 (Abschnitte 1–7). Später, nicht jetzt: Checklisten (z. B. Trainingstasche, abschaltbar),
Geburtstage (Geburtstage-Kalender plus selbst eingetragene; Geschenk 2 und 1 Woche vorher, Gratulieren am Tag),
Blumen (unregelmäßig plus Weltfrauentag/Valentinstag/Jahrestag), Fristen (TÜV, Versicherungen) als Erinnerungen,
Orte lernen, Dienstplan-PDF-Import, Spracheingabe.

## Arbeitsweise

- Kleine Schritte, nach jedem Schritt Tests laufen lassen (`TZ=Europe/Berlin node --test 'tests/*.test.js'`).
- Am Ende jeder Sitzung: was der Nutzer am iPhone tun muss, Schritt für Schritt.
