"""
Test ONE keyword through Bright Data's Browser API (a real Chrome that Bright Data runs, driven from here with Playwright).
Use it where Web Unlocker cannot read a site (Otto's Kasada protection) or for a marketplace that needs a real browser (Temu).

It opens the marketplace's search page, scrolls so lazily loaded results appear, and reports: whether a real results page or a
bot-protection page came back, how many listings were seen after each scroll (so you see how deep one visit reaches), where your
products are, how much data the visit downloaded (Browser API is billed per GB), and what that would cost per month.
Saves nothing. Needs BRIGHTDATA_BROWSER_AUTH ("username:password" of a Browser API zone).

    python scripts/browser_check_keyword.py otto "wagenheber" --project WGH25
    python scripts/browser_check_keyword.py otto "anhänger hochplane" --probe      # diagnose why Otto refuses: see probe() below
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



# ---------- diagnose mode (--probe): is the browser refused outright, or only a search page opened cold? ----------
HOME_URL = "https://www.otto.de/"
PROBE_WORD = "laptop"
SETTLE_SECONDS = 30                      # how long a bot-check page gets to clear itself (Kasada's script often solves its check and reloads after a few seconds)
SEARCH_BOX = ['input[type="search"]', 'input[name="q"]', 'input[role="searchbox"]', 'input[placeholder*="uche" i]', 'input[aria-label*="uche" i]', '[data-testid*="search" i] input']
SUBMIT_BUTTON = ['button[type="submit"]', 'button[aria-label*="uche" i]', '[data-testid*="search" i] button']
CONSENT = re.compile(r"alle akzeptieren|akzeptieren|zustimmen|einverstanden|accept all|accept", re.I)


def probe_urls(keyword: str, word: str):
    return HOME_URL, f"https://www.otto.de/suche/{urllib.parse.quote(keyword)}/", f"https://www.otto.de/suche/{urllib.parse.quote(word)}/"


def classify_page(html: str, title: str, text: str, n_links: int, final_url: str = "", search: bool = False):
    """
    (kind, plain words) for what a page turned out to be. search=True: this step was meant to reach a SEARCH RESULTS page, so product
    links only count as results when the address really is a search page (a homepage also shows dozens of product links).
    """
    searched = "/suche/" in (final_url or "")
    if n_links and (searched or not search):
        return "real", (f"real search results ({n_links} product links)" if search else f"a real page ({n_links} product links)")
    ch = ps.challenge(html) if html else None
    if ch:
        return "challenge", f"a {ch} bot-protection challenge page"
    low = f"{title} {text}".lower()
    if "entschuldigung" in low or "hoppla" in low or "das hat nicht geklappt" in low:
        return "error", "Otto's own error page (\"Entschuldigung\" / \"Hoppla\")"
    if search and not searched:
        return "notsearched", f"NO SEARCH HAPPENED: the browser is still on {(final_url or 'an unknown page')[:55]}"
    return ("full", "a full page without product links") if len(html) > 50_000 else ("other", "a small page without product links")


async def _setup_page(context, page, block: bool):
    """Request blocking (optional) and a traffic counter for one page. Returns (counter, how blocking was done)."""
    how = ""
    if block:
        try:
            async def _route(route):
                if route.request.resource_type in ("image", "media", "font"):
                    await route.abort()
                else:
                    await route.continue_()
            await context.route("**/*", _route)
            how = "by resource type"
        except Exception:
            try:
                cdp_b = await context.new_cdp_session(page)
                await cdp_b.send("Network.enable")
                await cdp_b.send("Network.setBlockedURLs", {"urls": BLOCK_PATTERNS})
                how = "by file ending and image host"
            except Exception:
                how = "not possible in this browser"
    counter = {"bytes": 0, "ok": False}
    try:
        cdp = await context.new_cdp_session(page)
        await cdp.send("Network.enable")
        cdp.on("Network.loadingFinished", lambda e: counter.__setitem__("bytes", counter["bytes"] + int(e.get("encodedDataLength", 0))))
        counter["ok"] = True
    except Exception:
        pass
    return counter, how


async def settle(page, max_seconds: float):
    """
    Give a bot-check page time to clear itself. A page that is still tiny and has no title is a check in progress (Kasada's script
    solves its check and reloads the real page after a few seconds). Returns (seconds waited, was a check seen, is it still there).
    """
    t0, seen = time.monotonic(), False
    while True:
        try:
            html, title = await page.content(), await page.title()
        except Exception:
            return time.monotonic() - t0, seen, False
        pending = not title.strip() and len(html) < 30_000
        seen = seen or pending
        if not pending or time.monotonic() - t0 >= max_seconds:
            return time.monotonic() - t0, seen, pending
        await page.wait_for_timeout(2000)


async def probe(keyword: str, word: str, block: bool, save_dir: str, pause: float, extractor, settle_seconds: float = None):
    """
    Four visits, the way a shopper behaves, to see WHERE Otto's refusal happens:
      1. the homepage, as the first request of a fresh browser;
      2. the search page for the keyword, opened right after the homepage in the same browser;
      3. the same search typed into Otto's own search box, like a person (it must really reach a results page to count);
      4. a plain one-word search as the first request of another fresh browser.
    Bot-check pages get up to `settle_seconds` to clear themselves before a step is judged.
    """
    from playwright.async_api import async_playwright
    settle_seconds = SETTLE_SECONDS if settle_seconds is None else settle_seconds
    home, search_url, word_url = probe_urls(keyword, word)
    steps, how = [], ""

    async def run(page, counter, number, label, asked, action, search, scroll):
        t0, b0, err, note = time.monotonic(), counter["bytes"], "", ""
        try:
            result = await action()
            note = result if isinstance(result, str) else ""          # only the typed-search step returns a description; opening a page returns Playwright's response object
        except Exception as e:
            err = f"{type(e).__name__}: {str(e)[:300]}"
        await page.wait_for_timeout(int(pause * 1000))
        waited, seen, still = await settle(page, settle_seconds)
        for _ in range(2 if scroll else 0):
            try:
                await page.evaluate("window.scrollBy(0, Math.max(800, window.innerHeight))")
                await page.wait_for_timeout(int(pause * 1000))
            except Exception:
                break
        try:
            html = await page.content()
        except Exception:
            html = ""
        try:
            title = await page.title()
        except Exception:
            title = ""
        try:
            text = " ".join((await page.inner_text("body", timeout=5000)).split())[:200]
        except Exception:
            text = ""
        try:
            final = page.url
        except Exception:
            final = ""
        n_links = len(set(extractor(html))) if html else 0
        kind, words = classify_page(html, title, text, n_links, final, search)
        shot = ""
        if save_dir:
            os.makedirs(save_dir, exist_ok=True)
            try:
                await page.screenshot(path=os.path.join(save_dir, f"probe-{number}.png"), timeout=15_000)
                shot = f"probe-{number}.png"
            except Exception:
                pass
            try:
                with open(os.path.join(save_dir, f"probe-{number}.html"), "w", encoding="utf-8") as fh:
                    fh.write(html)
            except Exception:
                pass
        check_note = ""
        if seen:
            check_note = f"a bot check appeared and " + (f"was STILL there after {waited:.0f} s" if still else f"cleared itself after {waited:.0f} s")
        steps.append({"n": number, "label": label, "asked": asked, "final": final, "title": title, "kind": kind, "words": words, "links": n_links, "chars": len(html),
                      "text": text, "kb": (counter["bytes"] - b0) / 1e3 if counter["ok"] else None, "seconds": time.monotonic() - t0, "error": err, "shot": shot,
                      "note": "; ".join(x for x in (note, check_note) if x)})

    ws = bright_data.scraping_browser_ws_url()
    async with async_playwright() as pw:
        for session in (1, 2):
            browser = await pw.chromium.connect_over_cdp(ws)
            try:
                context = browser.contexts[0] if browser.contexts else await browser.new_context()
                page = await context.new_page()
                counter, how = await _setup_page(context, page, block)
                go = lambda u: (lambda: page.goto(u, wait_until="domcontentloaded", timeout=90_000))

                async def typed():
                    await page.goto(home, wait_until="domcontentloaded", timeout=90_000)
                    await page.wait_for_timeout(1500)
                    try:
                        await page.get_by_role("button", name=CONSENT).first.click(timeout=3000)     # the cookie banner, if one is in the way
                    except Exception:
                        pass
                    box, used = None, ""
                    for sel in SEARCH_BOX:
                        loc = page.locator(sel).first
                        try:
                            await loc.wait_for(state="visible", timeout=2500)
                            box, used = loc, sel
                            break
                        except Exception:
                            continue
                    if box is None:
                        raise RuntimeError("the search box was not found on the homepage")
                    await box.click()
                    await page.keyboard.type(keyword, delay=90)
                    await page.keyboard.press("Enter")
                    how_sent = "Enter"
                    try:
                        await page.wait_for_url(re.compile(r"/suche/"), timeout=30_000)         # the results page must really open
                    except Exception:
                        for sel in SUBMIT_BUTTON:                                               # Enter did nothing: press the search button instead
                            try:
                                await page.locator(sel).first.click(timeout=2000)
                                how_sent = "Enter, then the search button"
                                await page.wait_for_url(re.compile(r"/suche/"), timeout=30_000)
                                break
                            except Exception:
                                continue
                        else:
                            raise RuntimeError(f"typing the keyword and pressing Enter did not open a results page (the browser stayed on {page.url[:70]})")
                    return f"search box found with `{used}`, submitted with {how_sent}"

                if session == 1:
                    await run(page, counter, 1, "The homepage, as the first request of a fresh browser", home, go(home), False, False)
                    await run(page, counter, 2, "The search page for the keyword, opened right after the homepage", search_url, go(search_url), True, True)
                    await run(page, counter, 3, "The keyword typed into Otto's own search box, like a shopper", home + " (typed)", typed, True, True)
                else:
                    await run(page, counter, 4, f"A plain one-word search (“{word}”) as the first request of another fresh browser", word_url, go(word_url), True, True)
            finally:
                await browser.close()
    return steps, how


def probe_verdict(steps):
    by = {s["n"]: s for s in steps}
    ok = lambda n: n in by and by[n]["kind"] == "real"
    home_ok = 1 in by and by[1]["kind"] in ("real", "full")
    untested = [n for n in (2, 3, 4) if n in by and by[n]["kind"] == "notsearched"]
    caveat = (f" Step {', '.join(map(str, untested))} never reached a results page, so that way of searching is UNTESTED, not failed." if untested else "")
    stuck = [n for n in (2, 3, 4) if n in by and by[n]["kind"] == "challenge"]
    if ok(3) and not ok(2):
        return ("Typing the search into Otto's search box WORKS, opening the search address directly does not. A tracker can do what a shopper does (homepage, search box, results), at the cost of a slower visit per keyword." + caveat, "Next: I build the tracker on that route and we measure what a visit costs.")
    if ok(2) and not ok(4):
        return ("The search address works once the browser has visited the homepage first, but not as the very first request. A tracker can open the homepage once per session and then search every keyword in the same browser." + caveat, "Next: I build the tracker on that route (one browser session for many keywords, which is also cheaper).")
    if ok(2) or ok(3) or ok(4):
        return ("Otto returned real search results in this run. See which step worked above." + caveat, "Next: run the normal check for your real keyword (with and without pictures blocked) to measure the cost, and tell me.")
    if home_ok and stuck:
        return (f"Otto lets the browser onto the homepage, but the search page came back as a bot check that did not clear within {SETTLE_SECONDS} s (step {', '.join(map(str, stuck))})." + caveat, "Next: the homepage is open to us, so this route is not dead; the bot check on search pages is the obstacle. Send me the screenshots of those steps; a longer wait or a different way of opening the search may help.")
    if home_ok:
        return ("Otto lets the browser onto the homepage but gave no search results in any step." + caveat, "Next: look at the screenshots of the failed steps (artifact browser-check) and send them to me; the search itself is what is protected.")
    return ("Otto refuses the browser from the FIRST request, even the homepage. So it is not the search address, the umlaut or the way the keyword is typed: Otto does not accept Bright Data's browser at all, with either of its products.", "Next: stop testing Bright Data for Otto. The remaining option is a third-party tool with other infrastructure (the Apify actor test), or leaving Otto out.")


def build_probe_report(steps, keyword, word, block, how):
    lines = [f"# Browser API diagnosis — otto — “{keyword}”", "",
             "Four visits in a real browser run by Bright Data, in the order a shopper would go, to see **where** Otto's refusal happens"
             + (f" (pictures, video and fonts blocked {how})." if block else "."), "",
             "| # | What was done | What came back | Product links | Downloaded | Seconds |", "|--:|---|---|--:|--:|--:|"]
    for s in steps:
        lines.append(f"| {s['n']} | {s['label']} | {s['words']} | {s['links']} | " + (f"{s['kb']:.0f} KB" if s["kb"] is not None else "n/a") + f" | {s['seconds']:.0f} |")
    lines += [""]
    for s in steps:
        lines += [f"### {s['n']}. {s['label']}", "", f"- Asked for: `{s['asked']}` | final address: `{s['final'] or '—'}` | title: {htmllib.unescape(s['title'] or '—')}",
                  f"- What the page says: “{s['text'] or '—'}”"]
        if s.get("note"):
            lines.append(f"- {s['note'][0].upper() + s['note'][1:]}")
        if s["error"]:
            lines.append(f"- Error during this step: `{s['error']}`")
        if s["shot"]:
            lines.append(f"- Screenshot: {s['shot']} (artifact **browser-check**)")
        lines.append("")
    verdict, nxt = probe_verdict(steps)
    total = sum(s["kb"] for s in steps if s["kb"] is not None)
    lines += ["## What this means", "", f"**{verdict}**", "", nxt, "",
              f"Traffic of all four visits: {total / 1e3:.2f} MB, about ${total / 1e6 * PRICE_PER_GB[0]:.3f} to ${total / 1e6 * PRICE_PER_GB[1]:.3f}."]
    return "\n".join(lines)


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
    ap.add_argument("--probe", action="store_true", help="diagnose where the refusal happens: homepage, search after homepage, typed search, one-word search (about 4 visits; use with --block)")
    ap.add_argument("--probe-word", default=PROBE_WORD, help="the plain one-word search used as the last step of --probe")
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
    if a.probe:
        steps, how = asyncio.run(probe(a.keyword, a.probe_word, a.block, a.save_dir, a.pause, extractor))
        report = build_probe_report(steps, a.keyword, a.probe_word, a.block, how)
        print(report)
        path = os.environ.get("GITHUB_STEP_SUMMARY")
        if path:
            with open(path, "a", encoding="utf-8") as f:
                f.write(report + "\n")
        return
    got = asyncio.run(visit(url, extractor, a.scrolls, a.pause, a.block, a.save_dir))
    report = build_report(a, url, got, extractor, tracked)
    print(report)
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.write(report + "\n")


if __name__ == "__main__":
    main()
