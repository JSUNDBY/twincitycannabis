#!/usr/bin/env python3
"""
Twin City Cannabis — Treez ecommerce (GapCommerce headless) menu scraper

First store: Flame & Flora (Shakopee Mdewakanton Sioux Community, Prior
Lake). Their Next.js site talks straight to Treez's GapCommerce search
API — an Elasticsearch passthrough — with credentials shipped to every
visitor:

  POST https://search-<subdomain>.gapcommerceapi.com/product/search
  headers: x-api-key: <public key from the site's JS chunks>
           entity-id: <mso_store_entity_id>   ← both sit in the /menu
           org-id:    <mso_org_id>            ← page's RSC payload
  body:    a raw Elasticsearch query ({"query":{"match_all":{}}, ...})

To add another Treez shop: load its /menu page, grep the HTML for
mso_org_id / mso_store_entity_id, grep the JS chunks for "X-Api-Key",
and take the subdomain from the search-*.gapcommerceapi.com URL.

Output: scraper/data/treez_products.json
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
OUTPUT_FILE = DATA_DIR / "treez_products.json"

TREEZ_STORES = {
    "flame-flora": {
        "name": "Flame & Flora (Prior Lake)",
        "search_subdomain": "kyrok9udlk",
        "api_key": "V3jHL9dFzi3Gj4UISM4lr38Nm0GSxcps5OBz1PbS",
        "entity_id": "35a121bf-1c6a-4fe8-836f-3753000082bd",
        "org_id": "34ef7aac-a377-44d8-a2fb-35ecbbbc7da2",
        "origin": "https://flameandfloramn.com",
    },
}

# Treez category -> TCC category. MERCH/gear skipped.
CATEGORY_MAP = {
    "FLOWER": "flower",
    "PRE-ROLL": "pre-roll",
    "PREROLL": "pre-roll",
    "CARTRIDGE": "cartridge",
    "VAPE": "cartridge",
    "EXTRACT": "concentrate",
    "EDIBLE": "edible",
    "BEVERAGE": "beverage",
    "DRINK": "beverage",
    "TINCTURE": "tincture",
    "TOPICAL": "topical",
    "PILL": "tincture",
    # Their CBD shelf is real product (tinctures/topicals/gummies); the
    # name-based recategorizer downstream sorts each into its true category.
    "CBD": "tincture",
}


def _strain(classification):
    c = (classification or "").lower()
    return c if c in ("sativa", "indica", "hybrid") else ""


def _weight(src):
    amount = src.get("amount")
    uom = (src.get("unitOfMeasurement") or "").upper()
    if amount and uom.startswith("GRAM"):
        return f"{amount:g}g"
    size = str((src.get("customSize") or [None])[0] or src.get("productData", {}).get("size") or "")
    su = size.upper().replace(" ", "")
    if su.endswith("G") and not su.endswith("MG"):
        return su.lower()
    return ""


def _thc(src):
    # Lab results carry THC when the store publishes them; subtype
    # beverages/edibles often encode mg in the title instead.
    for lab in src.get("productData", {}).get("labResults") or []:
        label = (lab.get("labelKey") or lab.get("name") or "").upper()
        val = lab.get("value") or lab.get("labelValue")
        if "THC" in label and val:
            try:
                return f"{float(val):g}%"
            except (TypeError, ValueError):
                return str(val)
    return ""


def _brand(b):
    b = (b or "").strip()
    if not b:
        return "House"
    if b.isupper():  # shouting POS data -> Title Case, apostrophes intact
        b = " ".join(w.capitalize() for w in b.split())
        b = b.replace("'S", "'s")
    return b


def scrape_store(slug, cfg):
    url = f"https://search-{cfg['search_subdomain']}.gapcommerceapi.com/product/search"
    headers = {
        "content-type": "application/json",
        "x-api-key": cfg["api_key"],
        "entity-id": cfg["entity_id"],
        "org-id": cfg["org_id"],
        "origin": cfg["origin"],
        "referer": cfg["origin"] + "/",
    }
    products = []
    raw_items = []
    seen = 0
    frm = 0
    while frm < 3000:
        body = {"query": {"match_all": {}}, "size": 100, "from": frm}
        r = creq.post(url, json=body, headers=headers, impersonate="chrome", timeout=30)
        r.raise_for_status()
        hits = r.json().get("hits", {}).get("hits", [])
        raw_items.extend(hits)
        if not hits:
            break
        for h in hits:
            src = h.get("_source", {})
            seen += 1
            if src.get("isHideFromMenu") or src.get("status") != "ACTIVE":
                continue
            category = CATEGORY_MAP.get((src.get("category") or "").upper())
            if not category:
                continue  # MERCH, gear, unknown
            name = (src.get("menuTitle") or src.get("name") or "").strip()
            price = src.get("customMinPrice")
            if not name or not price or float(price) <= 0:
                continue
            images = src.get("productData", {}).get("images") or []
            products.append({
                "dispensary_id": slug,
                "name": name,
                "brand": _brand(src.get("brand")),
                "category": category,
                "menu_type": "rec",
                "thc": _thc(src),
                "cbd": "",
                "price": float(price),
                "weight": _weight(src),
                "image": images[0] if images else "",
                "strain_type": _strain(src.get("classification")),
                "source": "treez",
            })
        frm += 100
        time.sleep(0.5)
    print(f"  {cfg['name']}: {seen} listed -> {len(products)} cannabis products")
    raw_archive.record("treez", slug, raw_items)
    return products


def main():
    if creq is None:
        print("curl_cffi not installed — skipping Treez scrape")
        return
    print(f"Treez scraper: {len(TREEZ_STORES)} store(s)")
    all_products = []
    for slug, cfg in TREEZ_STORES.items():
        try:
            all_products.extend(scrape_store(slug, cfg))
        except Exception as e:
            print(f"  ERROR scraping {cfg['name']}: {e}")
            raw_archive.record("treez", slug, [], status="failed")

    print(f"Total Treez products: {len(all_products)}")
    if not all_products:
        # Never clobber the last good file with an empty scrape.
        print("No products scraped — leaving existing treez_products.json untouched")
        raise SystemExit(1)
    with open(OUTPUT_FILE, "w") as f:
        json.dump(all_products, f, indent=2)
    print(f"Saved to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
