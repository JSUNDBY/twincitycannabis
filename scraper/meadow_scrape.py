#!/usr/bin/env python3
"""
Twin City Cannabis — Meadow platform scraper

Fetches menu data from any shop running on Meadow (the platform behind
embed.getmeadow.com). Each shop has a Meadow organization ID; the public
products endpoint is on daffodil.getmeadow.com.

Reverse-engineered from the embed iframe's bundled JS:
  GET https://daffodil.getmeadow.com/organizations/{orgId}/products?source=web-embed
  Accept: application/vnd.meadow+json; version=2

To onboard a new Meadow shop:
  1. Find their organization ID — visit their menu page, view source,
     look for `data-organization-id="<id>"` in the embed.js script tag.
  2. Add a tuple to KNOWN_SHOPS below: (TCC_dispensary_id, meadow_org_id).
  3. Run: python3 scraper/meadow_scrape.py
  4. Run: python3 scraper/merge_meadow_data.py

Output: scraper/data/meadow_products.json
"""

import json
import os
import sys
from datetime import datetime
from pathlib import Path

import requests

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)
OUT_FILE = DATA_DIR / "meadow_products.json"

API_BASE = "https://daffodil.getmeadow.com"

# Map TCC dispensary id -> Meadow organization id.
# Add new shops here when onboarding.
KNOWN_SHOPS = [
    ("lake-daze", "2206"),
]

# Categories whose cannabisType is "none" but which we still want — currently
# only Topicals, since they're often cannabis-derived. Anything else with
# cannabisType=none gets dropped (Accessories, Glass Art, Merch, CBD Products).
ALLOWED_NONE_CATS = {"Topicals"}

# Map Meadow's category names to TCC categories. Normalize.py is the
# authoritative classifier downstream — this is just a starting hint.
CATEGORY_HINT = {
    "Flowers": "flower",
    "Pre-Rolls": "pre-roll",
    "Edibles": "edible",
    "Concentrates": "concentrate",
    "Topicals": "topical",
    "Vape Pens": "cartridge",
    "Tinctures": "tincture",
    "Beverages": "beverage",
}

PROXY_URL = os.environ.get("PROXY_URL", "")
PROXIES = {"http": PROXY_URL, "https": PROXY_URL} if PROXY_URL else None

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 TCCBot/1.0",
    "Accept": "application/vnd.meadow+json; version=2",
}


def fetch_products(org_id):
    url = f"{API_BASE}/organizations/{org_id}/products"
    params = {"source": "web-embed"}
    r = requests.get(url, headers=HEADERS, params=params, proxies=PROXIES, timeout=30)
    r.raise_for_status()
    return r.json()


def cheapest_option(options):
    """Pick the lowest-price in-stock option. Falls back to first option if
    none have price > 0. Prices are integer cents on Meadow."""
    if not options:
        return None
    valid = [o for o in options if isinstance(o.get("price"), (int, float)) and o["price"] > 0]
    if not valid:
        return None
    valid.sort(key=lambda o: o.get("salesPrice") if isinstance(o.get("salesPrice"), (int, float)) and o["salesPrice"] > 0 else o["price"])
    return valid[0]


def normalize_product(raw, dispensary_id):
    cat = raw.get("primaryCategory") or {}
    cat_name = cat.get("name") or ""
    cannabis_type = cat.get("cannabisType") or "none"

    # Drop accessories, glass art, merch, CBD-only items
    if cannabis_type == "none" and cat_name not in ALLOWED_NONE_CATS:
        return None
    if not raw.get("isActive", True) or raw.get("archivedAt"):
        return None
    if not raw.get("inStock", True):
        return None

    opt = cheapest_option(raw.get("options") or [])
    if not opt:
        return None
    price_cents = opt.get("salesPrice") if isinstance(opt.get("salesPrice"), (int, float)) and opt["salesPrice"] > 0 else opt["price"]
    price = round(price_cents / 100, 2)

    name = (raw.get("name") or "").strip()
    if not name:
        return None
    brand = (raw.get("brand") or {}).get("name", "").strip() or "House"

    weight = ""
    amount = opt.get("amount")
    if amount:
        # Meadow's `unit` is shop-wide ("item", "gram"); option's `content` is
        # the variant size. Use category to decide units.
        if cannabis_type == "non-concentrated":  # flower / pre-roll
            weight = f"{amount} g"
        elif cannabis_type == "concentrated":
            weight = f"{amount} g"
        else:
            weight = f"{amount}"

    # THC: prefer percent if present, else mg-per-piece, else range
    thc = ""
    if raw.get("percentThc"):
        thc = f"{raw['percentThc']}%"
    elif raw.get("thcAmountEach"):
        thc = f"{raw['thcAmountEach']}{raw.get('thcUnit') or 'mg'}"
    elif raw.get("thcAmount"):
        thc = f"{raw['thcAmount']}{raw.get('thcUnit') or 'mg'}"

    cbd = ""
    if raw.get("percentCbd"):
        cbd = f"{raw['percentCbd']}%"
    elif raw.get("cbdAmountEach"):
        cbd = f"{raw['cbdAmountEach']}{raw.get('cbdUnit') or 'mg'}"
    elif raw.get("cbdAmount"):
        cbd = f"{raw['cbdAmount']}{raw.get('cbdUnit') or 'mg'}"

    photos = raw.get("photos") or []
    image = ""
    if photos and isinstance(photos[0], dict):
        image = photos[0].get("fullPath") or (
            f"https://p.mdwimg.com/{photos[0].get('path', '')}" if photos[0].get("path") else ""
        )

    return {
        "dispensary_id": dispensary_id,
        "source_id": str(raw.get("id") or ""),
        "name": name,
        "brand": brand,
        "category": CATEGORY_HINT.get(cat_name, cat_name.lower()),
        "raw_category": cat_name,
        "weight": weight,
        "thc": thc,
        "cbd": cbd,
        "image": image,
        "price": price,
        "description": (raw.get("description") or "").strip()[:500],
        "menu_type": "rec",
    }


def scrape_shop(dispensary_id, org_id):
    print(f"[{dispensary_id}] fetching meadow org {org_id}")
    try:
        payload = fetch_products(org_id)
    except Exception as e:
        print(f"  HTTP error: {e}")
        return []
    raw_products = payload.get("data", {}).get("products") or []
    print(f"  raw: {len(raw_products)} products")
    out = []
    for raw in raw_products:
        n = normalize_product(raw, dispensary_id)
        if n:
            out.append(n)
    print(f"  kept (cannabis only): {len(out)}")
    return out


def main():
    all_products = []
    for dispensary_id, org_id in KNOWN_SHOPS:
        all_products.extend(scrape_shop(dispensary_id, org_id))
    payload = {
        "scraped_at": datetime.utcnow().isoformat() + "Z",
        "shop_count": len(KNOWN_SHOPS),
        "product_count": len(all_products),
        "products": all_products,
    }
    OUT_FILE.write_text(json.dumps(payload, indent=2, ensure_ascii=False))
    print(f"\nWrote {len(all_products)} products to {OUT_FILE}")


if __name__ == "__main__":
    main()
