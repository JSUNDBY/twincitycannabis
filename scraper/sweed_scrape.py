#!/usr/bin/env python3
"""
Twin City Cannabis — Sweed POS (sweedpos.com) menu scraper

Pulls product data from dispensaries whose online shop runs on Sweed
(white-label storefront on the shop's own subdomain). Completely
unauthenticated — the storefront's own JSON API answers plain POSTs as
long as a `storeId` HEADER is set (body-only storeId gets a 400).

To add a new Sweed-powered dispensary:
  1. Open their shop, DevTools → Network, look for POSTs to /_api/Products/...
  2. The storeId is in the page's embedded state ("storeId": NNN) or any
     API request body. Add {slug: {base, store_id}} to SWEED_STORES below.

Currently: Legit Cannabis (Rosemount / "South Metro")

Output: scraper/data/sweed_products.json
"""

import json
import re
from pathlib import Path

import requests

DATA_DIR = Path(__file__).parent / "data"
OUTPUT_FILE = DATA_DIR / "sweed_products.json"

SWEED_STORES = {
    "legit-cannabis": {
        "name": "Legit Cannabis (Rosemount)",
        "base": "https://shop.mnlegitcannabis.com",
        "store_id": 434,
    },
}

HEADERS = {
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (compatible; TCC/1.0)",
}

SKIP_CATEGORIES = {"accessories", "accessory", "merch", "apparel", "gear"}


def category_map(canonical):
    """Map Sweed category canonicalNames to TCC categories."""
    c = (canonical or "").lower()
    if c in SKIP_CATEGORIES:
        return None
    if "flower" in c:
        return "flower"
    if "pre-roll" in c or "preroll" in c:
        return "pre-roll"
    if "vape" in c or "cart" in c or "disposable" in c:
        return "cartridge"
    if "edible" in c or "gumm" in c:
        return "edible"
    if "beverage" in c or "drink" in c or "seltzer" in c:
        return "beverage"
    if "concentrate" in c or "extract" in c:
        return "concentrate"
    if "tincture" in c or "capsule" in c:
        return "tincture"
    if "topical" in c:
        return "topical"
    return None


def strain_type(product):
    """sativa/indica/hybrid from Sweed's strain prevalence, else ''."""
    prev = (((product.get("strain") or {}).get("prevalence") or {}).get("canonicalName") or "")
    if "sativa" in prev:
        return "sativa"
    if "indica" in prev:
        return "indica"
    if "hybrid" in prev:
        return "hybrid"
    return ""


def scrape_store(slug, config):
    url = f"{config['base']}/_api/Products/GetProductList"
    all_products = []
    page = 1
    total = None

    while True:
        body = {
            "filters": {},
            "page": page,
            "pageSize": 100,
            "sortingMethodId": 7,
            "searchTerm": "",
            "platformOs": "web",
        }
        # storeId goes in a HEADER — the API 400s when it is only in the body.
        headers = dict(HEADERS)
        headers["storeId"] = str(config["store_id"])
        resp = requests.post(url, json=body, headers=headers, timeout=20)
        resp.raise_for_status()
        data = resp.json()
        items = data.get("list") or []
        total = data.get("total") or len(items)

        for p in items:
            cat_canonical = ((p.get("category") or {}).get("canonicalName") or "")
            category = category_map(cat_canonical)
            if not category:
                continue

            base_name = (p.get("name") or "").strip()
            if not base_name:
                continue
            brand = ((p.get("brand") or {}).get("name") or "").strip() or "House"
            stype = strain_type(p)

            for v in p.get("variants") or []:
                price = v.get("promoPrice") or v.get("price")
                if not price or float(price) <= 0:
                    continue

                vname = (v.get("name") or "").strip()
                # Weight from unitSize (e.g. 3.5 G), falling back to the
                # variant name ("3.5g", "1g").
                weight = ""
                unit = v.get("unitSize") or {}
                if unit.get("value") and (unit.get("unitAbbr") or "").upper() == "G":
                    weight = f"{unit['value']:g}g"
                elif re.match(r"^[\d.]+\s*g$", vname, re.IGNORECASE):
                    weight = vname.lower().replace(" ", "")

                thc = ""
                labs = v.get("labTests") or {}
                thc_vals = ((labs.get("thc") or {}).get("value")) or []
                if thc_vals:
                    thc = f"{thc_vals[0]}%"
                cbd = ""
                cbd_vals = ((labs.get("cbd") or {}).get("value")) or []
                if cbd_vals:
                    cbd = f"{cbd_vals[0]}%"

                # One entry per variant, weight in the name when it isn't
                # already there (keeps multi-size products distinct).
                name = base_name
                if weight and weight not in name.lower().replace(" ", ""):
                    name = f"{base_name} | {vname or weight}"

                images = v.get("images") or p.get("images") or []

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
                    "image": images[0] if images else "",
                    "strain_type": stype,
                    "source": "sweed",
                })

        if page * 100 >= (total or 0) or not items:
            break
        page += 1

    print(f"  {config['name']}: {total} listed -> {len(all_products)} cannabis variants")
    return all_products


def main():
    print("Sweed scraper: Legit Cannabis")
    all_products = []
    for slug, config in SWEED_STORES.items():
        try:
            all_products.extend(scrape_store(slug, config))
        except Exception as e:
            print(f"  ERROR scraping {config['name']}: {e}")

    print(f"\nTotal Sweed products: {len(all_products)}")
    with open(OUTPUT_FILE, "w") as f:
        json.dump(all_products, f, indent=2)
    print(f"Saved to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
