"""
Loads "what to track" for every marketplace tracker.

THE SHEET HAS TWO TABS (the recommended setup):

  Keywords tab   -> columns:  project, keyword
  Products tab   -> columns:  project, marketplace, country, product_id [, name]

  Every product in a project is checked against every keyword of that project.
  Add a keyword once and it is tracked for all of the project's products, on
  every marketplace; add a product once and it is tracked for all of the
  project's keywords. Example:

    Keywords:   WGH30 (3T Car Jacks) | wagenheber
                WGH30 (3T Car Jacks) | wagenheber 3t
    Products:   WGH30 (3T Car Jacks) | ebay | DE | 184176192867 | 3T jack
                WGH30 (3T Car Jacks) | otto | DE | S0VCI0CR     | 3T jack
                WGH30 (3T Car Jacks) | ebay | DE | 297129125625 | 5T jack
    => 3 products x 2 keywords = 6 rank checks per day.

  (The older single table  project,marketplace,country,product_id,keyword
  with one row per product+keyword still works too.)

WHERE THE TABLES COME FROM, in order:
  1. TRACKING_SHEET_CSV_URL (a GitHub secret): the link(s) to your Google Sheet
     tab(s). Put the link of EACH tab in the secret, separated by spaces, commas
     or new lines. Which tab is which is worked out from its column headings.
  2. config/products.csv + config/keywords.csv in the repo.
  3. config/tracked.csv (the older single table).
  4. config/projects.json (the original JSON format).

The result is the same project -> items -> keywords structure the trackers have
always used, so the trackers themselves did not need to change.
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
CONFIG_DIR = ROOT / "config"
PRODUCTS_PATH = CONFIG_DIR / "products.csv"
KEYWORDS_PATH = CONFIG_DIR / "keywords.csv"
CSV_PATH = CONFIG_DIR / "tracked.csv"
JSON_PATH = CONFIG_DIR / "projects.json"

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


def _clean(raw):
    """Tolerate any header capitalisation/spacing, e.g. 'Product ID'."""
    return {
        (k or "").strip().lower().replace(" ", "_"): (v or "").strip()
        for k, v in raw.items() if k is not None
    }


def classify(fieldnames):
    """Which kind of table is this? Decided by its column headings."""
    cols = {(c or "").strip().lower().replace(" ", "_") for c in (fieldnames or [])}
    if "product_id" in cols and "keyword" in cols:
        return "table"      # older single table: one row per product + keyword
    if "product_id" in cols:
        return "products"
    if "keyword" in cols:
        return "keywords"
    return None


class _Builder:
    def __init__(self):
        self.projects = {}   # project_id -> {project_id, project_name, items{}, keywords[]}
        self.skipped = 0

    def project(self, name):
        pid = slugify(name)
        return self.projects.setdefault(
            pid, {"project_id": pid, "project_name": name, "items": {}, "keywords": [], "from_products": set()}
        )

    def add_item(self, row, via_products_tab):
        name, marketplace = row.get("project", ""), row.get("marketplace", "").lower()
        country = (row.get("country", "") or "DE").upper()
        product_id = row.get("product_id", "")
        if not (name and marketplace and product_id):
            self.skipped += 1
            return None
        if product_id.upper().startswith("REPLACE"):
            self.skipped += 1   # untouched example row
            return None
        if marketplace not in ID_FIELD:
            print(f"  ! ignoring row with unknown marketplace '{marketplace}'", file=sys.stderr)
            self.skipped += 1
            return None
        project = self.project(name)
        item_key = f"{marketplace}-{country}-{product_id}"
        item = project["items"].setdefault(item_key, {
            "item_key": item_key, "marketplace": marketplace, "country": country,
            ID_FIELD[marketplace]: product_id, "keywords": [],
        })
        label = row.get("name") or row.get("label") or ""
        if label and not item.get("label"):
            item["label"] = label
        if via_products_tab:
            project["from_products"].add(item_key)
        return item

    def add_keyword(self, project_name, keyword):
        if not (project_name and keyword):
            self.skipped += 1
            return
        kws = self.project(project_name)["keywords"]
        if keyword not in kws:
            kws.append(keyword)

    def result(self):
        out = []
        for project in self.projects.values():
            shared = project["keywords"]
            if shared and not project["from_products"]:
                print(f"  ! keywords for project '{project['project_name']}' have no products yet "
                      f"(add its product IDs on the Products tab)", file=sys.stderr)
            for key in project["from_products"]:
                item = project["items"][key]
                for kw in shared:
                    if kw not in item["keywords"]:
                        item["keywords"].append(kw)
            items = [i for i in project["items"].values() if i["keywords"]]
            for i in project["items"].values():
                if not i["keywords"]:
                    print(f"  ! product {i['item_key']} in project '{project['project_name']}' has no "
                          f"keywords yet (add some on the Keywords tab)", file=sys.stderr)
            if items:
                out.append({"project_id": project["project_id"], "project_name": project["project_name"], "items": items})
        if self.skipped:
            print(f"  (skipped {self.skipped} incomplete/example row(s) in the tracking tables)")
        return out


def build_projects(tables):
    """tables: list of (kind, [row dicts]) where kind is table/products/keywords."""
    b = _Builder()
    for kind, rows in tables:
        for raw in rows:
            row = _clean(raw)
            if kind == "keywords":
                b.add_keyword(row.get("project", ""), row.get("keyword", ""))
            elif kind == "products":
                b.add_item(row, via_products_tab=True)
            else:  # older single table
                item = b.add_item(row, via_products_tab=False)
                kw = row.get("keyword", "")
                if item is not None and kw:
                    if kw not in item["keywords"]:
                        item["keywords"].append(kw)
                elif item is not None:
                    b.skipped += 1
    return b.result()


def parse_csv_texts(texts):
    """Parse one or more CSV texts (each may be a different tab) into projects."""
    tables = []
    for i, text in enumerate(texts, 1):
        reader = csv.DictReader(io.StringIO(text))
        kind = classify(reader.fieldnames)
        if kind is None:
            raise RuntimeError(
                f"Table {i} has none of the expected columns. A Keywords tab needs the columns "
                f"'project, keyword'; a Products tab needs 'project, marketplace, country, product_id'. "
                f"Found: {', '.join(c for c in (reader.fieldnames or []) if c) or '(no headings)'}"
            )
        tables.append((kind, list(reader)))
    kinds = {k for k, _ in tables}
    if "table" not in kinds:
        if "keywords" in kinds and "products" not in kinds:
            print("  ! Only a KEYWORDS tab was found. The TRACKING_SHEET_CSV_URL secret must also contain the "
                  "link of the PRODUCTS tab: put both links in the secret, one per line.", file=sys.stderr)
        elif "products" in kinds and "keywords" not in kinds:
            print("  ! Only a PRODUCTS tab was found. The TRACKING_SHEET_CSV_URL secret must also contain the "
                  "link of the KEYWORDS tab: put both links in the secret, one per line.", file=sys.stderr)
    return build_projects(tables)


def parse_csv_text(text):
    return parse_csv_texts([text])


def normalize_sheet_url(url: str) -> str:
    """
    Accept the normal Google Sheets link you copy from the address bar or the
    Share button (.../d/<id>/edit?...#gid=123) and turn it into the CSV
    download link for that tab. Links that are already CSV/published links are
    left alone.
    """
    if "/pub" in url or "/export" in url or "output=csv" in url or "format=csv" in url:
        return url
    m = re.search(r"docs\.google\.com/spreadsheets/d/([\w-]+)", url)
    if not m:
        return url
    gid = re.search(r"[#&?]gid=(\d+)", url)
    export = f"https://docs.google.com/spreadsheets/d/{m.group(1)}/export?format=csv"
    return export + (f"&gid={gid.group(1)}" if gid else "")


def fetch_sheet_csv(url: str) -> str:
    url = normalize_sheet_url(url)
    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
    except requests.RequestException as e:
        raise RuntimeError(
            "Could not download the tracking sheet from TRACKING_SHEET_CSV_URL. "
            "The sheet must be shared as 'Anyone with the link: Viewer' (or published "
            f"to the web as CSV). ({e})"
        )
    text = resp.content.decode("utf-8-sig")
    # A sheet that isn't shared widely enough returns a sign-in web page, not
    # data. Fail loudly instead of quietly tracking nothing.
    if text.lstrip()[:15].lower().startswith(("<!doctype", "<html")):
        raise RuntimeError(
            "TRACKING_SHEET_CSV_URL returned a web page instead of spreadsheet data. "
            "In Google Sheets, click Share -> General access -> 'Anyone with the link' "
            "(Viewer), or use File -> Share -> Publish to web -> CSV."
        )
    return text


def split_urls(value: str):
    return [u for u in re.split(r"[\s,]+", (value or "").strip()) if u]


def load_projects():
    urls = split_urls(os.environ.get("TRACKING_SHEET_CSV_URL", ""))
    if urls:
        print(f"Reading products & keywords from the Google Sheet ({len(urls)} tab link{'s' if len(urls) != 1 else ''})")
        return parse_csv_texts([fetch_sheet_csv(u) for u in urls])

    if PRODUCTS_PATH.exists() and KEYWORDS_PATH.exists():
        print("Reading products & keywords from config/products.csv + config/keywords.csv")
        return parse_csv_texts([PRODUCTS_PATH.read_text(encoding="utf-8-sig"), KEYWORDS_PATH.read_text(encoding="utf-8-sig")])

    if CSV_PATH.exists():
        print(f"Reading products & keywords from {CSV_PATH.relative_to(ROOT)}")
        return parse_csv_text(CSV_PATH.read_text(encoding="utf-8-sig"))

    if JSON_PATH.exists():
        print(f"Reading products & keywords from {JSON_PATH.relative_to(ROOT)}")
        with open(JSON_PATH, "r", encoding="utf-8") as f:
            return json.load(f)

    return []
