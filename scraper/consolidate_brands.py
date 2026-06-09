#!/usr/bin/env python3
"""
Consolidate fragmented brand names in data.js.

Dispensary menus list one brand many ways: "Looner", "Looner Drink",
"Looner Sodas", "Looner Gummies", "Looner Legal THC Cannabis Soda 10mg 12oz".
This collapses those variants to one canonical brand so brand pages are whole
(the foundation for brand claiming/promotion).

Conservative: only merges variants that share a distinctive brand ROOT (>=4
chars, not a generic word) and differ only by product-type / size / filler
words. Never touches "House" (the unbranded catch-all). Dry-run by default;
pass --apply to write.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "js" / "data.js"

# product-type, size, dosage, and filler words stripped to find the brand root
STRIP = set("""
soda sodas drink drinks beverage beverages gummy gummie gummies lemonade
lemonades shot shots spirit spirits mixer mixers tea teas cartridge cart carts
vape vapes disposable disposables preroll prerolls flower edible edibles
tincture tinctures topical topicals concentrate concentrates legal thc cbd cbg
cbn cannabis infused extra strength single can cans pack packs original classic
mg g oz ml pk ct count half and the co company llc inc drink
""".split())
GENERIC = set("house unknown brand the".split())


def brand_root(brand):
    n = re.sub(r"[|/_().,&\-]", " ", (brand or "").lower())
    # numbers + glued/spaced units (10mg, 12oz, 50 mg, 250)
    n = re.sub(r"\d+(\.\d+)?\s*(mg|g|oz|ml|pk|ct|count|pack|gram|grams)?", " ", n)
    toks = []
    for t in n.split():
        if len(t) > 3:
            t = t.rstrip("s")
        if t and t not in STRIP:
            toks.append(t)
    return " ".join(toks)


def main():
    apply = "--apply" in sys.argv
    content = DATA.read_text()
    block = re.search(r"TCC\.products = \[(.*?)\n\];", content, re.DOTALL).group(1)
    entries = re.split(r"(?=\{ id: 'p\d)", block)

    def brand_of(e):
        m = re.search(r"brand:\s*'((?:\\.|[^'])*)'", e)
        if not m:
            return ""
        # unescape the JS string so we don't re-escape an already-escaped value
        return m.group(1).replace("\\'", "'").replace("\\\\", "\\")

    # tally brand strings and cluster by root
    from collections import Counter, defaultdict
    counts = Counter()
    for e in entries:
        b = brand_of(e)
        if b:
            counts[b] += 1

    clusters = defaultdict(list)
    for b in counts:
        r = brand_root(b)
        if not r or r in GENERIC or len(r.replace(" ", "")) < 4:
            continue
        clusters[r].append(b)

    # build the canonical map: only for roots with 2+ distinct brand strings
    canon = {}
    proposals = []
    for r, variants in clusters.items():
        if len(variants) < 2:
            continue
        # canonical = the variant whose own root == r and is shortest (cleanest)
        exact = [v for v in variants if brand_root(v) == r]
        pool = exact or variants
        canonical = min(pool, key=lambda v: (len(v), v))
        for v in variants:
            if v != canonical:
                canon[v] = canonical
        proposals.append((canonical, sorted(variants, key=lambda v: -counts[v])))

    print(f"Proposed brand merges: {len(proposals)} clusters, "
          f"{len(canon)} variant names -> canonical\n")
    for canonical, variants in sorted(proposals, key=lambda x: -sum(counts[v] for v in x[1]))[:25]:
        merged = [v for v in variants if v != canonical]
        if merged:
            print(f"  '{canonical}'  <=  " + ", ".join(f"'{v}'({counts[v]})" for v in merged[:6])
                  + (" ..." if len(merged) > 6 else ""))

    if not apply:
        print("\nDry run. Re-run with --apply to write.")
        return

    out = []
    changed = 0
    for e in entries:
        b = brand_of(e)
        if b in canon:
            esc = canon[b].replace("\\", "\\\\").replace("'", "\\'")
            # lambda replacement so re.sub doesn't interpret backslashes in esc
            e = re.sub(r"brand:\s*'(?:\\.|[^'])*'", lambda _m: f"brand: '{esc}'", e, count=1)
            changed += 1
        out.append(e)
    DATA.write_text(content.replace(block, "".join(out), 1))
    print(f"\nApplied: rewrote brand on {changed} products into {len(proposals)} consolidated brands.")


if __name__ == "__main__":
    main()
