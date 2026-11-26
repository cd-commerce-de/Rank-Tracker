"""
What is still left to read on Otto today?

Uses exactly the tracker's rule (otto_unlocker_tracker.build_work) and makes NO request to Otto or Bright Data, so it costs nothing.
A keyword with a valid reading dated today (UTC) is done and is never read again that day; what is left is
  * keywords that were BLOCKED earlier today (they are tried again), and
  * keywords that have not been tried yet today, and
  * dormant keywords that only need a "carried" row (no request, no cost).
It prints the numbers, writes todo=N (and retry=, fresh=, carried=, already=) to $GITHUB_OUTPUT and a short table to $GITHUB_STEP_SUMMARY, so
the scheduled workflow can stop right here when todo=0: no Bright Data request, nothing to pay.
"""

import os
from datetime import date

import config_loader
import history_store
import otto_unlocker_tracker as ot

PRICE_PER_READ = 0.0025   # an upper bound per successful read (the zone's rate; check your zone's price); whether Otto's failed attempts are billed too: see scripts/otto_probe.py


def main():
    projects = config_loader.load_projects()
    history = history_store.load(ot.DATA_PATH)
    today = date.today().isoformat()
    work, carried = ot.build_work(projects, history, today, ot.dormant_keywords(history, today))

    otto_today = [r for r in history if r.get("marketplace") == "otto" and r["date"] == today]
    key = lambda r: ((r.get("country") or "DE").upper(), r["keyword"])
    blocked_keys = {key(r) for r in otto_today if r.get("blocked")}
    read_keys = {key(r) for r in otto_today if not r.get("blocked") and not r.get("carried")}
    outstanding = len(work)
    retry = sum(1 for (region, kw) in work if (region.upper(), kw) in blocked_keys)
    fresh = outstanding - retry
    already = len({k for k in read_keys if k not in {(r.upper(), w) for r, w in work}})
    n_carried = len({(region, kw) for _, _, _, region, kw in carried})
    todo = outstanding + n_carried

    print(f"Otto, {today} (UTC):")
    print(f"  already read today (valid reading, never read again today): {already} keyword(s)")
    print(f"  still to do: {outstanding} keyword(s) = {retry} blocked earlier today (tried again) + {fresh} not tried yet")
    if n_carried:
        print(f"  dormant keywords that only need a carried row (no request): {n_carried}")
    if outstanding:
        print(f"  most this can cost if every one of them is read: about ${outstanding * PRICE_PER_READ:.2f} "
              f"(a keyword is billed once, when it is read; whether Otto's refusal pages are billed too is measured by scripts/otto_probe.py)")
    else:
        print("  nothing to read: no request will be made.")

    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as f:
            f.write(f"todo={todo}\nretry={retry}\nfresh={fresh}\nalready={already}\ncarried={n_carried}\n")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write(f"### Otto, {today} (UTC)\n\n| | keywords |\n|---|--:|\n| already read today (not read again) | {already} |\n"
                    f"| blocked earlier today (tried again) | {retry} |\n| not tried yet | {fresh} |\n| dormant (carried row, no request) | {n_carried} |\n"
                    f"| **to do in this run** | **{todo}** |\n")


if __name__ == "__main__":
    main()
