"""
Shared helper for calling Bright Data's Web Unlocker API.

Web Unlocker is the piece that solves the actual hard problem for Otto and
Kaufland: neither site has a public search API like eBay's, so getting
their search-results pages reliably means dealing with anti-bot defenses.
Web Unlocker handles that — proxy rotation, retries, CAPTCHA solving — and
just hands back the page's HTML, as if a real browser had requested it.

Setup (one-time, in the Bright Data control panel):
  1. Create a "Web Unlocker API" zone (Products -> Web Unlocker API).
  2. Its Overview tab shows a zone name and an API key.
  3. Store both as GitHub secrets: BRIGHTDATA_API_KEY, BRIGHTDATA_ZONE.

Reference: https://docs.brightdata.com/scraping-automation/web-unlocker/send-your-first-request
"""

import os
import re
import time
import urllib.parse

import requests

UNLOCKER_URL = "https://api.brightdata.com/request"

# Web Unlocker works through eBay-style anti-bot defences before it answers, which can take well over a
# minute for a hard page. 150 s is generous; change it with BRIGHTDATA_TIMEOUT (seconds).
STATS = {"requests": 0, "seconds": 0.0, "timeouts": 0}   # filled in by fetch_html, printed in run logs


def _timeout() -> int:
    try:
        return max(30, min(300, int(os.environ.get("BRIGHTDATA_TIMEOUT", "150"))))
    except ValueError:
        return 150


def scraping_browser_ws_url(country: str = "") -> str:
    """
    Build the WebSocket endpoint for Bright Data's Browser API (Scraping
    Browser) — a remote, real Chrome instance you drive with Playwright's
    connect_over_cdp, rather than launching a browser locally.

    Requires BRIGHTDATA_BROWSER_AUTH as "username:password", exactly as
    shown in the Browser API zone's Overview tab in the Bright Data control
    panel (the username already looks like "brd-customer-...-zone-...").

    country: optional 2-letter code ("de") or "eu". Bright Data's Browser API picks the exit country by itself unless told; the code is added to
    the user name as -country-de (docs: "add the -country flag after your USER credentials"). Falls back to BRIGHTDATA_BROWSER_COUNTRY.
    """
    auth = (os.environ.get("BRIGHTDATA_BROWSER_AUTH") or "").strip()
    if not auth or ":" not in auth:
        raise RuntimeError(
            "BRIGHTDATA_BROWSER_AUTH not set (or malformed). It must be a "
            "GitHub secret in the form 'username:password' from a Browser "
            "API zone's Overview tab."
        )
    user, password = auth.split(":", 1)
    country = (country or os.environ.get("BRIGHTDATA_BROWSER_COUNTRY") or "").strip().lower()
    if country:
        if not re.fullmatch(r"[a-z]{2}", country):
            raise RuntimeError(f"The exit country must be a 2-letter code such as de (or eu), not {country!r}.")
        if "-country-" not in user:           # do not add it twice if it is already part of the secret
            user = f"{user}-country-{country}"
    # encoded separately: a password containing @ / # or : would otherwise break the address
    return f"wss://{urllib.parse.quote(user, safe='')}:{urllib.parse.quote(password, safe='')}@brd.superproxy.io:9222"


def zone_for(url: str):
    """
    (zone name, is it a dedicated zone?) for a URL. Temu is a "premium domain" for Web Unlocker (extra cost per request), so it can
    have its own zone: set BRIGHTDATA_ZONE_TEMU to that zone's name and every request to a temu.* address uses it, while all
    other sites keep using BRIGHTDATA_ZONE. The same for Otto with BRIGHTDATA_ZONE_OTTO (optional: Otto refuses most requests, so a
    zone of its own gives it its own usage limit and keeps the other marketplaces' budget safe). A separate zone also has its own usage limit, so tests on one site cannot use up
    the spending cap of another. Without BRIGHTDATA_ZONE_TEMU, Temu simply uses the normal zone.
    """
    host = (urllib.parse.urlparse(url).hostname or "").lower()
    labels = host.split(".")[:-1]                             # whole labels only (www.temu.com -> www, temu), never a lookalike such as notemu.com
    for brand, env_name in (("temu", "BRIGHTDATA_ZONE_TEMU"), ("otto", "BRIGHTDATA_ZONE_OTTO")):
        special = os.environ.get(env_name, "").strip() if brand in labels else ""
        if special:
            return special, True
    return os.environ.get("BRIGHTDATA_ZONE"), False


def fetch_response(url: str, country: str | None = None, render: bool = False, debug: bool = False, extra_headers: dict | None = None) -> requests.Response:
    """
    Fetch a URL through Bright Data's Web Unlocker and return the full response (status, headers, body).

    Raises RuntimeError with a clear message if BRIGHTDATA_API_KEY /
    BRIGHTDATA_ZONE aren't set, so a misconfigured workflow fails loudly
    instead of silently recording "not found" for everything.
    """
    api_key = os.environ.get("BRIGHTDATA_API_KEY")
    zone, _dedicated = zone_for(url)
    if not api_key or not zone:
        raise RuntimeError(
            "BRIGHTDATA_API_KEY / BRIGHTDATA_ZONE not set. These must be "
            "GitHub secrets pointing at a Web Unlocker API zone."
        )

    payload = {"zone": zone, "url": url, "format": "raw"}
    if country:
        payload["country"] = country.lower()
    if render:
        payload["render"] = "true"        # force a real browser: slower, but runs a page's JavaScript before answering
    if debug:
        payload["debug"] = True           # adds the x-brd-debug response header (see parse_debug)
    if extra_headers:
        payload["headers"] = extra_headers   # only honoured when the zone has a Custom Web Unlocker feature switched on (then ALL requests are billed)

    # One retry if Bright Data does not answer in time: a second attempt usually goes out through a
    # different exit address. (Bright Data bills successful requests only.)
    for attempt in (1, 2):
        started = time.monotonic()
        try:
            resp = requests.post(
                UNLOCKER_URL,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=payload,
                timeout=_timeout(),
            )
        except (requests.Timeout, requests.ConnectionError):
            STATS["timeouts"] += 1
            STATS["seconds"] += time.monotonic() - started
            if attempt == 2:
                raise
            time.sleep(3)
            continue
        STATS["requests"] += 1
        STATS["seconds"] += time.monotonic() - started
        resp.raise_for_status()
        return resp


def fetch_html(url: str, country: str | None = None, render: bool = False) -> str:
    """Fetch a URL through Bright Data's Web Unlocker and return its raw HTML (see fetch_response). render=True: real browser."""
    return fetch_response(url, country, render=render).text


def parse_debug(headers) -> dict:
    """
    The fields of Bright Data's x-brd-debug header (only present when the request was sent with debug=True), e.g.
    {"req_id": "hl_...", "billed": "false", "peer_country": "de", "render": "false", "captcha_solved": "false", "bytes_down": "562418"}.
    """
    raw = ""
    for k, v in (headers or {}).items():
        if str(k).lower() == "x-brd-debug":
            raw = str(v)
    out = {}
    for part in raw.split(";"):
        if "=" in part:
            k, _, v = part.strip().partition("=")
            out[k.strip()] = v.strip()
    return out


def zone_cost(zone: str) -> dict:
    """
    Bright Data's own BILLED cost and bandwidth for a zone (GET /zone/cost; the docs say it matches the Control Panel's Usage Overview and
    your invoice): {"today": {"bw": bytes, "cost": dollars}, "month": {...}}. {} when there is no API key or no zone. Raises requests.HTTPError
    when the API key may not read billing (an API key with Ops or User permission cannot; use an Admin key).
    """
    api_key = os.environ.get("BRIGHTDATA_API_KEY")
    if not api_key or not zone:
        return {}
    resp = requests.get("https://api.brightdata.com/zone/cost", params={"zone": zone}, headers={"Authorization": f"Bearer {api_key}"}, timeout=60)
    resp.raise_for_status()

    def find(o):                       # the buckets (back_d0 = today, back_m0 = this month) sit one level down, under an id
        if isinstance(o, dict):
            if "back_d0" in o:
                return o
            for v in o.values():
                r = find(v)
                if r:
                    return r
        return None

    b = find(resp.json())
    if not b:
        return {}
    pick = lambda k: {"bw": float((b.get(k) or {}).get("bw") or 0), "cost": float((b.get(k) or {}).get("cost") or 0)}
    return {"today": pick("back_d0"), "month": pick("back_m0")}


def success_rate(domain: str) -> dict:
    """
    Bright Data's own statistics for YOUR requests to a domain over the last 7 days: {"otto.de": 0.97, "time_p90": 3347.9}
    (success rate between 0 and 1, and the 90th-percentile response time in milliseconds). {} when there were none.
    """
    api_key = os.environ.get("BRIGHTDATA_API_KEY")
    if not api_key:
        raise RuntimeError("BRIGHTDATA_API_KEY not set")
    resp = requests.get(f"https://api.brightdata.com/unblocker/success_rate/{domain}", headers={"Authorization": f"Bearer {api_key}"}, timeout=120)
    resp.raise_for_status()
    return resp.json()
