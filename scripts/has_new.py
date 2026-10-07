"""
Decides whether this workflow run has anything to do, and tells the workflow
via its output file (GITHUB_OUTPUT):  run=true  or  run=false.

- Full runs (the daily 06:00 run, and the Sync button): always run=true.
- Hourly "pick-up" runs (ONLY_NEW=1): run=true only if the products & keywords
  table contains something that has never been checked before AND the
  marketplace it belongs to has its credentials set up. Otherwise run=false,
  and the rest of the workflow is skipped — an idle hourly run costs seconds.

The "credentials are set up" part matters: without it, a product on a
marketplace you haven't connected yet would look "new" forever and trigger a
pointless run every hour.
"""

import json
import os
import sys
from pathlib import Path

import config_loader

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "docs" / "data" / "ranks.json"

# marketplace -> environment variables that must all be present
NEEDS = {
    "ebay": ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET"],
    "otto": ["BRIGHTDATA_API_KEY", "BRIGHTDATA_ZONE"],
    "kaufland": ["BRIGHTDATA_API_KEY", "BRIGHTDATA_ZONE"],
    "temu": ["BRIGHTDATA_BROWSER_AUTH"],
}


def configured(marketplace: str) -> bool:
    return all(os.environ.get(v, "").strip() for v in NEEDS.get(marketplace, ["__missing__"]))


def find_new(projects, history):
    known = {(r["project_id"], r["item_key"], r["keyword"]) for r in history}
    new = []
    for project in projects:
        for item in project.get("items", []):
            if not configured(item.get("marketplace", "")):
                continue
            for keyword in item.get("keywords", []):
                if (project["project_id"], item["item_key"], keyword) not in known:
                    new.append((project["project_name"], item["marketplace"], item["item_key"], keyword))
    return new


def write_output(run: bool):
    path = os.environ.get("GITHUB_OUTPUT")
    line = f"run={'true' if run else 'false'}\n"
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.write(line)
    print(line.strip())


def main():
    if os.environ.get("ONLY_NEW") != "1":
        print("Full run (daily check or Sync button): checking everything.")
        write_output(True)
        return

    projects = config_loader.load_projects()
    history = json.loads(DATA_PATH.read_text(encoding="utf-8")) if DATA_PATH.exists() else []
    new = find_new(projects, history)
    if new:
        print(f"{len(new)} new keyword(s) to check, e.g.: {new[0]}")
    else:
        print("Nothing new since the last check — skipping this run.")
    write_output(bool(new))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # fail loudly (e.g. the sheet isn't shared), never silently skip
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
