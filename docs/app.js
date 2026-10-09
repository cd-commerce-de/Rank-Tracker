// ---------- Config ----------
const FLAGS = { DE: "🇩🇪", US: "🇺🇸", GB: "🇬🇧", FR: "🇫🇷", IT: "🇮🇹", ES: "🇪🇸", AT: "🇦🇹", NL: "🇳🇱", PL: "🇵🇱" };
const MP_LABEL = { ebay: "eBay", otto: "Otto", kaufland: "Kaufland", temu: "Temu" };
const MP_ORDER = ["ebay", "otto", "kaufland", "temu"];

let ALL_ROWS = [];
let IS_DEMO = false;
let PROJECTS = {};   // project_id -> { project_id, project_name, items: { item_key: {...} }, rows: [] }
let SETTINGS = {};   // docs/settings.json
let state = { projectId: null, itemKey: null, range: "daily", days: 30, q: "", helpOpen: false };
let sparkCharts = {};
let LAST_GRID = null; // what the grid currently shows, used by CSV export

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
  return utcDate(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", timeZone: "UTC" });
}
function isoWeekStart(iso) {
  const d = utcDate(iso);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}
function monthKey(iso) { return iso.slice(0, 7); }
function monthLabel(key) {
  return utcDate(key + "-01").toLocaleDateString(undefined, { month: "short", year: "numeric", timeZone: "UTC" });
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
  PROJECTS = buildProjects(ALL_ROWS);
}

function buildProjects(rows) {
  const map = {};
  rows.forEach((r) => {
    const p = (map[r.project_id] = map[r.project_id] || {
      project_id: r.project_id, project_name: r.project_name, items: {}, rows: [],
    });
    p.rows.push(r);
    const it = (p.items[r.item_key] = p.items[r.item_key] || {
      item_key: r.item_key, marketplace: r.marketplace, country: r.country, product_id: r.item_id || r.item_key, rows: [],
    });
    it.rows.push(r);
  });
  return map;
}

function sortedItems(project) {
  return Object.values(project.items).sort(
    (a, b) =>
      MP_ORDER.indexOf(a.marketplace) - MP_ORDER.indexOf(b.marketplace) ||
      a.country.localeCompare(b.country) ||
      String(a.product_id).localeCompare(String(b.product_id))
  );
}

// ---------- Current selection ----------
function currentProject() { return PROJECTS[state.projectId]; }
function currentItem() { return currentProject().items[state.itemKey]; }

// Rows of the selected product, limited to the selected period (counted back
// from the most recent day we have data for).
function periodRows(item) {
  if (state.days === "all") return item.rows;
  const latest = item.rows.map((r) => r.date).sort().pop();
  const cutoff = shiftDate(latest, -(state.days - 1));
  return item.rows.filter((r) => r.date >= cutoff);
}

// ---------- Page ----------
async function boot() {
  await loadData();
  const first = Object.keys(PROJECTS)[0];
  state.projectId = first || null;
  state.helpOpen = !first; // nothing tracked yet -> show how to add products straight away
  renderPage();
}

function helpPanelHTML() {
  const link = SETTINGS.sheet_url
    ? `<p><a href="${esc(SETTINGS.sheet_url)}" target="_blank" rel="noopener"><b>Open the tracking sheet</b></a> and add one row per product + keyword. They're picked up on the next daily run.</p>`
    : `<p>No Google Sheet is linked yet. Until you link one, add rows to <code>config/tracked.csv</code> in your GitHub repo (see the README for linking a Google Sheet, which is easier to edit).</p>`;
  return `
    <div class="help-panel">
      <b>Add or change what's tracked</b>
      <p>Products and keywords live in one table with five columns: <code>project</code>, <code>marketplace</code> (ebay / otto / kaufland / temu), <code>country</code>, <code>product_id</code> (the ID from your own listing's URL) and <code>keyword</code>. One row per keyword.</p>
      ${link}
      <p>A new keyword's history starts the first day it's checked. To check it right away, run the workflow from your repo's <b>Actions</b> tab instead of waiting for the next scheduled run.</p>
    </div>`;
}

function renderPage() {
  const app = document.getElementById("app");
  const projects = Object.values(PROJECTS);

  const demoBanner = IS_DEMO
    ? `<div class="demo-banner">Showing demo data — no real tracker data yet. Once the daily workflow has run, your real ranks replace this automatically.</div>`
    : "";

  if (!projects.length) {
    app.innerHTML = `
      ${demoBanner}
      <div class="topbar"><h1>Rank Tracker</h1><div class="spacer"></div>${syncControlsHTML()}</div>
      ${syncPanelHTML()}
      ${helpPanelHTML()}
      <div class="content"><div class="empty-state">Nothing is being tracked yet.</div></div>`;
    bindSyncControls();
    return;
  }

  if (!PROJECTS[state.projectId]) state.projectId = projects[0].project_id;
  const project = currentProject();
  const items = sortedItems(project);
  if (!state.itemKey || !project.items[state.itemKey]) state.itemKey = items[0].item_key;
  const item = currentItem();

  const lastChecked = project.rows.map((r) => r.checked_at || r.date).sort().pop();
  const projectOptions = projects
    .map((p) => `<option value="${esc(p.project_id)}" ${p.project_id === state.projectId ? "selected" : ""}>${esc(p.project_name)}</option>`)
    .join("");
  const itemOptions = items
    .map((i) => `<option value="${esc(i.item_key)}" ${i.item_key === state.itemKey ? "selected" : ""}>${FLAGS[i.country] || ""} ${esc(MP_LABEL[i.marketplace] || i.marketplace)} · ${esc(i.country)} · ${esc(i.product_id)}</option>`)
    .join("");
  const periods = [[14, "Last 14 days"], [30, "Last 30 days"], [60, "Last 60 days"], [90, "Last 90 days"], ["all", "All time"]]
    .map(([v, label]) => `<option value="${v}" ${String(v) === String(state.days) ? "selected" : ""}>${label}</option>`)
    .join("");

  app.innerHTML = `
    ${demoBanner}
    <div class="topbar">
      <h1>Rank Tracker</h1>
      <select class="project-select" id="projectSelect">${projectOptions}</select>
      <div class="spacer"></div>
      <span class="updated">Last checked: ${esc(new Date(lastChecked).toLocaleString())}</span>
      ${syncControlsHTML()}
      <button class="btn primary" id="helpBtn">+ Add products &amp; keywords</button>
    </div>
    ${syncPanelHTML()}
    ${state.helpOpen ? helpPanelHTML() : ""}
    <div class="content">
      <div class="controls-row">
        <div class="ctrl-group">
          <select class="item-select" id="itemSelect">${itemOptions}</select>
          <input class="search-input" id="kwSearch" placeholder="Filter keywords…" value="${esc(state.q)}" />
        </div>
        <div class="ctrl-group">
          <div class="range-group">
            ${["daily", "weekly", "monthly"].map((r) => `<div class="range-btn ${state.range === r ? "active" : ""}" data-range="${r}">${r[0].toUpperCase() + r.slice(1)}</div>`).join("")}
          </div>
          <select id="periodSelect">${periods}</select>
          <button class="btn" id="exportBtn">Export CSV</button>
        </div>
      </div>
      <div class="summary-grid" id="summaryGrid"></div>
      <div class="grid-legend">
        Each column is a day; the number is where your product appears in that marketplace's search results for the keyword (1 = first).
        <span class="chip r-1">1–3</span><span class="chip r-2">4–10</span><span class="chip r-3">11–50</span><span class="chip r-4">51–100</span><span class="chip r-5">&gt;100 / not found</span>
        <span class="chip r-blocked">?</span> blocked by the marketplace &nbsp;·&nbsp; <b>·</b> not checked that day
      </div>
      <div class="grid-wrap"><table class="rankgrid" id="rankGrid"></table></div>
    </div>`;

  bindSyncControls();
  document.getElementById("projectSelect").addEventListener("change", (e) => {
    state.projectId = e.target.value; state.itemKey = null; renderPage();
  });
  document.getElementById("itemSelect").addEventListener("change", (e) => { state.itemKey = e.target.value; renderPage(); });
  document.getElementById("periodSelect").addEventListener("change", (e) => {
    state.days = e.target.value === "all" ? "all" : Number(e.target.value); renderPage();
  });
  document.querySelectorAll(".range-btn").forEach((b) => b.addEventListener("click", () => { state.range = b.dataset.range; renderPage(); }));
  document.getElementById("helpBtn").addEventListener("click", () => { state.helpOpen = !state.helpOpen; renderPage(); });
  document.getElementById("exportBtn").addEventListener("click", exportCSV);
  document.getElementById("kwSearch").addEventListener("input", (e) => {
    state.q = e.target.value;
    renderGrid(periodRows(item)); // only the grid, so the search box keeps focus
  });

  const rows = periodRows(item);
  renderSummaryCards(rows);
  renderGrid(rows);
}

// ---------- Summary cards ----------
function renderSummaryCards(rows) {
  // A blocked check means "we couldn't look", not "you weren't found", so it
  // stays out of the headline numbers entirely.
  const valid = rows.filter((r) => !r.blocked);
  const dates = uniq(valid.map((r) => r.date)).sort();
  const wrap = document.getElementById("summaryGrid");

  if (!dates.length) {
    wrap.innerHTML = `<div class="card" style="grid-column:1/-1"><div class="label">No usable checks in this period yet.</div></div>`;
    return;
  }

  const byDate = (d) => valid.filter((r) => r.date === d);
  const dailyVisibility = dates.map((d) => {
    const r = byDate(d);
    return (r.filter((x) => x.rank !== null).length / r.length) * 100;
  });
  const dailyAvgPos = dates.map((d) => mean(byDate(d).map((r) => r.rank)));
  const dailyTop3 = dates.map((d) => byDate(d).filter((r) => r.rank !== null && r.rank <= 3).length);

  const latestVis = dailyVisibility[dailyVisibility.length - 1];
  const latestAvg = dailyAvgPos[dailyAvgPos.length - 1];
  const latestTop3 = dailyTop3[dailyTop3.length - 1];
  const totalKw = byDate(dates[dates.length - 1]).length;

  const latestRanks = byDate(dates[dates.length - 1]).map((r) => r.rank);
  const buckets = [
    { label: "1-3", test: (r) => r !== null && r <= 3, color: "#1f9d55" },
    { label: "4-10", test: (r) => r !== null && r > 3 && r <= 10, color: "#7cc576" },
    { label: "11-50", test: (r) => r !== null && r > 10 && r <= 50, color: "#f2c94c" },
    { label: "51-100", test: (r) => r !== null && r > 50 && r <= 100, color: "#f2994a" },
    { label: "100+ / not found", test: (r) => r === null || r > 100, color: "#d9dbe0" },
  ];
  const counts = buckets.map((b) => latestRanks.filter(b.test).length);
  const maxCount = Math.max(1, ...counts);

  wrap.innerHTML = `
    <div class="card" title="Share of tracked keywords where your product was found, on the latest day">
      <div class="label">Visibility</div>
      <div class="value">${latestVis.toFixed(1)}%</div>
      <canvas id="sparkVis" height="50"></canvas>
    </div>
    <div class="card" title="Average position across the keywords where your product was found">
      <div class="label">Average Position</div>
      <div class="value">${latestAvg !== null ? latestAvg.toFixed(1) : "–"}</div>
      <canvas id="sparkAvg" height="50"></canvas>
    </div>
    <div class="card">
      <div class="label">Top 3 Rankings</div>
      <div class="value">${latestTop3} <span class="of">of ${totalKw}</span></div>
      <canvas id="sparkTop3" height="50"></canvas>
    </div>
    <div class="card">
      <div class="label">Distribution (latest day)</div>
      <div class="dist-row">
        ${counts.map((c, i) => `<div class="dist-bar" style="height:${(c / maxCount) * 100}%;background:${buckets[i].color};" title="${buckets[i].label}: ${c}"></div>`).join("")}
      </div>
      <div class="dist-legend">
        ${buckets.map((b, i) => `<div><span class="dot" style="background:${b.color};"></span>${b.label}: ${counts[i]}</div>`).join("")}
      </div>
    </div>`;

  makeSparkline("sparkVis", dates, dailyVisibility, false);
  makeSparkline("sparkAvg", dates, dailyAvgPos, true);
  makeSparkline("sparkTop3", dates, dailyTop3, false);
}

function makeSparkline(canvasId, labels, data, reverseY) {
  if (sparkCharts[canvasId]) sparkCharts[canvasId].destroy();
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  sparkCharts[canvasId] = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [{ data, borderColor: "#5b5ff0", backgroundColor: "#5b5ff022", fill: true, tension: 0.3, pointRadius: 0, spanGaps: true }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { x: { display: false }, y: { display: false, reverse: !!reverseY } },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      elements: { line: { borderWidth: 2 } },
    },
  });
}

// ---------- The rank grid ----------
function daysBetween(a, b) { return Math.round((utcDate(b) - utcDate(a)) / 86400000); }
const MIN_DAILY_COLUMNS = 14; // keep the table's full shape even in the first days of tracking

function renderGrid(rows) {
  const allKeywords = uniq(rows.map((r) => r.keyword));
  const rawDates = uniq(rows.map((r) => r.date)).sort(); // ascending
  const firstDate = rawDates[0];
  const latestDate = rawDates[rawDates.length - 1];

  // keyword -> date -> row, so lookups below are instant
  const byKwDate = {};
  rows.forEach((r) => {
    (byKwDate[r.keyword] = byKwDate[r.keyword] || {})[r.date] = r;
  });
  const hasCell = (kw, d) => Object.prototype.hasOwnProperty.call(byKwDate[kw] || {}, d);
  const cell = (kw, d) => byKwDate[kw][d];

  // value for a keyword on a date: a rank, null (checked, not found),
  // "BLOCKED" (marketplace refused the check) or undefined (no check that day)
  const dayValue = (kw, d) => {
    if (!hasCell(kw, d)) return undefined;
    const r = cell(kw, d);
    return r.blocked ? "BLOCKED" : r.rank;
  };
  const bucketValue = (kw, dates) => {
    const present = dates.filter((d) => hasCell(kw, d) && !cell(kw, d).blocked);
    if (!present.length) {
      return dates.some((d) => hasCell(kw, d)) ? "BLOCKED" : undefined;
    }
    const m = mean(present.map((d) => cell(kw, d).rank));
    return m === null ? null : Math.round(m);
  };

  let columns; // [{ key, label }]
  let getValue;
  if (state.range === "daily") {
    // A continuous run of days ending at the latest check, newest first. Days
    // that haven't been tracked yet show "·", so the table already looks like
    // its finished self on day one and simply fills in as days go by.
    let span = latestDate ? daysBetween(firstDate, latestDate) + 1 : 0;
    if (latestDate) span = Math.max(span, MIN_DAILY_COLUMNS);
    if (state.days !== "all") span = Math.min(span, state.days);
    columns = [];
    for (let i = 0; i < span; i++) {
      const d = shiftDate(latestDate, -i);
      columns.push({ key: d, label: fmtDateShort(d) });
    }
    getValue = dayValue;
  } else {
    const buckets = {};
    const keyOf = state.range === "weekly" ? isoWeekStart : monthKey;
    rawDates.forEach((d) => { (buckets[keyOf(d)] = buckets[keyOf(d)] || []).push(d); });
    columns = Object.keys(buckets).sort().reverse().map((k) => ({
      key: k,
      label: state.range === "weekly" ? "wk " + fmtDateShort(k) : monthLabel(k),
    }));
    getValue = (kw, k) => bucketValue(kw, buckets[k]);
  }

  // Per-keyword summary: latest usable check, best rank in the period, and the
  // change since the check before that. (A blocked check isn't a usable check.)
  const stats = (kw) => {
    const ds = rawDates.filter((d) => hasCell(kw, d) && !cell(kw, d).blocked);
    if (!ds.length) return { now: undefined, best: null, prev: undefined, scanned: null };
    const ranks = ds.map((d) => cell(kw, d).rank);
    const found = ranks.filter((r) => r !== null);
    return {
      now: ranks[ranks.length - 1],
      best: found.length ? Math.min(...found) : null,
      prev: ranks.length > 1 ? ranks[ranks.length - 2] : undefined,
      scanned: cell(kw, ds[ds.length - 1]).results_scanned,
    };
  };
  const notFound = (scanned) => (scanned ? `&gt;${scanned}` : "–");
  const changeHTML = (st) => {
    if (st.prev === undefined || st.now === undefined) return `<span class="trend-flat">–</span>`;
    if (st.prev === null && st.now !== null) return `<span class="trend-down">new</span>`;       // found again / first time
    if (st.prev !== null && st.now === null) return `<span class="trend-up">lost</span>`;
    if (st.now === null) return `<span class="trend-flat">–</span>`;
    const d = st.prev - st.now; // positive = moved up the results
    return d > 0 ? `<span class="trend-down">▲ ${d}</span>` : d < 0 ? `<span class="trend-up">▼ ${-d}</span>` : `<span class="trend-flat">=</span>`;
  };

  const q = state.q.trim().toLowerCase();
  const statsByKw = {};
  allKeywords.forEach((k) => { statsByKw[k] = stats(k); });
  const sortKey = (kw) => { const n = statsByKw[kw].now; return n === null || n === undefined ? Infinity : n; };
  const keywords = allKeywords
    .filter((k) => !q || k.toLowerCase().includes(q))
    .sort((a, b) => sortKey(a) - sortKey(b) || a.localeCompare(b));

  LAST_GRID = { columns, keywords, getValue };

  const head = `<thead><tr>
    <th class="kwcol">Keyword (${keywords.length})</th>
    <th class="metric" title="Position at the most recent check">Now</th>
    <th class="metric" title="Best position in the selected period">Best</th>
    <th class="metric metric-last" title="Change since the check before the latest one">Change</th>
    ${columns.map((c) => `<th>${esc(c.label)}</th>`).join("")}</tr></thead>`;

  const body = keywords.map((kw) => {
    const st = statsByKw[kw];
    const lr = sortKey(kw);
    const tag = lr === 1 ? '<span class="kw-tag">#1</span>' : lr <= 3 ? '<span class="kw-tag">TOP 3</span>' : "";
    const nowCell = st.now === undefined
      ? `<td class="metric nodata">·</td>`
      : `<td class="metric rank-cell ${tierClass(st.now)}" title="${esc(kw)} · position at the most recent check">${st.now === null ? notFound(st.scanned) : st.now}</td>`;
    const cells = columns.map((c) => {
      const v = getValue(kw, c.key);
      const tip = esc(kw + " · " + c.key);
      if (v === undefined) return `<td class="nodata" title="${tip} — not checked">·</td>`;
      if (v === "BLOCKED") return `<td class="rank-cell r-blocked" title="${tip} — the marketplace blocked this check, which is not the same as falling out of the rankings">?</td>`;
      let label = v;
      if (v === null) label = state.range === "daily" ? notFound(cell(kw, c.key).results_scanned) : "–";
      return `<td class="rank-cell ${tierClass(v)}" title="${tip}">${label}</td>`;
    }).join("");
    return `<tr>
      <td class="kwcol"><span class="kw-name">${esc(kw)}</span>${tag}</td>
      ${nowCell}
      <td class="metric">${st.best === null ? "–" : st.best}</td>
      <td class="metric metric-last">${changeHTML(st)}</td>
      ${cells}</tr>`;
  }).join("");

  document.getElementById("rankGrid").innerHTML =
    head + `<tbody>${body || `<tr><td class="kwcol" colspan="${columns.length + 4}">No keywords match.</td></tr>`}</tbody>`;
}

// ---------- Sync ----------
// Two things keep the data fresh, and neither asks anyone for a token:
//  1. AUTOMATIC: every hour GitHub checks the sheet and starts tracking any
//     product/keyword that was added (see .github/workflows/track-ranks.yml).
//  2. INSTANT: the "Sync now" button asks the shared sync service
//     (sync-worker/, set up once by an admin; its address is "sync_url" in
//     docs/settings.json) to run the check right now, for anyone.
const PASSCODE_KEY = "rank_tracker_sync_passcode";
let SYNC_TIMING = { runPollMs: 8000, runMaxMs: 20 * 60000, dataPollMs: 15000, dataMaxMs: 4 * 60000 };
let syncState = { busy: false, msg: "", kind: "", runUrl: "", panelOpen: false };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function stored(key) { try { return localStorage.getItem(key) || ""; } catch (e) { return ""; } }
function store(key, val) { try { val ? localStorage.setItem(key, val) : localStorage.removeItem(key); } catch (e) {} }
const getPasscode = () => stored(PASSCODE_KEY);
const setPasscode = (p) => store(PASSCODE_KEY, p || "");

// Only used to build the "open on GitHub" link in the sync panel.
function repoInfo() {
  let repo = SETTINGS.repo;
  if (!repo && location.hostname.endsWith(".github.io")) {
    const owner = location.hostname.split(".")[0];
    const name = location.pathname.split("/").filter(Boolean)[0];
    if (owner && name) repo = owner + "/" + name;
  }
  if (!repo) return null;
  return { repo, workflow: SETTINGS.workflow_file || "track-ranks.yml" };
}

function dataStamp(rows) {
  const latest = (rows || []).map((r) => r.checked_at || r.date).sort().pop();
  return latest || "none";
}

// --- backend 1: the shared relay service (no per-person setup) ---
function proxyBackend(url) {
  const call = async (method, query = "", canPrompt = true) => {
    const headers = { "Content-Type": "application/json" };
    if (getPasscode()) headers["X-Sync-Passcode"] = getPasscode();
    let res;
    try {
      res = await fetch(url + query, { method, headers, body: method === "POST" ? "{}" : undefined });
    } catch (e) {
      throw new Error("Couldn't reach the sync service. Check your connection, or the sync_url in docs/settings.json.");
    }
    let body = {};
    try { body = await res.json(); } catch (e) {}
    if (res.status === 401) {
      if (canPrompt) {
        const code = window.prompt("Enter your team's sync passcode (you only need to do this once on this computer):");
        if (code && code.trim()) { setPasscode(code.trim()); return call(method, query, false); }
        throw new Error("Sync needs the team passcode.");
      }
      setPasscode("");
      throw new Error("That passcode wasn't accepted.");
    }
    if (res.status === 403) throw new Error("The sync service doesn't accept requests from this website (ALLOWED_ORIGIN in the Cloudflare worker must match the dashboard's address exactly).");
    if (!res.ok) throw new Error(body.message || `The sync service returned an error (${res.status}).`);
    return body;
  };
  return {
    start: async () => { const b = await call("POST"); return { state: b.state, run: b.run || null }; },
    status: async (run) => call("GET", "?run=" + encodeURIComponent(run.id)),
  };
}

function getBackend() {
  return SETTINGS.sync_url ? proxyBackend(SETTINGS.sync_url) : null; // null -> explain the automatic pick-up
}

// --- status line, buttons, panel ---
function syncStatusHTML() {
  if (!syncState.msg) return "";
  const link = syncState.runUrl ? ` <a href="${esc(syncState.runUrl)}" target="_blank" rel="noopener">View run</a>` : "";
  return `<span class="sync-msg ${esc(syncState.kind)}">${esc(syncState.msg)}</span>${link}`;
}
function setSync(msg, kind, runUrl) {
  syncState.msg = msg;
  syncState.kind = kind || "";
  syncState.runUrl = runUrl || "";
  const el = document.getElementById("syncStatus");
  if (el) el.innerHTML = syncStatusHTML();
}

function syncControlsHTML() {
  return `<span id="syncStatus">${syncStatusHTML()}</span>
    <button class="btn" id="syncBtn" ${syncState.busy ? "disabled" : ""}>↻ Sync now</button>
    <button class="btn" id="syncCfgBtn" title="Sync settings">⚙</button>`;
}

function syncPanelHTML() {
  if (!syncState.panelOpen) return "";
  const info = repoInfo();
  const ghLink = info
    ? `<a href="https://github.com/${esc(info.repo)}/actions/workflows/${esc(info.workflow)}" target="_blank" rel="noopener">open the workflow on GitHub</a> and click <b>Run workflow</b>`
    : "open the workflow on GitHub and click <b>Run workflow</b>";
  const auto = `<p><b>New products and keywords you add to the sheet are picked up automatically</b>, about once an hour — nobody has to press anything or enter a token. Every product is then re-checked once a day (06:00 UTC).</p>`;
  if (SETTINGS.sync_url) {
    return `<div class="help-panel"><b>Sync</b>${auto}
      <p><b>↻ Sync now</b> runs the check immediately, for anyone, with no token or GitHub login. It takes a few minutes.</p>
      ${getPasscode() ? `<p>A team passcode is saved on this computer. <button class="linkbtn" id="syncForgetPass">Forget it</button></p>` : ""}
      <p>You can also ${ghLink}.</p></div>`;
  }
  return `<div class="help-panel"><b>Sync</b>${auto}
    <p>Want an instant check as well? Your admin can switch on the shared sync service once (about 10 minutes, free — see <code>sync-worker/README.md</code>); after that <b>↻ Sync now</b> works for everyone. Until then you can ${ghLink}.</p></div>`;
}

function bindSyncControls() {
  const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };
  on("syncBtn", "click", startSync);
  on("syncCfgBtn", "click", () => { syncState.panelOpen = !syncState.panelOpen; renderPage(); });
  on("syncForgetPass", "click", () => { setPasscode(""); setSync("Saved passcode removed.", ""); renderPage(); });
}

// --- the sync itself ---
async function startSync() {
  if (syncState.busy) return;
  const backend = getBackend();
  if (!backend) { syncState.panelOpen = true; renderPage(); return; }

  syncState.busy = true;
  const btn = document.getElementById("syncBtn");
  if (btn) btn.disabled = true;
  setSync("Starting sync…", "busy");
  const before = IS_DEMO ? "none" : dataStamp(ALL_ROWS);

  try {
    const started = await backend.start();
    const run = started.run;
    if (!run) { setSync("Sync was requested, but I couldn't see the run start. Check the Actions tab on GitHub.", "warn"); return; }
    const quick = started.state === "too_soon"; // a run began moments ago; just show its result
    if (started.state === "already_running") setSync("A sync is already running — following it…", "busy", run.html_url);
    if (quick) setSync("A sync was started moments ago — checking its result…", "busy", run.html_url);

    // follow the run until it finishes
    const t0 = Date.now();
    let current = { status: "queued" };
    for (;;) {
      try { current = await backend.status(run); } catch (e) { /* brief network hiccup: try again */ }
      if (current.status === "completed") break;
      if (Date.now() - t0 > SYNC_TIMING.runMaxMs) { setSync("Still running after 20 minutes — check GitHub.", "warn", run.html_url); return; }
      if (!quick) setSync(`Syncing… ${Math.round((Date.now() - t0) / 1000)}s`, "busy", run.html_url);
      await sleep(SYNC_TIMING.runPollMs);
    }
    if (current.conclusion !== "success") { setSync(`Sync run ${current.conclusion || "did not finish"}.`, "err", run.html_url); return; }

    // The run saved new ranks; GitHub Pages needs a moment to publish them.
    setSync("Run finished — loading the new data…", "busy", run.html_url);
    const t1 = Date.now();
    for (;;) {
      const rows = await fetchJSON("data/ranks.json");
      if (rows && rows.length && (dataStamp(rows) !== before || quick)) {
        ALL_ROWS = rows; IS_DEMO = false; PROJECTS = buildProjects(rows);
        setSync(quick ? "Up to date." : "Sync complete — dashboard updated.", "ok", run.html_url);
        return;
      }
      if (quick || Date.now() - t1 > SYNC_TIMING.dataMaxMs) break;
      await sleep(SYNC_TIMING.dataPollMs);
    }
    setSync("The run finished but no new ranks appeared. Keywords already checked today are skipped, and a marketplace step may have failed — open the run to see.", "warn", run.html_url);
  } catch (e) {
    setSync(String(e.message || e), "err");
  } finally {
    syncState.busy = false;
    renderPage();
  }
}

// ---------- CSV export ----------
function buildCsv() {
  const { columns, keywords, getValue } = LAST_GRID;
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [["Keyword", ...columns.map((c) => c.key)].map(q).join(",")];
  keywords.forEach((kw) => {
    const vals = columns.map((c) => {
      const v = getValue(kw, c.key);
      return v === undefined || v === null ? "" : v === "BLOCKED" ? "blocked" : v;
    });
    lines.push([q(kw), ...vals].join(","));
  });
  return lines.join("\n");
}

function exportCSV() {
  if (!LAST_GRID) return;
  const item = currentItem();
  const blob = new Blob(["\ufeff" + buildCsv()], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ranks-${item.marketplace}-${item.country}-${item.product_id}-${state.range}.csv`.replace(/[^\w.-]+/g, "_");
  document.body.appendChild(a);
  a.click();
  a.remove();
}

boot();
