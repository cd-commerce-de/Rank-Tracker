"""
Otto probe: what does Bright Data's Web Unlocker really do with otto.de, and what does it really cost?

Two questions that the Otto runner cannot answer by itself:

 1. WHICH WAY OF ASKING WORKS BEST? The probe asks for the same Otto search page several ways, a few times each, and counts what came back
    (the real results page, Otto's own "Hoppla" page, a bot-check page, errors):
      - Bright Data's own choice of exit address;   - a German exit address (country de);
      - with browser rendering (Bright Data loads the page in a real browser first; slower; this is what the Temu route needs);
      - rendering + German exit;                    - Otto's homepage as a control (does the zone reach Otto at all?).
 2. ARE FAILED ATTEMPTS BILLED? Each response carries Bright Data's own debug flag "billed". On 2026-11-26 it said true for 13 of 14 failed
    attempts, yet the account balance did not move. The probe reads the zone's BILLED COST from Bright Data's cost API (GET /zone/cost, which
    the docs say matches the Usage Overview and the invoice) before and after, and prints the difference next to the number of requests the flag
    called billed. A free or trial allowance shows as cost 0 although the requests count against it; the zone's Usage page shows the request count.
    For a clean reading run it when nothing else uses the same zone (a dedicated Otto zone: BRIGHTDATA_ZONE_OTTO).

It saves nothing and changes no data. At most (4 ways x PROBE_ATTEMPTS + 4) requests are made, 36 by default.

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

WAYS = [
    ("search page, Bright Data's own exit", "search", None, False),
    ("search page, German exit", "search", "de", False),
    ("search page, browser rendering", "search", None, True),
    ("search page, rendering + German exit", "search", "de", True),
    ("homepage (control)", "home", None, False),
]
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
    for w, (_, target, country, render) in enumerate(WAYS):
        n = min(4, attempts) if target == "home" else attempts
        jobs += [(w, HOME if target == "home" else search_url, country, render)] * n

    def one(job):
        w, url, country, render = job
        if abort.is_set():
            return {"way": w, "ok": False, "kind": "not tried (stopped)", "billed": None, "peer": "", "secs": 0.0}
        started = time.monotonic()
        try:
            ids, billed, peer = ot._one_attempt(url, country, render)
            return {"way": w, "ok": True, "kind": "real page", "billed": billed, "peer": peer, "secs": time.monotonic() - started, "n": len(ids)}
        except ot.AttemptFailed as f:
            return {"way": w, "ok": False, "kind": f.kind, "billed": f.billed, "peer": "", "secs": time.monotonic() - started}
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
                cost_lines.append(f"-> Bright Data BILLED ${d_cost:.4f} for the {flagged_total} request(s) it flagged billed: about ${d_cost / flagged_total:.4f} each. "
                                  f"If the flagged failures are billed too, a real page costs about ${d_cost / flagged_total * len(results) / max(1, sum(1 for r in results if r['ok'])):.3f} at this test's success rate.")
            elif d_cost <= 0 and flagged_total:
                cost_lines.append("-> The billed cost did not move although the flag called requests billed. Possible reasons: the account is on a free or trial allowance "
                                  "(the requests still count against it: check the request count on the zone's Usage page), the cost figure lags (read it again in a few minutes), "
                                  "or the flag is wrong. The Usage page's count of successful requests settles it.")
            elif d_cost > 0:
                cost_lines.append("-> The billed cost rose although no request was flagged billed: other traffic on this zone, or the flag is missing. Use a dedicated Otto zone for a clean reading.")
    print("\n".join(cost_lines))

    if best is None:
        verdict = ("No way of asking got a real Otto search page. If the homepage control worked, the zone reaches Otto but its search pages are protected "
                   "(Kasada): try again later or at another time of day, or use another route (Apify).") \
            if any(r["way"] == 4 and r["ok"] for r in results) else \
            "Nothing got through, not even the homepage: check the zone, the API key and the zone's usage limit."
        verdict_env = ""
    else:
        name, _, country, render = WAYS[best]
        verdict_env = f"OTTO_GEO_MODE={'de' if country else 'none'} OTTO_RENDER={'1' if render else '0'}"
        verdict = f"Best way so far: {name}. Use: {verdict_env} (in the workflow form: geo = {'de' if country else 'none'}, browser rendering = {'on' if render else 'off'})."
    print(f"\nVerdict: {verdict}")

    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        try:
            with open(summary, "a", encoding="utf-8") as f:
                f.write(f"### Otto probe, {keyword!r}\n\n| way of asking | real pages | flagged billed | seconds | failures |\n|---|--:|--:|--:|---|\n"
                        + "".join(f"| {a} | {b} | {c} | {d} | {e} |\n" for a, b, c, d, e in rows)
                        + f"\n{chr(10).join(cost_lines)}\n\n**{verdict}**\n")
        except OSError:
            pass


if __name__ == "__main__":
    main()
