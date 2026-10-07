# Marketplace Rank Tracker — Phase 1 (eBay)

A self-hosted, free alternative to DataRova-style rank tracking for
marketplaces DataRova doesn't cover. Organizes tracking into **projects**
(one per product family, e.g. "WGH30 3T Car Jacks"), each with one or more
**items** — a specific marketplace + country listing of that product — and
gives each a DataRova-style Items / Keywords / Ranks / Trends view with a
daily rank heatmap grid, visibility %, average position, and a top-3 count,
each with Daily/Weekly/Monthly grouping.

This is **Phase 1**: eBay only, because eBay has a free official search API
so there's nothing to scrape and nothing that can get blocked. Otto,
Kaufland and Temu don't have this — they need a scraper, which is Phase 2
(see "What's next" below). The data format and dashboard already support
multiple marketplaces per project, so adding those later is just adding
more items to `config/projects.json` and a new tracker script — no rebuild.

## Try the dashboard right now, with demo data

Open `docs/index.html` in this folder in a browser (or wait until you've
set up GitHub Pages, see below) — it ships with sample data for one demo
project so you can see the full interface immediately, before connecting
any real API keys. A banner tells you when you're looking at demo data;
it disappears automatically once real tracked data exists.

## What this does, day to day

1. Every day at 06:00 UTC, GitHub runs `scripts/ebay_rank_tracker.py`.
2. For each project → item → keyword in `config/projects.json`, it
   searches eBay the same way a shopper would, and records the position
   of your listing (or "not found" if it's outside the top 600 results
   checked).
3. It saves the results into `docs/data/ranks.json` and commits that file
   back to the repo.
4. `docs/index.html` — published via GitHub Pages — reads that file and
   renders the project list, the rank grid, and the summary cards.

## One-time setup

### 1. Get free eBay API credentials
1. Go to https://developer.ebay.com and sign in with your normal eBay seller account.
2. Go to **My Account → Application Keys**.
3. Create a keyset for **Production** (not Sandbox).
4. Copy the **Client ID (App ID)** and **Client Secret (Cert ID)** — you'll need both.

### 2. Put this code in a GitHub repo
- Create a new repo (or use an existing one), and add all the files in this
  folder to it, keeping the same folder structure.

### 3. Add your eBay credentials as GitHub Secrets
In the repo: **Settings → Secrets and variables → Actions → New repository secret**
- Add one named `EBAY_CLIENT_ID` with your Client ID
- Add one named `EBAY_CLIENT_SECRET` with your Client Secret

### 4. Fill in your product details
Edit `config/projects.json`. It's a list of **projects**; each project has
a list of **items** (one per marketplace+country you track that product
on). Right now only `"marketplace": "ebay"` items are actually tracked:

- `project_id` / `project_name`: groups items under one product, like
  "WGH30 (3T Car Jacks)" in the dashboard
- `item_key`: any short unique id for this item within the project, e.g. `ebay-DE`
- `ebay_item_id`: **the exact numeric ID of your listing**, from its own
  URL — e.g. `ebay.de/itm/123456789012` → the ID is `123456789012`. This
  is how the script recognizes your exact listing among search results.
  Strongly recommended: it's an exact match, so it can't be confused by
  similar listings and won't break if you edit your title later.
- `ebay_seller_username` / `title_contains`: a fallback used **only** if
  you leave `ebay_item_id` blank — matches by your seller username plus
  words that must appear in the title. Less precise (can be fooled by two
  similar listings from your own account, and breaks if you edit the
  title), but useful if you don't have the item ID handy yet.
- `keywords`: the search terms you want to track
- `country`: which eBay site to search (`DE`, `US`, `GB`, `FR`, `IT`, `ES`, `AT`, `NL`, `PL` — add more in the script if needed)

Add one project object per product family, and one item per
marketplace+country combination you sell it on. Commit the change.

### 5. (Optional) Get keyword ideas
DataRova auto-populates a keyword list with search-volume and conversion
numbers because it's built on licensed Amazon data — nothing free exists
that does that for eBay. What eBay does expose publicly is the autocomplete
suggestions from its own search box, which you can pull with:

```
pip install -r requirements.txt
python scripts/ebay_keyword_ideas.py "wagenheber" --country DE
```

This prints real buyer-typed phrases (no volume numbers, just phrase
ideas) by querying the seed word plus every letter after it
("wagenheber a", "wagenheber b", …), the way eBay keyword-research tools
typically do. It doesn't touch your config — review the output and copy
whichever ones are actually relevant into `keywords` yourself.

### 6. Turn on GitHub Pages
**Settings → Pages** → Source: "Deploy from a branch" → Branch: `main`,
folder: `/docs` → Save. GitHub will give you a URL like
`https://yourname.github.io/your-repo/` — that's your dashboard.

### 7. Run it once manually to test
**Actions tab → "Track eBay ranks" → Run workflow.** Watch it run; if it
succeeds, refresh your GitHub Pages URL and you should see your first data
point. After that it runs automatically every day.

## Troubleshooting
- **"not found" for every keyword:** double check `ebay_seller_username`
  is exactly right, and that `title_contains` words really appear in your
  live listing's title.
- **Workflow fails with an auth error:** re-check the two secrets are
  named exactly `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET` with no extra
  spaces.
- **Nothing shows on the dashboard:** GitHub Pages can take a minute or two
  to update after the first deploy — reload after a short wait.

## What's next (Phase 2+)

**Phase 2 is now underway: Otto and Kaufland trackers are included in this
package.** Neither marketplace has a public search API like eBay's, so
they're built differently — see "Setting up Otto and Kaufland" below.
Temu remains the hardest of the four (heaviest anti-bot defenses) and is
still a later phase; nothing for it is built yet.

### Setting up Otto and Kaufland

Both use **Bright Data's Web Unlocker API** to fetch search-results pages
reliably — Bright Data handles the proxy rotation and anti-bot work, so
neither script has to. This uses your existing Bright Data account.

1. In the Bright Data control panel: **Products → Web Unlocker API →
   Add**. Create a zone (any name, e.g. `web_unlocker1`).
2. Open that zone's **Overview** tab — it shows the zone name and an API
   key.
3. Add two GitHub secrets: `BRIGHTDATA_API_KEY` and `BRIGHTDATA_ZONE`
   (the zone name from step 2, not the key).
4. In `config/projects.json`, add an item with `"marketplace": "otto"` and
   `otto_product_id`, and/or `"marketplace": "kaufland"` and
   `kaufland_product_id` — both example items are already in the shipped
   config, just replace the placeholder IDs.
5. Find your product ID from your own listing's URL:
   - Otto: `otto.de/p/some-title-**S0ECP02L**/` → the ID is `S0ECP02L`
   - Kaufland: `kaufland.de/product/**123456789**/` → the ID is `123456789`

**How matching works, and its real limitation:** both scripts look for
your product's ID appearing in the raw search-results page and count its
position — the same "exact ID" idea as eBay's `ebay_item_id`, just reading
the ID out of the page instead of an API field. This is deliberately
low-maintenance: it survives Otto or Kaufland redesigning their result
tiles, since it never depends on CSS class names. What it needs from you:
the ID has to be exactly right, and if a listing gets relisted under a new
ID, you'll need to update the config.

**Be honest with yourself about two unverified pieces before you rely on
this daily:** the Otto script's page-size guess (`OFFSET_STEP` in
`otto_rank_tracker.py`) was not confirmed against a live paginated
request — only a single page was checked while building this. The
Kaufland script's URL structure is confirmed from consistent third-party
documentation, but wasn't checked against a live page at all. **Run both
scripts manually once** (`python scripts/otto_rank_tracker.py`, same for
Kaufland) for a keyword you already know the rank for by searching
yourself, and check the number it reports actually matches. If it doesn't,
that's a sign the pagination step size or matching needs adjusting —
message me and we'll fix it together rather than trusting it blind.

### Temu (experimental — read this before trusting it)

Temu uses **Bright Data's Browser API** (a different product from Web
Unlocker) instead — Temu's search results only appear after JavaScript
runs in a real browser, which Web Unlocker's plain HTML fetch can't give
you. This connects to a real, remote Chrome instance and drives it with
Playwright (`scripts/temu_rank_tracker.py`).

**Be honest with yourself about the reliability here.** While researching
how to build this, I found that at least one commercial scraping vendor's
own documentation states plainly that Temu keyword search "cannot be
retrieved reliably enough to sell," and refuses to support it at all —
Temu computes a JavaScript-generated header that gates search access and
can trigger a verification/CAPTCHA page even from a real browser. Other
vendors do offer it, so it's not impossible, but that split among
professionals is itself the signal: **expect a real, non-trivial failure
rate**, not the same reliability as eBay, Otto or Kaufland. Treat Temu's
numbers as best-effort and directional rather than solid daily data,
especially at first.

Because of that, the script never records a block as "not found" — those
are two different things, and conflating them would be actively
misleading (a block means "we don't know," not "you're not ranking"). The
dashboard shows blocked days as a distinct blue "?" cell in the grid,
never silently as a dash.

Setup:
1. In the Bright Data control panel: **Products → Browser API → Add**.
   Create a zone (any name).
2. Open that zone's **Overview** tab — it shows a username (already in
   the form `brd-customer-...-zone-...`) and a password.
3. Add one GitHub secret, `BRIGHTDATA_BROWSER_AUTH`, as
   `username:password` (both values from step 2, joined with a colon,
   exactly as shown — not the Web Unlocker key from Otto/Kaufland's setup,
   this is a separate zone type).
4. In `config/projects.json`, add an item with `"marketplace": "temu"` and
   `temu_goods_id` — an example is already in the shipped config.
5. Find your product ID from your listing's URL: `temu.com/goods.html?
   goods_id=**601099512665876**` → the ID is `601099512665876`.

Same advice as Otto/Kaufland applies, doubly here: **run it manually once**
and sanity-check the result before trusting the daily schedule.
