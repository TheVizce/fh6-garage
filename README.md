# FH6 Garage

Eigene Fahrzeugsammlung aus Forza Horizon 6 verwalten: Werte nach Upgrade/Tuning so festhalten, wie das Spiel sie anzeigt.

- **Katalog:** 667 Fahrzeuge von forza.net/fh6cars mit Marke, Jahr, Land, Typ, Klasse/PI ab Werk und Bezugsweg
- **Garage:** pro Eintrag PI nach Upgrade (Klasse wird daraus berechnet), Höchstgeschwindigkeit, 0–100, Reifen, Antrieb, PS, Gewicht, Drehmoment, Tune-Sharecode, Notiz, Favorit. Dasselbe Auto kann mehrfach als Build angelegt werden.
- **Screenshot einlesen:** Statistik-Screenshot ins Formular ziehen oder mit Strg+V einfügen. Die Texterkennung läuft lokal im Browser (Tesseract.js) und füllt die Felder vor. Die Werte bitte prüfen.
- **Speicher:** localStorage unter `fh6garage.*`, mit JSON-Export und -Import unter ⚙.

## Dateien
```
index.html
style.css
app.js
data/fahrzeuge.json
```

## Fahrzeugliste aktualisieren
Unter ⚙ → „Liste aus forza.net aktualisieren“ steht eine Zeile für die Browser-Konsole. Sie kopiert die aktuelle Tabelle von forza.net/fh6cars, die man dann im Tool einfügt.
