"""
Kaufland.de keyword rank tracker.

Same approach as otto_rank_tracker.py: no public search API, so this goes
through Bright Data's Web Unlocker to fetch the search-results page, then
finds your product's position by looking for its product URL pattern.

Kaufland product URLs are simpler than Otto's — a plain numeric ID:
    https://www.kaufland.de/product/123456789/
This script's confidence level is slightly different from the Otto
tracker's: the Otto version was checked against a real, live-fetched
search page while building this. Kaufland's URL patterns
(search: "kaufland.de/s/?search_value=...", product: "/product/<id>/")
are confirmed from Kaufland's own site structure and consistent, independent
third-party scraper documentation, but weren't verified against a live
paginated search result the way Otto's was. Test this one manually before
trusting it — run scripts/kaufland_rank_tracker.py by hand once, for a
keyword you know your product ranks for, and check the number it reports
against what you see searching on kaufland.de yourself.

Config (config/projects.json), per Kaufland item:
    "kaufland_product_id": the numeric ID from your listing's own URL,
    e.g. "123456789" from "kaufland.de/product/123456789/"

Requires (see README.md):
    BRIGHTDATA_API_KEY, BRIGHTDATA_ZONE
"""

import json
import re
import sys
import urllib.parse
from datetime import date, datetime, timezone
from pathlib import Path

import bright_data
import requests

ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / "config" / "projects.json"
DATA_PATH = ROOT / "docs" / "data" / "ranks.json"

SEARCH_URL = "https://www.kaufland.de/s/?search_value={query}&page={page}"

MAX_PAGES = 8  # unverified page size; see module docstring caveat

# Matches Kaufland's plain numeric product ID, e.g. the "123456789" in
# "https://www.kaufland.de/product/123456789/"
PRODUCT_ID_RE = re.compile(r"/product/(\d{6,12})/")


def extract_ordered_product_ids(html: str) -> list[str]:
    seen = set()
    ordered = []
    for match in PRODUCT_ID_RE.finditer(html):
        pid = match.group(1)
        if pid not in seen:
            seen.add(pid)
            ordered.append(pid)
    return ordered


def find_rank(keyword: str, target_product_id: str, country: str):
    query = urllib.parse.quote(keyword)
    all_ids: list[str] = []
    for page in range(1, MAX_PAGES + 1):
        url = SEARCH_URL.format(query=query, page=page)
        html = bright_data.fetch_html(url, country=country)
        ids = extract_ordered_product_ids(html)
        if not ids:
            break
        all_ids.extend(ids)
        if target_product_id in all_ids:
            break

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
    projects = load_json(CONFIG_PATH, [])
    history = load_json(DATA_PATH, [])
    today = date.today().isoformat()
    seen_today = {
        (r["project_id"], r["item_key"], r["keyword"])
        for r in history if r["date"] == today
    }

    for project in projects:
        project_id = project["project_id"]
        project_name = project["project_name"]

        for item in project.get("items", []):
            if item.get("marketplace") != "kaufland":
                continue

            item_key = item["item_key"]
            country = item.get("country", "DE")
            target_id = item.get("kaufland_product_id")
            if not target_id:
                print(f"  ! skipping {item_key}: no kaufland_product_id set", file=sys.stderr)
                continue

            for keyword in item.get("keywords", []):
                if (project_id, item_key, keyword) in seen_today:
                    continue
                try:
                    rank = find_rank(keyword, target_id, country)
                except requests.HTTPError as e:
                    print(f"  ! error searching '{keyword}': {e}", file=sys.stderr)
                    continue

                row = {
                    "date": today,
                    "checked_at": datetime.now(timezone.utc).isoformat(),
                    "project_id": project_id,
                    "project_name": project_name,
                    "item_key": item_key,
                    "marketplace": "kaufland",
                    "country": country,
                    "keyword": keyword,
                    "rank": rank,
                    "item_id": target_id,
                    "title": None,
                    "results_scanned": None,
                }
                history.append(row)
                print(f"  [{project_name} / {item_key}] {keyword!r} -> rank {rank}")

    save_json(DATA_PATH, history)
    print(f"Saved {len(history)} total rows to {DATA_PATH}")


if __name__ == "__main__":
    main()
