"""
Temu keyword rank tracker, Web Unlocker mode: Temu's German search page is read through a dedicated Bright Data Web Unlocker
zone (BRIGHTDATA_ZONE_TEMU, Premium domains switched on) with browser rendering. No Playwright, no Browser API.

What a test on the German storefront showed: Temu answers many requests with "page_block" (an empty answer that Bright Data does
NOT bill) and others with the full results page (billed once, at the standard rate plus the premium surcharge). So a keyword is
simply tried again, up to TEMU_ATTEMPTS times (default 6), each time from a new German exit address. Failed attempts cost no
money, only time (about a minute each).

What one visit reaches: a results page of about 24 listings (Temu loads more only when you scroll, which this mode does not
do). A product beyond that is recorded as "not found in the top N" with N = the listings actually read, never as a plain
"not found". A keyword that could not be read at all after every attempt is recorded as BLOCKED (a "?" in the dashboard), so
"Temu did not let us look today" is never confused with "this product does not rank".

Settings (environment): TEMU_ATTEMPTS = tries per keyword (default 6, 1 to 12); TEMU_WORKERS = keywords read at the same time (default 4);
TEMU_STOP_AFTER = keywords in a row that could not be read before the run stops (default 12); BRIGHTDATA_ZONE_TEMU = the zone; BRIGHTDATA_API_KEY.
Products tab: product_id = the goods_id from the listing's address (goods.html?...goods_id=NNN), marketplace = temu, country = DE.
"""

import os
import sys
import urllib.parse
import threading
from concurrent.futures import ThreadPoolExecutor
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
    return ps.env_int("TEMU_ATTEMPTS", 6, 1, 12)
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
    # a reading that was BLOCKED today does not count as done: a second run the same day tries it again (and replaces it)
    done_today = {(r["project_id"], r["item_key"], r["keyword"]) for r in history if r["date"] == today and not r.get("blocked")}
    only_new = os.environ.get("ONLY_NEW") == "1"
    known_any = {(r["project_id"], r["item_key"], r["keyword"]) for r in history}

    # One read per (storefront, keyword), shared by every product that needs it: a keyword that works serves all products at once.
    work = {}
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
                if key in done_today or (only_new and key in known_any):
                    continue
                work.setdefault((region, keyword), []).append((project, item, target))
    todo = list(work.items())
    workers, stop_after = ps.env_int("TEMU_WORKERS", 4, 1, 8), ps.env_int("TEMU_STOP_AFTER", 12, 1, 200)

    stop = threading.Event()                # set when Temu is clearly not answering (or Bright Data refuses): workers stop starting new keywords
    lock = threading.Lock()
    streak = {"n": 0}                       # keywords in a row (in the order they finish) that could not be read

    def read(rk):
        if stop.is_set():
            return "skipped", ""
        try:
            ids = read_goods_ids(rk[1], rk[0])
            with lock:
                streak["n"] = 0
            return "ok", ids
        except ps.PolicyRefused as e:
            stop.set()
            return "refused", str(e)
        except Exception as e:
            with lock:
                streak["n"] += 1
                if streak["n"] >= stop_after:
                    stop.set()
            return "blocked", str(e)

    read_ok = read_blocked = saved = skipped = 0
    try:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = [pool.submit(read, rk) for rk, _ in todo]
            for (rk, owners), fut in zip(todo, futures):
                status, payload = fut.result()
                if status == "refused":
                    print(f"  !! Bright Data refuses temu for your account, so nothing more was read: {payload}", file=sys.stderr)
                    continue
                if status == "skipped":
                    skipped += 1
                    continue
                blocked = status == "blocked"
                ids = [] if blocked else payload
                if blocked:
                    read_blocked += 1
                    print(f"  ! temu '{rk[1]}': could not be read ({payload})", file=sys.stderr)
                else:
                    read_ok += 1
                for project, item, target in owners:
                    key = (project["project_id"], item["item_key"], rk[1])
                    history[:] = [r for r in history if not (r["date"] == today and r.get("blocked") and (r["project_id"], r["item_key"], r["keyword"]) == key)]
                    rank = None if blocked or target not in ids else ids.index(target) + 1
                    history.append({
                        "date": today, "checked_at": datetime.now(timezone.utc).isoformat(),
                        "project_id": project["project_id"], "project_name": project["project_name"], "item_key": item["item_key"],
                        "marketplace": "temu", "country": rk[0].upper(), "keyword": rk[1],
                        "rank": rank, "blocked": blocked, "item_id": target, "item_label": item.get("label"), "item_sku": item.get("sku"),
                        "title": None, "results_scanned": None if blocked else len(ids),
                    })
                    saved += 1
                    print(f"  [{project['project_name']} / {item['item_key']}] {rk[1]!r} -> " + ("BLOCKED" if blocked else (f"rank {rank}" if rank else f"not in the top {len(ids)}")))
        if skipped and streak["n"] >= stop_after:
            print(f"  !! temu: {stop_after} keywords in a row could not be read, so {skipped} keyword(s) were not tried today. "
                  "Running the workflow again retries the blocked ones and tries the rest.", file=sys.stderr)
    finally:
        print(f"temu (Web Unlocker): {read_ok} keyword(s) read, {read_blocked} blocked, {skipped} not tried, {saved} reading(s) saved; up to {attempts()} attempt(s) per keyword, "
              f"{workers} at a time (failed attempts are not billed).")
        history_store.save_and_report(DATA_PATH, history)


if __name__ == "__main__":
    main()
