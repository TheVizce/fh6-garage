/* FH6 Garage – Verwaltung der eigenen Forza-Horizon-6-Fahrzeuge
 * Speicher: IndexedDB "fh6-garage" (Store "kv": "daten" = Garage + Promo, "fahrzeugliste" = optional aktualisierte Liste).
 * localStorage nur für "fh6garage.ui" (Ansicht). Bis 03.11.2026 lagen die Daten unter "fh6garage.daten" /
 * "fh6garage.fahrzeugliste" im localStorage; sie werden beim Start einmalig übernommen und erst danach entfernt.
 * Kein localStorage.clear(), keine fremden Schlüssel oder Datenbanken anfassen.
 */
(() => {
  'use strict';

  const PRAEFIX = 'fh6garage.';
  const K_DATEN = PRAEFIX + 'daten';
  const K_UI = PRAEFIX + 'ui';
  const K_LISTE = PRAEFIX + 'fahrzeugliste';
  const VERSION = 1;
  const DB_NAME = 'fh6-garage', DB_STORE = 'kv';

  const KLASSEN = ['D', 'C', 'B', 'A', 'S1', 'S2', 'R', 'X'];
  const REIFEN = ['Serie', 'Straße', 'Sport', 'Semi-Slick', 'Slick', 'Rallye', 'Offroad', 'Schnee', 'Drag', 'Drift', 'Vintage'];
  const ANTRIEB = ['FWD', 'RWD', 'AWD'];
  const LAENDER = { USA: 'USA', Japan: 'Japan', Germany: 'Deutschland', Italy: 'Italien', UK: 'Großbritannien', France: 'Frankreich', Sweden: 'Schweden', Korea: 'Südkorea', 'South Korea': 'Südkorea', Australia: 'Australien', China: 'China', Canada: 'Kanada', Austria: 'Österreich', Croatia: 'Kroatien', Denmark: 'Dänemark', Netherlands: 'Niederlande', Spain: 'Spanien', 'Czech Republic': 'Tschechien', Mexico: 'Mexiko', Switzerland: 'Schweiz', 'New Zealand': 'Neuseeland', Belgium: 'Belgien', India: 'Indien' };
  const BEZUG = { Autoshow: 'Autohändler', Wheelspin: 'Wheelspin', Seasonal: 'Saison', 'Collection Journal': 'Sammeljournal', 'Autoshow DLC': 'Autohändler (DLC)', Treasure: 'Schatz', Loyalty: 'Treuebonus', Aftermarket: 'Aftermarket', 'Barn Find': 'Scheunenfund' };

  const SORT_GARAGE = [
    ['neu', 'Zuletzt bearbeitet'], ['name', 'Marke & Modell A–Z'], ['jahr', 'Baujahr (alt → neu)'], ['pi', 'PI (hoch → niedrig)'],
    ['vmax', 'Höchstgeschw.'], ['a100', '0–100 (schnellste)'], ['kw', 'Leistung'], ['kg', 'Gewicht (leicht)']
  ];
  const SORT_KATALOG = [['name', 'Marke & Modell A–Z'], ['jahr', 'Baujahr (alt → neu)'], ['pi', 'PI Serie'], ['besitz', 'In Garage zuerst']];

  /* ---------- Hilfen ---------- */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const slug = s => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const norm = s => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const zahl = v => { if (v === '' || v == null) return null; const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
  const fmt = (n, d = 0) => n == null ? '' : n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });

  // Name ohne vorangestelltes Baujahr ("1998 Toyota Supra RZ" → "Toyota Supra RZ")
  const modell = a => String((a && a.n) || '').replace(/^\d{4}\s+/, '');
  const jahrVon = a => (a && a.j) || Number(String((a && a.n) || '').slice(0, 4)) || 0;
  const nachModell = (x, y) => modell(x).localeCompare(modell(y), 'de') || jahrVon(x) - jahrVon(y);
  const nachJahr = (x, y) => jahrVon(x) - jahrVon(y) || modell(x).localeCompare(modell(y), 'de');
  const nameHtml = a => `${esc(modell(a) || '?')}${jahrVon(a) ? ` <span class="jahr">${jahrVon(a)}</span>` : ''}`;

  function klasseVonPi(pi) {
    if (pi == null) return '';
    if (pi <= 400) return 'D'; if (pi <= 500) return 'C'; if (pi <= 600) return 'B'; if (pi <= 700) return 'A';
    if (pi <= 800) return 'S1'; if (pi <= 900) return 'S2'; if (pi <= 998) return 'R'; return 'X';
  }
  function badge(pi, k) {
    if (pi == null && !k) return '';
    k = k || klasseVonPi(pi);
    return `<span class="badge k-${esc(k)}"><span class="k">${esc(k)}</span>${pi != null ? `<span class="p">${pi}</span>` : ''}</span>`;
  }

  /* ---------- Speicher ---------- */
  const fehlerEl = $('#fehler');
  function zeigeFehler(text) { fehlerEl.textContent = text; fehlerEl.hidden = false; }
  function lies(key) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; }
    catch (e) { zeigeFehler('Gespeicherte Daten konnten nicht gelesen werden (' + key + '): ' + e.message); return null; }
  }
  function schreib(key, wert) {
    try { localStorage.setItem(key, JSON.stringify(wert)); return true; }
    catch (e) {
      const voll = e && (e.name === 'QuotaExceededError' || e.code === 22);
      zeigeFehler(voll
        ? 'Speichern fehlgeschlagen: Der Browserspeicher ist voll (wird mit deinen anderen Tools geteilt). Bitte exportiere eine Sicherung und schaffe Platz in einem anderen Tool.'
        : 'Speichern fehlgeschlagen: ' + (e && e.message));
      return false;
    }
  }

  /* ---------- IndexedDB ---------- */
  let dbp = null;
  function openDb() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('IndexedDB ist in diesem Browser nicht verfügbar'));
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(DB_STORE)) r.result.createObjectStore(DB_STORE); };
      r.onsuccess = () => { const d = r.result; d.onversionchange = () => { d.close(); dbp = null; }; res(d); };
      r.onerror = () => { dbp = null; rej(r.error || new Error('Datenbank konnte nicht geöffnet werden')); };
      r.onblocked = () => { dbp = null; rej(new Error('Datenbank ist blockiert (Tool in einem anderen Tab offen?)')); };
    });
    return dbp;
  }
  async function idb(modus, key, wert) {
    const d = await openDb();
    return new Promise((res, rej) => {
      const t = d.transaction(DB_STORE, modus === 'get' ? 'readonly' : 'readwrite'), st = t.objectStore(DB_STORE);
      const q = modus === 'get' ? st.get(key) : modus === 'put' ? st.put(wert, key) : st.delete(key);
      t.oncomplete = () => res(modus === 'get' ? q.result : true);
      t.onerror = t.onabort = () => rej(t.error || q.error || new Error('Datenbankfehler'));
    });
  }

  // Leere Felder weglassen (null, '', false) – spart gut die Hälfte des Platzes, ohne Informationen zu verlieren
  function kompakt(e) {
    const o = {};
    for (const [k, v] of Object.entries(e || {})) {
      if (v === null || v === undefined || v === '' || v === false) continue;
      o[k] = (k === 'auto' && v && typeof v === 'object') ? kompakt(v) : v;
    }
    return o;
  }
  // Leistung wird wie im Spiel in kW gespeichert. Ältere Einträge hatten "ps" → einmalig umrechnen.
  function psZuKw(e) {
    if (!e || e.ps == null) return e;
    const o = Object.assign({}, e);
    if (o.kw == null) o.kw = Math.round(Number(o.ps) / 1.35962);
    delete o.ps;
    return o;
  }
  function normDaten(d) {
    d = (d && typeof d === 'object') ? d : {};
    return {
      version: VERSION,
      eintraege: Array.isArray(d.eintraege) ? d.eintraege.filter(x => x && x.uid).map(psZuKw).map(kompakt) : [],
      promo: (d.promo && typeof d.promo === 'object' && !Array.isArray(d.promo)) ? d.promo : {},
      geaendert: d.geaendert
    };
  }

  let daten = normDaten(null);
  let bereit = false;          // erst nach dem Laden darf gespeichert werden
  let speicherArt = 'idb';     // 'idb' oder – falls IndexedDB nicht geht – 'ls'
  // Horizon Promo: pro Modell (Fahrzeug-ID → Datum), unabhängig vom Besitz
  const hatPromo = id => !!daten.promo[id];
  const ui = Object.assign({ tab: 'garage', sortG: 'neu', sortK: 'name' }, lies(K_UI) || {});
  if (ui.sortG === 'ps') ui.sortG = 'kw';   // frühere Sortierung „Leistung (PS)“

  // Lädt die Garage. Übernimmt einmalig alte Daten aus dem localStorage und entfernt sie erst danach.
  async function ladeDaten() {
    try {
      let d = await idb('get', 'daten');
      const alt = lies(K_DATEN);
      if (!d && alt) {
        d = normDaten(alt);
        await idb('put', 'daten', d);
        const probe = await idb('get', 'daten');
        if (!probe || !Array.isArray(probe.eintraege) || probe.eintraege.length !== d.eintraege.length) throw new Error('Übernahme in die Datenbank ließ sich nicht bestätigen');
        localStorage.removeItem(K_DATEN);
        toast(`Garage in die eigene Datenbank umgezogen (${d.eintraege.length} Einträge)`);
      } else if (d && alt) {
        localStorage.removeItem(K_DATEN);   // Rest eines früheren, bereits erfolgten Umzugs
      }
      daten = normDaten(d);
      try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (_) { /* optional */ }
    } catch (e) {
      speicherArt = 'ls';
      daten = normDaten(lies(K_DATEN));
      zeigeFehler('Die Datenbank (IndexedDB) ist nicht nutzbar: ' + e.message + '. Die Garage bleibt vorerst im gemeinsamen localStorage – bitte regelmäßig exportieren.');
    }
    bereit = true;
  }

  let schreibKette = Promise.resolve();
  function schreibDaten() {
    const stand = JSON.parse(JSON.stringify(daten));
    const job = schreibKette.then(async () => {
      if (speicherArt === 'ls') return schreib(K_DATEN, stand);
      try { await idb('put', 'daten', stand); return true; }
      catch (e) {
        const voll = e && e.name === 'QuotaExceededError';
        zeigeFehler(voll ? 'Speichern fehlgeschlagen: Der Speicher dieses Browsers ist voll. Bitte exportiere eine Sicherung.' : 'Speichern fehlgeschlagen: ' + (e && e.message));
        return false;
      }
    });
    schreibKette = job.catch(() => false);
    return job;
  }
  async function speichern() {
    if (!bereit) { zeigeFehler('Die Garage wird noch geladen – bitte gleich noch einmal speichern.'); return false; }
    daten.geaendert = new Date().toISOString();
    const ok = await schreibDaten();
    if (ok && SYNC) SYNC.changed();   // gemeinsamer Sync: nach jedem erfolgreichen Speichern melden
    return ok;
  }

  /* ---------- Gemeinsamer GitHub-Sync (/startseite/sync-v1.js) ----------
     Privates Repo tool-daten, Datei fh6-garage.json. Token/Repo nur auf der Startseite.
     Abgeglichen werden die Garage-Einträge (ID-Feld "uid") und die Promo-Häkchen.
     Die Fahrzeugliste wird nicht abgeglichen (kommt aus dem Repo bzw. von forza.net). */
  let SYNC = null;
  function initSync() {
    if (!window.ToolSync) return;
    SYNC = ToolSync.create({
      tool: 'fh6-garage',
      collections: { eintraege: { type: 'array', id: 'uid' }, promo: 'map' },
      get: () => ({ eintraege: daten.eintraege, promo: daten.promo }),
      apply: async d => {
        daten.eintraege = Array.isArray(d.eintraege) ? d.eintraege.map(psZuKw).map(kompakt) : [];
        daten.promo = d.promo && typeof d.promo === 'object' && !Array.isArray(d.promo) ? d.promo : {};
        daten.geaendert = new Date().toISOString();
        const ok = await schreibDaten();
        fuelleFilter(); render();
        return ok;
      }
    });
    SYNC.start();
  }
  function uiSpeichern() { schreib(K_UI, ui); }

  /* ---------- Fahrzeugliste ---------- */
  let liste = [], listeMeta = {}, nachId = new Map();

  function setzeListe(obj, herkunft) {
    liste = obj.fahrzeuge;
    listeMeta = { quelle: obj.quelle, stand: obj.stand, herkunft };
    nachId = new Map(liste.map(f => [f.id, f]));
    liste.forEach(f => { f._such = norm(f.n + ' ' + f.m + ' ' + f.t + ' ' + f.l); });
  }

  // Wandelt die rohen Tabellenzeilen von forza.net in das Listenformat
  function konvertiereRoh(rows) {
    if (!Array.isArray(rows) || !rows.length) throw new Error('Keine Zeilen gefunden.');
    const ids = new Set();
    const out = rows.map((r, i) => {
      if (!Array.isArray(r) || r.length < 6) throw new Error('Zeile ' + (i + 1) + ' hat ein unerwartetes Format.');
      const [m, n, t, cls, co, b, a] = r;
      const mm = String(cls).match(/(\d{3})\s*(S1|S2|[DCBARX])/);
      const pi = mm ? Number(mm[1]) : null;
      let id = slug(n); while (ids.has(id)) id += '-2'; ids.add(id);
      const e = { id, m, n, j: Number(String(n).slice(0, 4)) || null, t, pi, k: mm ? mm[2] : klasseVonPi(pi), l: LAENDER[co] || co, b: String(b || '').split(',').map(x => x.trim()).filter(Boolean).map(x => BEZUG[x] || x) };
      if (a) e.a = a;
      return e;
    });
    return { quelle: 'forza.net/fh6cars', stand: new Date().toISOString().slice(0, 10), fahrzeuge: out };
  }

  async function ladeListe() {
    let eigene = null;
    if (speicherArt === 'idb') {
      try {
        eigene = await idb('get', 'fahrzeugliste');
        const alt = lies(K_LISTE);
        if (!eigene && alt && Array.isArray(alt.fahrzeuge)) { await idb('put', 'fahrzeugliste', alt); eigene = alt; }
        if (alt && await idb('get', 'fahrzeugliste')) localStorage.removeItem(K_LISTE);
      } catch (e) { zeigeFehler('Aktualisierte Fahrzeugliste konnte nicht gelesen werden: ' + e.message); }
    } else eigene = lies(K_LISTE);
    if (eigene && Array.isArray(eigene.fahrzeuge) && eigene.fahrzeuge.length) {
      setzeListe(eigene, 'aktualisiert');
      return;
    }
    try {
      const r = await fetch('data/fahrzeuge.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      setzeListe(await r.json(), 'mitgeliefert');
    } catch (e) {
      zeigeFehler('Fahrzeugliste (data/fahrzeuge.json) konnte nicht geladen werden: ' + e.message + '. Deine Garage ist trotzdem da, nur Katalog und Suche fehlen.');
      setzeListe({ fahrzeuge: [] }, 'fehlt');
    }
  }

  /* ---------- Einträge ---------- */
  function autoVon(e) { return nachId.get(e.autoId) || e.auto || {}; }
  function anzahlProAuto() {
    const m = new Map();
    daten.eintraege.forEach(e => m.set(e.autoId, (m.get(e.autoId) || 0) + 1));
    return m;
  }

  /* ---------- Filter & Darstellung ---------- */
  const f = {
    suche: $('#fSuche'), klasse: $('#fKlasse'), land: $('#fLand'), typ: $('#fTyp'),
    reifen: $('#fReifen'), antrieb: $('#fAntrieb'), besitz: $('#fBesitz'), promo: $('#fPromo'), sort: $('#fSort'), fav: $('#fFav')
  };

  function optionen(sel, werte, leer) {
    const alt = sel.value;
    sel.innerHTML = `<option value="">${leer}</option>` + werte.map(w => `<option>${esc(w)}</option>`).join('');
    if (werte.includes(alt)) sel.value = alt;
  }
  function fuelleFilter() {
    const autos = [...liste, ...daten.eintraege.map(e => e.auto || {})];
    optionen(f.klasse, KLASSEN, 'Alle Klassen');
    optionen(f.land, [...new Set(autos.map(a => a.l).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de')), 'Alle Länder');
    optionen(f.typ, [...new Set(autos.map(a => a.t).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de')), 'Alle Typen');
    optionen(f.reifen, REIFEN, 'Alle Reifen');
    optionen(f.antrieb, ANTRIEB, 'Jeder Antrieb');
  }
  function fuelleSort() {
    const opts = ui.tab === 'garage' ? SORT_GARAGE : SORT_KATALOG;
    f.sort.innerHTML = opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
    f.sort.value = ui.tab === 'garage' ? ui.sortG : ui.sortK;
    if (!f.sort.value) f.sort.value = opts[0][0];
  }

  function passtPromo(id) {
    if (f.promo.value === 'ja') return hatPromo(id);
    if (f.promo.value === 'nein') return !hatPromo(id);
    return true;
  }
  function setzePromo(id, an) {
    if (an) daten.promo[id] = new Date().toISOString(); else delete daten.promo[id];
    render();
    speichern();
  }

  function passtAuto(a, extra = '') {
    const q = norm(f.suche.value).trim();
    if (q && !q.split(/\s+/).every(w => (norm(a.n + ' ' + a.m + ' ' + a.t + ' ' + a.l) + ' ' + extra).includes(w))) return false;
    if (f.land.value && a.l !== f.land.value) return false;
    if (f.typ.value && a.t !== f.typ.value) return false;
    return true;
  }

  function renderGarage() {
    const tb = $('#tabGarage tbody');
    let arr = daten.eintraege.filter(e => {
      const a = autoVon(e);
      if (!passtAuto(a, norm([e.build, e.design, e.notiz, e.reifen, e.antrieb, e.code].join(' ')))) return false;
      if (f.klasse.value && klasseVonPi(e.pi ?? a.pi) !== f.klasse.value) return false;
      if (f.reifen.value && e.reifen !== f.reifen.value) return false;
      if (f.antrieb.value && e.antrieb !== f.antrieb.value) return false;
      if (f.fav.checked && !e.fav) return false;
      if (!passtPromo(e.autoId)) return false;
      return true;
    });
    const s = ui.sortG, nv = v => v ?? -Infinity;
    const cmp = {
      neu: (x, y) => (y.geaendert || '').localeCompare(x.geaendert || ''),
      name: (x, y) => nachModell(autoVon(x), autoVon(y)) || (x.build || '').localeCompare(y.build || '', 'de'),
      jahr: (x, y) => nachJahr(autoVon(x), autoVon(y)) || (x.build || '').localeCompare(y.build || '', 'de'),
      pi: (x, y) => nv(y.pi ?? autoVon(y).pi) - nv(x.pi ?? autoVon(x).pi),
      vmax: (x, y) => nv(y.vmax) - nv(x.vmax),
      a100: (x, y) => (x.a100 ?? Infinity) - (y.a100 ?? Infinity),
      kw: (x, y) => nv(y.kw) - nv(x.kw),
      kg: (x, y) => (x.kg ?? Infinity) - (y.kg ?? Infinity)
    }[s] || (() => 0);
    arr.sort(cmp);

    const z = (v, d, l, cls = 'zahl') => v == null ? `<td class="${cls} leer-wert">–</td>` : `<td class="${cls}" data-l="${l}">${fmt(v, d)}</td>`;
    tb.innerHTML = arr.map(e => {
      const a = autoVon(e);
      return `<tr data-uid="${esc(e.uid)}">
        <td class="vgl"><input type="checkbox" class="vgl-wahl" data-uid="${esc(e.uid)}" ${vergleich.has(e.uid) ? 'checked' : ''} aria-label="Zum Vergleichen auswählen"></td>
        <td class="stern">${e.fav ? '★' : ''}</td>
        <td class="name"><b>${nameHtml(a)}${hatPromo(e.autoId) ? ' <span class="promo-mini" title="Horizon Promo fotografiert">📷</span>' : ''}</b>${e.build ? `<span class="build">${esc(e.build)}</span>` : ''}${e.design ? `<span class="design" title="Design / Lackierung">🎨 ${esc(e.design)}</span>` : ''}</td>
        <td class="mob-weg">${esc(a.l || '')}</td>
        <td class="mob-weg leise">${esc(a.t || '')}</td>
        <td class="mob-weg">${badge(a.pi, a.k)}</td>
        <td class="klassen">${e.pi != null ? badge(e.pi) : '<span class="leise">–</span>'}</td>
        ${z(e.vmax, 0, 'km/h')}${z(e.a100, e.a100 != null && e.a100 < 10 ? 2 : 1, '0–100 s')}${z(e.kw, 0, 'kW')}${z(e.kg, 0, 'kg')}
        <td ${e.reifen ? 'data-l="Reifen"' : 'class="leer-wert"'}>${esc(e.reifen || '–')}</td>
        <td ${e.antrieb ? 'data-l="Antrieb"' : 'class="leer-wert"'}>${esc(e.antrieb || '–')}</td>
      </tr>`;
    }).join('');
    $('#leerGarage').hidden = daten.eintraege.length > 0;
    $('#tabGarage').parentElement.hidden = daten.eintraege.length === 0;
  }

  const KATALOG_MAX = 300;
  function renderKatalog() {
    const anz = anzahlProAuto();
    let arr = liste.filter(a => {
      if (!passtAuto(a)) return false;
      if (f.klasse.value && a.k !== f.klasse.value) return false;
      const n = anz.get(a.id) || 0;
      if (f.besitz.value === 'ja' && !n) return false;
      if (f.besitz.value === 'nein' && n) return false;
      if (!passtPromo(a.id)) return false;
      return true;
    });
    const cmp = {
      name: nachModell,
      jahr: nachJahr,
      pi: (x, y) => (y.pi || 0) - (x.pi || 0),
      besitz: (x, y) => (anz.get(y.id) || 0) - (anz.get(x.id) || 0) || nachModell(x, y)
    }[ui.sortK] || (() => 0);
    arr.sort(cmp);
    const gesamt = arr.length;
    arr = arr.slice(0, KATALOG_MAX);
    $('#tabKatalog tbody').innerHTML = arr.map(a => {
      const n = anz.get(a.id) || 0;
      return `<tr data-auto="${esc(a.id)}">
        <td class="name"><b>${nameHtml(a)}</b></td>
        <td class="mob-weg">${esc(a.l)}</td>
        <td data-l="Typ" class="leise">${esc(a.t)}</td>
        <td class="klassen">${badge(a.pi, a.k)}</td>
        <td class="mob-weg">${(a.b || []).map(b => `<span class="tag">${esc(b)}</span>`).join('')}${a.a ? `<span class="tag dlc">${esc(a.a)}</span>` : ''}</td>
        <td class="zahl" ${n ? 'data-l="In Garage"' : ''}>${n ? `<span class="anzahl">${n}×</span>` : ''}</td>
        <td class="promo-zelle"><button class="promo-btn${hatPromo(a.id) ? ' an' : ''}" data-promo="${esc(a.id)}" aria-pressed="${hatPromo(a.id)}" title="${hatPromo(a.id) ? 'Fotografiert – zum Entfernen klicken' : 'Für Horizon Promo als fotografiert markieren'}">📷<span>${hatPromo(a.id) ? 'Foto ✓' : 'Foto'}</span></button></td>
        <td class="aktion"><button class="btn klein" data-neu="${esc(a.id)}">+ Garage</button></td>
      </tr>`;
    }).join('');
    $('#mehrKatalog').textContent = gesamt > KATALOG_MAX
      ? `${KATALOG_MAX} von ${gesamt} Treffern angezeigt – Suche oder Filter eingrenzen.`
      : `${gesamt} Fahrzeuge`;
  }

  /* ---------- Abdeckung: Marken, Typen, PI-Klassen ----------
     Klasse eines Eintrags = Klasse nach Upgrade (PI des Eintrags), sonst Serienklasse. */
  const klasseVon = e => klasseVonPi(e.pi ?? autoVon(e).pi) || autoVon(e).k || '';
  function balken(beschr, wert, max, text, farbe) {
    const p = max ? Math.round(wert / max * 100) : 0;
    return `<div class="balken"><span class="b-name" title="${esc(beschr)}">${esc(beschr)}</span><span class="b-spur"><span class="b-fuell" style="width:${p}%;${farbe ? 'background:' + farbe : ''}"></span></span><span class="b-wert">${text}</span></div>`;
  }
  function abdeckungListe(schluessel) {
    const alle = new Map(), drin = new Map();
    for (const a of liste) { const k = a[schluessel]; if (k) alle.set(k, (alle.get(k) || 0) + 1); }
    const besessen = new Set(daten.eintraege.map(e => e.autoId));
    for (const a of liste) if (besessen.has(a.id) && a[schluessel]) drin.set(a[schluessel], (drin.get(a[schluessel]) || 0) + 1);
    return [...alle].map(([k, n]) => ({ k, n, d: drin.get(k) || 0 }))
      .sort((x, y) => (y.d / y.n) - (x.d / x.n) || y.d - x.d || x.k.localeCompare(y.k, 'de'));
  }
  function renderAbdeckung() {
    const ein = daten.eintraege;
    // Kennzahlen
    const marken = abdeckungListe('m'), typen = abdeckungListe('t');
    const kombi = new Map();   // "Marke|Typ" → { m, t, k: {Klasse: [uids]} }
    for (const e of ein) {
      const a = autoVon(e), m = a.m || '–', t = a.t || '–', kl = klasseVon(e);
      const key = m + '|' + t;
      if (!kombi.has(key)) kombi.set(key, { m, t, k: {} });
      (kombi.get(key).k[kl] = kombi.get(key).k[kl] || []).push(e.uid);
    }
    // Modelle aus der Liste, die in der Garage stehen, aber für Horizon Promo noch nicht fotografiert sind
    const nichtFoto = new Set(ein.filter(x => nachId.has(x.autoId) && !hatPromo(x.autoId)).map(x => x.autoId)).size;
    let doppelt = 0;
    for (const z of kombi.values()) for (const k of KLASSEN) if ((z.k[k] || []).length > 1) doppelt++;
    $('#abdKpis').innerHTML = [
      ['Einträge', ein.length],
      ['Marken', `${marken.filter(x => x.d).length} / ${marken.length}`],
      ['Autotypen', `${typen.filter(x => x.d).length} / ${typen.length}`],
      ['Marke + Typ', kombi.size],
      ['Doppelte Klassen', doppelt, doppelt ? 'warn' : ''],
      ['In Garage, nicht fotografiert', nichtFoto, 'link', 'promo']
    ].map(([l, v, c, aktion]) => `<div class="kpi ${c || ''}"${aktion ? ` data-kpi="${aktion}" role="button" tabindex="0" title="In der Garage anzeigen"` : ''}><span class="kpi-wert">${v}</span><span class="kpi-name">${l}${aktion ? ' →' : ''}</span></div>`).join('');

    // Matrix Marke × Typ × Klasse
    const q = norm($('#abdSuche').value).trim(), nurDoppelt = $('#abdDoppelt').checked;
    let zeilen = [...kombi.values()]
      .filter(z => !q || q.split(/\s+/).every(w => norm(z.m + ' ' + z.t).includes(w)))
      .filter(z => !nurDoppelt || KLASSEN.some(k => (z.k[k] || []).length > 1))
      .sort((x, y) => x.m.localeCompare(y.m, 'de') || x.t.localeCompare(y.t, 'de'));
    const tb = zeilen.map((z, i) => {
      const neueMarke = i === 0 || zeilen[i - 1].m !== z.m;
      const zellen = KLASSEN.map(k => {
        const n = (z.k[k] || []).length;
        return n
          ? `<td class="zelle k-${k} ${n > 1 ? 'doppelt' : 'belegt'}" data-m="${esc(z.m)}" data-t="${esc(z.t)}" data-k="${k}" title="${n} × ${esc(z.m)} · ${esc(z.t)} · ${k}">${n}</td>`
          : `<td class="zelle frei" data-m="${esc(z.m)}" data-t="${esc(z.t)}" title="Frei: ${esc(z.m)} · ${esc(z.t)} · ${k} – im Katalog suchen"></td>`;
      }).join('');
      const belegt = KLASSEN.filter(k => z.k[k]).length;
      return `<tr class="${neueMarke ? 'neue-marke' : ''}"><th class="m">${neueMarke ? esc(z.m) : ''}</th><th class="t">${esc(z.t)}</th>${zellen}<td class="summe">${belegt}</td></tr>`;
    }).join('');
    $('#abdMatrix').innerHTML = `<thead><tr><th>Marke</th><th>Typ</th>${KLASSEN.map(k => `<th class="kl"><span class="badge k-${k}"><span class="k">${k}</span></span></th>`).join('')}<th class="summe" title="Belegte Klassen">Kl.</th></tr></thead><tbody>${tb || `<tr><td colspan="${KLASSEN.length + 3}" class="leise" style="padding:16px">${ein.length ? 'Keine passenden Einträge.' : 'Noch keine Autos in der Garage.'}</td></tr>`}</tbody>`;

    // Balken: Klassen, Marken, Typen
    const proKlasse = KLASSEN.map(k => ({ k, n: ein.filter(e => klasseVon(e) === k).length }));
    const maxK = Math.max(1, ...proKlasse.map(x => x.n));
    $('#abdKlassen').innerHTML = proKlasse.map(x => balken(x.k, x.n, maxK, x.n, `var(--k${x.k})`)).join('');
    $('#abdMarken').innerHTML = marken.map(x => balken(x.k, x.d, x.n, `${x.d}/${x.n}`)).join('');
    $('#abdTypen').innerHTML = typen.map(x => balken(x.k, x.d, x.n, `${x.d}/${x.n}`)).join('');
  }

  /* ---------- Rennen: Event-Finder und Bestenliste ----------
     Vorgaben liegen in ui.event (klein, localStorage). Klasse eines Eintrags = nach Upgrade, sonst Serie. */
  const KATEGORIEN = ['Straße', 'Rally', 'Offroad', 'Drift'];
  const kategorieVon = t => /Rally/.test(t || '') ? 'Rally'
    : /^(Buggies|Offroad|Pickups & 4x4's|UTV's|Unlimited Buggies|Unlimited Offroad)$/.test(t || '') ? 'Offroad'
    : t === 'Drift Cars' ? 'Drift' : 'Straße';
  const EV_FELDER = ['klasse', 'typ', 'marke', 'land', 'von', 'bis', 'antrieb', 'reifen', 'sort'];
  ui.event = Object.assign({ sort: 'a100' }, ui.event || {});
  const ev = Object.fromEntries(EV_FELDER.map(k => [k, $('#ev' + k[0].toUpperCase() + k.slice(1))]));
  function fuelleEventFilter() {
    const autos = [...liste, ...daten.eintraege.map(x => x.auto || {})];
    const werte = s => [...new Set(autos.map(a => a[s]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
    optionen(ev.klasse, KLASSEN, 'egal'); optionen(ev.typ, werte('t'), 'egal'); optionen(ev.marke, werte('m'), 'egal');
    optionen(ev.land, werte('l'), 'egal'); optionen(ev.antrieb, ANTRIEB, 'egal'); optionen(ev.reifen, REIFEN, 'egal');
    for (const k of EV_FELDER) if (ui.event[k] != null) ev[k].value = ui.event[k];
  }
  const nachWert = (feld) => feld === 'a100' ? (x, y) => (x.a100 ?? Infinity) - (y.a100 ?? Infinity)
    : feld === 'pi' ? (x, y) => (y.pi ?? autoVon(y).pi ?? -1) - (x.pi ?? autoVon(x).pi ?? -1)
    : (x, y) => (y[feld] ?? -Infinity) - (x[feld] ?? -Infinity);
  function evZeile(x) {
    const a = autoVon(x);
    const w = [x.vmax != null ? fmt(x.vmax, 0) + ' km/h' : '', x.a100 != null ? fmt(x.a100, 2) + ' s' : '', x.kw != null ? fmt(x.kw, 0) + ' kW' : ''].filter(Boolean).join(' · ');
    return `<div class="ev-zeile" data-uid="${esc(x.uid)}">
      <span class="ev-name"><b>${nameHtml(a)}</b>${x.build ? ` <span class="build">${esc(x.build)}</span>` : ''}<small>${esc(a.t || '')}</small></span>
      <span>${badge(x.pi ?? a.pi, x.pi != null ? null : a.k)}</span>
      <span class="ev-werte">${w || '<span class="leise">keine Werte</span>'}</span>
      <span class="ev-tags">${x.antrieb ? `<span class="tag">${esc(x.antrieb)}</span>` : ''}${x.reifen ? `<span class="tag">${esc(x.reifen)}</span>` : ''}</span>
    </div>`;
  }
  function evKatalogZeile(a) {
    return `<div class="ev-zeile" data-auto="${esc(a.id)}">
      <span class="ev-name"><b>${nameHtml(a)}</b><small>${esc(a.t)}</small></span>
      <span>${badge(a.pi, a.k)}</span>
      <span class="ev-werte">${(a.b || []).map(b => `<span class="tag">${esc(b)}</span>`).join('')}${a.a ? `<span class="tag dlc">${esc(a.a)}</span>` : ''}</span>
      <span class="ev-tags"><button class="btn klein" data-neu="${esc(a.id)}">+ Garage</button></span>
    </div>`;
  }
  function evBlock(titel, hinweis, zeilen, max, html) {
    if (!zeilen.length) return '';
    const mehr = zeilen.length > max ? `<p class="hinweis">… und ${zeilen.length - max} weitere</p>` : '';
    return `<div class="ev-block"><h4>${titel} <span class="anzahl">${zeilen.length}</span></h4>${hinweis ? `<p class="hinweis">${hinweis}</p>` : ''}${zeilen.slice(0, max).map(html).join('')}${mehr}</div>`;
  }
  function renderRennen() {
    fuelleEventFilter();
    const v = ui.event, kIdx = v.klasse ? KLASSEN.indexOf(v.klasse) : -1;
    const von = zahl(v.von), bis = zahl(v.bis);
    const passtA = a => (!v.typ || a.t === v.typ) && (!v.marke || a.m === v.marke) && (!v.land || a.l === v.land)
      && (von == null || (jahrVon(a) || 0) >= von) && (bis == null || (jahrVon(a) || 9999) <= bis);
    const irgendwas = EV_FELDER.some(k => k !== 'sort' && v[k]);
    let html = '';
    if (!irgendwas) html = '<p class="leer">Wähle mindestens eine Vorgabe, z. B. Klasse und Typ.</p>';
    else {
      const kandidaten = daten.eintraege.filter(x => passtA(autoVon(x)) && (!v.antrieb || x.antrieb === v.antrieb) && (!v.reifen || x.reifen === v.reifen));
      const sortiert = arr => arr.sort(nachWert(v.sort || 'a100'));
      const direkt = sortiert(kandidaten.filter(x => kIdx < 0 || klasseVon(x) === v.klasse));
      const hoch = kIdx < 0 ? [] : sortiert(kandidaten.filter(x => KLASSEN.indexOf(klasseVon(x)) < kIdx && KLASSEN.indexOf(klasseVon(x)) >= 0));
      const besessen = new Set(daten.eintraege.map(x => x.autoId));
      const kaufen = liste.filter(a => passtA(a) && !besessen.has(a.id) && (kIdx < 0 || KLASSEN.indexOf(a.k) <= kIdx))
        .sort((x, y) => (y.pi || 0) - (x.pi || 0));
      html = evBlock('In deiner Garage', v.klasse ? `aktuell Klasse ${v.klasse}` : '', direkt, 40, evZeile)
        + evBlock('Ließe sich hochrüsten', `passt sonst, ist aber unter ${v.klasse} – bräuchte einen weiteren Build`, hoch, 15, evZeile)
        + evBlock('Noch nicht in der Garage', (v.antrieb || v.reifen ? 'Antrieb und Reifen kann der Katalog nicht prüfen. ' : '') + (v.klasse ? `Serie in Klasse ${v.klasse} oder darunter` : ''), kaufen, 20, evKatalogZeile);
      if (!direkt.length && !hoch.length && !kaufen.length) html = '<p class="leer">Kein Auto passt zu diesen Vorgaben.</p>';
      else if (!direkt.length) html = `<p class="hinweis warnung">Kein Auto in deiner Garage passt direkt.</p>` + html;
    }
    $('#evErgebnis').innerHTML = html;
    renderBestenliste();
  }
  function renderBestenliste() {
    const feld = $('#blWert').value, n = Number($('#blAnzahl').value);
    const einheit = { a100: x => fmt(x.a100, 2) + ' s', vmax: x => fmt(x.vmax, 0) + ' km/h', kw: x => fmt(x.kw, 0) + ' kW' }[feld];
    const mitWert = daten.eintraege.filter(x => x[feld] != null);
    const zeilen = KLASSEN.map(k => {
      const zellen = KATEGORIEN.map(kat => {
        const top = mitWert.filter(x => klasseVon(x) === k && kategorieVon(autoVon(x).t) === kat).sort(nachWert(feld)).slice(0, n);
        return `<td>${top.map((x, i) => `<div class="bl-eintrag" data-uid="${esc(x.uid)}"><span class="bl-platz">${i + 1}</span><span class="bl-name">${esc(modell(autoVon(x)))}${x.build ? ` <span class="build">${esc(x.build)}</span>` : ''}</span><span class="bl-wert">${einheit(x)}</span></div>`).join('') || '<span class="leise">–</span>'}</td>`;
      }).join('');
      return `<tr><th>${badge(null, k)}</th>${zellen}</tr>`;
    }).join('');
    $('#blTabelle').innerHTML = `<thead><tr><th>Klasse</th>${KATEGORIEN.map(k => `<th>${k}</th>`).join('')}</tr></thead><tbody>${zeilen}</tbody>`;
  }
  EV_FELDER.forEach(k => ev[k].addEventListener('input', () => { ui.event[k] = ev[k].value; uiSpeichern(); renderRennen(); }));
  $('#evReset').addEventListener('click', () => { ui.event = { sort: ui.event.sort || 'a100' }; uiSpeichern(); EV_FELDER.forEach(k => { if (k !== 'sort') ev[k].value = ''; }); renderRennen(); });
  ['#blWert', '#blAnzahl'].forEach(sel => $(sel).addEventListener('input', renderBestenliste));
  $('#ansichtRennen').addEventListener('click', ev_ => {
    const neuB = ev_.target.closest('[data-neu]'); if (neuB) { oeffneDialog(null, neuB.dataset.neu); return; }
    const z = ev_.target.closest('[data-uid]'); if (z) { const x = daten.eintraege.find(y => y.uid === z.dataset.uid); if (x) oeffneDialog(x); return; }
    const k = ev_.target.closest('[data-auto]'); if (k) oeffneDialog(null, k.dataset.auto);
  });

  function renderStat() {
    const anz = anzahlProAuto();
    const besessen = liste.filter(a => anz.has(a.id)).length;
    const promo = liste.filter(a => hatPromo(a.id)).length;
    $('#statZeile').textContent = liste.length
      ? `${daten.eintraege.length} Einträge · ${besessen} von ${liste.length} Modellen (${Math.round(besessen / liste.length * 100)} %) · 📷 Promo ${promo} von ${liste.length}`
      : `${daten.eintraege.length} Einträge`;
  }

  // Alle Filter (nicht die Sortierung) auf „alle“ zurücksetzen
  const FILTER = () => [f.klasse, f.land, f.typ, f.reifen, f.antrieb, f.besitz, f.promo];
  function filterAktiv() { return !!(f.suche.value.trim() || f.fav.checked || FILTER().some(x => x.value)); }
  function filterZuruecksetzen() { f.suche.value = ''; f.fav.checked = false; FILTER().forEach(x => { x.value = ''; }); }

  function render() {
    document.body.dataset.tab = ui.tab;
    $('#fReset').hidden = !filterAktiv();
    $$('.tab').forEach(t => t.classList.toggle('aktiv', t.dataset.tab === ui.tab));
    $('#ansichtGarage').hidden = ui.tab !== 'garage';
    $('#ansichtKatalog').hidden = ui.tab !== 'katalog';
    $('#ansichtAbdeckung').hidden = ui.tab !== 'abdeckung';
    $('#ansichtRennen').hidden = ui.tab !== 'rennen';
    if (ui.tab === 'garage') renderGarage();
    else if (ui.tab === 'katalog') renderKatalog();
    else if (ui.tab === 'abdeckung') renderAbdeckung();
    else renderRennen();
    vergleichLeiste();
    renderStat();
  }

  function toast(t) {
    const el = $('#toast'); el.textContent = t; el.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { el.hidden = true; }, 2600);
  }

  /* ---------- Eintrag-Dialog ---------- */
  const dlg = $('#dlgEintrag');
  const e = {
    suche: $('#eAutoSuche'), treffer: $('#autoTreffer'), info: $('#eAutoInfo'), eigenesBtn: $('#eEigenesBtn'), eigenes: $('#eEigenes'),
    build: $('#eBuild'), design: $('#eDesign'), pi: $('#ePi'), piBadge: $('#ePiBadge'), vmax: $('#eVmax'), a100: $('#eA100'),
    reifen: $('#eReifen'), antrieb: $('#eAntrieb'), kw: $('#eKw'), kg: $('#eKg'), nm: $('#eNm'),
    code: $('#eCode'), notiz: $('#eNotiz'), fav: $('#eFav'), promo: $('#ePromo'), promoWrap: $('#ePromoWrap'), vorhanden: $('#eVorhanden'),
    xMarke: $('#xMarke'), xName: $('#xName'), xLand: $('#xLand'), xTyp: $('#xTyp'), xPi: $('#xPi')
  };
  e.reifen.innerHTML = '<option value="">–</option>' + REIFEN.map(r => `<option>${r}</option>`).join('');
  e.antrieb.innerHTML = '<option value="">–</option>' + ANTRIEB.map(r => `<option>${r}</option>`).join('');

  let bearbeitet = null;   // uid oder null
  let gewaehlt = null;     // Auto-Objekt aus der Liste
  let eigenesModus = false;

  function zeigeAutoInfo() {
    const a = gewaehlt;
    e.promoWrap.hidden = !a;
    if (a) e.promo.checked = hatPromo(a.id);
    if (!a) { e.info.innerHTML = ''; return; }
    e.info.innerHTML = `<b>${esc(a.n)}</b><span>${esc(a.l)}</span><span class="leise">${esc(a.t)}</span><span>Serie ${badge(a.pi, a.k)}</span>`
      + (a.a ? `<span class="tag dlc">${esc(a.a)}</span>` : '');
  }
  function waehleAuto(a) {
    gewaehlt = a; eigenesModus = false; e.eigenes.hidden = true;
    e.suche.value = ''; e.treffer.hidden = true; zeigeAutoInfo(); zeigeVorhanden();
  }

  /* Ist das gewählte Auto schon in der Garage? Beim Neuanlegen Hinweis zeigen und anbieten,
     stattdessen einen vorhandenen Eintrag zu aktualisieren (die Werte im Formular bleiben dabei). */
  const buildName = x => x.build || 'ohne Build-Namen';
  function vorhandeneZu(autoId) { return daten.eintraege.filter(x => x.autoId === autoId); }
  function zeigeVorhanden() {
    const box = e.vorhanden;
    const liste_ = (!bearbeitet && gewaehlt) ? vorhandeneZu(gewaehlt.id) : [];
    if (!liste_.length) { box.hidden = true; box.innerHTML = ''; return; }
    const pi = zahl(e.pi.value);
    box.innerHTML = `<b>Schon in der Garage:</b> Speichern legt einen weiteren Build an – oder einen vorhandenen aktualisieren:`
      + liste_.map(x => `<div class="vh-zeile${pi != null && x.pi === pi ? ' gleich' : ''}">
          <span>${esc(buildName(x))} ${x.pi != null ? badge(x.pi) : ''}${pi != null && x.pi === pi ? ' <small>gleicher PI</small>' : ''}</span>
          <button type="button" class="btn klein" data-uebernehmen="${esc(x.uid)}">Diesen aktualisieren</button></div>`).join('');
    box.hidden = false;
  }
  e.vorhanden.addEventListener('click', ev => {
    const b = ev.target.closest('[data-uebernehmen]'); if (!b) return;
    const x = daten.eintraege.find(y => y.uid === b.dataset.uebernehmen); if (!x) return;
    bearbeitet = x.uid;
    $('#dlgTitel').textContent = 'Fahrzeug bearbeiten';
    $('#eLoeschen').hidden = false; $('#eKopie').hidden = false;
    // Werte aus dem Formular (z. B. Screenshot) behalten, leere Felder aus dem vorhandenen Eintrag füllen
    ZAHLFELDER.forEach(k => { if (e[k].value === '' && x[k] != null) e[k].value = x[k]; });
    if (!e.build.value) e.build.value = x.build || '';
    if (!e.design.value) e.design.value = x.design || '';
    if (!e.reifen.value) e.reifen.value = x.reifen || '';
    if (!e.antrieb.value) e.antrieb.value = x.antrieb || '';
    if (!e.code.value) e.code.value = x.code || '';
    if (!e.notiz.value) e.notiz.value = x.notiz || '';
    if (!e.fav.checked) e.fav.checked = !!x.fav;
    e.pi.dispatchEvent(new Event('input'));
    zeigeVorhanden();
    toast('Wird als Änderung von „' + buildName(x) + '“ gespeichert');
  });
  function setzeEigenes(an) {
    eigenesModus = an; e.eigenes.hidden = !an;
    if (an) { gewaehlt = null; zeigeAutoInfo(); e.xName.focus(); }
  }

  let trefferIdx = -1;
  function sucheAutos() {
    const q = norm(e.suche.value).trim();
    if (!q) { e.treffer.hidden = true; return; }
    const w = q.split(/\s+/);
    const res = liste.filter(a => w.every(x => a._such.includes(x))).slice(0, 40);
    trefferIdx = -1;
    e.treffer.innerHTML = res.length
      ? res.map(a => `<li data-id="${esc(a.id)}"><span>${esc(a.n)}</span>${badge(a.pi, a.k)}</li>`).join('')
      : '<li class="leise">Kein Treffer – ggf. „Eigenes anlegen“</li>';
    e.treffer.hidden = false;
  }
  e.suche.addEventListener('input', sucheAutos);
  e.suche.addEventListener('keydown', ev => {
    const lis = $$('li[data-id]', e.treffer);
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      trefferIdx = Math.max(0, Math.min(lis.length - 1, trefferIdx + (ev.key === 'ArrowDown' ? 1 : -1)));
      lis.forEach((l, i) => l.classList.toggle('fokus', i === trefferIdx));
      lis[trefferIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      const li = lis[trefferIdx] || lis[0];
      if (li) waehleAuto(nachId.get(li.dataset.id));
    } else if (ev.key === 'Escape' && !e.treffer.hidden) {
      ev.preventDefault(); ev.stopPropagation(); e.treffer.hidden = true;
    }
  });
  e.treffer.addEventListener('mousedown', ev => {
    const li = ev.target.closest('li[data-id]');
    if (li) { ev.preventDefault(); waehleAuto(nachId.get(li.dataset.id)); }
  });
  e.suche.addEventListener('blur', () => setTimeout(() => { e.treffer.hidden = true; }, 150));
  e.eigenesBtn.addEventListener('click', () => setzeEigenes(!eigenesModus));
  e.pi.addEventListener('input', () => { e.piBadge.innerHTML = zahl(e.pi.value) != null ? badge(zahl(e.pi.value)) : ''; if (!e.vorhanden.hidden) zeigeVorhanden(); });

  const ZAHLFELDER = ['pi', 'vmax', 'a100', 'kw', 'kg', 'nm'];

  function oeffneDialog(eintrag, autoId) {
    bearbeitet = eintrag ? eintrag.uid : null;
    $('#formEintrag').reset();
    $$('.ocr-gefuellt', dlg).forEach(x => x.classList.remove('ocr-gefuellt'));
    ocrReset();
    $('#dlgTitel').textContent = eintrag ? 'Fahrzeug bearbeiten' : 'Fahrzeug hinzufügen';
    $('#eLoeschen').hidden = !eintrag; $('#eKopie').hidden = !eintrag;
    gewaehlt = null; setzeEigenes(false); zeigeVorhanden();
    if (eintrag) {
      const a = nachId.get(eintrag.autoId);
      if (a) waehleAuto(a);
      else {
        setzeEigenes(true);
        const s = eintrag.auto || {};
        e.xMarke.value = s.m || ''; e.xName.value = s.n || ''; e.xLand.value = s.l || ''; e.xTyp.value = s.t || ''; e.xPi.value = s.pi ?? '';
      }
      e.build.value = eintrag.build || '';
      e.design.value = eintrag.design || '';
      ZAHLFELDER.forEach(k => { e[k].value = eintrag[k] ?? ''; });
      e.reifen.value = eintrag.reifen || ''; e.antrieb.value = eintrag.antrieb || '';
      e.code.value = eintrag.code || ''; e.notiz.value = eintrag.notiz || ''; e.fav.checked = !!eintrag.fav;
    } else if (autoId && nachId.get(autoId)) {
      waehleAuto(nachId.get(autoId));
    }
    e.pi.dispatchEvent(new Event('input'));
    dlg.showModal();
    if (!gewaehlt && !eigenesModus) e.suche.focus(); else e.build.focus();
  }

  function eintragAusFormular() {
    let autoId, snap;
    if (eigenesModus) {
      const n = e.xName.value.trim();
      if (!n) { alertFeld(e.xName, 'Bitte einen Modellnamen eingeben.'); return null; }
      const pi = zahl(e.xPi.value);
      snap = { m: e.xMarke.value.trim(), n, j: Number(n.slice(0, 4)) || null, l: e.xLand.value.trim(), t: e.xTyp.value.trim(), pi, k: klasseVonPi(pi) };
      autoId = 'eigen-' + slug(n);
    } else {
      if (!gewaehlt) { alertFeld(e.suche, 'Bitte ein Fahrzeug aus der Liste wählen.'); return null; }
      autoId = gewaehlt.id;
      const { m, n, j, l, t, pi, k } = gewaehlt;
      snap = { m, n, j, l, t, pi, k };
    }
    const r = {
      autoId, auto: snap, build: e.build.value.trim(), design: e.design.value.trim(),
      reifen: e.reifen.value, antrieb: e.antrieb.value,
      code: e.code.value.trim(), notiz: e.notiz.value.trim(), fav: e.fav.checked
    };
    ZAHLFELDER.forEach(k => { r[k] = zahl(e[k].value); });
    if (r.pi != null && (r.pi < 100 || r.pi > 999)) { alertFeld(e.pi, 'PI muss zwischen 100 und 999 liegen.'); return null; }
    return r;
  }
  function alertFeld(feld, text) { feld.setCustomValidity(text); feld.reportValidity(); feld.addEventListener('input', () => feld.setCustomValidity(''), { once: true }); }

  $('#formEintrag').addEventListener('submit', async ev => {
    ev.preventDefault();
    const r = eintragAusFormular(); if (!r) return;
    const jetzt = new Date().toISOString();
    if (bearbeitet) {
      const i = daten.eintraege.findIndex(x => x.uid === bearbeitet);
      daten.eintraege[i] = kompakt(Object.assign({}, daten.eintraege[i], r, { geaendert: jetzt }));
    } else {
      daten.eintraege.push(kompakt(Object.assign({ uid: uid(), erstellt: jetzt, geaendert: jetzt }, r)));
    }
    // Promo-Häkchen gilt pro Modell (nur Fahrzeuge aus der Liste)
    if (!eigenesModus && gewaehlt) {
      if (e.promo.checked && !hatPromo(gewaehlt.id)) daten.promo[gewaehlt.id] = jetzt;
      else if (!e.promo.checked) delete daten.promo[gewaehlt.id];
    }
    if (await speichern()) { dlg.close(); fuelleFilter(); render(); toast('Gespeichert'); }
  });
  $('#eLoeschen').addEventListener('click', async () => {
    const x = daten.eintraege.find(y => y.uid === bearbeitet);
    if (!x || !confirm(`„${autoVon(x).n}${x.build ? ' – ' + x.build : ''}“ wirklich löschen?`)) return;
    daten.eintraege = daten.eintraege.filter(y => y.uid !== bearbeitet);
    if (await speichern()) { dlg.close(); render(); toast('Gelöscht'); }
  });
  $('#eKopie').addEventListener('click', () => {
    bearbeitet = null;
    $('#dlgTitel').textContent = 'Neuer Build (Kopie)';
    $('#eLoeschen').hidden = true; $('#eKopie').hidden = true;
    e.build.value = e.build.value ? e.build.value + ' (Kopie)' : '';
    e.build.focus(); e.build.select();
  });
  $$('[data-schliessen]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));

  /* ---------- Screenshot-Texterkennung (Tesseract.js, lokal im Browser) ---------- */
  const ocr = { zone: $('#ocrZone'), datei: $('#ocrDatei'), status: $('#ocrStatus'), roh: $('#ocrRoh') };
  const TESS_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  let worker = null;

  function ocrReset() { const v = $('#ocrVorschau'); if (v) v.hidden = true; ocr.status.textContent = ''; ocr.status.className = 'ocr-status'; ocr.roh.hidden = true; ocr.roh.open = false; }
  function ocrStatus(t, cls = '') { ocr.status.textContent = t; ocr.status.className = 'ocr-status ' + cls; }
  let ocrMelder = t => ocrStatus(t);   // wohin Fortschrittsmeldungen gehen (Einzel-Dialog oder Stapel-Import)

  const skripte = {};
  function ladeSkript(url, pruefe) {
    if (pruefe()) return Promise.resolve();
    if (!skripte[url]) skripte[url] = new Promise((ok, fail) => {
      const s = document.createElement('script'); s.src = url; s.onload = ok;
      s.onerror = () => { delete skripte[url]; fail(new Error('Konnte ' + url.split('/npm/')[1] + ' nicht laden (offline?)')); };
      document.head.appendChild(s);
    });
    return skripte[url];
  }
  const ladeTesseract = () => ladeSkript(TESS_URL, () => !!window.Tesseract);
  const OCR_VERSION = '20261104e';
  async function holeWorker() {
    await ladeTesseract();
    if (!worker) worker = await Tesseract.createWorker(['deu', 'eng'], 1, {
      logger: m => { if (m.status === 'recognizing text') ocrMelder('Lese Text … ' + Math.round(m.progress * 100) + ' %'); else if (m.status) ocrMelder('Vorbereitung: ' + m.status); }
    });
    return worker;
  }

  /* ---------- Bildpunkte ohne Canvas ----------
     Firefox (Fingerprinting-Schutz) verfälscht Pixel, die aus einem Canvas zurückgelesen werden.
     Deshalb wird JPG/PNG direkt aus der Datei entschlüsselt (jpeg-js bzw. UPNG + pako) und alles Weitere
     – Ausschnitt, Vergrößern, Schwarz/Weiß, BMP für Tesseract – in eigenen Arrays gerechnet.
     Nur für andere Formate (z. B. WebP) wird ein Canvas benutzt. */
  const JPEG_URL = 'https://cdn.jsdelivr.net/npm/jpeg-js@0.4.4/lib/decoder.js';
  const PAKO_URL = 'https://cdn.jsdelivr.net/npm/pako@1.0.11/dist/pako.min.js';
  const UPNG_URL = 'https://cdn.jsdelivr.net/npm/upng-js@2.1.0/UPNG.js';
  async function rasterAusDatei(datei, bmp) {
    const b = new Uint8Array(await datei.arrayBuffer());
    if (b[0] === 0xFF && b[1] === 0xD8) {
      await ladeSkript(JPEG_URL, () => !!(window['jpeg-js'] && window['jpeg-js'].decode));
      const r = window['jpeg-js'].decode(b, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 });
      return { width: r.width, height: r.height, data: r.data, quelle: 'JPG direkt aus der Datei' };
    }
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) {
      await ladeSkript(PAKO_URL, () => !!window.pako);
      await ladeSkript(UPNG_URL, () => !!window.UPNG);
      const png = UPNG.decode(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
      return { width: png.width, height: png.height, data: new Uint8Array(UPNG.toRGBA8(png)[0]), quelle: 'PNG direkt aus der Datei' };
    }
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext('2d'); ctx.drawImage(bmp, 0, 0);
    return { width: c.width, height: c.height, data: ctx.getImageData(0, 0, c.width, c.height).data, quelle: 'Canvas (kann in Firefox verfälscht sein)' };
  }

  // Farbwert an einer Stelle (bilinear), Kanal k
  function abtasten(r, x, y, k) {
    const W = r.width, H = r.height, d = r.data;
    const x0 = Math.max(0, Math.min(W - 1, Math.floor(x))), y0 = Math.max(0, Math.min(H - 1, Math.floor(y)));
    const x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1), fx = x - x0, fy = y - y0;
    const p = (xx, yy) => d[(yy * W + xx) * 4 + k];
    return (p(x0, y0) * (1 - fx) + p(x1, y0) * fx) * (1 - fy) + (p(x0, y1) * (1 - fx) + p(x1, y1) * fx) * fy;
  }

  /* Ausschnitt (Angaben relativ, 0–1) vergrößern und nur helle, ungesättigte Pixel (weiße/graue Schrift)
     als schwarze Schrift auf Weiß behalten. Farbige Flächen und dunkler Hintergrund fallen weg. */
  function ausschnitt(r, x0, y0, x1, y1, faktor) {
    const W = r.width, H = r.height, f = faktor * Math.max(1, 2600 / W);
    const sx = x0 * W, sy = y0 * H, w = Math.round((x1 - x0) * W * f), h = Math.round((y1 - y0) * H * f);
    const g = new Uint8Array(w * h); let tinte = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const qx = sx + (x + 0.5) / f - 0.5, qy = sy + (y + 0.5) / f - 0.5;
      const R = abtasten(r, qx, qy, 0), G = abtasten(r, qx, qy, 1), B = abtasten(r, qx, qy, 2);
      const mn = Math.min(R, G, B), mx = Math.max(R, G, B), schrift = mn > 130 && mx - mn < 70;
      g[y * w + x] = schrift ? 0 : 255; if (schrift) tinte++;
    }
    return { w, h, g, tinte: tinte / (w * h) };
  }

  // Ganzes Bild (Rückfallweg): vergrößern, Graustufen, bei dunklem Hintergrund invertieren
  function aufbereiten(r) {
    const f = Math.min(3, Math.max(1, 2400 / r.width));
    const w = Math.round(r.width * f), h = Math.round(r.height * f), g = new Uint8Array(w * h);
    let summe = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const qx = (x + 0.5) / f - 0.5, qy = (y + 0.5) / f - 0.5;
      const v = 0.299 * abtasten(r, qx, qy, 0) + 0.587 * abtasten(r, qx, qy, 1) + 0.114 * abtasten(r, qx, qy, 2);
      g[y * w + x] = v; summe += v;
    }
    if (summe / (w * h) < 128) for (let i = 0; i < g.length; i++) g[i] = 255 - g[i];
    return { w, h, g };
  }

  // Prüft stichprobenartig, ob das Bild Inhalt hat (einfarbig = z. B. schwarzer Vollbild-Screenshot)
  function bildPruefen(r) {
    const d = r.data, schritt = Math.max(1, Math.floor(r.width * r.height / 20000));
    let mn = 255, mx = 0, summe = 0, n = 0, transparent = 0;
    for (let p = 0; p < r.width * r.height; p += schritt) {
      const i = p * 4, g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      mn = Math.min(mn, g); mx = Math.max(mx, g); summe += g; n++; if (d[i + 3] < 10) transparent++;
    }
    const mittel = summe / n;
    const info = `Bild: ${r.width} × ${r.height} px (${r.quelle}) · Helligkeit min ${Math.round(mn)} / max ${Math.round(mx)} / Mittel ${Math.round(mittel)} · transparent ${Math.round(transparent / n * 100)} %`;
    let fehler = '';
    if (transparent / n > 0.9) fehler = 'Das Bild ist (fast) komplett durchsichtig – bitte einen normalen Screenshot verwenden.';
    else if (mx - mn < 8 && mittel < 20) fehler = 'Das Bild ist komplett schwarz. Das passiert oft bei Screenshots von Spielen im Vollbild (z. B. mit Win+Umschalt+S). Probier die Xbox Game Bar (Win+Alt+Druck) oder den Steam-Screenshot (F12), bzw. das Spiel im Fenster-/randlosen Modus.';
    else if (mx - mn < 8) fehler = 'Das Bild kommt einfarbig im Tool an. Bitte den Screenshot als JPG- oder PNG-Datei verwenden.';
    return { fehler, info };
  }
  function zeigeVorschau(bmp) {
    const c = $('#ocrVorschau'); if (!c) return;
    const f = 160 / bmp.width; c.width = 160; c.height = Math.round(bmp.height * f);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); c.hidden = false;
  }

  // Graustufenbild → BMP-Datei (8 Bit, Graupalette) für Tesseract
  function grauZuBmp(b) {
    const { w, h, g } = b, zeile = Math.ceil(w / 4) * 4, kopf = 54 + 1024, groesse = kopf + zeile * h;
    const buf = new ArrayBuffer(groesse), v = new DataView(buf), u = new Uint8Array(buf);
    u[0] = 0x42; u[1] = 0x4D; v.setUint32(2, groesse, true); v.setUint32(10, kopf, true);
    v.setUint32(14, 40, true); v.setInt32(18, w, true); v.setInt32(22, h, true);
    v.setUint16(26, 1, true); v.setUint16(28, 8, true); v.setUint32(34, zeile * h, true); v.setUint32(46, 256, true);
    for (let i = 0; i < 256; i++) { u[54 + i * 4] = u[55 + i * 4] = u[56 + i * 4] = i; }
    for (let y = 0; y < h; y++) u.set(g.subarray(y * w, y * w + w), kopf + (h - 1 - y) * zeile);
    return new Blob([buf], { type: 'image/bmp' });
  }
  async function ocrLies(w, bild, psm) {
    await w.setParameters({ tessedit_pageseg_mode: psm || '3' });
    return (await w.recognize(grauZuBmp(bild))).data.text || '';
  }

  const zahlAus = s => { const n = Number(String(s).replace(/\s/g, '').replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
  const letzteZahl = (zeile, re = /\d+(?:[.,]\d+)?/g) => { const m = zeile.match(re); return m ? zahlAus(m[m.length - 1]) : null; };

  // Liest Werte aus dem erkannten Text. Bei "vorher → nachher" zählt jeweils der letzte Wert einer Zeile.
  function werteAusText(text) {
    const zeilen = text.split(/\n+/).map(z => z.replace(/[|]/g, ' ').trim()).filter(Boolean);
    const w = {}, piKlasse = [], piAllein = [];
    for (const z of zeilen) {
      const lz = norm(z);
      if (w.a100 == null && /0\s*[-–—~]\s*100/.test(lz)) {
        const rest = z.replace(/0\s*[-–—~]\s*100\s*(km\s*\/?\s*h)?/i, ' ');
        const m = rest.match(/\d{1,2}[.,]\d{1,3}/g);
        if (m) w.a100 = Number(m[m.length - 1].replace(',', '.'));
      }
      if (w.vmax == null && /(hochstgeschw|top\s*speed|hochstgeschwindigkeit|v\s*-?\s*max|geschwindigkeit)/.test(lz) && !/0\s*[-–—~]\s*100/.test(lz)) {
        const n = letzteZahl(z, /\d{2,3}(?:[.,]\d)?/g); if (n != null && n >= 50 && n < 600) w.vmax = n;
      }
      // Leistung in kW (wie im Spiel); PS/HP werden umgerechnet. "KW/kg" (Leistungsgewicht) zählt nicht.
      if (w.kw == null) { const m = [...z.matchAll(/(\d{2,4})\s*(kW|PS|HP|BHP)\b(?!\s*\/)/gi)].pop(); if (m) w.kw = /kw/i.test(m[2]) ? Number(m[1]) : Math.round(Number(m[1]) / 1.35962); }
      if (w.kg == null) { const m = [...z.matchAll(/(\d{1,2}[.,]?\d{3}|\d{3,4})\s*kg\b/gi)].pop(); if (m) { const n = zahlAus(m[1]); if (n >= 300 && n < 6000) w.kg = n; } }
      if (w.nm == null) { const m = [...z.matchAll(/(\d{2,4})\s*N\s*[·.:'’`´\-]?\s*m\b/gi)].pop(); if (m) w.nm = Number(m[1]); }
      if (w.antrieb == null) { const m = z.match(/\b(AWD|RWD|FWD)\b/); if (m) w.antrieb = m[1]; else if (/allrad/.test(lz)) w.antrieb = 'AWD'; else if (/heckantrieb/.test(lz)) w.antrieb = 'RWD'; else if (/frontantrieb/.test(lz)) w.antrieb = 'FWD'; }
      // PI: Zahlen mit Einheit (km/h, kg, kW, N·m, Sek. …) und Datumsangaben vorher entfernen,
      // dann zuerst "Klasse + Zahl" (z. B. "C 500"), sonst eine allein stehende dreistellige Zahl (Abzeichen).
      const ohneEinheit = z
        .replace(/\d+[.,]\d+[.,]\d+/g, ' ')
        .replace(/\d[\d.,]*\s*(km\s*\/?\s*h|kg|kw|ps|hp|bhp|n\s*[·.:'’`´\-]?\s*m|sek\.?|s\b|%)/gi, ' ');
      const mitKlasse = [...ohneEinheit.matchAll(/(?:^|[^A-Za-z0-9])(S1|S2|[DCBARX])\s*[:\-]?\s*(\d{3})(?![\d.,])/g)];
      if (mitKlasse.length) { piKlasse.push(Number(mitKlasse[mitKlasse.length - 1][2])); }
      else if (/^[^A-Za-zÄÖÜäöüß]*\d{3}[^A-Za-zÄÖÜäöüß\d]*$/.test(ohneEinheit.trim())) {
        const m = ohneEinheit.match(/(?:^|[^\d.,])(\d{3})(?![\d.,])/); if (m) piAllein.push(Number(m[1]));
      }
    }
    const piWahl = piKlasse.length ? piKlasse : piAllein;
    if (piWahl.length) w.pi = piWahl[piWahl.length - 1];
    // Fallback Höchstgeschwindigkeit: größter km/h-Wert, der nicht in einer 0-100-Zeile steht
    if (w.vmax == null) {
      const kandidaten = zeilen.filter(z => !/0\s*[-–—~]\s*100/.test(z)).flatMap(z => [...z.matchAll(/(\d{2,3}(?:[.,]\d)?)\s*km\s*\/?\s*h/gi)].map(m => zahlAus(m[1])));
      const g = kandidaten.filter(n => n >= 50 && n < 600);
      if (g.length) w.vmax = Math.max(...g);
    }
    // Fallback 0–100: Wert mit „Sek.“ (die Beschriftung wird manchmal falsch gelesen)
    if (w.a100 == null) {
      const m = zeilen.flatMap(z => [...z.matchAll(/(\d{1,2}[.,]\d{1,3})\s*Sek/gi)]).pop();
      if (m) w.a100 = Number(m[1].replace(',', '.'));
    }
    if (w.pi != null && (w.pi < 100 || w.pi > 999)) delete w.pi;
    return w;
  }

  // Versucht das Fahrzeug anhand des Textes zu erkennen
  function autoAusText(text) {
    const t = ' ' + norm(text).replace(/[^a-z0-9]+/g, ' ') + ' ';
    let best = null, bestScore = 0;
    for (const a of liste) {
      const woerter = norm(a.n).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(x => x.length > 1 || /\d/.test(x));
      if (!woerter.length) continue;
      const hits = woerter.filter(x => t.includes(' ' + x + ' ')).length;
      const score = hits / woerter.length + hits * 0.01;
      if (score > bestScore) { bestScore = score; best = a; }
    }
    return bestScore >= 0.75 ? best : null;
  }

  // Liest Name, Werte und PI aus dem Bild
  async function leseBild(w, r, pruef) {
    const FELDER = ['pi', 'vmax', 'a100', 'kw', 'kg', 'nm'];
    let werte = {}, roh = pruef.info, autoText = '';
    // 1. Tuning-/Upgrade-Bildschirm (16:9): feste Bereiche einzeln lesen – deutlich zuverlässiger
    const seite = r.width / r.height;
    if (seite > 1.6 && seite < 1.9) {
      ocrMelder('Lese Fahrzeugwerte …');
      const cN = ausschnitt(r, 0.06, 0.23, 0.29, 0.31, 2), cW = ausschnitt(r, 0.62, 0.22, 0.94, 0.72, 2), cP = ausschnitt(r, 0.48, 0.64, 0.545, 0.69, 3);
      const name = await ocrLies(w, cN);
      const stats = await ocrLies(w, cW);
      const piNeu = await ocrLies(w, cP, '7');   // Abzeichen „Neu“
      const pz = c => Math.round(c.tinte * 1000) / 10 + ' %';
      werte = werteAusText(stats);
      delete werte.pi;
      const pm = [...piNeu.matchAll(/(?:S1|S2|[DCBARX])?\s*(\d{3})(?!\d)/g)].pop();
      if (pm && +pm[1] >= 100 && +pm[1] <= 999) werte.pi = Number(pm[1]);
      autoText = name;
      roh += `\nSchrift-Anteil: Name ${pz(cN)} · Werte ${pz(cW)} · PI ${pz(cP)}\n\n[Name]\n${name.trim()}\n\n[Werte]\n${stats.trim()}\n\n[PI neu]\n${piNeu.trim()}`;
    }
    // 1b. Name nicht erkannt (z. B. graue Schrift auf hellem/farbigem Hintergrund): Namensbereich nochmal
    //     als Textblock (psm 6) und als lose Wörter (psm 11) lesen – erst danach das ganze Bild.
    if (seite > 1.6 && seite < 1.9 && !autoAusText(autoText)) {
      ocrMelder('Lese Fahrzeugnamen erneut …');
      for (const [psm, f] of [['6', 3], ['11', 3]]) {
        const t = await ocrLies(w, ausschnitt(r, 0.06, 0.23, 0.29, 0.31, f), psm);
        roh += `\n\n[Name, Versuch psm ${psm}]\n${t.trim()}`;
        if (autoAusText(t)) { autoText = t; break; }
      }
    }
    // 2. Rückfallweg: ganzes Bild lesen und nur fehlende Werte (oder den Namen) ergänzen
    if (FELDER.some(k => werte[k] == null) || !autoAusText(autoText)) {
      ocrMelder('Lese ganzes Bild …');
      const ganz = await ocrLies(w, aufbereiten(r));
      const w2 = werteAusText(ganz);
      for (const [k, v] of Object.entries(w2)) if (werte[k] == null && v != null) werte[k] = v;
      if (!autoText || !autoAusText(autoText)) autoText = (autoText + '\n' + ganz);
      roh += '\n\n[Ganzes Bild]\n' + ganz.trim();
    }
    return { werte, roh, autoText };
  }

  /* Liest einen Screenshot komplett: Bild prüfen, Werte und Fahrzeug erkennen.
     Ergebnis: { fehler, werte, auto, roh, bmp }. Wird vom Einzel-Dialog und vom Stapel-Import benutzt. */
  let ocrKette = Promise.resolve();   // Tesseract-Worker immer nur mit einem Bild gleichzeitig
  function erkenneBild(datei, melder) {
    const job = ocrKette.then(async () => {
      ocrMelder = melder || (t => ocrStatus(t));
      if (!datei || !/^image\//.test(datei.type)) return { fehler: 'Das ist kein Bild.' };
      melder('Lade Texterkennung …');
      const w = await holeWorker();
      const bmp = await createImageBitmap(datei);
      melder('Lese Bilddatei …');
      const r = await rasterAusDatei(datei, bmp);
      const pruef = bildPruefen(r);
      if (pruef.fehler) return { fehler: pruef.fehler, roh: `Version ${OCR_VERSION}\n` + pruef.info, bmp };
      const { werte, roh, autoText } = await leseBild(w, r, pruef);
      return { werte, auto: autoAusText(autoText), roh: `Version ${OCR_VERSION}\n` + roh, bmp };
    });
    ocrKette = job.catch(() => {});
    return job;
  }

  async function verarbeiteBild(datei) {
    try {
      if (einzelBildUrl) URL.revokeObjectURL(einzelBildUrl);
      einzelBildUrl = datei && /^image\//.test(datei.type) ? URL.createObjectURL(datei) : null;
      const erg = await erkenneBild(datei, t => ocrStatus(t));
      if (erg.bmp) zeigeVorschau(erg.bmp);
      if (erg.roh) { ocr.roh.hidden = false; $('pre', ocr.roh).textContent = erg.roh; }
      if (erg.fehler) { ocrStatus(erg.fehler, 'fehl'); return; }
      const gefuellt = [];
      $$('.ocr-gefuellt', dlg).forEach(x => x.classList.remove('ocr-gefuellt'));
      for (const [k, v] of Object.entries(erg.werte)) {
        if (v == null || !e[k]) continue;
        e[k].value = v; e[k].classList.add('ocr-gefuellt'); gefuellt.push(k);
      }
      e.pi.dispatchEvent(new Event('input'));
      if (!gewaehlt && !eigenesModus && erg.auto) { waehleAuto(erg.auto); gefuellt.push('Fahrzeug'); }
      else zeigeVorhanden();
      const namen = { pi: 'PI', vmax: 'Höchstgeschw.', a100: '0–100', kw: 'Leistung', kg: 'Gewicht', nm: 'Drehmoment', antrieb: 'Antrieb' };
      if (gefuellt.length) ocrStatus('Erkannt: ' + gefuellt.map(k => namen[k] || k).join(', ') + ' – bitte grün markierte Felder prüfen.', 'ok');
      else ocrStatus('Keine Werte erkannt. Unter „Erkannter Text“ siehst du, was gelesen wurde.', 'fehl');
    } catch (err) {
      ocrStatus('Texterkennung fehlgeschlagen: ' + err.message, 'fehl');
    }
  }

  $('#ocrWaehlen').addEventListener('click', () => ocr.datei.click());
  ocr.datei.addEventListener('change', () => { if (ocr.datei.files[0]) verarbeiteBild(ocr.datei.files[0]); ocr.datei.value = ''; });
  ocr.zone.addEventListener('dragover', ev => { ev.preventDefault(); ocr.zone.classList.add('drueber'); });
  ocr.zone.addEventListener('dragleave', () => ocr.zone.classList.remove('drueber'));
  ocr.zone.addEventListener('drop', ev => { ev.preventDefault(); ocr.zone.classList.remove('drueber'); const d = ev.dataTransfer.files[0]; if (d) verarbeiteBild(d); });
  dlg.addEventListener('paste', ev => {
    const item = [...(ev.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
    if (item) { ev.preventDefault(); verarbeiteBild(item.getAsFile()); }
  });

  /* ---------- Screenshot groß anzeigen (Klick aufs Bild, Klick daneben oder Esc schließt) ---------- */
  const dlgB = $('#dlgBild');
  function zeigeGross(url) { if (!url) return; $('#bildGross').src = url; dlgB.showModal(); }
  dlgB.addEventListener('click', ev => { if (ev.target === dlgB || ev.target.id === 'bildGross') dlgB.close(); });
  dlgB.addEventListener('close', () => { $('#bildGross').removeAttribute('src'); });
  // Vorschau im Einzel-Dialog: Datei merken, damit sie groß angezeigt werden kann
  let einzelBildUrl = null;
  $('#ocrVorschau').addEventListener('click', () => zeigeGross(einzelBildUrl));

  /* ---------- Stapel-Import: mehrere Screenshots → Entwürfe ----------
     Entwürfe liegen nur im Arbeitsspeicher. Übernommen wird erst mit „Übernehmen“ (ein Speichervorgang). */
  const dlgS = $('#dlgStapel');
  let entwuerfe = [];   // { id, datei, url, status: 'wartet'|'liest'|'fertig'|'fehler', meldung, werte, autoId, aktion, roh }
  let stapelLaeuft = false;
  const WERTSPALTEN = [['pi', 'PI', 1], ['vmax', 'km/h', 0.1], ['a100', '0–100 s', 0.001], ['kw', 'kW', 1], ['kg', 'kg', 1], ['nm', 'Nm', 1]];

  function fuelleAutoDatalist() {
    if ($('#stapelAutos').childElementCount) return;
    $('#stapelAutos').innerHTML = liste.map(a => `<option value="${esc(a.n)}"></option>`).join('');
  }
  // Vorschlag: gleiches Auto mit gleichem PI schon vorhanden → diesen Eintrag aktualisieren, sonst neuer Build
  function vorschlagAktion(d) {
    if (!d.autoId) return 'neu';
    const vh = vorhandeneZu(d.autoId);
    const gleich = vh.find(x => d.werte && d.werte.pi != null && x.pi === d.werte.pi);
    return gleich ? gleich.uid : 'neu';
  }
  function entwurfHtml(d) {
    const a = d.autoId ? nachId.get(d.autoId) : null;
    const vh = d.autoId ? vorhandeneZu(d.autoId) : [];
    const kopf = d.status === 'wartet' ? '<span class="leise">wartet …</span>'
      : d.status === 'liest' ? `<span class="leise">${esc(d.meldung || 'wird gelesen …')}</span>`
      : d.status === 'fehler' ? `<span class="fehl">${esc(d.meldung)}</span>` : '';
    const fertig = d.status === 'fertig';
    return `<div class="entwurf ${d.status}${fertig && !d.autoId ? ' unklar' : ''}" data-id="${d.id}">
      <img src="${d.url}" alt="Screenshot – zum Vergrößern klicken" title="Zum Vergrößern klicken" class="ew-bild" loading="lazy">
      <div class="ew-haupt">
        <div class="ew-zeile">
          <input class="ew-auto" list="stapelAutos" placeholder="Fahrzeug wählen …" value="${a ? esc(a.n) : ''}" ${fertig ? '' : 'disabled'}>
          ${a ? `<span class="hinweis">Serie</span> ${badge(a.pi, a.k)}` : ''}
          ${kopf}
          <button type="button" class="btn klein ew-weg" title="Entwurf entfernen">✕</button>
        </div>
        ${fertig ? `<div class="ew-werte">${WERTSPALTEN.map(([k, l, st]) => `<label>${l}<input type="number" step="${st}" data-k="${k}" value="${d.werte[k] ?? ''}"></label>`).join('')}</div>
        <div class="ew-zeile">
          <select class="ew-aktion">
            <option value="neu"${d.aktion === 'neu' ? ' selected' : ''}>${vh.length ? 'Als neuen Build anlegen' : 'Neu in die Garage'}</option>
            ${vh.map(x => `<option value="${esc(x.uid)}"${d.aktion === x.uid ? ' selected' : ''}>Aktualisieren: ${esc(buildName(x))}${x.pi != null ? ' (PI ' + x.pi + ')' : ''}</option>`).join('')}
            <option value="skip"${d.aktion === 'skip' ? ' selected' : ''}>Nicht übernehmen</option>
          </select>
          ${vh.length ? `<span class="hinweis">${vh.length === 1 ? 'Schon 1 Eintrag' : 'Schon ' + vh.length + ' Einträge'} in der Garage</span>` : ''}
          ${!d.autoId ? '<span class="fehl">Fahrzeug nicht erkannt – bitte wählen</span>' : ''}
        </div>` : ''}
      </div>
    </div>`;
  }
  function renderStapel() {
    $('#stapelListe').innerHTML = entwuerfe.map(entwurfHtml).join('');
    stapelZaehler();
  }
  function renderEntwurf(d) {
    const alt = $(`#stapelListe .entwurf[data-id="${d.id}"]`);
    if (alt) alt.outerHTML = entwurfHtml(d); else renderStapel();
    stapelZaehler();
  }
  const entwurfBereit = d => d.status === 'fertig' && d.autoId && d.aktion !== 'skip';
  function stapelZaehler() {
    const n = entwuerfe.filter(entwurfBereit).length, offen = entwuerfe.filter(d => d.status === 'wartet' || d.status === 'liest').length;
    $('#stapelZaehler').textContent = entwuerfe.length ? `${n} bereit${offen ? ` · ${offen} in Arbeit` : ''}` : '';
    $('#stapelUebernehmen').disabled = !n;
    $('#stapelUebernehmen').textContent = n ? `${n} übernehmen` : 'Übernehmen';
  }

  function stapelHinzu(dateien) {
    const bilder = [...dateien].filter(f => /^image\//.test(f.type) && !/(^|\/)thumbnails\//i.test(f.webkitRelativePath || ''));
    if (!bilder.length) { $('#stapelStatus').textContent = 'Keine Bilder gefunden.'; return; }
    fuelleAutoDatalist();
    for (const f of bilder) entwuerfe.push({ id: uid(), datei: f, url: URL.createObjectURL(f), status: 'wartet', werte: {}, aktion: 'neu' });
    renderStapel();
    stapelAbarbeiten();
  }
  async function stapelAbarbeiten() {
    if (stapelLaeuft) return;
    stapelLaeuft = true;
    try {
      let d;
      while ((d = entwuerfe.find(x => x.status === 'wartet'))) {
        const nr = entwuerfe.filter(x => x.status !== 'wartet').length + 1;
        $('#stapelStatus').textContent = `Lese Screenshot ${nr} von ${entwuerfe.length} …`;
        d.status = 'liest'; renderEntwurf(d);
        try {
          const erg = await erkenneBild(d.datei, t => { d.meldung = t; const el = $(`#stapelListe .entwurf[data-id="${d.id}"] .leise`); if (el) el.textContent = t; });
          if (!entwuerfe.includes(d)) continue;   // inzwischen entfernt
          if (erg.fehler) { d.status = 'fehler'; d.meldung = erg.fehler; }
          else { d.status = 'fertig'; d.werte = erg.werte || {}; d.autoId = erg.auto ? erg.auto.id : null; d.roh = erg.roh; d.aktion = vorschlagAktion(d); }
        } catch (err) { d.status = 'fehler'; d.meldung = 'Texterkennung fehlgeschlagen: ' + err.message; }
        renderEntwurf(d);
      }
      $('#stapelStatus').textContent = entwuerfe.length ? 'Fertig gelesen – bitte prüfen und übernehmen.' : '';
    } finally { stapelLaeuft = false; stapelZaehler(); }
  }

  $('#btnStapel').addEventListener('click', () => { dlgS.showModal(); renderStapel(); });
  $('#stapelWaehlen').addEventListener('click', () => $('#stapelDateien').click());
  $('#stapelOrdnerWaehlen').addEventListener('click', () => $('#stapelOrdner').click());
  ['#stapelDateien', '#stapelOrdner'].forEach(s => $(s).addEventListener('change', ev => { stapelHinzu(ev.target.files); ev.target.value = ''; }));
  const zoneS = $('#stapelZone');
  zoneS.addEventListener('dragover', ev => { ev.preventDefault(); zoneS.classList.add('drueber'); });
  zoneS.addEventListener('dragleave', () => zoneS.classList.remove('drueber'));
  zoneS.addEventListener('drop', ev => { ev.preventDefault(); zoneS.classList.remove('drueber'); stapelHinzu(ev.dataTransfer.files); });
  dlgS.addEventListener('paste', ev => {
    if (ev.target.closest('input')) return;
    const bilder = [...(ev.clipboardData?.items || [])].filter(i => i.type.startsWith('image/')).map(i => i.getAsFile());
    if (bilder.length) { ev.preventDefault(); stapelHinzu(bilder); }
  });
  $('#stapelListe').addEventListener('click', ev => {
    const bild = ev.target.closest('.ew-bild'); if (bild) { zeigeGross(bild.src); return; }
    const w = ev.target.closest('.ew-weg'); if (!w) return;
    const id = w.closest('.entwurf').dataset.id, d = entwuerfe.find(x => x.id === id);
    if (d) URL.revokeObjectURL(d.url);
    entwuerfe = entwuerfe.filter(x => x.id !== id); renderStapel();
  });
  $('#stapelListe').addEventListener('change', ev => {
    const box = ev.target.closest('.entwurf'); if (!box) return;
    const d = entwuerfe.find(x => x.id === box.dataset.id); if (!d) return;
    if (ev.target.classList.contains('ew-auto')) {
      const a = liste.find(x => x.n === ev.target.value.trim());
      d.autoId = a ? a.id : null; d.aktion = vorschlagAktion(d); renderEntwurf(d);
    } else if (ev.target.dataset.k) {
      d.werte[ev.target.dataset.k] = zahl(ev.target.value);
    } else if (ev.target.classList.contains('ew-aktion')) {
      d.aktion = ev.target.value; stapelZaehler();
    }
  });
  $('#stapelLeeren').addEventListener('click', () => {
    if (entwuerfe.some(entwurfBereit) && !confirm('Alle Entwürfe verwerfen?')) return;
    entwuerfe.forEach(d => URL.revokeObjectURL(d.url)); entwuerfe = []; renderStapel(); $('#stapelStatus').textContent = '';
  });
  $('#stapelUebernehmen').addEventListener('click', async () => {
    const jetzt = new Date().toISOString(), fertig = entwuerfe.filter(entwurfBereit);
    let neu = 0, akt = 0;
    for (const d of fertig) {
      const werte = {};
      for (const [k] of WERTSPALTEN) if (d.werte[k] != null) werte[k] = d.werte[k];
      if (werte.pi != null && (werte.pi < 100 || werte.pi > 999)) delete werte.pi;
      if (d.werte.antrieb) werte.antrieb = d.werte.antrieb;
      if (d.aktion === 'neu') {
        const a = nachId.get(d.autoId); const { m, n, j, l, t, pi, k } = a;
        daten.eintraege.push(kompakt(Object.assign({ uid: uid(), erstellt: jetzt, geaendert: jetzt, autoId: a.id, auto: { m, n, j, l, t, pi, k } }, werte)));
        neu++;
      } else {
        const i = daten.eintraege.findIndex(x => x.uid === d.aktion);
        if (i >= 0) { daten.eintraege[i] = kompakt(Object.assign({}, daten.eintraege[i], werte, { geaendert: jetzt })); akt++; }
      }
    }
    if (!(neu + akt)) return;
    if (await speichern()) {
      fertig.forEach(d => URL.revokeObjectURL(d.url));
      entwuerfe = entwuerfe.filter(d => !fertig.includes(d));
      renderStapel(); fuelleFilter(); render();
      toast(`${neu} neu angelegt, ${akt} aktualisiert`);
      if (!entwuerfe.length) dlgS.close();
    }
  });

  /* ---------- Builds vergleichen ---------- */
  const vergleich = new Set();   // uids, nur im Arbeitsspeicher
  const VGL_MAX = 4;
  function waehleVergleich(id, an, cb) {
    if (an && vergleich.size >= VGL_MAX) { if (cb) cb.checked = false; toast(`Höchstens ${VGL_MAX} Autos gleichzeitig`); return; }
    if (an) vergleich.add(id); else vergleich.delete(id);
    vergleichLeiste();
  }
  function vergleichLeiste() {
    for (const id of [...vergleich]) if (!daten.eintraege.some(x => x.uid === id)) vergleich.delete(id);
    $('#vglLeiste').hidden = vergleich.size === 0 || ui.tab !== 'garage';
    $('#vglText').textContent = `${vergleich.size} ausgewählt`;
    $('#vglStart').disabled = vergleich.size < 2;
  }
  function zeigeVergleich() {
    const xs = [...vergleich].map(id => daten.eintraege.find(x => x.uid === id)).filter(Boolean);
    const zeilen = [
      ['Fahrzeug', x => `<b>${nameHtml(autoVon(x))}</b>`],
      ['Build', x => esc(x.build || '–')],
      ['Design', x => esc(x.design || '–')],
      ['Typ', x => esc(autoVon(x).t || '–')],
      ['Serie', x => badge(autoVon(x).pi, autoVon(x).k) || '–'],
      ['Upgrade', x => x.pi != null ? badge(x.pi) : '–'],
      ['Höchstgeschw.', x => x.vmax != null ? fmt(x.vmax, 1) + ' km/h' : '–', 'vmax', 1],
      ['0–100 km/h', x => x.a100 != null ? fmt(x.a100, 3) + ' s' : '–', 'a100', -1],
      ['Leistung', x => x.kw != null ? fmt(x.kw, 0) + ' kW' : '–', 'kw', 1],
      ['Drehmoment', x => x.nm != null ? fmt(x.nm, 0) + ' Nm' : '–', 'nm', 1],
      ['Gewicht', x => x.kg != null ? fmt(x.kg, 0) + ' kg' : '–', 'kg', -1],
      ['kW pro Tonne', x => (x.kw && x.kg) ? fmt(x.kw / x.kg * 1000, 0) : '–', 'kwt', 1],
      ['Reifen', x => esc(x.reifen || '–')],
      ['Antrieb', x => esc(x.antrieb || '–')],
      ['Tune-Code', x => esc(x.code || '–')]
    ];
    const wert = (x, k) => k === 'kwt' ? ((x.kw && x.kg) ? x.kw / x.kg : null) : x[k];
    $('#vglTabelle').innerHTML = `<tbody>${zeilen.map(([l, f, k, rich]) => {
      let best = null;
      if (k) { const ws = xs.map(x => wert(x, k)).filter(v => v != null); if (ws.length > 1) best = rich > 0 ? Math.max(...ws) : Math.min(...ws); }
      return `<tr><th>${l}</th>${xs.map(x => `<td class="${best != null && wert(x, k) === best ? 'bester' : ''}">${f(x)}</td>`).join('')}</tr>`;
    }).join('')}</tbody>`;
    $('#dlgVergleich').showModal();
  }
  $('#vglStart').addEventListener('click', zeigeVergleich);
  $('#vglAus').addEventListener('click', () => { vergleich.clear(); vergleichLeiste(); $$('.vgl-wahl').forEach(c => { c.checked = false; }); });
  $('#abdKpis').addEventListener('click', ev => {
    const k = ev.target.closest('[data-kpi="promo"]'); if (!k) return;
    [f.klasse, f.land, f.typ, f.reifen, f.antrieb, f.besitz].forEach(x => { x.value = ''; });
    f.suche.value = ''; f.fav.checked = false; f.promo.value = 'nein';
    ui.tab = 'garage'; uiSpeichern(); fuelleSort(); render(); window.scrollTo(0, 0);
  });
  $('#abdKpis').addEventListener('keydown', ev => { if (ev.key === 'Enter') ev.target.click(); });

  /* ---------- Einstellungen: Export / Import / Liste ---------- */
  const dlgE = $('#dlgEinst');
  function speicherInfo() {
    let eigen = 0, gesamt = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i), g = (k.length + (localStorage.getItem(k) || '').length) * 2;
        gesamt += g; if (k.startsWith(PRAEFIX)) eigen += g;
      }
    } catch (_) { /* ignorieren */ }
    const groesse = new Blob([JSON.stringify(daten)]).size;
    $('#speicherInfo').textContent = speicherArt === 'idb'
      ? `Speicherort: eigene Datenbank (IndexedDB „${DB_NAME}“), Garage ca. ${fmt(groesse / 1024)} KB · ${daten.eintraege.length} Einträge, ${Object.keys(daten.promo).length} Promo-Häkchen. Im gemeinsamen localStorage liegen nur Ansicht-Einstellungen (ca. ${fmt(eigen / 1024, 1)} KB).`
      : `Speicherort: gemeinsamer localStorage (Datenbank nicht verfügbar) – ca. ${fmt(eigen / 1024)} KB von diesem Tool, alle Tools zusammen ca. ${fmt(gesamt / 1024)} KB von ~5 MB.`;
    if (speicherArt === 'idb' && navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then(p => { $('#speicherInfo').textContent += ` Dauerhaft geschützt: ${p ? 'ja' : 'nein'}.`; }).catch(() => {});
    }
    $('#listeInfo').textContent = `${liste.length} Fahrzeuge · Stand ${listeMeta.stand || '?'} · ${listeMeta.herkunft === 'aktualisiert' ? 'selbst aktualisiert' : 'mitgeliefert'} (Quelle: ${listeMeta.quelle || '–'})`;
  }
  $('#btnEinst').addEventListener('click', () => {
    speicherInfo();
    const an = !!(SYNC && SYNC.configured);
    $('#syncInfo').textContent = an
      ? 'Deine Garage wird über den gemeinsamen GitHub-Sync deiner Tools mit dem privaten Daten-Repo abgeglichen (Datei fh6-garage.json).'
      : 'Der gemeinsame GitHub-Sync ist auf diesem Gerät noch nicht eingerichtet. Repo und Token trägst du einmal auf der Startseite ein.';
    $('#btnSyncJetzt').hidden = !an;
    dlgE.showModal();
  });
  $('#btnSyncJetzt').addEventListener('click', () => { if (SYNC) SYNC.syncNow(); dlgE.close(); });

  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $('#btnExport').addEventListener('click', () => {
    const out = { tool: 'fh6-garage', version: VERSION, exportiert: new Date().toISOString(), eintraege: daten.eintraege, promo: daten.promo };
    download(`fh6-garage-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(out, null, 1));
  });
  $('#btnImport').addEventListener('click', () => $('#importDatei').click());
  $('#importDatei').addEventListener('change', async ev => {
    const d = ev.target.files[0]; ev.target.value = ''; if (!d) return;
    let obj;
    try { obj = JSON.parse(await d.text()); } catch (err) { zeigeFehler('Import: Datei ist kein gültiges JSON.'); return; }
    const neu = Array.isArray(obj) ? obj : obj.eintraege;
    if (!Array.isArray(neu) || neu.some(x => !x || !x.uid || !x.autoId)) { zeigeFehler('Import: Die Datei ist keine FH6-Garage-Sicherung.'); return; }
    const neuPromo = (!Array.isArray(obj) && obj.promo && typeof obj.promo === 'object' && !Array.isArray(obj.promo)) ? obj.promo : {};
    const di = $('#dlgImport');
    $('#importText').textContent = `Die Sicherung enthält ${neu.length} Einträge und ${Object.keys(neuPromo).length} Promo-Häkchen, aktuell sind ${daten.eintraege.length} Einträge und ${Object.keys(daten.promo).length} Promo-Häkchen gespeichert. „Ersetzen“ überschreibt die aktuelle Garage, „Zusammenführen“ ergänzt sie (bei gleichen Einträgen gewinnt der neuere Stand).`;
    di.returnValue = '';
    di.showModal();
    di.addEventListener('close', async () => {
      if (di.returnValue === 'ersetzen') { daten.eintraege = neu.map(psZuKw).map(kompakt); daten.promo = Object.assign({}, neuPromo); }
      else if (di.returnValue === 'zusammen') {
        const m = new Map(daten.eintraege.map(x => [x.uid, x]));
        neu.forEach(x => { const alt = m.get(x.uid); if (!alt || (x.geaendert || '') > (alt.geaendert || '')) m.set(x.uid, kompakt(psZuKw(x))); });
        daten.eintraege = [...m.values()];
        daten.promo = Object.assign({}, neuPromo, daten.promo);
      } else return;
      if (await speichern()) { fuelleFilter(); render(); speicherInfo(); toast('Import abgeschlossen'); }
    }, { once: true });
  });

  $('#btnSnippet').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#snippet').textContent); toast('Kopiert'); }
    catch (_) { toast('Kopieren nicht möglich – bitte manuell markieren'); }
  });
  $('#btnListeUebernehmen').addEventListener('click', async () => {
    try {
      const neu = konvertiereRoh(JSON.parse($('#listeEingabe').value.trim()));
      if (neu.fahrzeuge.length < 100) throw new Error('Nur ' + neu.fahrzeuge.length + ' Fahrzeuge – war die Tabelle vollständig geladen?');
      const vorher = liste.length;
      const roh = { quelle: neu.quelle, stand: neu.stand, fahrzeuge: neu.fahrzeuge.map(({ _such, ...r }) => r) };
      if (speicherArt === 'idb') await idb('put', 'fahrzeugliste', roh);
      else if (!schreib(K_LISTE, roh)) return;
      setzeListe(neu, 'aktualisiert');
      $('#listeEingabe').value = '';
      fuelleFilter(); render(); speicherInfo();
      toast(`Liste übernommen: ${neu.fahrzeuge.length} Fahrzeuge (${neu.fahrzeuge.length - vorher >= 0 ? '+' : ''}${neu.fahrzeuge.length - vorher})`);
    } catch (err) { zeigeFehler('Liste konnte nicht übernommen werden: ' + err.message); }
  });
  $('#btnListeReset').addEventListener('click', async () => {
    try { if (speicherArt === 'idb') await idb('del', 'fahrzeugliste'); else localStorage.removeItem(K_LISTE); }
    catch (e) { zeigeFehler('Zurücksetzen fehlgeschlagen: ' + e.message); return; }
    await ladeListe(); fuelleFilter(); render(); speicherInfo(); toast('Mitgelieferte Liste aktiv');
  });

  /* ---------- Ereignisse Hauptansicht ---------- */
  $$('.tab').forEach(t => t.addEventListener('click', () => { ui.tab = t.dataset.tab; uiSpeichern(); fuelleSort(); render(); }));
  ['#abdSuche', '#abdDoppelt'].forEach(s => $(s).addEventListener('input', renderAbdeckung));
  // Klick in der Matrix: belegte Zelle → Garage gefiltert, freie Zelle → Katalog mit Marke + Typ
  $('#abdMatrix').addEventListener('click', ev => {
    const td = ev.target.closest('td.zelle'); if (!td) return;
    [f.klasse, f.land, f.typ, f.reifen, f.antrieb, f.besitz, f.promo].forEach(x => { x.value = ''; });
    f.fav.checked = false;
    f.suche.value = td.dataset.m === '–' ? '' : td.dataset.m;
    if ([...f.typ.options].some(o => o.value === td.dataset.t)) f.typ.value = td.dataset.t;
    if (td.dataset.k) { ui.tab = 'garage'; f.klasse.value = td.dataset.k; }
    else ui.tab = 'katalog';
    uiSpeichern(); fuelleSort(); render(); window.scrollTo(0, 0);
  });
  $('#btnNeu').addEventListener('click', () => oeffneDialog(null));
  [f.suche, f.klasse, f.land, f.typ, f.reifen, f.antrieb, f.besitz, f.promo, f.fav].forEach(x => x.addEventListener('input', render));
  $('#fReset').addEventListener('click', () => { filterZuruecksetzen(); render(); });
  f.sort.addEventListener('change', () => { if (ui.tab === 'garage') ui.sortG = f.sort.value; else ui.sortK = f.sort.value; uiSpeichern(); render(); });
  $('#tabGarage tbody').addEventListener('click', ev => {
    const cb = ev.target.closest('.vgl-wahl');
    if (cb) { waehleVergleich(cb.dataset.uid, cb.checked, cb); return; }
    if (ev.target.closest('td.vgl')) return;
    const tr = ev.target.closest('tr[data-uid]'); if (!tr) return;
    oeffneDialog(daten.eintraege.find(x => x.uid === tr.dataset.uid));
  });
  $('#tabKatalog tbody').addEventListener('click', ev => {
    const pb = ev.target.closest('[data-promo]');
    if (pb) { setzePromo(pb.dataset.promo, !hatPromo(pb.dataset.promo)); return; }
    const b = ev.target.closest('[data-neu]');
    const tr = ev.target.closest('tr[data-auto]'); if (!tr) return;
    const id = b ? b.dataset.neu : tr.dataset.auto;
    if (!b && (anzahlProAuto().get(id) || 0) > 0) {
      ui.tab = 'garage'; uiSpeichern(); fuelleSort();
      f.suche.value = nachId.get(id).n; render(); return;
    }
    oeffneDialog(null, id);
  });

  /* ---------- Start ---------- */
  (async () => {
    await ladeDaten();
    await ladeListe();
    fuelleFilter(); fuelleSort(); render();
    initSync();
  })();
})();
