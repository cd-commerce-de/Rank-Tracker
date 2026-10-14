"""
Writes docs/data/config.json: the CURRENT products and keywords from your tracking sheet (with SKU and product name).

Why: ranks.json is a history. Keywords you remove from the sheet stay in it (so their history is not lost), and the
dashboard used to keep showing them. The dashboard now reads this file and shows only what is in the sheet today;
the SKU and name shown in the product dropdown come from here too. If you add a keyword back, its old history
reappears.

Safety: the file is only rewritten when something changed, and never replaced by an empty list (a sheet that
failed to load must not hide everything).
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import config_loader

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "data" / "config.json"


def build(projects):
    out = []
    for p in projects:
        items = []
        for it in p.get("items", []):
            pid = next((it[f] for f in config_loader.ID_FIELD.values() if it.get(f)), "")
            items.append({
                "item_key": it["item_key"], "marketplace": it["marketplace"], "country": it.get("country", ""),
                "product_id": pid, "sku": it.get("sku", ""), "label": it.get("label", ""),
                "source": it.get("source", ""), "keywords": list(it.get("keywords", [])),
            })
        out.append({"project_id": p["project_id"], "project_name": p["project_name"], "items": items})
    return out


def main():
    projects = build(config_loader.load_projects())
    n_kw = sum(len(i["keywords"]) for p in projects for i in p["items"])
    if not projects or n_kw == 0:
        print("The sheet returned no products/keywords, so config.json was left as it is.", file=sys.stderr)
        return
    if OUT.exists():
        try:
            if json.loads(OUT.read_text(encoding="utf-8")).get("projects") == projects:
                print("config.json is already up to date.")
                return
        except (ValueError, OSError):
            pass
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"updated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "projects": projects},
                              ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"config.json written: {sum(len(p['items']) for p in projects)} product(s), {n_kw} product/keyword pair(s).")


if __name__ == "__main__":
    main()
