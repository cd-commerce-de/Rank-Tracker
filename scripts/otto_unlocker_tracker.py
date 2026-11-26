"""
Otto keyword rank tracker, retry mode ("Track Otto only"). Otto's search page is read through Bright Data's Web Unlocker, like the old
single-attempt tracker (otto_rank_tracker.py), but built for a marketplace that refuses most requests.

Why: through the Web Unlocker Otto answers only about 1 request in 20 with the real results page (Bright Data's own 7-day success rate for
otto.de was about 5%); the rest are Otto's own "Hoppla / Entschuldigung" page or a Kasada bot-check page. The old tracker made ONE
attempt per keyword, gave up after 5 failed keywords in a row and saved nothing for a failure, so in four days it saved one reading. This
runner does what the Temu runner does:

  * every keyword is tried again and again (OTTO_ATTEMPTS, default 12), alternating between a German exit address and Bright Data's
    default choice (OTTO_GEO_MODE: auto | de | none), until it gives the real page;
  * a keyword that still fails after every attempt is saved as BLOCKED (a "?" in the dashboard), never as "not found";
  * THE MONEY RULE: a (project, product, keyword) with a valid reading dated today (found, or "not in the top N") is DONE and is never read
    again that day; only blocked or untried keywords are left. One read serves every product that uses the keyword;
  * keywords are worked through ROUND-ROBIN across projects, so a run that ends early still covers every project;
  * dormant keywords (nothing of yours found in their last checks) are only re-checked weekly, as before; "?" rows never count towards that.

Money: Bright Data bills a request only when it counts as successful. Otto's refusal pages normally are not billed, but a bot-check page
answered with HTTP 200 might be, so every attempt is asked for Bright Data's own "billed" flag (debug header) and the run STOPS once
OTTO_MAX_BILLED_FAILURES (default 10) attempts were billed without giving results (a bot-check page counts when the flag is missing).

Settings (environment): OTTO_ATTEMPTS = tries per keyword (default 12, 1 to 30); OTTO_WORKERS = keywords read at the same time (default 4,
1 to 8); OTTO_MAX_PAGES = results pages per keyword (default 1: one page holds about 100 tiles; each further page needs its own attempts);
OTTO_GEO_MODE = auto | de | none; OTTO_STOP_AFTER = keywords in a row that could not be read BEFORE any keyword has been read, after which the
run stops because Otto is not answering at all (default 12); OTTO_STOP_AFTER_LATER = the same once one keyword was read (default 60);
OTTO_MAX_MINUTES = time budget after which no new keyword is started (default 15; the scheduled workflow passes 60);
OTTO_MAX_BILLED_FAILURES (default 10); BRIGHTDATA_ZONE (or BRIGHTDATA_ZONE_OTTO for a dedicated zone with its own usage limit),
BRIGHTDATA_API_KEY.
Products tab: product_id = the ID from your Otto listing's address (a product ID such as S01J20B5, or a variation ID such as S01J20B5IBJ).
"""

import os
import re
import sys
import threading
import time
import urllib.parse
from collections import Counter, OrderedDict
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from pathlib import Path

import requests

import bright_data
import config_loader
import history_store
import otto_rank_tracker as classic
import page_savings as ps

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "docs" / "data" / "ranks.json"

PARTIAL_BELOW = int(classic.OFFSET_STEP * classic.PARTIAL_PAGE_BELOW)    # a page with fewer tiles is partial: Otto loads the rest while you scroll
_OTTO_ERROR = re.compile(r"<title>[^<]*Entschuldigung[^<]*</title>|Hoppla!?\s*Das hat nicht geklappt", re.I)


def attempts() -> int:
    return ps.env_int("OTTO_ATTEMPTS", 12, 1, 30)


def pages() -> int:
    return ps.env_int("OTTO_MAX_PAGES", 1, 1, 5)


def geo_mode() -> str:
    m = (os.environ.get("OTTO_GEO_MODE") or "auto").strip().lower()
    return m if m in ("auto", "de", "none") else "auto"


def _now() -> float:
    return time.monotonic()


class AttemptFailed(Exception):
    """One attempt gave no results page. kind says what came back; billed is Bright Data's flag (True / False / None = unknown)."""

    def __init__(self, kind: str, billed=None):
        super().__init__(kind)
        self.kind, self.billed = kind, billed


class AccountProblem(RuntimeError):
    """401 / 402 from Bright Data: the key is wrong, the balance is empty or the zone's usage limit is reached. Another try cannot change it."""


class Aborted(Exception):
    """The run is stopping (policy refusal, account problem, billed-failure cap): a keyword in flight gives up without being saved."""


class Run:
    """The state shared by the worker threads of one run (reset by main(), and by the tests)."""

    def __init__(self):
        self.reset()

    def reset(self, deadline=None, billed_cap=10):
        self.lock = threading.RLock()                   # re-entrant: _record() sets the stop flag while it holds the lock
        self.stop = threading.Event()
        self.why = ""
        self.cache, self.failed = {}, {}
        self.attempts = self.ok = self.billed_ok = self.billed_fail = self.risky_fail = 0
        self.kinds = Counter()
        self.geo = {"de": [0, 0], "any": [0, 0]}        # attempts, successes per way of asking
        self.peers = Counter()                          # exit country of the successful reads
        self.deadline, self.billed_cap = deadline, billed_cap

    def set_stop(self, why: str):
        with self.lock:
            if not self.why:
                self.why = why
            self.stop.set()


RUN = Run()


def _geo_for(attempt: int, region: str):
    """The country setting of attempt number `attempt` (1-based): auto alternates the German exit with Bright Data's own choice."""
    mode = geo_mode()
    if mode == "none":
        return None
    if mode == "de" or attempt % 2 == 1:
        return region.lower()
    return None


def _otto_error(html: str) -> bool:
    return bool(html) and len(html) < 40000 and bool(_OTTO_ERROR.search(html))


def _one_attempt(url: str, country):
    """One request. Returns (ids, billed, peer_country) or raises AttemptFailed / ps.PolicyRefused / AccountProblem."""
    try:
        resp = bright_data.fetch_response(url, country=country, debug=True)
    except requests.HTTPError as e:
        r = e.response
        code = getattr(r, "status_code", 0) or 0
        body = (getattr(r, "text", "") or "") if r is not None else ""
        info = bright_data.parse_debug(getattr(r, "headers", None)) if r is not None else {}
        billed = {"true": True, "false": False}.get(info.get("billed", "").lower())
        if code in (401, 402):
            raise AccountProblem(f"Bright Data answered {code}: " + ("check BRIGHTDATA_API_KEY" if code == 401 else "the account has no balance, or the zone's usage limit is reached")) from e
        msg = ps.refusal(body)
        if msg:
            raise ps.PolicyRefused(msg) from e
        kind = "bot check" if ps.challenge(body) else ("Otto error page" if _otto_error(body) else f"HTTP {code}")
        raise AttemptFailed(kind, billed) from e
    except (requests.Timeout, requests.ConnectionError) as e:
        raise AttemptFailed("timeout", False) from e
    html = resp.text or ""
    info = bright_data.parse_debug(resp.headers)
    billed = {"true": True, "false": False}.get(info.get("billed", "").lower())
    msg = ps.refusal(html)
    if msg:
        raise ps.PolicyRefused(msg)
    if ps.challenge(html):
        raise AttemptFailed("bot check", billed)
    if not html.strip():
        raise AttemptFailed("empty answer", billed)
    if _otto_error(html):
        raise AttemptFailed("Otto error page", billed)
    ids = classic.extract_ordered_product_ids(html)
    if not ids:
        raise AttemptFailed("page without products", billed)
    return ids, billed, info.get("peer_country") or ""


def _record(ok: bool, geo, kind: str = "", billed=None, peer: str = ""):
    with RUN.lock:
        RUN.attempts += 1
        g = RUN.geo["de" if geo else "any"]
        g[0] += 1
        if ok:
            RUN.ok += 1
            g[1] += 1
            if billed:
                RUN.billed_ok += 1
            if peer:
                RUN.peers[peer.lower()] += 1
            return
        RUN.kinds[kind] += 1
        if billed:
            RUN.billed_fail += 1
        if billed or (billed is None and kind == "bot check"):      # billed, or possibly billed (the flag is missing and a bot-check page may count)
            RUN.risky_fail += 1
            if RUN.risky_fail >= RUN.billed_cap:
                RUN.set_stop("billed")


def _read_page(url: str, region: str) -> list:
    """The product IDs of one results page, trying up to attempts() times. Raises ps.EmptyPage when every attempt failed."""
    tries, seen = attempts(), Counter()
    for attempt in range(1, tries + 1):
        if RUN.stop.is_set():
            raise Aborted()
        geo = _geo_for(attempt, region)
        try:
            ids, billed, peer = _one_attempt(url, geo)
        except AttemptFailed as f:
            seen[f.kind] += 1
            _record(False, geo, f.kind, f.billed)
            continue
        _record(True, geo, billed=billed, peer=peer)
        return ids
    why = ", ".join(f"{n}x {k}" for k, n in seen.most_common())
    raise ps.EmptyPage(f"{why} on all {tries} attempts for {url}")


def _dedupe(ids: list) -> list:
    seen, out = set(), []
    for i in ids:
        if i not in seen:
            seen.add(i)
            out.append(i)
    return out


def read_ids(keyword: str, region: str, targets: list) -> list:
    """
    Product IDs of the results for a keyword, in order (one read per keyword per run, shared by its products). Page 1 is retried until it
    answers or every attempt failed (ps.EmptyPage); a later page that cannot be read ends the list there (the ranks read so far are valid).
    """
    key = (region, keyword)
    if key in RUN.failed:
        raise RUN.failed[key]
    if key in RUN.cache:
        return RUN.cache[key]
    query = urllib.parse.quote(keyword)
    all_ids = []
    for page in range(pages()):
        url = classic.search_url(query, page * classic.OFFSET_STEP)
        try:
            ids = _read_page(url, region)
        except ps.PolicyRefused:
            raise
        except ps.EmptyPage as e:
            if page == 0:
                RUN.failed[key] = e
                raise
            break
        all_ids.extend(ids)
        ordered = _dedupe(all_ids)
        if all(classic.position_of(ordered, t) for t in targets) or len(ids) < PARTIAL_BELOW:
            break
    RUN.cache[key] = _dedupe(all_ids)
    return RUN.cache[key]


def round_robin(todo):
    """todo: [((region, keyword), owners), ...] in sheet order -> the same items interleaved by the first project that owns each keyword."""
    groups = OrderedDict()
    for item in todo:
        groups.setdefault(item[1][0][0]["project_id"], []).append(item)
    longest = max((len(g) for g in groups.values()), default=0)
    return [g[i] for i in range(longest) for g in groups.values() if i < len(g)]


def build_work(projects, history, today, dormant=frozenset(), only_new=False):
    """
    What is still to do today: (work, carried).
      work    = {(region, keyword): [(project, item, product_id), ...]}  keywords that need a real read;
      carried = [(project, item, product_id, region, keyword), ...]      dormant keywords: a "carried" row, no request, no cost.
    THE MONEY RULE (one place, used by the tracker and by otto_todo.py): a (project, product, keyword) with a valid row dated today
    (found, "not in the top N", or carried) is DONE; only keywords that were BLOCKED today (a "?" row) or have no row are left.
    """
    done_today = {(r["project_id"], r["item_key"], r["keyword"]) for r in history if r["date"] == today and not r.get("blocked")}
    known_any = {(r["project_id"], r["item_key"], r["keyword"]) for r in history}
    work, carried = OrderedDict(), []
    for project in projects:
        for item in project.get("items", []):
            if item.get("marketplace") != "otto":
                continue
            target = item.get("otto_product_id")
            if not target:
                print(f"  ! skipping {item['item_key']}: no otto_product_id set", file=sys.stderr)
                continue
            region = (item.get("country") or "DE").strip() or "DE"
            for keyword in item.get("keywords", []):
                key = (project["project_id"], item["item_key"], keyword)
                if key in done_today or (only_new and key in known_any):
                    continue
                if (region, keyword) in dormant:
                    carried.append((project, item, target, region, keyword))
                    continue
                work.setdefault((region, keyword), []).append((project, item, target))
    return work, carried


def dormant_keywords(history, today):
    """Dormant = nothing of yours found in the last checks. Blocked (\"?\") rows are NOT checks: they say nothing about the ranking."""
    return ps.dormant_skip([r for r in history if not r.get("blocked")], "otto", today)


def _row(project, item, target, region, keyword, rank, blocked, scanned, carried=False):
    row = {
        "date": date.today().isoformat(), "checked_at": datetime.now(timezone.utc).isoformat(),
        "project_id": project["project_id"], "project_name": project["project_name"], "item_key": item["item_key"],
        "marketplace": "otto", "country": region.upper(), "keyword": keyword, "rank": rank, "item_id": target,
        "item_label": item.get("label"), "item_sku": item.get("sku"), "title": None, "results_scanned": scanned,
    }
    if carried:
        row["carried"] = True          # not re-checked today: nothing of yours was found in its last checks
    else:
        row["blocked"] = blocked
    return row


def _summary(read_ok, read_blocked, skipped, saved, workers, per_project, why_stop):
    lines = [f"otto (retry mode): {read_ok} keyword(s) read, {read_blocked} blocked, {skipped} not tried, {saved} reading(s) saved; "
             f"up to {attempts()} attempt(s) per keyword, {workers} at a time, geo mode {geo_mode()}."]
    rate = f"{RUN.ok / RUN.attempts:.0%}" if RUN.attempts else "-"
    lines.append(f"otto attempts: {RUN.attempts} made, {RUN.ok} gave the real page ({rate}); failures: "
                 + (", ".join(f"{n}x {k}" for k, n in RUN.kinds.most_common()) or "none") + ".")
    lines.append(f"otto billing (Bright Data's own flag): {RUN.billed_ok} real page(s) billed, {RUN.billed_fail} failed attempt(s) billed"
                 + (f" ({RUN.risky_fail} counted towards the stop at {RUN.billed_cap})" if RUN.risky_fail else "") + ".")
    de, any_ = RUN.geo["de"], RUN.geo["any"]
    lines.append(f"otto by way of asking: German exit {de[1]}/{de[0]}, Bright Data's choice {any_[1]}/{any_[0]}"
                 + (f"; exit countries of the real pages: {dict(RUN.peers)}" if RUN.peers else "") + ".")
    if why_stop:
        lines.append(why_stop)
    return lines, per_project


def main():
    projects = config_loader.load_projects()
    history = history_store.load(DATA_PATH)
    today = date.today().isoformat()
    only_new = os.environ.get("ONLY_NEW") == "1"
    work, carried = build_work(projects, history, today, dormant_keywords(history, today), only_new)
    todo = round_robin(list(work.items()))
    workers = ps.env_int("OTTO_WORKERS", 4, 1, 8)
    stop_after, stop_later = ps.env_int("OTTO_STOP_AFTER", 12, 1, 500), ps.env_int("OTTO_STOP_AFTER_LATER", 60, 1, 1000)
    minutes = ps.env_int("OTTO_MAX_MINUTES", 15, 5, 340)
    RUN.reset(deadline=_now() + minutes * 60, billed_cap=ps.env_int("OTTO_MAX_BILLED_FAILURES", 10, 1, 500))
    if not todo and not carried:
        print("otto: nothing left to read today (every keyword has a valid reading for today, UTC). No request was made.")
        return

    streak = {"n": 0, "ok": 0}

    def read(rk, owners):
        if RUN.stop.is_set():
            return "skipped", ""
        if _now() > RUN.deadline:
            RUN.set_stop("time")
            return "skipped", ""
        try:
            ids = read_ids(rk[1], rk[0], [t for _, _, t in owners])
            with RUN.lock:
                streak["n"] = 0
                streak["ok"] += 1
            return "ok", ids
        except (ps.PolicyRefused, AccountProblem) as e:
            RUN.set_stop("refused" if isinstance(e, ps.PolicyRefused) else "account")
            return "refused", str(e)
        except Aborted:
            return "skipped", ""
        except Exception as e:                      # ps.EmptyPage: every attempt failed
            with RUN.lock:
                streak["n"] += 1
                limit = stop_after if streak["ok"] == 0 else stop_later
                hit = streak["n"] >= limit
            if hit:
                RUN.set_stop("streak")
            return "blocked", str(e)

    read_ok = read_blocked = saved = skipped = 0
    per_project = OrderedDict()                    # project name -> [keywords read, blocked, not tried]
    refusal = ""
    try:
        for project, item, target, region, keyword in carried:           # dormant keywords first: no request, no cost
            history.append(_row(project, item, target, region, keyword, None, False, None, carried=True))
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = [pool.submit(read, rk, owners) for rk, owners in todo]
            for (rk, owners), fut in zip(todo, futures):
                status, payload = fut.result()
                names = list(OrderedDict.fromkeys(p["project_name"] for p, _, _ in owners))
                if status == "refused":
                    refusal = refusal or payload
                    for n in names:
                        per_project.setdefault(n, [0, 0, 0])[2] += 1
                    skipped += 1
                    continue
                if status == "skipped":
                    skipped += 1
                    for n in names:
                        per_project.setdefault(n, [0, 0, 0])[2] += 1
                    continue
                blocked = status == "blocked"
                for n in names:
                    per_project.setdefault(n, [0, 0, 0])[1 if blocked else 0] += 1
                ids = [] if blocked else payload
                if blocked:
                    read_blocked += 1
                    print(f"  ! otto '{rk[1]}': could not be read ({payload})", file=sys.stderr)
                else:
                    read_ok += 1
                for project, item, target in owners:
                    key = (project["project_id"], item["item_key"], rk[1])
                    history[:] = [r for r in history if not (r["date"] == today and r.get("blocked") and (r["project_id"], r["item_key"], r["keyword"]) == key)]
                    rank = None if blocked else classic.position_of(ids, target)
                    history.append(_row(project, item, target, rk[0], rk[1], rank, blocked, None if blocked else len(ids)))
                    saved += 1
                    print(f"  [{project['project_name']} / {item['item_key']}] {rk[1]!r} -> "
                          + ("BLOCKED" if blocked else (f"rank {rank}" if rank else f"not in the top {len(ids)}")))
    finally:
        why = ""
        if skipped:
            reasons = {
                "time": f"the time budget of {minutes} minutes ran out",
                "streak": f"{stop_after if streak['ok'] == 0 else stop_later} keywords in a row could not be read"
                          + (" and none had been read yet, so Otto is not answering at all" if streak["ok"] == 0 else ""),
                "billed": f"{RUN.risky_fail} attempts were billed (or may have been) without giving results, the cap is {RUN.billed_cap}",
                "refused": f"Bright Data refused the request: {refusal}",
                "account": f"Bright Data account problem: {refusal}",
            }
            why = f"  !! otto: {reasons.get(RUN.why, 'the run stopped')}; {skipped} keyword(s) were not tried today. Running the workflow again retries the blocked ones and tries the rest."
        lines, per_project_out = _summary(read_ok, read_blocked, skipped, saved, workers, per_project, why)
        for ln in lines:
            print(ln, file=sys.stderr if ln.startswith("  !!") else sys.stdout)
        if per_project_out:
            print("otto by project (keywords read / blocked / not tried):")
            for name, (ok_n, bl_n, sk_n) in per_project_out.items():
                print(f"  {name:36} {ok_n:3} / {bl_n:3} / {sk_n:3}")
        if RUN.attempts:
            try:
                sr = bright_data.success_rate("otto.de")
                if sr.get("otto.de") is not None:
                    print(f"otto: Bright Data's own 7-day success rate for otto.de: {sr['otto.de']:.0%} (90% of answers within {sr.get('time_p90', 0) / 1000:.1f} s).")
            except Exception as e:                  # a statistic: never worth failing the run for
                print(f"otto: Bright Data's success-rate statistic could not be read ({type(e).__name__}).")
        summary = os.environ.get("GITHUB_STEP_SUMMARY")
        if summary:
            try:
                with open(summary, "a", encoding="utf-8") as f:
                    f.write(f"### Otto run\n\n| | |\n|---|--:|\n| keywords read | {read_ok} |\n| blocked (\"?\") | {read_blocked} |\n| not tried | {skipped} |\n"
                            f"| attempts / real pages | {RUN.attempts} / {RUN.ok} |\n| billed: real pages / failed attempts | {RUN.billed_ok} / {RUN.billed_fail} |\n"
                            f"| failures | {', '.join(f'{n}x {k}' for k, n in RUN.kinds.most_common()) or 'none'} |\n")
            except OSError:
                pass
        history_store.save_and_report(DATA_PATH, history)


if __name__ == "__main__":
    main()
