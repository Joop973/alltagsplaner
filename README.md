# Alltagsplaner

Plant wiederkehrende Alltagsaufgaben automatisch in freie Lücken des iPhone-Kalenders,
erinnert per Mitteilung und stellt vor jeder Abfahrt einen Wecker.
Läuft mit [Scriptable](https://scriptable.app) und Apple Kurzbefehlen. Keine persönlichen Daten im Repo.

- Installation: `scripts/Planer Update.js` einmal in Scriptable anlegen und ausführen. Es lädt alle Dateien laut `manifest.json`.
- Kurzbefehle: [docs/kurzbefehle.md](docs/kurzbefehle.md)
- Regeln und Aufbau: [CLAUDE.md](CLAUDE.md)
- Tests: `TZ=Europe/Berlin node --test 'tests/*.test.js'`
