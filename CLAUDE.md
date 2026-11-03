# FH6 Garage – Hinweise für Claude

## Dieses Tool
- Verwaltung der eigenen Autos aus Forza Horizon 6. Statische Seite: `index.html`, `app.js`, `style.css`, Fahrzeugliste `data/fahrzeuge.json` (von forza.net/fh6cars, 667 Autos, Stand 03.11.2026).
- Speicher: nur localStorage, Präfix `fh6garage.` (`fh6garage.daten` = Einträge, `fh6garage.ui` = Ansicht/Sortierung, `fh6garage.fahrzeugliste` = optional selbst aktualisierte Fahrzeugliste). Keine IndexedDB.
- Sync: Datei `fh6-garage.json` (keine Teildateien). `collections: { eintraege: { type: 'array', id: 'uid' }, promo: 'map' }`, keine `fields`. Die Fahrzeugliste wird nicht abgeglichen.
- Horizon Promo (fotografierte Autos): `daten.promo` = Map Fahrzeug-ID → Datum, pro Modell und unabhängig vom Besitz. Nur Fahrzeuge aus der Liste. Im Export/Import enthalten.
- `SYNC.changed()` steht in `speichern()` in `app.js`. Alle Änderungen an Einträgen laufen über `speichern()`.
- Eintrag: `uid` (stabil, nie neu vergeben), `autoId` (Slug des Fahrzeugnamens aus der Liste bzw. `eigen-…`), `auto` (Kopie der Stammdaten, damit Einträge Listen-Updates überstehen), Werte nach Upgrade `pi, vmax (km/h), a100 (s), ps, kg, nm`, `reifen`, `antrieb`, `build`, `code`, `notiz`, `fav`, `erstellt`, `geaendert`.
- Klassen aus PI: D ≤400, C ≤500, B ≤600, A ≤700, S1 ≤800, S2 ≤900, R ≤998, X 999.
- Screenshot-Texterkennung: Tesseract.js 5.1.1 von jsdelivr, wird erst bei Bedarf geladen. Auswertung in `werteAusText()`.

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
