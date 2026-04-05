#!/usr/bin/env python3
"""
Merges scraped product data into the site's js/data.js file.
Updates prices for existing products and adds new ones.

Run after scraper.py --export to apply fresh data to the live site.
"""

import json
import re
from pathlib import Path
from datetime import datetime

EXPORT_FILE = Path(__file__).parent / "data" / "export_for_site.json"
DATA_JS = Path(__file__).parent.parent / "js" / "data.js"
PRICE_LOG = Path(__file__).parent / "data" / "price_history.json"


def load_export():
    """Load the scraper's exported product data."""
    if not EXPORT_FILE.exists():
        print(f"No export file found at {EXPORT_FILE}")
        print("Run: python scraper.py && python scraper.py --export")
        return None
    with open(EXPORT_FILE) as f:
        return json.load(f)


def load_price_history():
    """Load running price history (8-week rolling window)."""
    if PRICE_LOG.exists():
        with open(PRICE_LOG) as f:
            return json.load(f)
    return {}


def save_price_history(history):
    """Save price history."""
    with open(PRICE_LOG, "w") as f:
        json.dump(history, f, indent=2)


def update_price_history(history, product_name, lowest_price):
    """Append today's lowest price, keep 8 most recent."""
    key = product_name.lower().strip()
    if key not in history:
        history[key] = []
    history[key].append(lowest_price)
    # Keep last 8 data points
    history[key] = history[key][-8:]
    return history[key]


def build_product_js(products, price_history):
    """Build a JS array string for products."""
    lines = []
    for i, p in enumerate(products):
        pid = f"p{i+1:03d}"
        prices_obj = ", ".join(
            f"'{did}': {price}" for did, price in sorted(p["prices"].items())
        )
        # Get or create price history
        name_key = p["name"].lower().strip()
        ph = price_history.get(name_key, [])
        if not ph:
            # Generate synthetic history (current price + slight variations)
            low = min(p["prices"].values()) if p["prices"] else 0
            ph = [int(low * 1.15), int(low * 1.12), int(low * 1.1),
                  int(low * 1.08), int(low * 1.05), int(low * 1.03),
                  int(low * 1.01), low]

        # Determine category
        cat = p.get("category", "flower")
        strain = p.get("strain_id", "null")
        strain_str = f"'{strain}'" if strain and strain != "null" else "null"

        lines.append(
            f"    {{ id: '{pid}', name: '{_escape(p['name'])}', "
            f"brand: '{_escape(p.get('brand', 'Unknown'))}', "
            f"category: '{cat}', strain: {strain_str}, "
            f"weight: '{p.get('weight', '')}', "
            f"thc: '{p.get('thc', '')}', cbd: '{p.get('cbd', '')}',\n"
            f"      prices: {{ {prices_obj} }},\n"
            f"      priceHistory: {json.dumps(ph)} }}"
        )

    return ",\n".join(lines)


def _escape(s):
    """Escape single quotes in JS strings."""
    return str(s).replace("'", "\\'").replace("\n", " ")


def update_data_js(products_js):
    """Replace the TCC.products array in data.js with fresh data."""
    if not DATA_JS.exists():
        print(f"data.js not found at {DATA_JS}")
        return False

    content = DATA_JS.read_text()

    # Find and replace the products array
    pattern = r"(TCC\.products = \[)\n.*?\n(\];)"
    replacement = f"\\1\n{products_js}\n\\2"

    new_content, count = re.subn(pattern, replacement, content, flags=re.DOTALL)

    if count == 0:
        print("Could not find TCC.products array in data.js")
        print("The file format may have changed. Manual update needed.")
        return False

    # Add last-updated timestamp
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    ts_pattern = r"// Last auto-updated:.*\n"
    ts_line = f"// Last auto-updated: {timestamp}\n"
    if re.search(ts_pattern, new_content):
        new_content = re.sub(ts_pattern, ts_line, new_content)
    else:
        new_content = ts_line + new_content

    DATA_JS.write_text(new_content)
    print(f"Updated data.js with {len(products_js.splitlines())} lines of product data")
    return True


def main():
    products = load_export()
    if not products:
        return

    print(f"Loaded {len(products)} products from export")

    # Update price history
    history = load_price_history()
    for p in products:
        if p["prices"]:
            lowest = min(p["prices"].values())
            update_price_history(history, p["name"], lowest)
    save_price_history(history)

    # Build JS and update
    products_js = build_product_js(products, history)
    success = update_data_js(products_js)

    if success:
        print(f"\nSite data updated at {datetime.now().strftime('%Y-%m-%d %H:%M')}")
        print("Commit and push to deploy.")
    else:
        print("\nUpdate failed. Check data.js format.")


if __name__ == "__main__":
    main()
