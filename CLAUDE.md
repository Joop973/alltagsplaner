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
- Kurzbefehle nur für das, was Scriptable nicht kann: Wecker (seit 3.6 rechnet Scriptable die Fahrzeiten selbst über OpenStreetMap-Routing, Nutzerwunsch 12.11.; "Wegzeit abrufen" war im Hintergrund zu langsam -> Zeitlimit). Kurzbefehle lassen sich nicht als Datei liefern: Schritt für Schritt in `docs/kurzbefehle.md` beschreiben (deutsche iOS-Begriffe, Bedienung am iPhone).
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

- Kurzbefehl "Planer planen" (seit 3.6): alte Planer-Wecker löschen -> Script "Planer Planen" (Parameter = Kurzbefehleingabe, plant alles inkl. Fahrzeiten) -> "wecker" -> Neuer Wecker. Automation "Ankommen" gibt "heim" als Eingabe. Alter zweiphasiger Kurzbefehl läuft weiter (Phase a gibt leere rad/auto zurück, Phase b liefert nur die Wecker des eben erstellten Plans).
  Vorher alte Wecker, deren Name mit "Planer:" beginnt, löschen, falls die Aktion existiert, sonst ausschalten. Beide Varianten beschreiben, Nutzer testet.
- Wecker sind nur Uhrzeiten: nur Wecker für die nächsten 24 Std. stellen.
- Automationen: täglich 06:00, täglich 20:00, beim Ankommen zuhause, jeweils "Sofort ausführen".

## Umfang

Version 1 (Abschnitte 1–7) fertig. Version 2 (Fragerunde 09.11.2026), in dieser Reihenfolge:
1. Geburtstage (fertig), 2. Fristen (fertig), 3. Checklisten (fertig), 4. Blumen (fertig),
5. Orte lernen (fertig, einfache Mischung), 6. Dienstplan-PDF-Import (offen), 7. Spracheingabe (offen).
Version 3 (Plan in docs/plan.md) komplett gebaut (11.11.2026, Version 3.2.0; seit 3.3.0 OSM-Adresssuche + Termin verschieben; 3.5 Anzeige; 3.6 Fahrzeiten selbst, früher zuhause, Randbemerkungen): Stufe 1–5 + Extras. Noch nichts davon am iPhone getestet. Checkliste für den Nutzer: docs/einrichtung.md.

## Arbeitsweise

- Kleine Schritte, nach jedem Schritt Tests laufen lassen (`TZ=Europe/Berlin node --test 'tests/*.test.js'`).
- Am Ende jeder Sitzung: was der Nutzer am iPhone tun muss, Schritt für Schritt.
- Direkt auf main arbeiten (Nutzer hat zugestimmt); `Planer Update.js` lädt von main.
- `tests/scriptable-simulation.test.js` simuliert Scriptable und lässt die echten iPhone-Scripts laufen. Neue Scriptable-Funktionen dort nachbilden.
- Neue Script-Dateien in `manifest.json` eintragen (ein Test prüft das).

## Entscheidungen (Fragerunde 08.11.2026)

- Adressen Zuhause/Arbeit: in der Ersteinrichtung eintippen oder aktuellen Standort nehmen. Nur auf dem iPhone.
- Schicht-Termine: Ort = echte Arbeitsadresse.
- Ort-Erkennung: Termin ohne Ort = zuhause. Sonst steht immer etwas im Ort: gespeicherte Adresse oder Stichwort ("zuhause", "arbeit") erkennt den Ort, alles andere = fremder Ort.
- Fahrzeiten: nur neue oder über 30 Tage alte Strecken abfragen. Phase (a) fragt alle möglichen Strecken ab (heim, hin, direkt).
- Ganztägige Termine werden ignoriert; Kalender können in den Einstellungen ignoriert werden.
- Kalender "Arbeit": nur selbst angelegte Einträge (Notiz enthält "planer-schicht") werden geändert.
- Kalender "Planer": nur Aufgaben (Nutzerwunsch 09.11.: Fahrten nicht einzeln im Kalender; Schalter "Fahrten im Kalender" in den Einstellungen, Standard aus). Pause/Ruhe nicht. Beim Neuplanen alle noch nicht beendeten Einträge löschen. Einträge von gestern und früher (Notiz mit "planer-") werden bei jedem Planen gelöscht, heutige bleiben bis Mitternacht (Nutzerwunsch 11.11.).
- Kalender anlegen: Scriptable kann das nicht. Lösung: Kurzbefehl "Planer Kalender" ("Neuen Kalender hinzufügen"), Fallback von Hand.
- 24.12. und 31.12. sind frei (einstellbar als "weitere freie Tage").
- Vorziehen erlaubt: Ist am Fälligkeitstag kein Platz, bis zu 2 Tage früher (einstellbar), danach später.
- Mehrfach fällige Aufgaben in 7 Tagen (z. B. Wäsche) werden mehrfach geplant, als wäre der vorige Termin erledigt.
- Ersteinrichtung fragt die letzte Erledigung je Aufgabe.
- Pflicht ohne Platz: Hinweis im Tagesplan und Mitteilung (nur wenn sich die Warnung ändert).
- Aufgaben nur, wenn zuhause; freie Tage/Urlaub: 08:00–21:00 frei.
- Erledigt/Später: sofort neu planen (Kurzbefehl "Planer planen" wird gestartet). Später = nicht vor Ende des alten Blocks, mindestens 30 min.
- Wecker auch für den Weg zur Arbeit. Kein Wecker für Heimfahrten.
- Wecker-Aktionen auf dem iPhone (iOS 27): "Suche Wecker", "Wecker löschen" (vorhanden -> löschen statt ausschalten), "Wecker ein/aus", "Neuer Wecker".
- Scriptable-Aktion "Script ausführen": kurzes Antippen von "Parameter" öffnet Dateien; Variablen per langem Drücken -> "Variable auswählen". Phase a braucht keinen Parameter.
- Kurzbefehl so einfach wie möglich halten (Nutzer baut ihn von Hand): Phase a gibt getrennte Listen "rad" und "auto" mit {von, nach} aus; zwei Wiederholungen ohne "Wenn"; Rückgabe als ein Text "RAD"/Fahrzeiten/"AUTO"/Fahrzeiten (Zuordnung über die Reihenfolge, leere Zeilen werden übersprungen).
- "Wegzeit abrufen" bricht den ganzen Kurzbefehl ab, wenn ein Ort nicht gefunden wird. Darum prüft Phase a alle Orte vorher mit der OpenStreetMap-Suche (Nominatim, 1 Anfrage/s, User-Agent; Scriptable hat KEIN Location.geocode – war bis 3.2.2 ein Fehler, Nutzer hat OSM am 11.11. zugestimmt) (Suchvarianten: ganzer Text, ohne Klammern/Präfix, ohne "/…", nur PLZ+Ort) und gibt nur gefundene Adressen weiter; nicht gefundene: Fallback-Zeit + Log-Warnung mit Fehlertext. Seit 3.3.2: An "Wegzeit abrufen" gehen nur sichere Orte (Zuhause/Arbeit wie eingestellt, von Hand, per Standort gelernt), weil OSM-Adressen "Keine Konvertierung von Text in Standort" auslösten (11.11. 20:00); nur per OSM gefundene Orte: Fahrzeit aus Luftlinie geschätzt (x1,3; Rad 15 km/h +2, Auto 45 km/h +4), Schätzung gilt nur einen Tag (fahrzeiten.json geschaetzt).
- Orte lernen (planer-daten/orte.json, Nutzerwunsch "Mischung"): Treffer 180 Tage gemerkt; Fehlschläge NICHT gemerkt, aber im Hintergrund höchstens einmal am Tag neu gesucht und insgesamt höchstens 15 s Suche (in der App sofort); läuft ein Termin an einem nicht gefundenen Ort gerade, wird der aktuelle Standort als Adresse gelernt; Menü "Gelernte Orte": Adresse eintippen, "Ich bin gerade dort", ignorieren, vergessen; beim Öffnen werden offene Orte im Vordergrund neu gesucht.
- "Wecker löschen" fragt nach, wenn "Suche Wecker" nichts findet -> in "Wenn [Wecker] hat einen beliebigen Wert" einpacken.
- Abhaken (Nutzerwunsch 09.11., A+B): (A) im Tagesplan Aufgabe antippen -> Erledigt / Heute nicht / Später, danach sofort neu planen. (B) Aufgaben von heute+morgen als Erinnerungen in Liste "Planer" (ohne Fälligkeitsdatum, damit keine doppelte Mitteilung); beim Planen werden abgehakte eingelesen (letzte = Abhak-Datum), dann alle eigenen gelöscht und neu angelegt. Schalter in den Einstellungen.
- "Heute nicht" (Mitteilung, Tagesplan): frühestens morgen 00:00 neu einplanen.

## Entscheidungen Version 2 (Fragerunde 09.11.2026)

- Geburtstage: Kalender "Geburtstage" (lesbar, obwohl Kontakte nicht gehen) + eigene Einträge (geburtstage.json). Geschenk nur für markierte Personen: einmalige Pflicht-Aufgabe 30 min ab 14 Tage vorher, spätestens Vortag, plus Mitteilung 7 Tage vorher, falls offen. Gratulieren: Mitteilung am Tag um 06:00.
- Fristen (fristen.json): Name, Datum, Wiederholung in Monaten (0 = einmalig), Vorlauf in Wochen (Standard 4 und 1). Erinnerungen-Liste "Fristen" mit Fälligkeitsdatum; abhaken = erledigt -> nächstes Datum. Dazu Pflicht-Aufgabe 15 min ab erstem Vorlauf und Mitteilungen 06:00 je Vorlauf und am Tag.
- Checklisten (checklisten.json, Standardlisten Training/Behörde/Arzt/Feier/Reise, in der App änderbar, je an/aus): Stichwort am Wortanfang im Termintitel -> eine Mitteilung mit der Liste zu Beginn der Ruhe vor der Abfahrt.
- Blumen (blumen.json): zufällig alle 3–6 Wochen (wenn Zeit), nicht 14 Tage vor/nach festen Anlässen; Anlässe (Valentinstag, Weltfrauentag, eigene wie Jahrestag/Geburtstag) Pflicht ab 2 Tage vorher bis zum Tag. Als Unterwegs-Aufgabe: auf dem Heimweg direkt nach einem auswärtigen Termin (bis 19:00) oder morgens an Tagen ohne Arbeit; sonst normale Lücke.
- Einmalige Aufgaben: Felder einmalig, faellig, bis, unterwegs, vorziehen. Status getrennt in sonderstatus.json (IDs beginnen mit geschenk-/frist-/blumen-).
- Dienstplan-PDF: Spalten = Werktage mit Datum, je Person 4 Zeilen (Beginn, Pause von, Pause bis, Ende; ohne Pause nur Beginn + Ende). Nutzer-Zeile per Name (in der App einstellbar, nie im Repo). Farbig/leer = Urlaub oder frei. PDF enthält Namen von Kolleginnen: NIE ins Repo, auch nicht als Testdatei.

## Entscheidungen Version 3 (10./11.11.2026)

- Hauptmenü: Heute, Woche, Jetzt planen, Aufgaben, Extras, Einstellungen, Log. Heute-Bildschirm mit "Ich habe jetzt Zeit", "Heute keine Aufgaben", "Rückstand auflösen", "Neu planen".
- Knöpfe (Mitteilung, Heute) planen direkt in Scriptable neu, ohne Kurzbefehl; Wecker bleiben (plan.json behält die zukünftigen).
- Tagesgrenzen: Arbeitstag 08:00, höchstens 60 min; freier Tag ab 09:30, höchstens 120 min; Aufgaben > 45 min bevorzugt an freien Tagen (bis 3 Tage nach Fälligkeit).
- Ganztägige Kalendertermine: Stichwörter frei/krank/abwesend (einstellbar). krank und abwesend = keine Schicht, keine Aufgaben. Auch als Zeitraum in der App (ausnahmen mit art).
- Schicht-Abgleich mit Aufzeichnung (zustand.json schichtRec): Von Hand geänderte/verschobene/gelöschte Schichten bleiben; "Einzelne Schicht ändern" in der App geht vor. Heutige Schicht wird auch nach Beginn eingetragen.
- Planer-Blöcke im Kalender verschoben = fest (Notiz "|fest"). Planruhe: Blöcke bleiben an ihrer Zeit, solange sie passen (abschaltbar).
- Ruhezeiten für laute Aufgaben: Option, Standard aus (Nutzerwunsch). Besorgungen nie sonn-/feiertags (Schalter).
- "Nicht nötig": zählt nicht als erledigt, Abstand neu ab heute (Feld basis). Rückstand auflösen = alles Überfällige "nicht nötig".
- Folgeaufgaben (Wäsche aufhängen 120 min nach Erledigt, 3 Erinnerungen, Wäsche nur, wenn danach noch zuhause und vor 21:00 fertig).
- Einkaufsliste = Erinnerungen-Liste "Einkauf"; Besorgung ab 5 Sachen, nach 3 Tagen oder bei "!"; Erledigt hakt die Liste ab (Nutzerwunsch: doch einbauen).
- Medikamente (medikamente.json, Nutzerwunsch: doch einbauen): Mitteilung mit "Genommen", Nachfrage nach 30 min, 2 Tage voraus, Vorrat, Apotheke als Besorgung.
- Müllabfuhr: Option aus abonniertem Abfallkalender (Nutzer braucht es nicht, optional).
- Terminprüfung (Fahrzeit reicht nicht), Ort aus Titel (nach 2 gleichen Orten), Vorlagen (Aufgaben, Fristen), Saison (monate).
- Wachhund 07:30, Update-Hinweis (planer/version.json vom Update-Script, Manifest-Version erhöhen!), Log gebündelt, Sicherung über DocumentPicker.
- KI: iPhone 15 ohne Apple Intelligence. Claude-App bietet in Kurzbefehlen "Claude fragen" (Screenshot 11.11.) – legt aber je Aufruf einen neuen Chat an, darum seit 12.11. nicht mehr im Standard-Kurzbefehl.
- Stufe 2: Aufstehwecker (Planer: Aufstehen, 60 min vor erster Abfahrt vor 10:00, über den bestehenden Kurzbefehl), Tagesabschluss 20:30 (offen + Aufstehen + Bettzeit 8 Std., Knopf "Alles erledigt"), Morgen-Überblick zur Aufstehzeit, Regen ab 60 % = Auto statt Rad (Open-Meteo, Lage gerundet in zustand.heimKoord, Wetter 2 Std. gemerkt; Phase a fragt zu jeder Rad-Strecke die Auto-Strecke mit ab), Widget "Planer Widget" (Home + Sperrbildschirm), Script "Planer Abfahrt" für Automation "Verlassen" (Gedächtnis), Hinweis am Blockende (Option, aus).
- Stufe 3 Dienstplan: pdf.js 3.11.174 (UMD, cdnjs/jsDelivr) einmal nach "planer-pdfjs/" geladen, in WebView ohne Worker (pdf.worker.min.js in die Seite geladen -> pdfjsWorker, Hauptthread); evaluateJavaScript muss mit "0;" enden (sonst iOS-Fehler "Nicht unterstützter Typ"); Script "Planer Dienstplan" (Teilen-Menü, share-sheet-inputs: file-url). Parser core/dienstplan.js: Datumsspalten aus Kopfzeile, Personenblock bis zum nächsten Namen (Grenze halbe Zeilenhöhe – Namen stehen leicht unter der ersten Uhrzeit), erste/letzte Uhrzeit je Spalte, leer = frei. Am echten Plan geprüft (nur lokal, nie ins Repo). Reihenfolge: App-Änderung > Dienstplan > A/B-Muster. Name in einstellungen.dienstplan.name.
- Stufe 4 Lernen (core/lernen.js, lernen.json): einmal täglich; Dauer automatisch bis ±50 % (Zeit Start bis "Erledigt", < 3 min zählt nicht), Abstand nur Vorschlag, Tageszeiten meiden automatisch (3-mal verschoben, nie erledigt), Abfahrts-Verspätung als Hinweis; Rückgängig/Ablehnen sperrt 60 Tage; Wochenrückblick So 18:00.
- Fahrzeiten (13.11., Version 3.6): adapter/routing.js, FOSSGIS-OSRM routing.openstreetmap.de (routed-car/-bike), 1 Anfrage/s, User-Agent; Puffer regeln.pufferAuto 3 / pufferRad 1; Cache 30 Tage (quelle osm); Fehler -> Luftlinie (geschaetzt, 1 Tag) -> fallbackMin. Im Hintergrund je höchstens 6 s Adresssuche und 6 s Routing (Routing ohne Pause), Rest beim nächsten Lauf. Koordinaten in orte.json (lat/lon), auch für von Hand eingetragene Adressen.
- Früher zuhause (13.11.): Parameter "heim" -> zustand.heimAb; heute laufende Termine woanders enden für die Planung um heimAb minus Heimweg (core/alltag fruehHeim; Kalender bleibt). "Planer Abfahrt" (Verlassen) setzt heimAb zurück. Gilt für jeden auswärtigen Termin (Nutzerwunsch).
- Randbemerkungen (13.11.): Einladungen anderer ohne Zusage (attendees: isCurrentUser, status != accepted, role != chair) blockieren nichts (keine Fahrt, kein Wecker); plan.json infos; nur im Widget ("Info: …") und im Morgen-Überblick (Nutzerwunsch). Zugesagt = normaler Termin.
- Anzeige (12.11., Nutzer neurodivergent; Wunsch: alles außer "nur das Nächste", Home + Sperrbildschirm, gedämpft ruhig dunkel): core/ansicht.js (Farben nach Okabe-Ito gedämpft, SF-Symbole je Aufgabe, Abschnitte inkl. Pause/Ruhe, jetztUndDanach, geschafftAm) + adapter/zeichnen.js (DrawContext: Zeitleiste, Balken, Ring, Farbmarke). Widget alle Größen inkl. accessoryRectangular/Circular/Inline, Seit 3.6.1 KEINE mitlaufende Uhr (addDate/applyTimerStyle zählte nach Ablauf hoch, "23:50:48", weil iOS Sperrbildschirm-Widgets stundenlang nicht neu zeichnet): feste Uhrzeiten ("bis 16:00 · dann …", Sperrbildschirm "noch X (Stand HH:MM)"), refresh 15 min. Heute/Woche in der App dunkel mit Zeitleiste und Farbmarken (UITable kann SF-Symbole nicht einfärben -> Farbmarken), "Mehr"-Bereich unten. Freundliche Texte ("Noch ohne Platz", "Bitte kurz ansehen") statt Rot. Knopf "5 Minuten anfangen" (Mitteilung, Kennung fuenf-planer-… überlebt Neuplanen). Erfolgs-Mitteilung mit Ton piano_success "Geschafft: … – heute schon N" (einst.anzeige.erfolg), Tagesabschluss nennt "Heute geschafft". Simulation: strenge Oberflächen-Nachbildung (oberflaeche/streng) wirft bei nicht existierenden Scriptable-Funktionen.
- Stufe 5 Sprache (core/sprache.js): Kurzbefehl "Planer sagen" = Diktieren -> Text "DIKTAT: …" -> Script "Planer Sprache" (Show When Run AN, Rückfrage). Seit 12.11. OHNE Claude (Nutzerwunsch, sonst ein neuer Chat je Satz); "Claude fragen" (CLAUDE_ANWEISUNG, Zeile "CLAUDE: …") nur noch optional in der Anleitung. Über Siri ohne gewählten Kalender: Calendar.defaultForEvents(). Datum/Uhrzeit rechnet immer Scriptable. Ohne/fehlerhafte Claude-Antwort: feste Satzmuster. Termine in den beim ersten Mal gewählten Kalender (einstellungen.sprache.kalender). Termine verschieben/ändern per Sprache (aktion aendern) in ALLEN Kalendern erlaubt (Nutzer 11.11.), Dauer bleibt, mit Rückfrage; kann kein Fenster gezeigt werden (Siri: config.runsWithSiri, schon new Alert() wirft "Alerts are not supported in Siri") -> ohne Rückfrage ausführen + Mitteilung "Planer: Erledigt" (Nutzerwunsch: sofort ändern). Siri: erst "Planer sagen", dann sprechen.
