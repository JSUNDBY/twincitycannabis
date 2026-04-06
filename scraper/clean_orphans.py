#!/usr/bin/env python3
"""
Removes orphaned data from js/data.js:
  - Product price entries that reference dispensaries not in TCC.dispensaries
  - Reviews for dispensaries not in TCC.dispensaries
  - Products that have zero valid price entries left after cleanup

Run after merge_google_data.py and recategorize_data_js.py.
"""
import re
import json
from pathlib import Path

DATA_JS = Path(__file__).parent.parent / "js" / "data.js"


def main():
    content = DATA_JS.read_text()

    # Get dispensary IDs — scoped to TCC.dispensaries block ONLY
    disp_match = re.search(r"TCC\.dispensaries = \[(.*?)\];", content, re.DOTALL)
    if not disp_match:
        print("Could not find TCC.dispensaries")
        return
    disp_block = disp_match.group(1)
    # In dispensary entries, id is the FIRST field on its line, followed by name
    disp_ids = set(re.findall(r"id:\s*'([^']+)'\s*,\s*name:", disp_block))
    print(f"Found {len(disp_ids)} dispensary IDs")

    # Process products: find each entry and clean its prices field
    products_match = re.search(r"(TCC\.products = \[)\n(.*?)\n(\];)", content, re.DOTALL)
    if not products_match:
        print("Could not find products array")
        return

    products_block = products_match.group(2)
    product_entries = re.split(r"(?=\{\s*id:\s*'p\d+)", products_block)
    product_entries = [e.strip() for e in product_entries if e.strip()]
    print(f"Parsed {len(product_entries)} product entries")

    cleaned_products = []
    dropped_products = 0
    cleaned_refs = 0

    for entry in product_entries:
        # Find prices: { 'a': 1.0, 'b': 2.0 }
        prices_match = re.search(r"prices:\s*\{([^}]*)\}", entry)
        if not prices_match:
            cleaned_products.append(entry)
            continue

        prices_str = prices_match.group(1)
        # Parse each "key": value pair
        price_entries = re.findall(r"'([^']+)':\s*(\d+(?:\.\d+)?)", prices_str)
        valid = [(k, v) for k, v in price_entries if k in disp_ids]
        invalid_count = len(price_entries) - len(valid)
        cleaned_refs += invalid_count

        if not valid:
            dropped_products += 1
            continue

        # Rebuild prices block
        new_prices = ", ".join(f"'{k}': {v}" for k, v in valid)
        new_entry = re.sub(
            r"prices:\s*\{[^}]*\}",
            f"prices: {{ {new_prices} }}",
            entry, count=1
        )
        cleaned_products.append(new_entry)

    print(f"Removed {cleaned_refs} orphaned price refs")
    print(f"Dropped {dropped_products} products with no valid prices")
    print(f"Kept {len(cleaned_products)} products")

    new_products_block = ",\n".join(e.rstrip().rstrip(',') for e in cleaned_products)

    # Process reviews
    reviews_match = re.search(r"(TCC\.reviews = \[)\n(.*?)\n(\];)", content, re.DOTALL)
    if reviews_match:
        reviews_block = reviews_match.group(2)
        review_lines = [l for l in reviews_block.split('\n') if l.strip()]
        kept_reviews = []
        dropped_reviews = 0
        for line in review_lines:
            m = re.search(r"dispensaryId:\s*'([^']+)'", line)
            if m and m.group(1) in disp_ids:
                kept_reviews.append(line.rstrip().rstrip(','))
            else:
                dropped_reviews += 1
        print(f"Removed {dropped_reviews} orphaned reviews")
        new_reviews_block = ",\n".join(kept_reviews)
    else:
        new_reviews_block = None

    # Reassemble
    new_content = (
        content[:products_match.start()]
        + f"{products_match.group(1)}\n{new_products_block}\n{products_match.group(3)}"
        + content[products_match.end():]
    )

    if new_reviews_block is not None:
        # find updated position of reviews in new_content
        rev_match2 = re.search(r"(TCC\.reviews = \[)\n(.*?)\n(\];)", new_content, re.DOTALL)
        if rev_match2:
            new_content = (
                new_content[:rev_match2.start()]
                + f"{rev_match2.group(1)}\n{new_reviews_block}\n{rev_match2.group(3)}"
                + new_content[rev_match2.end():]
            )

    DATA_JS.write_text(new_content)
    print(f"\nUpdated {DATA_JS}")


if __name__ == "__main__":
    main()
