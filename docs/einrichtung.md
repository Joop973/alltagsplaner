# Einrichtung am iPhone – Checkliste (Version 3.2)

Abhaken, was schon erledigt ist. Ausführliche Kurzbefehl-Schritte: `docs/kurzbefehle.md`.

## Schon erledigt (Stand 09.11.)
- [x] Scriptable: "Planer Update" angelegt, Ersteinrichtung gemacht
- [x] Kalender "Planer" und "Arbeit"
- [x] Kurzbefehl "Planer planen"
- [x] Automationen 06:00, 20:00, Ankommen zuhause

## Jetzt (ca. 45 Minuten)

### 1. Neue Version laden (2 min)
1. Scriptable → **Planer Update** antippen. Oben muss **Version 3.2.0** stehen.
2. Kurzbefehl **Planer planen** einmal starten.
3. Neue Nachfragen von iOS (Erinnerungen, Mitteilungen, Standort) mit **Erlauben** bzw. **Immer** bestätigen.

### 2. Kurz durchsehen (5 min)
1. Scriptable → **Planer** → **Heute**: Stimmt dein Tag?
2. **Woche**: Stimmen Schichten und freie Tage?
3. Uhr-App: Wecker "Planer: Aufstehen" und "Planer: In 5 min los zu …".
4. Planer → **Log**: Steht dort "FEHLER" oder "Ort nicht gefunden"? Dann Screenshot an Claude.

### 3. Widget (3 min)
1. Home-Bildschirm lange drücken → **Bearbeiten** → **Widget hinzufügen** → **Scriptable** → mittlere Größe.
2. Widget antippen → Script **Planer Widget** → "When Interacting": **Run Script**.
3. Optional Sperrbildschirm: Sperrbildschirm lange drücken → **Anpassen** → Feld unter der Uhr → Scriptable → Script **Planer Widget**.

### 4. Automation "Verlassen" (3 min)
Kurzbefehle → **Automation** → **+** → **Verlassen** → deine Adresse → **Sofort ausführen** → neuer leerer Kurzbefehl → **Script ausführen** → **Planer Abfahrt** → Show When Run **aus**.

### 5. Kurzbefehl "Planer sagen" (15 min)
Siehe `docs/kurzbefehle.md` Abschnitt 5. Danach testen: "Hey Siri, Planer sagen" → "Milch auf die Einkaufsliste".

### 6. Dienstplan einlesen (5 min)
Dienstplan-PDF → Teilen → Scriptable → **Planer Dienstplan** → Name eingeben → Vorschau prüfen → Übernehmen.

### 7. Einstellen nach Bedarf (10 min)
- Erinnerungen-App: Liste **Einkauf** (falls nicht da) – dort oder per Siri Sachen eintragen.
- Planer → **Extras**: Medikamente, Geburtstage (Geschenk antippen), Fristen (Vorlagen!), Blumen (Jahrestag, Geburtstag), Checklisten.
- Planer → **Einstellungen**: Urlaub/krank, Ruhezeiten (Option), Wecker/Abend/Morgen, Müll (Option).
- Planer → **Aufgaben** → **+ Aus Vorlage** für weitere Haushaltsaufgaben.

## Danach im Alltag
- Mitteilungen lange drücken: Erledigt / Später / Heute nicht / Nicht nötig.
- Abends 20:30 Tagesabschluss, morgens Überblick, sonntags 18:00 Wochenrückblick.
- Nach ein paar Wochen: Planer → Aufgaben → **Gelernt** (Vorschläge bestätigen oder ablehnen).
- Neue Version: Mitteilung "Update verfügbar" → Scriptable → Planer Update.
