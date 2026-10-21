"""
Cost controls shared by the Otto and Kaufland trackers (both bill one Bright Data request per results page).

  * Page depth: how many results pages are read per keyword is a setting (OTTO_MAX_PAGES / KAUFLAND_MAX_PAGES, default 2).
    A product that is not found in the pages read is "not found in the top N", the same as eBay's top-60 view.
  * Dormant keywords: a keyword where NONE of your products has been found in its last DORMANT_AFTER_CHECKS checks
    (default 3) is only re-checked every DORMANT_RECHECK_DAYS days (default 7). The day it is found again it goes back to
    daily checks. DORMANT_AFTER_CHECKS=0 switches this off. On a skipped day a row marked `carried` (still not found, not re-checked, no request) is saved, so the dashboard's
    daily Visibility and Average Position stay comparable from day to day.
  * Failed pages: Bright Data hands back an EMPTY page when the marketplace rejects a request. That is retried once
    (without the country setting) and, if still empty, the keyword is skipped for today: it is never saved as "not found".
    A page that fails is not requested again for the other products, and a run stops after 5 keywords in a row fail.
"""

import os
import re
from collections import defaultdict
from datetime import date

import bright_data
import requests

MAX_FAILED_KEYWORDS_IN_A_ROW = 5


class EmptyPage(RuntimeError):
    """Bright Data answered, but with an empty page (the marketplace rejected the request)."""


class PolicyRefused(EmptyPage):
    """Bright Data refused the request itself (account policy, e.g. the site needs KYC verification): retrying cannot help."""


class StopRun(Exception):
    """Too many keywords in a row could not be read: stop instead of paying for more failures."""


REFUSAL_RE = re.compile(r"brightdata\.com/cp/kyc|Residential Failed|policy_\d{4,6}", re.I)


def refusal(text: str):
    """Bright Data's own refusal message if this 'page' is one, else None (these are short plain-text answers)."""
    if text and len(text) < 2000 and REFUSAL_RE.search(text):
        return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", text)).strip()[:300]
    return None


def env_int(name: str, default: int, lo: int, hi: int) -> int:
    try:
        return max(lo, min(hi, int(os.environ.get(name, str(default)))))
    except ValueError:
        return default


def fetch_ids(url: str, country: str, extractor, cache: dict, errors: dict, first: bool = False) -> list:
    """
    Product IDs on one results page. One request per page per run; failures are remembered, never retried per product.
    A first page that yields NO product IDs (an empty page, or a blocked / script-only shell) is a failed read, never
    "not found": it is retried once without the country setting, and then raises EmptyPage. A later page without IDs is
    the normal end of the results.
    """
    key = (url, country)
    if key in errors:
        raise errors[key]
    if key not in cache:
        try:
            html = bright_data.fetch_html(url, country=country)
            msg = refusal(html)
            if msg:
                raise PolicyRefused(msg)                                 # account policy: another try cannot change it
            ids = extractor(html) if html.strip() else []
            if not ids and (first or not html.strip()):
                html2 = bright_data.fetch_html(url, country=None)       # a different exit address often works
                ids2 = extractor(html2) if html2.strip() else []
                if ids2 or not html.strip():
                    html, ids = html2, ids2
            if not html.strip():
                raise EmptyPage(f"empty page for {url}")
            if first and not ids:
                raise EmptyPage(f"no products recognised on the first results page ({len(html):,} characters): a blocked or empty page, not 'not found'")
            cache[key] = ids
        except (EmptyPage, requests.RequestException) as e:
            errors[key] = e
            raise
    return cache[key]


def dormant_skip(history: list, marketplace: str, today_iso: str) -> set:
    """(country, keyword) pairs to skip today because nothing has been found for them lately (see module docstring)."""
    after = env_int("DORMANT_AFTER_CHECKS", 3, 0, 30)
    recheck = env_int("DORMANT_RECHECK_DAYS", 7, 1, 60)
    if after == 0:
        return set()
    today = date.fromisoformat(today_iso)
    days = defaultdict(dict)       # (country, keyword) -> {date: found anything that day}
    for r in history:
        if r.get("marketplace") != marketplace or r.get("carried"):      # carried rows are not real checks
            continue
        d = date.fromisoformat(r["date"])
        if d >= today:
            continue
        k = (r.get("country", "DE"), r["keyword"])
        days[k][d] = days[k].get(d, False) or (r.get("rank") is not None)
    skip = set()
    for k, by_day in days.items():
        ordered = sorted(by_day)
        last_n = ordered[-after:]
        if len(ordered) >= after and not any(by_day[d] for d in last_n) and (today - ordered[-1]).days < recheck:
            skip.add(k)
    return skip
