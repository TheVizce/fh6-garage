# FH6 Garage

Eigene Fahrzeugsammlung aus Forza Horizon 6 verwalten, mit den Werten nach Upgrade und Tuning, wie das Spiel sie anzeigt.

- **Garage:** pro Eintrag PI nach Upgrade (Klasse wird berechnet), Höchstgeschwindigkeit, 0–100, Leistung (kW), Drehmoment, Gewicht, Reifen, Antrieb, Build-Name, Design, Tune-Sharecode, Notiz, Favorit. Ein Auto kann mehrere Builds haben.
- **Katalog:** alle Fahrzeuge von forza.net/fh6cars (`data/fahrzeuge.json`) mit Marke, Jahr, Land, Typ, Serienklasse und Bezugsweg, dazu das Häkchen für Horizon Promo.
- **Abdeckung:** Matrix Marke × Typ × PI-Klasse (doppelte Klassen markiert), Abdeckung nach Marken und Typen.
- **Rennen:** Event-Finder nach Vorgaben, Bestenliste pro Klasse (Straße, Rally, Offroad, Drift).
- **Screenshots einlesen:** einzeln im Dialog oder mehrere bzw. ein ganzer Ordner über „⇪ Screenshots“. Die Texterkennung läuft lokal im Browser (Tesseract.js) und liest die Spalte „Neu“ des Tuning-Bildschirms. Unsichere Felder bleiben leer und sind gelb markiert.
- **Speicher:** eigene IndexedDB `fh6-garage`, im localStorage nur die Ansicht (`fh6garage.ui`). JSON-Export und -Import unter ⚙, Abgleich über den gemeinsamen Sync der Startseite (`fh6-garage.json` in `tool-daten`).

## Dateien
```
index.html
style.css
app.js
data/fahrzeuge.json
```

## Fahrzeugliste aktualisieren
Neue Autos (z. B. Car Pass) werden direkt in `data/fahrzeuge.json` im Repo nachgetragen.
