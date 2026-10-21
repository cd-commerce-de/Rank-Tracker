"""
Test ONE keyword on Otto or Kaufland, through the same Bright Data zone and the same page-reading code the daily tracker
uses, and show what comes back, so the untested parts (page size, pagination, product-ID matching) can be checked
against a real page. Reads your products from the live sheet, so it works before the daily run has seen them.
Costs 1-2 Bright Data requests per page read (an empty answer is retried once). Saves nothing: ranks.json is untouched.

    python scripts/marketplace_check_keyword.py otto "wagenheber 2,5t" --pages 2
    python scripts/marketplace_check_keyword.py kaufland "wagenheber" --project WGH25
"""

import argparse
import html as htmllib
import os
import re
import sys
import time
import urllib.parse

import bright_data
import config_loader
import kaufland_rank_tracker as kfl
import otto_rank_tracker as otto
import requests

MODULES = {"otto": otto, "kaufland": kfl}


def page_url(marketplace: str, keyword: str, page: int) -> str:
    q = urllib.parse.quote(keyword)
    if marketplace == "otto":
        return otto.search_url(q, (page - 1) * otto.OFFSET_STEP)
    return kfl.SEARCH_URL.format(query=q, page=page)


BOT_WORDS = ("captcha", "robot", "roboter", "verify", "access denied", "zugriff", "challenge", "blocked", "unusual traffic")


def describe(html: str, ids: list) -> str:
    """What kind of page this was, in plain words (judged on the visible text, not on script addresses)."""
    if ids:
        return "a results page"
    if not html.strip():
        return "empty"
    noscript = " ".join(re.findall(r"<noscript\b[^>]*>(.*?)</noscript>", html, flags=re.S | re.I))
    body = re.sub(r"<(script|style|noscript)\b.*?</\1>", " ", html, flags=re.S | re.I)
    visible = re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", " ", body))).strip()
    if any(w in visible.lower() for w in BOT_WORDS):
        return "looks like a bot check / access denied page"
    if not visible:
        extra = ""
        if re.search(r"javascript|enable js|aktivieren", noscript, re.I):
            extra += "; it asks for JavaScript"
        if "challenge" in html.lower():
            extra += "; it loads a 'challenge' script"
        return "a script-only shell (no visible text): the results are not in it" + extra
    return "a page with text but no product IDs"


def raw_start(html: str, n: int = 700) -> str:
    return re.sub(r"\s+", " ", html)[:n].replace("`", "'")


def attempts_for(marketplace: str, keyword: str, page: int, country: str):
    """The requests tried for one page, in order, stopping at the first that returns product IDs. First pages get more variants."""
    url = page_url(marketplace, keyword, page)
    seq = [(url, country, f"country={country.lower()}"), (url, None, "no country setting")]
    if marketplace == "otto" and page == 1:       # the old tracker address, to see whether the '?o=0' form behaves differently
        seq.append((otto.SEARCH_URL.format(query=urllib.parse.quote(keyword), offset=0), country, f"old address with ?o=0, country={country.lower()}"))
    return seq


def fetch_page(marketplace: str, keyword: str, page: int, country: str, extractor):
    """Returns (html, ids, attempts); each attempt is a dict describing one request."""
    log = []
    html, ids = "", []
    for url, c, label in attempts_for(marketplace, keyword, page, country):
        t0 = time.monotonic()
        try:
            resp = bright_data.fetch_response(url, country=c)
        except requests.RequestException as e:
            log.append({"label": label, "url": url, "status": "failed", "chars": 0, "secs": time.monotonic() - t0, "ids": 0,
                        "what": f"request failed: {type(e).__name__}: {str(e)[:100]}", "hdr": "", "raw": ""})
            continue
        h = resp.text
        i = extractor(h) if h.strip() else []
        hdr = "; ".join(f"{k}: {str(v)[:100]}" for k, v in resp.headers.items() if k.lower().startswith(("x-brd", "x-luminati")))
        log.append({"label": label, "url": url, "status": resp.status_code, "chars": len(h), "secs": time.monotonic() - t0, "ids": len(i),
                    "what": describe(h, i), "hdr": hdr, "raw": raw_start(h) if (h.strip() and not i and len(h) < 6000) else ""})
        html, ids = h, i
        if i:
            break
    return html, ids, log


def visible_start(html: str, n: int = 300) -> str:
    text = re.sub(r"<(script|style)\b.*?</\1>", " ", html, flags=re.S | re.I)
    text = re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", " ", text))).strip()
    return text[:n].replace("`", "'")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("marketplace", choices=sorted(MODULES))
    ap.add_argument("keyword")
    ap.add_argument("--pages", type=int, default=2)
    ap.add_argument("--country", default="DE")
    ap.add_argument("--project", default="", help="only highlight products of projects whose name contains this text")
    a = ap.parse_args()
    mod = MODULES[a.marketplace]
    pages = max(1, min(a.pages, 5))
    idf = "otto_product_id" if a.marketplace == "otto" else "kaufland_product_id"

    tracked = {}
    try:
        for p in config_loader.load_projects():
            if a.project and a.project.lower() not in p["project_name"].lower():
                continue
            for it in p.get("items", []):
                if it.get("marketplace") == a.marketplace and it.get(idf):
                    tracked.setdefault(it[idf], []).append((p["project_name"], it.get("sku", "")))
    except Exception as e:                        # the check itself can still run without the sheet
        print(f"(could not read the sheet: {e})", file=sys.stderr)

    lines = [f"# {a.marketplace.capitalize()} check — “{a.keyword}”", "",
             f"Reads up to {pages} results page(s) through your Bright Data zone, exactly as the daily tracker does. "
             f"Products found in your sheet for {a.marketplace}" + (f" (projects containing “{a.project}”)" if a.project else "") + f": **{len(tracked)}**.", ""]
    ordered, per_page, attempts_all = [], [], []
    for page in range(1, pages + 1):
        html, ids, log = fetch_page(a.marketplace, a.keyword, page, a.country, mod.extract_ordered_product_ids)
        new = [i for i in ids if i not in ordered]
        per_page.append((page, log[-1]["url"] if log else "", len(html), len(ids), len(new), len(ids) - len(new)))
        attempts_all.append((page, log))
        ordered.extend(new)
        if not ids:
            break

    lines += ["## What each page returned", "", "| Page | Characters | Product IDs on it | New (not on an earlier page) | Repeated from earlier pages |", "|--:|--:|--:|--:|--:|"]
    for page, url, n_chars, n_ids, n_new, n_overlap in per_page:
        lines.append(f"| {page} | {n_chars:,} | {n_ids} | {n_new} | {n_overlap} |")
    lines += ["", "## Every request made", "", "| Page | Variant | HTTP | Characters | Seconds | Product IDs | What came back |", "|--:|---|--:|--:|--:|--:|---|"]
    for page, log in attempts_all:
        for t in log:
            lines.append(f"| {page} | {t['label']} | {t['status']} | {t['chars']:,} | {t['secs']:.0f} | {t['ids']} | {t['what']} |")
    lines.append("")
    for page, log in attempts_all:
        for t in log:
            if t["hdr"] and not t["ids"]:
                lines.append(f"Page {page}, {t['label']} — Bright Data headers: `{t['hdr']}`")
            if t["raw"]:
                lines.append(f"Page {page}, {t['label']} — the page itself, from its start (so you can see what it is): `{t['raw']}`")
    if any(t["raw"] or (t["hdr"] and not t["ids"]) for _, log in attempts_all for t in log):
        lines.append("")
    if per_page and per_page[0][3] == 0:
        lines += ["**Page 1 returned no product IDs in any variant.** The daily tracker treats this as a failed read: it saves nothing "
                  "for the keyword that day (never a 'not found') and stops the run after 5 such keywords in a row.", ""]

    sizes = [p[3] for p in per_page if p[3]]
    if sizes:
        lines.append(f"**Listings read: {len(ordered)}** in page order. IDs per page: {', '.join(str(s) for s in sizes)}"
                     + (f" (the tracker assumes {otto.OFFSET_STEP} per page for Otto)" if a.marketplace == "otto" else "") + ".")
        if len(per_page) > 1 and per_page[1][3] and per_page[1][5] >= 0.8 * per_page[1][3]:
            lines.append("**Warning: page 2 repeated page 1's listings**, so the pagination address does not work; "
                         "tracked positions beyond page 1 would be wrong. Tell whoever maintains this.")
        lines.append("")

    lines += ["## Your products", ""]
    if not tracked:
        lines.append(f"No {a.marketplace} products with a product ID were found in your sheet" + (f" for projects containing “{a.project}”" if a.project else "") + ". "
                     "Check the Products tab: `marketplace` must be exactly `" + a.marketplace + "` and `product_id` filled in.")
    else:
        lines += ["| Position | SKU | Product ID | Project |", "|--:|---|---|---|"]
        found = 0
        for pid, owners in sorted(tracked.items(), key=lambda kv: ordered.index(kv[0]) if kv[0] in ordered else 10**6):
            pos = ordered.index(pid) + 1 if pid in ordered else None
            found += pos is not None
            for name, sku in owners:
                lines.append(f"| {pos if pos else '—'} | {sku or '—'} | {pid} | {name} |")
        lines += ["", f"{found} of {len(tracked)} product(s) found in the {len(ordered)} listings read" + ("" if found else f" (the daily tracker would show them as not found in the top {len(ordered) or '?'})") + "."]
    if ordered:
        lines += ["", "## The first 15 listings read", ""]
        for i, pid in enumerate(ordered[:15], 1):
            lines.append(f"{i}. `{pid}`" + ("  ★ yours" if pid in tracked else ""))
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
