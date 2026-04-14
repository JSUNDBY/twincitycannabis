#!/usr/bin/env python3
"""
Merge Carrot (Wildflower) product data into data.js.

Same pattern as merge_jane_data.py: removes Weedmaps prices for
Carrot-scraped dispensaries, then adds verified prices from the
dispensary's own website.

Run after carrot_scrape.py:
    python3 scraper/carrot_scrape.py
    python3 scraper/merge_carrot_data.py
"""

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from normalize import categorize_by_name

DATA_DIR = Path(__file__).parent / "data"
CARROT_FILE = DATA_DIR / "carrot_products.json"
DATA_JS = Path(__file__).parent.parent / "js" / "data.js"


def main():
    if not CARROT_FILE.exists():
        print("No carrot_products.json found, skipping")
        return

    with open(CARROT_FILE) as f:
        products = json.load(f)

    if not products:
        print("carrot_products.json is empty, skipping")
        return

    carrot_dispensaries = set(p["dispensary_id"] for p in products)

    # Group by (name, weight, menu_type)
    grouped = {}
    excluded_count = 0
    for p in products:
        name = p["name"].strip()
        weight = (p.get("weight") or "").strip()
        menu_type = p.get("menu_type", "rec")
        brand = p.get("brand", "House")

        # Re-normalize the category — Carrot source data can mislabel flower
        # as topical etc. (same fix as merge_jane_data.py).
        raw_cat = p.get("category", "flower")
        normalized_cat = categorize_by_name(name, brand, raw_cat)
        if normalized_cat == "EXCLUDE":
            excluded_count += 1
            continue

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

    print(f"Loaded {len(products)} Carrot products -> {len(grouped)} unique" + (f" [excluded {excluded_count} mislabeled/junk]" if excluded_count else ""))
    print(f"Carrot dispensaries: {', '.join(sorted(carrot_dispensaries))}")

    if not DATA_JS.exists():
        print("data.js not found")
        return

    content = DATA_JS.read_text()

    # Find products array
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

    # Build name→image lookup from existing Weedmaps products before we wipe them.
    # This preserves images for products that Carrot scrapes without images.
    wm_images = {}
    for m in re.finditer(r"name:\s*'([^']+)'.*?image:\s*\"([^\"]+)\"", products_text, re.DOTALL):
        name = m.group(1).replace("\\'", "'")
        img = m.group(2)
        if img and 'placeholder' not in img:
            wm_images[name.lower().strip()] = img

    # Remove old Carrot entries (id starts with 'c'). Uses brace-counting
    # because the simple `[^{}]*` regex fails on entries with nested braces.
    from merge_jane_data import _strip_entries_with_id_prefix
    products_text, old_carrot = _strip_entries_with_id_prefix(products_text, 'c')
    if old_carrot:
        print(f"Removed {old_carrot} old Carrot entries")

    # Remove Carrot dispensary prices from Weedmaps entries
    removed_prices = 0
    for disp_id in carrot_dispensaries:
        pattern = rf"'{re.escape(disp_id)}':\s*[\d.]+,?\s*"
        count = len(re.findall(pattern, products_text))
        products_text = re.sub(pattern, "", products_text)
        removed_prices += count

    # Clean up commas
    products_text = re.sub(r",\s*,", ",", products_text)
    products_text = re.sub(r",\s*\}", " }", products_text)
    products_text = re.sub(r"\{\s*,", "{ ", products_text)

    print(f"Removed {removed_prices} Weedmaps price entries for Carrot dispensaries")

    # Add Carrot products
    carrot_entries = []
    for key, p in grouped.items():
        if not p["prices"]:
            continue

        prices_js = ", ".join(f"'{k}': {v}" for k, v in sorted(p["prices"].items()))
        low = min(p["prices"].values())
        history = [low] * 8

        name_escaped = p["name"].replace("'", "\\'")
        brand_escaped = p["brand"].replace("'", "\\'")
        # Use Weedmaps image as fallback if Carrot didn't provide one
        image = p.get("image") or wm_images.get(p["name"].lower().strip(), "")
        image_escaped = image.replace("'", "\\'")

        entry = (
            f"{{ id: 'c{len(carrot_entries):04d}', "
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
        carrot_entries.append(entry)

    if carrot_entries:
        carrot_block = ",\n".join(carrot_entries)
        new_products = products_text.rstrip().rstrip(",") + ",\n" + carrot_block + "\n"
        content = content[:start] + new_products + content[end:]

    DATA_JS.write_text(content)
    print(f"Added {len(carrot_entries)} Carrot products to data.js")


if __name__ == "__main__":
    main()
