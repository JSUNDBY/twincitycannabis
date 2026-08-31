#!/usr/bin/env python3
"""
Aggregate scraper/data/price_history.json (per-product daily price records,
kept since 2026-04-26) into weekly category medians for the
/minnesota-price-trends/ page.

Runs in auto_scrape.sh just before build_seo.js. Output is small:
scraper/data/price_trends.json  {weeks: [...], series: {...}, meta: {...}}

Method, so the page can describe itself honestly:
  - Each product's category is inferred from its name with the same
    normalize.categorize_by_name used sitewide; junk/accessories drop out.
  - For each product and ISO week, the median of that week's observations
    counts once — so a product scraped five times a day doesn't outvote one
    scraped daily.
  - The weekly series value is the median across products, with the same
    price sanity caps used elsewhere on the site.
  - Flower is tracked as the 3.5g eighth (the anchor unit); other
    categories as listed unit price.
"""

import json
import re
import sys
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path
from statistics import median

sys.path.insert(0, str(Path(__file__).parent.parent / "scraper"))
from normalize import categorize_by_name

ROOT = Path(__file__).parent.parent
HISTORY = ROOT / "scraper" / "data" / "price_history.json"
OUT = ROOT / "scraper" / "data" / "price_trends.json"

# (series key, label, price cap) — flower_eighth is weight-gated separately.
SERIES = {
    "flower_eighth": ("Flower (3.5g eighth)", 150),
    "cartridge": ("Vape cartridges", 120),
    "edible": ("Edibles", 100),
    "pre-roll": ("Pre-rolls", 80),
}

GRAMS_RE = re.compile(r"([\d.]+)\s*g\b")


def week_start(d):
    return d - timedelta(days=d.weekday())


def grams_from_name(name):
    m = GRAMS_RE.search(name)
    if m:
        return float(m.group(1))
    if re.search(r"1/8|eighth", name):
        return 3.5
    return None


def main():
    history = json.loads(HISTORY.read_text())
    # product -> week -> [prices]
    buckets = defaultdict(lambda: defaultdict(list))

    kept = skipped = 0
    for key, rec in history.items():
        name = rec.get("name") or key
        cat = categorize_by_name(name, "", "")
        if cat in (None, "EXCLUDE"):
            skipped += 1
            continue
        if cat == "flower":
            if grams_from_name(key) != 3.5:
                continue  # eighths only — the comparable unit
            series = "flower_eighth"
        elif cat in SERIES:
            series = cat
        else:
            continue
        cap = SERIES[series][1]
        kept += 1
        for e in rec.get("entries") or []:
            try:
                d = date.fromisoformat(e["date"])
                p = float(e["price"])
            except (KeyError, ValueError, TypeError):
                continue
            if not (0 < p <= cap):
                continue
            buckets[(series, key)][week_start(d)].append(p)

    # week -> series -> [one median per product]
    weekly = defaultdict(lambda: defaultdict(list))
    for (series, key), weeks in buckets.items():
        for wk, prices in weeks.items():
            weekly[wk][series].append(median(prices))

    all_weeks = sorted(weekly.keys())
    if not all_weeks:
        print("No usable history — not writing trends file")
        raise SystemExit(1)

    out_series = {}
    for skey, (label, _cap) in SERIES.items():
        pts = []
        for wk in all_weeks:
            vals = weekly[wk].get(skey) or []
            pts.append({
                "week": wk.isoformat(),
                "med": round(median(vals), 2) if vals else None,
                "n": len(vals),
            })
        out_series[skey] = {"label": label, "points": pts}

    OUT.write_text(json.dumps({
        "generated": date.today().isoformat(),
        "first_week": all_weeks[0].isoformat(),
        "last_week": all_weeks[-1].isoformat(),
        "products_used": kept,
        "products_skipped": skipped,
        "series": out_series,
    }, indent=1))
    print(f"Wrote {OUT.name}: {len(all_weeks)} weeks, {kept} products used, {skipped} skipped")
    for skey, s in out_series.items():
        first = next((p for p in s["points"] if p["med"]), None)
        last = next((p for p in reversed(s["points"]) if p["med"]), None)
        if first and last:
            print(f"  {skey}: {first['week']} ${first['med']} (n={first['n']}) -> {last['week']} ${last['med']} (n={last['n']})")


if __name__ == "__main__":
    main()
