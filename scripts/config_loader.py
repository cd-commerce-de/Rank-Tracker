"""
Loads "what to track" for every marketplace tracker, from a simple table:

    project,marketplace,country,product_id,keyword

One row per product + keyword. Example:

    WGH30 (3T Car Jacks),ebay,DE,123456789012,wagenheber
    WGH30 (3T Car Jacks),ebay,DE,123456789012,wagenheber 3t
    WGH30 (3T Car Jacks),otto,DE,S0HH60QI,wagenheber 3t

Where the table comes from, in order:
  1. A Google Sheet published as CSV, if the TRACKING_SHEET_CSV_URL
     environment variable (a GitHub secret) is set — this is the
     "edit a spreadsheet, no code" route.
  2. config/tracked.csv in the repo — the "upload a file" route.
  3. config/projects.json — the original JSON format, kept so older
     setups keep working.

The result is the same project -> items -> keywords structure the trackers
have always used, so nothing else about them had to change.
"""

import csv
import io
import json
import os
import re
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "config" / "tracked.csv"
JSON_PATH = ROOT / "config" / "projects.json"

# Which config field each marketplace's tracker expects the product ID in.
ID_FIELD = {
    "ebay": "ebay_item_id",
    "otto": "otto_product_id",
    "kaufland": "kaufland_product_id",
    "temu": "temu_goods_id",
}


def slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug or "project"


def rows_to_projects(rows):
    """Turn flat table rows into the project -> items -> keywords structure."""
    projects = {}
    skipped = 0

    for raw in rows:
        # Tolerate any header capitalisation/spacing, e.g. "Product ID"
        row = {
            (k or "").strip().lower().replace(" ", "_"): (v or "").strip()
            for k, v in raw.items()
        }
        project_name = row.get("project", "")
        marketplace = row.get("marketplace", "").lower()
        country = (row.get("country", "") or "DE").upper()
        product_id = row.get("product_id", "")
        keyword = row.get("keyword", "")

        if not (project_name and marketplace and product_id and keyword):
            skipped += 1
            continue
        if product_id.upper().startswith("REPLACE"):
            skipped += 1  # untouched example row
            continue
        if marketplace not in ID_FIELD:
            print(f"  ! ignoring row with unknown marketplace '{marketplace}'", file=sys.stderr)
            skipped += 1
            continue

        project_id = slugify(project_name)
        project = projects.setdefault(
            project_id,
            {"project_id": project_id, "project_name": project_name, "items": {}},
        )
        item_key = f"{marketplace}-{country}-{product_id}"
        item = project["items"].setdefault(
            item_key,
            {
                "item_key": item_key,
                "marketplace": marketplace,
                "country": country,
                ID_FIELD[marketplace]: product_id,
                "keywords": [],
            },
        )
        if keyword not in item["keywords"]:
            item["keywords"].append(keyword)

    result = []
    for project in projects.values():
        project["items"] = list(project["items"].values())
        result.append(project)

    if skipped:
        print(f"  (skipped {skipped} incomplete/example row(s) in the tracking table)")
    return result


def parse_csv_text(text: str):
    return rows_to_projects(csv.DictReader(io.StringIO(text)))


def fetch_sheet_csv(url: str) -> str:
    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
    except requests.RequestException as e:
        raise RuntimeError(
            "Could not download the tracking sheet from TRACKING_SHEET_CSV_URL. "
            "Check the link is the 'Publish to web' CSV link and that it is still "
            f"published. ({e})"
        )
    return resp.content.decode("utf-8-sig")


def load_projects():
    url = os.environ.get("TRACKING_SHEET_CSV_URL", "").strip()
    if url:
        print("Reading products & keywords from the Google Sheet")
        return parse_csv_text(fetch_sheet_csv(url))

    if CSV_PATH.exists():
        print(f"Reading products & keywords from {CSV_PATH.relative_to(ROOT)}")
        return parse_csv_text(CSV_PATH.read_text(encoding="utf-8-sig"))

    if JSON_PATH.exists():
        print(f"Reading products & keywords from {JSON_PATH.relative_to(ROOT)}")
        with open(JSON_PATH, "r", encoding="utf-8") as f:
            return json.load(f)

    return []
