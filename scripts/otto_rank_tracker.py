"""
Otto.de keyword rank tracker.

Otto has no public search API, so unlike eBay this goes through Bright
Data's Web Unlocker (see bright_data.py) to fetch the actual search-results
page, then finds your product's position in it.

How matching works: every Otto product page URL ends in a stable ID right
before the trailing slash, e.g.
    https://www.otto.de/p/some-product-title-S0ECP02L/
That ID (confirmed against a live otto.de search page while building this)
is what identifies "your" listing — not the page's CSS/HTML structure,
which changes often and would make a class-name-based scraper fragile.
This script instead just looks for that ID pattern anywhere in the raw
HTML, in the order it appears, and counts position from there. It's a
deliberately low-maintenance approach: Otto can redesign its result tiles
completely and this still works, as long as product URLs keep this shape.

Products tab of the tracking sheet, per Otto product:
    product_id: the ID from your listing's own URL, e.g. "S0ECP02L"

Caveat: pagination uses Otto's "?o=" offset parameter (confirmed from
observed search-result URLs), but the exact page size wasn't verified
against a live paginated request while building this — the OFFSET_STEP
below is a reasonable starting guess, not a confirmed value. If ranks look
consistently truncated (your product never found despite being on Otto),
try adjusting OFFSET_STEP, or check a page 2/3 URL manually to see the
real per-page count.

Requires (see README.md):
    BRIGHTDATA_API_KEY, BRIGHTDATA_ZONE
"""

import json
import os
import re
import sys
import urllib.parse
from datetime import date, datetime, timezone
from pathlib import Path

import bright_data
import config_loader
import requests

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "docs" / "data" / "ranks.json"

SEARCH_URL = "https://www.otto.de/suche/{query}/?o={offset}"

OFFSET_STEP = 60   # unverified guess at results-per-page, see caveat above
MAX_PAGES = 5       # scans up to OFFSET_STEP * MAX_PAGES results

# Matches the trailing product ID in an Otto product URL, e.g. the
# "S0ECP02L" in ".../p/some-slug-S0ECP02L/". IDs observed so far start
# with an uppercase letter followed by alphanumerics.
PRODUCT_ID_RE = re.compile(r"/p/[\w-]+-([A-Z][A-Za-z0-9]{4,14})/")


def extract_ordered_product_ids(html: str) -> list[str]:
    """Return product IDs in the order they first appear on the page."""
    seen = set()
    ordered = []
    for match in PRODUCT_ID_RE.finditer(html):
        pid = match.group(1)
        if pid not in seen:
            seen.add(pid)
            ordered.append(pid)
    return ordered


# One fetch per results page per run, shared by every product checked for the
# same keyword (a page costs a Bright Data request, so never fetch it twice).
_PAGE_CACHE = {}


def _page_ids(url: str, country: str) -> list[str]:
    key = (url, country)
    if key not in _PAGE_CACHE:
        _PAGE_CACHE[key] = extract_ordered_product_ids(bright_data.fetch_html(url, country=country))
    return _PAGE_CACHE[key]


def find_rank(keyword: str, target_product_id: str, country: str):
    query = urllib.parse.quote(keyword)
    all_ids: list[str] = []
    for page in range(MAX_PAGES):
        offset = page * OFFSET_STEP
        url = SEARCH_URL.format(query=query, offset=offset)
        ids = _page_ids(url, country)
        if not ids:
            break
        all_ids.extend(ids)
        if target_product_id in all_ids:
            break

    # De-dupe while preserving order, in case pages overlap
    seen = set()
    ordered = []
    for pid in all_ids:
        if pid not in seen:
            seen.add(pid)
            ordered.append(pid)

    if target_product_id in ordered:
        return ordered.index(target_product_id) + 1
    return None


def load_json(path: Path, default):
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return default


def save_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def main():
    projects = config_loader.load_projects()
    history = load_json(DATA_PATH, [])
    today = date.today().isoformat()
    seen_today = {
        (r["project_id"], r["item_key"], r["keyword"])
        for r in history if r["date"] == today
    }

    # ONLY_NEW=1 (the hourly pick-up run): only check keywords that have never
    # been checked before, i.e. products/keywords added since the last run.
    only_new = os.environ.get("ONLY_NEW") == "1"
    known_any = {(r["project_id"], r["item_key"], r["keyword"]) for r in history}

    try:
        for project in projects:
            project_id = project["project_id"]
            project_name = project["project_name"]

            for item in project.get("items", []):
                if item.get("marketplace") != "otto":
                    continue

                item_key = item["item_key"]
                country = item.get("country", "DE")
                target_id = item.get("otto_product_id")
                if not target_id:
                    print(f"  ! skipping {item_key}: no otto_product_id set", file=sys.stderr)
                    continue

                for keyword in item.get("keywords", []):
                    if (project_id, item_key, keyword) in seen_today or (
                        only_new and (project_id, item_key, keyword) in known_any
                    ):
                        continue
                    try:
                        rank = find_rank(keyword, target_id, country)
                    except requests.RequestException as e:
                        print(f"  ! error searching '{keyword}': {e}", file=sys.stderr)
                        continue

                    row = {
                        "date": today,
                        "checked_at": datetime.now(timezone.utc).isoformat(),
                        "project_id": project_id,
                        "project_name": project_name,
                        "item_key": item_key,
                        "marketplace": "otto",
                        "country": country,
                        "keyword": keyword,
                        "rank": rank,
                        "item_id": target_id,
                    "item_label": item.get("label"),
                        "title": None,
                        "results_scanned": OFFSET_STEP * MAX_PAGES,
                    }
                    history.append(row)
                    print(f"  [{project_name} / {item_key}] {keyword!r} -> rank {rank}")

    finally:
        save_json(DATA_PATH, history)
    print(f"Saved {len(history)} total rows to {DATA_PATH}")


if __name__ == "__main__":
    main()
