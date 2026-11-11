# FH6 Garage – Hinweise für Claude

## Dieses Tool
- Verwaltung der eigenen Autos aus Forza Horizon 6. Statische Seite: `index.html`, `app.js`, `style.css`, Fahrzeugliste `data/fahrzeuge.json` (von forza.net/fh6cars, 667 Autos, Stand 03.11.2026).
- Speicher: IndexedDB `fh6-garage` (Store `kv`, Schlüssel `daten` = Einträge + Promo). localStorage nur `fh6garage.ui` (Ansicht/Sortierung). Bis 03.11.2026 lag `fh6garage.daten` im localStorage; `ladeDaten()` übernimmt es beim Start und entfernt den alten Schlüssel erst danach. Fällt IndexedDB aus, läuft das Tool mit sichtbarer Warnung im localStorage weiter.
- Fahrzeugliste nur aus dem Repo (`data/fahrzeuge.json`). Das frühere Aktualisieren per Browser-Konsole ist entfernt (11.11.2026); `ladeListe()` löscht eine evtl. noch gespeicherte eigene Liste (IDB `fahrzeugliste`, localStorage `fh6garage.fahrzeugliste`), weil sie Repo-Updates verdecken würde. Neue Autos: `data/fahrzeuge.json` im Repo ergänzen (Quelle forza.net/fh6cars).
- Mehrere Tabs: Nach jedem Speichern meldet `meldeTabs()` per BroadcastChannel `fh6-garage`; andere Tabs laden `daten` neu, damit kein veralteter Stand Änderungen überschreibt.
- Einträge werden kompakt gespeichert (`kompakt()`: leere Felder – null, '', false – entfallen). Beim Lesen immer mit fehlenden Feldern rechnen.
- Sync: Datei `fh6-garage.json` (keine Teildateien). `collections: { eintraege: { type: 'array', id: 'uid' }, promo: 'map' }`, keine `fields`. Die Fahrzeugliste wird nicht abgeglichen.
- Horizon Promo (fotografierte Autos): `daten.promo` = Map Fahrzeug-ID → Datum, pro Modell und unabhängig vom Besitz. Nur Fahrzeuge aus der Liste. Im Export/Import enthalten.
- `SYNC.changed()` steht in `speichern()` in `app.js` (async, gibt Promise<boolean> zurück). Alle Änderungen an Einträgen und Promo laufen über `speichern()`.
- Eintrag: `uid` (stabil, nie neu vergeben), `autoId` (Slug des Fahrzeugnamens aus der Liste bzw. `eigen-…`), `auto` (Kopie der Stammdaten, damit Einträge Listen-Updates überstehen), Werte nach Upgrade `pi, vmax (km/h), a100 (s), kw, kg, nm` (Leistung in kW wie im Spiel; frühere Einträge mit `ps` rechnet `psZuKw()` beim Laden/Import/Sync um), `reifen`, `antrieb`, `build`, `design` (Design/Lackierung, Freitext), `code`, `notiz`, `fav`, `erstellt`, `geaendert`.
- `index.html` lädt `app.js`/`style.css` mit `?v=JJJJMMTT`. Bei Änderungen an diesen Dateien den Wert hochsetzen, damit Browser nicht die alte Version aus dem Cache nehmen.
- Reiter „Abdeckung“ (`renderAbdeckung()`): Kennzahlen, Matrix Marke × Typ × PI-Klasse (Klasse nach Upgrade, sonst Serie; 2+ = doppelt, orange), Balken je Klasse sowie Abdeckung der Marken/Typen (Modelle in der Garage / Modelle in der Liste). Klick auf belegte Zelle → Garage gefiltert, auf freie Zelle → Katalog mit Marke + Typ. Rein berechnet, nichts gespeichert.
- Reiter „Rennen“ (`renderRennen()`): Event-Finder mit Vorgaben in `ui.event` (Klasse, Typ, Marke, Land, Baujahr von/bis, Antrieb, Reifen, Sortierung) → „In deiner Garage“ (Klasse genau), „Passt vermutlich – Antrieb/Reifen nicht eingetragen“ (fehlende Angabe blendet nicht aus), „Ließe sich hochrüsten“ (niedrigere Klasse, nur Modelle ohne Build in der Zielklasse), „Noch nicht in der Garage“ (Katalog, Serie ≤ Klasse). Bestenliste pro Klasse × Kategorie (`kategorieVon()`: Rally = Typ enthält „Rally“, Offroad = Buggies/Offroad/Pickups/UTV/Unlimited, Drift = Drift Cars, sonst Straße).
- Stapel-Import (`⇪ Screenshots`, `dlgStapel`): mehrere Dateien/Ordner (Steam-Unterordner `thumbnails/` wird übersprungen) → Entwürfe nur im Arbeitsspeicher; `erkenneBild()` wird nacheinander (`ocrKette`) aufgerufen. Vorschlag `vorschlagAktion()`: gleiches Auto mit gleichem PI, sonst mit gleicher Klasse vorhanden → diesen Eintrag aktualisieren (nur Zahlenwerte; Ziel: pro Marke/Typ jede Klasse nur einmal), sonst neuer Build. Übernehmen = ein `speichern()`. Klick auf ein Vorschaubild (auch die Vorschau im Einzel-Dialog) öffnet `dlgBild` mit dem Screenshot in voller Größe.
- Einzel-Dialog: Die Werte stehen im Block „Autostatistik“ untereinander in der Reihenfolge des Spiels (Höchstgeschwindigkeit, 0–100, Leistung, Drehmoment, Gewicht); PI, Reifen, Antrieb, Tune-Code darüber in einer Zeile. Stapel-Import (`WERTSPALTEN`) und die Spalten der Garage-Tabelle (km/h, 0–100, kW, N·m, kg) in derselben Reihenfolge.
- Einzel-Dialog: `zeigeVorhanden()` weist beim Neuanlegen auf vorhandene Einträge desselben Autos hin; „Diesen aktualisieren“ schaltet auf Bearbeiten um und behält die Formularwerte.
- Vergleich: Häkchen in der Garage (max. 4, nur im Arbeitsspeicher), Leiste unten rechts, `dlgVergleich` mit bestem Wert grün. Abdeckung-Kennzahl „In Garage, nicht fotografiert“ springt in die Garage mit Promo-Filter „nein“.
- Klassen aus PI: D ≤400, C ≤500, B ≤600, A ≤700, S1 ≤800, S2 ≤900, R ≤998, X 999.
- Screenshot-Texterkennung: Tesseract.js 5.1.1 von jsdelivr, wird erst bei Bedarf geladen. Auswertung in `werteAusText()`. Bei 16:9-Screenshots des deutschen Tuning-Bildschirms liest `verarbeiteBild()` feste Ausschnitte einzeln (Name links oben, Spalte „Neu“ der Autostatistik, PI-Abzeichen „Neu“ mit psm 7) und behält per `ausschnitt()` nur weiße/graue Schrift. Wird kein Fahrzeug erkannt, liest es den Namensbereich nochmal mit psm 6 und 11, jeweils mit Helligkeitsschwelle 130 und 90 (graue Schrift auf hellem/farbigem bzw. sehr dunklem Hintergrund), und sammelt die Texte aller Versuche. Richtig sind die Werte aus „Neu“ (= Stand mit angewendetem Tuning, im Spiel nachgeprüft; „Vorheriger“ kann deutlich abweichen): Beim Tuning-Bildschirm kommen alle Zahlen nur aus der Spalte „Neu“ (x 0.856–0.94, Zuordnung über die Einheit) und PI aus dem Abzeichen „Neu“. Fehlt dort ein Wert, bleibt das Feld leer und wird gelb markiert (`unsicher`) – kein Rückgriff auf Zeile oder ganzes Bild, weil dort auch „Vorheriger“ steht. Das ganze Bild wird beim Tuning-Bildschirm nur noch für den Namen gelesen; bei anderen Bildformaten weiterhin für alle Werte. `OCR_VERSION` bei Änderungen an der Erkennung hochsetzen. `autoAusText()` setzt verwechselbare Zeichen gleich (`ocrGleich()`: i/l→1, o→0, z. B. i8 ↔ 18) und erkennt zusammengeschriebene Nachbarwörter (X5M = X5 M). Die Tabellen-Kästchen liest die Erkennung manchmal als „B“; Zahlen mit Einheit zählen deshalb nie als PI. Firefox (Fingerprinting-Schutz) verfälscht aus einem Canvas zurückgelesene Pixel und `canvas.toBlob()`. Deshalb wird kein Canvas für die Erkennung benutzt: `rasterAusDatei()` entschlüsselt JPG (jpeg-js 0.4.4) bzw. PNG (UPNG 2.1.0 + pako 1.0.11, alles von jsdelivr) direkt aus der Datei; Ausschnitt, Vergrößern (bilinear), Schwarz/Weiß und die BMP-Datei für Tesseract (`grauZuBmp()`) werden in eigenen Arrays gerechnet. Canvas nur noch für die Vorschau und als Rückfall für andere Formate. Erste Zeilen von „Erkannter Text“: Version, Bilddaten mit Pixelquelle, Schrift-Anteil je Ausschnitt (0 % = Pixel kaputt).

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
