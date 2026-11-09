"""
Where the rank history lives, and how it is stored.

Old way ("legacy"): one file, docs/data/ranks.json, every reading as a pretty-printed object. It grows about 1.5 MB a day and
GitHub rejects files above 100 MB.

New way ("monthly"): one compact file per month in docs/data/ranks/YYYY-MM.json plus docs/data/ranks/index.json. The strings that
repeat in every row (project, product, keyword) are stored once per file and each reading becomes a short list of numbers,
which is about 12 times smaller. Nothing is lost: every field of every row is kept (a field that is absent stays absent, a
field that is null stays null); only the fractions of a second in `checked_at` are dropped.

How the mode is chosen (so history can never split in two):
  * Once docs/data/ranks/index.json exists, the monthly files are the history, whatever the setting.
  * Before that, the history stays in ranks.json, until RANK_STORAGE=monthly is set (in the workflow); the first run then
    converts everything. ranks.json is left untouched afterwards (delete it yourself whenever you like).
  * Safety: every month is decoded again and compared with the original rows BEFORE anything is written. If that ever fails,
    the run saves the old way instead and says so, so a reading cannot be lost to a bug in the new format.
  * index.json is written last: its existence means every month file was written.

A month file ("v": 2):
  {"v":2, "month":"2026-11", "items":[{project_id, project_name, item_key, marketplace, country, item_id, item_label, item_sku, source}],
   "kws":["keyword", ...], "ctx":[["de","DE","36179"], ...], "shapes":[["organic_rank","promoted",...], ...],
   "rows":[[day, second of day, item#, keyword#, shape#, rank, results_scanned, <one value per key of the shape>], ...]}
A month that holds a row this format cannot represent exactly is stored plainly: {"v":1, "month":..., "rows":[...]}.
"""

import json
import os
import re
from pathlib import Path

ITEM_KEYS = ("project_id", "project_name", "item_key", "marketplace", "country", "item_id", "item_label", "item_sku", "source")
BASE_KEYS = ("date", "checked_at", "keyword", "rank", "results_scanned")
CTX_KEYS = ("page_lang", "page_geo", "page_shipto")
_TS = re.compile(r"^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?\+00:00$")


def _compact(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def normalize(row: dict) -> dict:
    """What a row looks like after a round trip: identical, except `checked_at` loses its fractions of a second."""
    r = dict(row)
    m = _TS.match(str(r.get("checked_at", "")))
    if m:
        r["checked_at"] = f"{m.group(1)}T{m.group(2)}:{m.group(3)}:{m.group(4)}+00:00"
    return r


def _encodable(row: dict, month: str) -> bool:
    if any(k not in row for k in BASE_KEYS):
        return False
    d = str(row["date"])
    m = _TS.match(str(row["checked_at"]))
    if not (len(d) == 10 and d.startswith(month + "-") and m and m.group(1) == d):
        return False
    try:
        json.dumps(row)
    except (TypeError, ValueError):
        return False
    return True


def encode_month(month: str, rows: list) -> dict:
    if not all(_encodable(r, month) for r in rows):
        return {"v": 1, "month": month, "rows": rows}
    items, item_ix, kws, kw_ix, ctxs, ctx_ix, shapes, shape_ix, out = [], {}, [], {}, [], {}, [], {}, []
    for r in rows:
        item = {k: r[k] for k in ITEM_KEYS if k in r}
        ik = _compact(item)
        if ik not in item_ix:
            item_ix[ik] = len(items); items.append(item)
        if r["keyword"] not in kw_ix:
            kw_ix[r["keyword"]] = len(kws); kws.append(r["keyword"])
        rest = {k: v for k, v in r.items() if k not in ITEM_KEYS and k not in BASE_KEYS}
        if all(k in rest for k in CTX_KEYS):                               # the three "which page was read" fields travel as one index
            ctx = [rest.pop(k) for k in CTX_KEYS]
            ck = _compact(ctx)
            if ck not in ctx_ix:
                ctx_ix[ck] = len(ctxs); ctxs.append(ctx)
            rest["@ctx"] = ctx_ix[ck]
        keys = sorted(rest)
        sk = _compact(keys)
        if sk not in shape_ix:
            shape_ix[sk] = len(shapes); shapes.append(keys)
        m = _TS.match(r["checked_at"])
        sec = int(m.group(2)) * 3600 + int(m.group(3)) * 60 + int(m.group(4))
        out.append([int(r["date"][8:10]), sec, item_ix[ik], kw_ix[r["keyword"]], shape_ix[sk], r["rank"], r["results_scanned"]] + [rest[k] for k in keys])
    return {"v": 2, "month": month, "items": items, "kws": kws, "ctx": ctxs, "shapes": shapes, "rows": out}


def decode_month(shard: dict) -> list:
    if shard.get("v") == 1:
        return list(shard["rows"])
    month, rows = shard["month"], []
    for a in shard["rows"]:
        d, sec, ii, ki, si, rank, scanned = a[:7]
        row = dict(shard["items"][ii])
        row["date"] = f"{month}-{d:02d}"
        row["checked_at"] = f"{row['date']}T{sec // 3600:02d}:{sec % 3600 // 60:02d}:{sec % 60:02d}+00:00"
        row["keyword"] = shard["kws"][ki]
        row["rank"] = rank
        row["results_scanned"] = scanned
        for key, val in zip(shard["shapes"][si], a[7:]):
            if key == "@ctx":
                row.update(zip(CTX_KEYS, shard["ctx"][val]))
            else:
                row[key] = val
        rows.append(row)
    return rows


# ---------------------------------------------------------------- loading and saving
def _dir(legacy_path: Path) -> Path:
    return Path(legacy_path).parent / "ranks"


def monthly_exists(legacy_path: Path) -> bool:
    return (_dir(legacy_path) / "index.json").exists()


def wants_monthly(legacy_path: Path) -> bool:
    return monthly_exists(legacy_path) or os.environ.get("RANK_STORAGE", "legacy").strip().lower() == "monthly"


def load(legacy_path: Path) -> list:
    """The whole history, oldest first, as a list of row dicts (the shape every tracker already works with)."""
    legacy_path = Path(legacy_path)
    if monthly_exists(legacy_path):
        index = json.loads((_dir(legacy_path) / "index.json").read_text(encoding="utf-8"))
        rows = []
        for month in index["months"]:
            rows.extend(decode_month(json.loads((_dir(legacy_path) / f"{month}.json").read_text(encoding="utf-8"))))
        return rows
    if legacy_path.exists():
        return json.loads(legacy_path.read_text(encoding="utf-8"))
    return []


def _save_legacy(legacy_path: Path, history: list) -> None:
    legacy_path.parent.mkdir(parents=True, exist_ok=True)
    with open(legacy_path, "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=2)


def save(legacy_path: Path, history: list) -> dict:
    """Save the whole history. Returns what happened (for the run log)."""
    legacy_path = Path(legacy_path)
    if not wants_monthly(legacy_path):
        _save_legacy(legacy_path, history)
        return {"mode": "legacy", "rows": len(history)}
    by_month = {}
    for r in history:
        by_month.setdefault(str(r.get("date", ""))[:7], []).append(r)
    texts = {}
    try:
        for month, rows in by_month.items():
            if not re.fullmatch(r"\d{4}-\d{2}", month):
                raise ValueError(f"a row has no usable date (month {month!r})")
            shard = encode_month(month, rows)
            text = _compact(shard)
            if decode_month(json.loads(text)) != [normalize(r) for r in rows]:      # nothing is written unless it reads back identically
                raise ValueError(f"month {month} does not read back identically")
            texts[month] = text
    except Exception as e:
        _save_legacy(legacy_path, history)
        return {"mode": "legacy-fallback", "rows": len(history), "error": f"{type(e).__name__}: {e}"}
    d = _dir(legacy_path)
    d.mkdir(parents=True, exist_ok=True)
    written = 0
    for month, text in texts.items():
        p = d / f"{month}.json"
        if not p.exists() or p.read_text(encoding="utf-8") != text:             # unchanged months are not touched (no new commit for them)
            tmp = p.with_suffix(".json.tmp")
            tmp.write_text(text, encoding="utf-8"); os.replace(tmp, p); written += 1
    months = sorted(texts)
    idx = _compact({"v": 2, "months": months, "rows": len(history)})
    ip = d / "index.json"
    if not ip.exists() or ip.read_text(encoding="utf-8") != idx:
        tmp = ip.with_suffix(".json.tmp")
        tmp.write_text(idx, encoding="utf-8"); os.replace(tmp, ip)
    return {"mode": "monthly", "rows": len(history), "months": months, "written": written, "bytes": sum(len(t.encode("utf-8")) for t in texts.values())}


def save_and_report(legacy_path: Path, history: list) -> dict:
    """save(), plus one line in the run log (and a loud warning if the safety net had to step in)."""
    import sys
    r = save(legacy_path, history)
    if r["mode"] == "monthly":
        print(f"Saved {r['rows']:,} rows in the monthly history ({len(r['months'])} month file(s), {r['written']} changed, {r['bytes'] / 1e6:.1f} MB in total).")
    elif r["mode"] == "legacy-fallback":
        print(f"  !! The compact monthly save could not be verified ({r['error']}), so this run saved the old way into {Path(legacy_path).name}. "
              "Nothing was lost; tell whoever maintains the tracker.", file=sys.stderr)
        print(f"Saved {r['rows']:,} rows to {Path(legacy_path).name}.")
    else:
        print(f"Saved {r['rows']:,} total rows to {legacy_path}")
    return r
