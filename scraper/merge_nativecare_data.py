#!/usr/bin/env python3
"""
Merge NativeCare W. St. Paul product data into data.js.

NativeCare publishes their W. St. Paul menu on their own WordPress site
(not Weedmaps/Jane/Carrot), so the main scraper can't pick them up. This
reads nativecare_products.json (built by scraper/nativecare_scrape.py) and
merges it into TCC.products with id prefix 'n####'.

Stale-entry cleanup reuses _strip_entries_with_id_prefix from
merge_jane_data.py (brace-counting parser that handles nested prices: {}).

Run after nativecare_scrape.py:
    python3 scraper/nativecare_scrape.py
    python3 scraper/merge_nativecare_data.py
"""

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from normalize import categorize_by_name
from merge_jane_data import _strip_entries_with_id_prefix

DATA_DIR = Path(__file__).parent / "data"
NC_FILE = DATA_DIR / "nativecare_products.json"
DATA_JS = Path(__file__).parent.parent / "js" / "data.js"


def main():
    if not NC_FILE.exists():
        print("No nativecare_products.json found, skipping")
        return

    with open(NC_FILE) as f:
        products = json.load(f)

    if not products:
        print("nativecare_products.json is empty, skipping")
        return

    nc_dispensaries = set(p["dispensary_id"] for p in products)

    # Group by (name, weight, menu_type) for unique products across tiers
    grouped = {}
    excluded = 0
    for p in products:
        name = p["name"].strip()
        weight = (p.get("weight") or "").strip()
        menu_type = p.get("menu_type", "rec")
        brand = p.get("brand", "House")

        raw_cat = p.get("category", "flower")
        # NativeCare's menu is manually curated and we parse category from
        # section headers, so we trust it. Only override if normalize returns
        # a *different* valid category (signals obvious mislabel, e.g. a
        # "Gummy" that was tagged flower). Otherwise keep the source.
        normalized = categorize_by_name(name, brand, raw_cat)
        if normalized not in ("EXCLUDE", raw_cat) and normalized in (
            "flower", "pre-roll", "cartridge", "edible", "concentrate",
            "topical", "tincture", "beverage"
        ):
            normalized_cat = normalized
        else:
            normalized_cat = raw_cat

        key = f"{name}|||{weight}|||{menu_type}"
        if key not in grouped:
            grouped[key] = {
                "name": name,
                "brand": brand,
                "category": normalized_cat,
                "menu_type": menu_type,
                "thc": p.get("thc", ""),
                "cbd": p.get("cbd", ""),
                "weight": weight,
                "image": p.get("image", ""),
                "prices": {},
            }
        grouped[key]["prices"][p["dispensary_id"]] = p["price"]
        if p.get("image") and not grouped[key]["image"]:
            grouped[key]["image"] = p["image"]

    print(
        f"Loaded {len(products)} NativeCare products -> {len(grouped)} unique"
        + (f" [excluded {excluded} mislabeled/junk]" if excluded else "")
    )
    print(f"NativeCare dispensaries: {', '.join(sorted(nc_dispensaries))}")

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

    # Remove previously-added NativeCare entries (id starts with 'n')
    products_text, old_nc = _strip_entries_with_id_prefix(products_text, "n")
    if old_nc:
        print(f"Removed {old_nc} old NativeCare entries before re-adding")

    # Build new NativeCare entries
    nc_entries = []
    for key, p in grouped.items():
        if not p["prices"]:
            continue

        prices_js = ", ".join(f"'{k}': {v}" for k, v in sorted(p["prices"].items()))
        low = min(p["prices"].values())
        history = [low] * 8

        name_escaped = p["name"].replace("'", "\\'")
        brand_escaped = p["brand"].replace("'", "\\'")
        image_escaped = (p.get("image") or "").replace("'", "\\'")

        entry = (
            f"{{ id: 'n{len(nc_entries):04d}', "
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
        nc_entries.append(entry)

    if nc_entries:
        nc_block = ",\n".join(nc_entries)
        new_products = products_text.rstrip().rstrip(",") + ",\n" + nc_block + "\n"
        content = content[:start] + new_products + content[end:]

    DATA_JS.write_text(content)
    print(f"Added {len(nc_entries)} NativeCare products to data.js")


if __name__ == "__main__":
    main()
