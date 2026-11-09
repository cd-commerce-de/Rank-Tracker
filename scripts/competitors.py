"""
Competitor snapshots: for every keyword the eBay website tracker reads, the top listings of that results page (who is
there, at what price, how many sold). The tracker already downloads these pages for your own rankings, so this costs no
extra Bright Data requests. Saved compactly, one file per month, in docs/data/competitors/ (the dashboard loads them
only when the Competitors view is opened).

Month file layout (short keys keep it small):
  {"v": 1, "month": "2026-10",
   "sellers": ["name", ...],                         business seller names only (see Privacy)
   "items":   {"<item id>": [title, seller index or -1, business 1/0/null, feedback in tenths of a percent, feedback count, top-rated 0/1]},
   "days":    {"2026-10-27": {"DE|keyword": [[position, item id, flags, price, coupon, delivery, sold], ...]}}}
  flags: 1 = shown as an ad, 2 = the sold count is a threshold ("88+ verkauft"); prices in cents.

Privacy: a seller's name is saved only when the seller is a business: the card says "Gewerblich", or the same name is
known to be a business (already in the file, or shown as a business on another card in this run), or the listing is one of
your own tracked listings. Private sellers are counted (position, price) but never named.

OFF by default. To switch it on, set the environment value EBAY_COMPETITOR_TOP (e.g. "20") on the eBay website step of the workflow and
make the commit step include docs/data/competitors. Settings: EBAY_COMPETITOR_TOP = how many positions per keyword to keep (0 = off,
the default, max 60);
EBAY_COMPETITOR_NAMES = business (default) or none (never save seller names).
"""

import json
import os
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIR = ROOT / "docs" / "data" / "competitors"


def top_n() -> int:
    try:
        return max(0, min(60, int(os.environ.get("EBAY_COMPETITOR_TOP", "0"))))
    except ValueError:
        return 0


def names_mode() -> str:
    return "none" if os.environ.get("EBAY_COMPETITOR_NAMES", "business").strip().lower() == "none" else "business"


def _load(path: Path, month: str) -> dict:
    try:
        d = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(d, dict) and d.get("v") == 1:
            d.setdefault("sellers", []); d.setdefault("items", {}); d.setdefault("days", {})
            return d
    except (OSError, ValueError):
        pass
    return {"v": 1, "month": month, "sellers": [], "items": {}, "days": {}}


def _write(path: Path, data: dict) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)
    return len(text.encode("utf-8"))


def save_day(day_iso: str, captured: dict, own_ids=()) -> dict:
    """
    Merge one day's snapshots into that month's file. `captured` maps (country, keyword) -> the page's cards (each with
    "info", see ebay_web.card_info). A keyword already saved for that day is replaced, so a later run never duplicates it.
    """
    n = top_n()
    month = day_iso[:7]
    path = DIR / f"{month}.json"
    data = _load(path, month)
    own = {str(i) for i in own_ids}
    sellers = data["sellers"]
    index = {name: i for i, name in enumerate(sellers)}
    known_business = set(sellers)
    for cards in captured.values():
        for c in cards[:n]:
            info = c.get("info") or {}
            if info.get("seller") and (info.get("biz") == 1 or c["id"] in own):
                known_business.add(info["seller"])
    day = data["days"].setdefault(day_iso, {})
    named = names_mode() == "business"
    rows_total = 0
    for (country, keyword), cards in captured.items():
        rows = []
        for pos, c in enumerate(cards[:n], 1):
            info = c.get("info") or {}
            if info.get("title"):                                         # image-only tiles carry no details: keep the row, not the meta
                seller_idx = -1
                if named and info.get("seller") and (info.get("biz") == 1 or (info.get("biz") is None and info["seller"] in known_business) or c["id"] in own):
                    name = info["seller"]
                    if name not in index:
                        index[name] = len(sellers); sellers.append(name)
                    seller_idx = index[name]
                biz = 1 if seller_idx >= 0 else (info.get("biz") if info.get("biz") == 0 else None)
                data["items"][c["id"]] = [info["title"], seller_idx, biz, info.get("fb"), info.get("fbn"), info.get("top") or 0]
            flags = (1 if c.get("sponsored") else 0) | (2 if info.get("sold_plus") else 0)
            rows.append([pos, c["id"], flags, info.get("price"), info.get("coupon"), info.get("ship"), info.get("sold")])
        day[f"{country}|{keyword}"] = rows
        rows_total += len(rows)
    size = _write(path, data)
    months = sorted({p.stem for p in DIR.glob("*.json") if p.stem != "index" and len(p.stem) == 7})
    _write(DIR / "index.json", {"months": months, "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "top": n})
    return {"path": str(path), "keywords": len(captured), "rows": rows_total, "sellers": len(sellers), "items": len(data["items"]), "bytes": size, "month": month}
