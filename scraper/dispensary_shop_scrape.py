#!/usr/bin/env python3
"""
Twin City Cannabis — dispensary.shop platform scraper

Fetches menu data from any shop hosted on dispensary.shop, a multi-tenant
SaaS platform built on Remix. Each tenant publishes their menu at
https://<slug>.dispensary.shop/rec/menu, with all product data embedded
as JSON in window.__remixContext.

To onboard a new shop:
  1. Add a tuple to KNOWN_SHOPS below: (TCC_dispensary_id, hostname)
  2. Run: python3 scraper/dispensary_shop_scrape.py
  3. Run: python3 scraper/merge_dispensary_shop_data.py

Output: scraper/data/dispensary_shop_products.json
"""

import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path

import requests

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)
OUT_FILE = DATA_DIR / "dispensary_shop_products.json"

# Map TCC dispensary id -> dispensary.shop hostname.
# Add new shops here when they come online.
KNOWN_SHOPS = [
    ("fort-road-cannabis-llc", "fortroadcannabis.dispensary.shop"),
    ("twin-cities-cannabis-richfield", "twincitiescannabis.dispensary.shop"),
    ("aurora-cannabis-prior-lake", "priorlakedispo.dispensary.shop"),
    # Discovered 2026-08-28 by probing menu-less shops' websites:
    ("higher-place", "higherplace.dispensary.shop"),
    ("twin-cities-high-llc", "twincitieshigh.dispensary.shop"),
    ("flipside-dispensary-and-music", "flipsideflipside.dispensary.shop"),
    ("green-leaf-depot", "greenleafdepot.dispensary.shop"),
    ("green-apple-cannabis", "greenapplecannabis.dispensary.shop"),
    ("black-bear-weed-dispensary-winona", "blackbear.dispensary.shop"),
    ("coastless", "coastlesscannabis.dispensary.shop"),
]

# dispensary.shop categories that are never cannabis products and should
# be dropped at scrape time. Uses normalized lowercase comparison so
# variants like "PIPES", "Water Pipes", "papers & lighters" all match.
EXCLUDED_RAW_CATEGORY_TOKENS = (
    "pipe", "pipes",
    "seed", "seeds",
    "merch", "apparel", "clothing",
    "paper", "papers", "lighter", "lighters", "rolling paper",
    "accessor",  # accessories / accessory
    "grinder", "grinders",
    "battery", "batteries",
    "tray", "rolling tray",
)


def is_excluded_category(raw_category):
    """True when the raw category string matches an excluded token."""
    if not raw_category:
        return False
    norm = raw_category.lower()
    for token in EXCLUDED_RAW_CATEGORY_TOKENS:
        if token in norm:
            return True
    return False


PROXY_URL = os.environ.get("PROXY_URL", "")
PROXIES = {"http": PROXY_URL, "https": PROXY_URL} if PROXY_URL else None

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 TCCBot/1.0",
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
}


def extract_remix_context(html):
    """Brace-match the JS object after `window.__remixContext = ` out of the HTML."""
    i = html.find("window.__remixContext")
    if i < 0:
        return {}
    j = html.find("=", i) + 1
    while j < len(html) and html[j] in " \t":
        j += 1
    depth = 0
    in_str = False
    escape = False
    quote = None
    end = j
    for k in range(j, len(html)):
        c = html[k]
        if escape:
            escape = False
            continue
        if c == "\\" and in_str:
            escape = True
            continue
        if in_str:
            if c == quote:
                in_str = False
            continue
        if c in '"\'':
            in_str = True
            quote = c
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                end = k + 1
                break
    raw = html[j:end]
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"  JSON parse error: {e}", file=sys.stderr)
        return {}


def find_product_arrays(node):
    """Recursively yield every list-of-products found anywhere in the tree."""
    if isinstance(node, dict):
        for k, v in node.items():
            if (
                k == "products"
                and isinstance(v, list)
                and v
                and isinstance(v[0], dict)
                and "product_id" in v[0]
            ):
                yield v
            yield from find_product_arrays(v)
    elif isinstance(node, list):
        for item in node:
            yield from find_product_arrays(item)


def normalize_product(raw, dispensary_id):
    """Convert one dispensary.shop product to TCC merger schema."""
    # Drop non-cannabis categories at the door (pipes, seeds, merch, accessories,
    # grinders, etc.) — these are sold by some shops but don't belong on TCC.
    if is_excluded_category(raw.get("category", "")):
        return None

    # Prices on dispensary.shop are integer cents.
    pretax = raw.get("pre_tax_price")
    posttax = raw.get("post_tax_price")
    price_cents = pretax if pretax is not None else posttax
    if not isinstance(price_cents, (int, float)) or price_cents <= 0:
        return None
    price = round(price_cents / 100, 2)

    # Potencies: list of {name, value}. Find THC and CBD; keep unit (% vs mg).
    thc, cbd = "", ""
    for pot in raw.get("potencies") or []:
        n = (pot.get("name") or "").lower()
        v = pot.get("value")
        if v in (None, ""):
            continue
        unit = "mg" if "mg" in n else "%"
        if "thc" in n and "cbd" not in n and not thc:
            thc = f"{v}{unit}"
        elif "cbd" in n and "thc" not in n and not cbd:
            cbd = f"{v}{unit}"

    weight = ""
    wv = raw.get("weight_volume")
    uom = raw.get("weight_volume_uom")
    if wv and uom:
        weight = f"{wv} {uom}".strip()

    name = (raw.get("product_name") or raw.get("name") or "").strip()
    brand = (raw.get("brand") or "").strip()
    if not name:
        return None

    return {
        "dispensary_id": dispensary_id,
        "source_id": raw.get("product_id"),
        "name": name,
        "brand": brand or "House",
        "category": (raw.get("category") or "").strip(),
        "type": (raw.get("type") or "").strip(),
        "weight": weight,
        "thc": thc,
        "cbd": cbd,
        "image": raw.get("image_url") or "",
        "price": price,
        "description": (raw.get("description") or "").strip()[:500],
        "menu_type": "rec",
    }


def scrape_shop(dispensary_id, hostname):
    # 2026-08-28 rewrite: the platform moved to streamed Remix routes — the
    # /rec/menu page's initial context no longer holds products (they arrive
    # in deferred carousel chunks, capped at ~12 each). The full catalog now
    # lives on the paginated "all products" browse route, whose per-shop slug
    # is linked from the menu page nav: /rec/all-products/nb/<slug>?page=N
    # (20 products a page, `total` in the same loaderData group).
    menu_url = f"https://{hostname}/rec/menu"
    print(f"[{dispensary_id}] fetching {menu_url}")
    try:
        r = requests.get(menu_url, headers=HEADERS, proxies=PROXIES, timeout=30)
        r.raise_for_status()
    except Exception as e:
        print(f"  HTTP error: {e}")
        return []

    m = re.search(r'href="(/rec/all-products/nb/[a-z0-9]+)"', r.text)
    if m:
        browse_path = m.group(1)
    elif '/rec/search' in r.text:
        # Some shops (twin-cities-high) have no all-products nav button;
        # /rec/search with no query lists the full catalog, same loaderData.
        browse_path = "/rec/search"
    else:
        print("  could not find all-products browse link on menu page")
        return []

    seen = set()
    products = []
    page = 1
    total = None
    while True:
        url = f"https://{hostname}{browse_path}?page={page}"
        try:
            r = requests.get(url, headers=HEADERS, proxies=PROXIES, timeout=30)
            r.raise_for_status()
        except Exception as e:
            print(f"  HTTP error on page {page}: {e}")
            break

        ctx = extract_remix_context(r.text)
        if not ctx:
            print(f"  could not parse remix context on page {page}")
            break

        page_new = 0
        for arr in find_product_arrays(ctx):
            for p in arr:
                pid = p.get("product_id")
                if not pid or pid in seen:
                    continue
                seen.add(pid)
                normalized = normalize_product(p, dispensary_id)
                if normalized:
                    products.append(normalized)
                page_new += 1

        # total comes from the browse group that carries the products list
        if total is None:
            total = _find_browse_total(ctx)

        if page_new == 0 or (total and len(seen) >= total) or page >= 60:
            break
        page += 1
        time.sleep(0.5)  # gentle pacing

    print(f"  parsed {len(products)} unique products" + (f" of {total} listed" if total else ""))
    return products


def _find_browse_total(node):
    """Find the `total` on the browse group that holds the products array."""
    if isinstance(node, dict):
        if isinstance(node.get("products"), list) and isinstance(node.get("total"), int):
            return node["total"]
        for v in node.values():
            t = _find_browse_total(v)
            if t:
                return t
    elif isinstance(node, list):
        for v in node:
            t = _find_browse_total(v)
            if t:
                return t
    return None


def main():
    all_products = []
    for dispensary_id, hostname in KNOWN_SHOPS:
        all_products.extend(scrape_shop(dispensary_id, hostname))

    payload = {
        "scraped_at": datetime.utcnow().isoformat() + "Z",
        "shop_count": len(KNOWN_SHOPS),
        "product_count": len(all_products),
        "products": all_products,
    }
    OUT_FILE.write_text(json.dumps(payload, indent=2, ensure_ascii=False))
    print(f"\nWrote {len(all_products)} products to {OUT_FILE.relative_to(Path.cwd()) if OUT_FILE.is_relative_to(Path.cwd()) else OUT_FILE}")


if __name__ == "__main__":
    main()
