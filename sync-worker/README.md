# Cloudflare helper: an exact daily timer (optional, ~10 minutes, by one admin)

**Optional.** The dashboard no longer has a "Sync now" button, so this helper now has one use: starting the daily
check at an exact minute (see "A precise daily timer" at the end). New products and keywords you add to the sheet are
already picked up automatically, with no setup at all, and you can always run the workflow yourself from GitHub's
**Actions** tab.

**Why a separate service?** GitHub's free scheduler starts the tracker late, by a different amount every day. This
little service keeps the GitHub key as a secret on Cloudflare (free) and starts the tracker at a time you choose.

## Step 1 — Create the GitHub key (once)
Best done by an organization owner (the key stops working if the person who
created it leaves the organization).

1. GitHub → profile picture → **Settings → Developer settings → Personal access
   tokens → Fine-grained tokens → Generate new token**.
2. **Resource owner:** the organization that owns the repo (`cd-commerce-de`).
   **Repository access:** *Only select repositories* → `Rank-Tracker`.
3. **Permissions → Repository permissions → Actions: Read and write.**
   Nothing else.
4. Expiration: the longest allowed (usually 1 year) — put a reminder in your
   calendar to renew it. Generate, and keep the page open (you can't view it again).

If your organization asks for approval of fine-grained tokens, an owner approves
it under **Organization settings → Personal access tokens**.

## Step 2 — Create the service on Cloudflare (free)
1. Sign up / log in at https://dash.cloudflare.com (the free plan is enough).
2. **Workers & Pages → Create → Create Worker.** Name it `rank-tracker-sync`
   and click **Deploy**.
3. Click **Edit code**, delete everything in the editor, paste the whole
   contents of `worker.js` (in this folder), then **Deploy**.
   (Menu names move around a little over time; you're looking for "create a
   Worker", "edit its code", and its "Variables and Secrets" settings.)

## Step 3 — Give it its settings
Worker → **Settings → Variables and Secrets → Add**:

| Name | Value | Type |
|---|---|---|
| `GITHUB_TOKEN` | the key from step 1 | **Secret** |
| `GITHUB_REPO` | `cd-commerce-de/Rank-Tracker` | Text |
| `ALLOWED_ORIGIN` | `https://cd-commerce-de.github.io` (exactly — no trailing `/`, no repo name) | Text |
| `SYNC_PASSCODE` | *(optional)* a team passcode | **Secret** |

Optional extras: `COOLDOWN_SECONDS` (default 180 — the shortest gap between two
started runs), `GITHUB_WORKFLOW` (default `track-ranks.yml`), `GITHUB_BRANCH`
(default `main`). Click **Deploy** again after changing settings.

About `SYNC_PASSCODE`: without it, anyone who finds the service address can press
the button from the dashboard's website — the worst they can do is start the
tracker (at most once per cooldown). With it, each person types the passcode once
per computer (it's remembered). Use it if your dashboard address is public.

## If something goes wrong
- **"doesn't accept requests from this website":** `ALLOWED_ORIGIN` must match the
  dashboard's address exactly (`https://cd-commerce-de.github.io`).
- **"…token… may have expired":** renew the GitHub key (step 1) and replace
  `GITHUB_TOKEN` in the Worker.

## A precise daily timer

GitHub's free scheduler starts the tracker late, by a different amount each day. This worker can start it at the
exact minute instead, so every day's reading is taken at the same hour.

1. Replace the worker's code with the new `worker.js` from this folder (Cloudflare → your worker → *Edit code* →
   paste → *Deploy*).
2. In Cloudflare open your worker → **Settings → Triggers → Cron Triggers → Add**, and enter `30 1 * * *`.
   Cloudflare cron times are **UTC**: 01:30 UTC is 03:30 in Germany in summer time and 02:30 in winter time.
3. Nothing else is needed: the worker already has the GitHub token and repo settings. In *Logs* you should see
   "daily timer: tracker started" each night. "GitHub answered 403" means the token has expired or lost its
   *Actions: Read and write* permission.

GitHub's own 01:30 UTC schedule stays in the workflow as a backup. If both fire, the second one finds today's
results already saved and does nothing, so it costs nothing.
