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
import json
import os
import re
import sys
import time
import types
import urllib.parse

import bright_data
import config_loader
import page_savings as ps
import kaufland_rank_tracker as kfl
import otto_rank_tracker as otto
import requests

TEMU_GOODS_RE = re.compile(r'goods_id"?[=:]\s*"?(\d{9,18})')      # the same pattern the Temu tracker uses (copied: that module needs Playwright)


def temu_ids(page_html: str):
    out = []
    for m in TEMU_GOODS_RE.finditer(page_html or ""):
        if m.group(1) not in out:
            out.append(m.group(1))
    return out


MODULES = {"otto": otto, "kaufland": kfl, "temu": types.SimpleNamespace(extract_ordered_product_ids=temu_ids)}
ID_FIELDS = {"otto": "otto_product_id", "kaufland": "kaufland_product_id", "temu": "temu_goods_id"}
DOMAINS = {"otto": "otto.de", "kaufland": "kaufland.de", "temu": "temu.com"}
EXPECT = {"otto": 'a[href*="/p/"]', "kaufland": 'a[href*="/product/"]', "temu": 'a[href*="goods_id"]'}   # what a REAL results page contains


def page_url(marketplace: str, keyword: str, page: int) -> str:
    q = urllib.parse.quote(keyword)
    if marketplace == "temu":                      # Temu has no numbered pages; the German storefront path is /de
        return f"https://www.temu.com/de/search_result.html?search_key={q}"
    if marketplace == "otto":
        return otto.search_url(q, (page - 1) * otto.OFFSET_STEP)
    return kfl.SEARCH_URL.format(query=q, page=page)


DIRECT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "de-DE,de;q=0.9,en;q=0.5",
}


def direct_fetch(url: str):
    """A plain request from this machine (the GitHub runner), no Bright Data and no browser: (status, html, seconds, error)."""
    t0 = time.monotonic()
    try:
        r = requests.get(url, headers=DIRECT_HEADERS, timeout=30)
        return r.status_code, r.text, time.monotonic() - t0, None
    except requests.RequestException as e:
        return None, "", time.monotonic() - t0, type(e).__name__


BOT_WORDS = ("captcha", "robot", "roboter", "verify", "access denied", "zugriff", "challenge", "blocked", "unusual traffic")


def describe(html: str, ids: list) -> str:
    """What kind of page this was, in plain words (judged on the visible text, not on script addresses)."""
    if ids:
        return "a results page"
    if not html.strip():
        return "empty"
    if ps.refusal(html):
        return "Bright Data itself refused this request (account policy), before reaching the site"
    if ps.challenge(html):
        return f"a {ps.challenge(html)} bot-protection challenge page (the real results are not in it)"
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
    seq = [(url, country, f"country={country.lower()}", False, None), (url, None, "no country setting", False, None)]
    if page == 1:                                  # last resorts: a real browser (slower), then "keep going until real results appear"
        seq.append((url, country, f"browser rendering, country={country.lower()}", True, None))
        seq.append((url, country, "wait for real results (expect), rendered", True, EXPECT[marketplace]))
    return seq


def fetch_page(marketplace: str, keyword: str, page: int, country: str, extractor):
    """Returns (html, ids, attempts); each attempt is a dict describing one request."""
    log = []
    html, ids = "", []
    if marketplace == "otto" and page == 1:
        # Third-party tools report that Otto's SEARCH pages are readable with a plain request (only product pages carry the
        # challenge), so try that first: it costs nothing and uses no Bright Data.
        url0 = page_url(marketplace, keyword, page)
        status, h, secs, err = direct_fetch(url0)
        i = extractor(h) if h.strip() else []
        log.append({"label": "direct from the GitHub runner (no Bright Data)", "url": url0, "status": status or "failed", "chars": len(h), "secs": secs, "ids": len(i),
                    "what": (f"request failed: {err}" if err else describe(h, i)), "hdr": "", "raw": raw_start(h) if (h.strip() and not i and len(h) < 6000) else "",
                    "billed": "no (not Bright Data)", "exit": "GitHub runner", "rendered": "no", "captcha": "—", "captcha_type": "", "req": ""})
        html, ids = h, i
        if i:
            return html, ids, log
    for url, c, label, render, expect in attempts_for(marketplace, keyword, page, country):
        t0 = time.monotonic()
        try:
            resp = bright_data.fetch_response(url, country=c, render=render, debug=True,
                                              extra_headers={"x-unblock-expect": json.dumps({"element": expect})} if expect else None)
        except requests.RequestException as e:
            log.append({"label": label, "url": url, "status": "failed", "chars": 0, "secs": time.monotonic() - t0, "ids": 0,
                        "what": f"request failed: {type(e).__name__}: {str(e)[:100]}", "hdr": "", "raw": ""})
            continue
        h = resp.text
        i = extractor(h) if h.strip() else []
        hdr = "; ".join(f"{k}: {str(v)[:900] if k.lower() == 'x-brd-debug' else str(v)[:100]}" for k, v in resp.headers.items() if k.lower().startswith(("x-brd", "x-luminati")))
        dbg = bright_data.parse_debug(resp.headers)
        log.append({"label": label, "url": url, "status": resp.status_code, "chars": len(h), "secs": time.monotonic() - t0, "ids": len(i),
                    "what": describe(h, i), "hdr": hdr, "raw": raw_start(h) if (h.strip() and not i and len(h) < 6000) else "",
                    "billed": dbg.get("billed", "?"), "exit": (dbg.get("peer_country") or "?").upper(), "rendered": dbg.get("render", "?"),
                    "captcha": dbg.get("captcha_solved", "not reported"), "captcha_type": dbg.get("captcha_type", ""), "req": dbg.get("req_id", "")})
        html, ids = h, i
        if i or ps.refusal(h):          # results found, or Bright Data refused outright: other variants cannot change that
            break
        if marketplace == "otto" and ps.challenge(h):   # known to fail the same way with rendering too; each further try is a billed request
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
    pages = 1 if a.marketplace == "temu" else max(1, min(a.pages, 5))
    idf = ID_FIELDS[a.marketplace]

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
    domain = DOMAINS[a.marketplace]
    try:
        sr = bright_data.success_rate(domain)
        rate = sr.get(domain)
        lines += [f"Bright Data's own statistics for your requests to **{domain}** over the last 7 days: " + (f"**{rate * 100:.0f}% succeeded**, 90% finished within {sr.get('time_p90', 0) / 1000:.1f} s." if rate is not None else "no requests recorded yet."), ""]
    except Exception as e:
        lines += [f"(Bright Data's success statistics for {domain} could not be read: {type(e).__name__}.)", ""]
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
    lines += ["", "## Every request made", "", "| Page | Variant | HTTP | Characters | Seconds | Product IDs | Billed | Exit country | Browser-rendered | CAPTCHA solved | What came back |", "|--:|---|--:|--:|--:|--:|---|---|---|---|---|"]
    for page, log in attempts_all:
        for t in log:
            lines.append(f"| {page} | {t['label']} | {t['status']} | {t['chars']:,} | {t['secs']:.0f} | {t['ids']} | {t['billed']} | {t['exit']} | {t['rendered']} | {t['captcha']}{(' (' + t['captcha_type'] + ')') if t.get('captcha_type') else ''} | {t['what']} |")
    lines.append("")
    for page, log in attempts_all:
        for t in log:
            if t["hdr"] and not t["ids"]:
                lines.append(f"Page {page}, {t['label']} — Bright Data headers: `{t['hdr']}`")
            if t["raw"]:
                lines.append(f"Page {page}, {t['label']} — the page itself, from its start (so you can see what it is): `{t['raw']}`")
    if any(t["raw"] or (t["hdr"] and not t["ids"]) for _, log in attempts_all for t in log):
        lines.append("")
    refused = [t for _, log in attempts_all for t in log if t["what"].startswith("Bright Data itself refused")]
    if refused:
        lines += ["**Bright Data refused the request itself, before it reached " + a.marketplace.capitalize() + ".** This is a permission on your "
                  "Bright Data account, not a fault in the tracker or the address. Read its message above (for sites that need it, "
                  "it asks for the KYC verification form at brightdata.com/cp/kyc, which an account owner completes). "
                  "Once approved, run this check again.", ""]
    log1 = attempts_all[0][1] if attempts_all else []
    rendered_ok = [t for t in log1 if "rendering" in t["label"] and t["ids"]]
    expect_ok = [t for t in log1 if "expect" in t["label"] and t["ids"]]
    if expect_ok:
        lines += ["**Waiting for real results worked** (the `expect` feature): Web Unlocker kept unlocking until product links appeared. "
                  "Note that with Manual 'expect' elements switched on in the zone, Bright Data bills 100% of requests, failed ones included, so I would only use it for this marketplace.", ""]
    elif rendered_ok:
        lines += ["**Browser rendering worked** where the plain requests did not. The tracker can use it for this marketplace (slower, and I would set it as an option).", ""]
    elif log1 and not any(t["ids"] for t in log1) and any(("shell" in t["what"]) or ("bot check" in t["what"]) or ("bot-protection" in t["what"]) for t in log1):
        if any("rendering" in t["label"] for t in log1):
            lines += ["**Even rendering and waiting for results did not get past the protection.** If the last variant ignored its `expect` request, the feature is not switched on in the zone "
                      "(Configuration > Advanced settings > Manual 'expect' elements). Other options: Premium domains in the zone, Scraper Studio (an AI-built scraper that Bright Data runs itself) or the Browser API.", ""]
        else:
            lines += ["**The challenge page came back both directly and through Web Unlocker.** The rendering and wait-for-results variants were skipped: on otto.de they have already "
                      "failed the same way, and each one is a billed request.", ""]
    if log1 and log1[0]["label"].startswith("direct") and log1[0]["ids"]:
        lines += ["**A plain request from the GitHub runner worked: Otto's search page can be read with no Bright Data at all.** That would make Otto free to track. "
                  "Caveat: GitHub's servers use well-known datacenter addresses, so Otto could block them later; this check shows how it behaves today.", ""]
    if any(t.get("billed") == "true" and not t["ids"] for t in log1):
        lines += ["**Note: Bright Data billed at least one request that returned no products.** Check Billing, and keep the number of such requests small.", ""]
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
