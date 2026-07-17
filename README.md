# MedTech-Radar 🩺

Persönlicher Nachrichten-Aggregator für **Regulatory Affairs & Qualitätsmanagement Medizinprodukte**.

## Wie es funktioniert

1. Jeden Morgen um ca. 6:30 Uhr ruft GitHub Actions automatisch die in `sources.json`
   hinterlegten Feeds ab (EU-Kommission, EUR-Lex, BfArM, Team-NB, Johner Institut, …).
2. Neue Meldungen werden im Archiv `data/items.json` gespeichert (Aufbewahrung: 180 Tage).
3. Daraus wird die Übersichtsseite gebaut und auf GitHub Pages veröffentlicht —
   abrufbar in Chrome auf Laptop und Handy.

## Dateien

| Datei | Zweck |
|---|---|
| `sources.json` | Liste der Nachrichtenquellen. Hier Quellen ergänzen/entfernen. |
| `build.js` | Das Sammel-Skript (holt Feeds, baut die Seite). |
| `.github/workflows/update.yml` | Der Zeitplan für die automatische Ausführung. |
| `data/items.json` | Das Nachrichten-Archiv (wird automatisch gepflegt). |
| `docs/quellen.md` | Recherche-Ergebnis: alle geprüften Quellen inkl. Ausbaustufe 2. |

## Manuell aktualisieren

Auf GitHub: Reiter **Actions** → „Nachrichten aktualisieren" → **Run workflow**.

Lokal testen: `npm install` und dann `npm run build`, anschließend `public/index.html` im Browser öffnen.
