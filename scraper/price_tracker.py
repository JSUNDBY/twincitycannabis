#!/usr/bin/env python3
"""
Twin City Cannabis — Price History Tracker
Stores each scrape's prices and builds real price trends over time.

Each run appends today's prices to a rolling history file.
After 2+ runs on different days, price history charts show REAL data.

Usage:
  python3 price_tracker.py record     # record today's prices from latest scrape
  python3 price_tracker.py export     # export history for data.js
"""

import json
from datetime import datetime, date
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"
HISTORY_FILE = DATA_DIR / "price_history.json"
PRODUCTS_FILE = DATA_DIR / "full_menu_products.json"


def load_history():
    """Load existing price history."""
    if HISTORY_FILE.exists():
        with open(HISTORY_FILE) as f:
            return json.load(f)
    return {}


def save_history(history):
    """Save price history."""
    with open(HISTORY_FILE, "w") as f:
        json.dump(history, f)
    print(f"Saved history for {len(history)} products")


def record_prices():
    """Record today's lowest prices from the latest scrape."""
    if not PRODUCTS_FILE.exists():
        print("No products file. Run direct_menu_scrape.py first.")
        return

    with open(PRODUCTS_FILE) as f:
        products = json.load(f)

    history = load_history()
    today = date.today().isoformat()

    updated = 0
    for p in products:
        if not p.get("prices"):
            continue

        key = p["name"].strip().lower()
        lowest = min(p["prices"].values())

        if key not in history:
            history[key] = {"name": p["name"], "entries": []}

        entries = history[key]["entries"]

        # Don't record same day twice
        if entries and entries[-1]["date"] == today:
            # Update if price changed
            if entries[-1]["price"] != lowest:
                entries[-1]["price"] = lowest
                updated += 1
        else:
            entries.append({"date": today, "price": lowest})
            updated += 1

        # Keep last 60 days of data
        history[key]["entries"] = entries[-60:]

    save_history(history)
    print(f"Recorded prices for {today}: {updated} products updated")
    print(f"Total products tracked: {len(history)}")

    # Stats
    has_multi = sum(1 for h in history.values() if len(h["entries"]) > 1)
    print(f"Products with 2+ data points: {has_multi}")


def get_price_history(product_name, num_points=8):
    """Get price history for a product (last N data points)."""
    history = load_history()
    key = product_name.strip().lower()

    if key not in history:
        return None

    entries = history[key]["entries"]
    prices = [e["price"] for e in entries[-num_points:]]

    # Pad to num_points if not enough data
    while len(prices) < num_points:
        prices.insert(0, prices[0] if prices else 0)

    return prices


def export_for_data_js():
    """Export price histories for use in the update_data_js function."""
    history = load_history()

    result = {}
    for key, data in history.items():
        entries = data["entries"]
        if entries:
            prices = [e["price"] for e in entries[-8:]]
            while len(prices) < 8:
                prices.insert(0, prices[0] if prices else 0)
            result[key] = prices

    export_path = DATA_DIR / "price_history_export.json"
    with open(export_path, "w") as f:
        json.dump(result, f)

    has_real = sum(1 for v in result.values() if len(set(v)) > 1)
    print(f"Exported {len(result)} price histories ({has_real} with real variation)")
    return result


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "export":
        export_for_data_js()
    else:
        record_prices()
