#!/usr/bin/env python3
"""
NativeCare West St. Paul menu scraper.

NativeCare publishes their W. St. Paul menu as a WordPress page, not a
dispensary platform (Jane/Dutchie/etc). Their Red Lake and Thief River
Falls locations link to Weedmaps so those come from the main scraper.
This handles W. St. Paul only.

Data source: https://www.nativecare.com/wp-json/wp/v2/pages/2442
Outputs:     scraper/data/nativecare_products.json

Run:         python3 scraper/nativecare_scrape.py
"""

import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import urlopen, Request

DATA_DIR = Path(__file__).parent / "data"
OUT_FILE = DATA_DIR / "nativecare_products.json"
DISPENSARY_ID = "nativecare-west-st-paul"
PAGE_URL = "https://www.nativecare.com/wp-json/wp/v2/pages/2442"

# Section headers that map to our categories. Order matters — "PRE ROLLS"
# comes before "ROLLS" catching.
CATEGORY_HEADERS = [
    ("FLOWER", "flower"),
    ("PRE ROLL", "pre-roll"),
    ("PRE-ROLL", "pre-roll"),
    ("PREROLL", "pre-roll"),
    ("CART", "cartridge"),
    ("VAPE", "cartridge"),
    ("DISPOSABLE", "cartridge"),
    ("GUMMIES", "edible"),
    ("GUMMY", "edible"),
    ("GUMMI", "edible"),
    ("EDIBLE", "edible"),
    ("CHOCOLATE", "edible"),
    ("DROPS", "tincture"),
    ("TINCTURE", "tincture"),
    ("TOPICAL", "topical"),
    ("CBD", "tincture"),
]


class _Stripper(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)

    def handle_starttag(self, tag, attrs):
        # Treat block-level tags as line breaks so we get one product per line
        if tag in {"p", "div", "br", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "td"}:
            self.parts.append("\n")


def strip_html(html):
    p = _Stripper()
    p.feed(html)
    text = "".join(p.parts)
    # Decode common HTML entities that slip through
    text = (text
            .replace("&#8211;", "-")
            .replace("&#8212;", "-")
            .replace("&#038;", "&")
            .replace("&amp;", "&")
            .replace("&nbsp;", " "))
    return text


def fetch_menu():
    req = Request(PAGE_URL, headers={"User-Agent": "Mozilla/5.0 (TCC)"})
    with urlopen(req, timeout=20) as r:
        data = json.loads(r.read())
    return data.get("content", {}).get("rendered", "")


def detect_category(line):
    """Return our canonical category if this line looks like a section header.

    Headers can include weight indicators (3.5, 1G, .5 CARTS) but not prices
    (no $ and no %). Pipes are price/size separators, not headers.
    """
    s = line.strip().upper()
    if not s or len(s) > 60:
        return None
    if "|" in s or "$" in s or "%" in s:
        return None
    # Reject lines that are just a strain-name-strain style (like "NAME - INDICA")
    if re.search(r"\b(INDICA|SATIVA|HYBRID)\b", s):
        return None
    for marker, cat in CATEGORY_HEADERS:
        if marker in s:
            return cat
    return None


PRICE_RE = re.compile(r"\$?(\d+(?:\.\d+)?)")
THC_RE = re.compile(r"(\d+(?:\.\d+)?)\s*%\s*THC", re.IGNORECASE)
STRAIN_RE = re.compile(r"\b(INDICA|SATIVA|HYBRID)\b", re.IGNORECASE)
WEIGHT_TIER_RE = re.compile(r"(\d+(?:\.\d+)?)\s*[Gg]")  # matches "3.5G", "14G", "28G"


def _product_entry(**kw):
    """Return a normalized product dict with required keys + overrides."""
    base = {
        "dispensary_id": DISPENSARY_ID,
        "name": "",
        "brand": "House",
        "category": "flower",
        "menu_type": "rec",
        "thc": "",
        "cbd": "",
        "price": 0.0,
        "weight": "",
        "image": "",
        "source": "nativecare",
    }
    base.update(kw)
    return base


def _is_heading_chunk(line):
    """True if this line looks like part of a section header or brand name —
    not a product line, price line, THC%, or strain-type line. CBD/THC are
    allowed because headers like "STRESS DROPS - CBD" or "PET DROPS - CBD"
    need to pass through for merging."""
    if not line:
        return False
    if "|" in line or "$" in line or "%" in line or ":" in line:
        return False
    up = line.upper()
    if re.search(r"\b(INDICA|SATIVA|HYBRID)\b", up):
        return False
    # Reject lines that are just a dosage/size line like "750 MG" or "30 PACK"
    if re.match(r"^\d+(?:\.\d+)?\s*(MG|ML|OZ|PACK|PCS?|CT)s?\b", up):
        return False
    # Mostly letters
    letters = sum(1 for c in line if c.isalpha())
    return letters >= 3 and len(line) <= 60


def merge_headers(lines):
    """Merge consecutive heading-chunk lines into single multi-word headers.
    Handles cases like brand names split across lines:
        ISLAND PEZI / GRASSLANDZ / 1G PRE ROLLS
    becomes:
        ISLAND PEZI GRASSLANDZ 1G PRE ROLLS
    """
    merged = []
    buf = []
    for line in lines:
        if _is_heading_chunk(line):
            buf.append(line)
        else:
            if buf:
                merged.append(" ".join(buf))
                buf = []
            merged.append(line)
    if buf:
        merged.append(" ".join(buf))
    return merged


def parse_lines(text):
    """NativeCare menu uses a WordPress page with each field on its own line.

    Flower (4 lines):        NAME - STRAIN / X% THC / 3.5G | 14G | 28G / 65 | 215 | 375
    Pre-roll single (3 lines): NAME - STRAIN / X% THC / SINGLE: 11.13
    Named product (1 line):    NAME | PRICE  (within a section like GUMMIES)
    Brand block heading:       a line that doesn't match header or product,
                               followed by NAME | PRICE items
    """
    # Normalize dashes so regexes using `-` match en-dash / em-dash
    text = text.replace("–", "-").replace("—", "-")
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    lines = merge_headers(lines)
    products = []
    current_cat = "flower"
    current_brand = None
    i = 0

    strain_name_re = re.compile(r"^(.+?)\s*-\s*(INDICA|SATIVA|HYBRID)\s*$", re.IGNORECASE)
    thc_line_re = re.compile(r"^([\d.]+)\s*%?\s*THC", re.IGNORECASE)
    sizes_line_re = re.compile(r"^([\d.]+\s*[Gg](\s*\|\s*[\d.]+\s*[Gg])+)\s*$")
    prices_line_re = re.compile(r"^[\d.]+(\s*\|\s*[\d.]+)+\s*$")
    single_re = re.compile(r"^SINGLE\s*:\s*\$?([\d.]+)\s*$", re.IGNORECASE)
    name_price_re = re.compile(r"^(.+?)\s*\|\s*\$?([\d.]+)\s*$")
    # Multi-tier inline: "CAT 300 MG | 30" — treat same as name|price
    # THC% inline with name-strain: "DURBAN POISON\n18.7% THC\n3.5G | 14G | 28G\n65 | 215 | 375"

    while i < len(lines):
        line = lines[i]

        # 1. Section header
        cat = detect_category(line)
        if cat is not None:
            current_cat = cat
            # Check if this header is a brand block like "ISLAND PEZI GRASSLANDZ 1G PRE ROLLS"
            # Only treat prefix as brand if it contains letters (not just size numbers
            # like "1G" in "1G DISPOSABLE" or "3.5" in "3.5 FLOWER").
            current_brand = None
            for marker, _ in CATEGORY_HEADERS:
                idx = line.upper().find(marker)
                if idx > 0:
                    prefix = line[:idx].strip()
                    # Reject prefixes that are just numbers / size indicators
                    if prefix and re.search(r"[A-Za-z]{3,}", prefix) and len(prefix.split()) <= 8:
                        # Also strip trailing size tokens like "1G" or ".5" from the brand
                        prefix = re.sub(r"\s+[\d.]+\s*[Gg]?\s*$", "", prefix).strip()
                        if prefix and re.search(r"[A-Za-z]{3,}", prefix):
                            current_brand = prefix.title()
                    break
            i += 1
            continue

        # 2. Strain-style name line "NAME - INDICA" — look ahead
        m = strain_name_re.match(line)
        if m:
            name = m.group(1).strip().title()
            strain = m.group(2).lower()
            thc = ""
            # Next line: optional THC%
            if i + 1 < len(lines):
                tm = thc_line_re.match(lines[i + 1])
                if tm:
                    thc = f"{tm.group(1)}%"
            # Check 2 lines ahead for flower tier pricing
            if i + 3 < len(lines):
                sizes_line = lines[i + 2]
                prices_line = lines[i + 3]
                if sizes_line_re.match(sizes_line) and prices_line_re.match(prices_line):
                    sizes = [s.strip() for s in sizes_line.split("|")]
                    prices = [p.strip() for p in prices_line.split("|")]
                    if len(sizes) == len(prices):
                        for sz, pr in zip(sizes, prices):
                            wm = WEIGHT_TIER_RE.search(sz)
                            pm = PRICE_RE.search(pr)
                            if wm and pm:
                                products.append(_product_entry(
                                    name=name,
                                    category="flower",
                                    thc=thc,
                                    price=float(pm.group(1)),
                                    weight=f"{wm.group(1)}g",
                                    strain_type=strain,
                                ))
                        i += 4
                        continue
            # Pre-roll single (line 2 might be THC, line 3 SINGLE: price)
            if i + 2 < len(lines):
                single_m = single_re.match(lines[i + 2])
                if single_m:
                    products.append(_product_entry(
                        name=name,
                        category="pre-roll",
                        thc=thc,
                        price=float(single_m.group(1)),
                        weight="1g",
                        strain_type=strain,
                        brand=current_brand or "House",
                    ))
                    i += 3
                    continue
            # Sometimes SINGLE comes right after name-strain (no THC line)
            if i + 1 < len(lines):
                single_m = single_re.match(lines[i + 1])
                if single_m:
                    products.append(_product_entry(
                        name=name,
                        category="pre-roll",
                        price=float(single_m.group(1)),
                        weight="1g",
                        strain_type=strain,
                        brand=current_brand or "House",
                    ))
                    i += 2
                    continue
            # Fallback: no recognizable price pattern followed — skip
            i += 1
            continue

        # 3. Name without strain suffix + THC% on line 2 + sizes/prices on 3/4
        #    e.g. "DURBAN POISON" / "18.7% THC" / "3.5G | 14G | 28G" / "65 | 215 | 375"
        if i + 3 < len(lines) and thc_line_re.match(lines[i + 1]):
            sizes_line = lines[i + 2]
            prices_line = lines[i + 3]
            if sizes_line_re.match(sizes_line) and prices_line_re.match(prices_line):
                name = line.strip().title()
                thc_m = thc_line_re.match(lines[i + 1])
                thc = f"{thc_m.group(1)}%"
                sizes = [s.strip() for s in sizes_line.split("|")]
                prices = [p.strip() for p in prices_line.split("|")]
                if len(sizes) == len(prices):
                    for sz, pr in zip(sizes, prices):
                        wm = WEIGHT_TIER_RE.search(sz)
                        pm = PRICE_RE.search(pr)
                        if wm and pm:
                            products.append(_product_entry(
                                name=name,
                                category="flower",
                                thc=thc,
                                price=float(pm.group(1)),
                                weight=f"{wm.group(1)}g",
                            ))
                    i += 4
                    continue

        # 4. Simple "NAME | PRICE" within current category
        m = name_price_re.match(line)
        if m:
            products.append(_product_entry(
                name=m.group(1).strip().title(),
                brand=current_brand or "House",
                category=current_cat,
                price=float(m.group(2)),
            ))
            i += 1
            continue

        # 5. Brand block heading — e.g. "ISLAND PEZI GRASSLANDZ 1G PRE ROLLS" on its own.
        # If line is short, no pipes, no prices, followed by NAME | PRICE lines, set brand.
        if (not re.search(r"\d", line)
                and "|" not in line
                and 2 <= len(line.split()) <= 8
                and i + 1 < len(lines)
                and name_price_re.match(lines[i + 1])):
            current_brand = line.strip().title()
            # Try to recategorize based on heading keywords
            up = line.upper()
            for marker, cat in CATEGORY_HEADERS:
                if marker in up:
                    current_cat = cat
                    break
            i += 1
            continue

        # Skip unrecognized
        i += 1

    return products


def main():
    try:
        html = fetch_menu()
    except Exception as e:
        print(f"Failed to fetch NativeCare menu: {e}", file=sys.stderr)
        return 1
    text = strip_html(html)
    products = parse_lines(text)

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUT_FILE, "w") as f:
        json.dump(products, f, indent=2)

    by_cat = {}
    for p in products:
        by_cat[p["category"]] = by_cat.get(p["category"], 0) + 1
    print(f"NativeCare scrape: {len(products)} products -> {OUT_FILE}")
    print(f"  By category: {by_cat}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
