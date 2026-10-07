/**
 * Sync relay — lets the dashboard's "Sync now" button start the GitHub
 * workflow for EVERYONE, without each person creating a GitHub token.
 *
 * Why it exists: the dashboard is a public web page, so it can't hold a key
 * that starts GitHub jobs (anyone could copy it). This tiny service holds that
 * key instead, as a secret on Cloudflare, and the dashboard asks it to start
 * the run. The key never reaches anyone's browser.
 *
 * What it can do (and nothing else):
 *   POST /        -> start the tracker workflow (or join one already running)
 *   GET  /?run=ID -> report that run's status
 *
 * Settings (Cloudflare worker -> Settings -> Variables and Secrets):
 *   GITHUB_TOKEN   (secret)  fine-grained token, ONE repo, Actions: Read and write
 *   GITHUB_REPO              e.g. cd-commerce-de/Rank-Tracker
 *   ALLOWED_ORIGIN           e.g. https://cd-commerce-de.github.io  (no trailing slash)
 *   SYNC_PASSCODE  (secret, optional)  a shared team passcode people enter once
 *   GITHUB_WORKFLOW (optional, default track-ranks.yml)
 *   GITHUB_BRANCH   (optional, default main)
 *   COOLDOWN_SECONDS (optional, default 180)  minimum gap between started runs
 */

const ACTIVE = ["queued", "in_progress", "waiting", "requested", "pending"];

export default {
  async fetch(request, env) {
    const allowed = env.ALLOWED_ORIGIN || "";
    const origin = request.headers.get("Origin");
    const cors = {
      "Access-Control-Allow-Origin": allowed,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Sync-Passcode",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };
    const reply = (body, status = 200, withCors = true) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", ...(withCors ? cors : {}) },
      });

    // Only the dashboard's own website may use this (browsers always send Origin).
    if (!allowed || origin !== allowed) return reply({ error: "forbidden" }, 403, false);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    if (env.SYNC_PASSCODE && request.headers.get("X-Sync-Passcode") !== env.SYNC_PASSCODE) {
      return reply({ error: "passcode_required" }, 401);
    }
    if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
      return reply({ error: "not_configured", message: "The sync service is missing GITHUB_TOKEN or GITHUB_REPO." }, 500);
    }

    const repo = env.GITHUB_REPO;
    const workflow = env.GITHUB_WORKFLOW || "track-ranks.yml";
    const branch = env.GITHUB_BRANCH || "main";
    const cooldown = Number(env.COOLDOWN_SECONDS ?? 180);
    const pollMs = Number(env.POLL_MS ?? 1500);
    const gh = (path, init = {}) =>
      fetch("https://api.github.com" + path, {
        ...init,
        headers: {
          Authorization: "Bearer " + env.GITHUB_TOKEN,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "rank-tracker-sync",
        },
      });
    const slim = (r) => ({ id: r.id, html_url: r.html_url });
    const url = new URL(request.url);

    // ---- status of one run ----
    if (request.method === "GET") {
      const id = url.searchParams.get("run") || "";
      if (!/^\d+$/.test(id)) return reply({ error: "bad_run_id" }, 400);
      const r = await gh(`/repos/${repo}/actions/runs/${id}`);
      if (!r.ok) return reply({ error: "github_error", status: r.status }, 502);
      const run = await r.json();
      return reply({ status: run.status, conclusion: run.conclusion, html_url: run.html_url });
    }

    if (request.method !== "POST") return reply({ error: "method_not_allowed" }, 405);

    // ---- start a sync ----
    const listRes = await gh(`/repos/${repo}/actions/workflows/${workflow}/runs?per_page=5`);
    if (!listRes.ok) {
      return reply({ error: "github_error", status: listRes.status,
        message: "GitHub didn't accept the sync service's token (it may have expired) or the repo/workflow name is wrong." }, 502);
    }
    const runs = (await listRes.json()).workflow_runs || [];

    // Someone already started one: join it instead of starting a second.
    const active = runs.find((r) => ACTIVE.includes(r.status));
    if (active) return reply({ state: "already_running", run: slim(active) });

    // A run began very recently: don't pile another on top (protects against button-mashing).
    const latest = runs[0];
    if (latest && cooldown > 0 && Date.now() - Date.parse(latest.created_at) < cooldown * 1000) {
      return reply({ state: "too_soon", run: slim(latest) });
    }

    const lastId = latest ? latest.id : 0;
    const d = await gh(`/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
      method: "POST",
      body: JSON.stringify({ ref: branch }),
    });
    if (d.status !== 204) {
      return reply({ error: "dispatch_failed", status: d.status,
        message: "GitHub refused to start the workflow (token permissions, or the branch/workflow name is wrong)." }, 502);
    }

    // GitHub doesn't say which run it created, so look for the newest one.
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, pollMs));
      const res = await gh(`/repos/${repo}/actions/workflows/${workflow}/runs?event=workflow_dispatch&per_page=5`);
      if (res.ok) {
        const found = ((await res.json()).workflow_runs || []).find((r) => r.id > lastId);
        if (found) return reply({ state: "started", run: slim(found) });
      }
    }
    return reply({ state: "started", run: null });
  },
};
