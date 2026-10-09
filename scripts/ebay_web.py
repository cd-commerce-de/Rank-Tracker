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
  * a card is a paid placement if the label "Anzeige" is inside it. eBay writes that
    label BACKWARDS in the page text ("egieznA") and flips it with CSS, so both
    spellings are recognised.
A listing can appear twice (once as an ad, once organically); both are kept.
"""

import html as htmllib
import re
import urllib.parse

SITES = {
    "DE": "www.ebay.de", "AT": "www.ebay.at", "US": "www.ebay.com", "GB": "www.ebay.co.uk",
    "FR": "www.ebay.fr", "IT": "www.ebay.it", "ES": "www.ebay.es", "NL": "www.ebay.nl", "PL": "www.ebay.pl",
}

# /itm/184137378691  or the older  /itm/Some-Title-/184137378691
ITEM_RE = re.compile(r"/itm/(?:[^\"'\s?#<>/]*/)?(\d{10,13})")
# the paid-placement label, written backwards by eBay ("egieznA" = "Anzeige"), plus the normal
# spelling in the languages of the sites above
AD_RE = re.compile(r"egieznA|>\s*(?:Anzeige|Gesponsert|Sponsored|Publicit[eé]|Sponsorizzato|Patrocinado|Gesponsord|Sponsorowane)\s*<")


def search_url(keyword: str, country: str = "DE", page: int = 1, per_page: int = 240) -> str:
    host = SITES.get(country.upper(), SITES["DE"])
    q = urllib.parse.quote_plus(keyword)
    return f"https://{host}/sch/i.html?_nkw={q}&_sacat=0&_ipg={per_page}&_pgn={page}"


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
    """Listings on one results page, in page order: [{"id", "sponsored", "text"}]."""
    page_html = _strip_noise(page_html)
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
        cards.append({"id": item_id, "sponsored": bool(AD_RE.search(segment)), "text": _visible_text(segment)[:160]})
    return cards


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
