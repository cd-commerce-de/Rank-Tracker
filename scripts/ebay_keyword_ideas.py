"""
eBay keyword idea finder — run this by hand when you want to expand your
keyword list, it's not part of the daily automated tracker.

DataRova's keyword panel shows search volume and conversion numbers because
it's built on licensed Amazon search-term data — there's no free equivalent
of that for eBay. What eBay *does* expose publicly is its autocomplete
endpoint (the same suggestions you see typing into the eBay search box).
This script queries that for a seed word, optionally expanding with every
letter a-z after it ("wagenheber a", "wagenheber b", ...) the way eBay
keyword-research tools typically do, to surface more long-tail phrases.

No volume/conversion numbers — just real phrases eBay itself suggests to
buyers. Review the output and copy whichever ones are actually relevant
into your products & keywords table yourself; this script never edits it.

Usage:
    python scripts/ebay_keyword_ideas.py "wagenheber" --country DE
    python scripts/ebay_keyword_ideas.py "wagenheber" --country DE --no-expand
"""

import argparse
import json
import string
import sys
import time
import urllib.parse

import requests

AUTOSUG_URL = "https://autosug.ebay.com/autosug"

# eBay's internal numeric site IDs for the autosuggest endpoint (different
# from the marketplace IDs the Browse API uses).
SITE_IDS = {
    "DE": "77", "US": "0", "GB": "3", "FR": "71", "IT": "101",
    "ES": "186", "AT": "77", "NL": "146", "PL": "212",
}


def fetch_suggestions(term, site_id):
    resp = requests.get(
        AUTOSUG_URL,
        params={"kwd": term, "sId": site_id, "fmt": "osr"},
        headers={"User-Agent": "Mozilla/5.0 (rank-tracker keyword research tool)"},
        timeout=15,
    )
    resp.raise_for_status()
    # Response is OpenSearch-suggestions JSON: [query, [suggestion, ...], [], []]
    data = resp.json()
    return data[1] if len(data) > 1 else []


def main():
    parser = argparse.ArgumentParser(description="Find eBay autocomplete keyword ideas for a seed word.")
    parser.add_argument("seed", help="Seed keyword, e.g. 'wagenheber'")
    parser.add_argument("--country", default="DE", help="Country code (DE, US, GB, FR, IT, ES, AT, NL, PL)")
    parser.add_argument("--no-expand", action="store_true", help="Only query the seed itself, skip a-z expansion")
    parser.add_argument("--out", default=None, help="Optional path to save results as JSON")
    args = parser.parse_args()

    site_id = SITE_IDS.get(args.country.upper())
    if not site_id:
        print(f"Unknown country '{args.country}'. Known: {', '.join(SITE_IDS)}", file=sys.stderr)
        sys.exit(1)

    found = set()

    print(f"Seed: '{args.seed}' ({args.country})")
    for s in fetch_suggestions(args.seed, site_id):
        found.add(s)

    if not args.no_expand:
        for letter in string.ascii_lowercase:
            term = f"{args.seed} {letter}"
            try:
                for s in fetch_suggestions(term, site_id):
                    found.add(s)
            except requests.HTTPError as e:
                print(f"  ! '{term}' failed: {e}", file=sys.stderr)
            time.sleep(0.3)  # be polite — this is a public, shared endpoint

    results = sorted(found)
    print(f"\nFound {len(results)} suggestion(s):\n")
    for r in results:
        print(f"  {r}")

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        print(f"\nSaved to {args.out}")


if __name__ == "__main__":
    main()
