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
import threading
import time
from concurrent.futures import ThreadPoolExecutor
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

MAX_UNREADABLE_IN_A_ROW = 5   # cost safety: stop the run after this many keywords in a row whose page could not be read


class UnreadablePage(RuntimeError):
    """A results page came back but no listings could be read from it (blocked, or eBay changed its layout)."""


class StopRun(Exception):
    """Too many unreadable pages in a row: stop, so a broken layout cannot burn Bright Data credit."""

# One fetch per results page per run, shared by every product checked for the same keyword.
_PAGE_CACHE = {}
_ERRORS = {}   # (keyword, country, page) -> the error a page ended with this run (never retried for other products)
_LOCK = threading.Lock()
_COUNTS = {}   # (keyword, country, page) -> "N Ergebnisse" shown on that page
_AD_STATS = {"pages": 0, "cards": 0, "flagged": 0, "labelled": 0, "ad_elements": 0, "scheme_pages": 0}   # shows whether paid slots are being recognised


def _geo_sequence(country: str):
    """Country settings to try, in order, for one page (up to 3 attempts)."""
    mode = os.environ.get("EBAY_WEB_GEO_MODE", "auto").strip().lower()
    if mode == "country":
        return [country] * 3
    if mode == "none":
        return [None] * 3
    return [country, None, country]


def page_cards(keyword: str, country: str, page: int):
    key = (keyword, country, page)
    if key in _ERRORS:
        raise _ERRORS[key]        # already failed this run: don't pay for the same page again for every product
    if key not in _PAGE_CACHE:
        try:
            _fetch_page(key, keyword, country, page)
        except (UnreadablePage, requests.RequestException, RuntimeError) as e:
            _ERRORS[key] = e
            raise
    return _PAGE_CACHE[key]


def _fetch_page(key, keyword: str, country: str, page: int):
    url = ebay_web.search_url(keyword, country, page)
    # eBay rejects a share of Bright Data's requests at random (HTTP 403, which arrives as an empty page), whether or
    # not a country setting is sent: one check got the 403 with it and the page without it, the next the reverse.
    # So an empty answer is retried up to twice more, alternating between the country setting and none (each retry
    # goes out through a different exit address). EBAY_WEB_GEO_MODE: auto (default), country, or none.
    html = ""
    geos = _geo_sequence(country)
    for attempt, geo in enumerate(geos):
        html = bright_data.fetch_html(url, country=geo)
        if html.strip():
            break
        if attempt < len(geos) - 1:
            time.sleep(5)
    if not html.strip():
        raise UnreadablePage(f"Bright Data answered but the page was EMPTY for {keyword!r}. See the reason under Web Access > "
                             "Event log in your Bright Data account (it lists every request and any error code).")
    cards = ebay_web.parse_cards(html)
    _COUNTS[key] = ebay_web.result_count(html)
    _PAGE_CACHE[key] = cards
    sig = ebay_web.ad_signals(html)
    with _LOCK:
        _AD_STATS["pages"] += 1
        _AD_STATS["cards"] += len(cards)
        _AD_STATS["flagged"] += sum(1 for c in cards if c["sponsored"])
        _AD_STATS["labelled"] += sum(1 for c in cards if c["labelled"])
        _AD_STATS["ad_elements"] += sig["ad_elements"]
        _AD_STATS["scheme_pages"] += 1 if sig["scheme"] else 0


def _stop_message():
    print(f"  !! Stopping the eBay website run: {MAX_UNREADABLE_IN_A_ROW} keywords in a row could not be read or timed out. "
          "Stopping here so a blocked page or a changed eBay layout cannot keep spending Bright Data credit. "
          "Run 'Check an eBay keyword' to see what the page looks like, then tell whoever maintains this.", file=sys.stderr)


def _workers() -> int:
    """How many keyword pages to request at the same time (1 = one after another). Default 3."""
    try:
        return max(1, min(8, int(os.environ.get("EBAY_WEB_WORKERS", "3"))))
    except ValueError:
        return 3


def prefetch(pairs):
    """
    Request page 1 for many keywords at once. Each Bright Data request takes about 30 s, so one after another is slow
    (78 keywords ~ 36 min); a few at a time is several times faster and costs the same number of requests.
    Results land in the caches; the normal loop then finds them there. If MAX_UNREADABLE_IN_A_ROW pages in a row fail
    (in the order they finish), no new requests are started. Returns True if that safety stop fired.
    """
    workers = _workers()
    if workers <= 1 or len(pairs) < 2:
        return False
    state = {"streak": 0, "stop": False}

    def job(pair):
        kw, ctry = pair
        key = (kw, ctry, 1)
        if state["stop"]:
            _ERRORS[key] = UnreadablePage(f"skipped {kw!r}: too many pages in a row could not be read")
            return
        try:
            page_cards(kw, ctry, 1)
            with _LOCK:
                state["streak"] = 0
        except (requests.RequestException, RuntimeError) as e:
            print(f"  ! error searching '{kw}': {e}", file=sys.stderr)
            _ERRORS[key] = e
            with _LOCK:
                state["streak"] += 1
                if state["streak"] >= MAX_UNREADABLE_IN_A_ROW:
                    state["stop"] = True

    with ThreadPoolExecutor(max_workers=workers) as pool:
        list(pool.map(job, pairs))
    return state["stop"]


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
    print(f"eBay website tracker, script files version {config_loader.VERSION}")
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
    # Hourly pick-ups also retry keywords that failed in today's full run, but only after that run has happened
    # (some website row exists for today) and only in the 4 hours that follow its first result.
    retry_missing = only_new and ebay_web.retry_window_open(history)

    def due(key):
        if key in seen_today:
            return False
        return not (only_new and key in known_any and not retry_missing)

    # which keyword pages are needed at all, in sheet order, so they can be requested several at a time
    pairs, seen_pairs = [], set()
    for project in projects:
        for item in project.get("items", []):
            if item.get("marketplace") != "ebay" or item.get("source") != "web" or not item.get("ebay_item_id"):
                continue
            for keyword in item.get("keywords", []):
                if due((project["project_id"], item["item_key"], keyword)) and (keyword, item.get("country", "DE")) not in seen_pairs:
                    seen_pairs.add((keyword, item.get("country", "DE")))
                    pairs.append((keyword, item.get("country", "DE")))
    prefetched = len(pairs) >= 2 and _workers() > 1
    prefetch_stopped = prefetch(pairs) if prefetched else False

    unreadable_in_a_row = 0
    counted = set()          # keywords already counted in the current streak of failures (several products share one keyword)
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
                    if not due(key):
                        continue
                    try:
                        found = find_rank_detail(keyword, country, target_id)
                    except UnreadablePage as e:
                        if not prefetched and keyword not in counted:   # (prefetching already reported and counted these)
                            print(f"  ! error searching '{keyword}': {e}", file=sys.stderr)
                            counted.add(keyword)
                            unreadable_in_a_row += 1
                            if unreadable_in_a_row >= MAX_UNREADABLE_IN_A_ROW:
                                raise StopRun()
                        continue
                    except (requests.RequestException, RuntimeError) as e:
                        if not prefetched and keyword not in counted:
                            print(f"  ! error searching '{keyword}': {e}", file=sys.stderr)
                            if isinstance(e, (requests.Timeout, requests.ConnectionError)):
                                # Bright Data is not answering: count it like an unreadable page, so a slow or
                                # unavailable service stops the run quickly instead of waiting out every keyword.
                                counted.add(keyword)
                                unreadable_in_a_row += 1
                                if unreadable_in_a_row >= MAX_UNREADABLE_IN_A_ROW:
                                    raise StopRun()
                        continue
                    unreadable_in_a_row = 0
                    counted.clear()
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
                        "item_sku": item.get("sku"),
                        "title": None,
                        "results_scanned": found["results_scanned"],
                        "page_results": _COUNTS.get((keyword, country, 1)),   # "N Ergebnisse" eBay shows for the keyword
                    })
                    extra = ""
                    if found["rank"] is not None:
                        extra = f" (organic {found['organic_rank']})" if found["organic_rank"] is not None else " (only as an ad)"
                        if found["promoted"] and found["organic_rank"] is not None:
                            extra += f" [also an ad at {found['ad_rank']}]"
                    print(f"  [{project['project_name']} / {item_key}] {keyword!r} -> rank {found['rank']}{extra}  [website]")
    except StopRun:
        _stop_message()
    finally:
        save_json(DATA_PATH, history)
    if prefetch_stopped:
        _stop_message()
    s = _AD_STATS
    if s["pages"]:
        print(f"Page reading summary: {s['pages']} page(s), {s['cards']} listings read, {s['flagged']} flagged as paid ads "
              f"(\"Anzeige\"), {s['cards'] - s['flagged']} organic; ad-label elements found: {s['ad_elements']}.")
        st = bright_data.STATS
        if st["requests"] or st["timeouts"]:
            avg = st["seconds"] / max(1, st["requests"] + st["timeouts"])
            print(f"Bright Data timing: {st['requests']} answer(s), {st['timeouts']} timeout(s), about {avg:.0f} s per request.")
        if s["scheme_pages"] and s["cards"] >= 10 and s["labelled"] < 0.5 * s["cards"]:
            print(f"  !! Only {s['labelled']} of {s['cards']} listings had a readable ad label, so eBay may have changed its "
                  "page layout and organic ranks may be wrong. Run 'Check an eBay keyword' and tell whoever maintains this.", file=sys.stderr)
    print(f"Saved {len(history)} total rows to {DATA_PATH}")


if __name__ == "__main__":
    main()
