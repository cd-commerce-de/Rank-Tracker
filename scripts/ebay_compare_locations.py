"""
Fetch the SAME eBay keyword several times, from a German exit (country=de) and from exits with no country setting, and
show side by side how much the results differ: between two identical requests, and between the two kinds of exit.
That separates "eBay's page is random from one load to the next" from "the connection's location changes what eBay shows".
Costs about 4 Bright Data requests (more if eBay rejects some: each fetch is tried up to 3 times). Saves nothing.

    python scripts/ebay_compare_locations.py "auto heber" --project WGH30 --repeat 2
"""

import argparse
import os
import statistics
import sys
import time

import bright_data
import config_loader
import ebay_web
import requests


def fetch(url: str, geo, tries: int = 3):
    """One fetch from one kind of exit, up to `tries` attempts (eBay rejects a share of requests at random)."""
    for attempt in range(1, tries + 1):
        hdr = ""
        try:
            resp = bright_data.fetch_response(url, country=geo)
            html = resp.text
            hdr = "; ".join(f"{k}: {str(v)[:60]}" for k, v in resp.headers.items() if k.lower().startswith(("x-brd", "x-luminati")))
        except requests.RequestException:
            html = ""
        if html.strip():
            return html, attempt, hdr
        if attempt < tries:
            time.sleep(4)
    return "", tries, ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("keyword")
    ap.add_argument("--project", default="")
    ap.add_argument("--country", default="DE")
    ap.add_argument("--repeat", type=int, default=2)
    a = ap.parse_args()
    repeat = max(1, min(a.repeat, 3))

    tracked = {}
    try:
        for p in config_loader.load_projects():
            if a.project and a.project.lower() not in p["project_name"].lower():
                continue
            for it in p.get("items", []):
                if it.get("marketplace") == "ebay" and it.get("ebay_item_id"):
                    tracked[it["ebay_item_id"]] = it.get("sku") or it["ebay_item_id"]
    except Exception as e:
        print(f"(could not read the sheet: {e})", file=sys.stderr)

    url = ebay_web.search_url(a.keyword, a.country, 1)
    plan = [(f"German exit #{i + 1}", a.country) for i in range(repeat)] + [(f"No-country exit #{i + 1}", None) for i in range(repeat)]
    samples = []
    for label, geo in plan:
        html, tries, hdr = fetch(url, geo)
        s = {"label": label, "geo": "DE" if geo else "none", "tries": tries, "ok": bool(html.strip()), "hdr": hdr}
        if s["ok"]:
            cards = ebay_web.parse_cards(html)
            org, pos = 0, {}
            for i, c in enumerate(cards, 1):
                if not c["sponsored"]:
                    org += 1
                if c["id"] in tracked and c["id"] not in pos:
                    pos[c["id"]] = (i, None if c["sponsored"] else org)
            s.update(lang=ebay_web.page_language(html), shipto=ebay_web.page_shipto(html), count=ebay_web.result_count(html), ids=[c["id"] for c in cards],
                     ads=[i + 1 for i, c in enumerate(cards) if c["sponsored"]], pos=pos, n=len(cards))
        samples.append(s)

    lines = [f"# Same keyword, different connections — “{a.keyword}”", "",
             f"Address requested each time: `{url}`. {len(tracked)} of your eBay products" + (f" (projects containing “{a.project}”)" if a.project else "") + " are highlighted.", "",
             "## Every fetch", "", "| Fetch | Attempts needed | Language | Delivery postcode shown | Results shown | Listings | Ads in the first 10 | First 5 listings |", "|---|--:|---|---|--:|--:|--:|---|"]
    for s in samples:
        if not s["ok"]:
            lines.append(f"| {s['label']} | {s['tries']} (all empty) | — | — | — | — | — | the page never came back |")
        else:
            lines.append(f"| {s['label']} | {s['tries']} | {s['lang']} | {s['shipto'] or 'not shown'} | {s['count'] if s['count'] is not None else '?'} | {s['n']} | {sum(1 for x in s['ads'] if x <= 10)} | "
                         + ", ".join(i[-5:] for i in s["ids"][:5]) + " |")
    good = [s for s in samples if s["ok"]]
    hdrs = [f"- {s['label']}: `{s['hdr']}`" for s in good if s["hdr"]]
    if hdrs:
        lines += ["", "What Bright Data reported about each connection (any IP or country details it includes):"] + hdrs
    lines += ["", "## Your products: overall position / organic position (— = not in the page)", "", "| Product | " + " | ".join(s["label"] for s in good) + " |", "|---|" + "--:|" * len(good)]
    for pid, sku in sorted(tracked.items(), key=lambda kv: kv[1]):
        if any(pid in s["pos"] for s in good):
            lines.append(f"| {sku} · {pid} | " + " | ".join(f"{s['pos'][pid][0]} / {s['pos'][pid][1]}" if pid in s["pos"] else "—" for s in good) + " |")

    def compare(x, y):
        top = len(set(x["ids"][:10]) & set(y["ids"][:10]))                      # same listings in the first 10
        same_pos = sum(1 for i in range(min(10, len(x["ids"]), len(y["ids"]))) if x["ids"][i] == y["ids"][i])   # same listing in the same place
        both = [p for p in x["pos"] if p in y["pos"]]
        d = [abs(x["pos"][p][0] - y["pos"][p][0]) for p in both]
        return top, (statistics.median(d) if d else None), len(both), same_pos
    same, cross = [], []
    for i, x in enumerate(good):
        for y in good[i + 1:]:
            (same if x["geo"] == y["geo"] else cross).append((x, y, compare(x, y)))
    lines += ["", "## How much do they differ?", ""]
    def summarise(title, pairs):
        if not pairs:
            lines.append(f"- **{title}:** not enough successful fetches to compare.")
            return None
        tops = [c[0] for _, _, c in pairs]; meds = [c[1] for _, _, c in pairs if c[1] is not None]; sp = [c[3] for _, _, c in pairs]
        lines.append(f"- **{title}:** the first 10 listings share {statistics.mean(tops):.1f} of 10 on average and have the same listing in the same place for {statistics.mean(sp):.1f} of 10"
                     + (f"; your products' overall positions differ by a median of {statistics.median(meds):.0f} places" if meds else "") + f" ({len(pairs)} comparison(s)).")
        return statistics.mean(sp), (statistics.median(meds) if meds else None)
    s1 = summarise("Two requests from the SAME kind of exit", same)
    s2 = summarise("A German exit against a no-country exit", cross)
    if s1 and s2:
        lines += ["", "**Reading it:** if the second line is about as different as the first, the exit's location doesn't matter and the movement is eBay's own "
                  "(ads and ordering change from one load to the next). If the German-versus-no-country difference is clearly larger, the location changes "
                  "what eBay shows, and the tracker should use the German exit only (`EBAY_WEB_GEO_MODE: \"country\"`)."]
    langs = {s["lang"] for s in good}
    if "en" in langs:
        lines += ["", "**Warning: at least one fetch came back in ENGLISH**, where eBay translates the keyword and returns a different list."]
    t = bright_data.STATS
    lines += ["", f"Bright Data: {t['requests']} answer(s), {t['timeouts']} timeout(s)."]
    report = "\n".join(lines)
    print(report)
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.write(report + "\n")


if __name__ == "__main__":
    main()
