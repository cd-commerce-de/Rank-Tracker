"""
Show what eBay returns for ONE keyword, so it can be compared with ebay.de in your browser.

Two views (choose with --source):
  api   eBay's search API (what the standard eBay tracker uses)
  web   the real ebay.de results page, read through Bright Data (what a shopper sees; paid
        "Anzeige" slots are recognised)
  both  both tables one after the other  [default]

Your listings are marked:  ★ TRACKED  = the eBay item IDs on your Products tab
                           ★ YOURS    = any listing from --seller (e.g. cd_commerce)

Run it from GitHub: Actions -> "Check an eBay keyword" -> Run workflow. The tables are also
written to the run's summary page.
"""

import argparse
import os
import sys

import requests

import bright_data
import config_loader
import ebay_rank_tracker as e
import ebay_web


def tracked_item_ids():
    try:
        projects = config_loader.load_projects()
    except Exception as ex:  # the sheet may not be reachable; the check still works without it
        print(f"(could not read your products sheet: {ex})", file=sys.stderr)
        return {}
    ids = {}
    for p in projects:
        for item in p.get("items", []):
            if item.get("marketplace") == "ebay" and item.get("ebay_item_id"):
                ids[str(item["ebay_item_id"])] = item.get("label") or p["project_name"]
    return ids


def price_text(p):
    return f"{p.get('value', '?')} {p.get('currency', '')}".strip() if p else ""


def tag_for(legacy, text, tracked, seller):
    if legacy in tracked:
        return "**★ TRACKED**"
    if seller and seller in text.lower():
        return "**★ YOURS**"
    return ""


def summarize(mine, tracked, found_ids, total, unit):
    out = ["", "### Your listings in these results"]
    if not mine:
        out.append(f"None of your listings appear in the first {total} {unit}.")
    for pos, org, ad, legacy, title, tag in mine:
        name = tracked.get(legacy, "")
        where = f"position **{pos}**" + (f", organic position **{org}**" if org else ", paid placement (Anzeige)")
        out.append(f"- {tag.replace('*', '')} item **{legacy}** {('(' + name + ') ') if name else ''}— {where} — {title[:70]}")
    missing = [f"{i} ({n})" for i, n in tracked.items() if i not in found_ids]
    if missing:
        out += ["", "Tracked item IDs NOT found in these results: " + ", ".join(missing)]
    return out


def api_section(keyword, country, seller, show, pages, tracked):
    cid, secret = os.environ.get("EBAY_CLIENT_ID"), os.environ.get("EBAY_CLIENT_SECRET")
    if not cid or not secret:
        return ["## eBay API", "", "EBAY_CLIENT_ID / EBAY_CLIENT_SECRET are not set, so the API view was skipped."]
    mp = e.MARKETPLACE_IDS.get(country.upper(), "EBAY_DE")
    token = e.get_access_token(cid, secret)
    results = []
    for page in range(pages):
        items = e.search_page(token, mp, keyword, page * e.RESULTS_PER_PAGE)
        if not items:
            break
        results.extend(items)
    lines = [f"## 1) eBay search API — “{keyword}” ({mp})", "",
             f"{len(results)} results, in the API's order (Best Match). `Paid` = eBay flags it as a Promoted Listing. `Organic #` skips paid results.", "",
             "| # | Organic # | Item ID | Seller | Paid | Price | Title | |", "|--:|--:|---|---|:-:|--:|---|---|"]
    organic, mine, found = 0, [], set()
    for pos, item in enumerate(results, 1):
        paid = bool(item.get("priorityListing"))
        organic += 0 if paid else 1
        legacy = str(item.get("legacyItemId") or "")
        sname = (item.get("seller") or {}).get("username", "")
        tag = tag_for(legacy, sname, tracked, seller)
        if tag:
            mine.append((pos, None if paid else organic, paid, legacy, item.get("title") or "", tag)); found.add(legacy)
        if pos <= show or tag:
            title = (item.get("title") or "").replace("|", "/")
            lines.append(f"| {pos} | {'—' if paid else organic} | {legacy} | {sname} | {'yes' if paid else ''} | {price_text(item.get('price'))} | {title[:70]} | {tag} |")
    return lines + summarize(mine, tracked, found, len(results), "results")


def web_section(keyword, country, seller, show, pages, tracked):
    if not os.environ.get("BRIGHTDATA_API_KEY") or not os.environ.get("BRIGHTDATA_ZONE"):
        return ["## ebay.de page", "", "BRIGHTDATA_API_KEY / BRIGHTDATA_ZONE are not set, so the website view was skipped."]
    cards = []
    for page in range(1, pages + 1):
        html = bright_data.fetch_html(ebay_web.search_url(keyword, country, page), country=country)
        got = ebay_web.parse_cards(html)
        if not got:
            break
        cards.extend(got)
    lines = [f"## 2) The ebay.de results page — “{keyword}” ({country.upper()})", "",
             f"{len(cards)} listings read from the page, in page order (as a shopper sees them). `Ad` = labelled “Anzeige”. `Organic #` skips ads.", "",
             "| # | Organic # | Item ID | Ad | Text on the card | |", "|--:|--:|---|:-:|---|---|"]
    organic, mine, found = 0, [], set()
    for pos, c in enumerate(cards, 1):
        organic += 0 if c["sponsored"] else 1
        tag = tag_for(c["id"], c["text"], tracked, seller)
        if tag:
            mine.append((pos, None if c["sponsored"] else organic, c["sponsored"], c["id"], c["text"], tag)); found.add(c["id"])
        if pos <= show or tag:
            lines.append(f"| {pos} | {'—' if c['sponsored'] else organic} | {c['id']} | {'yes' if c['sponsored'] else ''} | {c['text'][:90].replace('|', '/')} | {tag} |")
    if not cards:
        lines.append("")
        lines.append("**No listings could be read from the page** (blocked by eBay, or its layout changed).")
    return lines + summarize(mine, tracked, found, len(cards), "listings")


def main():
    ap = argparse.ArgumentParser(description="Show eBay results for one keyword")
    ap.add_argument("keyword")
    ap.add_argument("--country", default="DE")
    ap.add_argument("--seller", default="", help="your eBay seller name, to highlight your listings")
    ap.add_argument("--source", choices=["api", "web", "both"], default="both")
    ap.add_argument("--show", type=int, default=30, help="how many results to print")
    ap.add_argument("--pages", type=int, default=None, help="result pages to scan (default: 2 for the API view, 1 for the website view because each page costs a Bright Data request)")
    args = ap.parse_args()

    tracked = tracked_item_ids()
    seller = args.seller.strip().lower()
    lines = []
    if args.source in ("api", "both"):
        lines += api_section(args.keyword, args.country, seller, args.show, args.pages or 2, tracked) + [""]
    if args.source in ("web", "both"):
        lines += web_section(args.keyword, args.country, seller, args.show, args.pages or 1, tracked) + [""]
    text = "\n".join(lines)
    print(text)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write(text + "\n")


if __name__ == "__main__":
    try:
        main()
    except requests.RequestException as ex:
        print(f"request failed: {ex}", file=sys.stderr)
        sys.exit(1)
