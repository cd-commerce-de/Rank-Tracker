"""
Read eBay's actual search page (what a shopper sees) instead of the search API.

Why: eBay's search API orders results its own way, and ebay.de also mixes paid
"Anzeige" slots into the page and may personalise it. Reading the page itself
(through Bright Data's Web Unlocker, like the Otto and Kaufland trackers) gives the
position a shopper really sees, and lets us tell paid slots from organic ones.

How a page is read (deliberately not dependent on eBay's CSS class names, which
change often):
  * every listing on the page is a link containing /itm/<item number>; the links of
    one card run together, so each run of identical item numbers is one card, in page order;
  * paid placements ("Anzeige"). eBay disguises the label on purpose. EVERY card carries a
    decoy label (the word written backwards, "egieznA", in transparent text over an image of
    scrambled lettering), so the mere presence of that text means nothing. The real marker is
    an accessibility reference: each card's label points (aria-labelledby) at one or two
    elements by id. Only on paid cards does one of those ids belong to an element whose text
    really is "Anzeige"; on organic cards they point at empty or missing elements. The ids are
    different on every page load, so they are looked up fresh each time. (Verified on a real
    ebay.de results page saved from Bright Data's Playground, Oct 2026: 7 of 73 cards were ads,
    which matched the ad and the organic listing seen in a browser.)
A listing can appear twice (once as an ad, once organically); both are kept.
"""

import html as htmllib
import os
import re
import unicodedata
import urllib.parse

SITES = {
    "DE": "www.ebay.de", "AT": "www.ebay.at", "US": "www.ebay.com", "GB": "www.ebay.co.uk",
    "FR": "www.ebay.fr", "IT": "www.ebay.it", "ES": "www.ebay.es", "NL": "www.ebay.nl", "PL": "www.ebay.pl",
}

# /itm/184137378691  or the older  /itm/Some-Title-/184137378691
ITEM_RE = re.compile(r"/itm/(?:[^\"'\s?#<>/]*/)?(\d{10,13})")
# Words that mean "paid placement" in the languages of the sites above (compared after normalising, see _plain)
AD_WORDS = {"anzeige", "gesponsert", "sponsored", "publicite", "sponsorizzato", "patrocinado", "gesponsord", "sponsorowane"}
# letters eBay swaps for Cyrillic look-alikes inside the decoy label
_CONFUSABLES = str.maketrans({"е": "e", "а": "a", "о": "o", "р": "p", "с": "c", "х": "x", "у": "y", "і": "i", "ѕ": "s", "ј": "j"})
# the backwards decoy label and, in older/other layouts, a plain-text label
LEGACY_AD_RE = re.compile(r"egieznA|>\s*(?:Anzeige|Gesponsert|Sponsored)\s*<")
_ID_TEXT_RE = re.compile(r'<(\w+)\b[^>]*\bid="([^"]+)"[^>]*>([^<]{1,40})</\1>')
_ARIA_RE = re.compile(r'aria-labelledby="([^"]+)"')
_LABEL_SCHEME_RE = re.compile(r'<b aria-labelledby="[^"]*" role="heading"[^>]*background-image')


def page_size_setting() -> int:
    """Listings requested per results page: 60 (default), 120 or 240. The same one request either way;
    60 is lighter and proved the most reliable through Bright Data. Set EBAY_WEB_PAGE_SIZE to change."""
    try:
        v = int(os.environ.get("EBAY_WEB_PAGE_SIZE", "60"))
    except ValueError:
        return 60
    return v if v in (60, 120, 240) else 60


# eBay's own "ship to" parameters, as seen in the address of a real ebay.de results page and in its hidden search
# form (_stpos = delivery postcode, _fcid = country id; 77 = Germany). Sending them tells eBay the buyer is in Germany,
# which affects which listings are shown and in what order (and which are ads).
COUNTRY_IDS = {"DE": 77}


def postcode_setting() -> str:
    """German delivery postcode sent with every request. Default 36179 (the one in the saved browser page used to
    check this tracker). Set EBAY_WEB_POSTCODE to another postcode, or to "none" to send no location."""
    v = os.environ.get("EBAY_WEB_POSTCODE")
    if v is None:
        return "36179"
    v = v.strip()
    return "" if v.lower() in ("", "none") else v


def search_url(keyword: str, country: str = "DE", page: int = 1, per_page: int = None, postcode: str = None) -> str:
    host = SITES.get(country.upper(), SITES["DE"])
    q = urllib.parse.quote_plus(keyword)
    url = f"https://{host}/sch/i.html?_nkw={q}&_sacat=0&_ipg={per_page or page_size_setting()}&_pgn={page}"
    pc = postcode_setting() if postcode is None else postcode
    if pc and country.upper() in COUNTRY_IDS:
        url += f"&_stpos={urllib.parse.quote_plus(pc)}&_fcid={COUNTRY_IDS[country.upper()]}"
    return url


def retry_window_open(history, now=None) -> bool:
    """
    Hourly pick-ups may retry keywords that failed in today's full run, but only during the 4 hours after the first
    website result of today was saved (the full run takes under an hour, which leaves about three hourly retries).
    Relative to the day's own run rather than a clock time, because GitHub starts scheduled runs late by a varying
    amount. A keyword that keeps failing therefore costs at most about 3 more attempts a day.
    """
    from datetime import datetime, timedelta, timezone
    now = now or datetime.now(timezone.utc)
    today = now.date().isoformat()
    stamps = [r["checked_at"] for r in history if r.get("date") == today and r.get("source") == "web" and r.get("checked_at")]
    if not stamps:
        return False                      # today's full run has not saved anything yet
    first = datetime.fromisoformat(min(stamps))
    if first.tzinfo is None:
        first = first.replace(tzinfo=timezone.utc)
    return timedelta(0) <= now - first <= timedelta(hours=4)


def result_count(page_html: str):
    """The number in "22 Ergebnisse für …" at the top of the page (how many exact matches eBay says exist), or None."""
    text = re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", " ", _strip_noise(page_html))))
    m = re.search(r"(\d[\d.,]*)\s+Ergebnisse?\s+für", text)
    if not m:
        return None
    try:
        return int(re.sub(r"[.,]", "", m.group(1)))
    except ValueError:
        return None


def _plain(text: str) -> str:
    """Undo eBay's lettering tricks: drop invisible direction/format characters, fold look-alike letters and accents."""
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Cf")
    text = unicodedata.normalize("NFKD", text.translate(_CONFUSABLES))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", text).strip().lower()


def ad_label_ids(clean_html: str) -> set:
    """ids of the elements whose whole text is an ad word ("Anzeige"...). Fresh ids on every page load."""
    return {m.group(2) for m in _ID_TEXT_RE.finditer(clean_html) if _plain(htmllib.unescape(m.group(3))) in AD_WORDS}


def _visible_text(segment: str) -> str:
    text = re.sub(r"<(script|style)\b.*?</\1>", " ", segment, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = htmllib.unescape(text).replace("egieznA", " ")
    return re.sub(r"\s+", " ", text).strip()


def _strip_noise(page_html: str) -> str:
    """Drop scripts, styles, templates and comments: they hold data blobs full of item
    links that are not listings on the page and would shift every position."""
    page_html = re.sub(r"<(script|style|noscript|template)\b.*?</\1\s*>", " ", page_html, flags=re.S | re.I)
    return re.sub(r"<!--.*?-->", " ", page_html, flags=re.S)


def parse_cards(page_html: str):
    """Listings on one results page, in page order: [{"id", "sponsored", "labelled", "text"}]."""
    page_html = _strip_noise(page_html)
    ad_ids = ad_label_ids(page_html)
    scheme = bool(_LABEL_SCHEME_RE.search(page_html))   # eBay's disguised-label layout (decoy text on every card)
    runs = []   # [id, start]
    for m in ITEM_RE.finditer(page_html):
        item_id = m.group(1)
        if not runs or runs[-1][0] != item_id:
            runs.append([item_id, m.start()])
    cards = []
    # a card's text runs from the start of its first link's tag to the start of the next card's
    starts = [max(page_html.rfind("<", 0, start), 0) for _, start in runs]
    for i, (item_id, _) in enumerate(runs):
        end = starts[i + 1] if i + 1 < len(runs) else len(page_html)
        segment = page_html[starts[i]:end]
        refs = {r for attr in _ARIA_RE.findall(segment) for r in attr.split()}
        if scheme or ad_ids:
            sponsored = bool(refs & ad_ids)                 # the label points at an element that says "Anzeige"
            labelled = bool(_LABEL_SCHEME_RE.search(segment))
        else:
            sponsored = bool(LEGACY_AD_RE.search(segment))  # simple pages: the label is just in the card
            labelled = sponsored
        cards.append({"id": item_id, "sponsored": sponsored, "labelled": labelled, "text": _visible_text(segment)[:160]})
    return cards


def ad_signals(page_html: str) -> dict:
    """What the page says about ads, independent of the card parsing (for logs and diagnostics)."""
    clean = _strip_noise(page_html)
    return {"ad_elements": len(ad_label_ids(clean)), "decoys": clean.count("egieznA"), "scheme": bool(_LABEL_SCHEME_RE.search(clean))}


def locate(cards, target_id):
    """
    Where is the listing, counting cards in page order?
      rank          position of its organic appearance (counting ads, as a shopper counts);
                    if it only appears as an ad, the position of that ad
      organic_rank  position among organic cards only; None if it only appears as an ad
      promoted      True if it appears in a paid slot anywhere in these results
      ad_rank       position of its paid appearance, if any
    All None when it is not in the cards.
    """
    target = str(target_id)
    organic = 0
    first_organic = first_ad = None   # (overall position, organic position)
    for pos, c in enumerate(cards, 1):
        if not c["sponsored"]:
            organic += 1
        if c["id"] != target:
            continue
        if c["sponsored"]:
            first_ad = first_ad or (pos, None)
        elif first_organic is None:
            first_organic = (pos, organic)
    if first_organic is None and first_ad is None:
        return {"rank": None, "organic_rank": None, "promoted": None, "ad_rank": None}
    rank = first_organic[0] if first_organic else first_ad[0]
    return {"rank": rank, "organic_rank": first_organic[1] if first_organic else None,
            "promoted": first_ad is not None, "ad_rank": first_ad[0] if first_ad else None}
