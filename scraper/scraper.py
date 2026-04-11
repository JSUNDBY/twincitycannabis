#!/usr/bin/env python3
"""
Twin City Cannabis — Dispensary Scraper v3
Uses Weedmaps Discovery API for dispensary data + web scraping for menus.

The Weedmaps Discovery API is public and returns:
- Dispensary listings with addresses, ratings, hours, features
- Lat/lng coordinates for mapping
- Review counts and ratings

Menu data requires scraping the Weedmaps menu pages directly.

Usage:
  python3 scraper.py                    # scrape dispensary listings
  python3 scraper.py --menus            # also scrape menus (slower)
  python3 scraper.py --export           # export to site data.js format
  python3 scraper.py --update-site      # merge into live data.js
"""

import json
import os
import time
import re
from datetime import datetime
from pathlib import Path

import requests
from bs4 import BeautifulSoup

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)

PROXY_URL = os.environ.get("PROXY_URL", "")
PROXIES = {"http": PROXY_URL, "https": PROXY_URL} if PROXY_URL else None

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Accept": "application/json",
}

# Minneapolis center coordinates
MPLS_LAT = 44.9778
MPLS_LNG = -93.2650


# Manually included dispensaries outside the geo radius.
# Shared with direct_menu_scrape.py — keep both lists in sync.
MANUAL_INCLUDE_SLUGS = [
    "green-canopy-inc",  # Green Canopy Craft Dispensary, Lakeland Shores — owner requested 2026-04-10
]


def fetch_dispensaries(lat=MPLS_LAT, lng=MPLS_LNG, radius_pages=2):
    """Fetch dispensary listings from Weedmaps Discovery API + manual includes."""
    print("Fetching dispensary listings from Weedmaps...")
    all_listings = []
    seen_slugs = set()

    for page in range(1, radius_pages + 1):
        r = requests.get(
            "https://api-g.weedmaps.com/discovery/v2/listings",
            params={
                "filter[any_retailer_services][]": "storefront",
                "latlng": f"{lat},{lng}",
                "page_size": 50,
                "page": page,
            },
            headers=HEADERS,
            proxies=PROXIES,
            timeout=30,
        )
        r.raise_for_status()
        listings = r.json()["data"]["listings"]
        all_listings.extend(listings)
        for l in listings:
            seen_slugs.add(l.get("slug", ""))
        if len(listings) < 50:
            break
        time.sleep(1)

    # Fetch manually included dispensaries
    for slug in MANUAL_INCLUDE_SLUGS:
        if slug in seen_slugs:
            continue
        try:
            r = requests.get(
                f"https://api-g.weedmaps.com/discovery/v2/listings/{slug}",
                headers=HEADERS,
                proxies=PROXIES,
                timeout=15,
            )
            if r.status_code == 200:
                listing = r.json().get("data", {}).get("listing", {})
                if listing:
                    all_listings.append(listing)
                    print(f"  + Manual include: {listing.get('name', slug)} ({listing.get('city', '?')})")
        except Exception as e:
            print(f"  WARN: could not fetch manual include {slug}: {e}")

    print(f"Found {len(all_listings)} dispensaries")
    return all_listings


def parse_dispensary(listing):
    """Parse a Weedmaps listing into our format."""
    name = listing.get("name", "")
    slug = listing.get("slug", "")

    # Build features list
    features = []
    online = listing.get("online_ordering", {})
    if isinstance(online, dict):
        if online.get("enabled"):
            features.append("Online ordering")
        if online.get("pickup_enabled"):
            features.append("Curbside pickup")
        if online.get("delivery_enabled"):
            features.append("Delivery")
    if listing.get("has_curbside_pickup"):
        features.append("Curbside pickup")
    if listing.get("has_delivery"):
        features.append("Delivery")
    if listing.get("accepts_credit_cards"):
        features.append("Credit cards accepted")
    if listing.get("accepts_debit_cards"):
        features.append("Debit cards accepted")
    if listing.get("menu_items_count", 0) > 100:
        features.append("Large menu")
    features = list(set(features))  # dedupe

    # Rating to TCC score (scale 1-5 to 65-95)
    wm_rating = listing.get("rating", 0) or 0
    review_count = listing.get("reviews_count", 0) or 0
    if wm_rating > 0 and review_count >= 1:
        base_score = 55 + (wm_rating * 7)  # 5.0 = 90, 4.0 = 83, 3.0 = 76
        volume_bonus = min(review_count / 10, 5)  # up to +5 for review volume
        tcc_score = min(int(base_score + volume_bonus), 96)
    else:
        tcc_score = 70  # default for unrated/new

    # Generate gradient based on name hash
    gradients = [
        "linear-gradient(135deg, #065f46, #059669)",
        "linear-gradient(135deg, #7c2d12, #dc2626)",
        "linear-gradient(135deg, #1e3a5f, #3b82f6)",
        "linear-gradient(135deg, #581c87, #9333ea)",
        "linear-gradient(135deg, #0f766e, #14b8a6)",
        "linear-gradient(135deg, #92400e, #d97706)",
        "linear-gradient(135deg, #4338ca, #7c3aed)",
        "linear-gradient(135deg, #9f1239, #e11d48)",
        "linear-gradient(135deg, #166534, #22c55e)",
        "linear-gradient(135deg, #1e40af, #60a5fa)",
        "linear-gradient(135deg, #854d0e, #ca8a04)",
        "linear-gradient(135deg, #365314, #65a30d)",
    ]
    gradient = gradients[hash(name) % len(gradients)]

    # Initial from name
    words = name.split()
    initial = "".join(w[0] for w in words[:2]).upper() if len(words) >= 2 else name[:2].upper()

    return {
        "id": slug,
        "name": name,
        "tagline": listing.get("tagline", "") or f"Cannabis dispensary in {listing.get('city', '')}",
        "address": f"{listing.get('address', '')}, {listing.get('city', '')}, MN {listing.get('zip_code', '')}",
        "neighborhood": listing.get("city", ""),
        "city": listing.get("city", ""),
        "lat": listing.get("latitude", 0),
        "lng": listing.get("longitude", 0),
        "phone": listing.get("phone_number", ""),
        "hours": parse_hours(listing),
        "website": listing.get("website", "") or f"https://weedmaps.com/dispensaries/{slug}",
        "weedmaps_url": f"https://weedmaps.com/dispensaries/{slug}",
        "weedmaps_slug": slug,
        "weedmaps_id": listing.get("id"),
        "tier": "free",
        "tcc_score": tcc_score,
        "scores": {
            "pricing": max(70, tcc_score - 5 + (hash(name + "p") % 10)),
            "selection": max(70, tcc_score - 3 + (hash(name + "s") % 10)),
            "service": max(70, tcc_score - 2 + (hash(name + "v") % 10)),
            "lab_testing": max(70, tcc_score - 4 + (hash(name + "l") % 10)),
        },
        "review_count": review_count,
        "weedmaps_rating": wm_rating,
        "verified": review_count >= 5,
        "features": features,
        "gradient": gradient,
        "initial": initial,
        "img": listing.get("avatar_image", {}).get("small_url", "") if isinstance(listing.get("avatar_image"), dict) else "",
        "scraped_at": datetime.now().isoformat(),
    }


def parse_hours(listing):
    """Parse hours from Weedmaps listing."""
    todays = listing.get("todays_hours_str", "")
    open_now = listing.get("open_now", False)
    return {
        "weekday": todays if todays and todays != "Closed" else "Hours vary",
        "weekend": todays if todays and todays != "Closed" else "Hours vary",
        "note": todays if todays else "Check website for hours",
    }


def scrape_menu_page(slug):
    """Scrape product data from a Weedmaps menu page."""
    url = f"https://weedmaps.com/dispensaries/{slug}/menu"
    print(f"  Scraping menu: {slug}...")

    try:
        r = requests.get(url, headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Accept": "text/html",
        }, timeout=15)
        r.raise_for_status()

        soup = BeautifulSoup(r.text, "html.parser")

        # Try to find __NEXT_DATA__
        script = soup.find("script", id="__NEXT_DATA__")
        if script:
            data = json.loads(script.string)
            return parse_weedmaps_nextdata(data, slug)

        # Try JSON-LD structured data
        products = []
        for script_tag in soup.find_all("script", type="application/ld+json"):
            try:
                ld = json.loads(script_tag.string)
                if isinstance(ld, dict) and ld.get("@type") == "Product":
                    products.append({
                        "name": ld.get("name", ""),
                        "price": extract_price(ld),
                        "image": ld.get("image", ""),
                        "brand": ld.get("brand", {}).get("name", "") if isinstance(ld.get("brand"), dict) else "",
                    })
                elif isinstance(ld, list):
                    for item in ld:
                        if isinstance(item, dict) and item.get("@type") == "Product":
                            products.append({
                                "name": item.get("name", ""),
                                "price": extract_price(item),
                                "image": item.get("image", ""),
                                "brand": item.get("brand", {}).get("name", "") if isinstance(item.get("brand"), dict) else "",
                            })
            except (json.JSONDecodeError, TypeError):
                continue

        if products:
            print(f"  Found {len(products)} products via JSON-LD")
            return products

        print(f"  No structured data found (JS-rendered page)")
        return []

    except Exception as e:
        print(f"  Error: {e}")
        return []


def parse_weedmaps_nextdata(data, slug):
    """Parse Weedmaps __NEXT_DATA__ for menu items."""
    products = []
    try:
        props = data.get("props", {}).get("pageProps", {})
        # Navigate the nested structure
        for key in ["listing", "dispensary", "store"]:
            if key in props:
                menu = props[key].get("menu", props[key].get("menuItems", []))
                if isinstance(menu, list):
                    for item in menu:
                        products.append(parse_menu_item(item, slug))
                elif isinstance(menu, dict):
                    for cat, items in menu.items():
                        if isinstance(items, list):
                            for item in items:
                                products.append(parse_menu_item(item, slug))
    except (KeyError, TypeError) as e:
        print(f"  Parse error: {e}")

    products = [p for p in products if p.get("name")]
    print(f"  Found {len(products)} products via __NEXT_DATA__")
    return products


def parse_menu_item(item, slug):
    """Parse a single menu item."""
    return {
        "name": item.get("name", ""),
        "brand": item.get("brand", {}).get("name", "Unknown") if isinstance(item.get("brand"), dict) else item.get("brand", "Unknown"),
        "category": normalize_category(item.get("category", {}).get("name", "") if isinstance(item.get("category"), dict) else item.get("category", "")),
        "price": item.get("price", 0),
        "image": item.get("avatar_image", {}).get("small_url", "") if isinstance(item.get("avatar_image"), dict) else item.get("image", ""),
        "thc": str(item.get("thc_percentage", "")) if item.get("thc_percentage") else "",
        "dispensary_slug": slug,
    }


def extract_price(ld_item):
    """Extract price from JSON-LD Product."""
    offers = ld_item.get("offers", {})
    if isinstance(offers, dict):
        return offers.get("price", 0)
    elif isinstance(offers, list) and offers:
        return offers[0].get("price", 0)
    return 0


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
        "CONCENTRATE": "concentrate", "CONCENTRATES": "concentrate", "EXTRACT": "concentrate",
        "TOPICAL": "topical", "TOPICALS": "topical",
        "TINCTURE": "tincture", "TINCTURES": "tincture",
        "BEVERAGE": "beverage", "BEVERAGES": "beverage", "DRINK": "beverage", "DRINKS": "beverage",
    }
    return mapping.get(raw, raw.lower())


def save_data(dispensaries, filename="dispensaries.json"):
    """Save to JSON."""
    path = DATA_DIR / filename
    with open(path, "w") as f:
        json.dump(dispensaries, f, indent=2)
    print(f"Saved {len(dispensaries)} entries to {path}")
    return path


def export_dispensaries_js(dispensaries):
    """Export dispensaries in a format ready to paste into data.js."""
    path = DATA_DIR / "dispensaries_export.json"
    with open(path, "w") as f:
        json.dump(dispensaries, f, indent=2)
    print(f"\nExported {len(dispensaries)} dispensaries to {path}")
    print("Review and run update_site.py to merge into data.js")


def main():
    import argparse
    parser = argparse.ArgumentParser(description="TCC Scraper v3")
    parser.add_argument("--menus", action="store_true", help="Also scrape menus (slower)")
    parser.add_argument("--export", action="store_true", help="Export to site format")
    parser.add_argument("--update-site", action="store_true", help="Update data.js directly")
    args = parser.parse_args()

    print(f"\n{'='*60}")
    print(f"Twin City Cannabis — Scraper v3")
    print(f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}\n")

    # Fetch dispensary listings
    raw_listings = fetch_dispensaries()
    dispensaries = [parse_dispensary(l) for l in raw_listings]

    # Save raw data
    save_data(dispensaries)

    # Optionally scrape menus
    if args.menus:
        print("\nScraping menus...")
        all_menu_items = []
        for d in dispensaries:
            items = scrape_menu_page(d["weedmaps_slug"])
            for item in items:
                item["dispensary_id"] = d["id"]
            all_menu_items.extend(items)
            time.sleep(2)  # be polite
        save_data(all_menu_items, "menu_items.json")

    # Print summary
    print(f"\n{'='*60}")
    print(f"DISPENSARIES: {len(dispensaries)}")
    print(f"{'='*60}")
    for d in sorted(dispensaries, key=lambda x: -x["tcc_score"]):
        score = d["tcc_score"]
        reviews = d["review_count"]
        print(f"  TCC {score:3d} | {d['name']:45s} | {d['city']:15s} | {reviews:3d} reviews")

    if args.export or args.update_site:
        export_dispensaries_js(dispensaries)

    if args.update_site:
        print("\nTo update data.js, run: python3 scraper/update_site.py")


if __name__ == "__main__":
    main()
