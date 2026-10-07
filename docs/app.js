// ---------- Config ----------
const FLAGS = { DE: "🇩🇪", US: "🇺🇸", GB: "🇬🇧", FR: "🇫🇷", IT: "🇮🇹", ES: "🇪🇸", AT: "🇦🇹", NL: "🇳🇱", PL: "🇵🇱" };
const MP_LABEL = { ebay: "eBay", otto: "Otto", kaufland: "Kaufland", temu: "Temu" };
const MP_CLASS = { ebay: "mp-ebay", otto: "mp-otto", kaufland: "mp-kaufland", temu: "mp-temu" };

let ALL_ROWS = [];
let IS_DEMO = false;
let PROJECTS = {};          // project_id -> { project_id, project_name, items: {item_key: {...}}, rows: [] }
let state = { projectId: null, itemKey: null, tab: "ranks", range: "daily" };
let sparkCharts = {};       // keep chart instances so we can destroy before re-render
let trendChart = null;

// ---------- Data loading ----------
async function fetchJSON(path) {
  try {
    const res = await fetch(path, { cache: "no-store" });
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
  PROJECTS = buildProjects(ALL_ROWS);
}

function buildProjects(rows) {
  const map = {};
  rows.forEach((r) => {
    if (!map[r.project_id]) {
      map[r.project_id] = { project_id: r.project_id, project_name: r.project_name, items: {}, rows: [] };
    }
    const p = map[r.project_id];
    p.rows.push(r);
    if (!p.items[r.item_key]) {
      p.items[r.item_key] = { item_key: r.item_key, marketplace: r.marketplace, country: r.country, rows: [] };
    }
    p.items[r.item_key].rows.push(r);
  });
  return map;
}

// ---------- Small helpers ----------
function uniq(arr) { return [...new Set(arr)]; }
function fmtDateShort(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}
function isoWeekStart(iso) {
  const d = new Date(iso + "T00:00:00");
  const day = (d.getDay() + 6) % 7; // Monday=0
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}
function monthKey(iso) { return iso.slice(0, 7); }
function monthLabel(key) {
  const d = new Date(key + "-01T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
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
function mean(nums) {
  const v = nums.filter((n) => n !== null && n !== undefined);
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

// ---------- Routing ----------
function parseHash() {
  const h = location.hash.replace(/^#\/?/, "");
  const parts = h.split("/").filter(Boolean);
  if (parts[0] === "project" && parts[1]) {
    return { view: "project", projectId: decodeURIComponent(parts[1]) };
  }
  return { view: "projects" };
}

window.addEventListener("hashchange", render);

async function boot() {
  await loadData();
  render();
}

function render() {
  const route = parseHash();
  if (route.view === "project" && PROJECTS[route.projectId]) {
    state.projectId = route.projectId;
    renderProjectView();
  } else {
    renderProjectsLanding();
  }
}

// ---------- Projects landing ----------
function renderProjectsLanding() {
  const app = document.getElementById("app");
  const projects = Object.values(PROJECTS);

  const demoBanner = IS_DEMO
    ? `<div style="background:#fff7e0;border-bottom:1px solid #f0dca0;padding:10px 28px;font-size:0.82rem;color:#8a6d1d;">
         Showing demo data — no real tracker data yet. Once the GitHub Actions workflow runs, your real ranks replace this automatically.
       </div>`
    : "";

  if (!projects.length) {
    app.innerHTML = `
      ${demoBanner}
      <div class="projects-header"><h1>Projects</h1></div>
      <div class="content"><div class="empty-state">No projects yet. Add one to <code>config/projects.json</code> and run the tracker.</div></div>`;
    return;
  }

  const cards = projects
    .map((p) => {
      const items = Object.values(p.items);
      const keywordCount = uniq(p.rows.map((r) => r.keyword)).length;
      const marketplaces = uniq(items.map((i) => i.marketplace));
      const pills = marketplaces
        .map((m) => `<span class="mp-pill ${MP_CLASS[m] || ""}">${MP_LABEL[m] || m}</span>`)
        .join("");
      return `
        <div class="project-card" onclick="location.hash='#/project/${encodeURIComponent(p.project_id)}'">
          <div class="project-thumb">📦</div>
          <div class="name">${p.project_name}</div>
          <div class="meta">${items.length} item${items.length !== 1 ? "s" : ""} · ${keywordCount} keywords</div>
          <div>${pills}</div>
        </div>`;
    })
    .join("");

  app.innerHTML = `
    ${demoBanner}
    <div class="projects-header"><div><h1>Projects</h1></div></div>
    <div class="projects-grid">${cards}</div>`;
}

// ---------- Project view ----------
function renderProjectView() {
  const project = PROJECTS[state.projectId];
  const items = Object.values(project.items);

  if (!state.itemKey || !project.items[state.itemKey]) {
    state.itemKey = items[0].item_key;
  }

  const countries = uniq(items.map((i) => i.country));
  const flagStr =
    countries.slice(0, 1).map((c) => FLAGS[c] || c).join("") +
    (countries.length > 1 ? ` +${countries.length - 1}` : "");

  const keywordCount = uniq(project.rows.map((r) => r.keyword)).length;

  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="topbar">
      <div class="back-btn" onclick="location.hash='#/projects'">←</div>
      <h1>${project.project_name}</h1>
      <div class="flags">${flagStr}</div>
    </div>
    <div class="tabs">
      <div class="tab" data-tab="items">Items <span class="badge-count">${items.length}</span></div>
      <div class="tab" data-tab="keywords">Keywords <span class="badge-count">${keywordCount}</span></div>
      <div class="tab" data-tab="ranks">Ranks</div>
      <div class="tab" data-tab="trends">Trends</div>
    </div>
    <div class="content" id="tabContent"></div>
  `;

  app.querySelectorAll(".tab").forEach((el) => {
    el.classList.toggle("active", el.dataset.tab === state.tab);
    el.addEventListener("click", () => {
      state.tab = el.dataset.tab;
      renderProjectView();
    });
  });

  const target = document.getElementById("tabContent");
  if (state.tab === "items") renderItemsTab(target, project);
  else if (state.tab === "keywords") renderKeywordsTab(target, project);
  else if (state.tab === "trends") renderTrendsTab(target, project);
  else renderRanksTab(target, project);
}

function itemSelectHTML(project) {
  const items = Object.values(project.items);
  const opts = items
    .map(
      (i) =>
        `<option value="${i.item_key}" ${i.item_key === state.itemKey ? "selected" : ""}>
           ${FLAGS[i.country] || i.country} ${MP_LABEL[i.marketplace] || i.marketplace} · ${i.country}
         </option>`
    )
    .join("");
  return `<select class="item-select" id="itemSelect">${opts}</select>`;
}

function bindItemSelect() {
  const el = document.getElementById("itemSelect");
  if (!el) return;
  el.addEventListener("change", () => {
    state.itemKey = el.value;
    renderProjectView();
  });
}

// ---------- Items tab ----------
function renderItemsTab(target, project) {
  const items = Object.values(project.items);
  const rows = items
    .map((item) => {
      const dates = uniq(item.rows.map((r) => r.date)).sort();
      const latest = dates[dates.length - 1];
      const latestRows = item.rows.filter((r) => r.date === latest);
      const avgPos = mean(latestRows.map((r) => r.rank));
      const visibility = latestRows.length
        ? (latestRows.filter((r) => r.rank !== null).length / latestRows.length) * 100
        : null;
      const kwCount = uniq(item.rows.map((r) => r.keyword)).length;
      return `
        <tr onclick="selectItemAndGo('${item.item_key}')">
          <td>${FLAGS[item.country] || item.country} ${MP_LABEL[item.marketplace] || item.marketplace}</td>
          <td>${item.country}</td>
          <td>${kwCount}</td>
          <td>${avgPos !== null ? avgPos.toFixed(1) : "–"}</td>
          <td>${visibility !== null ? visibility.toFixed(0) + "%" : "–"}</td>
          <td>${latest || "–"}</td>
        </tr>`;
    })
    .join("");

  target.innerHTML = `
    <table class="simple">
      <thead><tr><th>Marketplace</th><th>Country</th><th>Keywords</th><th>Avg. position</th><th>Visibility</th><th>Last checked</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

window.selectItemAndGo = function (itemKey) {
  state.itemKey = itemKey;
  state.tab = "ranks";
  renderProjectView();
};

// ---------- Keywords tab ----------
function renderKeywordsTab(target, project) {
  target.innerHTML = `<div class="controls-row">${itemSelectHTML(project)}</div><div id="kwTableWrap"></div>`;
  bindItemSelect();

  const item = project.items[state.itemKey];
  const keywords = uniq(item.rows.map((r) => r.keyword));
  const dates = uniq(item.rows.map((r) => r.date)).sort();
  const latest = dates[dates.length - 1];
  const weekAgoIdx = Math.max(0, dates.length - 8);
  const weekAgoDate = dates[weekAgoIdx];

  const rows = keywords
    .map((kw) => {
      const kwRows = item.rows.filter((r) => r.keyword === kw);
      const latestRank = (kwRows.find((r) => r.date === latest) || {}).rank ?? null;
      const weekAgoRank = (kwRows.find((r) => r.date === weekAgoDate) || {}).rank ?? null;
      const best = mean(kwRows.map((r) => r.rank)) === null ? null : Math.min(...kwRows.map((r) => r.rank).filter((r) => r !== null));
      let trendHTML = `<span class="trend-flat">–</span>`;
      if (latestRank !== null && weekAgoRank !== null) {
        const delta = weekAgoRank - latestRank; // positive = improved (rank number went down)
        if (delta > 0) trendHTML = `<span class="trend-down">▲ ${delta}</span>`;
        else if (delta < 0) trendHTML = `<span class="trend-up">▼ ${Math.abs(delta)}</span>`;
        else trendHTML = `<span class="trend-flat">– 0</span>`;
      }
      return `
        <tr>
          <td>${kw}</td>
          <td><span class="rank-cell ${tierClass(latestRank)}" style="padding:3px 8px;">${latestRank ?? "–"}</span></td>
          <td>${best ?? "–"}</td>
          <td>${trendHTML} <span style="color:var(--text-dim);font-size:0.75rem;">vs 7d</span></td>
          <td>${kwRows.length} checks</td>
        </tr>`;
    })
    .join("");

  document.getElementById("kwTableWrap").innerHTML = `
    <table class="simple">
      <thead><tr><th>Keyword</th><th>Current rank</th><th>Best rank</th><th>Trend</th><th>History</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ---------- Ranks tab (the main heatmap grid) ----------
function renderRanksTab(target, project) {
  target.innerHTML = `
    <div class="controls-row">
      ${itemSelectHTML(project)}
      <div class="range-group">
        <div class="range-btn" data-range="daily">Daily</div>
        <div class="range-btn" data-range="weekly">Weekly</div>
        <div class="range-btn" data-range="monthly">Monthly</div>
      </div>
    </div>
    <div class="summary-grid" id="summaryGrid"></div>
    <div class="grid-wrap"><table class="rankgrid" id="rankGrid"></table></div>
  `;
  bindItemSelect();

  target.querySelectorAll(".range-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.range === state.range);
    btn.addEventListener("click", () => {
      state.range = btn.dataset.range;
      renderProjectView();
    });
  });

  const item = project.items[state.itemKey];
  renderSummaryCards(item);
  renderGrid(item);
}

function renderSummaryCards(item) {
  const dates = uniq(item.rows.map((r) => r.date)).sort();
  const keywords = uniq(item.rows.map((r) => r.keyword));

  const dailyVisibility = dates.map((d) => {
    const rows = item.rows.filter((r) => r.date === d);
    return rows.length ? (rows.filter((r) => r.rank !== null).length / rows.length) * 100 : null;
  });
  const dailyAvgPos = dates.map((d) => mean(item.rows.filter((r) => r.date === d).map((r) => r.rank)));
  const dailyTop3 = dates.map((d) => item.rows.filter((r) => r.date === d && r.rank !== null && r.rank <= 3).length);

  const latestVis = dailyVisibility[dailyVisibility.length - 1];
  const latestAvg = dailyAvgPos[dailyAvgPos.length - 1];
  const latestTop3 = dailyTop3[dailyTop3.length - 1];

  const latestDate = dates[dates.length - 1];
  const latestRanks = item.rows.filter((r) => r.date === latestDate).map((r) => r.rank);
  const buckets = [
    { label: "1-3", test: (r) => r !== null && r <= 3, color: "#1f9d55" },
    { label: "4-10", test: (r) => r !== null && r > 3 && r <= 10, color: "#7cc576" },
    { label: "11-50", test: (r) => r !== null && r > 10 && r <= 50, color: "#f2c94c" },
    { label: "51-100", test: (r) => r !== null && r > 50 && r <= 100, color: "#f2994a" },
    { label: "100+ / not found", test: (r) => r === null || r > 100, color: "#d9dbe0" },
  ];
  const counts = buckets.map((b) => latestRanks.filter(b.test).length);
  const maxCount = Math.max(1, ...counts);

  const wrap = document.getElementById("summaryGrid");
  wrap.innerHTML = `
    <div class="card">
      <div class="label">Visibility</div>
      <div class="value">${latestVis !== null ? latestVis.toFixed(1) + "%" : "–"}</div>
      <canvas id="sparkVis" height="50"></canvas>
    </div>
    <div class="card">
      <div class="label">Average Position</div>
      <div class="value">${latestAvg !== null ? latestAvg.toFixed(1) : "–"}</div>
      <canvas id="sparkAvg" height="50"></canvas>
    </div>
    <div class="card">
      <div class="label">Top 3 Rankings</div>
      <div class="value">${latestTop3}</div>
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
    </div>
  `;

  makeSparkline("sparkVis", dates, dailyVisibility, "#5b5ff0");
  makeSparkline("sparkAvg", dates, dailyAvgPos, "#5b5ff0", true);
  makeSparkline("sparkTop3", dates, dailyTop3, "#5b5ff0");
}

function makeSparkline(canvasId, labels, data, color, reverseY) {
  if (sparkCharts[canvasId]) sparkCharts[canvasId].destroy();
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  sparkCharts[canvasId] = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [{ data, borderColor: color, backgroundColor: color + "22", fill: true, tension: 0.3, pointRadius: 0, spanGaps: true }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { x: { display: false }, y: { display: false, reverse: !!reverseY } },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      elements: { line: { borderWidth: 2 } },
    },
  });
}

function renderGrid(item) {
  const keywords = uniq(item.rows.map((r) => r.keyword));
  const rawDates = uniq(item.rows.map((r) => r.date)).sort(); // ascending

  // Precompute keyword -> date -> row lookup once (carries rank AND the
  // blocked flag, so a Temu block never silently reads the same as
  // "not found" in the grid — see the getValue daily case below).
  const byKwDate = {};
  item.rows.forEach((r) => {
    byKwDate[r.keyword] = byKwDate[r.keyword] || {};
    byKwDate[r.keyword][r.date] = r; // whole row, not just r.rank
  });
  const hasCell = (kw, d) => Object.prototype.hasOwnProperty.call(byKwDate[kw] || {}, d);
  const cellRow = (kw, d) => byKwDate[kw][d];
  const cellRank = (kw, d) => cellRow(kw, d).rank;

  let columns; // [{key, label}]
  let getValue; // (keyword, columnKey) -> rank, null (not found), or undefined (no data)

  if (state.range === "daily") {
    columns = rawDates.slice().reverse().map((d) => ({ key: d, label: fmtDateShort(d) }));
    getValue = (kw, colKey) => {
      if (!hasCell(kw, colKey)) return undefined;
      const row = cellRow(kw, colKey);
      return row.blocked ? "BLOCKED" : row.rank;
    };
  } else if (state.range === "weekly") {
    const weekMap = {};
    rawDates.forEach((d) => {
      const wk = isoWeekStart(d);
      weekMap[wk] = weekMap[wk] || [];
      weekMap[wk].push(d);
    });
    const weeks = Object.keys(weekMap).sort().reverse();
    columns = weeks.map((wk) => ({ key: wk, label: "wk " + fmtDateShort(wk) }));
    getValue = (kw, colKey) => {
      const ds = weekMap[colKey].filter((d) => hasCell(kw, d));
      if (!ds.length) return undefined;
      const m = mean(ds.map((d) => cellRank(kw, d)));
      return m === null ? null : Math.round(m);
    };
  } else {
    const monthMap = {};
    rawDates.forEach((d) => {
      const mk = monthKey(d);
      monthMap[mk] = monthMap[mk] || [];
      monthMap[mk].push(d);
    });
    const months = Object.keys(monthMap).sort().reverse();
    columns = months.map((mk) => ({ key: mk, label: monthLabel(mk) }));
    getValue = (kw, colKey) => {
      const ds = monthMap[colKey].filter((d) => hasCell(kw, d));
      if (!ds.length) return undefined;
      const m = mean(ds.map((d) => cellRank(kw, d)));
      return m === null ? null : Math.round(m);
    };
  }

  const thead = `<thead><tr><th class="kwcol">Keyword (${keywords.length})</th>${columns.map((c) => `<th>${c.label}</th>`).join("")}</tr></thead>`;

  const bestRankByKw = {};
  keywords.forEach((kw) => {
    const ranks = item.rows.filter((r) => r.keyword === kw).map((r) => r.rank).filter((r) => r !== null);
    bestRankByKw[kw] = ranks.length ? Math.min(...ranks) : Infinity;
  });
  const sortedKeywords = keywords.slice().sort((a, b) => bestRankByKw[a] - bestRankByKw[b]);

  const body = sortedKeywords
    .map((kw) => {
      const tag = bestRankByKw[kw] === 1 ? '<span class="kw-tag">TOP 1</span>' : bestRankByKw[kw] <= 3 ? '<span class="kw-tag">TOP 3</span>' : "";
      const cells = columns
        .map((c) => {
          const v = getValue(kw, c.key);
          if (v === undefined) return `<td>·</td>`;
          if (v === "BLOCKED") return `<td class="rank-cell ${tierClass(v)}" title="Temu blocked this check — not the same as falling out of rank">?</td>`;
          return `<td class="rank-cell ${tierClass(v)}">${v === null ? "–" : v}</td>`;
        })
        .join("");
      return `<tr><td class="kwcol"><span class="kw-name">${kw}</span>${tag}</td>${cells}</tr>`;
    })
    .join("");

  document.getElementById("rankGrid").innerHTML = thead + `<tbody>${body}</tbody>`;
}

// ---------- Trends tab ----------
function renderTrendsTab(target, project) {
  target.innerHTML = `
    <div class="controls-row">
      ${itemSelectHTML(project)}
      <select id="kwPick"></select>
    </div>
    <div class="card"><canvas id="trendChart" height="90"></canvas></div>
  `;
  bindItemSelect();

  const item = project.items[state.itemKey];
  const keywords = uniq(item.rows.map((r) => r.keyword));
  const pick = document.getElementById("kwPick");
  pick.innerHTML = keywords.map((k) => `<option value="${k}">${k}</option>`).join("");
  pick.addEventListener("change", () => drawTrend(item, pick.value));
  drawTrend(item, keywords[0]);
}

function drawTrend(item, keyword) {
  const rows = item.rows.filter((r) => r.keyword === keyword).sort((a, b) => a.date.localeCompare(b.date));
  const labels = rows.map((r) => r.date);
  const data = rows.map((r) => r.rank);
  if (trendChart) trendChart.destroy();
  const ctx = document.getElementById("trendChart");
  trendChart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [{ label: `Rank for "${keyword}"`, data, borderColor: "#5b5ff0", backgroundColor: "#5b5ff022", fill: true, tension: 0.25, spanGaps: true }] },
    options: {
      scales: { y: { reverse: true, title: { display: true, text: "Position (lower = better)" } } },
      plugins: { legend: { display: false } },
    },
  });
}

boot();
