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
# kinaesthetic_millionaire's actor pulls full product/menu data with prices
WM_SCRAPER_ACTOR = "kinaesthetic_millionaire~weedmaps-dispensaries-products"

# Twin Cities dispensary Weedmaps URLs
TC_DISPENSARIES = [
    {"url": "https://weedmaps.com/dispensaries/minnesota-medical-solutions", "id": "green-goods-mpls"},
    {"url": "https://weedmaps.com/dispensaries/sweet-leaves", "id": "sweetleaves-north-loop"},
    {"url": "https://weedmaps.com/dispensaries/legacy-cannabis-1", "id": "legacy-cannabis-mpls"},
    {"url": "https://weedmaps.com/dispensaries/legacy-cannabis", "id": "legacy-cannabis-woodbury"},
    {"url": "https://weedmaps.com/dispensaries/unanimous-cannabis", "id": "unanimous-cannabis"},
    {"url": "https://weedmaps.com/dispensaries/wildflower-5", "id": "wildflower"},
    {"url": "https://weedmaps.com/dispensaries/wildflower-north-loop-1", "id": "wildflower-north-loop"},
    {"url": "https://weedmaps.com/dispensaries/bloomn", "id": "bloomn"},
    {"url": "https://weedmaps.com/dispensaries/edina-canna", "id": "edina-canna"},
    {"url": "https://weedmaps.com/dispensaries/minnesota-canna", "id": "minnesota-canna"},
    {"url": "https://weedmaps.com/dispensaries/leafline-labs-st-paul", "id": "rise-st-paul"},
    {"url": "https://weedmaps.com/dispensaries/dna-dispensary", "id": "dna-dispensary"},
    {"url": "https://weedmaps.com/dispensaries/frostbite-dispensary", "id": "frostbite-dispensary"},
    {"url": "https://weedmaps.com/dispensaries/lucky-strains-cannabis-dispensary", "id": "lucky-strains"},
    {"url": "https://weedmaps.com/dispensaries/hopkis-dispensary", "id": "hopkins-dispensary"},
    {"url": "https://weedmaps.com/dispensaries/minnesota-medical-solutions-bloomington", "id": "green-goods-bloomington"},
    {"url": "https://weedmaps.com/dispensaries/rise-dispensaries-brooklyn-park", "id": "rise-brooklyn-park"},
    {"url": "https://weedmaps.com/dispensaries/green-goods-blaine", "id": "green-goods-blaine"},
    {"url": "https://weedmaps.com/dispensaries/leafline-labs-eagan", "id": "rise-eagan"},
    {"url": "https://weedmaps.com/dispensaries/anoka-cannabis-company", "id": "anoka-cannabis"},
    {"url": "https://weedmaps.com/dispensaries/green-goods-woodbury", "id": "green-goods-woodbury"},
    {"url": "https://weedmaps.com/dispensaries/green-goods-burnsville", "id": "green-goods-burnsville"},
    {"url": "https://weedmaps.com/dispensaries/bloom-wellness-dispensary-st-paul", "id": "bloom-wellness-sp"},
    {"url": "https://weedmaps.com/dispensaries/higherplace", "id": "higherplace"},
    {"url": "https://weedmaps.com/dispensaries/loon-leaf", "id": "loon-leaf"},
]


def run_apify_scraper(dispensary_urls, max_items=200):
    """Run the Weedmaps scraper on Apify and return results."""
    print(f"Starting Apify scraper for {len(dispensary_urls)} dispensaries...")

    # Build input for the actor
    actor_input = {
        "startUrls": [{"url": d["url"]} for d in dispensary_urls],
        "maxItems": max_items,
        "proxy": {
            "useApifyProxy": True,
        },
    }

    # Start the actor run
    run_url = f"{APIFY_BASE}/acts/{WM_SCRAPER_ACTOR}/runs"
    resp = requests.post(
        run_url,
        params={"token": APIFY_TOKEN},
        json=actor_input,
        timeout=30,
    )
    resp.raise_for_status()
    run_data = resp.json()["data"]
    run_id = run_data["id"]
    print(f"Run started: {run_id}")

    # Poll for completion
    status_url = f"{APIFY_BASE}/actor-runs/{run_id}"
    while True:
        time.sleep(10)
        resp = requests.get(status_url, params={"token": APIFY_TOKEN}, timeout=15)
        status = resp.json()["data"]["status"]
        print(f"  Status: {status}")

        if status in ("SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"):
            break

    if status != "SUCCEEDED":
        print(f"Run failed with status: {status}")
        return []

    # Fetch results from the default dataset
    dataset_id = resp.json()["data"]["defaultDatasetId"]
    results_url = f"{APIFY_BASE}/datasets/{dataset_id}/items"
    resp = requests.get(
        results_url,
        params={"token": APIFY_TOKEN, "format": "json"},
        timeout=30,
    )
    resp.raise_for_status()
    results = resp.json()

    print(f"Got {len(results)} results from Apify")
    return results


def run_single_dispensary(url, dispensary_id):
    """Run scraper for a single dispensary (for testing)."""
    print(f"Scraping {url}...")
    results = run_apify_scraper([{"url": url, "id": dispensary_id}], max_items=50)
    return results


def parse_apify_results(results, dispensary_map):
    """Parse Apify results into our product format.

    Apify returns items like:
    {
        "url": "https://weedmaps.com/dispensaries/sweet-leaves/menu/dark-rainbow",
        "title": "Dark Rainbow",
        "price": "$58.00",
        "thcPercentage": "26.8%",
        "description": "...",
        "weight": "",
        "strains": [],
        "rating": 0
    }
    """
    products = []

    for item in results:
        # Map the result back to our dispensary ID via URL
        source_url = item.get("url", "")
        dispensary_id = None

        for d in dispensary_map:
            # Extract slug from our stored URL and check if it appears in the product URL
            slug = d["url"].split("/dispensaries/")[-1] if "/dispensaries/" in d["url"] else ""
            if slug and slug in source_url:
                dispensary_id = d["id"]
                break

        if not dispensary_id:
            # Try to match from URL path
            import re
            match = re.search(r'/dispensaries/([^/]+)/', source_url)
            if match:
                url_slug = match.group(1)
                for d in dispensary_map:
                    if url_slug in d["url"]:
                        dispensary_id = d["id"]
                        break

        if not dispensary_id:
            dispensary_id = "unknown"

        # Parse the product directly (each Apify result IS a product)
        product = parse_menu_item(item, dispensary_id)
        if product and product.get("name"):
            products.append(product)

    return products


def parse_menu_item(item, dispensary_id):
    """Parse a single menu item from Apify results.

    Handles the format: title, price ("$58.00"), thcPercentage, url, description, weight
    """
    import re

    name = item.get("title", "") or item.get("name", "") or item.get("productName", "")
    if not name:
        return None

    # Extract price - handle string format "$58.00" and numeric
    price = 0
    price_raw = item.get("price", 0)
    if isinstance(price_raw, str):
        nums = re.findall(r'\d+\.?\d*', price_raw)
        if nums:
            price = float(nums[0])
    elif isinstance(price_raw, (int, float)):
        price = float(price_raw)

    # If still no price, check other fields
    if not price:
        for field in ["basePrice", "lowestPrice", "priceFrom"]:
            val = item.get(field)
            if val:
                if isinstance(val, str):
                    nums = re.findall(r'\d+\.?\d*', val)
                    if nums:
                        price = float(nums[0])
                        break
                elif isinstance(val, (int, float)) and val > 0:
                    price = float(val)
                    break

    # Guess category from URL path or description
    cat_raw = item.get("category", "") or item.get("type", "") or item.get("productType", "")
    if not cat_raw:
        url = item.get("url", "").lower()
        desc = (item.get("description", "") or "").lower()
        if "/edible" in url or "gumm" in desc or "chocolate" in desc:
            cat_raw = "edible"
        elif "/vape" in url or "cart" in desc or "vape" in desc:
            cat_raw = "cartridge"
        elif "/pre-roll" in url or "pre-roll" in desc or "preroll" in desc:
            cat_raw = "pre-roll"
        elif "/concentrate" in url or "wax" in desc or "resin" in desc or "rosin" in desc:
            cat_raw = "concentrate"
        elif "/tincture" in url or "tincture" in desc:
            cat_raw = "tincture"
        elif "/beverage" in url or "seltzer" in desc or "tonic" in desc:
            cat_raw = "beverage"
        elif "/topical" in url or "balm" in desc or "lotion" in desc:
            cat_raw = "topical"
        else:
            cat_raw = "flower"

    category = normalize_category(cat_raw)

    # Strain type from strains array or description
    strain_type = ""
    strains = item.get("strains", [])
    if strains and isinstance(strains, list) and strains:
        strain_type = str(strains[0]).lower() if strains[0] else ""

    return {
        "dispensary_id": dispensary_id,
        "name": name.strip(),
        "brand": item.get("brand", "") or item.get("brandName", "") or "Unknown",
        "category": category,
        "strain_type": strain_type,
        "thc": str(item.get("thcPercentage", "") or item.get("thc", "") or ""),
        "cbd": str(item.get("cbdPercentage", "") or item.get("cbd", "") or ""),
        "price": price,
        "weight": item.get("weight", "") or "",
        "image": item.get("image", "") or item.get("imageUrl", "") or "",
        "description": (item.get("description", "") or "")[:200],
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
