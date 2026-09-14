#!/usr/bin/env python3
"""
Canonicalize products across menu platforms.

Every platform spells the same product differently ("Grasslandz | Gelato 45 |
Big Buds | 3.5g" vs "Grasslandz Gelato 45 3.5g Flower"), and each platform's
merge script only groups its own entries — so even IDENTICAL names from two
platforms sat in data.js as two products. The site's whole point is "this
product costs $X here and $Y there", and that only works when two listings are
recognized as one product.

This runs last in the data-quality trio (after recategorize) and merges entries
that share a SAFE key:  brand | category | size | normalized product words.
  - brand required (never merges House/unknown-brand products: "Blue Dream 3.5g"
    at two shops is not the same product)
  - size required: grams from the weight field or the name; total package mg
    for edibles/drinks/tinctures (10mg THC 4 Can -> 40; 100mg 20pc -> 100)
  - words normalized (case, punctuation, size tokens, category filler like
    "flower"/"pre-roll"/"hybrid"); "disposable" is deliberately KEPT so a
    disposable never merges with a cartridge
  - exact token match only — no fuzzy similarity (0.80 Jaccard merged
    "Professor Pepper" with "Diet Professor Pepper" in testing)

Merged entry = the member with the most shops (tie: has image, then first);
prices are unioned (primary wins on overlap), image/thc backfilled from members.
Absorbed entries are removed. A log of every merge goes to
scraper/data/canonical_merges.json for review. Aborts without writing if it
would absorb more than 15% of entries — that would mean the matcher broke.

Measured 2026-09-14 on live data: ~430 single-shop entries gain a cross-shop
comparison, 161 groups span different platforms, 0 disposable/cart mixes.
"""

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "js" / "data.js"
LOG = ROOT / "scraper" / "data" / "canonical_merges.json"
MAX_ABSORB_FRACTION = 0.15

STOP = set("""
flower flowers prepack prepacked pre pack packed preroll prerolls roll rolls
joint joints cart cartridge carts vape vapes edible edibles gummy gummies
hybrid indica sativa h i s thc cbd strain cannabis by the and a of with x ea
each oz g mg gram grams eighth quarter half ounce case single smalls popcorn
bud buds
""".split())

MG_CATS = {"edible", "beverage", "tincture"}


def unescape(s):
    return s.replace("\\'", "'").replace("\\\\", "\\")


def field(entry, key, quote="'"):
    if quote == "'":
        m = re.search(key + r":\s*'((?:[^'\\]|\\.)*)'", entry)
    else:
        m = re.search(key + r':\s*"((?:[^"\\]|\\.)*)"', entry)
    return unescape(m.group(1)) if m else ""


def grams_of(name, weight):
    m = re.match(r"^(\d+(?:\.\d+)?)\s*g$", weight.lower().strip())
    if m:
        return float(m.group(1))
    n = name.lower()
    m = re.search(r"(?:^|[\s|(])(\d+(?:\.\d+)?)\s*g(?![a-z])", n)
    if m:
        return float(m.group(1))
    if re.search(r"\b(1/8|eighth)\b", n):
        return 3.5
    if re.search(r"\b(1/4|quarter)\b", n):
        return 7.0
    if re.search(r"\b(1/2|half)\s*(oz|ounce)?\b", n):
        return 14.0
    return None


def mg_of(name):
    n = name.lower()
    m = re.search(r"(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*mg", n) or re.search(r"(\d+(?:\.\d+)?)\s*mg\s*[x×]\s*(\d+)\b", n)
    if m:
        return round(float(m.group(1)) * float(m.group(2)))
    thc = re.search(r"(\d+(?:\.\d+)?)\s*mg\s*(?:of\s*)?thc", n)
    allmg = [float(x) for x in re.findall(r"(\d+(?:\.\d+)?)\s*mg", n)]
    if not allmg:
        return None
    unit = float(thc.group(1)) if thc else allmg[0]
    cnt = re.search(r"\b(\d{1,3})\s*(?:pk|pack|ct|count|cans?|pcs?|pieces?)\b", n)
    packed = unit * int(cnt.group(1)) if (cnt and int(cnt.group(1)) >= 2 and unit <= 25) else 0
    return round(max(packed, max(allmg)))


def size_of(name, weight, category):
    if category in MG_CATS:
        mg = mg_of(name)
        return f"{mg}mg" if mg else ""
    g = grams_of(name, weight)
    return f"{g:g}g" if g else ""


def norm_tokens(name, brand):
    n = name.lower().replace("|", " ")
    n = re.sub(r"\([^)]*\)", " ", n)
    n = re.sub(r"\[[^\]]*\]", " ", n)
    n = re.sub(r"(\d+(?:\.\d+)?)\s*(g|mg|oz|ml)\b", " ", n)
    n = re.sub(r"\b1/[248]\b", " ", n)
    n = n.replace("#", " ")
    n = re.sub(r"([a-z])(\d)", r"\1 \2", n)
    n = re.sub(r"(\d)([a-z])", r"\1 \2", n)
    n = re.sub(r"[^a-z0-9 ]", " ", n)
    brand_toks = set(re.sub(r"[^a-z0-9 ]", " ", brand.lower()).split())
    toks = [t for t in n.split() if t and t not in STOP and t not in brand_toks]
    return sorted(set(toks))


def parse_prices(entry):
    m = re.search(r"prices:\s*\{([^}]*)\}", entry)
    if not m:
        return {}
    return {k: float(v) for k, v in re.findall(r"'([^']+)':\s*([\d.]+)", m.group(1))}


def render_prices(prices):
    return "{ " + ", ".join(f"'{k}': {v}" for k, v in prices.items()) + " }"


def main():
    dry = "--dry-run" in sys.argv
    src = Path(sys.argv[sys.argv.index("--input") + 1]) if "--input" in sys.argv else DATA
    content = src.read_text()
    pm = re.search(r"(TCC\.products = \[)\n(.*?)\n(\];)", content, re.DOTALL)
    if not pm:
        print("Could not find TCC.products array")
        sys.exit(1)
    entries = [e.strip().rstrip(",") for e in re.split(r"(?=\{\s*id:\s*'[a-z]{1,2}\d+)", pm.group(2)) if e.strip()]
    total = len(entries)

    groups = defaultdict(list)
    meta = []
    for idx, e in enumerate(entries):
        name = field(e, "name")
        brand = field(e, "brand")
        cat_m = re.search(r"category:\s*'([^']+)'", e)
        cat = cat_m.group(1) if cat_m else ""
        weight = field(e, "weight")
        prices = parse_prices(e)
        image = field(e, "image", '"') or field(e, "image")
        meta.append({"name": name, "brand": brand, "cat": cat, "prices": prices, "image": image})
        b = brand.strip().lower()
        if not name or not b or b == "house" or not cat or not prices:
            continue
        size = size_of(name, weight, cat)
        if not size:
            continue
        toks = norm_tokens(name, brand)
        if not toks:
            continue
        groups[(b, cat, size, " ".join(toks))].append(idx)

    absorbed = set()
    rewrites = {}
    log = []
    for key, idxs in groups.items():
        if len(idxs) < 2:
            continue
        shops = set()
        for i in idxs:
            shops.update(meta[i]["prices"].keys())
        if len(shops) <= max(len(meta[i]["prices"]) for i in idxs):
            continue  # no new comparison would be created
        primary = sorted(idxs, key=lambda i: (-len(meta[i]["prices"]), 0 if meta[i]["image"] else 1, i))[0]
        merged = dict(meta[primary]["prices"])
        image = meta[primary]["image"]
        thc = field(entries[primary], "thc")
        for i in idxs:
            if i == primary:
                continue
            for k, v in meta[i]["prices"].items():
                merged.setdefault(k, v)
            if not image and meta[i]["image"]:
                image = meta[i]["image"]
            if not thc and field(entries[i], "thc"):
                thc = field(entries[i], "thc")
            absorbed.add(i)
        e = entries[primary]
        e = re.sub(r"prices:\s*\{[^}]*\}", "prices: " + render_prices(merged), e, count=1)
        if image and not meta[primary]["image"]:
            e = re.sub(r'image:\s*(?:"[^"]*"|\'[^\']*\'|null)', 'image: "' + image.replace('"', "") + '"', e, count=1)
        if thc and not field(entries[primary], "thc"):
            e = re.sub(r"thc:\s*''", "thc: '" + thc.replace("'", "\\'") + "'", e, count=1)
        rewrites[primary] = e
        log.append({
            "key": "|".join(key),
            "kept": {"name": meta[primary]["name"], "shops_before": len(meta[primary]["prices"])},
            "absorbed": [{"name": meta[i]["name"], "shops": list(meta[i]["prices"].keys())} for i in idxs if i != primary],
            "shops_after": len(merged),
        })

    frac = len(absorbed) / max(total, 1)
    print(f"Canonicalize: {total} entries, {len(log)} merge groups, {len(absorbed)} entries absorbed ({frac:.1%})")
    if frac > MAX_ABSORB_FRACTION:
        print(f"ABORT: would absorb {frac:.1%} of entries (> {MAX_ABSORB_FRACTION:.0%}) — matcher looks broken, data.js untouched")
        sys.exit(1)
    if dry:
        for row in log[:12]:
            print("  KEEP", row["kept"]["name"][:52], "<=", " / ".join(a["name"][:40] for a in row["absorbed"]))
        return
    out = []
    for i, e in enumerate(entries):
        if i in absorbed:
            continue
        out.append(rewrites.get(i, e))
    new_block = ",\n".join(out)
    content = content[:pm.start()] + pm.group(1) + "\n" + new_block + "\n" + pm.group(3) + content[pm.end():]
    if src == DATA:
        DATA.write_text(content)
        LOG.write_text(json.dumps({"merged_groups": len(log), "absorbed": len(absorbed), "groups": log}, indent=1))
        print(f"Wrote data.js ({total - len(absorbed)} entries) and {LOG.name}")
    else:
        Path(sys.argv[sys.argv.index("--output") + 1]).write_text(content)
        print("Wrote output copy")


if __name__ == "__main__":
    main()
