#!/usr/bin/env python3
"""
Twin City Cannabis — Dispensary Menu Scraper
Scrapes product data from dispensary websites and aggregates pricing.

Data sources:
  - Dutchie-powered menus (many MN dispensaries use Dutchie)
  - Weedmaps API (public menu data)
  - Leafly API (public menu data)
  - Direct dispensary website scraping (fallback)

Output: JSON files that feed the static site's data layer.

Usage:
  python3 scraper.py                    # scrape all sources
  python3 scraper.py --source dutchie   # scrape dutchie only
  python3 scraper.py --dispensary green-goods  # scrape one dispensary
  python3 scraper.py --export           # export to site data.js

Requirements:
  pip install requests beautifulsoup4 selenium
"""

import json
import os
import time
import re
from datetime import datetime
from pathlib import Path

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("Install dependencies: pip install requests beautifulsoup4")
    print("For JS-rendered sites: pip install selenium")
    exit(1)


# ---- CONFIG ----
DATA_DIR = Path(__file__).parent / "data"
EXPORT_DIR = Path(__file__).parent.parent / "js"
DATA_DIR.mkdir(exist_ok=True)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

# Dispensary menu sources
DISPENSARY_SOURCES = {
    "sweetleaves-north-loop": {
        "name": "Sweetleaves",
        "dutchie_slug": "sweet-leaves-a-cannabis-company",
        "weedmaps_slug": "sweet-leaves",
        "leafly_slug": "sweet-leaves-7be38",
    },
    "green-goods-mpls": {
        "name": "Green Goods Minneapolis",
        "weedmaps_slug": "minnesota-medical-solutions",
        "leafly_slug": "green-goods-minneapolis",
    },
    "legacy-cannabis-mpls": {
        "name": "Legacy Cannabis Minneapolis",
        "weedmaps_slug": "legacy-cannabis-1",
        "leafly_slug": "legacy-cannabis-minneapolis",
    },
    "budtales-mpls": {
        "name": "Budtales Dispensary",
        "weedmaps_slug": None,
        "leafly_slug": None,
        "website": "https://budtales.shop",
    },
    "zaza-st-paul": {
        "name": "Zaza Cannabis St. Paul",
        "weedmaps_slug": None,
        "leafly_slug": None,
        "website": "https://zazacannabismn.com",
    },
    "nativecare-wsp": {
        "name": "NativeCare Cannabis",
        "weedmaps_slug": None,
        "leafly_slug": None,
        "website": "https://nativecare.com",
    },
    "edina-canna": {
        "name": "Edina Canna",
        "weedmaps_slug": None,
        "leafly_slug": None,
        "website": "https://edinacanna.com",
    },
}


class DutchieScraper:
    """Scrape menus from Dutchie-powered dispensaries."""

    BASE_URL = "https://dutchie.com/dispensary"

    def scrape(self, slug):
        """Scrape a Dutchie dispensary menu."""
        url = f"{self.BASE_URL}/{slug}"
        print(f"  [Dutchie] Scraping {slug}...")

        try:
            resp = requests.get(url, headers=HEADERS, timeout=15)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, "html.parser")

            # Dutchie embeds product data in Next.js __NEXT_DATA__
            script = soup.find("script", id="__NEXT_DATA__")
            if script:
                data = json.loads(script.string)
                return self._parse_nextdata(data, slug)

            print(f"  [Dutchie] No __NEXT_DATA__ found for {slug}")
            return []
        except Exception as e:
            print(f"  [Dutchie] Error scraping {slug}: {e}")
            return []

    def _parse_nextdata(self, data, slug):
        """Parse Dutchie's Next.js data payload."""
        products = []
        try:
            props = data.get("props", {}).get("pageProps", {})
            menu = props.get("menu", {}).get("products", [])

            for item in menu:
                product = {
                    "source": "dutchie",
                    "dispensary_slug": slug,
                    "name": item.get("name", ""),
                    "brand": item.get("brand", {}).get("name", "Unknown"),
                    "category": self._normalize_category(item.get("type", "")),
                    "strain_type": item.get("strainType", "").lower(),
                    "thc": item.get("potencyThc", {}).get("formatted", ""),
                    "cbd": item.get("potencyCbd", {}).get("formatted", ""),
                    "price": self._get_price(item),
                    "weight": item.get("option", ""),
                    "image": item.get("image", ""),
                    "description": item.get("description", ""),
                    "scraped_at": datetime.now().isoformat(),
                }
                if product["name"] and product["price"]:
                    products.append(product)

        except (KeyError, TypeError) as e:
            print(f"  [Dutchie] Parse error: {e}")

        print(f"  [Dutchie] Found {len(products)} products from {slug}")
        return products

    def _get_price(self, item):
        """Extract the lowest price from a Dutchie product."""
        variants = item.get("variants", [])
        if variants:
            prices = [v.get("price", 0) for v in variants if v.get("price")]
            return min(prices) if prices else 0
        return item.get("price", 0)

    def _normalize_category(self, cat_type):
        """Normalize Dutchie category names."""
        mapping = {
            "FLOWER": "flower",
            "PRE_ROLL": "pre-roll",
            "VAPORIZER": "cartridge",
            "EDIBLE": "edible",
            "CONCENTRATE": "concentrate",
            "TOPICAL": "topical",
            "TINCTURE": "tincture",
            "BEVERAGE": "beverage",
        }
        return mapping.get(cat_type.upper(), cat_type.lower())


class WeedmapsScraper:
    """Scrape menus from Weedmaps."""

    BASE_URL = "https://weedmaps.com/dispensaries"

    def scrape(self, slug):
        """Scrape a Weedmaps dispensary menu."""
        url = f"{self.BASE_URL}/{slug}/menu"
        print(f"  [Weedmaps] Scraping {slug}...")

        try:
            resp = requests.get(url, headers=HEADERS, timeout=15)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, "html.parser")

            # Weedmaps uses __NEXT_DATA__ as well
            script = soup.find("script", id="__NEXT_DATA__")
            if script:
                data = json.loads(script.string)
                return self._parse_menu(data, slug)

            # Fallback: look for JSON-LD
            scripts = soup.find_all("script", type="application/ld+json")
            for s in scripts:
                try:
                    ld = json.loads(s.string)
                    if ld.get("@type") == "Store":
                        print(f"  [Weedmaps] Found store data for {slug}")
                except json.JSONDecodeError:
                    continue

            return []
        except Exception as e:
            print(f"  [Weedmaps] Error scraping {slug}: {e}")
            return []

    def _parse_menu(self, data, slug):
        """Parse Weedmaps menu data."""
        products = []
        try:
            props = data.get("props", {}).get("pageProps", {})
            listings = props.get("listings", [])

            for item in listings:
                product = {
                    "source": "weedmaps",
                    "dispensary_slug": slug,
                    "name": item.get("name", ""),
                    "brand": item.get("brand", {}).get("name", "Unknown"),
                    "category": item.get("category", {}).get("name", "").lower(),
                    "price": item.get("price", 0),
                    "image": item.get("avatar_image", {}).get("small_url", ""),
                    "scraped_at": datetime.now().isoformat(),
                }
                if product["name"]:
                    products.append(product)

        except (KeyError, TypeError) as e:
            print(f"  [Weedmaps] Parse error: {e}")

        print(f"  [Weedmaps] Found {len(products)} products from {slug}")
        return products


class LeaflyScraper:
    """Scrape menus from Leafly."""

    BASE_URL = "https://www.leafly.com/dispensary-info"

    def scrape(self, slug):
        """Scrape a Leafly dispensary menu."""
        url = f"{self.BASE_URL}/{slug}"
        print(f"  [Leafly] Scraping {slug}...")

        try:
            resp = requests.get(url, headers=HEADERS, timeout=15)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, "html.parser")

            # Leafly also uses Next.js
            script = soup.find("script", id="__NEXT_DATA__")
            if script:
                data = json.loads(script.string)
                return self._parse_menu(data, slug)

            return []
        except Exception as e:
            print(f"  [Leafly] Error scraping {slug}: {e}")
            return []

    def _parse_menu(self, data, slug):
        """Parse Leafly menu data."""
        products = []
        try:
            props = data.get("props", {}).get("pageProps", {})
            menu_items = props.get("dispensary", {}).get("menuItems", [])

            for item in menu_items:
                product = {
                    "source": "leafly",
                    "dispensary_slug": slug,
                    "name": item.get("name", ""),
                    "brand": item.get("brand", "Unknown"),
                    "category": item.get("category", "").lower(),
                    "strain_type": item.get("subcategory", "").lower(),
                    "thc": item.get("thc", ""),
                    "cbd": item.get("cbd", ""),
                    "price": item.get("price", 0),
                    "image": item.get("imageUrl", ""),
                    "scraped_at": datetime.now().isoformat(),
                }
                if product["name"]:
                    products.append(product)

        except (KeyError, TypeError) as e:
            print(f"  [Leafly] Parse error: {e}")

        print(f"  [Leafly] Found {len(products)} products from {slug}")
        return products


class TwinCityScraper:
    """Main scraper orchestrator."""

    def __init__(self):
        self.dutchie = DutchieScraper()
        self.weedmaps = WeedmapsScraper()
        self.leafly = LeaflyScraper()
        self.all_products = []

    def scrape_all(self):
        """Scrape all dispensary sources."""
        print(f"\n{'='*60}")
        print(f"Twin City Cannabis — Scraper")
        print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"{'='*60}\n")

        for disp_id, config in DISPENSARY_SOURCES.items():
            print(f"\n--- {config['name']} ---")

            # Try Dutchie first
            if config.get("dutchie_slug"):
                products = self.dutchie.scrape(config["dutchie_slug"])
                for p in products:
                    p["dispensary_id"] = disp_id
                self.all_products.extend(products)

            # Try Weedmaps
            if config.get("weedmaps_slug"):
                products = self.weedmaps.scrape(config["weedmaps_slug"])
                for p in products:
                    p["dispensary_id"] = disp_id
                self.all_products.extend(products)

            # Try Leafly
            if config.get("leafly_slug"):
                products = self.leafly.scrape(config["leafly_slug"])
                for p in products:
                    p["dispensary_id"] = disp_id
                self.all_products.extend(products)

            # Rate limit
            time.sleep(2)

        self._save_raw()
        self._deduplicate()
        self._save_clean()
        self._print_summary()

    def _save_raw(self):
        """Save raw scraped data."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M")
        filepath = DATA_DIR / f"raw_{timestamp}.json"
        with open(filepath, "w") as f:
            json.dump(self.all_products, f, indent=2)
        print(f"\nRaw data saved: {filepath}")

    def _deduplicate(self):
        """Deduplicate products across sources."""
        seen = {}
        for p in self.all_products:
            key = f"{p['dispensary_id']}:{p['name'].lower()}"
            if key not in seen:
                seen[key] = p
            else:
                # Prefer source with image
                if p.get("image") and not seen[key].get("image"):
                    seen[key] = p
        self.all_products = list(seen.values())

    def _save_clean(self):
        """Save cleaned, deduplicated data."""
        filepath = DATA_DIR / "products.json"
        with open(filepath, "w") as f:
            json.dump(self.all_products, f, indent=2)
        print(f"Clean data saved: {filepath} ({len(self.all_products)} products)")

    def _print_summary(self):
        """Print scraping summary."""
        print(f"\n{'='*60}")
        print(f"SCRAPING COMPLETE")
        print(f"{'='*60}")
        print(f"Total products: {len(self.all_products)}")

        # By dispensary
        by_disp = {}
        for p in self.all_products:
            did = p.get("dispensary_id", "unknown")
            by_disp[did] = by_disp.get(did, 0) + 1

        print(f"\nBy dispensary:")
        for did, count in sorted(by_disp.items(), key=lambda x: -x[1]):
            name = DISPENSARY_SOURCES.get(did, {}).get("name", did)
            print(f"  {name}: {count} products")

        # By category
        by_cat = {}
        for p in self.all_products:
            cat = p.get("category", "unknown")
            by_cat[cat] = by_cat.get(cat, 0) + 1

        print(f"\nBy category:")
        for cat, count in sorted(by_cat.items(), key=lambda x: -x[1]):
            print(f"  {cat}: {count}")

    def export_to_site(self):
        """Export scraped data to the site's data.js format."""
        filepath = DATA_DIR / "products.json"
        if not filepath.exists():
            print("No scraped data found. Run scraper first.")
            return

        with open(filepath) as f:
            products = json.load(f)

        print(f"\nExporting {len(products)} products to site format...")
        print(f"(Manual review recommended before replacing data.js)")

        # Group by product name to build price comparison
        grouped = {}
        for p in products:
            name = p["name"]
            if name not in grouped:
                grouped[name] = {
                    "name": name,
                    "brand": p.get("brand", "Unknown"),
                    "category": p.get("category", ""),
                    "thc": p.get("thc", ""),
                    "cbd": p.get("cbd", ""),
                    "image": p.get("image", ""),
                    "prices": {},
                }
            grouped[name]["prices"][p["dispensary_id"]] = p.get("price", 0)
            # Keep best image
            if p.get("image") and not grouped[name]["image"]:
                grouped[name]["image"] = p["image"]

        export = list(grouped.values())
        export_path = DATA_DIR / "export_for_site.json"
        with open(export_path, "w") as f:
            json.dump(export, f, indent=2)

        print(f"Exported to: {export_path}")
        print(f"Products with multi-dispensary pricing: {sum(1 for p in export if len(p['prices']) > 1)}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Twin City Cannabis Scraper")
    parser.add_argument("--source", choices=["dutchie", "weedmaps", "leafly"], help="Scrape a specific source")
    parser.add_argument("--dispensary", help="Scrape a specific dispensary by ID")
    parser.add_argument("--export", action="store_true", help="Export scraped data to site format")
    args = parser.parse_args()

    scraper = TwinCityScraper()

    if args.export:
        scraper.export_to_site()
    else:
        scraper.scrape_all()
        print("\nRun with --export to generate site data.")
