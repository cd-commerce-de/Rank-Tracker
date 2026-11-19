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
TEMU_STOP_AFTER = keywords in a row that could not be read, BEFORE any keyword has been read, after which the run stops because Temu is
not answering at all (default 12); TEMU_STOP_AFTER_LATER = the same once at least one keyword was read (default 60: a normal run
fails most keywords, so a streak of 12 is just bad luck); TEMU_MAX_MINUTES = time budget after which no new keyword is started
(default 15: a short slice when the tracker runs inside the main workflow, so that workflow's eBay data is committed promptly;
the scheduled "Track Temu only" workflow passes 120); BRIGHTDATA_ZONE_TEMU = the zone; BRIGHTDATA_API_KEY.
Keywords are worked through ROUND-ROBIN across projects (every project's first keyword, then every project's second, ...), so a run
that ends early still covers every project instead of only the first ones in the sheet. A Bright Data error answer (502, 503, 504, 429)
or a timeout counts as one failed attempt, exactly like an empty answer, and the keyword is tried again.
Products tab: product_id = the goods_id from the listing's address (goods.html?...goods_id=NNN), marketplace = temu, country = DE.
"""

import os
import sys
import time
import urllib.parse
import threading
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from pathlib import Path

import requests

import bright_data
import config_loader
import history_store
import page_savings as ps
import temu_rank_tracker as classic

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "docs" / "data" / "ranks.json"

def attempts() -> int:
    return ps.env_int("TEMU_ATTEMPTS", 6, 1, 12)

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
        try:
            html = bright_data.fetch_html(url, country=region.lower(), render=True)
        except requests.HTTPError as e:
            code = e.response.status_code if e.response is not None else 0
            if code in (408, 425, 429) or code >= 500:      # Bright Data could not get the page this time: the same as an empty answer, try again
                problem = f"Bright Data answered {code}"
                continue
            raise                                           # 401 / 402 / 403 ...: account or zone problem, another try cannot change it
        except (requests.Timeout, requests.ConnectionError) as e:
            problem = f"no answer in time ({type(e).__name__})"
            continue
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


def round_robin(todo):
    """
    todo: [((region, keyword), owners), ...] in sheet order. Returns the same items interleaved by the first project that owns each
    keyword: every project's first keyword, then every project's second, and so on. A run that ends early (time budget, a long
    bad streak) therefore still reaches every project; before, it never got past the first projects of the sheet.
    """
    groups = OrderedDict()
    for item in todo:
        groups.setdefault(item[1][0][0]["project_id"], []).append(item)
    longest = max((len(g) for g in groups.values()), default=0)
    return [g[i] for i in range(longest) for g in groups.values() if i < len(g)]


def build_work(projects, history, today, only_new=False):
    """
    The Temu keywords that still have to be read today: {(region, keyword): [(project, item, goods_id), ...]}.

    THE MONEY RULE (one place, used by the tracker and by temu_todo.py): a (project, product, keyword) with a valid reading dated today
    (found, or "not in the top N") is DONE and is never read again that day. Only keywords that were BLOCKED today (a "?" row, which a
    later run replaces) or have no row yet are left. Bright Data bills only successful reads, so a keyword is billed at most once per day.
    """
    done_today = {(r["project_id"], r["item_key"], r["keyword"]) for r in history if r["date"] == today and not r.get("blocked")}
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
    return work


def main():
    projects = config_loader.load_projects()
    history = history_store.load(DATA_PATH)
    today = date.today().isoformat()
    only_new = os.environ.get("ONLY_NEW") == "1"
    work = build_work(projects, history, today, only_new)
    todo = round_robin(list(work.items()))
    workers = ps.env_int("TEMU_WORKERS", 4, 1, 8)
    stop_after, stop_later = ps.env_int("TEMU_STOP_AFTER", 12, 1, 500), ps.env_int("TEMU_STOP_AFTER_LATER", 60, 1, 1000)
    deadline = time.monotonic() + ps.env_int("TEMU_MAX_MINUTES", 15, 5, 340) * 60

    stop = threading.Event()                # set when Temu is clearly not answering (or Bright Data refuses): workers stop starting new keywords
    lock = threading.Lock()
    streak = {"n": 0, "ok": 0, "why": ""}  # keywords in a row (in the order they finish) that could not be read / keywords read so far / why the run stopped

    def read(rk):
        if stop.is_set():
            return "skipped", ""
        if time.monotonic() > deadline:
            with lock:
                streak["why"] = streak["why"] or "time"
            stop.set()
            return "skipped", ""
        try:
            ids = read_goods_ids(rk[1], rk[0])
            with lock:
                streak["n"] = 0
                streak["ok"] += 1
            return "ok", ids
        except ps.PolicyRefused as e:
            stop.set()
            return "refused", str(e)
        except Exception as e:
            with lock:
                streak["n"] += 1
                limit = stop_after if streak["ok"] == 0 else stop_later
                if streak["n"] >= limit and not stop.is_set():
                    streak["why"] = "streak"
                    stop.set()
            return "blocked", str(e)

    read_ok = read_blocked = saved = skipped = 0
    per_project = OrderedDict()             # project name -> [keywords read, blocked, not tried]
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
                    for name in OrderedDict.fromkeys(p["project_name"] for p, _, _ in owners):
                        per_project.setdefault(name, [0, 0, 0])[2] += 1
                    continue
                blocked = status == "blocked"
                for name in OrderedDict.fromkeys(p["project_name"] for p, _, _ in owners):
                    per_project.setdefault(name, [0, 0, 0])[1 if blocked else 0] += 1
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
        if skipped:
            if streak["why"] == "time":
                why = f"the time budget of {ps.env_int('TEMU_MAX_MINUTES', 15, 5, 340)} minutes ran out"
            elif streak["why"] == "streak":
                why = (f"{stop_after if streak['ok'] == 0 else stop_later} keywords in a row could not be read"
                       + (" and none had been read yet, so Temu is not answering at all" if streak["ok"] == 0 else ""))
            else:
                why = "Bright Data refused the request"
            print(f"  !! temu: {why}; {skipped} keyword(s) were not tried today. "
                  "Running the workflow again retries the blocked ones and tries the rest.", file=sys.stderr)
    finally:
        print(f"temu (Web Unlocker): {read_ok} keyword(s) read, {read_blocked} blocked, {skipped} not tried, {saved} reading(s) saved; up to {attempts()} attempt(s) per keyword, "
              f"{workers} at a time (failed attempts are not billed).")
        if per_project:
            print("temu by project (keywords read / blocked / not tried):")
            for name, (ok_n, bl_n, sk_n) in per_project.items():
                print(f"  {name:36} {ok_n:3} / {bl_n:3} / {sk_n:3}")
        history_store.save_and_report(DATA_PATH, history)


if __name__ == "__main__":
    main()
