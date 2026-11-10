# Kurzbefehle einrichten

Alles in der App **Kurzbefehle** auf dem iPhone. Neuer Kurzbefehl: oben rechts **+**.
Aktionen fügst du unten über **Nach Apps und Aktionen suchen** hinzu.
Die Scriptable-Aktion heißt je nach Sprache **Script ausführen** oder **Run Script**.

Wichtig bei der Scriptable-Aktion: auf den Pfeil **>** tippen und **Bei Ausführung anzeigen / Show When Run** ausschalten.

Namen auf iOS 27: **Suche Wecker**, **Wecker löschen**, **Wecker ein/aus**, **Neuer Wecker**. "Reisezeit abrufen" heißt **Wegzeit abrufen** (Verkehrsmittel **Radfahren** / **Auto**). Das Ergebnis von "Script ausführen" heißt **Output**. "Wiederholungsobjekt" heißt **Objekt wiederholen**, "Wiederholungsindex" heißt **Index wiederholen** (wird nicht gebraucht).

Wenn ein Name hier nicht genau so heißt wie bei dir: Nimm die Aktion, die am ähnlichsten klingt, und schreib mir den Namen. Ich passe die Anleitung an.

---

## 1. Kurzbefehl "Planer Kalender" (einmalig)

Legt die Kalender "Planer" und "Arbeit" an. Scriptable selbst kann das nicht.

1. Neuer Kurzbefehl, Name: **Planer Kalender**.
2. Aktion **Neuen Kalender hinzufügen** (auch: "Kalender hinzufügen"). Name: `Planer`. Konto: **iCloud**.
3. Noch einmal **Neuen Kalender hinzufügen**. Name: `Arbeit`. Konto: **iCloud**.
4. Aktion **App öffnen**: **Scriptable**.
5. Fertig. Einmal antippen und laufen lassen.

Falls es die Aktion nicht gibt: Kalender-App öffnen → unten **Kalender** → **Kalender hinzufügen** → **iCloud** → Name `Planer`. Dasselbe für `Arbeit`.
Gibt es "Arbeit" schon, legst du ihn nicht neu an.

---

## 2. Kurzbefehl "Planer planen"

Alles, was hier steht, gehört in **einen einzigen Kurzbefehl**. Die Teile A bis E sind nur Überschriften.

### Grundgriffe (bitte zuerst lesen)

- **Aktion hinzufügen:** unten ins Suchfeld tippen, Namen eingeben, Aktion antippen. Neue Aktionen landen **immer ganz unten**.
- **Aktion verschieben:** Aktion gedrückt halten und an die richtige Stelle ziehen.
- **In eine Wiederholung hinein:** Aktionen, die für jede Strecke laufen sollen, müssen **zwischen** "Wiederholen mit jedem Objekt" und "Wiederholung beenden" stehen. Sie sind dann etwas eingerückt. Stehen sie unter "Wiederholung beenden", sind sie falsch.
- **Text in ein Feld schreiben:** blaues Feld antippen, tippen.
- **Variable in ein Feld setzen:** Finger **länger** auf das blaue Feld halten → **Variable auswählen** → jetzt **die Aktion antippen**, deren Ergebnis du willst (die Aktionen leuchten blau auf). So erwischst du immer die richtige, auch wenn mehrere "Wörterbuchwert" heißen.
  Bei kurzem Antippen erscheint oft ein Menü; steht dort **Wiederholungsobjekt**, kannst du es direkt antippen.
- **Variable in einen Text setzen:** im Textfeld tippen, dann über der Tastatur auf **Variable auswählen** (bzw. das Variablen-Symbol) und die Aktion antippen.
- **"Wiederholungsobjekt"** = die eine Strecke, die gerade dran ist (nur **innerhalb** der Wiederholung).
  **"Wiederholungsergebnisse"** = alle Ergebnisse **nach** der Wiederholung. Nicht verwechseln.
- **Wörterbuchwert abrufen** sieht so aus: "**Wert** für **Schlüssel** in **Wörterbuch** abrufen". "Wert" bleibt so. In "Schlüssel" **tippst** du das Wort (z. B. `von`). In "Wörterbuch" setzt du eine **Variable**. Pro Aktion genau **ein** Schlüssel.

### So sieht der fertige Kurzbefehl aus (Überblick)

```
 1  Suche Wecker  (Filter: Beschriftung beginnt mit "Planer:")
 2  Wenn [Wecker aus 1] hat einen beliebigen Wert
        Wecker löschen  (Wecker aus 1)
    Sonst / Ende Wenn
 3  Script ausführen: Planer Planen  (Parameter leer)
 4  Wert für "rad" in [Ergebnis von 3] abrufen
 5  Wiederholen mit jedem Objekt in [Wörterbuchwert von 4]
 6      Wert für "von" in [Wiederholungsobjekt] abrufen
 7      Wert für "nach" in [Wiederholungsobjekt] abrufen
 8      Reisezeit abrufen: Fahrrad, von [Wert aus 6] nach [Wert aus 7]
    Wiederholung beenden
 9  Wert für "auto" in [Ergebnis von 3] abrufen
10  Wiederholen mit jedem Objekt in [Wörterbuchwert von 9]
11      Wert für "von" in [Wiederholungsobjekt] abrufen
12      Wert für "nach" in [Wiederholungsobjekt] abrufen
13      Reisezeit abrufen: Auto, von [Wert aus 11] nach [Wert aus 12]
    Wiederholung beenden
14  Text:  RAD
           [Wiederholungsergebnisse der Rad-Wiederholung]
           AUTO
           [Wiederholungsergebnisse der Auto-Wiederholung]
15  Script ausführen: Planer Planen  (Parameter: [Text aus 14])
16  Wert für "wecker" in [Ergebnis von 15] abrufen
17  Wiederholen mit jedem Objekt in [Wörterbuchwert von 16]
18      Wert für "zeit" in [Wiederholungsobjekt] abrufen
19      Wert für "name" in [Wiederholungsobjekt] abrufen
20      Neuer Wecker: Uhrzeit [Wert aus 18], Beschriftung [Wert aus 19]
    Wiederholung beenden
```

Kein "Wenn", keine eigenen Variablen, kein "Zur Variablen hinzufügen" nötig.

### Teil A: Alte Planer-Wecker löschen

1. Aktion **Suche Wecker**. In der Aktion **Filter hinzufügen** → Feld **Beschriftung** (oder "Name") → **beginnt mit** → `Planer:` tippen.
2. Aktion **Wenn**, direkt unter Schritt 1. Bedingung: lange drücken → Variable auswählen → **Suche Wecker** antippen → **hat einen beliebigen Wert**. Nur **eine** Bedingung.
   Grund: Gibt es noch keine Planer-Wecker, würde "Wecker löschen" sonst jedes Mal fragen, welche Wecker du löschen willst.
   Darin (zwischen "Wenn" und "Sonst"): Aktion **Wecker löschen**. Feld "Wecker": Variable **Wecker** aus Schritt 1 (lange drücken → Variable auswählen → "Suche Wecker" antippen).
   Hat "Wecker löschen" unter dem Pfeil **>** einen Schalter zum Bestätigen: ausschalten. "Sonst" bleibt leer.

### Teil B: Strecken holen

3. Aktion **Script ausführen** (Scriptable, auch "Run Script"). Feld Script: **Planer Planen**.
   Pfeil **>** antippen → **Show When Run / Bei Ausführung anzeigen** ausschalten.
   Feld **Parameter** leer lassen. Öffnet sich "Dateien": **Abbrechen**.

### Teil C: Fahrzeiten mit dem Rad

4. Aktion **Wörterbuchwert abrufen**. Schlüssel: `rad` tippen. Wörterbuch: Variable = Ergebnis von **Schritt 3** (lange drücken → Variable auswählen → Aktion "Script ausführen" antippen).
5. Aktion **Wiederholen mit jedem Objekt**. Feld: Variable **Wörterbuchwert** aus Schritt 4 (meist schon eingetragen).
   Es erscheinen zwei Zeilen: "Wiederholen mit jedem Objekt in …" und "Wiederholung beenden".
6. Aktion **Wörterbuchwert abrufen**, **zwischen** die beiden Zeilen ziehen. Schlüssel: `von`. Wörterbuch: **Wiederholungsobjekt**.
7. Aktion **Wörterbuchwert abrufen**, unter Schritt 6 ziehen (noch in der Wiederholung). Schlüssel: `nach`. Wörterbuch: **Wiederholungsobjekt**.
8. Aktion **Wegzeit abrufen** (früher "Reisezeit abrufen"), unter Schritt 7 ziehen (noch in der Wiederholung).
   - Verkehrsmittel antippen → **Radfahren**.
   - Start (steht meist "Aktueller Standort"): lange drücken → Variable auswählen → Aktion aus **Schritt 6** ("Wert für von") antippen.
   - Ziel: lange drücken → Variable auswählen → Aktion aus **Schritt 7** ("Wert für nach") antippen.
   Danach folgt "Wiederholung beenden".

### Teil D: Fahrzeiten mit dem Auto

9. bis 13. Genau wie 4 bis 8, nur:
   - Schritt 9: Schlüssel `auto` (Wörterbuch wieder das Ergebnis von **Schritt 3**).
   - Schritt 13: Verkehrsmittel **Auto** (kann auch "Fahren" heißen). Start = Schritt 11, Ziel = Schritt 12.
   Alles **unter** dem ersten "Wiederholung beenden", die neuen Aktionen 11–13 **in** die zweite Wiederholung.

### Teil E: Planen und Wecker stellen

14. Aktion **Text**, ganz unten. Inhalt, jede Zeile mit Return getrennt:
    - Zeile 1: `RAD` tippen.
    - Zeile 2: Variable auswählen → das **erste "Wiederholung beenden"** (Rad) antippen. Es steht dann "Wiederholungsergebnisse" im Text.
    - Zeile 3: `AUTO` tippen.
    - Zeile 4: Variable auswählen → das **zweite "Wiederholung beenden"** (Auto) antippen.
    Tippst du danach auf ein eingefügtes "Wiederholungsergebnisse" und es erscheint eine Liste mit Eigenschaften: **Reisezeit** wählen. Erscheint keine Liste: nichts tun.
15. Aktion **Script ausführen**. Script: **Planer Planen**. **Show When Run** aus.
    Parameter: Finger **lange** auf "Parameter" → **Variable auswählen** → Aktion **Text** aus Schritt 14 antippen.
16. Aktion **Wörterbuchwert abrufen**. Schlüssel: `wecker`. Wörterbuch: Ergebnis von **Schritt 15** (nicht 3!).
17. Aktion **Wiederholen mit jedem Objekt**. Feld: Wörterbuchwert aus Schritt 16.
18. Aktion **Wörterbuchwert abrufen**, in die Wiederholung ziehen. Schlüssel: `zeit`. Wörterbuch: **Wiederholungsobjekt**.
19. Aktion **Wörterbuchwert abrufen**, darunter. Schlüssel: `name`. Wörterbuch: **Wiederholungsobjekt**.
20. Aktion **Neuer Wecker**, darunter (noch in der Wiederholung).
    - Uhrzeit: lange drücken → Variable auswählen → Aktion aus **Schritt 18** ("Wert für zeit").
    - Pfeil **>** antippen → Beschriftung: Variable aus **Schritt 19** ("Wert für name").
    Nimmt das Uhrzeit-Feld keine Variable: vor Schritt 20 die Aktion **Datumsangaben aus Eingabe abrufen** mit Eingabe = Schritt 18 einfügen und deren Ergebnis als Uhrzeit nehmen.

Fertig. Ganz unten steht "Wiederholung beenden".

### Prüfen, bevor du testest

- In **Wegzeit abrufen** stehen bei "von" und "nach" die Ergebnisse der zwei Aktionen darüber (beide heißen "Wörterbuchwert") – **nie** "Objekt wiederholen" oder "Index wiederholen". Fehler "Keine Konvertierung von Wörterbuch in Standort" heißt: dort steht "Objekt wiederholen".
- Fehler **"Keine Konvertierung von Text in Standort"**: sollte nicht mehr vorkommen, weil Scriptable Orte vorher prüft. Falls doch: "Planer Update" ausführen. Nicht gefundene Orte stehen im Log ("Ort nicht gefunden").
- Fehler **"Wegzeit abrufen benötigt einen Zielort"**: Fast immer steht in Schritt 6/7 (bzw. 11/12) bei "in" **Wörterbuchwert** statt **Wiederholungsobjekt**. Dann sucht die Aktion "von"/"nach" in der ganzen Liste und findet nichts.

- Zwischen den beiden Script-Aktionen gibt es **keine** "Wenn"-Aktion.
- Jede "Wörterbuchwert abrufen" hat **einen** Schlüssel.
- In den Wiederholungen steht bei "Wörterbuch" immer **Wiederholungsobjekt**, nie "Wiederholungsergebnisse".
- "Wiederholungsergebnisse" kommt nur im Text (Schritt 14) vor.

### Erster Test

- Kurzbefehl von Hand starten (▶ unten rechts). Beim ersten Mal fragt iOS nach Erlaubnis (Standort, Wecker, Scriptable): **Immer erlauben**.
- Scriptable → **Planer** → **Log**. Dort steht "Vom Kurzbefehl erhalten: …" und für jede Strecke z. B. `"15 Min." = 15 min`.
  Steht dort **unlesbar** oder **FEHLER**: Screenshot an mich.
- Uhr-App: Wecker "Planer: In 5 min los zu …". Kalender "Planer": Aufgaben (Fahrten nur im Tagesplan der App).

Falls "Reisezeit abrufen" mit der Adresse als Text nicht klarkommt (Fehlermeldung beim Ziel): vor Schritt 8 bzw. 13 die Aktion **Adressen aus Eingabe abrufen** mit dem Wert aus Schritt 7 bzw. 12 einfügen und deren Ergebnis als Ziel nehmen (beim Start genauso).

---

## 3. Automationen

Kurzbefehle → unten **Automation** → **+** (bzw. "Neue Automation").

**Morgens 06:00**
1. **Tageszeit** → 06:00 → **Täglich**.
2. **Sofort ausführen** wählen. "Bei Ausführung benachrichtigen" aus.
3. **Weiter** → Kurzbefehl **Planer planen**.

**Abends 20:00**
Genauso, Uhrzeit 20:00.

**Beim Ankommen zuhause**
1. **Ankommen** → Ort: deine Adresse wählen.
2. Zeit: **Jederzeit**.
3. **Sofort ausführen**. "Bei Ausführung benachrichtigen" aus.
4. **Weiter** → **Planer planen**.

---

## Was passiert wann

- Der Kurzbefehl läuft automatisch um 06:00, um 20:00 und wenn du nach Hause kommst.
- Abhaken geht auf drei Wegen:
  - Mitteilung zum Blockstart: **Erledigt**, **Später**, **Heute nicht** oder **Nicht nötig** (lange auf die Mitteilung drücken, dann erscheinen die Knöpfe). Danach öffnet sich kurz Scriptable und plant direkt neu – ohne den Kurzbefehl, die Wecker bleiben.
  - Scriptable → **Planer** → **Heute** → Aufgabe antippen → Erledigt / Heute nicht / Später / Nicht nötig.
  - **Erinnerungen-App**, Liste "Planer": dort stehen die Aufgaben von heute und morgen. Abhaken genügt; der Planer liest es beim nächsten Planen ein (spätestens 06:00, 20:00 oder beim Heimkommen).
- Wecker werden nur für die nächsten 24 Stunden gestellt (Wecker kennen nur eine Uhrzeit, kein Datum).
