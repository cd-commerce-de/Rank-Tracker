"""
Otto probe: what does Bright Data's Web Unlocker really do with otto.de, and what does it really cost?

Two questions that the Otto runner cannot answer by itself:

 1. WHICH WAY OF ASKING WORKS BEST? The probe asks for the same Otto search page several ways, a few times each, and counts what came back
    (the real results page, Otto's own "Hoppla" page, a bot-check page, errors):
      - Bright Data's own choice of exit address;   - a German exit address (country de);
      - with browser rendering (Bright Data loads the page in a real browser first; slower; this is what the Temu route needs);
      - rendering + German exit;
      - with Bright Data's x-unblock-expect header (the Unlocker only counts a page as unlocked when product links are on it; needs the zone's
        Custom Web Unlocker feature "Manual expect elements", Configuration > Advanced settings, switched on, else the header is ignored), plain and rendered;
      - Otto's homepage as a control (does the zone reach Otto at all?).
 2. ARE FAILED ATTEMPTS BILLED? Each response carries Bright Data's own debug flag "billed". On 2026-11-26 it said true for 13 of 14 failed
    attempts, yet the account balance did not move. The probe reads the zone's BILLED COST from Bright Data's cost API (GET /zone/cost, which
    the docs say matches the Usage Overview and the invoice) before and after, and prints the difference next to the number of requests the flag
    called billed. A free or trial allowance shows as cost 0 although the requests count against it; the zone's Usage page shows the request count.
    For a clean reading run it when nothing else uses the same zone (a dedicated Otto zone: BRIGHTDATA_ZONE_OTTO).

It saves nothing and changes no data. At most (6 ways x PROBE_ATTEMPTS + 4) requests are made, 52 by default.

Settings (environment): PROBE_KEYWORD (default: the first Otto keyword of the sheet, else "anhänger hochplane"); PROBE_ATTEMPTS = tries per way
(default 8, 1 to 30); PROBE_WORKERS (default 4); PROBE_WAIT_SECONDS = pause before the second cost reading, because the cost API can lag (default 120).
"""

import os
import sys
import threading
import time
import urllib.parse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

import bright_data
import config_loader
import otto_rank_tracker as classic
import otto_unlocker_tracker as ot
import page_savings as ps

WAYS = [        # (name, page, country, render, expect)
    ("search page, Bright Data's own exit", "search", None, False, False),
    ("search page, German exit", "search", "de", False, False),
    ("search page, browser rendering", "search", None, True, False),
    ("search page, rendering + German exit", "search", "de", True, False),
    ("search page, expect product links", "search", None, False, True),
    ("search page, expect + rendering", "search", None, True, True),
    ("homepage (control)", "home", None, False, False),
]
CONTROL = next(i for i, w in enumerate(WAYS) if w[1] == "home")
EXPECT = {"x-unblock-expect": '{"element": "a[href*=\\"/p/\\"]"}'}
HOME = "https://www.otto.de/"


def pick_keyword() -> str:
    kw = (os.environ.get("PROBE_KEYWORD") or "").strip()
    if kw:
        return kw
    try:
        for project in config_loader.load_projects():
            for item in project.get("items", []):
                if item.get("marketplace") == "otto" and item.get("keywords"):
                    return item["keywords"][0]
    except Exception:
        pass
    return "anhänger hochplane"


def run_probe(keyword: str, attempts: int, workers: int) -> list:
    """Every attempt of every way. Returns [{way, ok, kind, billed, peer, secs}, ...] in the order of WAYS."""
    search_url = classic.search_url(urllib.parse.quote(keyword), 0)
    abort = threading.Event()
    jobs = []
    for w, (_, target, country, render, expect) in enumerate(WAYS):
        n = min(4, attempts) if target == "home" else attempts
        jobs += [(w, HOME if target == "home" else search_url, country, render, EXPECT if expect else None)] * n

    def one(job):
        w, url, country, render, expect = job
        if abort.is_set():
            return {"way": w, "ok": False, "kind": "not tried (stopped)", "billed": None, "peer": "", "secs": 0.0}
        started = time.monotonic()
        try:
            ids, billed, peer = ot._one_attempt(url, country, render, expect)
            return {"way": w, "ok": True, "kind": "real page", "billed": billed, "peer": peer, "secs": time.monotonic() - started, "n": len(ids)}
        except ot.AttemptFailed as f:
            return {"way": w, "ok": False, "kind": f.kind, "billed": f.billed, "peer": "", "secs": time.monotonic() - started, "req_id": f.req_id}
        except (ps.PolicyRefused, ot.AccountProblem) as e:
            abort.set()
            return {"way": w, "ok": False, "kind": "refused: " + str(e)[:120], "billed": None, "peer": "", "secs": time.monotonic() - started}

    with ThreadPoolExecutor(max_workers=workers) as pool:
        return list(pool.map(one, jobs))


def summarize(results: list):
    """(lines for the log, rows for the run page, the best way's index or None)."""
    lines, rows, best = [], [], None
    for w, (name, *_rest) in enumerate(WAYS):
        rs = [r for r in results if r["way"] == w]
        ok = sum(1 for r in rs if r["ok"])
        kinds = Counter(r["kind"] for r in rs if not r["ok"])
        flagged = sum(1 for r in rs if r["billed"])
        done = [r["secs"] for r in rs if r["secs"]]
        avg = sum(done) / len(done) if done else 0.0
        peers = Counter(r["peer"] for r in rs if r["ok"] and r["peer"])
        fails = ", ".join(f"{n}x {k}" for k, n in kinds.most_common()) or "none"
        lines.append(f"  {name:40} {ok:2}/{len(rs):2} real pages | flagged billed {flagged:2} | {avg:5.1f} s on average | failures: {fails}"
                     + (f" | exit of the real pages: {dict(peers)}" if peers else ""))
        rows.append((name, f"{ok}/{len(rs)}", flagged, f"{avg:.1f}", fails))
        if WAYS[w][1] == "search" and ok and (best is None or ok > best[1] or (ok == best[1] and avg < best[2])):
            best = (w, ok, avg)
    return lines, rows, (best[0] if best else None)


def snapshot(zone: str):
    """(billed cost reading, None) or (None, why it could not be read)."""
    try:
        s = bright_data.zone_cost(zone)
        return (s, None) if s else (None, "Bright Data returned no usage figures")
    except Exception as e:
        code = getattr(getattr(e, "response", None), "status_code", None)
        hint = " (an API key with Ops or User permission cannot read billing: use an Admin key)" if code in (401, 403) else ""
        return None, f"{type(e).__name__}{f' {code}' if code else ''}{hint}"


def main():
    attempts = ps.env_int("PROBE_ATTEMPTS", 8, 1, 30)
    workers = ps.env_int("PROBE_WORKERS", 4, 1, 8)
    wait = ps.env_int("PROBE_WAIT_SECONDS", 120, 0, 900)
    keyword = pick_keyword()
    zone, dedicated = bright_data.zone_for(HOME)
    print(f"Otto probe: keyword {keyword!r}, zone {zone!r} ({'dedicated Otto zone' if dedicated else 'the normal zone: other workflows may add cost while this runs'}), "
          f"{attempts} attempts per way, {workers} at a time.")
    before, why_before = snapshot(zone)
    results = run_probe(keyword, attempts, workers)
    lines, rows, best = summarize(results)
    print("\nWhat came back, by way of asking:")
    print("\n".join(lines))
    refused = [r["kind"] for r in results if r["kind"].startswith("refused")]
    if refused:
        print(f"\n!! Bright Data refused the requests: {refused[0]}", file=sys.stderr)

    flagged_total = sum(1 for r in results if r["billed"])
    flagged_failed = sum(1 for r in results if r["billed"] and not r["ok"])
    search = [r for r in results if WAYS[r["way"]][1] == "search"]
    search_ok = sum(1 for r in search if r["ok"])
    print(f"\nBilling: {len(results)} requests were made; Bright Data's debug flag called {flagged_total} of them billed ({flagged_failed} of those were NOT real pages).")
    cost_lines = []
    if before is None:
        cost_lines.append(f"The zone's billed cost could not be read before the test: {why_before}. Look at the zone's Usage page in the Bright Data panel instead.")
    else:
        if wait:
            print(f"Waiting {wait} s before reading the billed cost again (the figures can lag)...")
            time.sleep(wait)
        after, why_after = snapshot(zone)
        if after is None:
            cost_lines.append(f"The zone's billed cost could not be read after the test: {why_after}.")
        else:
            d_cost = after["today"]["cost"] - before["today"]["cost"]
            d_bw = (after["today"]["bw"] - before["today"]["bw"]) / 1024
            cost_lines.append(f"Bright Data's billed cost for this zone today: ${before['today']['cost']:.4f} before, ${after['today']['cost']:.4f} after (change ${d_cost:+.4f}); "
                              f"bandwidth {d_bw:+.0f} KB.")
            if d_cost > 0 and flagged_total:
                price = d_cost / flagged_total
                cost_lines.append(f"-> Bright Data BILLED ${d_cost:.4f} for the {flagged_total} request(s) it flagged billed: about ${price:.4f} each (${price * 1000:.2f} per 1,000 requests: "
                                  f"compare with your zone's price; if it matches, the refusal pages are billed too" + (f", {flagged_failed} of them" if flagged_failed else "") + ").")
                if search_ok:
                    cost_lines.append(f"-> {search_ok} real search page(s) from {len(search)} search attempts: about ${price * len(search) / search_ok:.3f} per real search page at this success rate.")
                else:
                    cost_lines.append(f"-> No real search page yet from {len(search)} search attempts, which cost about ${price * len(search):.3f}: there is no price per reading to give.")
            elif d_cost <= 0 and flagged_total:
                cost_lines.append("-> The billed cost did not move although the flag called requests billed. Possible reasons: the account is on a free or trial allowance "
                                  "(the requests still count against it: check the request count on the zone's Usage page), the cost figure lags (read it again in a few minutes), "
                                  "or the flag is wrong. The Usage page's count of successful requests settles it.")
            elif d_cost > 0:
                cost_lines.append("-> The billed cost rose although no request was flagged billed: other traffic on this zone, or the flag is missing. Use a dedicated Otto zone for a clean reading.")
    print("\n".join(cost_lines))
    if os.environ.get("BRIGHTDATA_API_KEY"):
        try:
            allr, srch = bright_data.success_rate("otto.de"), bright_data.success_rate("otto.de", "/suche/")
            if allr.get("otto.de") is not None:
                print(f"Bright Data's own 7-day success rate for your requests to otto.de: {allr['otto.de']:.0%} overall"
                      + (f", {srch['otto.de']:.0%} for search pages (/suche/)" if srch.get("otto.de") is not None else "") + ".")
        except Exception as e:
            print(f"(Bright Data's success-rate statistic could not be read: {type(e).__name__})")
    failed_ids = [(WAYS[r["way"]][0], r["req_id"]) for r in results if not r["ok"] and r.get("req_id") and WAYS[r["way"]][1] == "search"]
    shown, per_way = [], Counter()
    for name, rid in failed_ids:
        if per_way[name] < 2:
            per_way[name] += 1
            shown.append(f"{rid}  ({name})")
    ticket_ids = "\n".join("  " + s for s in shown)
    if shown:
        print("\nRequest IDs of failed search attempts, for a Bright Data support ticket (they can trace each one):\n" + ticket_ids)

    expect_ways = [i for i, w in enumerate(WAYS) if w[4]]
    plain_search = [r for r in results if WAYS[r["way"]][1] == "search" and not WAYS[r["way"]][4]]
    expect_res = [r for r in results if r["way"] in expect_ways]
    top = lambda rs: Counter(r["kind"] for r in rs if not r["ok"]).most_common(1)
    avg = lambda rs: (sum(r["secs"] for r in rs if r["secs"]) / max(1, sum(1 for r in rs if r["secs"])))
    honored = bool(expect_res) and bool(top(expect_res)) and ((bool(top(plain_search)) and top(expect_res)[0][0] != top(plain_search)[0][0]) or avg(expect_res) > 1.3 * avg(plain_search))
    differs = (f"{top(expect_res)[0][0]} instead of {top(plain_search)[0][0]}, {avg(expect_res) - avg(plain_search):.0f} s slower on average"
               if honored and top(plain_search) and top(expect_res) else "")
    if best is None:
        verdict = ("No way of asking got a real Otto search page. If the homepage control worked, the zone reaches Otto but its search pages are protected "
                   "(Kasada): check that otto.de is on the zone's Premium Domains list and the zone has Premium Domains switched on, switch on the Custom Web Unlocker "
                   "feature 'Manual expect elements' on this zone, try again at another time of day, or use another route (Apify).") \
            if any(r["way"] == CONTROL and r["ok"] for r in results) else \
            "Nothing got through, not even the homepage: check the zone, the API key and the zone's usage limit."
        verdict_env = ""
    else:
        name, _, country, render, expect = WAYS[best]
        verdict_env = f"OTTO_GEO_MODE={'de' if country else 'none'} OTTO_RENDER={'1' if render else '0'} OTTO_EXPECT={'products' if expect else 'off'}"
        verdict = (f"Best way so far: {name}. Use: {verdict_env} (in the workflow form: geo = {'de' if country else 'none'}, browser rendering = {'on' if render else 'off'}, "
                   f"expect = {'on' if expect else 'off'}).")
    expect_note = ""
    expect_ok = any(r["ok"] for r in expect_res)
    search_ok_any = any(r["ok"] for r in results if WAYS[r["way"]][1] == "search")
    if expect_ways and not expect_ok and search_ok_any:
        expect_note = ("The expect ways did worse than the plain ones" + (f" and they behaved differently ({differs}), so the header WAS applied." if honored else
                       ": the zone's 'Manual expect elements' feature is probably not switched on (the header is then ignored)."))
    elif expect_ways and not search_ok_any:
        expect_note = ((f"The expect ways behaved differently from the plain ones ({differs}), so the header WAS applied: the Unlocker waited for product links and never got "
                        "a real search page. Bright Data's own unlocking cannot get Otto's search page through at the moment.") if honored else
                       "The expect ways got nothing either: if you have not switched on 'Manual expect elements' (zone > Configuration > Advanced settings) the header was ignored.")
    print(f"\nVerdict: {verdict}" + (f"\n{expect_note}" if expect_note else ""))

    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        try:
            with open(summary, "a", encoding="utf-8") as f:
                safe = lambda text: text.replace("$", "USD ")         # GitHub renders $...$ in a summary as maths, and a backslash did not stop it
                f.write(f"### Otto probe, {keyword!r}\n\n| way of asking | real pages | flagged billed | seconds | failures |\n|---|--:|--:|--:|---|\n"
                        + "".join(f"| {a} | {b} | {c} | {d} | {e} |\n" for a, b, c, d, e in rows)
                        + f"\n{safe(chr(10).join(cost_lines))}\n\n**{safe(verdict)}**\n" + (f"\n{safe(expect_note)}\n" if expect_note else "")
                        + (f"\nRequest IDs of failed search attempts (for a Bright Data support ticket):\n\n```\n{ticket_ids}\n```\n" if shown else ""))
        except OSError:
            pass


if __name__ == "__main__":
    main()
