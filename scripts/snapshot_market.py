#!/usr/bin/env python3
"""
Market snapshot: keep every price we ever see, per shop, forever.

WHY THIS EXISTS
price_history.json is not an archive. It keeps {date, price} per product NAME,
capped at 60 entries, with no shop dimension at all — so "who charged what,
when" is unanswerable, and anything past the cap is gone. Every platform feed
(full_menu_products.json, carrot_products.json, ...) is overwritten on each
cycle, so the raw record of a day's market lasts four hours.

This writes the thing that was missing: one immutable row per shop x product
x cycle, with the attributes that make it analysable later (brand, category,
weight, THC, platform). 11,876 rows a cycle, 186 KB gzipped.

WHERE IT GOES
  ~/tcc-archive/snapshots/YYYY/MM/YYYY-MM-DDTHH.jsonl.gz   every cycle, on the Pi
  scraper/data/snapshots/YYYY-MM-DD.jsonl.gz               once a day, in git

Every cycle stays on the Pi (~330 MB/year against 19 GB free) so intraday
moves — happy hours, flash drops, a shop repricing at noon — are not lost.
Git gets one file per day (~66 MB/year) so there is an off-machine copy that
survives the SD card. Writing the git copy on every cycle would put five
blobs a day in history and defeat the point.

Schema is append-only: add fields, never repurpose one, so a file written
today still parses in three years.

Run: python3 scripts/snapshot_market.py [--git-copy] [--archive DIR]
"""

import argparse
import gzip
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "scraper" / "data"
sys.path.insert(0, str(ROOT / "scraper"))
import raw_archive  # noqa: E402
REPO_SNAPSHOTS = DATA / "snapshots"
SCHEMA = 1

# Platform feed -> label. The label is recorded per row so a future question
# like "did Dutchie shops move faster than Jane shops" stays answerable.
FEEDS = [
    ("full_menu_products.json", "weedmaps"),
    ("carrot_products.json", "carrot"),
    ("dutchie_products.json", "dutchie"),
    ("jane_products.json", "jane"),
    ("blaze_products.json", "blaze"),
    ("treez_products.json", "treez"),
    ("dispensary_shop_products.json", "dispensary.shop"),
    ("sweed_products.json", "sweed"),
    ("meadow_products.json", "meadow"),
]


def _rows_from(path, platform):
    """Yield one row per shop x product. Feeds come in two shapes: grouped
    (a `prices` map of shop -> price) and flat (one row per shop already)."""
    try:
        blob = json.loads(path.read_text())
    except Exception:
        return
    items = blob if isinstance(blob, list) else (blob.get("products") or [])
    for r in items:
        if not isinstance(r, dict):
            continue
        base = {
            "name": (r.get("name") or "").strip(),
            "brand": (r.get("brand") or "").strip() or "House",
            "category": r.get("category") or "",
            "weight": r.get("weight") or "",
            "thc": r.get("thc") or "",
            "cbd": r.get("cbd") or "",
            "platform": platform,
        }
        if not base["name"]:
            continue
        prices = r.get("prices")
        if isinstance(prices, dict):
            for shop, price in prices.items():
                try:
                    p = float(price)
                except (TypeError, ValueError):
                    continue
                if p > 0:
                    yield dict(base, shop=shop, price=p)
        else:
            try:
                p = float(r.get("price"))
            except (TypeError, ValueError):
                continue
            shop = r.get("dispensary_id") or r.get("dispensary") or ""
            if p > 0 and shop:
                yield dict(base, shop=shop, price=p)


def collect():
    """Rows observed this cycle. A shop whose fetch failed is left out: its
    platform feed still holds the last good file (scrapers refuse to write an
    empty one), and archiving that again would record old prices as new."""
    failed = {s for s, r in raw_archive.cycle_status().items() if r.get("status") == "failed"}
    rows, per_platform = [], {}
    for fname, platform in FEEDS:
        path = DATA / fname
        if not path.exists():
            continue
        got = [r for r in _rows_from(path, platform) if r["shop"] not in failed]
        rows.extend(got)
        per_platform[platform] = len(got)
    return rows, per_platform, sorted(failed)


def write_gz(path, header, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = [json.dumps(header, separators=(",", ":"))]
    payload += [json.dumps(r, separators=(",", ":")) for r in rows]
    blob = ("\n".join(payload) + "\n").encode()
    # mtime=0 so an unchanged day's file is byte-identical and git sees no diff.
    with gzip.GzipFile(filename="", mode="wb", fileobj=open(path, "wb"), mtime=0) as f:
        f.write(blob)
    return path.stat().st_size


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--archive", default=os.environ.get("TCC_ARCHIVE_DIR",
                                                        str(Path.home() / "tcc-archive" / "snapshots")))
    ap.add_argument("--git-copy", action="store_true",
                    help="also write the daily copy into the repo (run on the last cycle of the day)")
    args = ap.parse_args()

    now = datetime.now(timezone.utc)
    rows, per_platform, failed = collect()
    if not rows:
        print("No feed rows found — refusing to write an empty snapshot")
        return 1

    shops = len({r["shop"] for r in rows})
    header = {
        "_schema": SCHEMA,
        "captured_at": now.isoformat(),
        "rows": len(rows),
        "shops": shops,
        "by_platform": per_platform,
        "not_observed": failed,
    }

    # Every cycle, on the Pi.
    # HHMM, not HH: a recovery run in the same hour must not overwrite the
    # scheduled run's snapshot (2026-09-24 20:10 was lost to the 20:55 rerun).
    cycle_path = Path(args.archive) / now.strftime("%Y/%m") / (now.strftime("%Y-%m-%dT%H%M") + ".jsonl.gz")
    size = write_gz(cycle_path, header, rows)
    print(f"Snapshot: {len(rows):,} rows from {shops} shops -> {cycle_path} ({size/1024:.0f} KB)")
    print(f"  by platform: {per_platform}")

    # Once a day, into the repo, so there is a copy off this machine.
    if args.git_copy:
        daily = REPO_SNAPSHOTS / (now.strftime("%Y-%m-%d") + ".jsonl.gz")
        write_gz(daily, header, rows)
        print(f"  git copy: {daily}")

    # A tiny index so the archive is browsable without unpacking anything.
    try:
        idx_path = Path(args.archive).parent / "index.jsonl"
        idx_path.parent.mkdir(parents=True, exist_ok=True)
        with open(idx_path, "a") as f:
            f.write(json.dumps({"file": str(cycle_path.relative_to(Path(args.archive))),
                                "captured_at": header["captured_at"],
                                "rows": header["rows"], "shops": shops,
                                "bytes": size}, separators=(",", ":")) + "\n")
    except Exception as e:
        print(f"  (index append skipped: {e})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
