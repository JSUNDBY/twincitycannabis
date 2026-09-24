#!/usr/bin/env python3
"""
Twin City Cannabis — Blaze/Tymber ecommerce menu scraper

Covers shops on Tymber storefronts (Blaze-owned ecomm): MN THC Co
(Dundas + Lakeville) and The Winona Dispensary. Their Next.js stores
call Blaze's ecom API directly; the only credential is the SITE ID that
every page ships in its __NEXT_DATA__:

  GET https://ecom-api.blaze.me/api/v1/products?category=<slug>&limit=20&offset=N
  header: X-Store: <site uuid>   ← regex `"site":{"id":"<uuid>"` on any
                                   page of the shop.<domain> storefront

GOTCHA: the magic param is `delivery_type=pickup` — without it the API
returns only a partial shelf. Query params are PLAIN (`limit`, `offset`,
`category`); the JSON:API `filter[...]`/`page[...]` brackets are
silently ignored. `category=` works on some stores and returns 0 on
others (slug->id translation is store-specific), so we take the full
pickup listing and map category from each product's own store_url
segment, leaving unknowns to the merge's name-based categorizer.
Prices are CENTS (unit_price.amount).

Output: scraper/data/blaze_products.json
"""

import json
import time
from pathlib import Path

import raw_archive

try:
    from curl_cffi import requests as creq
except ImportError:
    creq = None

DATA_DIR = Path(__file__).parent / "data"
OUTPUT_FILE = DATA_DIR / "blaze_products.json"

BLAZE_STORES = {
    "mn-thc-co-1": {"name": "MN THC Co (Dundas)", "site_id": "1aadcb43-d036-45a8-ba0c-408640d69795", "origin": "https://shop.mnthc.co"},
    "mn-thc-co-2": {"name": "MN THC Co (Lakeville)", "site_id": "e2868766-459d-4019-9264-8baa2a9888b9", "origin": "https://shop.mnthc.co"},
    "winona-dispensary": {"name": "The Winona Dispensary", "site_id": "f28c7fe9-6271-4853-b5a8-498667c3348d", "origin": "https://shop.thewinonadispensary.com"},
}

# store_url category segment -> TCC category (None = skip)
CATEGORY_MAP = {
    "flower": "flower",
    "pre-rolls": "pre-roll",
    "prerolls": "pre-roll",
    "pre-roll": "pre-roll",
    "vaporizers": "cartridge",
    "cartridges": "cartridge",
    "vape": "cartridge",
    "vape-pens": "cartridge",
    "low-dose-edibles": "edible",
    "extracts": "concentrate",
    "concentrates": "concentrate",
    "edibles": "edible",
    "drinks": "beverage",
    "beverages": "beverage",
    "tinctures": "tincture",
    "topicals": "topical",
    "capsules": "tincture",
    "accessories": None,
    "apparel": None,
    "merch": None,
    "gear": None,
}


def _category(store_url):
    # .../menu/products/<brand-slug>/<category>/<product-slug>
    try:
        parts = store_url.split("/menu/products/", 1)[1].split("/")
        return parts[1].lower() if len(parts) >= 3 else ""
    except (IndexError, AttributeError):
        return ""


def _thc(a):
    v = a.get("thc") or a.get("max_thc")
    if isinstance(v, dict):  # {"units": "%", "amount": "17.6"}
        units = v.get("units") or "%"
        amt = v.get("amount")
        try:
            return f"{float(amt):g}{units}" if amt else ""
        except (TypeError, ValueError):
            return ""
    if not v:
        return ""
    try:
        v = float(v)
    except (TypeError, ValueError):
        return str(v)
    # Percent for flower/carts, mg for edibles; over 100 can only be mg.
    return f"{v:g}mg" if v > 100 else f"{v:g}%"


def _weight(a):
    cw = a.get("cannabis_weight") or {}
    size = a.get("size") or {}
    for blk in (cw, size):
        amt = blk.get("amount")
        units = (blk.get("units") or "").lower()
        if amt and units.startswith("g"):
            return f"{amt:g}g"
    return ""


def scrape_store(slug, cfg):
    headers = {"X-Store": cfg["site_id"], "origin": cfg["origin"], "referer": cfg["origin"] + "/"}
    products = []
    raw_items = []
    seen = 0
    offset = 0
    total = None
    while total is None or offset < min(total, 2000):
        r = creq.get(
            f"https://ecom-api.blaze.me/api/v1/products?limit=20&offset={offset}&delivery_type=pickup",
            impersonate="chrome", timeout=30, headers=headers)
        r.raise_for_status()
        d = r.json()
        total = d.get("meta", {}).get("total_count") or 0
        rows = d.get("data") or []
        raw_items.extend(rows)
        if not rows:
            break
        for p in rows:
            a = p.get("attributes", {})
            seen += 1
            if a.get("is_deleted") or a.get("hide_from_menu") or not a.get("is_active") or not a.get("in_stock"):
                continue
            seg = _category(a.get("store_url") or "")
            if seg in CATEGORY_MAP:
                category = CATEGORY_MAP[seg]
                if category is None:
                    continue  # explicit accessories/merch segment
            else:
                # No usable segment: pass through empty and let the merge's
                # name-based categorizer keep or drop it.
                category = ""
            name = (a.get("name") or "").strip()
            price = (a.get("unit_price") or {}).get("amount")
            if not name or not price:
                continue
            price = float(price) / 100.0  # cents
            brand = name.split("-", 1)[0].strip().title() if "-" in name[:30] else "House"
            strain = (a.get("flower_type") or a.get("strain") or "").lower()
            if strain not in ("sativa", "indica", "hybrid"):
                strain = ""
            products.append({
                "dispensary_id": slug,
                "name": name,
                "brand": brand,
                "category": category,
                "menu_type": "rec",
                "thc": _thc(a),
                "cbd": "",
                "price": price,
                "weight": _weight(a),
                "image": a.get("main_image") or "",
                "strain_type": strain,
                "source": "blaze",
            })
        offset += len(rows)
        time.sleep(0.3)
    print(f"  {cfg['name']}: {seen} listed -> {len(products)} cannabis products")
    raw_archive.record("blaze", slug, raw_items, expected=total)
    return products


def main():
    if creq is None:
        print("curl_cffi not installed — skipping Blaze scrape")
        return
    print(f"Blaze/Tymber scraper: {len(BLAZE_STORES)} stores")
    all_products = []
    for slug, cfg in BLAZE_STORES.items():
        try:
            all_products.extend(scrape_store(slug, cfg))
        except Exception as e:
            print(f"  ERROR scraping {cfg['name']}: {e}")
            raw_archive.record("blaze", slug, [], status="failed")
        time.sleep(1)
    print(f"Total Blaze products: {len(all_products)}")
    if not all_products:
        print("No products scraped — leaving existing blaze_products.json untouched")
        raise SystemExit(1)
    with open(OUTPUT_FILE, "w") as f:
        json.dump(all_products, f, indent=2)
    print(f"Saved to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
