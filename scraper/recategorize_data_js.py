#!/usr/bin/env python3
"""
One-shot script: applies the name-based normalizer to the existing js/data.js,
re-categorizing every product and removing excluded ones.

Preserves all other product fields (prices, history, image, thc, cbd, etc).
Only modifies `category` and removes products tagged EXCLUDE.

Run: python3 scraper/recategorize_data_js.py
"""

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from normalize import categorize_by_name

DATA_JS = Path(__file__).parent.parent / "js" / "data.js"


def main():
    if not DATA_JS.exists():
        print(f"data.js not found at {DATA_JS}")
        sys.exit(1)

    content = DATA_JS.read_text()

    # Find the products array boundaries
    products_match = re.search(r"(TCC\.products = \[)\n(.*?)\n(\];)", content, re.DOTALL)
    if not products_match:
        print("Could not find TCC.products array")
        sys.exit(1)

    products_block = products_match.group(2)

    # Each product is a single { ... } object - they're written one per line by direct_menu_scrape
    # Match each product entry as a balanced object (split by lines starting with "    {")
    # Products may span multiple lines (image url, prices, history)
    # We split on the pattern: "    { id: 'pNNNN'"
    product_lines = re.split(r'(?=^    \{ id: \')', products_block, flags=re.MULTILINE)
    product_lines = [p.strip() for p in product_lines if p.strip()]
    print(f"Parsed {len(product_lines)} product entries")

    # For each, extract name and brand, then re-categorize
    kept = []
    excluded_count = 0
    cat_changes = 0

    for entry in product_lines:
        # Extract name, brand, category
        name_m = re.search(r"name:\s*'((?:[^'\\]|\\.)*)'", entry)
        brand_m = re.search(r"brand:\s*'((?:[^'\\]|\\.)*)'", entry)
        cat_m = re.search(r"category:\s*'([^']+)'", entry)
        if not (name_m and cat_m):
            kept.append(entry)
            continue

        name = name_m.group(1).replace("\\'", "'").replace('\\\\', '\\')
        brand = brand_m.group(1) if brand_m else ''
        old_cat = cat_m.group(1)

        new_cat = categorize_by_name(name, brand, old_cat)
        if new_cat == 'EXCLUDE':
            excluded_count += 1
            continue

        if new_cat != old_cat:
            entry = entry.replace(f"category: '{old_cat}'", f"category: '{new_cat}'", 1)
            cat_changes += 1

        kept.append(entry)

    print(f"Kept: {len(kept)}")
    print(f"Excluded: {excluded_count}")
    print(f"Category changes: {cat_changes}")

    # Reassemble
    new_block = ",\n".join(kept) if kept else ""
    # The kept entries may already have trailing commas if they were mid-list
    # Strip any trailing commas first then rejoin
    cleaned = []
    for e in kept:
        e = e.rstrip()
        if e.endswith(','):
            e = e[:-1]
        cleaned.append(e)
    new_block = ",\n".join(cleaned)

    new_content = (
        content[:products_match.start()] +
        f"{products_match.group(1)}\n{new_block}\n{products_match.group(3)}" +
        content[products_match.end():]
    )

    DATA_JS.write_text(new_content)
    print(f"\nUpdated {DATA_JS}")
    print(f"Distribution after re-categorization:")
    from collections import Counter
    cats = Counter()
    for entry in cleaned:
        m = re.search(r"category:\s*'([^']+)'", entry)
        if m:
            cats[m.group(1)] += 1
    for c, n in cats.most_common():
        print(f"  {c:12s}: {n}")


if __name__ == "__main__":
    main()
