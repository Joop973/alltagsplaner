# Kurzbefehle einrichten

Alles in der App **Kurzbefehle** auf dem iPhone. Neuer Kurzbefehl: oben rechts **+**.
Aktionen fügst du unten über **Nach Apps und Aktionen suchen** hinzu.
Die Scriptable-Aktion heißt je nach Sprache **Script ausführen** oder **Run Script**.

Wichtig bei der Scriptable-Aktion: auf den Pfeil **>** tippen und **Bei Ausführung anzeigen / Show When Run** ausschalten.

Wecker-Aktionen auf iOS 27: **Suche Wecker**, **Wecker löschen**, **Wecker ein/aus**, **Neuer Wecker**.

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

Name exakt: **Planer planen** (wird von der App so aufgerufen).

### Teil A: Alte Planer-Wecker entfernen

1. Aktion **Suche Wecker**. In der Aktion **Filter hinzufügen** antippen → Feld **Beschriftung** (oder "Name") → **beginnt mit** → `Planer:`.
2. Aktion **Wecker löschen**. Wecker: **Wecker** (Ergebnis von Schritt 1).
   Fragt die Aktion bei jedem Lauf nach Bestätigung: auf den Pfeil **>** tippen und **Vor dem Ausführen bestätigen** (o. ä.) ausschalten, falls es das gibt.
3. Schritte 3–5 entfallen.

Falls "Suche Wecker" keinen Filter anbietet: **Suche Wecker** ohne Filter → **Wiederholen mit jedem Objekt** in **Wecker** → darin **Wenn** **Wiederholungsobjekt** → **Beschriftung** → **beginnt mit** `Planer:` → im "Wenn"-Teil **Wecker löschen** mit **Wiederholungsobjekt**.

Falls "Wecker löschen" nicht geht: statt dessen **Wecker ein/aus** → **Aus**. Dann sammeln sich ausgeschaltete Planer-Wecker in der Uhr-App.

### Teil B: Strecken holen (Phase a)

6. Aktion **Script ausführen** (Scriptable). Script: **Planer Planen**. Das Feld **Parameter** leer lassen (leer = Phase a). Öffnet sich beim Antippen "Dateien": einfach **Abbrechen**.
7. Aktion **Wörterbuchwert abrufen**: **Wert** für Schlüssel `strecken` in **Script-Ergebnis** (Ausgabe von Schritt 6).
8. Aktion **Text**: `start`.
9. Aktion **Zur Variablen hinzufügen**: Text → Variable neu, Name `Zeiten`.

### Teil C: Fahrzeiten abfragen

10. Aktion **Wiederholen mit jedem Objekt** in **Wörterbuchwert** (Schritt 7).
11. Darin vier Mal **Wörterbuchwert abrufen** aus **Wiederholungsobjekt**, Schlüssel: `id`, `von`, `nach`, `modus`.
    Tipp: Nach jeder Aktion die Ausgabe antippen → **Umbenennen** → `id`, `von`, `nach`, `modus`. Dann findest du sie leichter.
12. Aktion **Wenn**: **modus** → **ist** → `Fahrrad`.
13. Im "Wenn"-Teil: Aktion **Reisezeit abrufen**. Verkehrsmittel: **Fahrrad**. Start ("von"): Variable **von**. Ziel: Variable **nach**.
14. Im "Sonst"-Teil: Aktion **Reisezeit abrufen**. Verkehrsmittel: **Auto** (bzw. "Fahren"). Start: **von**. Ziel: **nach**.
15. Nach "Ende Wenn": Aktion **Text**: Variable **id**, dann ein `|` tippen, dann Variable **Wenn-Ergebnis**.
    Wenn du beim Antippen von "Wenn-Ergebnis" eine Auswahl bekommst, nimm **Reisezeit**.
16. Aktion **Zur Variablen hinzufügen**: **Text** → Variable **Zeiten**.
17. Ende der Wiederholung.

### Teil D: Planen (Phase b) und Wecker stellen

18. Aktion **Text kombinieren**: **Zeiten** mit **Neue Zeile**.
19. Aktion **Text**: `b`, dann **Neue Zeile** (Return), dann **Kombinierter Text**.
20. Aktion **Script ausführen** (Scriptable). Script: **Planer Planen**. Parameter: **Text** (Schritt 19).
    So kommt die Variable ins Feld: den Finger **länger auf "Parameter" halten** → **Variable auswählen** → die Ausgabe **Text** von Schritt 19 antippen.
    Nur kurz antippen öffnet "Dateien" – das ist falsch. Gibt es ein Feld **Texts**, geht die Variable auch dort hinein.
21. Aktion **Wörterbuchwert abrufen**: Schlüssel `wecker` in **Script-Ergebnis** (Schritt 20).
22. Aktion **Wiederholen mit jedem Objekt** in diesem Wörterbuchwert.
23. Darin: **Wörterbuchwert abrufen** `zeit` aus **Wiederholungsobjekt**, umbenennen in `zeit`.
24. Darin: **Wörterbuchwert abrufen** `name` aus **Wiederholungsobjekt**, umbenennen in `name`.
25. Darin: Aktion **Neuer Wecker**. Uhrzeit: Variable **zeit**. Beschriftung: Variable **name**.
    Variable einsetzen: Finger länger auf das Feld halten → **Variable auswählen**.
    Nimmt das Uhrzeit-Feld keine Variable an: vorher **Datumsangaben aus Eingabe abrufen** mit **zeit** einfügen und dessen Ergebnis nehmen.
26. Ende der Wiederholung. Fertig.

### Erster Test

- Kurzbefehl einmal von Hand starten. Beim ersten Mal fragt iOS nach Erlaubnis (Standort, Wecker, Scriptable). Alles **erlauben** bzw. **Immer erlauben**.
- Danach in Scriptable **Planer** → **Log** öffnen. Dort steht für jede Strecke, was "Reisezeit abrufen" geliefert hat, z. B. `"15 Min." = 15 min`.
  Steht dort **unlesbar**, schick mir die Zeile.
- In der Uhr-App müssen Wecker mit "Planer: In 5 min los zu ..." stehen. Im Kalender "Planer" stehen Aufgaben und Fahrten.

Falls "Reisezeit abrufen" mit der Adresse als Text nicht klarkommt: vor Schritt 13 und 14 die Aktion **Adressen aus Eingabe abrufen** mit **von** bzw. **nach** einfügen und deren Ergebnis als Start/Ziel nehmen.

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
- Tippst du in einer Planer-Mitteilung auf **Erledigt** oder **Später**, öffnet sich kurz Scriptable, dann startet "Planer planen" von selbst.
- Wecker werden nur für die nächsten 24 Stunden gestellt (Wecker kennen nur eine Uhrzeit, kein Datum).
