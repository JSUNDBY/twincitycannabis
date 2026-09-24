#!/usr/bin/env python3
"""
Keep the raw platform archive (scraper/raw_archive.py) inside the Pi's disk.

Raw responses run several MB a cycle, five cycles a day, which would fill the
SD card in about a year. Normalized rows are already kept for every cycle by
snapshot_market.py; raw copies exist so a classifier can be replayed, and one
cycle a day is enough for that.

  last 14 days   every cycle kept
  older          only the last cycle of each day kept

Exits 2 when the disk has under 2 GB free, so auto_scrape.sh can alert.

Run: python3 scripts/prune_raw_archive.py [--dry-run]
"""

import argparse
import os
import shutil
from datetime import date, timedelta
from pathlib import Path

RAW = Path(os.environ.get("TCC_RAW_DIR", str(Path.home() / "tcc-archive" / "raw")))
KEEP_ALL_DAYS = 14


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    if not RAW.exists():
        print(f"No raw archive at {RAW}")
        return
    cutoff = date.today() - timedelta(days=KEEP_ALL_DAYS)
    removed, freed = 0, 0
    for day_dir in sorted(RAW.glob("*/*/*")):
        try:
            y, m, d = day_dir.parts[-3:]
            day = date(int(y), int(m), int(d))
        except ValueError:
            continue
        if day >= cutoff:
            continue
        cycles = sorted(p for p in day_dir.iterdir() if p.is_dir())
        for c in cycles[:-1]:  # keep the last cycle of the day
            size = sum(f.stat().st_size for f in c.rglob("*") if f.is_file())
            print(f"{'would remove' if args.dry_run else 'removing'} {c} ({size/1e6:.1f} MB)")
            if not args.dry_run:
                shutil.rmtree(c)
            removed += 1
            freed += size
    total = sum(f.stat().st_size for f in RAW.rglob("*") if f.is_file())
    free = shutil.disk_usage(RAW).free
    print(f"Raw archive: {total/1e6:.0f} MB kept, {removed} old cycle(s) pruned "
          f"({freed/1e6:.0f} MB), {free/1e9:.1f} GB free on disk")
    if free < 2e9:
        print("!!! LOW DISK: under 2 GB free")
        raise SystemExit(2)


if __name__ == "__main__":
    main()
