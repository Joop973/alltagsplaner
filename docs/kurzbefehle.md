# Kurzbefehle einrichten

Alles in der App **Kurzbefehle** auf dem iPhone. Neuer Kurzbefehl: oben rechts **+**.
Aktionen fügst du unten über **Nach Apps und Aktionen suchen** hinzu.
Die Scriptable-Aktion heißt je nach Sprache **Script ausführen** oder **Run Script**.

Wichtig bei der Scriptable-Aktion: auf den Pfeil **>** tippen und **Bei Ausführung anzeigen / Show When Run** ausschalten.

Namen auf iOS 27: **Suche Wecker**, **Wecker löschen**, **Wecker ein/aus**, **Neuer Wecker**. Das Ergebnis von "Script ausführen" heißt **Output**. "Wiederholungsobjekt" heißt **Objekt wiederholen**, "Wiederholungsindex" heißt **Index wiederholen** (wird nicht gebraucht).

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

Seit Version 3.6 rechnet der Planer die Fahrzeiten selbst aus (OpenStreetMap, kostenlos). Der Kurzbefehl stellt nur noch die Wecker. "Wegzeit abrufen" brauchst du nicht mehr. Das war im Hintergrund zu langsam und brach bei unbekannten Orten ab.

### So sieht der fertige Kurzbefehl aus

```
1  Suche Wecker  (Filter: Beschriftung beginnt mit "Planer:")
2  Wenn [Wecker aus 1] hat einen beliebigen Wert
       Wecker löschen  (Wecker aus 1)
   Ende Wenn
3  Script ausführen: Planer Planen   (Parameter: Kurzbefehleingabe)
4  Wert für "wecker" in [Ergebnis von 3] abrufen
5  Wiederholen mit jedem Objekt in [Wörterbuchwert von 4]
6      Wert für "zeit" in [Wiederholungsobjekt] abrufen
7      Wert für "name" in [Wiederholungsobjekt] abrufen
8      Neuer Wecker: Uhrzeit [Wert aus 6], Beschriftung [Wert aus 7]
   Wiederholung beenden
```

### Deinen bisherigen Kurzbefehl umbauen (5 min)

1. Kurzbefehle → **Planer planen** öffnen.
2. **Alles löschen, was mit den Fahrzeiten zu tun hat**: die zwei Wörterbuch-Aktionen "rad" und "auto", die beiden ersten Wiederholungen mit allem darin (Wegzeit abrufen), die Aktion **Text** (RAD/AUTO) und die **zweite** Aktion "Script ausführen". Löschen: Aktion nach links wischen oder auf das **x**.
3. Übrig bleiben: Suche Wecker, Wenn/Wecker löschen, **eine** "Script ausführen", Wörterbuchwert "wecker" und die Wiederholung mit "Neuer Wecker".
4. In "Wörterbuchwert … wecker": bei **Wörterbuch** muss das Ergebnis der (einzigen) Aktion **Script ausführen** stehen. Falls dort etwas Rotes oder Leeres steht: Finger lange auf das Feld → Variable auswählen → "Script ausführen" antippen.
5. In **Script ausführen** bei **Parameter**: Finger lange drauf → **Variable auswählen** → **Kurzbefehleingabe**. Erscheint sie nicht: über der Tastatur bei den Variablen suchen. Show When Run bleibt **aus**.

Machst du Schritt 2 nicht, läuft es trotzdem, nur langsamer.

### Neu bauen (falls nötig)

1. Aktion **Suche Wecker**. **Filter hinzufügen** → **Beschriftung** → **beginnt mit** → `Planer:`.
2. Aktion **Wenn**. Bedingung: lange drücken → Variable **Suche Wecker** → **hat einen beliebigen Wert**. Darin: Aktion **Wecker löschen**, Feld "Wecker" = Variable aus Schritt 1. "Sonst" bleibt leer.
3. Aktion **Script ausführen** (Scriptable). Script: **Planer Planen**. Pfeil **>** → Show When Run **aus**. Parameter: lange drücken → Variable auswählen → **Kurzbefehleingabe**.
4. Aktion **Wörterbuchwert abrufen**. Schlüssel: `wecker`. Wörterbuch: Ergebnis von Schritt 3.
5. Aktion **Wiederholen mit jedem Objekt** mit dem Wörterbuchwert aus Schritt 4.
6. In die Wiederholung: **Wörterbuchwert abrufen**, Schlüssel `zeit`, Wörterbuch **Wiederholungsobjekt**.
7. Darunter: **Wörterbuchwert abrufen**, Schlüssel `name`, Wörterbuch **Wiederholungsobjekt**.
8. Darunter: **Neuer Wecker**. Uhrzeit = Wert aus 6 (lange drücken → Variable auswählen). Pfeil **>** → Beschriftung = Wert aus 7.
   Nimmt das Uhrzeit-Feld keine Variable: davor **Datumsangaben aus Eingabe abrufen** mit Eingabe = Wert aus 6 einfügen und dessen Ergebnis nehmen.

### Prüfen

- Kurzbefehl von Hand starten (▶). Danach Scriptable → Planer → **Log**: Dort steht "--- Planen ---" und z. B. `Fahrzeit Fahrrad: … = 15 min`.
- Uhr-App: Wecker "Planer: …".

---

## 3. Automationen

Kurzbefehle → unten **Automation** → **+** (bzw. "Neue Automation").

**Morgens 06:00**
1. **Tageszeit** → 06:00 → **Täglich**.
2. **Sofort ausführen** wählen. "Bei Ausführung benachrichtigen" aus.
3. **Weiter** → Kurzbefehl **Planer planen**.

**Abends 20:00**
Genauso, Uhrzeit 20:00.

**Beim Ankommen zuhause** (neu: sagt dem Planer "ich bin da" – ein laufender Termin woanders, z. B. die Arbeit, gilt dann als beendet und der Rest des Tages wird neu geplant)
1. **Ankommen** → Ort: deine Adresse wählen. Zeit: **Jederzeit**. **Sofort ausführen**, "Bei Ausführung benachrichtigen" aus.
2. Aktionen:
   - **Text** mit dem Inhalt `heim`
   - **Kurzbefehl ausführen**: **Planer planen**. Pfeil bzw. "Eingabe" → **Variable auswählen** → **Text**.

   Bestehende Automation umbauen: Automation öffnen → Aktion **Text** hinzufügen, `heim` hineinschreiben und **über** "Planer planen ausführen" ziehen → bei "Planer planen ausführen" unter **Eingabe** die Variable **Text** wählen.

**Beim Verlassen von Zuhause** (merkt deine echte Abfahrtszeit; "früher zuhause" gilt danach nicht mehr)
1. **Verlassen** → Ort: deine Adresse → Zeit: **Jederzeit**.
2. **Sofort ausführen**. "Bei Ausführung benachrichtigen" aus.
3. **Neuer leerer Kurzbefehl** → Aktion **Script ausführen** (Scriptable) → Script: **Planer Abfahrt** → **Show When Run** aus. Kein Parameter nötig.

---

## 4. Widget

Das Widget ist dunkel und ruhig. Es zeigt oben, was **jetzt** dran ist (oder **als Nächstes** kommt), mit Symbol, festen Uhrzeiten ("bis 16:00 · dann 16:00 Rad nach Hause") und einem Balken, der schrumpft. Darunter: der Tag als farbige Zeitleiste (ein weißer Strich = jetzt) und die nächsten Punkte.

Farben: Grün = Aufgabe, Hellblau = Termin, Blau = Arbeit, Orange = Fahrt, Lila = Ruhe vor der Abfahrt, Grau = Pause.

**Home-Bildschirm** (mittel empfohlen; groß zeigt mehr, klein nur das Nächste)
1. Auf eine leere Stelle des Home-Bildschirms lange drücken → oben links **Bearbeiten** → **Widget hinzufügen**.
2. **Scriptable** suchen → Größe wählen → **Widget hinzufügen**.
3. Das neue Widget antippen (noch im Bearbeiten-Modus) → **Script**: **Planer Widget** → **When Interacting**: **Run Script**.

**Sperrbildschirm**
1. Sperrbildschirm lange drücken → **Anpassen** → **Sperrbildschirm** → in das Feld unter der Uhr tippen.
2. **Scriptable** → **rechteckig** (Titel, Restzeit, Balken) und/oder **rund** (Ring, der mit der Restzeit kleiner wird) wählen.
3. Jedes Widget antippen → Script **Planer Widget**.
4. Optional über der Uhr (eine Zeile): dort Scriptable wählen → Script **Planer Widget**.

Hinweis: iOS entscheidet selbst, wann ein Widget neu gezeichnet wird – auf dem Sperrbildschirm manchmal erst nach Stunden. Darum stehen dort feste Uhrzeiten; bei "noch …" steht dahinter, von wann die Angabe ist ("Stand 15:20"). Antippen öffnet den Planer und zeichnet neu.

---

## 5. Kurzbefehl "Planer sagen" (Spracheingabe)

Danach reicht: **"Hey Siri, Planer sagen"** – oder das Kurzbefehle-Widget antippen.

**Wichtig bei Siri:** Erst nur **"Hey Siri, Planer sagen"** sagen und **warten**, bis das Diktieren startet. Erst dann den Satz sprechen. Siri gibt Text, der direkt hinter dem Namen steht ("Hey Siri, Planer sagen, dass …"), nicht an den Kurzbefehl weiter.

Der Kurzbefehl hat nur 3 Aktionen (ohne Claude, darum keine neuen Chats in der Claude-App):

1. Neuer Kurzbefehl, Name exakt: **Planer sagen**.
2. Aktion **Text diktieren** (auch "Diktieren"). Sprache: **Deutsch**. "Zuhören stoppen": **Nach Pause**.
3. Aktion **Text**. Inhalt: `DIKTAT: ` und dahinter die Variable **Diktierter Text** (über der Tastatur "Variable auswählen" → Aktion "Text diktieren" antippen).
4. Aktion **Script ausführen** (Scriptable). Script: **Planer Sprache**. Parameter: lange drücken → Variable auswählen → Aktion **Text** (Schritt 3).
   **Show When Run: AN** (dann fragt der Planer vorher nach, wenn du den Kurzbefehl antippst).

**Du hast ihn schon mit Claude gebaut?** Dann nur:
- Aktion **Claude fragen** löschen (nach links wischen oder das x).
- In der Aktion **Text** die Zeile mit `CLAUDE:` löschen. Die Zeile `DIKTAT: …` bleibt.

So funktioniert es: Du sprichst, der Planer zeigt "Verstanden: …" und führt nach **Ausführen** alles aus. Über Siri kann Scriptable kein Fenster zeigen: Dann führt der Planer es **ohne Rückfrage** aus und schickt eine Mitteilung "Planer: Erledigt" mit dem, was er geändert hat. Versteht er etwas nicht, kommt die Mitteilung "Planer: Nicht verstanden" mit Beispielen.

Diese Sätze versteht der Planer (Reihenfolge der Wörter ist meist egal):
- "Bad putzen erledigt", "Staubsaugen nicht nötig", "Fenster heute nicht", "Wäsche später"
- "Milch und Brot auf die Einkaufsliste"
- "Termin Arzt Dienstag 10 Uhr in Musterstadt", "Friseur am 3.12. um 15 Uhr", "Morgen Treffen mit Max" (ohne Uhrzeit = ganztägig)
- Termine verschieben (alle Kalender): "Training morgen erst um 20 Uhr", "Arzt von Dienstag auf Donnerstag 11 Uhr verschieben", "Friseur auf Freitag verschieben"
- "Ich bin krank", "Urlaub vom 1.12. bis 5.12.", "Heute keine Aufgaben"
- "Neue Aufgabe Pflanzen gießen alle 3 Tage 10 Minuten"
- "Frist TÜV am 20.12.", "Geburtstag von Oma am 5. März", "Ibuprofen genommen"

Dasselbe geht in der App: **Planer → Heute → Eintippen …**

Neue Termine landen in dem Kalender, den du beim ersten Mal in der App wählst. Kommt der erste Termin über Siri, nimmt der Planer deinen Standard-Kalender.

**Optional, mit Claude** (versteht freiere Sätze, legt aber in der Claude-App jedes Mal einen neuen Chat an): zwischen Schritt 2 und 3 die Aktion **Claude fragen** einfügen, mit diesem Text, danach ein Leerzeichen und die Variable **Diktierter Text**:

   ```
   Wandle den folgenden gesprochenen Satz für meinen Alltagsplaner in JSON um. Antworte NUR mit JSON, ohne Erklärung, im Format {"aktionen":[{...}]}. Felder: aktion (erledigt, spaeter, heutenicht, nichtnoetig, einkauf, termin, aendern, aufgabe, abwesend, keineaufgaben, frist, geburtstag, genommen oder unklar), name (Aufgabe, Medikament, Person oder Frist), sachen (Liste, nur bei einkauf), titel, datum, uhrzeit (HH:MM), dauer (Minuten), ort (bei termin und aendern), neudatum (nur bei aendern), bis (letzter Tag bei abwesend), art (frei, krank oder weg bei abwesend), intervall (Tage bei aufgabe). termin = neuer Termin. aendern = einen bestehenden Termin verschieben oder ändern (z. B. "Training morgen erst um 20 Uhr", "Arzt von Dienstag auf Donnerstag verschieben"): titel = Name des Termins, datum = bisheriger Tag (nur wenn gesagt), neudatum = neuer Tag, uhrzeit = neue Uhrzeit. Datum genau so übernehmen, wie es gesagt wurde (z. B. "morgen", "Dienstag", "12.3."), nicht ausrechnen. Satz:
   ```
   In Schritt 3 eine zweite Zeile: `CLAUDE: ` und dahinter die Ausgabe von **Claude fragen**.

---

## 6. Dienstplan-PDF einlesen

1. Die PDF öffnen (Mail, Dateien …) → **Teilen**-Symbol.
2. In der Reihe der Apps **Scriptable** wählen (evtl. unter "Mehr"; kann auch "Run Script" heißen) → **Planer Dienstplan**.
3. Beim ersten Mal: deinen Namen so eintippen, wie er in der ersten Spalte steht.
4. Vorschau prüfen → **Übernehmen**. Die Schichten stehen danach im Kalender "Arbeit".
5. Einmal **Planer planen** starten, damit die Wecker stimmen.

Beim allerersten Mal lädt Scriptable das Leseprogramm (pdf.js, kostenlos) aus dem Internet; danach geht es offline.
Alternativ: Planer → Einstellungen → Dienstplan-PDF → PDF auswählen.

---

## Was passiert wann

- Der Kurzbefehl läuft automatisch um 06:00, um 20:00 und wenn du nach Hause kommst.
- Abhaken geht auf drei Wegen:
  - Mitteilung zum Blockstart: **Erledigt**, **Später**, **Heute nicht** oder **Nicht nötig** (lange auf die Mitteilung drücken, dann erscheinen die Knöpfe). Danach öffnet sich kurz Scriptable und plant direkt neu – ohne den Kurzbefehl, die Wecker bleiben.
  - Scriptable → **Planer** → **Heute** → Aufgabe antippen → Erledigt / Heute nicht / Später / Nicht nötig.
  - **Erinnerungen-App**, Liste "Planer": dort stehen die Aufgaben von heute und morgen. Abhaken genügt; der Planer liest es beim nächsten Planen ein (spätestens 06:00, 20:00 oder beim Heimkommen).
- Wecker werden nur für die nächsten 24 Stunden gestellt (Wecker kennen nur eine Uhrzeit, kein Datum).
- Aufstehwecker "Planer: Aufstehen" kommt 60 min vor der ersten Abfahrt, wenn die vor 10:00 ist. Er läuft über denselben Kurzbefehl, du musst nichts ändern.
- Regnet es zur Abfahrt (ab 60 %), plant der Planer Auto statt Rad.
- Fahrzeiten rechnet der Planer selbst (OpenStreetMap, ohne Stau, plus 3 min Puffer fürs Auto, 1 min fürs Rad; änderbar unter Einstellungen → Zeiten und Regeln). Jede Strecke wird höchstens einmal im Monat neu berechnet.
- Termine anderer (Einladungen, denen du nicht zugesagt hast) blockieren nichts. Sie stehen nur als "Info" im Widget und im Morgen-Überblick. Sagst du in der Kalender-App zu, zählen sie normal.
- Kommst du nach Hause, während laut Kalender noch ein Termin woanders läuft (z. B. Arbeit bis 16:00), gilt er als beendet und der Rest des Tages wird neu geplant. Der Kalender selbst bleibt unverändert.
- 20:30 Tagesabschluss: offene Aufgaben (Knopf "Alles erledigt"), Aufstehzeit und Bettzeit für morgen. Zur Aufstehzeit: Überblick über den Tag.
