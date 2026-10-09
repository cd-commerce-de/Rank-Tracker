# Shared Sync service (one-time setup, ~10 minutes, by one admin)

**Optional.** New products and keywords you add to the sheet are already picked up
automatically every hour, with no setup at all. This service adds an *instant* option:
it makes the dashboard's **↻ Sync now** button work for **everyone** — no GitHub
account, no token, nothing to install for the other users.

**Why a separate service?** The dashboard is a public web page, so it can't
contain the key that starts GitHub jobs. This little service keeps that key as
a secret on Cloudflare (free) and the dashboard just asks it to "run the
tracker". It can do exactly two things: start the tracker workflow, and report
how that run is going.

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

## Step 4 — Point the dashboard at it
Copy the Worker's address (it ends in `.workers.dev`) and put it in
`docs/settings.json` in the repo:

```json
{
  "sync_url": "https://rank-tracker-sync.YOURNAME.workers.dev/"
}
```
(keep the other lines in that file as they are). Commit. After a minute, open the
dashboard, click **⚙** — it should say *"One-click sync is connected for
everyone"* — then click **↻ Sync now**.

## If something goes wrong
- **"doesn't accept requests from this website":** `ALLOWED_ORIGIN` must match the
  dashboard's address exactly (`https://cd-commerce-de.github.io`).
- **"…token… may have expired":** renew the GitHub key (step 1) and replace
  `GITHUB_TOKEN` in the Worker.
- **"Couldn't reach the sync service":** `sync_url` in `docs/settings.json` is wrong
  or has a typo.
