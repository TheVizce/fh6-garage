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

  function renderStat() {
    const anz = anzahlProAuto();
    const besessen = liste.filter(a => anz.has(a.id)).length;
    const promo = liste.filter(a => hatPromo(a.id)).length;
    $('#statZeile').textContent = liste.length
      ? `${daten.eintraege.length} Einträge · ${besessen} von ${liste.length} Modellen (${Math.round(besessen / liste.length * 100)} %) · 📷 Promo ${promo} von ${liste.length}`
      : `${daten.eintraege.length} Einträge`;
  }

  function render() {
    document.body.dataset.tab = ui.tab;
    $$('.tab').forEach(t => t.classList.toggle('aktiv', t.dataset.tab === ui.tab));
    $('#ansichtGarage').hidden = ui.tab !== 'garage';
    $('#ansichtKatalog').hidden = ui.tab !== 'katalog';
    if (ui.tab === 'garage') renderGarage(); else renderKatalog();
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
    code: $('#eCode'), notiz: $('#eNotiz'), fav: $('#eFav'), promo: $('#ePromo'), promoWrap: $('#ePromoWrap'),
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
    e.suche.value = ''; e.treffer.hidden = true; zeigeAutoInfo();
  }
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
  e.pi.addEventListener('input', () => { e.piBadge.innerHTML = zahl(e.pi.value) != null ? badge(zahl(e.pi.value)) : ''; });

  const ZAHLFELDER = ['pi', 'vmax', 'a100', 'kw', 'kg', 'nm'];

  function oeffneDialog(eintrag, autoId) {
    bearbeitet = eintrag ? eintrag.uid : null;
    $('#formEintrag').reset();
    $$('.ocr-gefuellt', dlg).forEach(x => x.classList.remove('ocr-gefuellt'));
    ocrReset();
    $('#dlgTitel').textContent = eintrag ? 'Fahrzeug bearbeiten' : 'Fahrzeug hinzufügen';
    $('#eLoeschen').hidden = !eintrag; $('#eKopie').hidden = !eintrag;
    gewaehlt = null; setzeEigenes(false);
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
  let tessLaden = null, worker = null;

  function ocrReset() { ocr.status.textContent = ''; ocr.status.className = 'ocr-status'; ocr.roh.hidden = true; ocr.roh.open = false; }
  function ocrStatus(t, cls = '') { ocr.status.textContent = t; ocr.status.className = 'ocr-status ' + cls; }

  function ladeTesseract() {
    if (window.Tesseract) return Promise.resolve();
    if (!tessLaden) tessLaden = new Promise((ok, fail) => {
      const s = document.createElement('script'); s.src = TESS_URL; s.onload = ok;
      s.onerror = () => { tessLaden = null; fail(new Error('Texterkennung konnte nicht geladen werden (offline?)')); };
      document.head.appendChild(s);
    });
    return tessLaden;
  }
  async function holeWorker() {
    await ladeTesseract();
    if (!worker) worker = await Tesseract.createWorker(['deu', 'eng'], 1, {
      logger: m => { if (m.status === 'recognizing text') ocrStatus('Lese Text … ' + Math.round(m.progress * 100) + ' %'); else if (m.status) ocrStatus('Vorbereitung: ' + m.status); }
    });
    return worker;
  }

  // Ganzes Bild aufbereiten (Rückfallweg): vergrößern, Graustufen, bei dunklem Hintergrund invertieren
  async function aufbereiten(bmp) {
    const f = Math.min(3, Math.max(1, 2400 / bmp.width));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * f); c.height = Math.round(bmp.height * f);
    const ctx = c.getContext('2d'); ctx.drawImage(bmp, 0, 0, c.width, c.height);
    const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
    let summe = 0;
    for (let i = 0; i < d.length; i += 4) { const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; d[i] = d[i + 1] = d[i + 2] = g; summe += g; }
    if (summe / (d.length / 4) < 128) for (let i = 0; i < d.length; i += 4) { d[i] = d[i + 1] = d[i + 2] = 255 - d[i]; }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  /* Ausschnitt des Spielbildschirms (Angaben relativ, 0–1) vergrößern und nur helle, ungesättigte Pixel
     (weiße/graue Schrift) als schwarze Schrift auf Weiß behalten. Farbige Flächen und dunkler Hintergrund fallen weg. */
  function ausschnitt(bmp, x0, y0, x1, y1, faktor) {
    const W = bmp.width, H = bmp.height, w = (x1 - x0) * W, h = (y1 - y0) * H;
    const f = faktor * Math.max(1, 2000 / W);
    const c = document.createElement('canvas'); c.width = Math.round(w * f); c.height = Math.round(h * f);
    const ctx = c.getContext('2d'); ctx.drawImage(bmp, x0 * W, y0 * H, w, h, 0, 0, c.width, c.height);
    const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const mn = Math.min(d[i], d[i + 1], d[i + 2]), mx = Math.max(d[i], d[i + 1], d[i + 2]);
      d[i] = d[i + 1] = d[i + 2] = (mn > 130 && mx - mn < 70) ? 0 : 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }
  async function ocrLies(w, canvas, psm) {
    await w.setParameters({ tessedit_pageseg_mode: psm || '3' });
    return (await w.recognize(canvas)).data.text || '';
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

  async function verarbeiteBild(datei) {
    if (!datei || !/^image\//.test(datei.type)) { ocrStatus('Das ist kein Bild.', 'fehl'); return; }
    try {
      ocrStatus('Lade Texterkennung …');
      const w = await holeWorker();
      const bmp = await createImageBitmap(datei);
      const FELDER = ['pi', 'vmax', 'a100', 'kw', 'kg', 'nm'];
      let werte = {}, roh = '', autoText = '';
      // 1. Tuning-/Upgrade-Bildschirm (16:9): feste Bereiche einzeln lesen – deutlich zuverlässiger
      const seite = bmp.width / bmp.height;
      if (seite > 1.6 && seite < 1.9) {
        ocrStatus('Lese Fahrzeugwerte …');
        const name = await ocrLies(w, ausschnitt(bmp, 0.06, 0.23, 0.29, 0.31, 2));
        const stats = await ocrLies(w, ausschnitt(bmp, 0.62, 0.22, 0.94, 0.72, 2));
        const piNeu = await ocrLies(w, ausschnitt(bmp, 0.48, 0.64, 0.545, 0.69, 3), '7');   // Abzeichen „Neu“
        werte = werteAusText(stats);
        delete werte.pi;
        const pm = [...piNeu.matchAll(/(?:S1|S2|[DCBARX])?\s*(\d{3})(?!\d)/g)].pop();
        if (pm && +pm[1] >= 100 && +pm[1] <= 999) werte.pi = Number(pm[1]);
        autoText = name;
        roh = `[Name]\n${name.trim()}\n\n[Werte]\n${stats.trim()}\n\n[PI neu]\n${piNeu.trim()}`;
      }
      // 2. Rückfallweg: ganzes Bild lesen und nur fehlende Werte ergänzen
      if (FELDER.some(k => werte[k] == null)) {
        ocrStatus('Lese ganzes Bild …');
        const ganz = await ocrLies(w, await aufbereiten(bmp));
        const w2 = werteAusText(ganz);
        for (const [k, v] of Object.entries(w2)) if (werte[k] == null && v != null) werte[k] = v;
        if (!autoText || !autoAusText(autoText)) autoText = (autoText + '\n' + ganz);
        roh += (roh ? '\n\n[Ganzes Bild]\n' : '') + ganz.trim();
      }
      const text = autoText;
      ocr.roh.hidden = false; $('pre', ocr.roh).textContent = roh;
      const gefuellt = [];
      $$('.ocr-gefuellt', dlg).forEach(x => x.classList.remove('ocr-gefuellt'));
      for (const [k, v] of Object.entries(werte)) {
        if (v == null || !e[k]) continue;
        e[k].value = v; e[k].classList.add('ocr-gefuellt'); gefuellt.push(k);
      }
      e.pi.dispatchEvent(new Event('input'));
      if (!gewaehlt && !eigenesModus) { const a = autoAusText(text); if (a) { waehleAuto(a); gefuellt.push('Fahrzeug'); } }
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
  $('#btnNeu').addEventListener('click', () => oeffneDialog(null));
  [f.suche, f.klasse, f.land, f.typ, f.reifen, f.antrieb, f.besitz, f.promo, f.fav].forEach(x => x.addEventListener('input', render));
  f.sort.addEventListener('change', () => { if (ui.tab === 'garage') ui.sortG = f.sort.value; else ui.sortK = f.sort.value; uiSpeichern(); render(); });
  $('#tabGarage tbody').addEventListener('click', ev => {
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
