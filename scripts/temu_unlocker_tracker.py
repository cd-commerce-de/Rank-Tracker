"""
Temu keyword rank tracker, Web Unlocker mode: Temu's German search page is read through a dedicated Bright Data Web Unlocker
zone (BRIGHTDATA_ZONE_TEMU, Premium domains switched on) with browser rendering. No Playwright, no Browser API.

What a test on the German storefront showed: Temu answers many requests with "page_block" (an empty answer that Bright Data does
NOT bill) and others with the full results page (billed once, at the standard rate plus the premium surcharge). So a keyword is
simply tried again, up to TEMU_ATTEMPTS times (default 4), each time from a new German exit address. Failed attempts cost no
money, only time (about a minute each).

What one visit reaches: a results page of about 24 listings (Temu loads more only when you scroll, which this mode does not
do). A product beyond that is recorded as "not found in the top N" with N = the listings actually read, never as a plain
"not found". A keyword that could not be read at all after every attempt is recorded as BLOCKED (a "?" in the dashboard), so
"Temu did not let us look today" is never confused with "this product does not rank".

Settings (environment): TEMU_ATTEMPTS = tries per keyword (default 4, 1 to 8); BRIGHTDATA_ZONE_TEMU = the zone; BRIGHTDATA_API_KEY.
Products tab: product_id = the goods_id from the listing's address (goods.html?...goods_id=NNN), marketplace = temu, country = DE.
"""

import os
import sys
import urllib.parse
from datetime import date, datetime, timezone
from pathlib import Path

import bright_data
import config_loader
import history_store
import page_savings as ps
import temu_rank_tracker as classic

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "docs" / "data" / "ranks.json"

def attempts() -> int:
    return ps.env_int("TEMU_ATTEMPTS", 4, 1, 8)
STOP_AFTER_BLOCKED = 5          # keywords in a row that could not be read at all: stop the run, Temu is not answering today

_CACHE = {}                     # (region, keyword) -> list of goods ids   (one read per keyword per run, shared by its products)
_FAILED = {}                    # (region, keyword) -> why it could not be read


def search_url(keyword: str, region: str) -> str:
    return f"https://www.temu.com/{region.lower()}/search_result.html?search_key={urllib.parse.quote(keyword)}"


def read_goods_ids(keyword: str, region: str):
    """Goods ids on the results page in order. Raises ps.PolicyRefused / ps.EmptyPage."""
    key = (region, keyword)
    if key in _FAILED:
        raise _FAILED[key]
    if key in _CACHE:
        return _CACHE[key]
    url = search_url(keyword, region)
    problem, tries = "no answer", attempts()
    for attempt in range(1, tries + 1):
        html = bright_data.fetch_html(url, country=region.lower(), render=True)
        msg = ps.refusal(html)
        if msg:
            _FAILED[key] = ps.PolicyRefused(msg)
            raise _FAILED[key]                                       # account policy: another try cannot change it
        ids = classic.extract_ordered_goods_ids(html) if html.strip() else []
        if ids:
            _CACHE[key] = ids
            return ids
        problem = f"empty answer ({len(html)} characters)" if not html.strip() else f"a page without product IDs ({len(html):,} characters)"
    _FAILED[key] = ps.EmptyPage(f"{problem} on all {tries} attempts for {url}")
    raise _FAILED[key]


def main():
    projects = config_loader.load_projects()
    history = history_store.load(DATA_PATH)
    today = date.today().isoformat()
    seen_today = {(r["project_id"], r["item_key"], r["keyword"]) for r in history if r["date"] == today}
    only_new = os.environ.get("ONLY_NEW") == "1"
    known_any = {(r["project_id"], r["item_key"], r["keyword"]) for r in history}
    blocked_in_row, reads, saved = 0, 0, 0
    try:
        for project in projects:
            for item in project.get("items", []):
                if item.get("marketplace") != "temu":
                    continue
                target = item.get("temu_goods_id")
                if not target:
                    print(f"  ! skipping {item['item_key']}: no temu_goods_id set", file=sys.stderr)
                    continue
                region = (item.get("country") or "DE").strip() or "DE"
                for keyword in item.get("keywords", []):
                    key = (project["project_id"], item["item_key"], keyword)
                    if key in seen_today or (only_new and key in known_any):
                        continue
                    fresh = (region, keyword) not in _CACHE and (region, keyword) not in _FAILED
                    try:
                        ids = read_goods_ids(keyword, region)
                        blocked = False
                    except ps.PolicyRefused as e:
                        print(f"  !! Bright Data refuses temu for your account, so nothing was read or saved: {e}", file=sys.stderr)
                        return
                    except (ps.EmptyPage, Exception) as e:
                        ids, blocked = [], True
                        if fresh:
                            print(f"  ! temu '{keyword}': could not be read ({e})", file=sys.stderr)
                    if fresh:
                        reads += 1
                        blocked_in_row = blocked_in_row + 1 if blocked else 0
                    rank = None if blocked or target not in ids else ids.index(target) + 1
                    history.append({
                        "date": today, "checked_at": datetime.now(timezone.utc).isoformat(),
                        "project_id": project["project_id"], "project_name": project["project_name"], "item_key": item["item_key"],
                        "marketplace": "temu", "country": region.upper(), "keyword": keyword,
                        "rank": rank, "blocked": blocked, "item_id": target, "item_label": item.get("label"), "item_sku": item.get("sku"),
                        "title": None, "results_scanned": None if blocked else len(ids),
                    })
                    saved += 1
                    status = "BLOCKED" if blocked else (f"rank {rank}" if rank else f"not in the top {len(ids)}")
                    print(f"  [{project['project_name']} / {item['item_key']}] {keyword!r} -> {status}")
                    if blocked_in_row >= STOP_AFTER_BLOCKED:
                        print(f"  !! temu: {STOP_AFTER_BLOCKED} keywords in a row could not be read; stopping the Temu run for today.", file=sys.stderr)
                        return
    finally:
        print(f"temu (Web Unlocker): {reads} keyword(s) read, {saved} reading(s) saved, up to {attempts()} attempt(s) per keyword (failed attempts are not billed).")
        history_store.save_and_report(DATA_PATH, history)


if __name__ == "__main__":
    main()
