# Marketplace Rank Tracker

Tracks where your products rank in search results, per keyword, once a day —
on **eBay, Otto, Kaufland and Temu** — and shows the history in a DataRova-style
**Ranks** dashboard:

- **Ranks by Product** — pick a product; every keyword as a row, every day as a column,
  colour-coded from green (top of the results) to red, with Now / Best / Avg / Found /
  Change columns, sortable, with filters ("in the top 10", "moved up", "lost"…).
- Cards on top: Visibility, Average Position, **Keywords in Top 10** and a Distribution
  chart, each with a trend chart. Daily / Weekly / Monthly view, period picker, CSV export.

Runs free on GitHub: Actions does the daily checks, Pages hosts the dashboard.
The dashboard draws its own charts, so it needs nothing from outside websites.

## Updating the tool without losing your data

Your data and settings live in files that are **not** in the zip, so uploading a new version
never touches them:

| Yours (never in the zip) | What it is |
|---|---|
| `docs/data/ranks.json` | every rank saved so far — your history |
| `docs/settings.json` | your sheet link, repo name, sync address |
| the repo secrets | eBay / Bright Data keys, `TRACKING_SHEET_CSV_URL` |
| `config/keywords.csv`, `config/products.csv` | only if you use files instead of a sheet |

Everything in the zip is code and design (`docs/app.js`, `docs/style.css`, `docs/index.html`,
the icons, `scripts/`, `.github/`, the README), so it is always safe to upload it over the
repo. Two rules: **never upload `docs/data/ranks.json`** (or anything from an *older* zip's
`docs/data` folder, which held an empty one), and keep your own `docs/settings.json`.

If `ranks.json` ever does get overwritten, GitHub still has the old version: open
`docs/data/ranks.json` in the repo, click **History**, open the last commit named
"Update ranks …" from before the overwrite, click the file's **⋯ → View file** (or **Raw**),
copy everything, then edit the current `ranks.json` (pencil icon), paste, and commit.

## What it costs

Almost everything is free. The only thing that can cost money is **Bright Data**, and only for the
products that use it (eBay products with `source = web`, plus Otto, Kaufland and Temu).

| Part | Cost |
|---|---|
| eBay search API (`source` blank) | free |
| GitHub Pages, Actions (public repo), the Google Sheet, Cloudflare sync service, fonts | free |
| GitHub Actions on a *private* repo | 2,000 minutes a month included (3,000 on a Team plan); the daily run plus the hourly check use roughly 1,000–2,000 — see below |
| Bright Data **Web Unlocker** (eBay website mode, Otto, Kaufland) | 5,000 successful requests a month free, then **$1.50 per 1,000**; failed requests are not billed (rates seen in recent 2026 listings — confirm in your Bright Data account) |
| Bright Data **Browser API** (Temu) | billed per GB (about $5–8/GB), not per request |

**How many Web Unlocker requests?** One request per *results page*, and a search is shared by **every
product** checked for that keyword. So adding products costs nothing extra; what costs is
**keywords × pages × days**. The eBay website tracker reads **page 1 only** by default (up to 240
listings if eBay honours the page size, otherwise fewer), so it is about **one request per keyword per
day**. A listing that only appears further down is reported as "not found" with the number of
listings that were actually looked at (the dashboard shows it as `>N`). To look deeper, change
`EBAY_WEB_MAX_PAGES` (1–5) in `.github/workflows/track-ranks.yml`. Per month (30 days):

| Keywords | Requests, page 1 only (default) | Cost | Requests, 3 pages | Cost |
|--:|--:|--:|--:|--:|
| 50 | 1,500 | $0.00 | 4,500 | $0.00 |
| 100 | 3,000 | $0.00 | 9,000 | $6.00 |
| 150 | 4,500 | $0.00 | 13,500 | $12.75 |
| 200 | 6,000 | $1.50 | 18,000 | $19.50 |
| 300 | 9,000 | $6.00 | 27,000 | $33.00 |

(Cost = requests beyond the free 5,000 × $1.50 / 1,000. Up to about 165 keywords fit in the free
allowance with page 1 only. New keywords found by the hourly check and "Check an eBay keyword" runs add a
little. Bright Data says it bills more for some heavily protected websites; if eBay is on that list the
rate is higher than $1.50 — check the **usage page** in Bright Data after the first day, and set a
monthly spend limit there.)

**Safety net:** if 3 keywords in a row return a page that can't be read (blocked, or eBay changed its
layout), the eBay website tracker stops the run instead of paying for more empty pages.

**GitHub Actions minutes (private repos only):** the daily run takes a few minutes for 50
keywords on page 1 (the lookups run one after another) and the hourly check about a minute, so expect
roughly 800–1,200 minutes a month. If you go over, change the hourly `cron` line in `track-ranks.yml` to a
less frequent schedule, e.g. `"20 */3 * * *"`.

## Branding

The dashboard follows the CD Commerce brand: Dark Slate `#0F172A` and Warm Ember `#D97757`
(used sparingly), the neutral scale, Poppins for headlines/buttons and Inter for body text,
10px/16px rounded corners, and no text under 12px. Rank colours run from the brand's
Success green through Warning amber to Error red. The colours and fonts are defined once at
the top of `docs/style.css`.

The logo icon (never the wordmark) is in the header (`docs/logo-icon.svg`, brand-dark) and is
the tab icon (`favicon.svg` / `.ico` / `.png`, white icon on a Dark Slate square, so it reads on
light and dark browser tabs). All were traced as vectors from the supplied logo file so they
stay sharp at any size. To change the logo, replace those files with the same names.

## How it fits together

| What | Where |
|---|---|
| What to track (keywords + products) | a Google Sheet with two tabs **or** `config/keywords.csv` + `config/products.csv` |
| Checks | `.github/workflows/track-ranks.yml` runs the scripts in `scripts/`: a full check every day, plus an hourly pick-up of anything newly added |
| Results (history) | `docs/data/ranks.json`, saved back into the repo each day |
| Dashboard | `docs/index.html` + `app.js` + `style.css` (published by GitHub Pages) |

## Setup, in order

### 1. Put the files on GitHub
Unzip, create a new repo, and upload the **contents** of the unzipped folder
(not the folder itself) so `.github`, `config`, `docs`, `scripts`,
`README.md` and `requirements.txt` sit at the top of the repo. Check the
`.github` folder made it — dot-folders are sometimes skipped by drag-and-drop.

### 2. Turn on the dashboard
Repo **Settings → Pages** → Source: *Deploy from a branch* → Branch `main`,
folder **`/docs`** → Save. (If it shows this README instead of the dashboard,
the folder is set to `/ (root)`.) Pages on a private repo needs a paid GitHub
plan. Your dashboard is at `https://<user>.github.io/<repo>/`.
It shows demo data (with a yellow banner) until the first real run.

### 3. Say what to track — two tabs: Keywords and Products
Keep your keywords and your product IDs on two tabs of one Google Sheet. **Every
product in a project is checked against every keyword of that project**, on its
own marketplace — so a keyword is written once, and a product is written once.

**Tab named Keywords** — columns `project`, `keyword`:

| project | keyword |
|---|---|
| WGH30 (3T Car Jacks) | wagenheber |
| WGH30 (3T Car Jacks) | wagenheber 3t |

**Tab named Products** — columns `project`, `marketplace`, `country`, `product_id`, and the optional `name` and `source`:

| project | marketplace | country | product_id | name |
|---|---|---|---|---|
| WGH30 (3T Car Jacks) | ebay | DE | 184176192867 | 3T jack |
| WGH30 (3T Car Jacks) | ebay | DE | 297129125625 | 5T jack |
| WGH30 (3T Car Jacks) | otto | DE | S0VCI0CR | 3T jack |
| WGH30 (3T Car Jacks) | kaufland | DE | 428244256 | 3T jack |

Here, 4 products x the keywords above = every keyword checked for every product.

- **`project`** must be spelled the same on both tabs (capital letters don't matter).
  It's what you pick in the dashboard's project dropdown.
- **`source`** (eBay only, optional): leave blank to use eBay's search API (free), or write `web` to
  read the real ebay.de results page through Bright Data (the position a shopper actually sees,
  paid "Anzeige" slots told apart; costs Bright Data credit, needs the Bright Data secrets).
- **Several product IDs per project** are fine, on the same marketplace or on
  different ones. Each appears separately in the dashboard's product dropdown;
  the optional `name` is shown there, e.g. "eBay · DE · 3T jack (184176192867)".
- **`marketplace`**: `ebay`, `otto`, `kaufland` or `temu`. **`country`**: `DE`, `US`, …
- **`product_id`** — the ID from **your own listing's URL**:
  - eBay: `ebay.de/itm/`**`123456789012`**
  - Otto: `otto.de/p/some-title-`**`S0HH60QI`**`/`
  - Kaufland: `kaufland.de/product/`**`428244256`**`/`
  - Temu: `temu.com/goods.html?goods_id=`**`601099512665876`**
- Keywords are shared by all marketplaces in the project, so use words that work
  on each of them.
- Rows still containing `REPLACE_…` are ignored.
- **Cost:** checks per day = products x keywords. 50 keywords for 3 products is
  150 checks, but each keyword is *searched* only once per marketplace and shared
  by all products in it, so requests stay low. Otto/Kaufland searches use your
  Bright Data balance (about 1 request per results page); eBay's are free.
- Renaming a project later starts a new history for it — pick names you'll keep.

**Connect the sheet:**
1. Share the sheet: **Share → General access → Anyone with the link → Viewer.**
2. Click the **Keywords** tab and copy the link from your browser's address bar
   (it ends with `#gid=` and a number). Do the same on the **Products** tab.
3. In GitHub: **Settings → Secrets and variables → Actions → New repository
   secret**, name `TRACKING_SHEET_CSV_URL`. Paste **both links into the value,
   one per line.** (Which link is which is worked out from the column headings.)
   Updating an existing secret works the same way: replace its value.
4. Put one of the links (or the first) in `docs/settings.json` as `"sheet_url"` (the first time, copy
   `docs/settings.example.json` to `docs/settings.json`),
   so the dashboard's **+ Add products & keywords** panel links to the sheet.

A published sheet or any sheet link is readable by anyone who has the link (it only
contains product IDs and keywords, but it isn't private).

**Or use files in the repo instead of a sheet:** copy the examples in `config/examples/` to
`config/keywords.csv` and `config/products.csv`, and edit them (same columns). They're used whenever the secret isn't set.
The older single table (`project,marketplace,country,product_id,keyword`, one
row per product + keyword) also still works, in a sheet or as `config/tracked.csv`.

A new keyword's history starts the first day it is checked — nothing is
backfilled. To check it immediately, run the workflow (step 6).

### 4. eBay (free, official API — the most reliable of the four)
1. https://developer.ebay.com → sign in (any eBay account works) →
   **Application Keys** → create a **Production** keyset (not Sandbox).
2. Add two repo secrets: `EBAY_CLIENT_ID` (App ID) and `EBAY_CLIENT_SECRET`
   (Cert ID).

### 5. Otto, Kaufland and Temu (via your Bright Data account)
- **Otto and Kaufland** use **Web Unlocker API**: in Bright Data, *Web Unlocker
  API → Add* a zone, then add secrets `BRIGHTDATA_API_KEY` and
  `BRIGHTDATA_ZONE` (the zone's name) from its Overview tab.
- **Temu** uses **Browser API** (a different zone type): *Browser API → Add*,
  then one secret `BRIGHTDATA_BROWSER_AUTH` = `username:password` from its
  Overview tab.

### 6. Run it once and check it
Repo **Actions → Track marketplace ranks → Run workflow** (or the dashboard's Sync button once the shared sync service is set up). Expand each
marketplace's step to see what it found, then reload the dashboard.
A green tick doesn't mean every marketplace worked — a marketplace you haven't
set up fails its own step but doesn't stop the others. After that it runs by
itself every day at 06:00 UTC (edit the `cron` line to change that).

## Keeping it up to date (nobody ever enters a token)

**Automatic — nothing to set up.** Every hour (at about 20 minutes past) the
workflow looks at your sheet. If you've added a product or keyword that has never been
checked, it checks just that and saves it; otherwise the run ends in seconds. So
**a new row in the sheet starts tracking within about an hour** (GitHub can start
scheduled runs a little late). Every product is then fully re-checked once a day at
06:00 UTC. A new keyword's history starts when it is first checked; nothing is
backfilled. A marketplace you haven't connected yet (no keys) is ignored by the
hourly pick-up, so it doesn't trigger pointless runs.

**Instant — the ↻ Sync now button.** It runs the full check right now, for anyone who
can open the dashboard, with no token and no GitHub login. Because the dashboard is a
public web page, it can't hold the key that starts GitHub jobs; so an admin sets up a
small shared service **once** (about 10 minutes, free): see `sync-worker/README.md`.
Until that's done, the button just explains the automatic pick-up above, and
there's a link to GitHub's own **Run workflow** page. If someone has already started a
sync, a second click joins it rather than starting another. A keyword is checked
once per day, so syncing again the same day only adds keywords not yet checked.

**GitHub Actions minutes.** Hourly idle runs are short but each is billed as at
least a minute, roughly 700 minutes a month on top of the daily check. Public repos
have no limit; private repos on GitHub's free plan get 2,000 minutes a month
(paid plans get more). To make the pick-up less frequent, just change the `cron:
"20 * * * *"` line in `track-ranks.yml` — e.g. `"20 */3 * * *"` for every three hours.
(If you change the daily `"0 6 * * *"` time instead, change it in the `ONLY_NEW:` line too.) If the sheet
can't be read (not shared as *Anyone with the link: Viewer*), the hourly run fails
and GitHub may email you; fix the sharing and it recovers by itself.

## How much to trust each marketplace

- **eBay** — two ways to read it, per product (the `source` column):
  - **API (default, free):** eBay's search API, exact item-ID match. The position is where the *API*
    lists the listing ("Best Match" order). That is **not guaranteed to equal what a shopper sees on
    ebay.de**: the website adds paid "Anzeige" slots, can personalise results and also shows auctions.
    The API flags paid Promoted Listings, so each row also stores `organic_rank` (position with paid
    results removed) and `promoted`.
  - **`web` (more faithful):** reads the real ebay.de page through Bright Data, like Otto and Kaufland.
    It recognises the "Anzeige" label (eBay writes it backwards in the page text, `egieznA`), so it reports
    both the position a shopper sees (`rank`) and the organic one (`organic_rank`). If your listing appears
    both as an ad and organically, both are recorded. Not verified against live eBay pages while building
    this, so check it with the tool below before relying on it.
  - **If a number looks wrong:** run **Actions → Check an eBay keyword**. It prints eBay's API results
    *and* the real ebay.de page for the keyword, in order, with your listings highlighted (★), so you can
    compare them with your browser line by line. Remember each tracked row follows **one item ID**: if you
    have several listings for the same product, the one you see first may be a different listing.
  - **In the dashboard:** when a project has organic data, a *Count: all results / organic only* switch
    appears next to the period picker; the table, the cards and the export all follow it.
- **Otto** — fetched through Web Unlocker; your product is recognised by the ID
  in its URL, so layout changes don't break it. The matching logic was checked
  against a real otto.de page, but the **pagination page size is an unverified
  guess** (`OFFSET_STEP` in `scripts/otto_rank_tracker.py`).
- **Kaufland** — same approach as Otto, but its URL patterns come from
  third-party documentation and were **never checked against a live page**.
- **Temu** — experimental. Temu loads results with JavaScript and runs
  anti-bot checks that can show a verification page even in a real browser; at
  least one commercial scraping vendor refuses to support Temu keyword search
  for that reason. Expect real failures. The tracker never records a block as
  "not found" — blocked days show as a blue **?** in the grid and are left out of the
  summary numbers.

**For Otto, Kaufland and Temu: before trusting the daily numbers, pick one
keyword whose rank you know by searching yourself, and compare.** If the
tracker disagrees, tell whoever maintains this — it usually means a pagination
or matching detail needs adjusting.

## Troubleshooting
- **I added a keyword and it isn't showing:** it's picked up within about an hour
  (scheduled runs can be late). To check right away, use Sync now or Actions → Run
  workflow. If it still doesn't appear, open the latest run and expand
  *Check whether there is anything to do*: it says how many new keywords it found.
- **Dashboard shows this README / a 404:** Pages folder isn't `/docs` (step 2),
  or the files were uploaded one folder too deep.
- **Dashboard still shows demo data after a run:** open the Actions run and
  check the tracker steps; with nothing valid in the table, nothing is saved.
- **"not found" for every eBay keyword:** check `product_id` is the exact item
  number from the listing URL and that the listing is live on the `country`
  site you chose.
- **A keyword is missing from the dashboard but the run was green:** if eBay (or Otto/Kaufland)
  is slow or drops a request, the tracker retries a few times, then skips that keyword for
  this run without saving a row (so it never shows a false "not found") and tries it again
  on the next run. Look for `! error searching '…'` lines in the step's log.
- **eBay auth error:** secrets must be named exactly `EBAY_CLIENT_ID` /
  `EBAY_CLIENT_SECRET` and be the *Production* keys.
- **"Could not download the tracking sheet" / "returned a web page":** the sheet
  must be shared as *Anyone with the link → Viewer*.

## Previewing the dashboard on your own computer
Opening `docs/index.html` by double-click doesn't work (browsers block it from
reading the data files). Instead, in a terminal inside the `docs` folder run
`python -m http.server 8000` and open http://localhost:8000.

## Finding keyword ideas (optional, eBay only)
`python scripts/ebay_keyword_ideas.py "wagenheber" --country DE` prints
phrases eBay's own search box suggests (seed word + a–z). No volume numbers —
review them and add the good ones to your table yourself.
