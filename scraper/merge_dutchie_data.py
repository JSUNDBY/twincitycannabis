#!/usr/bin/env python3
"""
Merge Dutchie POS product data into data.js.

Same pattern as merge_carrot_data.py: removes Weedmaps prices for
Dutchie-scraped dispensaries, then adds verified prices from the
dispensary's own storefront. Dutchie entries get id prefix 'du'.

Run after dutchie_scrape.py:
    python3 scraper/dutchie_scrape.py
    python3 scraper/merge_dutchie_data.py
"""

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from normalize import categorize_by_name

DATA_DIR = Path(__file__).parent / "data"
DUTCHIE_FILE = DATA_DIR / "dutchie_products.json"
DATA_JS = Path(__file__).parent.parent / "js" / "data.js"

VALID_CATEGORIES = ("flower", "pre-roll", "cartridge", "edible",
                    "beverage", "concentrate", "tincture", "topical")


def main():
    if not DUTCHIE_FILE.exists():
        print("No dutchie_products.json found, skipping")
        return

    with open(DUTCHIE_FILE) as f:
        products = json.load(f)

    if not products:
        print("dutchie_products.json is empty, skipping")
        return

    dutchie_dispensaries = set(p["dispensary_id"] for p in products)

    grouped = {}
    excluded_count = 0
    for p in products:
        name = p["name"].strip()
        weight = (p.get("weight") or "").strip()
        menu_type = p.get("menu_type", "rec")
        brand = p.get("brand", "House")

        # Re-normalize, but trust the store's own category when name-based
        # detection has no opinion (Dutchie categories are the store's real
        # taxonomy — same policy as merge_carrot_data.py).
        raw_cat = p.get("category", "flower")
        normalized_cat = categorize_by_name(name, brand, raw_cat)
        if normalized_cat == "EXCLUDE":
            from normalize import _PATTERNS
            probe = f"{name} {brand}"
            junk = (_PATTERNS["EXCLUDE_NOT_PRODUCT"].search(probe)
                    or _PATTERNS["ACCESSORIES_EARLY"].search(probe)
                    or _PATTERNS["ACCESSORIES"].search(probe))
            if junk or raw_cat not in VALID_CATEGORIES:
                excluded_count += 1
                continue
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
                "strain_type": p.get("strain_type", ""),
                "prices": {},
            }
        grouped[key]["prices"][p["dispensary_id"]] = p["price"]
        if p.get("image") and not grouped[key]["image"]:
            grouped[key]["image"] = p["image"]

    print(f"Loaded {len(products)} Dutchie products -> {len(grouped)} unique"
          + (f" [excluded {excluded_count} junk]" if excluded_count else ""))
    print(f"Dutchie dispensaries: {', '.join(sorted(dutchie_dispensaries))}")

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

    # Remove old Dutchie entries (id starts with 'du').
    from merge_jane_data import _strip_entries_with_id_prefix
    products_text, old_dutchie = _strip_entries_with_id_prefix(products_text, 'du')
    if old_dutchie:
        print(f"Removed {old_dutchie} old Dutchie entries")

    # Remove Dutchie dispensary prices from Weedmaps entries
    removed_prices = 0
    for disp_id in dutchie_dispensaries:
        pattern = rf"'{re.escape(disp_id)}':\s*[\d.]+,?\s*"
        removed_prices += len(re.findall(pattern, products_text))
        products_text = re.sub(pattern, "", products_text)

    products_text = re.sub(r",\s*,", ",", products_text)
    products_text = re.sub(r",\s*\}", " }", products_text)
    products_text = re.sub(r"\{\s*,", "{ ", products_text)

    print(f"Removed {removed_prices} Weedmaps price entries for Dutchie dispensaries")

    dutchie_entries = []
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
            f"{{ id: 'du{len(dutchie_entries):04d}', "
            f"name: '{name_escaped}', "
            f"brand: '{brand_escaped}', "
            f"category: '{p['category']}', "
            f"strain: null, "
            f"strainType: '{p.get('strain_type', '')}', "
            f"weight: '{p['weight']}', "
            f"thc: '{p.get('thc', '')}', "
            f"cbd: '{p.get('cbd', '')}',\n"
            f"      image: \"{image_escaped}\",\n"
            f"      prices: {{ {prices_js} }},\n"
            f"      priceHistory: {json.dumps(history)} }}"
        )
        dutchie_entries.append(entry)

    if dutchie_entries:
        dutchie_block = ",\n".join(dutchie_entries)
        new_products = products_text.rstrip().rstrip(",") + ",\n" + dutchie_block + "\n"
        content = content[:start] + new_products + content[end:]

    DATA_JS.write_text(content)
    print(f"Added {len(dutchie_entries)} Dutchie products to data.js")


if __name__ == "__main__":
    main()
