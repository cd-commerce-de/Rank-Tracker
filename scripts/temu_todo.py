"""
What is still left to read on Temu today?

Uses exactly the tracker's rule (temu_unlocker_tracker.build_work) and makes NO request to Temu or Bright Data, so it costs nothing.
A keyword with a valid reading dated today (UTC) is done and is never read again that day; what is left is
  * keywords that were BLOCKED earlier today (they are tried again; blocked attempts are not billed), and
  * keywords that have not been tried yet today.
It prints the numbers, writes todo=N (and retry=, fresh=) to $GITHUB_OUTPUT and a short table to $GITHUB_STEP_SUMMARY, so the scheduled
workflow can stop right here when todo=0: no Bright Data request, nothing to pay.
"""

import os
import sys
from datetime import date

import config_loader
import history_store
import temu_unlocker_tracker as tu

PRICE_PER_READ = 0.0025   # rough: the zone's rate plus the premium-domain surcharge, per successful read


def main():
    projects = config_loader.load_projects()
    history = history_store.load(tu.DATA_PATH)
    today = date.today().isoformat()
    work = tu.build_work(projects, history, today)

    temu_today = [r for r in history if r.get("marketplace") == "temu" and r["date"] == today]
    key = lambda r: ((r.get("country") or "DE").upper(), r["keyword"])
    read_keys = {key(r) for r in temu_today if not r.get("blocked")}
    blocked_keys = {key(r) for r in temu_today if r.get("blocked")}
    outstanding = len(work)
    retry = sum(1 for (region, kw) in work if (region.upper(), kw) in blocked_keys)
    fresh = outstanding - retry
    already = len({k for k in read_keys if k not in {(r.upper(), w) for r, w in work}})

    print(f"Temu, {today} (UTC):")
    print(f"  already read today (valid reading, never read again today): {already} keyword(s)")
    print(f"  still to do: {outstanding} keyword(s) = {retry} blocked earlier today (tried again) + {fresh} not tried yet")
    if outstanding:
        print(f"  most this can cost if every one of them is read: about ${outstanding * PRICE_PER_READ:.2f} "
              f"(a keyword is billed once, when it is read; blocked attempts are not billed)")
    else:
        print("  nothing left: no request will be made.")

    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as f:
            f.write(f"todo={outstanding}\nretry={retry}\nfresh={fresh}\nalready={already}\n")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write(f"### Temu, {today} (UTC)\n\n| | keywords |\n|---|--:|\n| already read today (not read again) | {already} |\n"
                    f"| blocked earlier today (tried again) | {retry} |\n| not tried yet | {fresh} |\n"
                    f"| **to do in this run** | **{outstanding}** |\n")


if __name__ == "__main__":
    main()
