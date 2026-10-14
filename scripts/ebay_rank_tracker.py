"""
eBay keyword rank tracker (project-based).

Reads the products & keywords table (see config_loader.py) — each project groups one or more "items"
(a specific marketplace+country listing of that product). For every
keyword under an eBay item, this searches eBay's Browse API (the same
"Best Match" order shoppers see) and records your listing's position.

Results are appended to docs/data/ranks.json as flat rows, one per
project + item + keyword + day. The dashboard (docs/index.html) reads
that file directly.

This script only handles items where "marketplace" is "ebay" — it skips
any future Otto/Kaufland/Temu items, which will get their own scripts
(scraping, not an API) in a later phase.

Requires two secrets (see README.md):
  EBAY_CLIENT_ID
  EBAY_CLIENT_SECRET
"""

import base64
import json
import os
import sys
import urllib.parse
import time
from datetime import date, datetime, timezone
from pathlib import Path

import requests

import config_loader

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "docs" / "data" / "ranks.json"

TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token"
SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search"

MARKETPLACE_IDS = {
    "DE": "EBAY_DE", "US": "EBAY_US", "GB": "EBAY_GB", "FR": "EBAY_FR",
    "IT": "EBAY_IT", "ES": "EBAY_ES", "AT": "EBAY_AT", "NL": "EBAY_NL",
    "PL": "EBAY_PL",
}

RESULTS_PER_PAGE = 200
MAX_PAGES = 3  # top 600 results scanned per keyword


RETRY_STATUS = {429, 500, 502, 503, 504}


def _with_retries(send, attempts=4):
    """
    Call send() (which returns a requests.Response). Timeouts, dropped
    connections and temporary server errors (429/5xx) are retried a few times
    with a growing pause, instead of failing the whole run on one slow reply.
    """
    for attempt in range(1, attempts + 1):
        try:
            resp = send()
            if resp.status_code in RETRY_STATUS and attempt < attempts:
                raise requests.ConnectionError(f"HTTP {resp.status_code}")
            resp.raise_for_status()
            return resp
        except (requests.Timeout, requests.ConnectionError) as e:
            if attempt == attempts:
                raise
            wait = 3 * 2 ** (attempt - 1)
            print(f"  ... {type(e).__name__}; retrying in {wait}s (attempt {attempt}/{attempts})", file=sys.stderr)
            time.sleep(wait)


def get_access_token(client_id: str, client_secret: str) -> str:
    creds = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    resp = _with_retries(lambda: requests.post(
        TOKEN_URL,
        headers={"Authorization": f"Basic {creds}", "Content-Type": "application/x-www-form-urlencoded"},
        data={"grant_type": "client_credentials", "scope": "https://api.ebay.com/oauth/api_scope"},
        timeout=30,
    ))
    return resp.json()["access_token"]


# One search per keyword per run, shared by every product that is checked for
# that keyword. Only the few fields we need are kept, so memory stays small.
_PAGE_CACHE = {}
_TOTALS = {}   # (marketplace, keyword, buyer) -> how many matching items eBay says exist in total

# "Search as a buyer in <country>": eBay documents the X-EBAY-C-ENDUSERCTX header (contextualLocation) and the
# deliveryCountry filter for telling the API where the buyer is. Used by the keyword check to test whether it
# brings the API closer to what shoppers see; the daily tracker does not use it unless you ask for it.
BUYER_CONTEXT = {
    "DE": ("DE", "10115"), "AT": ("AT", "1010"), "GB": ("GB", "SW1A 1AA"), "US": ("US", "10001"),
    "FR": ("FR", "75001"), "IT": ("IT", "00100"), "ES": ("ES", "28001"), "NL": ("NL", "1012"), "PL": ("PL", "00-001"),
}


def search_page(token, marketplace_id, keyword, offset, buyer=None):
    """One page (200 results) of eBay's search API. `buyer` = (country, zip) to search as a buyer in that place."""
    key = (marketplace_id, keyword, offset, buyer)
    if key not in _PAGE_CACHE:
        headers = {
            "Authorization": f"Bearer {token}",
            "X-EBAY-C-MARKETPLACE-ID": marketplace_id,
            "Content-Type": "application/json",
        }
        params = {"q": keyword, "limit": RESULTS_PER_PAGE, "offset": offset}
        if buyer:
            headers["X-EBAY-C-ENDUSERCTX"] = "contextualLocation=" + urllib.parse.quote(f"country={buyer[0]},zip={buyer[1]}", safe="")
            params["filter"] = f"deliveryCountry:{buyer[0]}"
        resp = _with_retries(lambda: requests.get(SEARCH_URL, headers=headers, params=params, timeout=60))
        data = resp.json()
        if offset == 0:
            _TOTALS[(marketplace_id, keyword, buyer)] = data.get("total")
        _PAGE_CACHE[key] = [
            {
                "legacyItemId": i.get("legacyItemId"),
                "itemId": i.get("itemId"),
                "title": i.get("title", ""),
                "seller": {"username": (i.get("seller") or {}).get("username", "")},
                "priorityListing": bool(i.get("priorityListing")),   # true = part of a Promoted Listings campaign (paid)
                "price": i.get("price"),
            }
            for i in data.get("itemSummaries", [])
        ]
    return _PAGE_CACHE[key]


def find_rank_detail(token, marketplace_id, keyword, item_config):
    """
    Search up to MAX_PAGES pages and report where "your" listing is.

    Returns a dict:
      rank          position in eBay's result list (what we have always recorded)
      organic_rank  the same position after removing paid placements of OTHER results
                    (listings eBay flags "priorityListing" = part of a Promoted Listings
                    campaign). The closest thing to an "organic" position the API allows.
      promoted      True/False: is YOUR listing itself flagged as a paid placement?
      item_id, title
    or the same keys all None when the listing is not in the results scanned.

    If item_config has an ebay_item_id it is matched exactly against each result's
    legacyItemId (immune to title changes). Otherwise it falls back to seller
    username + title words.
    """
    target_item_id = item_config.get("ebay_item_id")
    seller_username = item_config.get("ebay_seller_username", "")
    title_contains = item_config.get("title_contains", [])

    position = 0
    organic = 0
    for page in range(MAX_PAGES):
        items = search_page(token, marketplace_id, keyword, page * RESULTS_PER_PAGE)
        if not items:
            break
        for item in items:
            position += 1
            promoted = bool(item.get("priorityListing"))
            title = item.get("title", "")

            if target_item_id:
                is_mine = str(item.get("legacyItemId") or "") == str(target_item_id)
            else:
                seller = (item.get("seller") or {}).get("username", "")
                is_mine = seller.lower() == seller_username.lower() and (
                    not title_contains or all(t.lower() in title.lower() for t in title_contains))

            if is_mine:
                # counted among the organic positions even if it is itself flagged, so a
                # promoted listing is never reported as "not ranking organically"
                return {"rank": position, "organic_rank": organic + 1, "promoted": promoted,
                        "item_id": item.get("itemId"), "title": title}
            if not promoted:
                organic += 1
    return {"rank": None, "organic_rank": None, "promoted": None, "item_id": None, "title": None}


def find_rank(token, marketplace_id, keyword, item_config):
    """Older 3-value form: (rank, item_id, title)."""
    d = find_rank_detail(token, marketplace_id, keyword, item_config)
    return d["rank"], d["item_id"], d["title"]


def load_json(path: Path, default):
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return default


def save_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def main():
    client_id = os.environ.get("EBAY_CLIENT_ID")
    client_secret = os.environ.get("EBAY_CLIENT_SECRET")
    if not client_id or not client_secret:
        print("ERROR: EBAY_CLIENT_ID / EBAY_CLIENT_SECRET not set.", file=sys.stderr)
        sys.exit(1)

    projects = config_loader.load_projects()
    if not projects:
        print("No products configured yet (add products and keywords to your tracking sheet) — nothing to do.")
        return

    token = get_access_token(client_id, client_secret)
    skipped_web = [i["item_key"] for p in projects for i in p.get("items", []) if i.get("marketplace") == "ebay" and i.get("source") == "web"]
    api_items = [i for p in projects for i in p.get("items", []) if i.get("marketplace") == "ebay" and i.get("source") != "web"]
    print(f"eBay API tracker: {len(api_items)} product(s) to check; {len(skipped_web)} product(s) are set to source=web "
          f"and are left to the website tracker (a separate workflow step).")
    if skipped_web and not api_items:
        print("  NOTE: every eBay product is set to source=web, so this API step checks nothing. If the website "
              "step is missing from the workflow or the Bright Data secrets are not set, nothing is saved at all.", file=sys.stderr)
    history = load_json(DATA_PATH, [])
    today = date.today().isoformat()
    # Rows already made today by the website tracker (source=web) don't count here: if a product was
    # switched back to the API, the API result replaces them.
    seen_today = {
        (r["project_id"], r["item_key"], r["keyword"])
        for r in history if r["date"] == today and r.get("source") != "web"
    }

    # ONLY_NEW=1 (the hourly pick-up run): only check keywords that have never
    # been checked before, i.e. products/keywords added since the last run.
    only_new = os.environ.get("ONLY_NEW") == "1"
    known_any = {(r["project_id"], r["item_key"], r["keyword"]) for r in history}

    try:
        for project in projects:
            project_id = project["project_id"]
            project_name = project["project_name"]

            for item in project.get("items", []):
                if item.get("marketplace") != "ebay" or item.get("source") == "web":
                    continue  # source=web products are read from the ebay.de page by ebay_web_tracker.py

                item_key = item["item_key"]
                country = item.get("country", "DE")
                marketplace_id = MARKETPLACE_IDS.get(country, "EBAY_DE")

                for keyword in item.get("keywords", []):
                    if (project_id, item_key, keyword) in seen_today or (
                        only_new and (project_id, item_key, keyword) in known_any
                    ):
                        continue
                    try:
                        found = find_rank_detail(token, marketplace_id, keyword, item)
                        rank, item_id, title = found["rank"], found["item_id"], found["title"]
                    except requests.RequestException as e:
                        print(f"  ! error searching '{keyword}': {e}", file=sys.stderr)
                        continue

                    row = {
                        "date": today,
                        "checked_at": datetime.now(timezone.utc).isoformat(),
                        "project_id": project_id,
                        "project_name": project_name,
                        "item_key": item_key,
                        "marketplace": "ebay",
                        "country": country,
                        "keyword": keyword,
                        "rank": rank,
                        "organic_rank": found["organic_rank"],   # position with paid (Promoted Listings) results removed
                        "promoted": found["promoted"],           # is this listing itself flagged as a paid placement?
                        "item_id": item.get("ebay_item_id") or item_id,
                        "item_label": item.get("label"),
                        "item_sku": item.get("sku"),
                        "title": title,
                        "results_scanned": RESULTS_PER_PAGE * MAX_PAGES,
                    }
                    history = [r for r in history if not (r["date"] == today and r.get("source") == "web"
                               and (r["project_id"], r["item_key"], r["keyword"]) == (project_id, item_key, keyword))]
                    history.append(row)
                    extra = (f" (organic {found['organic_rank']})" if rank is not None else "") + (" [promoted]" if found["promoted"] else "")
                    print(f"  [{project_name} / {item_key}] {keyword!r} -> rank {rank}{extra}")

    finally:
        save_json(DATA_PATH, history)
    print(f"Saved {len(history)} total rows to {DATA_PATH}")


if __name__ == "__main__":
    main()
