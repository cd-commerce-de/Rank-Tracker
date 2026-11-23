"""
Recover readings that ended up in the OLD single file docs/data/ranks.json instead of the monthly files.

Why this exists: on 2026-11-23 a Temu run that crossed midnight UTC could not be stored in the compact monthly format, and the safety net
wrote the whole history to docs/data/ranks.json, which the dashboard does not read. The 277 readings of that run (199 real, 78 blocked)
were hidden there. This script reads the old file, merges every reading that the monthly files do not have (or have only as a blocked "?")
into the monthly files and saves them. It changes nothing if nothing is hidden, so it is safe to run any time.

  python scripts/recover_hidden_readings.py [path to docs/data/ranks.json]
"""

import json
import os
import sys
from pathlib import Path

import history_store
import merge_ranks


def main():
    path = Path(sys.argv[1] if len(sys.argv) > 1 else "docs/data/ranks.json")
    os.environ.setdefault("RANK_STORAGE", "monthly")
    if not path.exists():
        print(f"{path} does not exist: nothing can be hidden in it.")
        return
    if not history_store.monthly_exists(path):
        print("There are no monthly files yet, so the old file is still the history: nothing to recover.")
        return
    legacy = json.loads(path.read_text(encoding="utf-8"))
    legacy, relabelled = history_store.relabel_days(legacy)
    monthly = history_store.load(path)
    merged, changed = merge_ranks.merge(monthly, legacy)
    print(f"Old file: {len(legacy):,} rows | monthly files: {len(monthly):,} rows | readings only in the old file (or better there): {changed:,}")
    if relabelled:
        print(f"{relabelled} of the old file's readings were taken after midnight UTC and are dated with the day they were taken.")
    if not changed:
        print("Nothing is hidden: every reading of the old file is already in the monthly files.")
        return
    history_store.save_and_report(path, merged)
    print(f"Recovered {changed:,} reading(s).")


if __name__ == "__main__":
    main()
