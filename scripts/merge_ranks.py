"""
Merge two versions of the rank history without losing a reading.

Why: a run reads for an hour or two and then commits the history files (docs/data/ranks/YYYY-MM.json and index.json). If another run saved
its own readings meanwhile (or the run started from an older copy of the repository), Git cannot merge the two versions of those
compact single-line files and the push fails; the readings that were paid for would be lost. This script merges by CONTENT instead:

  * a reading is identified by (date, project_id, item_key, keyword), exactly as the trackers identify it (one per day);
  * readings that exist on only one side are all kept;
  * when both sides have the same reading, a real one beats a blocked one ("?"), otherwise the later check wins.

usage:  python scripts/merge_ranks.py --ours <ranks.json path in one tree> --theirs <ranks.json path in the other tree> --out <ranks.json path to write>
(the paths are the legacy file name docs/data/ranks.json; the monthly files sit in the ranks/ folder next to it, as history_store expects).
"""

import argparse
import json
import os
import sys
from pathlib import Path

import history_store


def row_key(r: dict):
    try:
        return (r["date"], r["project_id"], r["item_key"], r["keyword"])
    except KeyError:
        return ("?", json.dumps(r, sort_keys=True, ensure_ascii=False))       # a row without the usual fields is kept as it is, never merged


def better(a: dict, b: dict) -> dict:
    """Which of two readings of the same product, keyword and day to keep."""
    a_blocked, b_blocked = bool(a.get("blocked")), bool(b.get("blocked"))
    if a_blocked != b_blocked:
        return b if a_blocked else a                                             # a real reading beats a blocked one
    return b if str(b.get("checked_at", "")) > str(a.get("checked_at", "")) else a


def merge(theirs: list, ours: list):
    """theirs = the base (what is already on the server), ours = what this run produced. Returns (merged rows, how many of our rows were added or replaced something)."""
    out, index, changed = [], {}, 0
    for r in theirs:
        k = row_key(r)
        if k in index:
            out[index[k]] = better(out[index[k]], r)
        else:
            index[k] = len(out); out.append(r)
    for r in ours:
        k = row_key(r)
        if k not in index:
            index[k] = len(out); out.append(r); changed += 1
        else:
            keep = better(out[index[k]], r)
            if keep is not out[index[k]]:
                out[index[k]] = keep; changed += 1
    out.sort(key=lambda r: str(r.get("date", "")))                               # stable: keeps the order inside a day
    return out, changed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ours", required=True)
    ap.add_argument("--theirs", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    os.environ.setdefault("RANK_STORAGE", "monthly")
    theirs, ours = history_store.load(Path(a.theirs)), history_store.load(Path(a.ours))
    merged, changed = merge(theirs, ours)
    print(f"Merged the rank history: {len(theirs):,} rows on the server + {len(ours):,} rows from this run -> {len(merged):,} rows "
          f"({changed:,} reading(s) of this run added or replaced an older one).")
    r = history_store.save(Path(a.out), merged)
    if r["mode"] == "legacy-fallback":
        print(f"  !! the compact save could not be verified ({r['error']}); saved the old way", file=sys.stderr)


if __name__ == "__main__":
    main()
