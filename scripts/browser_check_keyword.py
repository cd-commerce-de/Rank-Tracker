"""
Test ONE keyword through Bright Data's Browser API (a real Chrome that Bright Data runs, driven from here with Playwright).
Use it where Web Unlocker cannot read a site (Otto's Kasada protection) or for a marketplace that needs a real browser (Temu).

It opens the marketplace's search page, scrolls so lazily loaded results appear, and reports: whether a real results page or a
bot-protection page came back, how many listings were seen after each scroll (so you see how deep one visit reaches), where your
products are, how much data the visit downloaded (Browser API is billed per GB), and what that would cost per month.
Saves nothing. Needs BRIGHTDATA_BROWSER_AUTH ("username:password" of a Browser API zone).

    python scripts/browser_check_keyword.py otto "wagenheber" --project WGH25
"""

import argparse
import asyncio
import html as htmllib
import os
import re
import sys
import time
import urllib.parse

import bright_data
import config_loader
import page_savings as ps

PRICE_PER_GB = (8.0, 8.4)          # USD per GB, Bright Data's pay-as-you-go list prices for Browser API / Scraping Browser; a monthly plan is cheaper, check yours
# --block: pictures, video and fonts are most of a page's weight and are billed by the GB, but a rank test only needs the product links.
# The first way blocks by resource type (Playwright); if the remote browser does not allow that, the second blocks by file ending and image host.
BLOCK_PATTERNS = ["*.png", "*.jpg", "*.jpeg", "*.gif", "*.webp", "*.avif", "*.svg", "*.ico", "*.woff", "*.woff2", "*.ttf", "*.otf", "*.mp4", "*.webm", "*://i.otto.de/*"]


def target(marketplace: str, keyword: str, region: str):
    """(search address, function that lists the product IDs in page order, id field of your sheet)."""
    q = urllib.parse.quote(keyword)
    if marketplace == "otto":
        import otto_rank_tracker as m
        return f"https://www.otto.de/suche/{q}/", m.extract_ordered_product_ids, "otto_product_id"
    if marketplace == "kaufland":
        import kaufland_rank_tracker as m
        return f"https://www.kaufland.de/s/?search_value={q}&page=1", m.extract_ordered_product_ids, "kaufland_product_id"
    import temu_rank_tracker as m
    base = f"https://www.temu.com/{region}" if region else "https://www.temu.com"
    return f"{base}/search_result.html?search_key={q}", m.extract_ordered_goods_ids, "temu_goods_id"


async def visit(url: str, extractor, scrolls: int, pause: float, block: bool = False, save_dir: str = ""):
    """Open the page in the remote browser. Returns a dict of what was seen."""
    from playwright.async_api import async_playwright
    out = {"error": None, "html": "", "final_url": url, "title": "", "steps": [], "bytes": None, "seconds": 0.0, "text": "", "block_how": "", "saved": []}
    t0 = time.monotonic()
    ws = bright_data.scraping_browser_ws_url()
    async with async_playwright() as pw:
        browser = await pw.chromium.connect_over_cdp(ws)
        try:
            context = browser.contexts[0] if browser.contexts else await browser.new_context()
            page = await context.new_page()
            if block:
                try:
                    async def _route(route):
                        if route.request.resource_type in ("image", "media", "font"):
                            await route.abort()
                        else:
                            await route.continue_()
                    await context.route("**/*", _route)
                    out["block_how"] = "by resource type (pictures, video and fonts are not downloaded)"
                except Exception:
                    try:
                        cdp_b = await context.new_cdp_session(page)
                        await cdp_b.send("Network.enable")
                        await cdp_b.send("Network.setBlockedURLs", {"urls": BLOCK_PATTERNS})
                        out["block_how"] = "by file ending and image host (Network.setBlockedURLs)"
                    except Exception:
                        out["block_how"] = "NOT possible in this browser: pictures were downloaded"
            counter = {"bytes": 0, "ok": False}
            try:
                cdp = await context.new_cdp_session(page)
                await cdp.send("Network.enable")
                cdp.on("Network.loadingFinished", lambda e: counter.__setitem__("bytes", counter["bytes"] + int(e.get("encodedDataLength", 0))))
                counter["ok"] = True
            except Exception:
                pass                                                   # traffic then simply stays "not measured"
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=90_000)
            except Exception as e:
                out["error"] = f"{type(e).__name__}: {str(e)[:600]}"
            for step in range(scrolls + 1):
                try:
                    html = await page.content()
                except Exception as e:
                    out["error"] = out["error"] or f"{type(e).__name__}: {str(e)[:200]}"
                    break
                out["html"] = html
                out["steps"].append(len(extractor(html)))
                if step == scrolls:
                    break
                try:
                    await page.evaluate("window.scrollBy(0, Math.max(800, window.innerHeight))")
                    await page.wait_for_timeout(int(pause * 1000))
                except Exception:
                    break
            try:
                out["final_url"] = page.url or url          # a refused navigation can leave the address empty
                out["title"] = await page.title()
            except Exception:
                pass
            try:                                            # what a visitor would READ on the page: tells "Entschuldigung" from a real results page
                out["text"] = " ".join((await page.inner_text("body", timeout=5000)).split())[:500]
            except Exception:
                pass
            if save_dir:                                    # a screenshot and the page itself, for the workflow's downloadable artifact
                os.makedirs(save_dir, exist_ok=True)
                try:
                    await page.screenshot(path=os.path.join(save_dir, "page.png"), timeout=15_000)
                    out["saved"].append("page.png")
                except Exception:
                    pass
                try:
                    with open(os.path.join(save_dir, "page.html"), "w", encoding="utf-8") as fh:
                        fh.write(out["html"])
                    out["saved"].append("page.html")
                except Exception:
                    pass
            out["bytes"] = counter["bytes"] if counter["ok"] else None
        finally:
            await browser.close()
    out["seconds"] = time.monotonic() - t0
    return out


def build_report(a, url, got, extractor, tracked) -> str:
    html = got["html"]
    ids = list(dict.fromkeys(extractor(html))) if html else []
    challenge = ps.challenge(html)
    lang = re.search(r"<html[^>]*\blang=[\"']([A-Za-z-]+)", html[:3000])
    lines = [f"# Browser API check — {a.marketplace} — “{a.keyword}”", "",
             f"Opened `{url}` in a real browser run by Bright Data, scrolled {a.scrolls} time(s) and read the page after each. "
             f"Products found in your sheet for {a.marketplace}" + (f" (projects containing “{a.project}”)" if a.project else "") + f": **{len(tracked)}**.", ""]
    err = got["error"] or ""
    if got["error"]:
        lines += [f"**The visit reported an error:** `{got['error']}`", ""]
    if "(brob)" in err or "robots.txt" in err:
        lines += ["**Bright Data refused the navigation because the site's robots.txt disallows this page, and your account has not completed KYC (error `brob`).** "
                  "This is a permission on your Bright Data account, not a bot-protection problem, and the Browser API has the same rule as Web Unlocker. "
                  "A person at Bright Data must approve a KYC submission (brightdata.com/cp/kyc; add funds, use a company email, describe the use case, attach a company registration document; "
                  "they answer within 48 hours, status under Settings > Profile). Run this test again once it is approved.", ""]
    elif "(brul)" in err:
        lines += ["**Bright Data restricts this site by policy (error `brul`).** KYC alone does not lift that; access has to be requested from compliance@brightdata.com with your use case.", ""]
    lines += ["## What came back", "",
              f"- Final address: `{got['final_url'] or url}`" + (" (the marketplace redirected the browser)" if (got["final_url"] or url).split('?')[0].rstrip('/') != url.split('?')[0].rstrip('/') else ""),
              f"- Page title: {htmllib.unescape(got['title'] or '—')} | page language: {lang.group(1) if lang else 'not stated'} | {len(html):,} characters | {got['seconds']:.0f} s"]
    if got.get("text"):
        lines.append(f"- What the page says (first 500 characters a visitor would read): “{got['text']}”")
    if a.block:
        lines.append(f"- Pictures, video and fonts were blocked {got.get('block_how') or '(not attempted)'}.")
    if got.get("saved"):
        lines.append(f"- Saved for download (artifact **browser-check** on the run page): {', '.join(got['saved'])}.")
    if got["bytes"] is not None:
        size = f"{got['bytes'] / 1e6:.2f} MB" if got["bytes"] >= 1e5 else f"{got['bytes'] / 1e3:.0f} KB"
        lines.append(f"- **Data downloaded for this one visit: {size}**" + (" (pictures blocked)" if a.block else ""))
    else:
        lines.append("- Data downloaded: not measured (the browser did not expose its network log)")
    lines.append("")
    if challenge:
        lines += [f"**A {challenge} bot-protection challenge page came back, even in a real browser.** Browser API did not get past it here.", ""]
    elif not ids:
        lines += ["**No product IDs were found on the page**, and it is not a recognised challenge page. The page may not have finished loading, or the marketplace changed its layout.", ""]
    lines += ["## Listings seen after each scroll", "", "| After scroll | 0 | " + " | ".join(str(i) for i in range(1, len(got["steps"]))) + " |",
              "|---|" + "--:|" * len(got["steps"]), "| Listings | " + " | ".join(str(n) for n in got["steps"]) + " |", ""]
    if got["steps"] and got["steps"][-1] > got["steps"][0]:
        lines += [f"Scrolling loaded more results: {got['steps'][0]} at first, {got['steps'][-1]} at the end. So one visit reaches about {got['steps'][-1]} positions.", ""]
    elif ids:
        lines += [f"Scrolling did not add results; one visit reaches {len(ids)} positions.", ""]
    lines += ["## Your products", ""]
    if not tracked:
        lines.append(f"No {a.marketplace} products with an ID were found in your sheet" + (f" for projects containing “{a.project}”" if a.project else "") + ".")
    else:
        lines += ["| Position | SKU | Product ID | Project |", "|--:|---|---|---|"]
        found = 0
        if a.marketplace == "otto":
            import otto_rank_tracker as _otto
            locate = lambda pid: _otto.position_of(ids, pid)
        else:
            locate = lambda pid: ids.index(pid) + 1 if pid in ids else None
        for pid, owners in sorted(tracked.items(), key=lambda kv: locate(kv[0]) or 10**6):
            pos = locate(pid)
            found += pos is not None
            for name, sku in owners:
                lines.append(f"| {pos if pos else '—'} | {sku or '—'} | {pid} | {name} |")
        lines += ["", f"{found} of {len(tracked)} product(s) found among the {len(ids)} listings read."]
    if ids:
        lines += ["", "## The first 15 listings read", ""] + [f"{i}. `{pid}`" + ("  ★ yours" if pid in tracked else "") for i, pid in enumerate(ids[:15], 1)]
    if got["bytes"]:
        gb = got["bytes"] / 1e9
        lines += ["", "## What that costs (Browser API is billed per GB of traffic, no per-request fee; pay-as-you-go list price about $8 to $8.40 per GB, a plan is cheaper)", "", "| Keywords checked once a day | GB a month | Cost a month |", "|--:|--:|--:|"]
        for n in (5, 10, 20, 50):
            lines.append(f"| {n} | {gb * n * 30:.2f} | ${gb * n * 30 * PRICE_PER_GB[0]:.2f} to ${gb * n * 30 * PRICE_PER_GB[1]:.2f} |")
    if got["bytes"] and not a.block and got["bytes"] > 1.5e6:
        lines += ["", "Most of that is pictures. Run the check again with **Block pictures, video and fonts** switched on to see how much cheaper a visit gets (and whether the page still works without them)."]
    report = "\n".join(lines)
    return report


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("marketplace", choices=["otto", "kaufland", "temu"])
    ap.add_argument("keyword")
    ap.add_argument("--project", default="")
    ap.add_argument("--scrolls", type=int, default=6)
    ap.add_argument("--pause", type=float, default=1.5, help="seconds to wait after each scroll")
    ap.add_argument("--block", action="store_true", help="do not download pictures, video and fonts (cuts the GB that are billed)")
    ap.add_argument("--save-dir", default="", help="folder for a screenshot and the page HTML (the workflow uploads it as an artifact)")
    ap.add_argument("--region", default="de", help="Temu storefront path (de = Germany); empty for Temu's default address")
    a = ap.parse_args()
    a.scrolls = max(0, min(a.scrolls, 15))
    url, extractor, id_field = target(a.marketplace, a.keyword, a.region if a.marketplace == "temu" else "")
    tracked = {}
    try:
        for p in config_loader.load_projects():
            if a.project and a.project.lower() not in p["project_name"].lower():
                continue
            for it in p.get("items", []):
                if it.get("marketplace") == a.marketplace and it.get(id_field):
                    tracked.setdefault(str(it[id_field]), []).append((p["project_name"], it.get("sku", "")))
    except Exception as e:
        print(f"(could not read the sheet: {e})", file=sys.stderr)
    try:
        bright_data.scraping_browser_ws_url()                          # fail early and clearly if the secret is missing
    except RuntimeError as e:
        print(f"Cannot start: {e}", file=sys.stderr)
        sys.exit(2)
    got = asyncio.run(visit(url, extractor, a.scrolls, a.pause, a.block, a.save_dir))
    report = build_report(a, url, got, extractor, tracked)
    print(report)
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.write(report + "\n")


if __name__ == "__main__":
    main()
