# Plan Version 3 (Stand 10.11.2026)

Ziel: kostenlos, einfach, verlässlich, lernend. Alles Neue bekommt einen Ein/Aus-Schalter, Standard ist "an".

## Leitlinien

- Kostenlos: Scriptable, Kurzbefehle, iCloud, GitHub, Wetter von Open-Meteo (ohne Anmeldung, Hinweis "Wetterdaten: Open-Meteo.com" in der App), KI über die Claude-App (im Abo enthalten).
- Einfach: 6 Menüpunkte, Startbildschirm "Heute", Ersteinrichtung mit 3 Fragen, sinnvolle Standardwerte.
- Verlässlich: Wachhund-Mitteilung, Log, Tests. Die Planungsrechnung selbst benutzt nie KI.
- Lernend: nur sichtbar, nur rückgängig machbar, erst nach 3 Beobachtungen.
- Privat: Daten nur auf dem iPhone. Nach draußen gehen nur Adressen (Apple Karten), die auf 1 km gerundete Lage des Zuhauses (Wetter) und diktierte Sätze (Claude-App, nur wenn du sie benutzt).

## Was andere Apps lehren

| App | Gefällt den Nutzern | Fehlt oder stört | Für den Planer |
|---|---|---|---|
| Tody, Sweepy (Putzpläne) | Bedarf statt Datum, kein Druck, kleine Erfolge | Einrichtung mühsam | Dringlichkeit ("fällig seit 2 Tagen") statt starrer Termine; Standardwerte; kleine Erfolgsstatistik im Wochenrückblick |
| Structured | Zeitstrahl, Widget | keine Wochenansicht, Kalender nur bezahlt | Widget und Sperrbildschirm-Widget; Wochenansicht; Kalender gratis |
| Reclaim, Motion | Gewohnheiten landen automatisch im Kalender, Pufferzeiten | teuer, kein Apple-Kalender, lange Einrichtung | automatische Lücken-Planung (vorhanden), Pause/Ruhe als Puffer, kurze Einrichtung |
| Sunsama | Tagesabschluss-Ritual am Abend | alles von Hand, teuer | Tagesabschluss 20:30 mit offenen Aufgaben und Knöpfen |
| Tiimo | Routinen, Aufgaben in Schritte zerlegt, visuell | Abo, Abstürze | Schritte je Aufgabe in der Mitteilung; Wachhund und Tests gegen Ausfälle |
| Fantastical, Todoist | Eingabe in Alltagssprache | Fehldeutungen, keine Zeiterfassung | Sprache und Text immer mit Rückfrage; echte Dauer wird gelernt |

Bewusst weggelassen: Punkte und Spiele, Familienfreigabe, Pomodoro-Timer, eigene Apple-Watch-App (Mitteilungen mit Knöpfen kommen trotzdem auf die Watch), Web-Version, Chat mit der KI in der App.

## Stufe 1: Aufräumen und Verlässlichkeit

1. Hauptmenü: Heute, Jetzt planen, Aufgaben, Extras (Geburtstage, Fristen, Checklisten, Blumen), Einstellungen (Orte, Urlaub, Schichten, Ersteinrichtung), Log.
2. Heute-Bildschirm als Start: heute und morgen mit Fahrten, Aufgaben, Wecker, Wetterhinweis, Warnungen, Dringlichkeit je Aufgabe. Aufgabe antippen = Erledigt / Heute nicht / Später. Knopf "Heute keine Aufgaben".
3. Woche-Bildschirm: 7 Tage mit Schicht, Terminen, Aufgaben, freien Minuten, nächster freier Tag.
4. Erledigt, Später und Heute nicht laufen nur noch in Scriptable, ohne Umweg über den Kurzbefehl (Aufgaben ändern keine Abfahrten, also keine Wecker).
5. Fehler beheben: heutige Schicht wird auch nach Schichtbeginn eingetragen; Log wird pro Lauf gebündelt geschrieben.
6. Wachhund: Fällt der 06:00-Lauf aus, kommt um 07:30 "Planer lief heute nicht".
7. Update-Hinweis: einmal täglich prüfen, ob es eine neue Version gibt.
8. Urlaub, frei, krank aus ganztägigen Kalendereinträgen erkennen. Krank = keine Schicht und keine Aufgaben.
9. Erinnerungen-Liste "Planer" mit Datum (sichtbar unter "Heute").
10. Aufgabenmenge nach Tagesart: Arbeitstag höchstens 60 min, freier Tag 120 min. Aufgaben über 45 min bevorzugt an freien Tagen.
11. Sicherung: "Daten sichern" teilt eine Datei, "Wiederherstellen" liest sie. iCloud sichert ohnehin.

## Stufe 2: Alltag

12. Aufstehwecker 60 min vor der ersten Abfahrt, nur bei Abfahrt vor 10:00. Name "Planer: Aufstehen".
13. Tagesabschluss 20:30 als Mitteilung: offene Aufgaben von heute, Aufstehzeit und Bettzeit (8 Std.) für morgen. Knöpfe "Alles erledigt" und "Rest morgen".
14. Morgen-Überblick zur Aufstehzeit: Schicht, Termine mit Abfahrt, Aufgaben.
15. Regen ab 60 % zur Abfahrtszeit: Auto statt Rad, Abfahrt angepasst, Hinweis abends und morgens. Fürs Pendeln werden Rad- und Auto-Fahrzeit abgefragt.
16. Widget mittel (Tagesplan) und Sperrbildschirm-Widget (nächste Abfahrt, nächste Aufgabe). Tippen öffnet die App.
17. Automation "Beim Verlassen von Zuhause": echte Abfahrt merken (für das Lernen).
18. Schritte je Aufgabe, optional: erscheinen in der Mitteilung und im Heute-Bildschirm (Standard nur bei "Bad putzen": Waschbecken, Dusche, WC, Boden).
19. Optional, Standard aus: Hinweis am Ende eines Blocks ("Zeit um, fertig?").

## Stufe 3: Dienstplan-PDF

20. PDF teilen an Scriptable. Das Leseprogramm (pdf.js, frei) wird einmal geladen und dann offline gespeichert. Der Weg ist erprobt (scriptable-pdfjs), die Spaltenerkennung wird selbst gebaut.
21. Deine Zeile wird über den Namen aus den Einstellungen gefunden. Farbige oder leere Tage = frei. Beginn und Ende je Tag, Pausen ignoriert.
22. Kontrollansicht vor dem Speichern, dann Schichten in "Arbeit". Danach läuft das A/B-Muster als Schätzung weiter.
23. Teamtag mit Datum im Kopf: Hinweis, Uhrzeit trägst du als Termin ein.

## Stufe 4: Lernen

24. Gedächtnis auf dem iPhone, 1 Jahr: geplant, erledigt, später, heute nicht, abgehakt, Abfahrt, Ankunft.
25. Automatisch nach 3 Beobachtungen: echte Dauer, Fahrzeit je Strecke, gute und schlechte Uhrzeiten und Wochentage je Aufgabe.
26. Nur als Vorschlag: Abstände ändern (z. B. Wäsche alle 5 statt 4 Tage).
27. Bildschirm "Gelernt" mit Rückgängig je Anpassung.
28. Wochenrückblick sonntags 18:00: erledigt-Quote, liegen geblieben, echte Dauern, Serien, Vorschläge zum Bestätigen.

## Stufe 5: Sprache und Text

29. Kurzbefehl "Planer sagen": Diktieren, dann die Claude-App (Aktion "Claude fragen", iOS 18+, im Abo enthalten) übersetzt den Satz in ein festes Format, Scriptable prüft und fragt zurück, speichert, plant neu. Ohne Claude (offline, kein Abo): feste Satzmuster. Mit Siri ganz ohne Hände: "Hey Siri, Planer sagen".
30. Schnell eintippen in der App mit derselben Verarbeitung.
31. Verstanden werden: Erledigt, Später, Heute nicht, neue Aufgabe, Termin (Kalender wird beim ersten Mal gewählt), Urlaub/frei/krank, Frist, Geburtstag, Besorgung (unterwegs), "Heute keine Aufgaben", Notiz für den Planer.
32. Fallback: Gibt die Claude-Aktion in Kurzbefehlen ihre Antwort nicht sauber weiter, Claude über Zugangsschlüssel (Cent-Beträge, Schlüssel nur auf dem iPhone).
