#!/usr/bin/env python3
"""
Twin City Cannabis — Carrot (getcarrot.io) menu scraper

Pulls product data from Carrot-powered dispensaries via their Typesense
search API. Completely unauthenticated — just needs the Typesense API key,
host, and space/location IDs (all embedded in the dispensary's public page).

Currently: Wildflower (Northeast + North Loop)

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
# Each entry: TCC dispensary slug -> Typesense config
# To add a new Carrot-powered dispensary:
#   1. Visit their store page, open DevTools Network tab
#   2. Look for POST to *.typesense.net/multi_search
#   3. Copy the x-typesense-api-key from the URL, host from the domain,
#      and collection name from the POST body
CARROT_STORES = {
    "wildflower-5": {
        "name": "Wildflower NE",
        "typesense_host": "ht8ucq7wreyb4z0dp.a1.typesense.net",
        "typesense_key": "UqPQlDfOUeHdcCIXumrknslXGdPuG5Zy",
        "collection": "carrot-nevada-prod-324-loc_1-products",
    },
    "wildflower-north-loop-1": {
        "name": "Wildflower North Loop",
        "typesense_host": "ht8ucq7wreyb4z0dp.a1.typesense.net",
        "typesense_key": "UqPQlDfOUeHdcCIXumrknslXGdPuG5Zy",
        "collection": "carrot-nevada-prod-324-loc_2-products",
    },
}

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


def scrape_store(slug, config):
    """Fetch all products from a Carrot store via Typesense."""
    url = f"https://{config['typesense_host']}/multi_search?x-typesense-api-key={config['typesense_key']}"

    all_products = []
    page = 1
    per_page = 200

    while True:
        body = {
            "searches": [{
                "collection": config["collection"],
                "q": "*",
                "query_by": "name",
                "per_page": per_page,
                "page": page,
            }]
        }

        resp = requests.post(url, json=body, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        data = resp.json()

        results = data.get("results", [{}])[0]
        hits = results.get("hits", [])
        found = results.get("found", 0)

        for h in hits:
            doc = h.get("document", {})
            name = doc.get("name", "").strip()
            if not name or JUNK_RE.search(name):
                continue

            master = doc.get("masterCategoryName", "")
            sub = doc.get("categoryName", "")
            category = category_map(master, sub)
            if not category:
                continue  # skip accessories/lifestyle

            price = doc.get("option1Price")
            if not price or float(price) <= 0:
                continue

            brand = doc.get("brand", "").strip() or "House"
            thc = ""
            cbd = ""
            # Carrot stores THC/CBD in labResultNames or thcPercentage
            thc_pct = doc.get("thcPercentage") or doc.get("thc")
            cbd_pct = doc.get("cbdPercentage") or doc.get("cbd")
            if thc_pct:
                thc = f"{thc_pct}%"
            if cbd_pct:
                cbd = f"{cbd_pct}%"

            # Weight from the name or weights field
            weight = ""
            weights = doc.get("weights", [])
            if weights:
                weight = weights[0]
            elif re.search(r'\d+g\b', name):
                weight = re.search(r'(\d+g)\b', name).group(1)

            image = doc.get("imageUrl", "") or ""

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
                "image": image,
                "source": "carrot",
            })

        if len(all_products) >= found or len(hits) < per_page:
            break
        page += 1

    print(f"  {config['name']}: {found} total -> {len(all_products)} cannabis products")
    return all_products


def main():
    print("Carrot scraper: Wildflower")
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
