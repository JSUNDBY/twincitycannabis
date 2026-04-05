#!/usr/bin/env python3
"""
Twin City Cannabis — Apify-powered menu scraper
Uses Apify's Weedmaps Dispensary Scraper to pull real menu data
with prices, products, images, THC/CBD, brands.

Usage:
  python3 apify_scrape.py                  # scrape all TC dispensaries
  python3 apify_scrape.py --test           # scrape just 2 dispensaries (test)
  python3 apify_scrape.py --update-site    # scrape + merge into data.js
"""

import json
import os
import time
from datetime import datetime
from pathlib import Path

import requests

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)

# Apify API
APIFY_TOKEN = os.environ.get("APIFY_TOKEN", "")
APIFY_BASE = "https://api.apify.com/v2"

# Weedmaps scraper actor ID (from Apify store)
# shahidirfan's actor is free and pulls full menu data with prices
WM_SCRAPER_ACTOR = "shahidirfan~weedmaps-dispensary-scraper"

# Twin Cities dispensary Weedmaps URLs
# Use Weedmaps slugs as IDs (must match what update_site.py generates)
TC_DISPENSARIES = [
    {"url": "https://weedmaps.com/dispensaries/minnesota-medical-solutions", "id": "minnesota-medical-solutions"},
    {"url": "https://weedmaps.com/dispensaries/sweet-leaves", "id": "sweet-leaves"},
    {"url": "https://weedmaps.com/dispensaries/legacy-cannabis-1", "id": "legacy-cannabis-1"},
    {"url": "https://weedmaps.com/dispensaries/legacy-cannabis", "id": "legacy-cannabis"},
    {"url": "https://weedmaps.com/dispensaries/unanimous-cannabis", "id": "unanimous-cannabis"},
    {"url": "https://weedmaps.com/dispensaries/wildflower-5", "id": "wildflower-5"},
    {"url": "https://weedmaps.com/dispensaries/wildflower-north-loop-1", "id": "wildflower-north-loop-1"},
    {"url": "https://weedmaps.com/dispensaries/bloomn", "id": "bloomn"},
    {"url": "https://weedmaps.com/dispensaries/edina-canna", "id": "edina-canna"},
    {"url": "https://weedmaps.com/dispensaries/minnesota-canna", "id": "minnesota-canna"},
    {"url": "https://weedmaps.com/dispensaries/leafline-labs-st-paul", "id": "leafline-labs-st-paul"},
    {"url": "https://weedmaps.com/dispensaries/dna-dispensary", "id": "dna-dispensary"},
    {"url": "https://weedmaps.com/dispensaries/frostbite-dispensary", "id": "frostbite-dispensary"},
    {"url": "https://weedmaps.com/dispensaries/lucky-strains-cannabis-dispensary", "id": "lucky-strains-cannabis-dispensary"},
    {"url": "https://weedmaps.com/dispensaries/hopkis-dispensary", "id": "hopkis-dispensary"},
    {"url": "https://weedmaps.com/dispensaries/minnesota-medical-solutions-bloomington", "id": "minnesota-medical-solutions-bloomington"},
    {"url": "https://weedmaps.com/dispensaries/rise-dispensaries-brooklyn-park", "id": "rise-dispensaries-brooklyn-park"},
    {"url": "https://weedmaps.com/dispensaries/green-goods-blaine", "id": "green-goods-blaine"},
    {"url": "https://weedmaps.com/dispensaries/leafline-labs-eagan", "id": "leafline-labs-eagan"},
    {"url": "https://weedmaps.com/dispensaries/anoka-cannabis-company", "id": "anoka-cannabis-company"},
    {"url": "https://weedmaps.com/dispensaries/green-goods-woodbury", "id": "green-goods-woodbury"},
    {"url": "https://weedmaps.com/dispensaries/green-goods-burnsville", "id": "green-goods-burnsville"},
    {"url": "https://weedmaps.com/dispensaries/bloom-wellness-dispensary-st-paul", "id": "bloom-wellness-dispensary-st-paul"},
    {"url": "https://weedmaps.com/dispensaries/higherplace", "id": "higherplace"},
    {"url": "https://weedmaps.com/dispensaries/loon-leaf", "id": "loon-leaf"},
]


def run_apify_scraper(dispensary_urls, max_items=200):
    """Run the Weedmaps scraper on Apify for each dispensary.
    shahidirfan's actor takes one URL at a time via 'startUrl'."""
    print(f"Starting Apify scraper for {len(dispensary_urls)} dispensaries...")
    all_results = []

    for disp in dispensary_urls:
        url = disp["url"]
        disp_id = disp["id"]
        print(f"\n  Scraping {disp_id}...")

        try:
            # Start run
            resp = requests.post(
                f"{APIFY_BASE}/acts/{WM_SCRAPER_ACTOR}/runs",
                params={"token": APIFY_TOKEN},
                json={"startUrl": url},
                timeout=30,
            )
            if resp.status_code == 402:
                print(f"    PAID ACTOR - skipping")
                continue
            resp.raise_for_status()

            run_id = resp.json()["data"]["id"]

            # Poll for completion
            for _ in range(30):  # max 5 min per dispensary
                time.sleep(10)
                r = requests.get(f"{APIFY_BASE}/actor-runs/{run_id}", params={"token": APIFY_TOKEN}, timeout=10)
                status = r.json()["data"]["status"]
                if status in ("SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"):
                    break

            if status != "SUCCEEDED":
                print(f"    Failed: {status}")
                continue

            # Fetch results
            dataset_id = r.json()["data"]["defaultDatasetId"]
            r2 = requests.get(
                f"{APIFY_BASE}/datasets/{dataset_id}/items",
                params={"token": APIFY_TOKEN, "format": "json"},
                timeout=30,
            )
            items = r2.json()
            if isinstance(items, list):
                # Tag each item with our dispensary ID
                for item in items:
                    if isinstance(item, dict):
                        item["_tcc_dispensary_id"] = disp_id
                all_results.extend(items)
                print(f"    Got {len(items)} products")
            else:
                print(f"    Unexpected response type: {type(items)}")

        except Exception as e:
            print(f"    Error: {e}")
            continue

        time.sleep(2)  # rate limit between dispensaries

    print(f"\nTotal: {len(all_results)} products from {len(dispensary_urls)} dispensaries")
    return all_results


def run_single_dispensary(url, dispensary_id):
    """Run scraper for a single dispensary (for testing)."""
    print(f"Scraping {url}...")
    results = run_apify_scraper([{"url": url, "id": dispensary_id}], max_items=50)
    return results


def parse_apify_results(results, dispensary_map):
    """Parse Apify results into our product format.

    shahidirfan's scraper returns rich Weedmaps data with fields like:
    - name, price_price, category_name, listing_slug
    - metrics_aggregates_thc, avatar_image_large_url
    - brand_endorsement_brand_name
    """
    products = []

    for item in results:
        if not isinstance(item, dict):
            continue

        # Skip non-menu-item records (first item is sometimes the dispensary itself)
        if item.get("record_type") and item["record_type"] != "menu_item":
            continue

        # Get dispensary ID - tagged by us, or from listing_slug
        dispensary_id = item.get("_tcc_dispensary_id", "")
        if not dispensary_id:
            listing_slug = item.get("listing_slug", "")
            for d in dispensary_map:
                if listing_slug and listing_slug in d["url"]:
                    dispensary_id = d["id"]
                    break
        if not dispensary_id:
            dispensary_id = item.get("listing_slug", "unknown")

        product = parse_menu_item(item, dispensary_id)
        if product and product.get("name") and product.get("price", 0) > 0:
            products.append(product)

    return products


def parse_menu_item(item, dispensary_id):
    """Parse a Weedmaps menu item from shahidirfan's Apify scraper.

    Key fields in the data:
    - name: product name
    - price_price: actual price as number
    - category_name: Indica/Sativa/Hybrid/Edible/etc
    - edge_category_name: Flower/Gummies/Cartridges/etc
    - metrics_aggregates_thc + _unit: THC value
    - avatar_image_large_url: product image
    - brand_endorsement_brand_name: brand
    - genetics_tag_name: strain type
    - listing_slug: dispensary slug
    """
    name = item.get("name", "")
    if not name:
        return None

    # Price - use price_price (numeric)
    price = item.get("price_price", 0) or 0

    # Category - prefer edge_category_name (Flower, Gummies, etc)
    cat_raw = item.get("edge_category_name", "") or item.get("category_name", "")
    category = normalize_category(cat_raw)

    # THC
    thc_val = item.get("metrics_aggregates_thc", "")
    thc_unit = item.get("metrics_aggregates_thc_unit", "%")
    thc = f"{thc_val}{thc_unit}" if thc_val else ""

    # CBD
    cbd_val = item.get("metrics_aggregates_cbd", "")
    cbd_unit = item.get("metrics_aggregates_cbd_unit", "%")
    cbd = f"{cbd_val}{cbd_unit}" if cbd_val and cbd_val > 0 else ""

    # Brand
    brand = item.get("brand_endorsement_brand_name", "") or "Unknown"

    # Image
    image = item.get("avatar_image_large_url", "") or item.get("avatar_image_original_url", "") or ""

    # Weight/size
    weight = item.get("price_label", "") or ""

    # Strain type
    strain_type = (item.get("genetics_tag_name", "") or "").lower()

    return {
        "dispensary_id": dispensary_id,
        "name": name.strip(),
        "brand": brand,
        "category": category,
        "strain_type": strain_type,
        "thc": thc,
        "cbd": cbd,
        "price": price,
        "weight": weight,
        "image": image,
        "scraped_at": datetime.now().isoformat(),
    }


def normalize_category(raw):
    """Normalize category names."""
    if not raw:
        return "flower"
    raw = raw.upper().strip()
    mapping = {
        "FLOWER": "flower", "INDICA": "flower", "SATIVA": "flower", "HYBRID": "flower",
        "PRE_ROLL": "pre-roll", "PRE-ROLL": "pre-roll", "PREROLL": "pre-roll", "PRE-ROLLS": "pre-roll",
        "VAPORIZER": "cartridge", "VAPORIZERS": "cartridge", "VAPE": "cartridge", "VAPES": "cartridge",
        "CARTRIDGE": "cartridge", "CARTRIDGES": "cartridge",
        "EDIBLE": "edible", "EDIBLES": "edible", "GUMMY": "edible", "GUMMIES": "edible",
        "CONCENTRATE": "concentrate", "CONCENTRATES": "concentrate", "EXTRACT": "concentrate", "EXTRACTS": "concentrate",
        "TOPICAL": "topical", "TOPICALS": "topical",
        "TINCTURE": "tincture", "TINCTURES": "tincture",
        "BEVERAGE": "beverage", "BEVERAGES": "beverage", "DRINK": "beverage", "DRINKS": "beverage",
        "ACCESSORIES": "accessories", "GEAR": "accessories",
    }
    return mapping.get(raw, raw.lower())


def build_price_comparison(products):
    """Group products by name for cross-dispensary price comparison."""
    grouped = {}

    for p in products:
        # Normalize product name for grouping
        name = p["name"].strip()
        if name not in grouped:
            grouped[name] = {
                "name": name,
                "brand": p.get("brand", "Unknown"),
                "category": p.get("category", "flower"),
                "strain_type": p.get("strain_type", ""),
                "thc": p.get("thc", ""),
                "cbd": p.get("cbd", ""),
                "weight": p.get("weight", ""),
                "image": p.get("image", ""),
                "prices": {},
            }
        if p.get("price") and p["price"] > 0:
            grouped[name]["prices"][p["dispensary_id"]] = p["price"]
        # Keep best image
        if p.get("image") and not grouped[name]["image"]:
            grouped[name]["image"] = p["image"]

    # Sort: products at multiple dispensaries first (more comparison value)
    result = sorted(grouped.values(), key=lambda x: (-len(x["prices"]), x["name"]))
    return result


def save_results(products, comparison):
    """Save scraped data."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M")

    # Raw products
    raw_path = DATA_DIR / f"apify_raw_{timestamp}.json"
    with open(raw_path, "w") as f:
        json.dump(products, f, indent=2)
    print(f"Raw data: {raw_path} ({len(products)} products)")

    # Price comparison
    comp_path = DATA_DIR / "apify_products.json"
    with open(comp_path, "w") as f:
        json.dump(comparison, f, indent=2)

    multi = sum(1 for p in comparison if len(p["prices"]) > 1)
    print(f"Comparison: {comp_path} ({len(comparison)} products, {multi} at multiple dispensaries)")

    return comp_path


def update_data_js(comparison):
    """Merge scraped products into data.js."""
    import re

    data_js = Path(__file__).parent.parent / "js" / "data.js"
    if not data_js.exists():
        print("data.js not found")
        return False

    content = data_js.read_text()

    # Build JS product entries
    lines = []
    for i, p in enumerate(comparison[:80]):  # Cap at 80 products for performance
        pid = f"p{i+1:03d}"
        prices_js = ", ".join(f"'{k}': {v}" for k, v in sorted(p["prices"].items()))

        # Build simple price history (current lowest + synthetic past)
        if p["prices"]:
            low = min(p["prices"].values())
            history = [int(low*1.12), int(low*1.1), int(low*1.08), int(low*1.06), int(low*1.04), int(low*1.02), int(low*1.01), low]
        else:
            history = [0]*8

        strain_id = "null"
        name_esc = p["name"].replace("'", "\\'")
        brand_esc = p.get("brand", "Unknown").replace("'", "\\'")

        lines.append(
            f"    {{ id: '{pid}', name: '{name_esc}', brand: '{brand_esc}', "
            f"category: '{p['category']}', strain: {strain_id}, "
            f"weight: '{p.get('weight', '')}', thc: '{p.get('thc', '')}', cbd: '{p.get('cbd', '')}',\n"
            f"      prices: {{ {prices_js} }},\n"
            f"      priceHistory: {json.dumps(history)} }}"
        )

    products_js = ",\n".join(lines)

    # Replace TCC.products array
    pattern = r"(TCC\.products = \[)\n.*?\n(\];)"
    replacement = f"\\1\n{products_js}\n\\2"
    new_content, count = re.subn(pattern, replacement, content, count=1, flags=re.DOTALL)

    if count == 0:
        print("Could not find TCC.products in data.js")
        return False

    # Update timestamp
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    ts_pattern = r"// Last auto-updated:.*\n"
    ts_line = f"// Last auto-updated: {timestamp}\n"
    if re.search(ts_pattern, new_content):
        new_content = re.sub(ts_pattern, ts_line, new_content)
    else:
        new_content = ts_line + new_content

    data_js.write_text(new_content)
    print(f"Updated data.js with {len(lines)} products at {timestamp}")
    return True


def main():
    import argparse
    parser = argparse.ArgumentParser(description="TCC Apify Scraper")
    parser.add_argument("--test", action="store_true", help="Test with 2 dispensaries")
    parser.add_argument("--update-site", action="store_true", help="Scrape + update data.js")
    args = parser.parse_args()

    print(f"\n{'='*60}")
    print(f"Twin City Cannabis — Apify Menu Scraper")
    print(f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}\n")

    # Select dispensaries
    if args.test:
        targets = TC_DISPENSARIES[:2]
        print(f"TEST MODE: scraping {len(targets)} dispensaries")
    else:
        targets = TC_DISPENSARIES
        print(f"Scraping {len(targets)} dispensaries")

    # Run Apify
    raw_results = run_apify_scraper(targets)

    if not raw_results:
        print("No results from Apify. Check your token and actor configuration.")
        return

    # Parse
    products = parse_apify_results(raw_results, targets)
    print(f"\nParsed {len(products)} total products")

    # Build comparison
    comparison = build_price_comparison(products)

    # Save
    save_results(products, comparison)

    # Summary
    by_disp = {}
    for p in products:
        did = p.get("dispensary_id", "?")
        by_disp[did] = by_disp.get(did, 0) + 1

    print(f"\nBy dispensary:")
    for did, count in sorted(by_disp.items(), key=lambda x: -x[1]):
        print(f"  {did}: {count}")

    by_cat = {}
    for p in products:
        cat = p.get("category", "?")
        by_cat[cat] = by_cat.get(cat, 0) + 1

    print(f"\nBy category:")
    for cat, count in sorted(by_cat.items(), key=lambda x: -x[1]):
        print(f"  {cat}: {count}")

    # Update site if requested
    if args.update_site:
        update_data_js(comparison)


if __name__ == "__main__":
    main()
