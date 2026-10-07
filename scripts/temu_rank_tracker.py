"""
Temu keyword rank tracker — the experimental one. Read this whole docstring
before trusting its numbers.

Why this one is different from Otto/Kaufland: Temu's search results are
loaded by JavaScript after the page loads (not present in the raw HTML the
way Otto's and Kaufland's are), and Temu computes a JS-generated
"anti-content" header that gates search and product-detail access — which
can trigger a CAPTCHA/verification page even from a real browser. This is
serious enough that, while researching how to build this, at least one
commercial scraping vendor's own documentation says plainly that Temu
keyword search "cannot be retrieved reliably enough to sell" and refuses to
support it at all. Other vendors do offer it. Read: expect a real,
non-trivial failure rate — this is not the same reliability tier as eBay,
Otto or Kaufland, and its numbers should be treated as best-effort/
directional, not as solid daily data, until you've watched it run for a
while.

Because of that, this script never quietly reports "not found" when it was
actually blocked — those are recorded differently (see `rank` vs
`blocked` in the output row) so you can tell the difference between "this
keyword genuinely isn't ranking" and "Temu didn't let us look today."

How it works: connects to a real, remote Chrome browser via Bright Data's
Browser API (not Web Unlocker — Temu needs actual JS execution, which
Unlocker's plain HTML fetch doesn't give you), navigates to Temu's search
page, waits for the product grid to render, then reads product IDs
(goods_id) out of the rendered page in order.

Tracking table (sheet or config/tracked.csv), per Temu product:
    product_id: the numeric ID from your listing's URL, e.g. the
    "601099512665876" in "temu.com/goods.html?goods_id=601099512665876"

Requires (see README.md):
    BRIGHTDATA_BROWSER_AUTH  (a Browser API zone, not a Web Unlocker zone)
"""

import json
import re
import sys
import urllib.parse
from datetime import date, datetime, timezone
from pathlib import Path

import bright_data
import config_loader
from playwright.async_api import async_playwright
import asyncio

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "docs" / "data" / "ranks.json"

SEARCH_URL = "https://www.temu.com/search_result.html?search_key={query}"

MAX_PRODUCTS_TO_SCAN = 120  # Temu shows ~120 per page before needing "See More" clicks

# Matches Temu's numeric goods_id wherever it appears in the rendered page —
# in product links (goods.html?...goods_id=NNN) or embedded JSON state.
GOODS_ID_RE = re.compile(r'goods_id"?[=:]\s*"?(\d{9,18})')

# Crude but effective: Temu's verification/CAPTCHA interstitial has
# distinctive text; if we see it, this run was blocked, not "not found".
BLOCK_MARKERS = ["verify you are human", "security check", "unusual traffic", "captcha"]


def extract_ordered_goods_ids(html: str) -> list[str]:
    seen = set()
    ordered = []
    for match in GOODS_ID_RE.finditer(html):
        gid = match.group(1)
        if gid not in seen:
            seen.add(gid)
            ordered.append(gid)
    return ordered


def looks_blocked(html: str) -> bool:
    lowered = html.lower()
    return any(marker in lowered for marker in BLOCK_MARKERS)


async def find_rank_async(keyword: str, target_goods_id: str):
    """Returns (rank_or_None, blocked_bool)."""
    query = urllib.parse.quote(keyword)
    url = SEARCH_URL.format(query=query)
    ws_url = bright_data.scraping_browser_ws_url()

    async with async_playwright() as pw:
        browser = await pw.chromium.connect_over_cdp(ws_url)
        try:
            page = await browser.new_page()
            await page.goto(url, timeout=90_000)
            # Give the product grid time to render via JS before reading it.
            try:
                await page.wait_for_selector("a[href*='goods_id']", timeout=20_000)
            except Exception:
                pass  # fall through — html check below decides blocked vs empty
            html = await page.content()
        finally:
            await browser.close()

    if looks_blocked(html):
        return None, True

    ordered = extract_ordered_goods_ids(html)[:MAX_PRODUCTS_TO_SCAN]
    if target_goods_id in ordered:
        return ordered.index(target_goods_id) + 1, False
    return None, False


def find_rank(keyword: str, target_goods_id: str):
    return asyncio.run(find_rank_async(keyword, target_goods_id))


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
    projects = config_loader.load_projects()
    history = load_json(DATA_PATH, [])
    today = date.today().isoformat()
    seen_today = {
        (r["project_id"], r["item_key"], r["keyword"])
        for r in history if r["date"] == today
    }

    for project in projects:
        project_id = project["project_id"]
        project_name = project["project_name"]

        for item in project.get("items", []):
            if item.get("marketplace") != "temu":
                continue

            item_key = item["item_key"]
            country = item.get("country", "US")
            target_id = item.get("temu_goods_id")
            if not target_id:
                print(f"  ! skipping {item_key}: no temu_goods_id set", file=sys.stderr)
                continue

            for keyword in item.get("keywords", []):
                if (project_id, item_key, keyword) in seen_today:
                    continue
                try:
                    rank, blocked = find_rank(keyword, target_id)
                except Exception as e:
                    print(f"  ! error searching '{keyword}': {e}", file=sys.stderr)
                    continue

                row = {
                    "date": today,
                    "checked_at": datetime.now(timezone.utc).isoformat(),
                    "project_id": project_id,
                    "project_name": project_name,
                    "item_key": item_key,
                    "marketplace": "temu",
                    "country": country,
                    "keyword": keyword,
                    "rank": rank,
                    "blocked": blocked,
                    "item_id": target_id,
                    "title": None,
                    "results_scanned": None if blocked else MAX_PRODUCTS_TO_SCAN,
                }
                history.append(row)
                status = "BLOCKED" if blocked else f"rank {rank}"
                print(f"  [{project_name} / {item_key}] {keyword!r} -> {status}")

    save_json(DATA_PATH, history)
    print(f"Saved {len(history)} total rows to {DATA_PATH}")


if __name__ == "__main__":
    main()
