// ---------- Config ----------
const FLAGS = { DE: "🇩🇪", US: "🇺🇸", GB: "🇬🇧", FR: "🇫🇷", IT: "🇮🇹", ES: "🇪🇸", AT: "🇦🇹", NL: "🇳🇱", PL: "🇵🇱" };
const MP_LABEL = { ebay: "eBay", otto: "Otto", kaufland: "Kaufland", temu: "Temu" };
const MP_ORDER = ["ebay", "otto", "kaufland", "temu"];

let ALL_ROWS = [];
let IS_DEMO = false;
let PROJECTS = {};   // project_id -> { project_id, project_name, items: { item_key: {...} }, rows: [] }
let SETTINGS = {};   // docs/settings.json
const APP_VERSION = "2026-10-27.1";   // must equal the scripts' VERSION (config_loader.py); shown in the footer
let CONFIG = null;   // docs/data/config.json: the products + keywords that are in the sheet TODAY (with SKU and name)
let state = { projectId: null, marketplace: null, itemKey: null, range: "daily", days: 30, basis: "all", q: "", filter: "all", sort: { key: "now", dir: 1 }, helpOpen: false };
let LAST_GRID = null; // what the grid currently shows, used by CSV export

// ---------- Language: English / German ----------
// Only interface text is translated. Keywords, product names, SKUs, IDs and project names come from the sheet and are
// always shown exactly as they are there.
const I18N = {
  en: {
    demoBanner: "Showing demo data — no real tracker data yet. Once the daily workflow has run, your real ranks replace this automatically.",
    nothingTracked: "Nothing is being tracked yet.",
    helpTitle: "Add or change what's tracked",
    helpTabs: "Your sheet has two tabs. <b>Keywords:</b> <code>project</code>, <code>keyword</code>. <b>Products:</b> <code>project</code>, <code>marketplace</code> (ebay / otto / kaufland / temu), <code>country</code>, <code>product_id</code> (the ID from your own listing's URL), and optionally <code>name</code> and <code>source</code> (eBay only: <code>web</code> reads the real ebay.de page instead of eBay's search API).",
    helpEvery: "Every product in a project is checked against every keyword of that project, so each keyword is written once and each product is written once. A project can have several product IDs, on one marketplace or several.",
    helpLinked: '<a href="{url}" target="_blank" rel="noopener"><b>Open the tracking sheet</b></a> and add your rows there. They\'re picked up on the next hourly check.',
    helpNoSheet: "No Google Sheet is linked yet. Until you link one, copy the examples in <code>config/examples</code> to <code>config/keywords.csv</code> and <code>config/products.csv</code> in your GitHub repo and edit them (see the README for linking a Google Sheet, which is easier to edit).",
    helpNew: "A new keyword's history starts the first day it's checked. To check right away, run the workflow from your repo's <b>Actions</b> tab (<b>Track marketplace ranks → Run workflow</b>).",
    opensSheet: "Opens your Google Sheet in a new tab",
    addProducts: "+ Add products &amp; keywords",
    addKeyword: "+ Add keyword",
    lastChecked: "Last checked:",
    versionNote: "Dashboard files version",
    languageLabel: "Language",
    marketplace: "Marketplace",
    searchPh: "Search SKU or product ID…",
    searchTitle: "Type to search by SKU, product ID or product name",
    showAllProducts: "Show all products",
    noProductMatch: "No product matches “{q}”",
    bestLabel: "All {mp} products — best position",
    nProducts: "{n} products",
    lastDays: "Last {n} days",
    allTime: "All time",
    countAll: "Count: all results",
    countOrganic: "Count: organic only",
    countTitle: "Which positions to count: every result, or only organic ones with paid placements removed",
    daily: "Daily", weekly: "Weekly", monthly: "Monthly",
    rangeAll: "ALL", rangeL: "L{n}D", weekPrefix: "wk",
    firstChecks: "first checks", noChange: "no change", vsPrev: "vs previous check", pts: " pts",
    visibility: "Visibility", visTitle: "Share of tracked keywords where your product was found, on the latest day",
    avgPos: "Average Position", avgTitle: "Average position across the entries where your product was found",
    top10Label: "Keywords in Top 10", of: "of", top10Title: "How many tracked keywords have your product in the top 10 results, on the latest day",
    distribution: "Distribution", distLast: "100+ / not found",
    noUsable: "No usable checks in this period yet.", noData: "no data",
    sectionFailed: "This section couldn't be drawn ({msg}).",
    rankedFirst: "Ranked first", position: "position", organicPosition: "organic position",
    posFor: "{basis} {rank} for “{kw}”",
    tiedWith: "Tied with", alsoRanking: "Also ranking ({n})", plusMore: "+{n} more",
    noOther: "No other product of yours ranks for this keyword.",
    copySku: "Copy SKU", copyId: "Copy ID", copyAll: "Copy all",
    pinned: "Pinned · click outside or press Esc to close", close: "Close", popLabel: "Which product ranked first",
    copied: "Copied ✓", pressCopy: "Press Ctrl/Cmd+C",
    copyRankedFirst: "Ranked first for “{kw}” ({date})", tied: "tied", alsoRankingColon: "Also ranking:",
    openOn: "↗ Open on {mp}", product: "Product",
    organic: "Organic", sponsored: "Sponsored (ad slot)", overallChip: "Overall (ads counted)",
    onePos: "This marketplace gives one position per check.",
    latestOrganic: "Latest organic", latestPosition: "Latest position", adOnly: "ad only", notFound: "not found",
    bestOrganic: "Best organic", foundStat: "Found", xOfYDays: "{found} of {checked} days",
    noReadings: "No readings for this keyword in the chosen period for this product.",
    rankHistory: "Rank history", inTheTop: "in the top {n}",
    tipOrganic: "Organic", tipShownAsAd: "— (shown as an ad)", tipAdSlot: "Ad slot", tipOverall: "Overall",
    tipAdsAbove: "{n} ad(s) above it", tipBestProduct: "Best product",
    geoDE: "German connection ✓", geoOther: "connection from outside Germany", langDE: "German page ✓", pageLang: "page language: {l}", shipTo: "ship-to {pc}",
    r7: "7D", r30: "1M", r90: "3M", r365: "1Y", rAll: "ALL",
    hintEbay: "“Open on {mp}” opens the same search the tracker reads{de}. If eBay opens in English, switch it to German first: in English eBay translates the keyword and shows a different list.",
    hintDe: " (German eBay, delivery postcode {pc})",
    hintOther: "“Open on {mp}” opens the search page for this keyword.",
    notChecked: "not checked", blockedTip: "the marketplace blocked this check, which is not the same as falling out of the rankings",
    notFoundTip: "not found", kwTitle: "Show this keyword's rank history",
    thKeyword: "Keyword ({n})",
    thNow: "Now", thNowTip: "Position at the most recent check", thBest: "Best", thBestTip: "Best position in the selected period",
    thAvg: "Avg", thAvgTip: "Average position over the checks where it was found", thFound: "Found", thFoundTip: "Share of checks where it was found at all",
    thChange: "Change", thChangeTip: "Change since the check before the latest one",
    newT: "new", lostT: "lost", posAtLatest: "position at the most recent check", bestColon: "best",
    carriedTip: "not re-checked today (nothing found in its last checks; re-checked weekly)",
    fAll: "All", fTop3: "In the top 3", fTop10: "In the top 10", fTop100: "In the top 100", fNotFound: "Not found",
    fImproved: "Moved up", fDropped: "Moved down", fNew: "Newly found", fLost: "Lost",
    filterTitle: "Filter rows", filterPh: "Filter keywords…",
    sincePrev: "Since the previous check:", mvUp: "▲ moved up", mvDown: "▼ moved down", mvNew: "● newly found", mvLost: "✕ lost",
    movementAfter: "Movement (▲ ▼) appears after the second daily check.",
    exportCsv: "Export CSV", noMatch: "Nothing matches this filter.", csvBlocked: "blocked",
    legendMain: "Each column is a day; the number is where the product appears in that marketplace's search results for the keyword (1 = first).",
    legendNf: "&gt;N not found in the top N checked", legendBlocked: "blocked by the marketplace", legendNotChecked: "not checked that day",
    legendHint: "<b>Hover a number</b> to see which product ranked first; <b>click it</b> to pin the note and copy the SKU."
  },
  de: {
    demoBanner: "Es werden Demodaten angezeigt – noch keine echten Tracker-Daten. Sobald der tägliche Workflow gelaufen ist, ersetzen die echten Rankings sie automatisch.",
    nothingTracked: "Es wird noch nichts getrackt.",
    helpTitle: "Getrackte Inhalte hinzufügen oder ändern",
    helpTabs: "Ihre Tabelle hat zwei Tabs. <b>Keywords:</b> <code>project</code>, <code>keyword</code>. <b>Products:</b> <code>project</code>, <code>marketplace</code> (ebay / otto / kaufland / temu), <code>country</code>, <code>product_id</code> (die ID aus der URL Ihres eigenen Angebots) und optional <code>name</code> und <code>source</code> (nur eBay: <code>web</code> liest die echte ebay.de-Seite statt der eBay-Such-API).",
    helpEvery: "Jedes Produkt eines Projekts wird mit jedem Keyword dieses Projekts geprüft; deshalb wird jedes Keyword und jedes Produkt nur einmal eingetragen. Ein Projekt kann mehrere Produkt-IDs haben, auf einem oder mehreren Marktplätzen.",
    helpLinked: '<a href="{url}" target="_blank" rel="noopener"><b>Tracking-Tabelle öffnen</b></a> und dort die Zeilen ergänzen. Sie werden beim nächsten stündlichen Check übernommen.',
    helpNoSheet: "Es ist noch keine Google-Tabelle verknüpft. Kopieren Sie bis dahin die Beispiele aus <code>config/examples</code> nach <code>config/keywords.csv</code> und <code>config/products.csv</code> in Ihrem GitHub-Repository und bearbeiten Sie sie (zum Verknüpfen einer Google-Tabelle, die sich leichter bearbeiten lässt, siehe README).",
    helpNew: "Die Historie eines neuen Keywords beginnt am ersten Tag, an dem es geprüft wird. Für eine sofortige Prüfung den Workflow im Tab <b>Actions</b> Ihres Repositories starten (<b>Track marketplace ranks → Run workflow</b>).",
    opensSheet: "Öffnet Ihre Google-Tabelle in einem neuen Tab",
    addProducts: "+ Produkte &amp; Keywords hinzufügen",
    addKeyword: "+ Keyword hinzufügen",
    lastChecked: "Zuletzt geprüft:",
    versionNote: "Dashboard-Dateien Version",
    languageLabel: "Sprache",
    marketplace: "Marktplatz",
    searchPh: "SKU oder Produkt-ID suchen…",
    searchTitle: "Tippen, um nach SKU, Produkt-ID oder Produktname zu suchen",
    showAllProducts: "Alle Produkte anzeigen",
    noProductMatch: "Kein Produkt passt zu „{q}“",
    bestLabel: "Alle {mp}-Produkte — beste Position",
    nProducts: "{n} Produkte",
    lastDays: "Letzte {n} Tage",
    allTime: "Gesamter Zeitraum",
    countAll: "Zählung: alle Ergebnisse",
    countOrganic: "Zählung: nur organisch",
    countTitle: "Welche Positionen gezählt werden: alle Ergebnisse oder nur organische ohne bezahlte Platzierungen",
    daily: "Täglich", weekly: "Wöchentlich", monthly: "Monatlich",
    rangeAll: "ALLE", rangeL: "L{n}T", weekPrefix: "Wo.",
    firstChecks: "erste Prüfungen", noChange: "keine Änderung", vsPrev: "ggü. letzter Prüfung", pts: " Pkt.",
    visibility: "Sichtbarkeit", visTitle: "Anteil der getrackten Keywords, bei denen Ihr Produkt am letzten Tag gefunden wurde",
    avgPos: "Durchschnittliche Position", avgTitle: "Durchschnittliche Position über die Einträge, bei denen Ihr Produkt gefunden wurde",
    top10Label: "Keywords in den Top 10", of: "von", top10Title: "Bei wie vielen getrackten Keywords Ihr Produkt am letzten Tag unter den Top-10-Ergebnissen steht",
    distribution: "Verteilung", distLast: "100+ / nicht gefunden",
    noUsable: "In diesem Zeitraum gibt es noch keine verwertbaren Prüfungen.", noData: "keine Daten",
    sectionFailed: "Dieser Bereich konnte nicht dargestellt werden ({msg}).",
    rankedFirst: "Auf Platz 1", position: "Position", organicPosition: "organische Position",
    posFor: "{basis} {rank} für „{kw}“",
    tiedWith: "Gleichauf mit", alsoRanking: "Außerdem platziert ({n})", plusMore: "+{n} weitere",
    noOther: "Kein anderes Ihrer Produkte rankt für dieses Keyword.",
    copySku: "SKU kopieren", copyId: "ID kopieren", copyAll: "Alles kopieren",
    pinned: "Fixiert · außerhalb klicken oder Esc drücken zum Schließen", close: "Schließen", popLabel: "Welches Produkt auf Platz 1 steht",
    copied: "Kopiert ✓", pressCopy: "Strg/Cmd+C drücken",
    copyRankedFirst: "Platz 1 für „{kw}“ ({date})", tied: "gleichauf", alsoRankingColon: "Außerdem platziert:",
    openOn: "↗ Auf {mp} öffnen", product: "Produkt",
    organic: "Organisch", sponsored: "Gesponsert (Anzeigenplatz)", overallChip: "Gesamt (inkl. Anzeigen)",
    onePos: "Dieser Marktplatz liefert pro Prüfung eine Position.",
    latestOrganic: "Aktuell organisch", latestPosition: "Aktuelle Position", adOnly: "nur Anzeige", notFound: "nicht gefunden",
    bestOrganic: "Beste organische", foundStat: "Gefunden", xOfYDays: "{found} von {checked} Tagen",
    noReadings: "Für dieses Keyword gibt es im gewählten Zeitraum keine Messwerte für dieses Produkt.",
    rankHistory: "Ranking-Verlauf", inTheTop: "in den Top {n}",
    tipOrganic: "Organisch", tipShownAsAd: "— (als Anzeige gezeigt)", tipAdSlot: "Anzeigenplatz", tipOverall: "Gesamt",
    tipAdsAbove: "{n} Anzeige(n) darüber", tipBestProduct: "Bestes Produkt",
    geoDE: "Deutsche Verbindung ✓", geoOther: "Verbindung von außerhalb Deutschlands", langDE: "Deutsche Seite ✓", pageLang: "Seitensprache: {l}", shipTo: "Lieferung nach {pc}",
    r7: "7T", r30: "1M", r90: "3M", r365: "1J", rAll: "ALLE",
    hintEbay: "„Auf {mp} öffnen“ öffnet dieselbe Suche, die der Tracker liest{de}. Öffnet sich eBay auf Englisch, stellen Sie es zuerst auf Deutsch um: Auf Englisch übersetzt eBay das Keyword und zeigt eine andere Liste.",
    hintDe: " (eBay Deutschland, Lieferpostleitzahl {pc})",
    hintOther: "„Auf {mp} öffnen“ öffnet die Suchseite für dieses Keyword.",
    notChecked: "nicht geprüft", blockedTip: "der Marktplatz hat diese Prüfung blockiert; das ist nicht dasselbe wie aus dem Ranking zu fallen",
    notFoundTip: "nicht gefunden", kwTitle: "Ranking-Verlauf dieses Keywords anzeigen",
    thKeyword: "Keyword ({n})",
    thNow: "Aktuell", thNowTip: "Position bei der letzten Prüfung", thBest: "Beste", thBestTip: "Beste Position im gewählten Zeitraum",
    thAvg: "Ø", thAvgTip: "Durchschnittliche Position über die Prüfungen, bei denen es gefunden wurde", thFound: "Gefunden", thFoundTip: "Anteil der Prüfungen, bei denen es überhaupt gefunden wurde",
    thChange: "Änderung", thChangeTip: "Änderung seit der Prüfung vor der letzten",
    newT: "neu", lostT: "verloren", posAtLatest: "Position bei der letzten Prüfung", bestColon: "beste",
    carriedTip: "heute nicht erneut geprüft (in den letzten Prüfungen nichts gefunden; wird wöchentlich neu geprüft)",
    fAll: "Alle", fTop3: "In den Top 3", fTop10: "In den Top 10", fTop100: "In den Top 100", fNotFound: "Nicht gefunden",
    fImproved: "Verbessert", fDropped: "Verschlechtert", fNew: "Neu gefunden", fLost: "Verloren",
    filterTitle: "Zeilen filtern", filterPh: "Keywords filtern…",
    sincePrev: "Seit der letzten Prüfung:", mvUp: "▲ verbessert", mvDown: "▼ verschlechtert", mvNew: "● neu gefunden", mvLost: "✕ verloren",
    movementAfter: "Bewegung (▲ ▼) erscheint nach der zweiten täglichen Prüfung.",
    exportCsv: "CSV exportieren", noMatch: "Keine Treffer für diesen Filter.", csvBlocked: "blockiert",
    legendMain: "Jede Spalte ist ein Tag; die Zahl zeigt, an welcher Stelle das Produkt in den Suchergebnissen des Marktplatzes für das Keyword erscheint (1 = erster).",
    legendNf: "&gt;N nicht in den geprüften Top N gefunden", legendBlocked: "blockiert vom Marktplatz", legendNotChecked: "an diesem Tag nicht geprüft",
    legendHint: "<b>Zahl überfahren</b>, um zu sehen, welches Produkt auf Platz 1 stand; <b>anklicken</b>, um den Hinweis zu fixieren und die SKU zu kopieren."
  },
};

function initialLang() {
  try { const q = new URLSearchParams(location.search).get("lang"); if (q === "de" || q === "en") return q; } catch (e) { /* no URL: ignore */ }
  try { const saved = localStorage.getItem("rt_lang"); if (saved === "de" || saved === "en") return saved; } catch (e) { /* storage blocked: ignore */ }
  return String(navigator.language || "").toLowerCase().startsWith("de") ? "de" : "en";
}
let LANG = initialLang();
const LOCALE = () => (LANG === "de" ? "de-DE" : "en-US");
function t(key, vars) {
  let str = (I18N[LANG] && I18N[LANG][key]) ?? I18N.en[key] ?? key;
  if (vars) Object.keys(vars).forEach((k) => { str = str.split("{" + k + "}").join(vars[k]); });
  return str;
}
// numbers: decimal comma in German
function nf(v, dec = 1) { const x = Number(v).toFixed(dec); return LANG === "de" ? x.replace(".", ",") : x; }
const pct = (v, dec = 0) => (LANG === "de" ? nf(v, dec) + "\u00a0%" : nf(v, dec) + "%");

function langToggleHTML() {
  return `<div class="lang-toggle" role="group" aria-label="${esc(t("languageLabel"))}"><button type="button" data-lang="en" class="${LANG === "en" ? "active" : ""}" title="English" aria-pressed="${LANG === "en"}">EN</button><button type="button" data-lang="de" class="${LANG === "de" ? "active" : ""}" title="Deutsch" aria-pressed="${LANG === "de"}">DE</button></div>`;
}
function setLang(code) {
  if (code !== "en" && code !== "de") return;
  LANG = code;
  try { localStorage.setItem("rt_lang", code); } catch (e) { /* storage blocked: the choice just lasts for this visit */ }
  document.documentElement.lang = code;
  renderPage();                                        // keeps the selected project, marketplace, product, filter and sort
  if (typeof MODAL !== "undefined" && MODAL.keyword) renderKeywordModal();
}
function bindLangToggle() {
  document.querySelectorAll(".lang-toggle button").forEach((b) => b.addEventListener("click", () => setLang(b.dataset.lang)));
}

// ---------- Small helpers ----------
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function uniq(arr) { return [...new Set(arr)]; }
function mean(nums) {
  const v = nums.filter((n) => n !== null && n !== undefined);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
// All date maths is done in UTC so results don't shift by a day depending on
// the viewer's time zone.
function utcDate(iso) { return new Date(iso + "T00:00:00Z"); }
function shiftDate(iso, days) {
  const d = utcDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function fmtDateShort(iso) {
  return utcDate(iso).toLocaleDateString(LOCALE(), { day: "2-digit", month: "short", timeZone: "UTC" });
}
function isoWeekStart(iso) {
  const d = utcDate(iso);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}
function monthKey(iso) { return iso.slice(0, 7); }
function monthLabel(key) {
  return utcDate(key + "-01").toLocaleDateString(LOCALE(), { month: "short", year: "numeric", timeZone: "UTC" });
}
function tierClass(rank) {
  if (rank === "BLOCKED") return "r-blocked";
  if (rank === null || rank === undefined) return "r-5";
  if (rank <= 3) return "r-1";
  if (rank <= 10) return "r-2";
  if (rank <= 50) return "r-3";
  if (rank <= 100) return "r-4";
  return "r-5";
}

// ---------- Data loading ----------
async function fetchJSON(path) {
  try {
    const res = await fetch(path + (path.includes("?") ? "&" : "?") + "v=" + Date.now(), { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

async function loadData() {
  let rows = await fetchJSON("data/ranks.json");
  IS_DEMO = false;
  if (!rows || rows.length === 0) {
    rows = await fetchJSON("data/demo-ranks.json");
    IS_DEMO = true;
  }
  ALL_ROWS = rows || [];
  SETTINGS = (await fetchJSON("settings.json")) || {};
  CONFIG = IS_DEMO ? null : await fetchJSON("data/config.json");
  // Open on organic positions (paid "Anzeige" slots left out) whenever the data has them; the dropdown switches back to
  // "all results". Only on the first load, so a choice made later is never overridden.
  if (!IS_DEMO && ALL_ROWS.some((r) => r.organic_rank !== undefined)) state.basis = "organic";
  PROJECTS = buildProjects(ALL_ROWS);
}

// ranks.json is a history: keywords and products removed from the sheet stay in it (so nothing is lost and they
// come back with their history if re-added), but the dashboard shows only what the sheet has today (config.json).
function visibleRows(rows) {
  if (!CONFIG || !Array.isArray(CONFIG.projects) || IS_DEMO) return rows;
  const allowed = new Set();
  CONFIG.projects.forEach((p) => (p.items || []).forEach((i) => (i.keywords || []).forEach((k) => allowed.add(`${p.project_id}|${i.item_key}|${k}`))));
  const kept = rows.filter((r) => allowed.has(`${r.project_id}|${r.item_key}|${r.keyword}`));
  if (!kept.length && rows.length) { console.warn("config.json matches none of the saved rows; showing everything"); return rows; }
  return kept;
}

// Which position counts: every result (as listed), or "organic only" with paid placements removed.
// Rows that have no organic position (other marketplaces, older checks) always use their normal rank.
function applyBasis(rows) {
  rows.forEach((r) => {
    if (r.rank_all === undefined) r.rank_all = r.rank;
    r.rank = state.basis === "organic" && r.organic_rank !== undefined ? r.organic_rank : r.rank_all;
  });
}

function buildProjects(allRows) {
  applyBasis(allRows);
  const rows = visibleRows(allRows);
  const map = {};
  rows.forEach((r) => {
    const p = (map[r.project_id] = map[r.project_id] || {
      project_id: r.project_id, project_name: r.project_name, items: {}, rows: [],
    });
    p.rows.push(r);
    const it = (p.items[r.item_key] = p.items[r.item_key] || {
      item_key: r.item_key, marketplace: r.marketplace, country: r.country, product_id: r.item_id || r.item_key, label: null, rows: [],
    });
    it.rows.push(r);
    if (r.item_label) it.label = r.item_label; // optional product name from the sheet's Products tab
    if (r.item_sku) it.sku = r.item_sku;       // optional SKU
  });
  // the sheet as it is today wins over what older rows carry (SKU, product name, project name)
  if (CONFIG && Array.isArray(CONFIG.projects) && !IS_DEMO) {
    CONFIG.projects.forEach((cp) => {
      const p = map[cp.project_id];
      if (!p) return;
      if (cp.project_name) p.project_name = cp.project_name;
      (cp.items || []).forEach((ci) => {
        const it = p.items[ci.item_key];
        if (!it) return;
        if (ci.label) it.label = ci.label;
        if (ci.sku) it.sku = ci.sku;
      });
    });
  }
  Object.values(map).forEach((p) => {
    const byMp = {};
    Object.values(p.items).forEach((i) => (byMp[i.marketplace] = byMp[i.marketplace] || []).push(i));
    Object.entries(byMp).forEach(([mp, list]) => {
      if (list.length < 2) return;
      // "All <marketplace> products - best position": for every keyword and day, the best (lowest) rank among that
      // marketplace's products in the project. Computed on demand, so it follows the "all results / organic only" switch.
      const key = "__best__:" + mp;
      p.items[key] = {
        item_key: key, marketplace: mp, country: "", product_id: "all", synthetic: true, count: list.length,
        get label() { return t("bestLabel", { mp: MP_LABEL[mp] || mp }); },
        get rows() { return bestRows(p, mp, key); },
      };
    });
  });
  return map;
}

function bestRows(project, mp, key) {
  const real = Object.values(project.items).filter((i) => !i.synthetic && i.marketplace === mp);
  const multiCountry = new Set(real.map((i) => i.country)).size > 1;
  const who = (it) => `${it.sku ? it.sku + " · " : ""}${it.product_id}${multiCountry && it.country ? " · " + it.country : ""}`;
  const out = {};
  real.forEach((it) => {
    it.rows.forEach((r) => {
      const k = r.keyword + "\u0000" + r.date;
      const a = (out[k] = out[k] || {
        date: r.date, checked_at: r.checked_at, project_id: r.project_id, project_name: r.project_name, item_key: key,
        marketplace: mp, country: "", keyword: r.keyword, rank: null, item_id: "all", results_scanned: r.results_scanned,
        blocked: true, holder: null, found_n: 0, others: [], tied: [], _list: [],
      });
      if (!r.blocked) {
        a.blocked = false;
        if (r.rank !== null && r.rank !== undefined) a._list.push({ who: who(it), sku: it.sku || "", id: String(it.product_id), rank: r.rank });
        a.results_scanned = Math.max(a.results_scanned || 0, r.results_scanned || 0) || r.results_scanned;
      }
      if ((r.checked_at || "") > (a.checked_at || "")) a.checked_at = r.checked_at;
    });
  });
  return Object.values(out).map((a) => {
    a._list.sort((x, y) => x.rank - y.rank);
    if (a._list.length) {
      a.rank = a._list[0].rank; a.holder = a._list[0].who; a.holder_sku = a._list[0].sku; a.holder_id = a._list[0].id; a.found_n = a._list.length;
      a.tied = a._list.slice(1).filter((e) => e.rank === a.rank).map((e) => e.who);
      a.others = a._list.slice(1).filter((e) => e.rank !== a.rank);
    }
    delete a._list;
    return a;
  });
}

function cmpSku(a, b) {
  const sa = a.sku || "", sb = b.sku || "";
  if (sa && sb) return sa.localeCompare(sb, undefined, { numeric: true, sensitivity: "base" }) || String(a.product_id).localeCompare(String(b.product_id));
  if (sa !== sb) return sa ? -1 : 1;           // products with a SKU first
  return String(a.product_id).localeCompare(String(b.product_id));
}

function marketplacesOf(project) {
  const present = new Set(Object.values(project.items).map((i) => i.marketplace));
  return [...MP_ORDER.filter((m) => present.has(m)), ...[...present].filter((m) => !MP_ORDER.includes(m))];
}

function sortedItems(project, mp) {
  return Object.values(project.items).filter((i) => !mp || i.marketplace === mp).sort(
    (a, b) =>
      (b.synthetic ? 1 : 0) - (a.synthetic ? 1 : 0) ||
      MP_ORDER.indexOf(a.marketplace) - MP_ORDER.indexOf(b.marketplace) ||
      a.country.localeCompare(b.country) ||
      cmpSku(a, b)
  );
}

// ---------- Current selection ----------
function currentProject() { return PROJECTS[state.projectId]; }
function currentItem() { return currentProject().items[state.itemKey]; }

// Rows inside the selected period, counted back from the newest check among them.
function inPeriod(rows) {
  if (state.days === "all" || !rows.length) return rows;
  const latest = rows.map((r) => r.date).sort().pop();
  const cutoff = shiftDate(latest, -(state.days - 1));
  return rows.filter((r) => r.date >= cutoff);
}
const fmtFull = (iso) => utcDate(iso).toLocaleDateString(LOCALE(), { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
function daysBetween(a, b) { return Math.round((utcDate(b) - utcDate(a)) / 86400000); }
const MIN_DAILY_COLUMNS = 14; // keep the table's full shape even in the first days of tracking

function itemText(i, withCountry = false) {
  if (i.synthetic) return `★ ${i.label} (${t("nProducts", { n: i.count })})`;
  const core = i.sku ? `${i.sku} · ${i.product_id}` : String(i.product_id);
  return withCountry && i.country ? `${core} · ${i.country}` : core;
}
// Heatmap colours come from the brand's own Success -> Warning -> Error colours
// (#10B981, #F59E0B, #EF4444), blended by rank: 1 = success, ~30 = warning, 150+ = error.
// Plain #rrggbb values, so they render identically in every browser and export.
const BRAND_HEAT = [[16, 185, 129], [245, 158, 11], [239, 68, 68]];
function heatRGB(rank) {
  const t = Math.min(1, Math.log(Math.max(rank, 1)) / Math.log(150));
  const [a, b, u] = t < 0.7 ? [BRAND_HEAT[0], BRAND_HEAT[1], t / 0.7] : [BRAND_HEAT[1], BRAND_HEAT[2], (t - 0.7) / 0.3];
  return a.map((v, i) => v + (b[i] - v) * u);
}
const toHex = (c) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
function heat(rank) {                       // pastel cell background + dark readable number
  const c = heatRGB(rank);
  return { bg: toHex(c.map((v) => v + (255 - v) * 0.78)), fg: toHex(c.map((v) => v * 0.42)) };
}
const DIST_COLORS = [1, 7, 28, 75, 150].map((r) => toHex(heatRGB(r)));   // solid bar colours
const DIST_LABELS = ["1-3", "4-10", "11-50", "51-100", ""];
const distLabel = (i) => (i === 4 ? t("distLast") : DIST_LABELS[i]);
const bucketOf = (rank) => (rank === null ? 4 : rank <= 3 ? 0 : rank <= 10 ? 1 : rank <= 50 ? 2 : rank <= 100 ? 3 : 4);

// Draw one section; if it fails, say so in that spot but keep the rest of the page.
function safely(hostId, fn) {
  try { fn(); } catch (e) {
    console.error(e);
    const el = document.getElementById(hostId);
    if (el) el.innerHTML = `<div class="empty-state">${esc(t("sectionFailed", { msg: e.message }))}</div>`;
  }
}

// ---------- Page ----------
async function boot() {
  document.documentElement.lang = LANG;
  await loadData();
  const first = Object.keys(PROJECTS)[0];
  state.projectId = first || null;
  state.helpOpen = !first; // nothing tracked yet -> show how to add products straight away
  renderPage();
}

// "+ Add products & keywords" and "+ Add keyword": straight to the Google Sheet (docs/settings.json -> sheet_url), opened in
// a new tab. Without a sheet link they stay buttons that open the how-to panel.
function addButtonHTML(id, label, cls) {
  return SETTINGS.sheet_url
    ? `<a class="btn ${cls}" id="${id}" href="${esc(SETTINGS.sheet_url)}" target="_blank" rel="noopener" title="${esc(t("opensSheet"))}">${label}</a>`
    : `<button class="btn ${cls}" id="${id}">${label}</button>`;
}

function helpPanelHTML() {
  const link = SETTINGS.sheet_url ? `<p>${t("helpLinked", { url: esc(SETTINGS.sheet_url) })}</p>` : `<p>${t("helpNoSheet")}</p>`;
  return `
    <div class="help-panel">
      <b>${t("helpTitle")}</b>
      <p>${t("helpTabs")}</p>
      <p>${t("helpEvery")}</p>
      ${link}
      <p>${t("helpNew")}</p>
    </div>`;
}

let VIEW = { rows: [], rangeText: "" };

function computeView() {
  const rows = inPeriod(currentItem().rows);
  const dates = rows.map((r) => r.date).sort();
  let rangeText = "";
  if (dates.length) {
    const latest = dates[dates.length - 1];
    const start = state.days === "all" ? dates[0] : shiftDate(latest, -(state.days - 1));
    rangeText = `${state.days === "all" ? t("rangeAll") : t("rangeL", { n: state.days })}  ${fmtFull(start)} – ${fmtFull(latest)}`;
  }
  VIEW = { rows, rangeText };
}

// ---------- Searchable product box ----------
// Lower-case, accent-free text, so "anhanger" finds "Anhänger".
function foldText(t) { return String(t).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, ""); }
function markMatches(text, terms) {
  let out = esc(text);
  terms.forEach((t) => { if (t) out = out.replace(new RegExp("(" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig"), "<mark>$1</mark>"); });
  return out;
}
let COMBO_CLOSE = null; // closes the product list that is currently open (one document-level listener, bound once)
document.addEventListener("mousedown", (e) => { if (COMBO_CLOSE && !e.target.closest(".combo")) COMBO_CLOSE(); });

function bindCombo(entries, selectedKey) {
  const input = document.getElementById("itemInput"), list = document.getElementById("itemList"), toggle = document.getElementById("itemToggle");
  if (!input || !list) return;
  const current = entries.find((e) => e.key === selectedKey);
  let shown = entries, active = -1, open = false;

  const setOpen = (v) => { open = v; list.hidden = !v; input.setAttribute("aria-expanded", String(v)); if (!v) input.removeAttribute("aria-activedescendant"); };
  const close = () => { if (open) setOpen(false); input.value = current ? current.text : ""; };
  const paintActive = () => {
    [...list.children].forEach((li, i) => li.classList.toggle("active", i === active));
    const li = list.children[active];
    if (li && li.id) { input.setAttribute("aria-activedescendant", li.id); li.scrollIntoView({ block: "nearest" }); }
  };
  const render = (query) => {
    const terms = foldText(query).split(/\s+/).filter(Boolean);
    shown = terms.length ? entries.filter((e) => terms.every((t) => e.hay.includes(t))) : entries;
    list.innerHTML = shown.length
      ? shown.map((e, i) => `<li role="option" id="itemOpt${i}" data-key="${esc(e.key)}" class="${e.key === selectedKey ? "sel" : ""}"${e.title ? ` title="${esc(e.title)}"` : ""}>${markMatches(e.text, terms)}</li>`).join("")
      : `<li class="none">${esc(t("noProductMatch", { q: query }))}</li>`;
    // empty box: start on the current product; while typing: start on the first match
    active = shown.length ? (terms.length ? 0 : Math.max(0, shown.findIndex((e) => e.key === selectedKey))) : -1;
    paintActive();
  };
  const choose = (key) => {
    setOpen(false);
    if (key && key !== state.itemKey) { state.itemKey = key; renderPage(); } else input.value = current ? current.text : "";
  };
  const show = (query) => { render(query); setOpen(true); COMBO_CLOSE = close; };

  input.addEventListener("focus", () => { input.select(); show(""); });
  input.addEventListener("click", () => { if (!open) { input.select(); show(""); } });
  input.addEventListener("input", () => show(input.value));
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) { show(""); return; }
      if (shown.length) { active = (active + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % shown.length; paintActive(); }
    } else if (e.key === "Enter") {
      if (open && shown[active]) { e.preventDefault(); choose(shown[active].key); }
    } else if (e.key === "Escape") {
      if (open) { e.preventDefault(); close(); input.select(); }
    } else if (e.key === "Tab") { close(); }
  });
  list.addEventListener("mousedown", (e) => {
    e.preventDefault();                                   // keep the box focused until the choice is made
    const li = e.target.closest("li[data-key]");
    if (li) choose(li.dataset.key);
  });
  list.addEventListener("mousemove", (e) => {
    const li = e.target.closest("li[data-key]");
    if (li) { active = [...list.children].indexOf(li); [...list.children].forEach((x, i) => x.classList.toggle("active", i === active)); }
  });
  toggle.addEventListener("mousedown", (e) => { e.preventDefault(); if (open) close(); else { input.focus(); show(""); } });
}

function renderPage() {
  const app = document.getElementById("app");
  const projects = Object.values(PROJECTS);

  const demoBanner = IS_DEMO
    ? `<div class="demo-banner">${esc(t("demoBanner"))}</div>`
    : "";

  if (!projects.length) {
    app.innerHTML = `
      ${demoBanner}
      <div class="topbar"><img class="brand-icon" src="logo-icon.svg" alt="CD Commerce" /><h1>Rank Tracker</h1><div class="spacer"></div>${langToggleHTML()}</div>
      ${helpPanelHTML()}
      <div class="content"><div class="empty-state">${esc(t("nothingTracked"))}</div></div>`;
    bindLangToggle();
    return;
  }

  if (!PROJECTS[state.projectId]) state.projectId = projects[0].project_id;
  const project = currentProject();
  const mps = marketplacesOf(project);
  if (!state.marketplace || !mps.includes(state.marketplace)) state.marketplace = mps[0];
  const items = sortedItems(project, state.marketplace);
  if (!state.itemKey || !project.items[state.itemKey] || project.items[state.itemKey].marketplace !== state.marketplace) {
    state.itemKey = items[0].item_key;   // the list starts with "★ All <marketplace> products — best position" whenever the marketplace has 2+ products
  }
  const multiCountry = new Set(items.filter((i) => !i.synthetic).map((i) => i.country)).size > 1;
  computeView();

  const lastChecked = project.rows.map((r) => r.checked_at || r.date).sort().pop();
  const opt = (v, text, sel, title) => `<option value="${esc(v)}" ${sel ? "selected" : ""}${title ? ` title="${esc(title)}"` : ""}>${esc(text)}</option>`;
  const projectOptions = projects.map((p) => opt(p.project_id, p.project_name, p.project_id === state.projectId)).join("");
  const comboEntries = items.map((i) => ({
    key: i.item_key, text: itemText(i, multiCountry), title: i.synthetic ? "" : i.label || "",
    // what typing can match: SKU, product ID, country and the product name (the name is searched but not shown)
    hay: foldText([i.sku, i.product_id, i.country, i.synthetic ? `${i.label} all best position alle beste` : i.label].filter(Boolean).join(" ")),
  }));
  const selectedText = (comboEntries.find((e) => e.key === state.itemKey) || { text: "" }).text;
  const marketOptions = mps.map((m) => {
    const n = Object.values(project.items).filter((i) => !i.synthetic && i.marketplace === m).length;
    return opt(m, `${MP_LABEL[m] || m} (${n})`, m === state.marketplace);
  }).join("");
  const periods = [[14, t("lastDays", { n: 14 })], [30, t("lastDays", { n: 30 })], [60, t("lastDays", { n: 60 })], [90, t("lastDays", { n: 90 })], ["all", t("allTime")]]
    .map(([v, label]) => opt(v, label, String(v) === String(state.days))).join("");
  const hasOrganic = project.rows.some((r) => r.organic_rank !== undefined);
  const basisSelect = hasOrganic
    ? `<select id="basisSelect" title="${esc(t("countTitle"))}"><option value="all" ${state.basis === "all" ? "selected" : ""}>${esc(t("countAll"))}</option><option value="organic" ${state.basis === "organic" ? "selected" : ""}>${esc(t("countOrganic"))}</option></select>`
    : "";
  const rangeGroup = `${basisSelect}<div class="range-group">${["daily", "weekly", "monthly"].map((r) => `<div class="range-btn ${state.range === r ? "active" : ""}" data-range="${r}">${esc(t(r))}</div>`).join("")}</div>
      <select id="periodSelect">${periods}</select><span class="range-text">${esc(VIEW.rangeText)}</span>`;

  const controls = `<div class="ctrl-group"><select class="market-select" id="marketSelect" title="${esc(t("marketplace"))}">${marketOptions}</select><div class="combo" id="itemCombo">
        <input type="text" class="combo-input" id="itemInput" role="combobox" aria-expanded="false" aria-controls="itemList" aria-autocomplete="list"
               autocomplete="off" spellcheck="false" placeholder="${esc(t("searchPh"))}" value="${esc(selectedText)}" title="${esc(t("searchTitle"))}" />
        <button type="button" class="combo-toggle" id="itemToggle" tabindex="-1" aria-label="${esc(t("showAllProducts"))}">▾</button>
        <ul class="combo-list" id="itemList" role="listbox" hidden></ul>
      </div>${addButtonHTML("addKwBtn", t("addKeyword"), "")}</div><div class="ctrl-group">${rangeGroup}</div>`;

  app.innerHTML = `
    ${demoBanner}
    <div class="topbar">
      <img class="brand-icon" src="logo-icon.svg" alt="CD Commerce" />
      <h1>Rank Tracker</h1>
      <select class="project-select" id="projectSelect">${projectOptions}</select>
      <div class="spacer"></div>
      ${langToggleHTML()}
      <span class="updated">${esc(t("lastChecked"))} ${esc(new Date(lastChecked).toLocaleString(LOCALE()))}</span>
      ${addButtonHTML("helpBtn", t("addProducts"), "primary")}
    </div>
    ${state.helpOpen ? helpPanelHTML() : ""}
    <div class="content">
      <div class="controls-row">${controls}</div>
      <div class="summary-grid" id="summaryGrid"></div>
      <div class="table-toolbar" id="tableToolbar"></div>
      <div class="grid-legend" id="gridLegend"></div>
      <div class="grid-wrap"><table class="rankgrid" id="rankGrid"></table></div>
      <div class="version-note">${esc(t("versionNote"))} ${APP_VERSION}</div>
    </div>`;

  const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };
  bindLangToggle();
  on("projectSelect", "change", (e) => { state.projectId = e.target.value; state.marketplace = null; state.itemKey = null; renderPage(); });
  on("marketSelect", "change", (e) => { state.marketplace = e.target.value; state.itemKey = null; renderPage(); });
  bindCombo(comboEntries, state.itemKey);
  on("basisSelect", "change", (e) => { state.basis = e.target.value; applyBasis(ALL_ROWS); renderPage(); });
  on("periodSelect", "change", (e) => { state.days = e.target.value === "all" ? "all" : Number(e.target.value); renderPage(); });
  if (!SETTINGS.sheet_url) {   // with a sheet link set, these are plain links that open the sheet; without one they show the how-to panel
    on("helpBtn", "click", () => { state.helpOpen = !state.helpOpen; renderPage(); });
    on("addKwBtn", "click", () => { state.helpOpen = true; renderPage(); window.scrollTo(0, 0); });
  }
  document.querySelectorAll(".range-btn").forEach((b) => b.addEventListener("click", () => { state.range = b.dataset.range; renderPage(); }));

  safely("summaryGrid", () => renderSummaryCards(VIEW.rows));
  safely("rankGrid", renderTable);
}

// ---------- Summary cards (charts are drawn here as SVG: no outside libraries) ----------
function computeSeries(rows) {
  // A blocked check means "we couldn't look", not "you weren't found", so it stays out.
  const valid = rows.filter((r) => !r.blocked);
  const dates = uniq(valid.map((r) => r.date)).sort();
  const by = {};
  valid.forEach((r) => (by[r.date] = by[r.date] || []).push(r));
  const out = { dates, vis: [], avg: [], top10: [], dist: [] };
  dates.forEach((d) => {
    const rs = by[d];
    out.vis.push((rs.filter((r) => r.rank !== null).length / rs.length) * 100);
    out.avg.push(mean(rs.map((r) => r.rank)));
    out.top10.push(rs.filter((r) => r.rank !== null && r.rank <= 10).length);
    const c = [0, 0, 0, 0, 0];
    rs.forEach((r) => c[bucketOf(r.rank)]++);
    out.dist.push(c);
  });
  return out;
}

const CW = 320, CH = 126, CL = 6, CT = 10, CB = 24;
function fmtTick(v) { return Math.abs(v) >= 10 || Number.isInteger(v) ? String(Math.round(v)) : nf(v, 1); }

function lineSVG(dates, values, o = {}) {
  const R = 44, pw = CW - CL - R, ph = CH - CT - CB;
  const nums = values.filter((v) => v !== null && v !== undefined);
  if (!nums.length) return `<svg viewBox="0 0 ${CW} ${CH}" class="chart"><text x="${CW / 2}" y="${CH / 2}" text-anchor="middle" class="ax">${esc(t("noData"))}</text></svg>`;
  let lo = o.min ?? Math.min(...nums), hi = o.max ?? Math.max(...nums);
  if (o.min === undefined || o.max === undefined) { const pad = (hi - lo) * 0.12 || 1; if (o.min === undefined) lo = Math.max(0, lo - pad); if (o.max === undefined) hi += pad; }
  if (hi === lo) hi = lo + 1;
  const n = values.length;
  const x = (i) => (n === 1 ? CL + pw / 2 : CL + (i * pw) / (n - 1));
  const y = (v) => { const f = (v - lo) / (hi - lo); return o.reverse ? CT + f * ph : CT + (1 - f) * ph; };
  const base = CT + ph;

  const segs = []; let cur = [];
  values.forEach((v, i) => { if (v === null || v === undefined) { if (cur.length) segs.push(cur); cur = []; } else cur.push([x(i), y(v)]); });
  if (cur.length) segs.push(cur);
  const pt = (p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
  let line = "", area = "";
  segs.forEach((s) => {
    if (s.length > 1) {
      line += `M${s.map(pt).join(" L")} `;
      area += `M${s[0][0].toFixed(1)} ${base} L${s.map(pt).join(" L")} L${s[s.length - 1][0].toFixed(1)} ${base} Z `;
    }
  });
  const ticks = [lo, (lo + hi) / 2, hi].map((t) => `<line x1="${CL}" x2="${CW - R}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" class="grid"/><text x="${CW - R + 5}" y="${(y(t) + 3).toFixed(1)}" class="ax">${(o.fmt || fmtTick)(t)}</text>`).join("");
  const color = o.color || "#D97757";
  const lastIdx = (() => { for (let i = n - 1; i >= 0; i--) if (values[i] !== null && values[i] !== undefined) return i; return -1; })();
  const hover = values.map((v, i) => (v === null || v === undefined ? "" : `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="5" class="hit"><title>${esc(fmtDateShort(dates[i]))}: ${(o.fmt || fmtTick)(v)}</title></circle>`)).join("");
  return `<svg viewBox="0 0 ${CW} ${CH}" class="chart" role="img">${ticks}
    <path d="${area}" fill="${color}" opacity="0.10"/><path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${lastIdx >= 0 ? `<circle cx="${x(lastIdx).toFixed(1)}" cy="${y(values[lastIdx]).toFixed(1)}" r="3" fill="${color}"/>` : ""}
    <text x="${CL}" y="${CH - 4}" class="ax">${esc(fmtDateShort(dates[0]))}</text><text x="${CW - R}" y="${CH - 4}" text-anchor="end" class="ax">${esc(fmtDateShort(dates[n - 1]))}</text>${hover}</svg>`;
}

function distSVG(dates, dist) {
  const L = CL, R = 6, pw = CW - L - R, ph = CH - CT - CB, n = dates.length;
  const maxTotal = Math.max(1, ...dist.map((c) => c.reduce((a, b) => a + b, 0)));
  const slot = pw / n, bw = Math.max(1.5, Math.min(14, slot * 0.72));
  let bars = "";
  dist.forEach((c, i) => {
    const cx = L + slot * i + slot / 2;
    let yTop = CT + ph;
    c.forEach((count, b) => {
      if (!count) return;
      const h = (count / maxTotal) * ph;
      yTop -= h;
      bars += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${yTop.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="${DIST_COLORS[b]}"><title>${esc(fmtDateShort(dates[i]))} · ${distLabel(b)}: ${count}</title></rect>`;
    });
  });
  return `<svg viewBox="0 0 ${CW} ${CH}" class="chart" role="img">${bars}<text x="${L}" y="${CH - 4}" class="ax">${esc(fmtDateShort(dates[0]))}</text><text x="${CW - R}" y="${CH - 4}" text-anchor="end" class="ax">${esc(fmtDateShort(dates[n - 1]))}</text></svg>`;
}

function renderSummaryCards(rows) {
  const wrap = document.getElementById("summaryGrid");
  const S = computeSeries(rows);
  if (!S.dates.length) { wrap.innerHTML = `<div class="card wide"><div class="label">${esc(t("noUsable"))}</div></div>`; return; }
  const n = S.dates.length, last = n - 1;
  const counts = S.dist[last], total = counts.reduce((a, b) => a + b, 0);
  const delta = (cur, prev, goodWhenUp, unit, dec = 0) => {
    if (n < 2 || prev === null || prev === undefined || cur === null || cur === undefined) return `<span class="delta flat">${esc(t("firstChecks"))}</span>`;
    const d = cur - prev;
    if (Math.abs(d) < 0.05) return `<span class="delta flat">${esc(t("noChange"))}</span>`;
    const good = goodWhenUp ? d > 0 : d < 0;
    return `<span class="delta ${good ? "good" : "bad"}"><i>${d > 0 ? "▲" : "▼"}</i> ${nf(Math.abs(d), dec)}${unit} ${esc(t("vsPrev"))}</span>`;
  };
  wrap.innerHTML = `
    <div class="card" title="${esc(t("visTitle"))}">
      <div class="label">${esc(t("visibility"))}</div>
      <div class="value">${pct(S.vis[last], 1)}</div>
      ${delta(S.vis[last], S.vis[last - 1], true, t("pts"), 1)}
      ${lineSVG(S.dates, S.vis, { min: 0, max: 100, fmt: (v) => Math.round(v) })}
    </div>
    <div class="card" title="${esc(t("avgTitle"))}">
      <div class="label">${esc(t("avgPos"))}</div>
      <div class="value">${S.avg[last] !== null ? nf(S.avg[last], 1) : "–"}</div>
      ${delta(S.avg[last], S.avg[last - 1], false, "", 1)}
      ${lineSVG(S.dates, S.avg, { reverse: true })}
    </div>
    <div class="card" title="${esc(t("top10Title"))}">
      <div class="label">${esc(t("top10Label"))}</div>
      <div class="value">${S.top10[last]} <span class="of">${esc(t("of"))} ${total}</span></div>
      ${delta(S.top10[last], S.top10[last - 1], true, "")}
      ${lineSVG(S.dates, S.top10, { min: 0, max: Math.max(2, Math.ceil(Math.max(...S.top10) / 2) * 2), fmt: (v) => Math.round(v) })}
    </div>
    <div class="card">
      <div class="label">${esc(t("distribution"))}</div>
      <div class="dist-wrap">
        <div class="dist-chart">${distSVG(S.dates, S.dist)}</div>
        <div class="dist-legend">${DIST_LABELS.map((_, i) => `<div><span class="dot" style="background:${DIST_COLORS[i]}"></span>${esc(distLabel(i))}<b>${counts[i]}</b></div>`).reverse().join("")}</div>
      </div>
    </div>`;
}

// ---------- Pop-up note on the "best position" table ----------
let POP = {};
function popHTML(p) {
  const basis = state.basis === "organic" ? t("organicPosition") : t("position");
  const more = p.tied.length ? `<div class="pop-more">${esc(t("tiedWith"))} ${esc(p.tied.join(", "))}</div>` : "";
  const others = p.others.length
    ? `<div class="pop-more">${esc(t("alsoRanking", { n: p.others.length }))}: ${p.others.slice(0, 4).map((o) => `${esc(o.who)} <i>#${o.rank}</i>`).join(", ")}${p.others.length > 4 ? ` ${esc(t("plusMore", { n: p.others.length - 4 }))}` : ""}</div>`
    : (p.tied.length ? "" : `<div class="pop-more">${esc(t("noOther"))}</div>`);
  const main = p.sku ? `<b class="pop-sku">${esc(p.sku)}</b> · <span class="pop-id">${esc(p.holder.split(" · ").slice(1).join(" · "))}</span>` : `<b class="pop-sku">${esc(p.holder)}</b>`;
  return `<div class="pop-head"><span class="pop-title">${esc(t("rankedFirst"))} · ${esc(fmtDateShort(p.date))}</span><button type="button" class="pop-x" data-close aria-label="${esc(t("close"))}">×</button></div>
    <div class="pop-main">${main}</div>
    <div class="pop-sub">${esc(t("posFor", { basis, rank: p.rank, kw: p.kw }))}</div>
    <div class="pop-actions">${p.sku ? `<button type="button" data-copy="sku">${esc(t("copySku"))}</button>` : ""}<button type="button" data-copy="id">${esc(t("copyId"))}</button><button type="button" data-copy="all">${esc(t("copyAll"))}</button></div>
    ${more}${others}<div class="pop-hint">${esc(t("pinned"))}</div>`;
}
function popCopyText(p, what) {
  if (what === "sku") return p.sku;
  if (what === "id") return p.id || p.holder;
  const lines = [t("copyRankedFirst", { kw: p.kw, date: fmtDateShort(p.date) }), `${p.holder} — ${state.basis === "organic" ? t("organicPosition") : t("position")} ${p.rank}`];
  p.tied.forEach((x) => lines.push(`${x} — ${t("tied")}`));
  if (p.others.length) { lines.push(t("alsoRankingColon")); p.others.forEach((o) => lines.push(`${o.who} — ${o.rank}`)); }
  return lines.join("\n");
}
async function copyText(text) {
  try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; } } catch (e) { /* fall through */ }
  const ta = document.createElement("textarea");
  ta.value = text; ta.style.cssText = "position:fixed;opacity:0;top:0;left:0"; document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
  ta.remove(); return ok;
}
(function initRankPop() {
  const el = document.createElement("div");
  el.id = "rankPop"; el.className = "rank-pop"; el.hidden = true; el.setAttribute("role", "dialog");
  document.body.appendChild(el);
  let current = null, pinned = false, timer = null;
  const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  const hide = () => { cancel(); el.hidden = true; el.classList.remove("pinned"); current = null; pinned = false; };
  const later = () => { cancel(); if (!pinned) timer = setTimeout(hide, 350); };   // a short grace period lets the mouse travel onto the pop-up
  const place = () => {
    if (!current) return;
    if (!current.isConnected) return hide();
    const r = current.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    el.style.left = Math.max(8, Math.min(r.left, vw - w - 8)) + "px";
    el.style.top = (r.bottom + h + 8 > vh && r.top - h - 4 > 0 ? r.top - h - 4 : r.bottom + 2) + "px";
  };
  const show = (td, pin) => {
    const p = POP[td.dataset.pop];
    if (!p) return hide();
    cancel(); current = td; pinned = !!pin; el.classList.toggle("pinned", pinned);
    el.setAttribute("aria-label", t("popLabel")); el.innerHTML = popHTML(p); el.hidden = false; place();
  };
  const cellOf = (e) => (e.target.closest ? e.target.closest("td[data-pop]") : null);
  const inPop = (e) => !!(e.target.closest && e.target.closest("#rankPop"));
  document.addEventListener("mouseover", (e) => {
    if (inPop(e)) return cancel();                       // on the pop-up: keep it
    const td = cellOf(e);
    if (pinned) return;                                  // a pinned pop-up stays until it is closed
    if (td) { if (td !== current) show(td, false); else cancel(); } else later();
  });
  document.addEventListener("focusin", (e) => {
    if (inPop(e)) return cancel();
    const td = cellOf(e);
    if (pinned) return;
    if (td) show(td, false); else hide();
  });
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest ? e.target.closest("#rankPop button") : null;
    if (btn) {
      if (btn.hasAttribute("data-close")) return hide();
      const what = btn.dataset.copy, p = current && POP[current.dataset.pop];
      if (what && p) {
        const ok = await copyText(popCopyText(p, what));
        const old = btn.dataset.label || btn.textContent; btn.dataset.label = old;
        btn.textContent = ok ? t("copied") : t("pressCopy"); btn.classList.toggle("done", ok);
        setTimeout(() => { btn.textContent = old; btn.classList.remove("done"); }, 1600);
      }
      return;
    }
    if (inPop(e)) return;
    const td = cellOf(e);
    if (td) show(td, true);                               // click or tap pins it so the text can be selected and copied
    else hide();
  });
  el.addEventListener("mouseenter", cancel);
  el.addEventListener("mouseleave", later);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
  window.addEventListener("scroll", () => { if (pinned) place(); else if (!el.hidden) hide(); }, true);   // a pinned pop-up follows its cell
  window.addEventListener("resize", () => { if (pinned) place(); else hide(); });
  document.addEventListener("rankpop-reset", hide);
})();

// ---------- Keyword pop-up: rank history chart + "Open on <marketplace>" ----------
const EBAY_SITES = { DE: "ebay.de", AT: "ebay.at", US: "ebay.com", GB: "ebay.co.uk", FR: "ebay.fr", IT: "ebay.it", ES: "ebay.es", NL: "ebay.nl", PL: "ebay.pl" };
const MODAL = { keyword: null, itemKey: null, days: 30, show: { organic: true, ads: true, overall: false }, opener: null };

// The page a shopper sees for this keyword: for eBay Germany the same address the tracker reads (same page size,
// delivery postcode and country), so the positions can be compared with what the chart says.
function marketplaceUrl(item, keyword) {
  const plus = encodeURIComponent(keyword).replace(/%20/g, "+");
  if (item.marketplace === "ebay") {
    const pc = CONFIG && CONFIG.ebay_postcode !== undefined ? CONFIG.ebay_postcode : "36179";
    return `https://www.${EBAY_SITES[item.country] || "ebay.de"}/sch/i.html?_nkw=${plus}&_sacat=0&_ipg=60&_pgn=1` + (item.country === "DE" && pc ? `&_stpos=${encodeURIComponent(pc)}&_fcid=77` : "");
  }
  if (item.marketplace === "otto") return `https://www.otto.de/suche/${encodeURIComponent(keyword)}/`;
  if (item.marketplace === "kaufland") return `https://www.kaufland.de/s/?search_value=${encodeURIComponent(keyword)}`;
  if (item.marketplace === "temu") return `https://www.temu.com/search_result.html?search_key=${encodeURIComponent(keyword)}`;
  return null;
}

// One entry per day for this keyword: overall position, organic position, ad position, and which connection produced it.
// For the "★ All <marketplace> products" entry each day takes the best value across that marketplace's products.
function keywordSeries(project, itemKey, keyword) {
  const item = project.items[itemKey];
  const real = item.synthetic ? Object.values(project.items).filter((i) => !i.synthetic && i.marketplace === item.marketplace) : [item];
  const nameOf = (it) => `${it.sku ? it.sku + " · " : ""}${it.product_id}`;
  const by = {};
  let hasOrganic = false;
  real.forEach((it) => it.rows.forEach((r) => {
    if (r.keyword !== keyword) return;
    if (r.organic_rank !== undefined) hasOrganic = true;
    const d = (by[r.date] = by[r.date] || { date: r.date, overall: null, organic: null, ad: null, found: false, blocked: true, scanned: r.results_scanned, holder: null, geo: r.page_geo, lang: r.page_lang, shipto: r.page_shipto });
    if (r.blocked) return;
    d.blocked = false;
    const overall = r.rank_all !== undefined ? r.rank_all : r.rank;
    if (overall !== null && overall !== undefined) { d.found = true; if (d.overall === null || overall < d.overall) d.overall = overall; }
    if (r.organic_rank !== null && r.organic_rank !== undefined && (d.organic === null || r.organic_rank < d.organic)) { d.organic = r.organic_rank; d.holder = nameOf(it); }
    if (r.promoted && r.ad_rank !== null && r.ad_rank !== undefined && (d.ad === null || r.ad_rank < d.ad)) d.ad = r.ad_rank;
  }));
  return { item, hasOrganic, dates: Object.keys(by).sort().map((k) => by[k]) };
}

const dayNo = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5;

function chartData(series) {
  let dates = series.dates;
  if (MODAL.days !== "all" && dates.length) {
    const start = shiftDate(dates[dates.length - 1].date, -(MODAL.days - 1));
    dates = dates.filter((d) => d.date >= start);
  }
  return dates;
}

function chartSVG(dates, show) {
  const W = 920, H = 330, L = 46, R = 18, T = 18, B = 40, pw = W - L - R, ph = H - T - B;
  if (!dates.length) return "";
  const t0 = dayNo(dates[0].date), t1 = dayNo(dates[dates.length - 1].date), span = Math.max(1, t1 - t0);
  const X = (iso) => (dates.length === 1 ? L + pw / 2 : L + ((dayNo(iso) - t0) / span) * pw);
  const vals = [];
  dates.forEach((d) => { ["organic", "ad", "overall"].forEach((k) => { if (show[k] && d[k] !== null) vals.push(d[k]); }); });
  const maxY = Math.max(10, Math.ceil((vals.length ? Math.max(...vals) : 10) * 1.1));
  const Y = (v) => T + ((v - 1) / (maxY - 1)) * ph;
  const rawStep = (maxY - 1) / 5, step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500].find((x) => x >= rawStep) || 500;
  const ticks = [1];
  for (let v = step; v < maxY; v += step) if (v > 1) ticks.push(v);
  let g = ticks.map((v) => `<line class="md-grid" x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text class="md-ylab" x="${L - 8}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${v}</text>`).join("");
  const n = Math.min(dates.length, 8);
  for (let k = 0; k < n; k++) {
    const iso = n === 1 ? dates[0].date : shiftDate(dates[0].date, Math.round((k * span) / (n - 1)));
    g += `<text class="md-xlab" x="${X(iso).toFixed(1)}" y="${H - 14}" text-anchor="middle">${esc(fmtDateShort(iso))}</text>`;
  }
  const series = [["organic", "md-organic"], ["ad", "md-ad"], ["overall", "md-overall"]];
  series.forEach(([key, cls]) => {
    if (!show[key]) return;
    let path = "", pts = "", prev = null;
    dates.forEach((d) => {
      if (d[key] === null) return;
      const x = X(d.date).toFixed(1), y = Y(d[key]).toFixed(1), tt = dayNo(d.date);
      path += `${prev !== null && tt - prev <= 2 ? " L" : " M"}${x} ${y}`; prev = tt;
      pts += `<circle class="${cls}-dot" cx="${x}" cy="${y}" r="3.4"/>`;
    });
    g += `<path class="md-line ${cls}" d="${path.trim()}"/>${pts}`;
  });
  dates.forEach((d) => {                      // checked, but your product was not in the results that were read
    if (!d.found && !d.blocked) g += `<circle class="md-nf" cx="${X(d.date).toFixed(1)}" cy="${Y(maxY).toFixed(1)}" r="3.6"><title>${esc(d.date)}: ${esc(t("notFound"))}${d.scanned ? " " + esc(t("inTheTop", { n: d.scanned })) : ""}</title></circle>`;
  });
  const hw = Math.max(10, pw / Math.max(1, dates.length));
  g += dates.map((d, i) => `<rect class="md-hit" data-i="${i}" x="${(X(d.date) - hw / 2).toFixed(1)}" y="${T}" width="${hw.toFixed(1)}" height="${ph}"/>`).join("");
  g += `<line class="md-guide" id="mdGuide" y1="${T}" y2="${T + ph}" x1="0" x2="0" hidden/>`;
  return `<svg viewBox="0 0 ${W} ${H}" class="md-svg" role="img" aria-label="${esc(t("rankHistory"))}">${g}</svg>`;
}

function tipHTML(d, hasOrganic) {
  const rows = [];
  if (hasOrganic) {
    rows.push(`<div><i class="sw md-organic-sw"></i>${esc(t("tipOrganic"))}: <b>${d.organic !== null ? d.organic : d.found ? esc(t("tipShownAsAd")) : esc(t("notFound"))}</b></div>`);
    if (d.ad !== null) rows.push(`<div><i class="sw md-ad-sw"></i>${esc(t("tipAdSlot"))}: <b>${d.ad}</b></div>`);
  }
  rows.push(`<div><i class="sw md-overall-sw"></i>${esc(t("tipOverall"))}: <b>${d.overall !== null ? d.overall : esc(t("notFound")) + (d.scanned ? " " + esc(t("inTheTop", { n: d.scanned })) : "")}</b></div>`);
  if (hasOrganic && d.organic !== null && d.overall !== null) rows.push(`<div class="md-tip-sub">${esc(t("tipAdsAbove", { n: d.overall - d.organic }))}</div>`);
  if (d.holder) rows.push(`<div class="md-tip-sub">${esc(t("tipBestProduct"))}: ${esc(d.holder)}</div>`);
  const bits = [];
  if (d.geo) bits.push(esc(d.geo === "DE" ? t("geoDE") : t("geoOther")));
  if (d.lang) bits.push(d.lang === "de" ? esc(t("langDE")) : esc(t("pageLang", { l: d.lang })));
  if (d.shipto) bits.push(esc(t("shipTo", { pc: d.shipto })));
  if (bits.length) rows.push(`<div class="md-tip-sub">${bits.join(" · ")}</div>`);
  return `<div class="md-tip-date">${esc(fmtDateShort(d.date))}, ${esc(d.date.slice(0, 4))}</div>${rows.join("")}`;
}

function renderKeywordModal() {
  const root = document.getElementById("kwModal");
  const project = currentProject();
  if (!root || !MODAL.keyword || !project || !project.items[MODAL.itemKey]) return;
  const series = keywordSeries(project, MODAL.itemKey, MODAL.keyword);
  const item = series.item;
  const show = series.hasOrganic ? MODAL.show : { organic: false, ad: false, overall: true };
  const showEff = { organic: show.organic, ad: show.ads !== undefined ? show.ads : show.ad, overall: show.overall };
  const dates = chartData(series);
  const last = dates[dates.length - 1];
  const now = last ? (last.organic !== null ? last.organic : last.overall) : null;
  const badge = now === 1 ? '<span class="kw-tag">#1</span>' : now !== null && now <= 3 ? '<span class="kw-tag">TOP 3</span>' : now !== null && now <= 10 ? '<span class="kw-tag">TOP 10</span>' : "";
  const linkItem = item.synthetic ? Object.values(project.items).find((i) => !i.synthetic && i.marketplace === item.marketplace) : item;
  const url = linkItem ? marketplaceUrl(linkItem, MODAL.keyword) : null;
  const mpName = MP_LABEL[item.marketplace] || item.marketplace;
  const items = sortedItems(project, item.marketplace);
  const multiCountry = new Set(items.filter((i) => !i.synthetic).map((i) => i.country)).size > 1;
  const options = items.map((i) => `<option value="${esc(i.item_key)}" ${i.item_key === MODAL.itemKey ? "selected" : ""}>${esc(itemText(i, multiCountry))}</option>`).join("");
  const found = dates.filter((d) => d.found).length, checked = dates.filter((d) => !d.blocked).length;
  const orgs = dates.filter((d) => d.organic !== null);
  const bestOrg = orgs.length ? orgs.reduce((a, b) => (b.organic <= a.organic ? b : a)) : null;
  const ranges = [[t("r7"), 7], [t("r30"), 30], [t("r90"), 90], [t("r365"), 365], [t("rAll"), "all"]];
  const chips = series.hasOrganic
    ? `<label class="md-chip md-organic-chip"><input type="checkbox" id="mdOrg" ${MODAL.show.organic ? "checked" : ""}> ${esc(t("organic"))}</label>
       <label class="md-chip md-ad-chip"><input type="checkbox" id="mdAd" ${MODAL.show.ads ? "checked" : ""}> ${esc(t("sponsored"))}</label>
       <label class="md-chip md-overall-chip"><input type="checkbox" id="mdAll" ${MODAL.show.overall ? "checked" : ""}> ${esc(t("overallChip"))}</label>`
    : `<span class="md-note">${esc(t("onePos"))}</span>`;
  const stat = (label, v) => `<div class="md-stat"><span>${label}</span><b>${v}</b></div>`;
  const pc = CONFIG && CONFIG.ebay_postcode !== undefined ? CONFIG.ebay_postcode : "36179";
  const hint = item.marketplace === "ebay"
    ? t("hintEbay", { mp: esc(mpName), de: item.country === "DE" || (linkItem && linkItem.country === "DE") ? t("hintDe", { pc: esc(pc) }) : "" })
    : t("hintOther", { mp: esc(mpName) });
  root.innerHTML = `
    <div class="kw-backdrop" data-close></div>
    <div class="kw-dialog" role="dialog" aria-modal="true" aria-labelledby="mdTitle">
      <div class="md-head">
        <div class="md-title"><h2 id="mdTitle">${esc(MODAL.keyword)}</h2>${badge}</div>
        <div class="md-actions">${url ? `<a class="btn" id="mdOpen" href="${esc(url)}" target="_blank" rel="noopener">${esc(t("openOn", { mp: mpName }))}</a>` : ""}<button type="button" class="md-x" id="mdClose" data-close aria-label="${esc(t("close"))}">×</button></div>
      </div>
      <div class="md-controls"><label class="md-label" for="mdProduct">${esc(t("product"))}</label><select id="mdProduct" class="md-select">${options}</select></div>
      <div class="md-toolbar"><div class="md-chips">${chips}</div>
        <div class="md-ranges">${ranges.map(([l, d]) => `<button type="button" class="md-range ${MODAL.days === d ? "active" : ""}" data-days="${d}">${l}</button>`).join("")}</div></div>
      ${dates.length ? `<div class="md-chart" id="mdChart">${chartSVG(dates, showEff)}<div class="md-tip" id="mdTip" hidden></div></div>
        <div class="md-stats">${stat(esc(series.hasOrganic ? t("latestOrganic") : t("latestPosition")), last ? (series.hasOrganic ? (last.organic !== null ? last.organic : last.found ? esc(t("adOnly")) : esc(t("notFound"))) : last.overall !== null ? last.overall : esc(t("notFound"))) : "–")}
          ${bestOrg ? stat(esc(t("bestOrganic")), `${bestOrg.organic} <small>${esc(fmtDateShort(bestOrg.date))}</small>`) : ""}${stat(esc(t("foundStat")), esc(t("xOfYDays", { found, checked })))}</div>`
        : `<div class="md-empty">${esc(t("noReadings"))}</div>`}
      <p class="md-hint">${hint}</p>
    </div>`;
  MODAL.dates = dates; MODAL.hasOrganic = series.hasOrganic;
  bindKeywordModal();
}

function bindKeywordModal() {
  const root = document.getElementById("kwModal");
  const redraw = () => { const focus = document.activeElement && document.activeElement.id; renderKeywordModal(); if (focus) { const el = document.getElementById(focus); if (el) el.focus(); } };
  root.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", closeKeywordModal));
  const sel = document.getElementById("mdProduct"); if (sel) sel.addEventListener("change", (e) => { MODAL.itemKey = e.target.value; redraw(); });
  [["mdOrg", "organic"], ["mdAd", "ads"], ["mdAll", "overall"]].forEach(([id, key]) => { const el = document.getElementById(id); if (el) el.addEventListener("change", (e) => { MODAL.show[key] = e.target.checked; redraw(); }); });
  root.querySelectorAll(".md-range").forEach((b) => b.addEventListener("click", () => { MODAL.days = b.dataset.days === "all" ? "all" : +b.dataset.days; redraw(); }));
  const tip = document.getElementById("mdTip"), guide = document.getElementById("mdGuide");
  root.querySelectorAll(".md-hit").forEach((r) => {
    r.addEventListener("mouseover", () => {
      const d = MODAL.dates[+r.dataset.i]; if (!d || !tip) return;
      tip.innerHTML = tipHTML(d, MODAL.hasOrganic); tip.hidden = false;
      const x = +r.getAttribute("x") + +r.getAttribute("width") / 2;
      if (guide) { guide.setAttribute("x1", x); guide.setAttribute("x2", x); guide.hidden = false; }
      tip.style.left = Math.min(Math.max((x / 920) * 100, 14), 78) + "%";
    });
    r.addEventListener("mouseleave", () => { if (tip) tip.hidden = true; if (guide) guide.hidden = true; });
  });
}

function openKeywordModal(keyword, opener) {
  MODAL.keyword = keyword; MODAL.itemKey = state.itemKey; MODAL.opener = opener || null;
  MODAL.days = 30; MODAL.show = { organic: true, ads: true, overall: false };
  renderKeywordModal();
  document.getElementById("kwModal").hidden = false;
  document.body.classList.add("modal-open");
  const x = document.getElementById("mdClose"); if (x) x.focus();
}

function closeKeywordModal() {
  const root = document.getElementById("kwModal"); if (!root || root.hidden) return;
  root.hidden = true; root.innerHTML = ""; document.body.classList.remove("modal-open");
  if (MODAL.opener && MODAL.opener.isConnected) MODAL.opener.focus();
  MODAL.keyword = null;
}

(function initKeywordModal() {
  const root = document.createElement("div");
  root.id = "kwModal"; root.className = "kw-modal"; root.hidden = true;
  document.body.appendChild(root);
  document.addEventListener("click", (e) => { const k = e.target.closest && e.target.closest(".kw-name[data-kw]"); if (k) openKeywordModal(k.dataset.kw, k); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !root.hidden) closeKeywordModal();
    else if ((e.key === "Enter" || e.key === " ") && e.target.classList && e.target.classList.contains("kw-name")) { e.preventDefault(); openKeywordModal(e.target.dataset.kw, e.target); }
  });
})();

// ---------- The rank tables ----------
function cellHTML(v, tip, scanned, pop) {
  if (v === undefined) return `<td class="nodata" title="${tip} — ${esc(t("notChecked"))}">·</td>`;
  if (v === "BLOCKED") return `<td class="rank-cell r-blocked" title="${tip} — ${esc(t("blockedTip"))}">?</td>`;
  if (v === null) return `<td class="rank-cell r-nf" title="${tip} — ${esc(t("notFoundTip"))}">${scanned ? `&gt;${scanned}` : "–"}</td>`;
  const h = heat(v);
  if (pop) return `<td class="rank-cell has-pop" style="background:${h.bg};color:${h.fg}" data-pop="${pop}" tabindex="0">${v}</td>`;
  return `<td class="rank-cell" style="background:${h.bg};color:${h.fg}" title="${tip}">${v}</td>`;
}
function dayHeaderHTML(label) {
  const m = /^(\d+)\.?\s+(.*)$/.exec(label) || /^(.*?)\s+(\d+)$/.exec(label);   // "23. Okt." (German) or "Oct 23" (English)
  return m ? `<div class="d">${esc(m[1].length <= 2 ? m[1] : m[2])}</div><div class="mon">${esc(m[1].length <= 2 ? m[2] : m[1])}</div>` : esc(label);
}

const SORT_DEFAULT_DIR = { name: 1, now: 1, best: 1, avg: 1, change: -1, found: -1 };

function renderTable() {
  document.dispatchEvent(new Event("rankpop-reset"));
  const bestView = !!currentItem().synthetic;      // "All <marketplace> products — best position" is selected
  const project = currentProject();
  const rows = VIEW.rows;
  const byKw = "keyword";
  const entityIds = uniq(rows.map((r) => r[byKw]));
  const rawDates = uniq(rows.map((r) => r.date)).sort();
  const firstDate = rawDates[0], latestDate = rawDates[rawDates.length - 1];

  const byEnt = {};
  rows.forEach((r) => { (byEnt[r[byKw]] = byEnt[r[byKw]] || {})[r.date] = r; });
  const hasCell = (id, d) => Object.prototype.hasOwnProperty.call(byEnt[id] || {}, d);
  const cell = (id, d) => byEnt[id][d];
  const labelText = (id) => id;
  const labelHTML = (id) => `<span class="kw-name" data-kw="${esc(id)}" tabindex="0" role="button" title="${esc(t("kwTitle"))}">${esc(id)}</span>`;

  const dayValue = (id, d) => { if (!hasCell(id, d)) return undefined; const r = cell(id, d); return r.blocked ? "BLOCKED" : r.rank; };
  const bucketValue = (id, dates) => {
    const present = dates.filter((d) => hasCell(id, d) && !cell(id, d).blocked);
    if (!present.length) return dates.some((d) => hasCell(id, d)) ? "BLOCKED" : undefined;
    const m = mean(present.map((d) => cell(id, d).rank));
    return m === null ? null : Math.round(m);
  };

  let columns, getValue;
  if (state.range === "daily") {
    // A continuous run of days ending at the latest check, newest first. Days not
    // tracked yet show "·", so the table already has its full shape on day one.
    let span = latestDate ? daysBetween(firstDate, latestDate) + 1 : 0;
    if (latestDate) span = Math.max(span, MIN_DAILY_COLUMNS);
    if (state.days !== "all") span = Math.min(span, state.days);
    columns = [];
    for (let i = 0; i < span; i++) { const d = shiftDate(latestDate, -i); columns.push({ key: d, label: fmtDateShort(d) }); }
    getValue = dayValue;
  } else {
    const buckets = {};
    const keyOf = state.range === "weekly" ? isoWeekStart : monthKey;
    rawDates.forEach((d) => { (buckets[keyOf(d)] = buckets[keyOf(d)] || []).push(d); });
    columns = Object.keys(buckets).sort().reverse().map((k) => ({ key: k, label: state.range === "weekly" ? t("weekPrefix") + " " + fmtDateShort(k) : monthLabel(k) }));
    getValue = (id, k) => bucketValue(id, buckets[k]);
  }

  // Per-row summary: latest usable check, best, average, share of checks found, and change.
  const stats = (id) => {
    const ds = rawDates.filter((d) => hasCell(id, d) && !cell(id, d).blocked);
    if (!ds.length) return { now: undefined, nowDate: null, bestDate: null, best: null, avg: null, found: null, prev: undefined, scanned: null, delta: null, kind: null };
    const ranks = ds.map((d) => cell(id, d).rank);
    const found = ranks.filter((r) => r !== null);
    const now = ranks[ranks.length - 1], prev = ranks.length > 1 ? ranks[ranks.length - 2] : undefined;
    const nowDate = ds[ds.length - 1];
    let bestDate = null;
    ds.forEach((d) => { const r = cell(id, d).rank; if (r !== null && (bestDate === null || r <= cell(id, bestDate).rank)) bestDate = d; });
    let delta = null, kind = null;
    if (prev !== undefined) {
      if (prev === null && now !== null) kind = "new";
      else if (prev !== null && now === null) kind = "lost";
      else if (prev !== null && now !== null) { delta = prev - now; kind = delta > 0 ? "improved" : delta < 0 ? "dropped" : "same"; }
    }
    return { now, nowDate, bestDate, best: found.length ? Math.min(...found) : null, avg: found.length ? mean(found) : null,
      found: (found.length / ranks.length) * 100, prev, scanned: cell(id, ds[ds.length - 1]).results_scanned, delta, kind };
  };
  const st = {};
  entityIds.forEach((id) => { st[id] = stats(id); });

  // Quick insight: what moved since the previous check
  const kinds = { improved: 0, dropped: 0, new: 0, lost: 0 };
  entityIds.forEach((id) => { if (st[id].kind in kinds) kinds[st[id].kind]++; });
  const anyPrev = entityIds.some((id) => st[id].prev !== undefined);

  const passes = (id) => {
    const s = st[id], f = state.filter;
    if (f === "top3") return s.now !== undefined && s.now !== null && s.now <= 3;
    if (f === "top10") return s.now !== undefined && s.now !== null && s.now <= 10;
    if (f === "top100") return s.now !== undefined && s.now !== null && s.now <= 100;
    if (f === "notfound") return s.now === null;
    if (["improved", "dropped", "new", "lost"].includes(f)) return s.kind === f;
    return true;
  };
  const q = state.q.trim().toLowerCase();
  const sortVal = (id) => {
    const s = st[id], k = state.sort.key;
    if (k === "name") return labelText(id).toLowerCase();
    if (k === "now") return s.now === undefined ? null : s.now;
    if (k === "best") return s.best; if (k === "avg") return s.avg; if (k === "found") return s.found;
    if (k === "change") return s.kind === "new" ? 9999 : s.kind === "lost" ? -9999 : s.delta;
    return null;
  };
  const ids = entityIds.filter((id) => passes(id) && (!q || labelText(id).toLowerCase().includes(q)))
    .sort((a, b) => {
      const va = sortVal(a), vb = sortVal(b);
      if (va === null && vb === null) return labelText(a).localeCompare(labelText(b));
      if (va === null) return 1; if (vb === null) return -1;
      const c = typeof va === "string" ? va.localeCompare(vb) : va - vb;
      return c * state.sort.dir || labelText(a).localeCompare(labelText(b));
    });

  LAST_GRID = { firstHeader: "Keyword", columns, entities: ids.map((id) => ({ id, label: labelText(id) })), getValue };

  // toolbar: filter + search on the left, movement chips in the middle, export on the right
  const chip = (f, text, n) => `<button class="mv ${state.filter === f ? "on" : ""}" data-f="${f}"${n ? "" : " disabled"}>${text} <b>${n}</b></button>`;
  const fopts = [["all", t("fAll")], ["top3", t("fTop3")], ["top10", t("fTop10")], ["top100", t("fTop100")], ["notfound", t("fNotFound")], ["improved", t("fImproved")], ["dropped", t("fDropped")], ["new", t("fNew")], ["lost", t("fLost")]]
    .map(([v, l]) => `<option value="${v}" ${state.filter === v ? "selected" : ""}>${esc(l)}</option>`).join("");
  document.getElementById("tableToolbar").innerHTML = `
    <div class="ctrl-group"><select id="filterSelect" title="${esc(t("filterTitle"))}">${fopts}</select>
      <input class="search-input" id="kwSearch" placeholder="${esc(t("filterPh"))}" value="${esc(state.q)}" /></div>
    <div class="movers">${anyPrev
      ? `<span class="mv-label">${esc(t("sincePrev"))}</span>${chip("improved", esc(t("mvUp")), kinds.improved)}${chip("dropped", esc(t("mvDown")), kinds.dropped)}${chip("new", esc(t("mvNew")), kinds.new)}${chip("lost", esc(t("mvLost")), kinds.lost)}`
      : `<span class="mv-label">${esc(t("movementAfter"))}</span>`}</div>
    <div class="ctrl-group"><button class="btn" id="exportBtn">${esc(t("exportCsv"))}</button></div>`;
  document.getElementById("filterSelect").addEventListener("change", (e) => { state.filter = e.target.value; renderTable(); });
  document.getElementById("kwSearch").addEventListener("input", (e) => { state.q = e.target.value; renderTable(); const s = document.getElementById("kwSearch"); s.focus(); s.setSelectionRange(s.value.length, s.value.length); });
  document.getElementById("exportBtn").addEventListener("click", exportCSV);
  document.querySelectorAll("#tableToolbar .mv").forEach((b) => b.addEventListener("click", () => { state.filter = state.filter === b.dataset.f ? "all" : b.dataset.f; renderTable(); }));

  document.getElementById("gridLegend").innerHTML = legendHTML() + (bestView ? ` <span class="legend-hint">· ${t("legendHint")}</span>` : "");

  const arrow = (k) => (state.sort.key === k ? (state.sort.dir === 1 ? " ▲" : " ▼") : "");
  const th = (k, text, tip, extra = "") => `<th class="metric sortable ${extra}" data-sort="${k}" title="${tip}">${text}${arrow(k)}</th>`;
  const head = `<thead><tr>
    <th class="kwcol sortable" data-sort="name">${esc(t("thKeyword", { n: ids.length }))}${arrow("name")}</th>
    ${th("now", esc(t("thNow")), esc(t("thNowTip")))}${th("best", esc(t("thBest")), esc(t("thBestTip")))}
    ${th("avg", esc(t("thAvg")), esc(t("thAvgTip")))}${th("found", esc(t("thFound")), esc(t("thFoundTip")))}
    ${th("change", esc(t("thChange")), esc(t("thChangeTip")), "metric-last")}
    ${columns.map((c) => `<th class="day">${state.range === "daily" ? dayHeaderHTML(c.label) : esc(c.label)}</th>`).join("")}</tr></thead>`;

  POP = {};
  const popFor = (id, date) => {                       // pop-up data for keyword `id` on `date`, or null
    if (!bestView || !date || !hasCell(id, date)) return null;
    const r = cell(id, date);
    if (!r.holder || r.rank === null || r.rank === undefined) return null;
    const key = "p" + Object.keys(POP).length;
    POP[key] = { kw: id, date, holder: r.holder, sku: r.holder_sku || "", id: r.holder_id || "", rank: r.rank, n: r.found_n, others: r.others || [], tied: r.tied || [] };
    return key;
  };
  const body = ids.map((id) => {
    const s = st[id];
    const nowN = s.now === undefined ? 9999 : s.now === null ? 9999 : s.now;
    const tag = nowN === 1 ? '<span class="kw-tag">#1</span>' : nowN <= 3 ? '<span class="kw-tag">TOP 3</span>' : "";
    const nowCell = s.now === undefined ? `<td class="metric nodata">·</td>` : cellHTML(s.now, `${esc(labelText(id))} · ${esc(t("posAtLatest"))}`, s.scanned, s.now === null ? null : popFor(id, s.nowDate)).replace("<td ", '<td data-m="now" ').replace('class="rank-cell', 'class="metric rank-cell');
    const change = s.kind === "new" ? `<span class="trend-down"><i>●</i> ${esc(t("newT"))}</span>` : s.kind === "lost" ? `<span class="trend-up"><i>✕</i> ${esc(t("lostT"))}</span>`
      : s.kind === "improved" ? `<span class="trend-down"><i>▲</i> ${s.delta}</span>` : s.kind === "dropped" ? `<span class="trend-up"><i>▼</i> ${-s.delta}</span>`
      : s.kind === "same" ? `<span class="trend-flat">=</span>` : `<span class="trend-flat">–</span>`;
    const cells = columns.map((c) => {
      const v = getValue(id, c.key);
      const r0 = state.range === "daily" && hasCell(id, c.key) ? cell(id, c.key) : null;
      const carried = state.range === "daily" && hasCell(id, c.key) && cell(id, c.key).carried;
      const tip = esc(labelText(id) + " · " + c.key + (r0 && r0.holder ? " · " + t("bestColon") + ": " + r0.holder : "") + (carried ? " · " + t("carriedTip") : ""));
      return cellHTML(v, tip, state.range === "daily" && v === null ? cell(id, c.key).results_scanned : null, state.range === "daily" && typeof v === "number" ? popFor(id, c.key) : null);
    }).join("");
    return `<tr><td class="kwcol">${labelHTML(id)}${tag}</td>${nowCell}
      ${(() => { const pk = s.best === null ? null : popFor(id, s.bestDate); return `<td class="metric${pk ? " has-pop" : ""}"${pk ? ` data-pop="${pk}" tabindex="0"` : ""}>${s.best === null ? "–" : s.best}</td>`; })()}<td class="metric">${s.avg === null ? "–" : nf(s.avg, 1)}</td>
      <td class="metric">${s.found === null ? "–" : pct(Math.round(s.found))}</td><td class="metric metric-last">${change}</td>${cells}</tr>`;
  }).join("");

  document.getElementById("rankGrid").innerHTML = head + `<tbody>${body || `<tr><td class="kwcol" colspan="${columns.length + 6}">${esc(t("noMatch"))}</td></tr>`}</tbody>`;
  document.querySelectorAll("#rankGrid th.sortable").forEach((h) => h.addEventListener("click", () => {
    const k = h.dataset.sort;
    state.sort = state.sort.key === k ? { key: k, dir: -state.sort.dir } : { key: k, dir: SORT_DEFAULT_DIR[k] };
    renderTable();
  }));
}

function legendHTML() {
  const chips = [2, 7, 25, 70, 200].map((r, i) => { const h = heat(r); return `<span class="chip" style="background:${h.bg};color:${h.fg}">${["1–3", "4–10", "11–50", "51–100", ">100"][i]}</span>`; }).join("");
  return `${esc(t("legendMain"))} ${chips}
    <span class="chip r-nf">${t("legendNf")}</span><span class="chip r-blocked">?</span> ${esc(t("legendBlocked"))} &nbsp;·&nbsp; <b>·</b> ${esc(t("legendNotChecked"))}`;
}

// ---------- CSV export ----------
function buildCsv() {
  const { firstHeader, columns, entities, getValue } = LAST_GRID;
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [[firstHeader, ...columns.map((c) => c.key)].map(q).join(",")];
  entities.forEach((e) => {
    const vals = columns.map((c) => {
      const v = getValue(e.id, c.key);
      return v === undefined || v === null ? "" : v === "BLOCKED" ? t("csvBlocked") : v;
    });
    lines.push([q(e.label), ...vals].join(","));
  });
  return lines.join("\n");
}

function exportCSV() {
  if (!LAST_GRID) return;
  const blob = new Blob(["\ufeff" + buildCsv()], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ranks-${state.range}.csv`.replace(/[^\w.-]+/g, "_");
  document.body.appendChild(a);
  a.click();
  a.remove();
}

boot();
