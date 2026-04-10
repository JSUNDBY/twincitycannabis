#!/usr/bin/env python3
"""
Merge Jane (iHeartJane) rec menu data into data.js.

For dispensaries scraped via Jane (currently all Green Goods locations), this
script replaces their Weedmaps prices with the verified rec menu prices from
Jane. Other dispensaries keep their Weedmaps-sourced data unchanged.

This solves the medical-vs-rec pricing issue: Weedmaps flags Green Goods as
medical dispensaries and may be serving medical prices. Jane lets us pull
specifically from the rec menu.

Run after jane_scrape.js:
    node scraper/jane_scrape.js
    python3 scraper/merge_jane_data.py

Integrated into pi_scrape.sh between the Weedmaps scrape and build_seo.js.
"""

import json
import re
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"
JANE_FILE = DATA_DIR / "jane_products.json"
DATA_JS = Path(__file__).parent.parent / "js" / "data.js"


def load_jane_products():
    """Load Jane-scraped products and group by (name, weight, menu_type)."""
    if not JANE_FILE.exists():
        print("No jane_products.json found, skipping Jane merge")
        return {}, set()

    with open(JANE_FILE) as f:
        products = json.load(f)

    if not products:
        print("jane_products.json is empty, skipping")
        return {}, set()

    # Collect which dispensary IDs are Jane-sourced
    jane_dispensaries = set(p["dispensary_id"] for p in products)

    # Group by (name, weight, menu_type) for cross-store comparison
    # Rec and med versions of the same product stay separate
    grouped = {}
    rec_count = 0
    med_count = 0
    for p in products:
        name = p["name"].strip()
        weight = (p.get("weight") or "").strip()
        menu_type = p.get("menu_type", "rec")
        key = f"{name}|||{weight}|||{menu_type}"

        if menu_type == "med":
            med_count += 1
        else:
            rec_count += 1

        if key not in grouped:
            grouped[key] = {
                "name": name,
                "brand": p.get("brand", "House"),
                "category": p.get("category", "flower"),
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

    print(f"Loaded {len(products)} Jane products ({rec_count} rec, {med_count} med) -> {len(grouped)} unique")
    print(f"Jane dispensaries: {', '.join(sorted(jane_dispensaries))}")
    return grouped, jane_dispensaries


def merge_into_data_js(jane_grouped, jane_dispensaries):
    """Replace Jane dispensary prices in data.js with verified rec prices."""
    if not DATA_JS.exists():
        print("data.js not found")
        return

    content = DATA_JS.read_text()

    # Find the products array
    match = re.search(r"TCC\.products\s*=\s*\[", content)
    if not match:
        print("Could not find TCC.products in data.js")
        return

    # Find the closing bracket of the products array
    start = match.end()
    depth = 1
    pos = start
    while depth > 0 and pos < len(content):
        if content[pos] == "[":
            depth += 1
        elif content[pos] == "]":
            depth -= 1
        pos += 1
    end = pos - 1  # position of the closing ]

    products_text = content[start:end]

    # Step 1: Remove any previously-added Jane entries (id starts with 'j')
    # so we don't accumulate orphans on repeated runs
    old_jane = len(re.findall(r"id:\s*'j\d{4}'", products_text))
    products_text = re.sub(
        r"\{[^{}]*id:\s*'j\d{4}'[^{}]*priceHistory:[^}]*\},?\s*",
        "",
        products_text
    )
    if old_jane:
        print(f"Removed {old_jane} old Jane entries before re-adding fresh ones")

    # Step 2: Remove Jane dispensary prices from Weedmaps product entries
    removed_prices = 0
    removed_products = 0

    for disp_id in jane_dispensaries:
        # Match patterns like 'minnesota-medical-solutions': 25.0 or 'green-goods-blaine': 41.89
        pattern = rf"'{re.escape(disp_id)}':\s*[\d.]+,?\s*"
        count = len(re.findall(pattern, products_text))
        products_text = re.sub(pattern, "", products_text)
        removed_prices += count

    # Clean up any double commas or trailing commas in price objects left behind
    products_text = re.sub(r",\s*,", ",", products_text)
    products_text = re.sub(r",\s*\}", " }", products_text)
    products_text = re.sub(r"\{\s*,", "{ ", products_text)

    # Remove products that now have empty prices (all their prices were at Jane dispensaries)
    # Pattern: a product entry with prices: { } (empty after removal)
    # This is tricky with regex, so we'll leave them — the clean_orphans.py step handles it

    print(f"Removed {removed_prices} Weedmaps price entries for Jane dispensaries")

    # Now add Jane products to the array
    # Insert them at the end of the products array, before the closing ]
    jane_entries = []
    for key, p in jane_grouped.items():
        if not p["prices"]:
            continue

        menu_type = p.get("menu_type", "rec")
        prices_js = ", ".join(f"'{k}': {v}" for k, v in sorted(p["prices"].items()))
        low = min(p["prices"].values())
        history = [low] * 8

        name_escaped = p["name"].replace("'", "\\'")
        brand_escaped = p["brand"].replace("'", "\\'")
        image_escaped = (p.get("image") or "").replace("'", "\\'")

        # Medical products get menu_type: 'med' field so the frontend can
        # show the ℞ indicator and support the rec/med filter toggle
        menu_type_field = f"menu_type: '{menu_type}', " if menu_type == "med" else ""

        entry = (
            f"{{ id: 'j{len(jane_entries):04d}', "
            f"name: '{name_escaped}', "
            f"brand: '{brand_escaped}', "
            f"category: '{p['category']}', "
            f"{menu_type_field}"
            f"strain: null, "
            f"weight: '{p['weight']}', "
            f"thc: '{p.get('thc', '')}', "
            f"cbd: '{p.get('cbd', '')}',\n"
            f"      image: \"{image_escaped}\",\n"
            f"      prices: {{ {prices_js} }},\n"
            f"      priceHistory: {json.dumps(history)} }}"
        )
        jane_entries.append(entry)

    if jane_entries:
        jane_block = ",\n".join(jane_entries)
        # Insert before the closing bracket
        new_products = products_text.rstrip().rstrip(",") + ",\n" + jane_block + "\n"
        content = content[:start] + new_products + content[end:]

    DATA_JS.write_text(content)
    print(f"Added {len(jane_entries)} Jane rec products to data.js")
    print(f"Total operation: removed {removed_prices} med prices, added {len(jane_entries)} rec products")


if __name__ == "__main__":
    jane_grouped, jane_dispensaries = load_jane_products()
    if jane_grouped:
        merge_into_data_js(jane_grouped, jane_dispensaries)
