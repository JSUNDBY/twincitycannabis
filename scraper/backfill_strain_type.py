#!/usr/bin/env python3
"""
Backfill strainType (indica / sativa / hybrid) onto js/data.js products.

This is a STOPGAP so the strain-type feature shows data immediately, before the
next live scrape populates strainType directly from Weedmaps
(genetics_tag_name). It only uses the dispensaries' OWN labels, never invented:

  1. explicit type word in the product name  -> certain
  2. exact product-name match to a labeled product (apify_raw)
  3. a learned strain-phrase -> type lookup built from the labeled set, applied
     only when the phrase has ONE consistent type and appears token-bounded in
     the name (so it can't be guessed from an ambiguous word)

Idempotent: skips products that already carry a strainType. Re-runnable.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "js" / "data.js"
TYPES = ("indica", "sativa", "hybrid")

# words that are never part of a strain identity (used to isolate the strain)
NOISE = set("""
indica sativa hybrid flower preroll pre roll prerolls cartridge cart carts vape
vapes disposable disposables edible edibles gummy gummies gummies chocolate bar
beverage drink seltzer tincture topical concentrate wax shatter rosin hash live
resin badder diamonds infused mg thc cbd cbn cbg oz gram grams g ct pk pack each
ground whole mixed bud buds premium select selects house craft mn minnesota the
and indoor outdoor greenhouse 1g 2g 3g 5g 7g 14g 28g
""".split())


def norm(s):
    return re.sub(r"[^a-z0-9 ]", " ", (s or "").lower())


def strain_phrase(name):
    """Best-effort strain phrase: name with brand/size/category noise stripped."""
    toks = [t for t in norm(name).split() if t and t not in NOISE and not t.isdigit()
            and not re.match(r"^\d", t)]
    return " ".join(toks).strip()


def load_labeled():
    """name(normalized)->type and strain_phrase->type from real labeled data."""
    name_map, phrase_votes = {}, {}
    for f in ROOT.glob("scraper/data/apify_raw_*.json"):
        try:
            items = json.load(open(f))
        except Exception:
            continue
        if isinstance(items, dict):
            items = list(items.values())
        for it in items:
            if not isinstance(it, dict):
                continue
            st = (it.get("strain_type") or "").strip().lower()
            nm = it.get("name") or ""
            if st in TYPES and nm:
                name_map[norm(nm).strip()] = st
                ph = strain_phrase(nm)
                if len(ph) >= 4:
                    phrase_votes.setdefault(ph, set()).add(st)
    # keep only phrases with a single consistent type
    phrase_map = {ph: next(iter(v)) for ph, v in phrase_votes.items() if len(v) == 1}
    return name_map, phrase_map


def main():
    name_map, phrase_map = load_labeled()
    # also learn phrases from products whose names explicitly state a type
    content = DATA.read_text()
    block = re.search(r"TCC\.products = \[(.*?)\n\];", content, re.DOTALL).group(1)
    for m in re.finditer(r"name: '((?:\\.|[^'])*)'", block):
        nm = m.group(1)
        n = norm(nm)
        for t in TYPES:
            if re.search(r"\b" + t + r"\b", n):
                ph = strain_phrase(nm)
                if len(ph) >= 4:
                    phrase_map.setdefault(ph, t)

    def classify(name):
        n = norm(name).strip()
        for t in TYPES:                       # 1. explicit in name
            if re.search(r"\b" + t + r"\b", n):
                return t
        if n in name_map:                     # 2. exact labeled match
            return name_map[n]
        ph = strain_phrase(name)              # 3. learned strain phrase
        if ph and ph in phrase_map:
            return phrase_map[ph]
        return ""

    # Fill strainType on each product. Products now always carry the field
    # (scrapers emit `strainType: ''` when the source menu has no genetics),
    # so skip only entries that ALREADY have a NON-EMPTY value — otherwise the
    # empty-but-present field would make this a no-op (it did, for months).
    entries = re.split(r"(?=\{ id: 'p\d)", block)
    counts = {"indica": 0, "sativa": 0, "hybrid": 0}
    changed = 0
    out = []
    for e in entries:
        if "id: 'p" not in e:
            out.append(e)
            continue
        if re.search(r"strainType: '[^']", e):  # already has a real value
            out.append(e)
            continue
        nm = re.search(r"name: '((?:\\.|[^'])*)'", e)
        t = classify(nm.group(1)) if nm else ""
        if t:
            if "strainType:" in e:  # field exists but empty — fill in place
                e = e.replace("strainType: ''", f"strainType: '{t}'", 1)
            else:  # legacy entry with no field — insert after strain
                e = e.replace("strain: null,", f"strain: null, strainType: '{t}',", 1)
            counts[t] += 1
            changed += 1
        out.append(e)

    new_block = "".join(out)
    new_content = content.replace(block, new_block, 1)
    DATA.write_text(new_content)

    total = len(re.findall(r"\{ id: 'p\d", block))
    print(f"Backfilled {changed}/{total} products with a strain type "
          f"({round(changed/total*100)}%)")
    print("  by type:", counts)
    print(f"  learned {len(phrase_map)} strain phrases from real labels")


if __name__ == "__main__":
    main()
