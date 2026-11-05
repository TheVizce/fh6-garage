# FH6 Garage – Hinweise für Claude

## Dieses Tool
- Verwaltung der eigenen Autos aus Forza Horizon 6. Statische Seite: `index.html`, `app.js`, `style.css`, Fahrzeugliste `data/fahrzeuge.json` (von forza.net/fh6cars, 667 Autos, Stand 03.11.2026).
- Speicher: IndexedDB `fh6-garage` (Store `kv`: `daten` = Einträge + Promo, `fahrzeugliste` = optional selbst aktualisierte Liste). localStorage nur `fh6garage.ui` (Ansicht/Sortierung). Bis 03.11.2026 lagen `fh6garage.daten`/`fh6garage.fahrzeugliste` im localStorage; `ladeDaten()`/`ladeListe()` übernehmen sie beim Start und entfernen die alten Schlüssel erst danach. Fällt IndexedDB aus, läuft das Tool mit sichtbarer Warnung im localStorage weiter.
- Einträge werden kompakt gespeichert (`kompakt()`: leere Felder – null, '', false – entfallen). Beim Lesen immer mit fehlenden Feldern rechnen.
- Sync: Datei `fh6-garage.json` (keine Teildateien). `collections: { eintraege: { type: 'array', id: 'uid' }, promo: 'map' }`, keine `fields`. Die Fahrzeugliste wird nicht abgeglichen.
- Horizon Promo (fotografierte Autos): `daten.promo` = Map Fahrzeug-ID → Datum, pro Modell und unabhängig vom Besitz. Nur Fahrzeuge aus der Liste. Im Export/Import enthalten.
- `SYNC.changed()` steht in `speichern()` in `app.js` (async, gibt Promise<boolean> zurück). Alle Änderungen an Einträgen und Promo laufen über `speichern()`.
- Eintrag: `uid` (stabil, nie neu vergeben), `autoId` (Slug des Fahrzeugnamens aus der Liste bzw. `eigen-…`), `auto` (Kopie der Stammdaten, damit Einträge Listen-Updates überstehen), Werte nach Upgrade `pi, vmax (km/h), a100 (s), kw, kg, nm` (Leistung in kW wie im Spiel; frühere Einträge mit `ps` rechnet `psZuKw()` beim Laden/Import/Sync um), `reifen`, `antrieb`, `build`, `design` (Design/Lackierung, Freitext), `code`, `notiz`, `fav`, `erstellt`, `geaendert`.
- `index.html` lädt `app.js`/`style.css` mit `?v=JJJJMMTT`. Bei Änderungen an diesen Dateien den Wert hochsetzen, damit Browser nicht die alte Version aus dem Cache nehmen.
- Reiter „Abdeckung“ (`renderAbdeckung()`): Kennzahlen, Matrix Marke × Typ × PI-Klasse (Klasse nach Upgrade, sonst Serie; 2+ = doppelt, orange), Balken je Klasse sowie Abdeckung der Marken/Typen (Modelle in der Garage / Modelle in der Liste). Klick auf belegte Zelle → Garage gefiltert, auf freie Zelle → Katalog mit Marke + Typ. Rein berechnet, nichts gespeichert.
- Reiter „Rennen“ (`renderRennen()`): Event-Finder mit Vorgaben in `ui.event` (Klasse, Typ, Marke, Land, Baujahr von/bis, Antrieb, Reifen, Sortierung) → „In deiner Garage“ (Klasse genau), „Ließe sich hochrüsten“ (niedrigere Klasse), „Noch nicht in der Garage“ (Katalog, Serie ≤ Klasse). Bestenliste pro Klasse × Kategorie (`kategorieVon()`: Rally = Typ enthält „Rally“, Offroad = Buggies/Offroad/Pickups/UTV/Unlimited, Drift = Drift Cars, sonst Straße).
- Stapel-Import (`⇪ Screenshots`, `dlgStapel`): mehrere Dateien/Ordner (Steam-Unterordner `thumbnails/` wird übersprungen) → Entwürfe nur im Arbeitsspeicher; `erkenneBild()` wird nacheinander (`ocrKette`) aufgerufen. Vorschlag `vorschlagAktion()`: gleiches Auto mit gleichem PI vorhanden → diesen Eintrag aktualisieren (nur Zahlenwerte), sonst neuer Build. Übernehmen = ein `speichern()`.
- Einzel-Dialog: `zeigeVorhanden()` weist beim Neuanlegen auf vorhandene Einträge desselben Autos hin; „Diesen aktualisieren“ schaltet auf Bearbeiten um und behält die Formularwerte.
- Vergleich: Häkchen in der Garage (max. 4, nur im Arbeitsspeicher), Leiste unten rechts, `dlgVergleich` mit bestem Wert grün. Abdeckung-Kennzahl „In Garage, nicht fotografiert“ springt in die Garage mit Promo-Filter „nein“.
- Klassen aus PI: D ≤400, C ≤500, B ≤600, A ≤700, S1 ≤800, S2 ≤900, R ≤998, X 999.
- Screenshot-Texterkennung: Tesseract.js 5.1.1 von jsdelivr, wird erst bei Bedarf geladen. Auswertung in `werteAusText()`. Bei 16:9-Screenshots des deutschen Tuning-Bildschirms liest `verarbeiteBild()` feste Ausschnitte einzeln (Name links oben, Autostatistik rechts, PI-Abzeichen „Neu“ mit psm 7) und behält per `ausschnitt()` nur weiße/graue Schrift. Fehlt danach ein Wert, wird das ganze Bild gelesen und nur Fehlendes ergänzt. In Zeilen mit „Vorheriger“/„Neu“ zählt der letzte Wert. Die Tabellen-Kästchen liest die Erkennung manchmal als „B“; Zahlen mit Einheit zählen deshalb nie als PI. Firefox (Fingerprinting-Schutz) verfälscht aus einem Canvas zurückgelesene Pixel und `canvas.toBlob()`. Deshalb wird kein Canvas für die Erkennung benutzt: `rasterAusDatei()` entschlüsselt JPG (jpeg-js 0.4.4) bzw. PNG (UPNG 2.1.0 + pako 1.0.11, alles von jsdelivr) direkt aus der Datei; Ausschnitt, Vergrößern (bilinear), Schwarz/Weiß und die BMP-Datei für Tesseract (`grauZuBmp()`) werden in eigenen Arrays gerechnet. Canvas nur noch für die Vorschau und als Rückfall für andere Formate. Erste Zeilen von „Erkannter Text“: Version, Bilddaten mit Pixelquelle, Schrift-Anteil je Ausschnitt (0 % = Pixel kaputt).

## Gemeinsame Regeln für alle Tools unter thevizce.github.io

Alle Tools laufen unter derselben Adresse und teilen sich Speicher. Übersicht, Speicheranzeige und Sync-Einstellungen: Repo `startseite` (https://thevizce.github.io/startseite/).

**Speicher**
- localStorage ist für alle Tools gemeinsam (~5 MB). Nur kleine Daten (deutlich unter 500 KB) mit dem eigenen Präfix, nie `localStorage.clear()`.
- Größere Daten in die eigene IndexedDB. Fremde Datenbanken nie beschreiben.
- Speicherfehler sichtbar anzeigen. JSON-Export/Import muss weiter funktionieren.
- Formatänderungen: alte Daten beim Start automatisch übernehmen, alte Schlüssel erst danach entfernen.
- Vor Änderungen am Speicher dem Nutzer kurz Befund und empfohlene Variante nennen, danach eine kurze Umstiegs-Anleitung gegen Datenverlust geben.

**GitHub-Sync (`/startseite/sync-v1.js`)**
- Das Tool gleicht über `ToolSync.create({...})` mit dem privaten Repo `TheVizce/tool-daten` ab. Token und Repo trägt der Nutzer nur auf der Startseite ein (`localStorage["toolsync.config"]`). Keine eigenen Token-Felder oder eigenen GitHub-Uploads bauen.
- Nach jedem erfolgreichen Speichern muss `SYNC.changed()` aufgerufen werden (Stelle oben). Neue Speicherwege ebenfalls daran anschließen.
- Neue Datenfelder oder Listen müssen in `get`/`apply` und in `collections`/`fields` ergänzt werden, sonst werden sie nicht abgeglichen oder gehen beim Übernehmen aus der Cloud verloren.
- Einträge in Listen brauchen eine stabile `id` (bzw. das angegebene ID-Feld). IDs nie neu vergeben, nicht umbenennen.
- Ein Eintrag gelöscht = Löschung wird gemerkt. Daten nicht durch Löschen + Neuanlegen „umbauen“.
- `sync-v1.js` nicht kopieren und nicht im Tool-Repo ändern. Änderungen daran nur im Repo `startseite`, abwärtskompatibel; Inkompatibles als `sync-v2.js`.
- Das ☁︎-Feld unten links (mit ⌂ zur Startseite) kommt aus dem Sync. Keinen eigenen Zurück-Knopf bauen, der dort kollidiert.

**Sonst**
- iPhone: Kopfzeilen mit `env(safe-area-inset-top)` und `viewport-fit=cover` beibehalten.
- Direkte Pushes auf `main` sind erlaubt. Nicht gleichzeitig aus zwei Chats am selben Tool arbeiten.
- Neue Tools oder neue Datenbanken in `startseite/index.html` (Liste `TOOLS`) eintragen.
