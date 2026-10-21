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
        return otto.SEARCH_URL.format(query=q, offset=(page - 1) * otto.OFFSET_STEP)
    return kfl.SEARCH_URL.format(query=q, page=page)


def fetch(url: str, country: str):
    """Same order as the tracker: the country setting first, then none. Returns (html, notes)."""
    notes, html = [], ""
    for label, c in ((f"country={country.lower()}", country), ("no country setting", None)):
        t0 = time.monotonic()
        try:
            resp = bright_data.fetch_response(url, country=c)
        except requests.RequestException as e:
            notes.append(f"  - {label}: failed after {time.monotonic() - t0:.0f} s: `{type(e).__name__}: {str(e)[:120]}`")
            continue
        html = resp.text
        hdr = "; ".join(f"{k}: {str(v)[:100]}" for k, v in resp.headers.items() if k.lower().startswith(("x-brd", "x-luminati")))
        notes.append(f"  - {label}: HTTP {resp.status_code}, {len(html):,} characters, {time.monotonic() - t0:.0f} s" + (f"; Bright Data headers: `{hdr}`" if hdr and not html.strip() else ""))
        if html.strip():
            return html, notes
    return "", notes


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
    ordered, per_page, notes_all = [], [], []
    for page in range(1, pages + 1):
        url = page_url(a.marketplace, a.keyword, page)
        html, notes = fetch(url, a.country)
        ids = mod.extract_ordered_product_ids(html) if html.strip() else []
        new = [i for i in ids if i not in ordered]
        overlap = len(ids) - len(new)
        per_page.append((page, url, len(html), len(ids), len(new), overlap))
        notes_all.append((page, notes, html))
        ordered.extend(new)
        if not ids:
            break

    lines += ["## What each page returned", "", "| Page | Characters | Product IDs on it | New (not on an earlier page) | Repeated from earlier pages |", "|--:|--:|--:|--:|--:|"]
    for page, url, n_chars, n_ids, n_new, n_overlap in per_page:
        lines.append(f"| {page} | {n_chars:,} | {n_ids} | {n_new} | {n_overlap} |")
    lines.append("")
    for page, notes, html in notes_all:
        lines.append(f"Page {page}, Bright Data:")
        lines += notes
        if not mod.extract_ordered_product_ids(html):
            if html.strip():
                m = re.search(r"<title[^>]*>(.*?)</title>", html, re.S | re.I)
                lines.append(f"  - **no product IDs recognised.** Page title: `{re.sub(chr(10), ' ', htmllib.unescape(m.group(1)).strip())[:120].replace(chr(96), chr(39)) if m else 'none'}`; the page starts: `{visible_start(html)}`")
            else:
                lines.append("  - **an empty page**: the marketplace rejected the request. Try again; the tracker retries this and never saves it as 'not found'.")
    lines.append("")

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
