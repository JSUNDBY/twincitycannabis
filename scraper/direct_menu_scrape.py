#!/usr/bin/env python3
"""
Twin City Cannabis — Direct Menu Scraper
Hits the same Weedmaps API endpoint that powers their menu pages.
Pulls ALL products for each dispensary, not just 20.

This works from local machines but may get blocked from GitHub Actions
datacenter IPs. Use Apify as fallback for CI.

Usage:
  python3 direct_menu_scrape.py                # scrape all menus
  python3 direct_menu_scrape.py --update-site  # scrape + update data.js
  python3 direct_menu_scrape.py --test         # test with 1 dispensary
"""

import json
import os
import time
import re
from datetime import datetime
from pathlib import Path

import requests

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Referer": "https://weedmaps.com/",
}

# Residential proxy support (IPRoyal or any SOCKS5/HTTP proxy)
# Set via environment variable: PROXY_URL=http://user:pass@proxy.iproyal.com:12321
PROXY_URL = os.environ.get("PROXY_URL", "")
PROXIES = {"http": PROXY_URL, "https": PROXY_URL} if PROXY_URL else None

# Weedmaps discovery API - the same one their menu pages use
WM_API = "https://api-g.weedmaps.com/discovery/v1/listings/dispensaries"


def get_dispensary_slugs():
    """Get all TC dispensary slugs from Weedmaps."""
    print("Fetching TC dispensary list...")
    r = requests.get(
        "https://api-g.weedmaps.com/discovery/v2/listings",
        params={
            "filter[any_retailer_services][]": "storefront",
            "latlng": "44.9778,-93.2650",
            "page_size": 50,
        },
        headers=HEADERS,
        proxies=PROXIES,
        timeout=15,
    )
    r.raise_for_status()
    listings = r.json()["data"]["listings"]

    dispensaries = []
    for l in listings:
        menu_count = l.get("menu_items_count", 0)
        if menu_count > 0:
            dispensaries.append({
                "slug": l["slug"],
                "name": l["name"],
                "city": l.get("city", ""),
                "menu_count": menu_count,
            })

    print(f"Found {len(dispensaries)} dispensaries with menus ({sum(d['menu_count'] for d in dispensaries)} total products)")
    return dispensaries


def scrape_menu(slug, name=""):
    """Scrape ALL menu items for a dispensary."""
    all_items = []
    page = 1

    while True:
        url = f"{WM_API}/{slug}/menu_items"
        try:
            r = requests.get(
                url,
                params={"page": page, "page_size": 50},
                headers=HEADERS,
                proxies=PROXIES,
                timeout=30,
            )

            if r.status_code == 406:
                print(f"  Blocked (406) - try from different network")
                return all_items
            r.raise_for_status()

            data = r.json()
            items = data.get("data", {}).get("menu_items", [])
            if not items:
                break

            all_items.extend(items)
            print(f"  Page {page}: {len(items)} items (total: {len(all_items)})")

            # Check if there are more pages
            meta = data.get("meta", {})
            total_items = meta.get("total_menu_items", 0)
            if len(all_items) >= total_items or len(items) < 50:
                break

            page += 1
            time.sleep(0.5)  # polite

        except requests.exceptions.HTTPError as e:
            print(f"  Error on page {page}: {e}")
            break
        except Exception as e:
            print(f"  Error: {e}")
            break

    return all_items


def parse_menu_item(item, dispensary_slug):
    """Parse a Weedmaps menu item into our format."""
    # Price - Weedmaps nests prices like:
    # { "grams_per_eighth": 3.5, "ounce": [{"label":"1/8 oz","price":50}], "unit": [{"price":36}] }
    # The actual price is inside the array objects, NOT the top-level numeric fields
    prices_data = item.get("prices", {})
    price = 0
    weight = ""

    # Check array-style price entries first (ounce, unit, gram, etc.)
    price_arrays = ["unit", "ounce", "gram", "half_gram", "two_grams", "eighth", "quarter", "half_ounce"]
    for pf in price_arrays:
        val = prices_data.get(pf)
        if isinstance(val, list) and val:
            # Get the first (cheapest) option
            for variant in val:
                if isinstance(variant, dict) and variant.get("price", 0) > 0:
                    price = variant["price"]
                    weight = variant.get("label", pf.replace("_", " "))
                    break
            if price > 0:
                break
        elif isinstance(val, dict) and val.get("price", 0) > 0:
            price = val["price"]
            weight = val.get("label", pf.replace("_", " "))
            break

    # Skip grams_per_eighth - it's a conversion factor (3.5), not a price
    # Only use top-level numeric values if they're clearly prices (> $4)
    if not price:
        for k, v in prices_data.items():
            if k == "grams_per_eighth":
                continue
            if isinstance(v, (int, float)) and v > 4:
                price = v
                weight = k.replace("_", " ")
                break

    # Category
    cat_raw = item.get("category", {})
    if isinstance(cat_raw, dict):
        cat_name = cat_raw.get("name", "")
    else:
        cat_name = str(cat_raw)

    category = normalize_category(cat_name)

    # THC/CBD from metrics.cannabinoids
    thc = ""
    cbd = ""
    metrics = item.get("metrics", {})
    if isinstance(metrics, dict):
        cannabinoids = metrics.get("cannabinoids", [])
        for c in cannabinoids if isinstance(cannabinoids, list) else []:
            if isinstance(c, dict):
                code = c.get("code", "").lower()
                value = c.get("value", 0)
                unit = c.get("unit", "%")
                if code == "thc" and value:
                    thc = f"{value}{unit}"
                elif code == "cbd" and value and value > 0:
                    cbd = f"{value}{unit}"

    # Fallback: lab_results
    if not thc:
        lab_results = item.get("lab_results", [])
        for lr in lab_results if isinstance(lab_results, list) else []:
            if isinstance(lr, dict):
                if lr.get("cannabinoid", "").lower() == "thc":
                    thc = f"{lr.get('value', '')}%"
                elif lr.get("cannabinoid", "").lower() == "cbd":
                    cbd_val = lr.get("value", 0)
                    if cbd_val and cbd_val > 0:
                        cbd = f"{cbd_val}%"

    # Image - prefer large_url
    avatar = item.get("avatar_image", {})
    image = ""
    if isinstance(avatar, dict):
        image = avatar.get("large_url", "") or avatar.get("small_url", "") or avatar.get("original_url", "")
    # Skip placeholder images
    if image and "placeholder" in image:
        image = ""

    # Brand - check multiple sources
    brand = ""

    # 1. brand_endorsement (most reliable)
    endorsement = item.get("brand_endorsement", {})
    if isinstance(endorsement, dict):
        brand = endorsement.get("brand_name", "")

    # 2. brand object
    if not brand:
        brand_data = item.get("brand", {})
        if isinstance(brand_data, dict):
            brand = brand_data.get("name", "")

    # 3. Extract from product name (e.g. "Vireo | Cherry Bomb | Cartridge")
    if not brand:
        name = item.get("name", "")
        if "|" in name:
            brand = name.split("|")[0].strip()
        elif " - " in name and not name.startswith("$"):
            parts = name.split(" - ")
            # Only use first part as brand if it looks like a brand (short, capitalized)
            if len(parts[0]) < 25 and parts[0][0].isupper():
                brand = parts[0].strip()

    if not brand:
        brand = "House"

    # Genetics / strain type
    genetics = (item.get("genetics", "") or "").lower()

    return {
        "dispensary_id": dispensary_slug,
        "name": item.get("name", "").strip(),
        "brand": brand,
        "category": category,
        "strain_type": genetics,
        "thc": thc,
        "cbd": cbd,
        "price": price,
        "weight": weight,
        "image": image,
        "scraped_at": datetime.now().isoformat(),
    }


def normalize_category(raw):
    """Normalize the upstream category label.

    NOTE: This only translates the API's label. The real categorization
    (which uses the product name to override miscategorized items) is done
    by normalize.categorize_by_name() in build_price_comparison().
    """
    if not raw:
        return "flower"
    raw = raw.upper().strip()
    mapping = {
        "FLOWER": "flower", "INDICA": "flower", "SATIVA": "flower", "HYBRID": "flower",
        "PRE_ROLL": "pre-roll", "PRE-ROLL": "pre-roll", "PREROLL": "pre-roll", "PRE-ROLLS": "pre-roll",
        "VAPORIZER": "cartridge", "VAPORIZERS": "cartridge", "VAPE": "cartridge", "VAPES": "cartridge",
        "CARTRIDGE": "cartridge", "CARTRIDGES": "cartridge",
        "EDIBLE": "edible", "EDIBLES": "edible", "GUMMY": "edible", "GUMMIES": "edible",
        "CONCENTRATE": "concentrate", "CONCENTRATES": "concentrate", "EXTRACT": "concentrate",
        "TOPICAL": "topical", "TOPICALS": "topical",
        "TINCTURE": "tincture", "TINCTURES": "tincture",
        "BEVERAGE": "beverage", "BEVERAGES": "beverage", "DRINK": "beverage", "DRINKS": "beverage",
        "GEAR": "accessories", "ACCESSORIES": "accessories",
    }
    return mapping.get(raw, raw.lower())


# Import the smart name-based normalizer
from normalize import categorize_by_name as _smart_categorize


def build_price_comparison(products):
    """Group products by name + weight for cross-dispensary price comparison.

    Products are keyed by (name, weight) so a 0.5g and 1g version of the same
    product stay separate. Without this, the same product name at different
    sizes merges into one entry with wildly different prices (e.g., $65 for a
    1g cart vs $110 for a 2g at another location).
    """
    grouped = {}

    for p in products:
        name = p["name"].strip()
        if not name or p.get("price", 0) <= 0:
            continue

        weight = (p.get("weight") or "").strip()
        key = (name, weight)

        if key not in grouped:
            grouped[key] = {
                "name": name,
                "brand": p.get("brand", "Unknown"),
                "category": p.get("category", "flower"),
                "strain_type": p.get("strain_type", ""),
                "thc": p.get("thc", ""),
                "cbd": p.get("cbd", ""),
                "weight": weight,
                "image": p.get("image", ""),
                "prices": {},
            }

        grouped[key]["prices"][p["dispensary_id"]] = p["price"]
        if p.get("image") and not grouped[key]["image"]:
            grouped[key]["image"] = p["image"]
        if p.get("thc") and not grouped[key]["thc"]:
            grouped[key]["thc"] = p["thc"]

    # Apply smart name-based categorization and drop excluded products
    cleaned = []
    excluded = 0
    for p in grouped.values():
        new_cat = _smart_categorize(p["name"], p.get("brand", ""), p.get("category", ""))
        if new_cat == 'EXCLUDE':
            excluded += 1
            continue
        p["category"] = new_cat
        cleaned.append(p)
    if excluded:
        print(f"  [normalize] Excluded {excluded} non-cannabis or junk products")

    result = sorted(cleaned, key=lambda x: (-len(x["prices"]), x["name"]))
    return result


def get_real_history(product_name):
    """Get real price history from price_tracker if available."""
    history_file = DATA_DIR / "price_history_export.json"
    if not hasattr(get_real_history, '_cache'):
        if history_file.exists():
            with open(history_file) as f:
                get_real_history._cache = json.load(f)
        else:
            get_real_history._cache = {}
    key = product_name.strip().lower()
    history = get_real_history._cache.get(key)
    if history and len(set(history)) > 1:  # only use if there's actual variation
        return history
    return None


def update_data_js(comparison):
    """Merge ALL products into data.js.
    Includes every product from every dispensary so detail pages show full menus.
    Products at multiple dispensaries are prioritized (shown first for Compare page).
    """
    data_js = Path(__file__).parent.parent / "js" / "data.js"
    if not data_js.exists():
        print("data.js not found")
        return False

    content = data_js.read_text()

    # Sort: multi-dispensary first, then by name
    sorted_products = sorted(comparison, key=lambda x: (-len(x["prices"]), x["name"]))

    # Include ALL products - every dispensary should show its full menu
    lines = []
    for i, p in enumerate(sorted_products):
        pid = f"p{i+1:04d}"
        prices_js = ", ".join(f"'{k}': {v}" for k, v in sorted(p["prices"].items()))

        if p["prices"]:
            low = min(p["prices"].values())
            # Use real price history if available
            real_history = get_real_history(p["name"])
            if real_history:
                history = real_history
            else:
                # No history yet - just show flat (honest)
                history = [low] * 8
        else:
            history = [0]*8

        name_esc = p["name"].replace("\\", "\\\\").replace("'", "\\'")
        brand_esc = p.get("brand", "Unknown").replace("\\", "\\\\").replace("'", "\\'")
        img = json.dumps(p.get("image", "") or "")

        lines.append(
            f"    {{ id: '{pid}', name: '{name_esc}', brand: '{brand_esc}', "
            f"category: '{p['category']}', strain: null, "
            f"weight: '{p.get('weight', '')}', thc: '{p.get('thc', '')}', cbd: '{p.get('cbd', '')}',\n"
            f"      image: {img},\n"
            f"      prices: {{ {prices_js} }},\n"
            f"      priceHistory: {json.dumps(history)} }}"
        )

    products_js = ",\n".join(lines)

    pattern = r"(TCC\.products = \[)\n.*?\n(\];)"
    replacement = f"\\1\n{products_js}\n\\2"
    new_content, count = re.subn(pattern, replacement, content, count=1, flags=re.DOTALL)

    if count == 0:
        print("Could not find TCC.products in data.js")
        return False

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    ts_pattern = r"// Last auto-updated:.*\n"
    ts_line = f"// Last auto-updated: {timestamp}\n"
    if re.search(ts_pattern, new_content):
        new_content = re.sub(ts_pattern, ts_line, new_content)
    else:
        new_content = ts_line + new_content

    data_js.write_text(new_content)
    multi = sum(1 for p in sorted_products[:2000] if len(p["prices"]) > 1)
    total = len(lines)
    print(f"\nUpdated data.js: {total} products ({multi} at multiple dispensaries)")
    return True


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--update-site", action="store_true")
    parser.add_argument("--test", action="store_true")
    args = parser.parse_args()

    print(f"\n{'='*60}")
    print(f"Twin City Cannabis — Direct Menu Scraper")
    print(f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}\n")

    dispensaries = get_dispensary_slugs()

    if args.test:
        dispensaries = dispensaries[:1]
        print(f"TEST MODE: {dispensaries[0]['name']}")

    all_products = []
    for d in dispensaries:
        print(f"\n{d['name']} ({d['menu_count']} expected)...")
        raw_items = scrape_menu(d["slug"], d["name"])

        for item in raw_items:
            parsed = parse_menu_item(item, d["slug"])
            if parsed["name"] and parsed["price"] > 0:
                all_products.append(parsed)

        time.sleep(1)

    print(f"\n{'='*60}")
    print(f"TOTAL: {len(all_products)} products from {len(dispensaries)} dispensaries")
    print(f"{'='*60}")

    # Category breakdown
    by_cat = {}
    for p in all_products:
        by_cat[p["category"]] = by_cat.get(p["category"], 0) + 1
    for cat, count in sorted(by_cat.items(), key=lambda x: -x[1]):
        print(f"  {cat}: {count}")

    # Save
    comparison = build_price_comparison(all_products)
    multi = sum(1 for p in comparison if len(p["prices"]) > 1)
    print(f"\n{len(comparison)} unique products ({multi} at multiple dispensaries)")

    save_path = DATA_DIR / "full_menu_products.json"
    with open(save_path, "w") as f:
        json.dump(comparison, f, indent=2)
    print(f"Saved to {save_path}")

    if args.update_site:
        update_data_js(comparison)


if __name__ == "__main__":
    main()
