// ---------- Config ----------
const FLAGS = { DE: "🇩🇪", US: "🇺🇸", GB: "🇬🇧", FR: "🇫🇷", IT: "🇮🇹", ES: "🇪🇸", AT: "🇦🇹", NL: "🇳🇱", PL: "🇵🇱" };
const MP_LABEL = { ebay: "eBay", otto: "Otto", kaufland: "Kaufland", temu: "Temu" };
const MP_ORDER = ["ebay", "otto", "kaufland", "temu"];

let ALL_ROWS = [];
let IS_DEMO = false;
let PROJECTS = {};   // project_id -> { project_id, project_name, items: { item_key: {...} }, rows: [] }
let SETTINGS = {};   // docs/settings.json
let state = { projectId: null, itemKey: null, range: "daily", days: 30, q: "", filter: "all", sort: { key: "now", dir: 1 }, helpOpen: false };
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
      item_key: r.item_key, marketplace: r.marketplace, country: r.country, product_id: r.item_id || r.item_key, label: null, rows: [],
    });
    it.rows.push(r);
    if (r.item_label) it.label = r.item_label; // optional product name from the sheet's Products tab
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

// Rows inside the selected period, counted back from the newest check among them.
function inPeriod(rows) {
  if (state.days === "all" || !rows.length) return rows;
  const latest = rows.map((r) => r.date).sort().pop();
  const cutoff = shiftDate(latest, -(state.days - 1));
  return rows.filter((r) => r.date >= cutoff);
}
const fmtFull = (iso) => utcDate(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
function daysBetween(a, b) { return Math.round((utcDate(b) - utcDate(a)) / 86400000); }
const MIN_DAILY_COLUMNS = 14; // keep the table's full shape even in the first days of tracking

function itemText(i) {
  return `${FLAGS[i.country] || ""} ${MP_LABEL[i.marketplace] || i.marketplace} · ${i.country} · ${i.label ? `${i.label} (${i.product_id})` : i.product_id}`.trim();
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
const DIST_LABELS = ["1-3", "4-10", "11-50", "51-100", "100+ / not found"];
const bucketOf = (rank) => (rank === null ? 4 : rank <= 3 ? 0 : rank <= 10 ? 1 : rank <= 50 ? 2 : rank <= 100 ? 3 : 4);

// Draw one section; if it fails, say so in that spot but keep the rest of the page.
function safely(hostId, fn) {
  try { fn(); } catch (e) {
    console.error(e);
    const el = document.getElementById(hostId);
    if (el) el.innerHTML = `<div class="empty-state">This section couldn't be drawn (${esc(e.message)}).</div>`;
  }
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
    ? `<p><a href="${esc(SETTINGS.sheet_url)}" target="_blank" rel="noopener"><b>Open the tracking sheet</b></a> and add your rows there. They're picked up on the next hourly check.</p>`
    : `<p>No Google Sheet is linked yet. Until you link one, copy the examples in <code>config/examples</code> to <code>config/keywords.csv</code> and <code>config/products.csv</code> in your GitHub repo and edit them (see the README for linking a Google Sheet, which is easier to edit).</p>`;
  return `
    <div class="help-panel">
      <b>Add or change what's tracked</b>
      <p>Your sheet has two tabs. <b>Keywords:</b> <code>project</code>, <code>keyword</code>. <b>Products:</b> <code>project</code>, <code>marketplace</code> (ebay / otto / kaufland / temu), <code>country</code>, <code>product_id</code> (the ID from your own listing's URL) and an optional <code>name</code>.</p>
      <p>Every product in a project is checked against every keyword of that project, so each keyword is written once and each product is written once. A project can have several product IDs, on one marketplace or several.</p>
      ${link}
      <p>A new keyword's history starts the first day it's checked. To check right away, use <b>↻ Sync now</b>, or run the workflow from your repo's <b>Actions</b> tab.</p>
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
    rangeText = `${state.days === "all" ? "ALL" : "L" + state.days + "D"}  ${fmtFull(start)} – ${fmtFull(latest)}`;
  }
  VIEW = { rows, rangeText };
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
      <div class="topbar"><img class="brand-icon" src="logo-icon.svg" alt="CD Commerce" /><h1>Rank Tracker</h1><div class="spacer"></div>${syncControlsHTML()}</div>
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
  computeView();

  const lastChecked = project.rows.map((r) => r.checked_at || r.date).sort().pop();
  const opt = (v, text, sel) => `<option value="${esc(v)}" ${sel ? "selected" : ""}>${esc(text)}</option>`;
  const projectOptions = projects.map((p) => opt(p.project_id, p.project_name, p.project_id === state.projectId)).join("");
  const itemOptions = items.map((i) => opt(i.item_key, itemText(i), i.item_key === state.itemKey)).join("");
  const periods = [[14, "Last 14 days"], [30, "Last 30 days"], [60, "Last 60 days"], [90, "Last 90 days"], ["all", "All time"]]
    .map(([v, label]) => opt(v, label, String(v) === String(state.days))).join("");
  const rangeGroup = `<div class="range-group">${["daily", "weekly", "monthly"].map((r) => `<div class="range-btn ${state.range === r ? "active" : ""}" data-range="${r}">${r[0].toUpperCase() + r.slice(1)}</div>`).join("")}</div>
      <select id="periodSelect">${periods}</select><span class="range-text">${esc(VIEW.rangeText)}</span>`;

  const controls = `<div class="ctrl-group"><select class="item-select" id="itemSelect">${itemOptions}</select><button class="btn" id="addKwBtn">+ Add keyword</button></div><div class="ctrl-group">${rangeGroup}</div>`;

  app.innerHTML = `
    ${demoBanner}
    <div class="topbar">
      <img class="brand-icon" src="logo-icon.svg" alt="CD Commerce" />
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
      <div class="controls-row">${controls}</div>
      <div class="summary-grid" id="summaryGrid"></div>
      <div class="table-toolbar" id="tableToolbar"></div>
      <div class="grid-legend" id="gridLegend"></div>
      <div class="grid-wrap"><table class="rankgrid" id="rankGrid"></table></div>
    </div>`;

  const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };
  bindSyncControls();
  on("projectSelect", "change", (e) => { state.projectId = e.target.value; state.itemKey = null; renderPage(); });
  on("itemSelect", "change", (e) => { state.itemKey = e.target.value; renderPage(); });
  on("periodSelect", "change", (e) => { state.days = e.target.value === "all" ? "all" : Number(e.target.value); renderPage(); });
  on("helpBtn", "click", () => { state.helpOpen = !state.helpOpen; renderPage(); });
  on("addKwBtn", "click", () => { state.helpOpen = true; renderPage(); window.scrollTo(0, 0); });
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
function fmtTick(v) { return Math.abs(v) >= 10 || Number.isInteger(v) ? String(Math.round(v)) : v.toFixed(1); }

function lineSVG(dates, values, o = {}) {
  const R = 44, pw = CW - CL - R, ph = CH - CT - CB;
  const nums = values.filter((v) => v !== null && v !== undefined);
  if (!nums.length) return `<svg viewBox="0 0 ${CW} ${CH}" class="chart"><text x="${CW / 2}" y="${CH / 2}" text-anchor="middle" class="ax">no data</text></svg>`;
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
      bars += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${yTop.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="${DIST_COLORS[b]}"><title>${esc(fmtDateShort(dates[i]))} · ${DIST_LABELS[b]}: ${count}</title></rect>`;
    });
  });
  return `<svg viewBox="0 0 ${CW} ${CH}" class="chart" role="img">${bars}<text x="${L}" y="${CH - 4}" class="ax">${esc(fmtDateShort(dates[0]))}</text><text x="${CW - R}" y="${CH - 4}" text-anchor="end" class="ax">${esc(fmtDateShort(dates[n - 1]))}</text></svg>`;
}

function renderSummaryCards(rows) {
  const wrap = document.getElementById("summaryGrid");
  const S = computeSeries(rows);
  if (!S.dates.length) { wrap.innerHTML = `<div class="card wide"><div class="label">No usable checks in this period yet.</div></div>`; return; }
  const n = S.dates.length, last = n - 1;
  const counts = S.dist[last], total = counts.reduce((a, b) => a + b, 0);
  const delta = (cur, prev, goodWhenUp, unit, dec = 0) => {
    if (n < 2 || prev === null || prev === undefined || cur === null || cur === undefined) return `<span class="delta flat">first checks</span>`;
    const d = cur - prev;
    if (Math.abs(d) < 0.05) return `<span class="delta flat">no change</span>`;
    const good = goodWhenUp ? d > 0 : d < 0;
    return `<span class="delta ${good ? "good" : "bad"}"><i>${d > 0 ? "▲" : "▼"}</i> ${Math.abs(d).toFixed(dec)}${unit} vs previous check</span>`;
  };
  wrap.innerHTML = `
    <div class="card" title="Share of tracked keywords where your product was found, on the latest day">
      <div class="label">Visibility</div>
      <div class="value">${S.vis[last].toFixed(1)}%</div>
      ${delta(S.vis[last], S.vis[last - 1], true, " pts", 1)}
      ${lineSVG(S.dates, S.vis, { min: 0, max: 100, fmt: (v) => Math.round(v) })}
    </div>
    <div class="card" title="Average position across the entries where your product was found">
      <div class="label">Average Position</div>
      <div class="value">${S.avg[last] !== null ? S.avg[last].toFixed(1) : "–"}</div>
      ${delta(S.avg[last], S.avg[last - 1], false, "", 1)}
      ${lineSVG(S.dates, S.avg, { reverse: true })}
    </div>
    <div class="card" title="How many tracked keywords have your product in the top 10 results, on the latest day">
      <div class="label">Keywords in Top 10</div>
      <div class="value">${S.top10[last]} <span class="of">of ${total}</span></div>
      ${delta(S.top10[last], S.top10[last - 1], true, "")}
      ${lineSVG(S.dates, S.top10, { min: 0, max: Math.max(2, Math.ceil(Math.max(...S.top10) / 2) * 2), fmt: (v) => Math.round(v) })}
    </div>
    <div class="card">
      <div class="label">Distribution</div>
      <div class="dist-wrap">
        <div class="dist-chart">${distSVG(S.dates, S.dist)}</div>
        <div class="dist-legend">${DIST_LABELS.map((l, i) => `<div><span class="dot" style="background:${DIST_COLORS[i]}"></span>${l}<b>${counts[i]}</b></div>`).reverse().join("")}</div>
      </div>
    </div>`;
}

// ---------- The rank tables ----------
function cellHTML(v, tip, scanned) {
  if (v === undefined) return `<td class="nodata" title="${tip} — not checked">·</td>`;
  if (v === "BLOCKED") return `<td class="rank-cell r-blocked" title="${tip} — the marketplace blocked this check, which is not the same as falling out of the rankings">?</td>`;
  if (v === null) return `<td class="rank-cell r-nf" title="${tip} — not found">${scanned ? `&gt;${scanned}` : "–"}</td>`;
  const h = heat(v);
  return `<td class="rank-cell" style="background:${h.bg};color:${h.fg}" title="${tip}">${v}</td>`;
}
function dayHeaderHTML(label) {
  const m = /^(\d+)\s+(.*)$/.exec(label) || /^(.*?)\s+(\d+)$/.exec(label);
  return m ? `<div class="d">${esc(m[1].length <= 2 ? m[1] : m[2])}</div><div class="mon">${esc(m[1].length <= 2 ? m[2] : m[1])}</div>` : esc(label);
}

const SORT_DEFAULT_DIR = { name: 1, now: 1, best: 1, avg: 1, change: -1, found: -1 };

function renderTable() {
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
  const labelHTML = (id) => `<span class="kw-name">${esc(id)}</span>`;

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
    columns = Object.keys(buckets).sort().reverse().map((k) => ({ key: k, label: state.range === "weekly" ? "wk " + fmtDateShort(k) : monthLabel(k) }));
    getValue = (id, k) => bucketValue(id, buckets[k]);
  }

  // Per-row summary: latest usable check, best, average, share of checks found, and change.
  const stats = (id) => {
    const ds = rawDates.filter((d) => hasCell(id, d) && !cell(id, d).blocked);
    if (!ds.length) return { now: undefined, best: null, avg: null, found: null, prev: undefined, scanned: null, delta: null, kind: null };
    const ranks = ds.map((d) => cell(id, d).rank);
    const found = ranks.filter((r) => r !== null);
    const now = ranks[ranks.length - 1], prev = ranks.length > 1 ? ranks[ranks.length - 2] : undefined;
    let delta = null, kind = null;
    if (prev !== undefined) {
      if (prev === null && now !== null) kind = "new";
      else if (prev !== null && now === null) kind = "lost";
      else if (prev !== null && now !== null) { delta = prev - now; kind = delta > 0 ? "improved" : delta < 0 ? "dropped" : "same"; }
    }
    return { now, best: found.length ? Math.min(...found) : null, avg: found.length ? mean(found) : null,
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
  const fopts = [["all", "All"], ["top3", "In the top 3"], ["top10", "In the top 10"], ["top100", "In the top 100"], ["notfound", "Not found"], ["improved", "Moved up"], ["dropped", "Moved down"], ["new", "Newly found"], ["lost", "Lost"]]
    .map(([v, l]) => `<option value="${v}" ${state.filter === v ? "selected" : ""}>${l}</option>`).join("");
  document.getElementById("tableToolbar").innerHTML = `
    <div class="ctrl-group"><select id="filterSelect" title="Filter rows">${fopts}</select>
      <input class="search-input" id="kwSearch" placeholder="Filter keywords…" value="${esc(state.q)}" /></div>
    <div class="movers">${anyPrev
      ? `<span class="mv-label">Since the previous check:</span>${chip("improved", "▲ moved up", kinds.improved)}${chip("dropped", "▼ moved down", kinds.dropped)}${chip("new", "● newly found", kinds.new)}${chip("lost", "✕ lost", kinds.lost)}`
      : `<span class="mv-label">Movement (▲ ▼) appears after the second daily check.</span>`}</div>
    <div class="ctrl-group"><button class="btn" id="exportBtn">Export CSV</button></div>`;
  document.getElementById("filterSelect").addEventListener("change", (e) => { state.filter = e.target.value; renderTable(); });
  document.getElementById("kwSearch").addEventListener("input", (e) => { state.q = e.target.value; renderTable(); const s = document.getElementById("kwSearch"); s.focus(); s.setSelectionRange(s.value.length, s.value.length); });
  document.getElementById("exportBtn").addEventListener("click", exportCSV);
  document.querySelectorAll("#tableToolbar .mv").forEach((b) => b.addEventListener("click", () => { state.filter = state.filter === b.dataset.f ? "all" : b.dataset.f; renderTable(); }));

  document.getElementById("gridLegend").innerHTML = legendHTML();

  const arrow = (k) => (state.sort.key === k ? (state.sort.dir === 1 ? " ▲" : " ▼") : "");
  const th = (k, text, tip, extra = "") => `<th class="metric sortable ${extra}" data-sort="${k}" title="${tip}">${text}${arrow(k)}</th>`;
  const head = `<thead><tr>
    <th class="kwcol sortable" data-sort="name">Keyword (${ids.length})${arrow("name")}</th>
    ${th("now", "Now", "Position at the most recent check")}${th("best", "Best", "Best position in the selected period")}
    ${th("avg", "Avg", "Average position over the checks where it was found")}${th("found", "Found", "Share of checks where it was found at all")}
    ${th("change", "Change", "Change since the check before the latest one", "metric-last")}
    ${columns.map((c) => `<th class="day">${state.range === "daily" ? dayHeaderHTML(c.label) : esc(c.label)}</th>`).join("")}</tr></thead>`;

  const body = ids.map((id) => {
    const s = st[id];
    const nowN = s.now === undefined ? 9999 : s.now === null ? 9999 : s.now;
    const tag = nowN === 1 ? '<span class="kw-tag">#1</span>' : nowN <= 3 ? '<span class="kw-tag">TOP 3</span>' : "";
    const nowCell = s.now === undefined ? `<td class="metric nodata">·</td>` : cellHTML(s.now, `${esc(labelText(id))} · position at the most recent check`, s.scanned).replace("<td ", '<td data-m="now" ').replace('class="rank-cell', 'class="metric rank-cell');
    const change = s.kind === "new" ? `<span class="trend-down"><i>●</i> new</span>` : s.kind === "lost" ? `<span class="trend-up"><i>✕</i> lost</span>`
      : s.kind === "improved" ? `<span class="trend-down"><i>▲</i> ${s.delta}</span>` : s.kind === "dropped" ? `<span class="trend-up"><i>▼</i> ${-s.delta}</span>`
      : s.kind === "same" ? `<span class="trend-flat">=</span>` : `<span class="trend-flat">–</span>`;
    const cells = columns.map((c) => {
      const v = getValue(id, c.key);
      const tip = esc(labelText(id) + " · " + c.key);
      return cellHTML(v, tip, state.range === "daily" && v === null ? cell(id, c.key).results_scanned : null);
    }).join("");
    return `<tr><td class="kwcol">${labelHTML(id)}${tag}</td>${nowCell}
      <td class="metric">${s.best === null ? "–" : s.best}</td><td class="metric">${s.avg === null ? "–" : s.avg.toFixed(1)}</td>
      <td class="metric">${s.found === null ? "–" : Math.round(s.found) + "%"}</td><td class="metric metric-last">${change}</td>${cells}</tr>`;
  }).join("");

  document.getElementById("rankGrid").innerHTML = head + `<tbody>${body || `<tr><td class="kwcol" colspan="${columns.length + 6}">Nothing matches this filter.</td></tr>`}</tbody>`;
  document.querySelectorAll("#rankGrid th.sortable").forEach((h) => h.addEventListener("click", () => {
    const k = h.dataset.sort;
    state.sort = state.sort.key === k ? { key: k, dir: -state.sort.dir } : { key: k, dir: SORT_DEFAULT_DIR[k] };
    renderTable();
  }));
}

function legendHTML() {
  const chips = [2, 7, 25, 70, 200].map((r, i) => { const h = heat(r); return `<span class="chip" style="background:${h.bg};color:${h.fg}">${["1–3", "4–10", "11–50", "51–100", ">100"][i]}</span>`; }).join("");
  return `Each column is a day; the number is where the product appears in that marketplace's search results for the keyword (1 = first). ${chips}
    <span class="chip r-nf">&gt;N not found in the top N checked</span><span class="chip r-blocked">?</span> blocked by the marketplace &nbsp;·&nbsp; <b>·</b> not checked that day`;
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
    <button class="btn secondary" id="syncBtn" ${syncState.busy ? "disabled" : ""}>↻ Sync now</button>
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
  const { firstHeader, columns, entities, getValue } = LAST_GRID;
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [[firstHeader, ...columns.map((c) => c.key)].map(q).join(",")];
  entities.forEach((e) => {
    const vals = columns.map((c) => {
      const v = getValue(e.id, c.key);
      return v === undefined || v === null ? "" : v === "BLOCKED" ? "blocked" : v;
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
