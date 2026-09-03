#!/usr/bin/env python3
"""
Twin City Cannabis — Dutchie menu scraper

Pulls product data from dispensaries whose menus run on dutchie.com
(embedded menus on their own sites). Dutchie's Cloudflare blocks plain
HTTP clients, but curl_cffi's Chrome TLS impersonation passes clean —
no headless browser needed. The menu API is GraphQL persisted queries,
replayed exactly as the embedded menu itself calls them.

Two gotchas encoded here:
  - The `content-type: application/json` header is REQUIRED even on GET,
    or the API rejects the call as CSRF.
  - The persisted-query sha256 hashes are pinned below. If Dutchie ships
    a new client and the hash dies (PersistedQueryNotFound), re-capture:
    open any embedded menu in a browser, look at the graphql requests'
    `extensions` query param.

To add a store: its dispensary id is the 24-hex id in the shop site's
embed script (dutchie.com/api/v2/embedded-menu/<id>.js) — that id IS the
dispensaryId. Or resolve a cName via the ConsumerDispensaries operation.

Output: scraper/data/dutchie_products.json
"""

import json
import time
import urllib.parse
from pathlib import Path

try:
    from curl_cffi import requests as creq
except ImportError:
    creq = None

DATA_DIR = Path(__file__).parent / "data"
OUTPUT_FILE = DATA_DIR / "dutchie_products.json"

GRAPHQL = "https://dutchie.com/api-0/graphql"
FILTERED_PRODUCTS_HASH = "3307e40a53bfb0b59896e267e3a46c2e99da18d3b376567d23267b6483bc3a76"

# TCC dispensary slug -> Dutchie store. Ids discovered 2026-08-28 from each
# shop's own embed script.
DUTCHIE_STORES = {
    "hempire-llc": {"name": "Hempire (Rochester)", "dispensary_id": "692f755700d109756e810f18"},
    "off-the-path-cannabis-dispensary": {"name": "Off The Path (Morton)", "dispensary_id": "66746460f2ed81e01f6ae537"},
    "high-10-dispensary": {"name": "High 10 (Ramsey)", "dispensary_id": "68506ef4bbdf58635e2da0b2"},
    "la-canna": {"name": "La Canna (La Crescent)", "dispensary_id": "682200e27868fa4697640d70"},
    "island-pezi": {"name": "Island Pezi (Welch)", "dispensary_id": "662ff99fec8d2a42e1ecdaef"},
    "the-lakes-dispensary": {"name": "The Lakes (White Bear Lake)", "dispensary_id": "68506d0cc48702cfd4d1a1d0"},
    "the-flower-shop-mn-llc": {"name": "The Flower Shop (Luverne)", "dispensary_id": "69447b2b59020a2ed20af5d5"},
    "altitude-dispensary": {"name": "Altitude (Monticello)", "dispensary_id": "6920f9c3971c1924b1085bb4"},
    "bloom-wellness-dispensary-st-paul": {"name": "Bloom Wellness (St. Paul)", "dispensary_id": "689e3bce5fdd58a4d2320cf5"},
}

SKIP_TYPES = {"accessories", "apparel", "merch", "gear", "n/a"}


def category_map(dtype, subcat):
    t = (dtype or "").lower()
    s = (subcat or "").lower()
    if t in SKIP_TYPES:
        return None
    if "flower" in t:
        return "flower"
    if "pre-roll" in t or "preroll" in t or "pre-roll" in s:
        return "pre-roll"
    if "vapor" in t or "vape" in t or "cartridge" in s or "disposable" in s:
        return "cartridge"
    if "edible" in t:
        return "edible"
    if "drink" in t or "beverage" in t or "drinks" in s:
        return "beverage"
    if "concentrate" in t:
        return "concentrate"
    if "tincture" in t or "oral" in t:
        return "tincture"
    if "topical" in t:
        return "topical"
    if "cbd" in t:
        return "tincture"
    return None


def potency_str(content):
    """'28.8%' or '50mg' from a THCContent/CBDContent block."""
    if not content or not content.get("range"):
        return ""
    val = content["range"][0]
    if val is None:
        return ""
    unit = (content.get("unit") or "").upper()
    if unit.startswith("PERCENT"):
        return f"{val}%"
    if unit.startswith("MILLIGRAM"):
        return f"{val}mg"
    return f"{val}"


def fetch_page(dispensary_id, page, per_page=100):
    variables = {
        "includeEnterpriseSpecials": False,
        "productsFilter": {
            "dispensaryId": dispensary_id,
            "pricingType": "rec",
            "strainTypes": [],
            "subcategories": [],
            "Status": "Active",
            "types": [],
            "useCache": True,
            "isDefaultSort": True,
            "sortBy": "popularSortIdx",
            "sortDirection": 1,
            "bypassOnlineThresholds": False,
            "ignoreQuantityThresholds": False,
            "isKioskMenu": False,
            "removeProductsBelowOptionThresholds": True,
            "platformType": "ONLINE_MENU",
            "preOrderType": None,
        },
        "page": page,
        "perPage": per_page,
    }
    ext = {"persistedQuery": {"version": 1, "sha256Hash": FILTERED_PRODUCTS_HASH}}
    url = (GRAPHQL + "?operationName=FilteredProducts"
           + "&variables=" + urllib.parse.quote(json.dumps(variables))
           + "&extensions=" + urllib.parse.quote(json.dumps(ext)))
    r = creq.get(url, impersonate="chrome", timeout=30,
                 headers={"content-type": "application/json"})
    r.raise_for_status()
    data = r.json()
    if "errors" in data and not data.get("data"):
        raise RuntimeError(json.dumps(data["errors"])[:200])
    return data["data"]["filteredProducts"]


def scrape_store(slug, config):
    all_products = []
    page = 0
    total_pages = 1
    listed = 0

    while page < total_pages and page < 30:
        result = fetch_page(config["dispensary_id"], page)
        qi = result.get("queryInfo") or {}
        total_pages = qi.get("totalPages") or 1
        listed = qi.get("totalCount") or 0

        for p in result.get("products") or []:
            name = (p.get("Name") or "").strip()
            if not name:
                continue
            category = category_map(p.get("type"), p.get("subcategory"))
            if not category:
                continue
            brand = (p.get("brandName") or "").strip() or "House"
            stype = (p.get("strainType") or "").lower()
            if stype not in ("sativa", "indica", "hybrid"):
                stype = ""
            thc = potency_str(p.get("THCContent"))
            cbd = potency_str(p.get("CBDContent"))
            image = p.get("Image") or ""

            options = p.get("Options") or [None]
            prices = p.get("recPrices") or p.get("Prices") or []
            for i, opt in enumerate(options):
                price = prices[i] if i < len(prices) else None
                if not price or float(price) <= 0:
                    continue
                weight = ""
                if opt and opt.lower().endswith("g") and any(ch.isdigit() for ch in opt):
                    weight = opt.lower().replace(" ", "")
                pname = name
                if opt and len(options) > 1:
                    pname = f"{name} | {opt}"
                elif weight and weight not in name.lower().replace(" ", ""):
                    pname = f"{name} | {opt}"
                all_products.append({
                    "dispensary_id": slug,
                    "name": pname,
                    "brand": brand,
                    "category": category,
                    "menu_type": "rec",
                    "thc": thc,
                    "cbd": cbd,
                    "price": float(price),
                    "weight": weight,
                    "image": image,
                    "strain_type": stype,
                    "source": "dutchie",
                })

        page += 1
        time.sleep(1.5)  # pace: stay friendly with Cloudflare

    print(f"  {config['name']}: {listed} listed -> {len(all_products)} cannabis variants")
    return all_products


def main():
    if creq is None:
        print("curl_cffi not installed — skipping Dutchie scrape")
        return
    print(f"Dutchie scraper: {len(DUTCHIE_STORES)} stores")
    all_products = []
    for slug, config in DUTCHIE_STORES.items():
        try:
            all_products.extend(scrape_store(slug, config))
        except Exception as e:
            print(f"  ERROR scraping {config['name']}: {e}")
        time.sleep(2)

    print(f"\nTotal Dutchie products: {len(all_products)}")
    with open(OUTPUT_FILE, "w") as f:
        json.dump(all_products, f, indent=2)
    print(f"Saved to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
