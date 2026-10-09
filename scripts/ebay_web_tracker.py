"""
eBay keyword rank tracker, WEBSITE version.

Reads the real ebay.de (or .at/.com/…) search page through Bright Data's Web Unlocker and
finds your listing in it, exactly as a shopper would see it. Compared with the API version
(ebay_rank_tracker.py) it:
  * gives the position shoppers actually see,
  * tells paid "Anzeige" slots from organic ones (see ebay_web.py), so `organic_rank` is the
    position among organic listings only.

Used for products whose `source` column on the Products tab is `web`. Everything else about
the row (project, product ID, keywords) is the same, and the history stays in the same place.

Requires: BRIGHTDATA_API_KEY and BRIGHTDATA_ZONE (a Web Unlocker zone), like Otto/Kaufland.
Cost: one Bright Data request per results page (page 1 only by default), shared by all products
checked for a keyword.
"""

import json
import os
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import requests

import bright_data
import config_loader
import ebay_web

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "docs" / "data" / "ranks.json"

def _pages_setting() -> int:
    """How many results pages to read per keyword (each page is one paid Bright Data request).
    Default 1 = the first page only (up to 240 listings if eBay honours the page size).
    Change it with the EBAY_WEB_MAX_PAGES setting in .github/workflows/track-ranks.yml."""
    try:
        return max(1, min(5, int(os.environ.get("EBAY_WEB_MAX_PAGES", "1"))))
    except ValueError:
        return 1


MAX_PAGES = _pages_setting()
MAX_UNREADABLE_IN_A_ROW = 3   # cost safety: stop the run after this many keywords in a row whose page could not be read


class UnreadablePage(RuntimeError):
    """A results page came back but no listings could be read from it (blocked, or eBay changed its layout)."""


class StopRun(Exception):
    """Too many unreadable pages in a row: stop, so a broken layout cannot burn Bright Data credit."""

# One fetch per results page per run, shared by every product checked for the same keyword.
_PAGE_CACHE = {}


def page_cards(keyword: str, country: str, page: int):
    key = (keyword, country, page)
    if key not in _PAGE_CACHE:
        html = bright_data.fetch_html(ebay_web.search_url(keyword, country, page), country=country)
        _PAGE_CACHE[key] = ebay_web.parse_cards(html)
    return _PAGE_CACHE[key]


def find_rank_detail(keyword: str, country: str, target_id: str):
    """Scan result pages until the listing is found organically (or the pages run out)."""
    cards = []
    prev_ids = None
    for page in range(1, MAX_PAGES + 1):
        new = page_cards(keyword, country, page)
        ids = [c["id"] for c in new]
        if page > 1 and ids == prev_ids:
            break   # eBay served the same page again (past the last page): don't count it twice
        prev_ids = ids
        if not new:
            if page == 1:
                # No listings parsed on the first page: blocked, or the page layout changed.
                # Raise, so no false "not found" is saved and the keyword is retried next run.
                raise UnreadablePage(f"no listings could be read from the eBay page for {keyword!r} (blocked, or eBay changed its layout)")
            break
        cards = cards + new if page > 1 else list(new)
        found = ebay_web.locate(cards, target_id)
        if found["organic_rank"] is not None:
            break
    found = ebay_web.locate(cards, target_id)
    found["results_scanned"] = len(cards)
    return found


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
    if not os.environ.get("BRIGHTDATA_API_KEY") or not os.environ.get("BRIGHTDATA_ZONE"):
        projects_with_web = any(i.get("source") == "web" and i.get("marketplace") == "ebay"
                                for p in config_loader.load_projects() for i in p.get("items", []))
        if projects_with_web:
            print("ERROR: some eBay products are set to source=web, which needs the Bright Data secrets "
                  "BRIGHTDATA_API_KEY and BRIGHTDATA_ZONE (a Web Unlocker zone) in the repo's "
                  "Settings -> Secrets -> Actions. They are not set, so nothing was checked.", file=sys.stderr)
            sys.exit(1)
        return
    projects = config_loader.load_projects()
    history = load_json(DATA_PATH, [])
    today = date.today().isoformat()
    # Only rows already made by THIS tracker count as "checked today". A row made earlier today by the
    # eBay API (before the product was switched to source=web) is replaced by the website result.
    seen_today = {(r["project_id"], r["item_key"], r["keyword"]) for r in history if r["date"] == today and r.get("source") == "web"}
    only_new = os.environ.get("ONLY_NEW") == "1"
    known_any = {(r["project_id"], r["item_key"], r["keyword"]) for r in history}

    unreadable_in_a_row = 0
    try:
        for project in projects:
            for item in project.get("items", []):
                if item.get("marketplace") != "ebay" or item.get("source") != "web":
                    continue
                item_key, country = item["item_key"], item.get("country", "DE")
                target_id = item.get("ebay_item_id")
                if not target_id:
                    print(f"  ! skipping {item_key}: no item ID", file=sys.stderr)
                    continue
                for keyword in item.get("keywords", []):
                    key = (project["project_id"], item_key, keyword)
                    if key in seen_today or (only_new and key in known_any):
                        continue
                    try:
                        found = find_rank_detail(keyword, country, target_id)
                    except UnreadablePage as e:
                        print(f"  ! error searching '{keyword}': {e}", file=sys.stderr)
                        unreadable_in_a_row += 1
                        if unreadable_in_a_row >= MAX_UNREADABLE_IN_A_ROW:
                            raise StopRun()
                        continue
                    except (requests.RequestException, RuntimeError) as e:
                        print(f"  ! error searching '{keyword}': {e}", file=sys.stderr)
                        continue
                    unreadable_in_a_row = 0
                    history = [r for r in history if not (r["date"] == today and r.get("source") != "web"
                               and (r["project_id"], r["item_key"], r["keyword"]) == key)]
                    history.append({
                        "date": today,
                        "checked_at": datetime.now(timezone.utc).isoformat(),
                        "project_id": project["project_id"],
                        "project_name": project["project_name"],
                        "item_key": item_key,
                        "marketplace": "ebay",
                        "source": "web",
                        "country": country,
                        "keyword": keyword,
                        "rank": found["rank"],
                        "organic_rank": found["organic_rank"],
                        "promoted": found["promoted"],
                        "ad_rank": found["ad_rank"],
                        "item_id": target_id,
                        "item_label": item.get("label"),
                        "title": None,
                        "results_scanned": found["results_scanned"],
                    })
                    extra = ""
                    if found["rank"] is not None:
                        extra = f" (organic {found['organic_rank']})" if found["organic_rank"] is not None else " (only as an ad)"
                        if found["promoted"] and found["organic_rank"] is not None:
                            extra += f" [also an ad at {found['ad_rank']}]"
                    print(f"  [{project['project_name']} / {item_key}] {keyword!r} -> rank {found['rank']}{extra}  [website]")
    except StopRun:
        print(f"  !! Stopping the eBay website run: {MAX_UNREADABLE_IN_A_ROW} keywords in a row could not be read. "
              "Stopping here so a blocked page or a changed eBay layout cannot keep spending Bright Data credit. "
              "Run 'Check an eBay keyword' to see what the page looks like, then tell whoever maintains this.", file=sys.stderr)
    finally:
        save_json(DATA_PATH, history)
    print(f"Saved {len(history)} total rows to {DATA_PATH}")


if __name__ == "__main__":
    main()
