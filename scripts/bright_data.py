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

import requests

UNLOCKER_URL = "https://api.brightdata.com/request"


def scraping_browser_ws_url() -> str:
    """
    Build the WebSocket endpoint for Bright Data's Browser API (Scraping
    Browser) — a remote, real Chrome instance you drive with Playwright's
    connect_over_cdp, rather than launching a browser locally.

    Requires BRIGHTDATA_BROWSER_AUTH as "username:password", exactly as
    shown in the Browser API zone's Overview tab in the Bright Data control
    panel (the username already looks like "brd-customer-...-zone-...").
    """
    auth = os.environ.get("BRIGHTDATA_BROWSER_AUTH")
    if not auth or ":" not in auth:
        raise RuntimeError(
            "BRIGHTDATA_BROWSER_AUTH not set (or malformed). It must be a "
            "GitHub secret in the form 'username:password' from a Browser "
            "API zone's Overview tab."
        )
    return f"wss://{auth}@brd.superproxy.io:9222"


def fetch_html(url: str, country: str | None = None) -> str:
    """
    Fetch a URL through Bright Data's Web Unlocker and return its raw HTML.

    Raises RuntimeError with a clear message if BRIGHTDATA_API_KEY /
    BRIGHTDATA_ZONE aren't set, so a misconfigured workflow fails loudly
    instead of silently recording "not found" for everything.
    """
    api_key = os.environ.get("BRIGHTDATA_API_KEY")
    zone = os.environ.get("BRIGHTDATA_ZONE")
    if not api_key or not zone:
        raise RuntimeError(
            "BRIGHTDATA_API_KEY / BRIGHTDATA_ZONE not set. These must be "
            "GitHub secrets pointing at a Web Unlocker API zone."
        )

    payload = {"zone": zone, "url": url, "format": "raw"}
    if country:
        payload["country"] = country.lower()

    resp = requests.post(
        UNLOCKER_URL,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json=payload,
        timeout=60,
    )
    resp.raise_for_status()
    return resp.text
