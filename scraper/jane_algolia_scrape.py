#!/usr/bin/env python3
"""
Twin City Cannabis — Jane (iHeartJane) menu scraper via Jane's public Algolia

Replaces the headless-Chromium jane_scrape.js (2026-08-28): every Jane-powered
menu (Green Goods AND RISE) is queryable directly through Jane's own search
backend with the public credentials their menu app ships to every visitor.
No browser, runs anywhere the Pi runs.

  POST https://search.iheartjane.com/1/indexes/menu-products-production/query
  headers: X-Algolia-Application-Id: VFM4X0N23A
           X-Algolia-API-Key: <public search key, see JANE_ALGOLIA_KEY>
  body:    {"query":"","filters":"store_id:<id>","hitsPerPage":100,"page":N}

Store ids come from the stores-production index (search a chain's name) or
from a menu page's network calls. Each location has SEPARATE rec ("AU") and
med store ids. Products carry percent_thc/cbd, category (sativa/indica/
hybrid), per-weight price_* fields, and photos.

If the public key ever rotates: fetch https://www.iheartjane.com/stores/<any id>
and read "algoliaApiKey" from the tiny HTML shell.

Output: scraper/data/jane_products.json  (same schema the old scraper wrote,
so merge_jane_data.py is unchanged)
"""

import json
import time
from pathlib import Path

try:
    from curl_cffi import requests as creq
    _IMPERSONATE = {"impersonate": "chrome"}
except ImportError:  # pragma: no cover — curl_cffi is on the Pi already
    import requests as creq
    _IMPERSONATE = {}

DATA_DIR = Path(__file__).parent / "data"
OUTPUT_FILE = DATA_DIR / "jane_products.json"

ALGOLIA_URL = "https://search.iheartjane.com/1/indexes/menu-products-production/query"
JANE_ALGOLIA_APP = "VFM4X0N23A"
JANE_ALGOLIA_KEY = "edc5435c65d771cecbd98bbd488aa8d3"

# TCC dispensary slug -> Jane store ids. rec = adult-use menu, med = medical.
JANE_STORES = {
    # Green Goods (Vireo)
    "minnesota-medical-solutions":            {"name": "Green Goods - Minneapolis", "rec": 6499, "med": 3813},
    "green-goods-woodbury":                   {"name": "Green Goods - Woodbury", "rec": 6493, "med": 3784},
    "minnesota-medical-solutions-bloomington": {"name": "Green Goods - Bloomington", "rec": 6498, "med": 3812},
    "green-goods-blaine":                     {"name": "Green Goods - Blaine", "rec": 6496, "med": 3787},
    "green-goods-burnsville":                 {"name": "Green Goods - Burnsville", "rec": 6495, "med": 3786},
    "minnesota-medical-solutions-rochester":  {"name": "Green Goods - Rochester", "rec": 6497, "med": 3811},
    "green-goods-duluth":                     {"name": "Green Goods - Duluth/Hermantown", "rec": 6494, "med": 3785},
    "minnesota-medical-solutions-moorhead":   {"name": "Green Goods - Moorhead", "rec": 6500, "med": 3814},
    # RISE (Green Thumb Industries)
    "leafline-labs-st-paul":  {"name": "RISE - St. Paul", "rec": 6456, "med": 4634},
    "leafline-labs-st-cloud": {"name": "RISE - St. Cloud", "rec": 6458, "med": 4633},
    "leafline-labs-eagan":    {"name": "RISE - Eagan", "rec": 6455, "med": 4635},
    "rise-brooklyn-park":     {"name": "RISE - Brooklyn Park", "rec": 6459},
    "rise-new-hope":          {"name": "RISE - New Hope", "rec": 6460, "med": 5268},
    "rise-mankato":           {"name": "RISE - Mankato", "rec": 6454, "med": 4631},
    "rise-baxter":            {"name": "RISE - Baxter", "rec": 6466, "med": 5205},
    "rise-willmar":           {"name": "RISE - Willmar", "rec": 6457, "med": 4632},
}

HEADERS = {
    "X-Algolia-Application-Id": JANE_ALGOLIA_APP,
    "X-Algolia-API-Key": JANE_ALGOLIA_KEY,
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (compatible; TCC/1.0)",
}

KIND_MAP = {
    "flower": "flower",
    "pre-roll": "pre-roll",
    "preroll": "pre-roll",
    "vape": "cartridge",
    "extract": "concentrate",
    "edible": "edible",
    "drink": "beverage",
    "beverage": "beverage",
    "tincture": "tincture",
    "topical": "topical",
    "gear": None,
    "merch": None,
    "grow": None,
    "accessory": None,
}

# (jane price field, weight label) — one product entry per priced weight.
WEIGHT_PRICES = [
    ("price_half_gram", "0.5g"),
    ("price_gram", "1g"),
    ("price_two_gram", "2g"),
    ("price_eighth_ounce", "3.5g"),
    ("price_quarter_ounce", "7g"),
    ("price_half_ounce", "14g"),
    ("price_ounce", "28g"),
]


def strain_type(p):
    c = (p.get("category") or "").lower()
    for t in ("sativa", "indica", "hybrid"):
        if t in c:
            return t
    return ""


def photo_url(p):
    photos = p.get("photos") or []
    if photos and isinstance(photos[0], dict):
        urls = photos[0].get("urls") or {}
        return urls.get("small") or urls.get("original") or ""
    return ""


def fetch_store(store_id):
    hits = []
    page = 0
    while page < 40:
        body = {"query": "", "filters": f"store_id:{store_id}",
                "hitsPerPage": 100, "page": page}
        r = creq.post(ALGOLIA_URL, json=body, headers=HEADERS, timeout=20, **_IMPERSONATE)
        r.raise_for_status()
        d = r.json()
        hits.extend(d.get("hits") or [])
        if page >= (d.get("nbPages") or 1) - 1:
            break
        page += 1
        time.sleep(0.3)
    return hits


def normalize(p, slug, menu_type):
    kind = (p.get("kind") or "").lower()
    category = KIND_MAP.get(kind)
    if category is None and kind in KIND_MAP:
        return []  # gear/merch/etc — deliberately skipped
    if category is None:
        return []  # unknown kind — skip rather than guess
    name = (p.get("name") or "").strip()
    if not name:
        return []
    brand = (p.get("brand") or "").strip() or "House"
    stype = strain_type(p)
    thc = f"{p['percent_thc']}%" if p.get("percent_thc") else ""
    cbd = f"{p['percent_cbd']}%" if p.get("percent_cbd") else ""
    image = photo_url(p)

    entries = []
    for field, weight in WEIGHT_PRICES:
        price = p.get(field)
        if price and float(price) > 0:
            entries.append((f"{name} | {weight}" if len(
                [1 for f, _ in WEIGHT_PRICES if p.get(f)]) > 1 else name, weight, float(price)))
    if not entries:
        price = p.get("bucket_price") or p.get("sort_price")
        if price and float(price) > 0:
            entries.append((name, "", float(price)))

    return [{
        "dispensary_id": slug,
        "name": ename,
        "brand": brand,
        "category": category,
        "menu_type": menu_type,
        "thc": thc,
        "cbd": cbd,
        "price": eprice,
        "weight": eweight,
        "image": image,
        "strain_type": stype,
        "source": "jane",
    } for ename, eweight, eprice in entries]


def main():
    print(f"Jane/Algolia scraper: {len(JANE_STORES)} locations")
    all_products = []
    for slug, cfg in JANE_STORES.items():
        for menu_type in ("rec", "med"):
            store_id = cfg.get(menu_type)
            if not store_id:
                continue
            try:
                hits = fetch_store(store_id)
            except Exception as e:
                print(f"  ERROR {cfg['name']} [{menu_type}]: {e}")
                continue
            n0 = len(all_products)
            for p in hits:
                all_products.extend(normalize(p, slug, menu_type))
            print(f"  {cfg['name']} [{menu_type}]: {len(hits)} listed -> {len(all_products) - n0} entries")
            time.sleep(0.4)

    print(f"\nTotal Jane products: {len(all_products)}")
    if not all_products:
        # Never clobber the last good catalog with an empty one — the merge
        # would skip, but the repo copy is the Pi's fallback data.
        print("Zero products scraped — leaving existing jane_products.json untouched")
        raise SystemExit(1)
    with open(OUTPUT_FILE, "w") as f:
        json.dump(all_products, f, indent=2)
    print(f"Saved to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
