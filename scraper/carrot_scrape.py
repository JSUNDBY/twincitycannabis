#!/usr/bin/env python3
"""
Twin City Cannabis — Carrot (getcarrot.io) menu scraper

Pulls product data from Carrot-powered dispensaries via Carrot's own REST
API (api.<region>.getcarrot.io). Completely unauthenticated — the only
requirement is the store's numeric space id, sent as a `carrot-space-id`
header. This replaced the original Typesense approach (2026-08-28): the
Typesense keys rotted silently, and the REST API needs no key at all.

To add a new Carrot-powered dispensary:
  1. Visit their store page, open DevTools Network tab
  2. Look for requests to api.<region>.getcarrot.io/api/v1/store/...
  3. Copy the `carrot-space-id` request header value and the locId query
     param into CARROT_STORES below.

Currently: Wildflower (Northeast + North Loop), Verist Fields (50th & Bryant)

Output: scraper/data/carrot_products.json
"""

import json
import re
from datetime import datetime
from pathlib import Path

import requests

DATA_DIR = Path(__file__).parent / "data"
OUTPUT_FILE = DATA_DIR / "carrot_products.json"

# ─── STORE CONFIG ─────────────────────────────────────────────────────────
# Each entry: TCC dispensary slug -> Carrot REST config.
#   space_id / loc_id: from the store page's network requests (see above).
#   region: subdomain of api.<region>.getcarrot.io (both MN stores: nevada).
#   default_brand: used when Carrot's brand field is empty. Verist's store
#     sells only their own line, so everything rolls up to the brand page.
CARROT_STORES = {
    "wildflower-5": {
        "name": "Wildflower NE",
        "region": "nevada",
        "space_id": "324",
        "loc_id": "1",
    },
    "wildflower-north-loop-1": {
        "name": "Wildflower North Loop",
        "region": "nevada",
        "space_id": "324",
        "loc_id": "2",
    },
    "verist-fields": {
        "name": "Verist Fields (50th & Bryant)",
        "region": "nevada",
        "space_id": "354",
        "loc_id": "1",
        "default_brand": "Verist Fields",
    },
    # Newer Carrot stores authenticate with a space KEY (carrot-space-key)
    # instead of a numeric id — capture it from the store page's fetch
    # headers the same way.
    "green-rose": {
        "name": "Green Rose (Minneapolis)",
        "region": "nevada",
        "space_key": "sp_5EANTFpEXJ7vAqo170dr2z",
        "loc_id": "1",
    },
    # 2026-09-03 sweep: 10 more MN Carrot shops found by probing menu-less
    # dispensaries' websites. Numeric ids from each shop page's config.
    "lake-leaf-dispensary":    {"name": "Lake Leaf (Onamia)",   "region": "nevada", "space_id": "282", "loc_id": "1"},
    "lake-leaf-cultivation-1": {"name": "Lake Leaf (Hinckley)", "region": "nevada", "space_id": "282", "loc_id": "2"},
    "lake-leaf-dispensary-1":  {"name": "Lake Leaf (Isle)",     "region": "nevada", "space_id": "282", "loc_id": "3"},
    "the-cannabis-co":         {"name": "The Cannabis Co (St. Michael)", "region": "nevada", "space_id": "351", "loc_id": "1"},
    "northern-crown-cannabis": {"name": "Northern Crown (Isanti)", "region": "nevada", "space_id": "353", "loc_id": "1"},
    "high-fidelity":           {"name": "High Fidelity (Luverne)", "region": "nevada", "space_id": "330", "loc_id": "1"},
    "cannajoymn":              {"name": "CannaJoy (Minneapolis)", "region": "nevada", "space_id": "359", "loc_id": "1"},
    "healing-harvest":         {"name": "Healing Harvest (St. Peter)", "region": "nevada", "space_key": "sp_1uYYKWb45De5tMplWTnhFR", "loc_id": "1"},
}

# Category slugs that are never cannabis products.
SKIP_CATEGORY_SLUGS = {"accessory", "accessories", "merch", "apparel", "lifestyle"}

HEADERS = {
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (compatible; TCC/1.0)",
}

# Junk filter
JUNK_RE = re.compile(
    r'\b(battery|lighter|grinder|rolling paper|raw cone|ashtray|tray|'
    r'pipe|bong|rig|scale|stash|bag|jar|container|clipper|boveda|'
    r'blazy susan|bic |filter tip|doob tube|joint holder|rolling tray|'
    r'tightvac|smell proof|dugout|one hitter|chillum|papers)\b',
    re.IGNORECASE
)


def category_map(master, sub):
    """Map Carrot category names to TCC categories."""
    m = (master or "").lower()
    s = (sub or "").lower()

    if "flower" in m:
        return "flower"
    if "pre-roll" in m or "pre-roll" in s:
        return "pre-roll"
    if "cart" in m or "vape" in m or "disposable" in s:
        return "cartridge"
    if "edible" in m or "gumm" in s or "chocolate" in s or "mint" in s:
        return "edible"
    if "beverage" in m or "seltzer" in s or "soda" in s or "shot" in s:
        return "beverage"
    if "tincture" in m:
        return "tincture"
    if "topical" in m or "balm" in s or "salve" in s:
        return "topical"
    if "concentrate" in m or "rosin" in s or "resin" in s or "wax" in s:
        return "concentrate"
    return None  # skip unknown (lifestyle, accessories)


def _api_get(config, path):
    url = f"https://api.{config['region']}.getcarrot.io/api/v1{path}"
    headers = dict(HEADERS)
    if config.get("space_key"):
        headers["carrot-space-key"] = config["space_key"]
    else:
        headers["carrot-space-id"] = config["space_id"]
    resp = requests.get(url, headers=headers, timeout=15)
    resp.raise_for_status()
    return resp.json()


def scrape_store(slug, config):
    """Fetch all products from a Carrot store via its REST API."""
    loc = config["loc_id"]
    categories = _api_get(config, f"/store/category?locId={loc}&platform=web")
    if isinstance(categories, dict):
        categories = categories.get("categories", [])

    all_products = []
    seen = 0

    for cat in categories:
        cat_slug = (cat.get("slug") or "").strip()
        if not cat_slug or cat_slug in SKIP_CATEGORY_SLUGS:
            continue

        items = _api_get(config, f"/store/category/slug/{cat_slug}/product?locId={loc}&platform=web")
        if not isinstance(items, list):
            continue
        seen += len(items)

        for doc in items:
            name = (doc.get("name") or "").strip()
            # Carrot prefixes some product-line tags like "-IX | " — noise.
            name = re.sub(r'^-\w{1,4}\s*\|\s*', '', name)
            if not name or JUNK_RE.search(name):
                continue

            master = doc.get("masterCategoryName", "")
            sub = doc.get("subcategoryName", "") or doc.get("categoryName", "")
            category = category_map(master, sub)
            if not category:
                continue  # skip accessories/lifestyle

            price = doc.get("option1Price")
            if not price or float(price) <= 0:
                continue

            brand = (doc.get("brand") or "").strip() or config.get("default_brand", "House")
            thc = ""
            cbd = ""
            thc_pct = doc.get("thcPercentage") or doc.get("thc")
            cbd_pct = doc.get("cbdPercentage") or doc.get("cbd")
            if thc_pct:
                thc = f"{thc_pct}%"
            if cbd_pct:
                cbd = f"{cbd_pct}%"

            # Weight: prefer the first cash option (qty + unit), then
            # unitWeight, then the name.
            weight = ""
            opts = doc.get("cashOptions") or []
            if opts:
                unit = (opts[0].get("optionUnit") or "").lower()
                qty = opts[0].get("qty")
                if qty and unit.startswith("gram"):
                    weight = f"{qty:g}g"
            if not weight and doc.get("unitWeight"):
                weight = f"{doc['unitWeight']:g}g"
            if not weight and re.search(r'([\d.]+)\s*g\b', name):
                weight = re.search(r'([\d.]+)\s*g\b', name).group(1) + "g"

            all_products.append({
                "dispensary_id": slug,
                "name": name,
                "brand": brand,
                "category": category,
                "menu_type": "rec",
                "thc": thc,
                "cbd": cbd,
                "price": float(price),
                "weight": weight,
                "image": "",
                "source": "carrot",
            })

    print(f"  {config['name']}: {seen} listed -> {len(all_products)} cannabis products")
    return all_products


def main():
    print("Carrot scraper: Wildflower + Verist Fields + Green Rose")
    all_products = []

    for slug, config in CARROT_STORES.items():
        try:
            products = scrape_store(slug, config)
            all_products.extend(products)
        except Exception as e:
            print(f"  ERROR scraping {config['name']}: {e}")

    print(f"\nTotal Carrot products: {len(all_products)}")

    # Summary
    by_store = {}
    for p in all_products:
        by_store[p["dispensary_id"]] = by_store.get(p["dispensary_id"], 0) + 1
    for slug, count in by_store.items():
        name = CARROT_STORES.get(slug, {}).get("name", slug)
        print(f"  {name}: {count}")

    with open(OUTPUT_FILE, "w") as f:
        json.dump(all_products, f, indent=2)
    print(f"Saved to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
