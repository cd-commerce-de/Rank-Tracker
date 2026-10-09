"""
Show what eBay's search API returns for ONE keyword, so it can be compared with
what ebay.de shows in the browser.

For every result (in eBay's order) it prints: position, "organic" position (not
counting paid Promoted Listings), item ID, seller, whether eBay flags it as a
paid placement, price and title. Your listings are marked:
   *** TRACKED ***  the item IDs from your products tab
   *** YOURS ***    any listing from --seller (e.g. cd_commerce)

Run it from GitHub: Actions -> "Check an eBay keyword" -> Run workflow.
The table is also written to the run's summary page.

Usage (locally, with the two eBay secrets in the environment):
    python scripts/ebay_check_keyword.py "anhängerplane 211x116" --seller cd_commerce
"""

import argparse
import os
import sys

import requests

import config_loader
import ebay_rank_tracker as e


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


def fetch_results(token, marketplace_id, keyword, pages):
    out = []
    for page in range(pages):
        items = e.search_page(token, marketplace_id, keyword, page * e.RESULTS_PER_PAGE)
        if not items:
            break
        out.extend(items)
    return out


def price_text(p):
    if not p:
        return ""
    return f"{p.get('value', '?')} {p.get('currency', '')}".strip()


def main():
    ap = argparse.ArgumentParser(description="Show eBay API results for one keyword")
    ap.add_argument("keyword")
    ap.add_argument("--country", default="DE")
    ap.add_argument("--seller", default="", help="your eBay seller name, to highlight your listings")
    ap.add_argument("--show", type=int, default=40, help="how many results to print")
    ap.add_argument("--pages", type=int, default=3, help="result pages to scan (200 each)")
    args = ap.parse_args()

    cid, secret = os.environ.get("EBAY_CLIENT_ID"), os.environ.get("EBAY_CLIENT_SECRET")
    if not cid or not secret:
        print("EBAY_CLIENT_ID / EBAY_CLIENT_SECRET not set.", file=sys.stderr)
        sys.exit(1)

    marketplace_id = e.MARKETPLACE_IDS.get(args.country.upper(), "EBAY_DE")
    token = e.get_access_token(cid, secret)
    results = fetch_results(token, marketplace_id, args.keyword, args.pages)
    tracked = tracked_item_ids()
    seller = args.seller.strip().lower()

    lines = []
    w = lines.append
    w(f"## eBay results for “{args.keyword}” ({marketplace_id})")
    w("")
    w(f"{len(results)} results scanned, in eBay's API order (Best Match). "
      f"`Paid` = eBay flags it as a Promoted Listing. `Organic #` skips paid results.")
    w("")
    w("| # | Organic # | Item ID | Seller | Paid | Price | Title | |")
    w("|--:|--:|---|---|:-:|--:|---|---|")
    organic = 0
    mine = []   # (position, organic position, item, tag)
    for pos, item in enumerate(results, 1):
        paid = bool(item.get("priorityListing"))
        if not paid:
            organic += 1
        legacy = str(item.get("legacyItemId") or "")
        sname = (item.get("seller") or {}).get("username", "")
        tag = ""
        if legacy in tracked:
            tag = "**★ TRACKED**"
        elif seller and sname.lower() == seller:
            tag = "**★ YOURS**"
        if tag:
            mine.append((pos, None if paid else organic, item, tag))
        if pos <= args.show or tag:
            title = (item.get("title") or "").replace("|", "/")
            w(f"| {pos} | {'—' if paid else organic} | {legacy} | {sname} | {'yes' if paid else ''} | {price_text(item.get('price'))} | {title[:70]} | {tag} |")
    w("")
    w("### Your listings in these results")
    if not mine:
        w(f"None of your listings (seller “{args.seller or '—'}”, or the tracked item IDs) appear in the "
          f"first {len(results)} results.")
    for pos, org, item, tag in mine:
        legacy = str(item.get("legacyItemId") or "")
        name = tracked.get(legacy, "")
        w(f"- {tag.replace('*', '')} item **{legacy}** {('(' + name + ') ') if name else ''}— position **{pos}**"
          + (f", organic position **{org}**" if org else ", flagged as a paid placement") + f" — {(item.get('title') or '')[:70]}")
    missing = [f"{i} ({n})" for i, n in tracked.items() if i not in {str(m[2].get('legacyItemId')) for m in mine}]
    if missing:
        w("")
        w("Tracked item IDs NOT found in these results: " + ", ".join(missing))
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
        print(f"eBay request failed: {ex}", file=sys.stderr)
        sys.exit(1)
