#!/usr/bin/env python3
"""
Merge Meadow product data into js/data.js.

Reads scraper/data/meadow_products.json (built by scraper/meadow_scrape.py)
and merges into TCC.products with id prefix 'm####'. Pattern mirrors
merge_dispensary_shop_data.py.

Run after meadow_scrape.py:
    python3 scraper/meadow_scrape.py
    python3 scraper/merge_meadow_data.py
"""

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from normalize import categorize_by_name
from merge_jane_data import _strip_entries_with_id_prefix

DATA_DIR = Path(__file__).parent / "data"
DS_FILE = DATA_DIR / "meadow_products.json"
DATA_JS = Path(__file__).parent.parent / "js" / "data.js"

ID_PREFIX = "m"


def main():
    if not DS_FILE.exists():
        print("No meadow_products.json found, skipping")
        return

    with open(DS_FILE) as f:
        payload = json.load(f)
    products = payload.get("products", [])
    if not products:
        print("meadow_products.json is empty, skipping")
        return

    shops = sorted(set(p["dispensary_id"] for p in products))
    print(f"Meadow dispensaries: {', '.join(shops)}")

    # Group by (name, brand, weight, menu_type) so the same product across
    # shops collapses into one TCC entry with multi-shop prices.
    grouped = {}
    excluded = 0
    for p in products:
        name = p["name"].strip()
        weight = (p.get("weight") or "").strip()
        menu_type = p.get("menu_type", "rec")
        brand = p.get("brand") or "House"
        raw_cat = p.get("category", "")

        normalized = categorize_by_name(name, brand, raw_cat)
        valid = ("flower", "pre-roll", "cartridge", "edible", "concentrate",
                 "topical", "tincture", "beverage")
        if normalized == "EXCLUDE" or normalized not in valid:
            excluded += 1
            continue

        key = f"{name}|||{brand}|||{weight}|||{menu_type}"
        if key not in grouped:
            grouped[key] = {
                "name": name,
                "brand": brand,
                "category": normalized,
                "menu_type": menu_type,
                "thc": p.get("thc", ""),
                "cbd": p.get("cbd", ""),
                "weight": weight,
                "image": p.get("image", ""),
                "prices": {},
            }
        grouped[key]["prices"][p["dispensary_id"]] = p["price"]

    if excluded:
        print(f"Skipped {excluded} non-cannabis or unrecognized products")

    if not DATA_JS.exists():
        print("data.js not found")
        return

    content = DATA_JS.read_text()
    match = re.search(r"TCC\.products\s*=\s*\[", content)
    if not match:
        print("Could not find TCC.products in data.js")
        return

    start = match.end()
    depth = 1
    pos = start
    while depth > 0 and pos < len(content):
        if content[pos] == "[":
            depth += 1
        elif content[pos] == "]":
            depth -= 1
        pos += 1
    end = pos - 1

    products_text = content[start:end]
    products_text, old_count = _strip_entries_with_id_prefix(products_text, ID_PREFIX)
    if old_count:
        print(f"Removed {old_count} old Meadow entries before re-adding")

    new_entries = []
    for key, p in grouped.items():
        if not p["prices"]:
            continue
        prices_js = ", ".join(f"'{k}': {v}" for k, v in sorted(p["prices"].items()))
        low = min(p["prices"].values())
        history = [low] * 8
        name_escaped = p["name"].replace("\\", "\\\\").replace("'", "\\'")
        brand_escaped = p["brand"].replace("\\", "\\\\").replace("'", "\\'")
        image_escaped = (p.get("image") or "").replace('"', '\\"')
        entry = (
            f"{{ id: '{ID_PREFIX}{len(new_entries):04d}', "
            f"name: '{name_escaped}', "
            f"brand: '{brand_escaped}', "
            f"category: '{p['category']}', "
            f"strain: null, "
            f"weight: '{p['weight']}', "
            f"thc: '{p.get('thc', '')}', "
            f"cbd: '{p.get('cbd', '')}',\n"
            f"      image: \"{image_escaped}\",\n"
            f"      prices: {{ {prices_js} }},\n"
            f"      priceHistory: {json.dumps(history)} }}"
        )
        new_entries.append(entry)

    if new_entries:
        block = ",\n".join(new_entries)
        new_products = products_text.rstrip().rstrip(",") + ",\n" + block + "\n"
        content = content[:start] + new_products + content[end:]

    DATA_JS.write_text(content)
    print(f"Added {len(new_entries)} Meadow products to data.js")


if __name__ == "__main__":
    main()
