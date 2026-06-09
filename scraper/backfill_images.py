#!/usr/bin/env python3
"""
Backfill missing product images from matching sibling listings.

The same product is often listed many times across dispensary menus with
slightly different names; some carry the Weedmaps photo, some don't. For each
image-less product, find a sibling (SAME category + identical normalized
key) that has a real image and copy it. Conservative by design: exact
normalized-key match within the same category only, so we never paste the
wrong product's photo.

Run after the scrape. Idempotent (only fills empty images).
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "js" / "data.js"

# size / unit / dosage / packaging / marketing filler — removed from the key
NOISE = set("""
thc cbd cbg cbn single pack legal cannabis infused extra strength the and mn
minnesota oz mg ml pk ct count can deli bulk premium select house craft
""".split())


def norm_key(name):
    n = name.lower()
    n = re.sub(r"[|/_().,&]", " ", n)
    n = re.sub(r"\b\d+(\.\d+)?\s*(mg|g|oz|ml|pk|ct|pack|count|thc|cbd)?\b", " ", n)
    toks = []
    for t in n.split():
        if len(t) > 3:
            t = t.rstrip("s")          # crude singularize (sodas->soda, cans->can)
        if t and t not in NOISE:
            toks.append(t)
    return " ".join(sorted(set(toks)))


def main():
    content = DATA.read_text()
    block = re.search(r"TCC\.products = \[(.*?)\n\];", content, re.DOTALL).group(1)
    entries = re.split(r"(?=\{ id: 'p\d)", block)

    def field(e, k):
        m = re.search(k + r":\s*('(?:\\.|[^'])*'|\"[^\"]*\"|null|'')", e)
        if not m:
            return ""
        v = m.group(1)
        if v in ("null", "''", '""'):
            return ""
        return v[1:-1]

    # Build (category, key) -> a real image from products that have one
    img_by = {}
    parsed = []
    for e in entries:
        if "id: 'p" not in e:
            parsed.append((e, None, None, None))
            continue
        name = field(e, "name")
        cat = field(e, "category")
        m = re.search(r'image:\s*("(?:\\.|[^"])*"|null|\'\')', e)
        img_raw = m.group(1) if m else "null"
        has_img = img_raw not in ("null", '""', "''") and len(img_raw) > 12
        key = (cat, norm_key(name))
        parsed.append((e, key, has_img, img_raw))
        if has_img and key[1] and key not in img_by:
            img_by[key] = img_raw

    filled = 0
    samples = []
    out = []
    for e, key, has_img, img_raw in parsed:
        if key and not has_img and key[1] and key in img_by:
            donor = img_by[key]
            # replace the empty image with the donor's real one
            e2 = re.sub(r'image:\s*(?:"[^"]*"|null|\'\')', f"image: {donor}", e, count=1)
            if e2 != e:
                filled += 1
                if len(samples) < 10:
                    samples.append(field(e, "name"))
                e = e2
        out.append(e)

    new_block = "".join(out)
    DATA.write_text(content.replace(block, new_block, 1))
    print(f"Backfilled images on {filled} products (from matching siblings).")
    for s in samples:
        print("  +img:", s[:60])


if __name__ == "__main__":
    main()
