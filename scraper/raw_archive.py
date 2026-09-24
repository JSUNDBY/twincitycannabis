"""
Raw platform responses, kept as the platform sent them.

WHY THIS EXISTS
scripts/snapshot_market.py archives rows AFTER normalize.py has categorised
them, so a wrong classifier writes the wrong answer into the archive and the
original is gone. This keeps the item objects each platform returned, before
any renaming, re-categorising or junk filtering, so a future classifier can be
replayed over any past cycle and a disputed listing can be checked against
what the shop's menu actually said.

WHERE IT GOES
  ~/tcc-archive/raw/YYYY/MM/DD/<cycle>/<platform>.jsonl.gz

One line per shop per fetch: {"shop", "platform", "at", "items": [...]}.
<cycle> is TCC_CYCLE_ID (set once by auto_scrape.sh, so all nine platforms
of one cycle land in one folder), falling back to the current HHMM.
scripts/prune_raw_archive.py keeps every cycle for 14 days, then only the
last cycle of each day.

Never raises: losing a raw copy must not cost a scrape.
"""

import gzip
import json
import os
from datetime import datetime, timezone
from pathlib import Path

RAW = Path(os.environ.get("TCC_RAW_DIR", str(Path.home() / "tcc-archive" / "raw")))


def _cycle_dir():
    now = datetime.now(timezone.utc)
    cycle = os.environ.get("TCC_CYCLE_ID") or now.strftime("%Y-%m-%dT%H%M")
    day = cycle[:10] if len(cycle) >= 10 else now.strftime("%Y-%m-%d")
    y, m, d = day.split("-")
    return RAW / y / m / d / cycle


def record(platform, shop, items, status="ok", expected=None):
    """Append one shop's raw items for this cycle. Items must be JSON-able.

    status says how the fetch ended, so "the shop has 0 items" and "we failed
    to read the shop" stop looking the same downstream:
      ok       every page came back
      partial  some pages came back, then an error or a short count
      failed   nothing usable came back (block, timeout, parse error)
    The publish gate (scripts/publish_gate.py) holds a shop's previous menu
    when its status is partial or failed, whatever the item count says.
    """
    if os.environ.get("TCC_RAW_ARCHIVE") == "0":
        return
    try:
        cycle = _cycle_dir()
        cycle.mkdir(parents=True, exist_ok=True)
        at = datetime.now(timezone.utc).isoformat(timespec="seconds")
        line = json.dumps({"shop": shop, "platform": platform, "at": at,
                           "status": status, "items": items},
                          separators=(",", ":"), default=str)
        # "at" mode appends a new gzip member; readers handle multi-member files.
        with gzip.open(cycle / f"{platform}.jsonl.gz", "at", encoding="utf-8") as f:
            f.write(line + "\n")
        with open(cycle / "status.jsonl", "a") as f:
            f.write(json.dumps({"shop": shop, "platform": platform, "at": at,
                                "status": status, "got": len(items),
                                "expected": expected}) + "\n")
    except Exception as e:
        print(f"  (raw archive skipped for {platform}/{shop}: {e})")


_RANK = {"ok": 0, "partial": 1, "failed": 2}


def cycle_status():
    """{shop: {platform, status, got}} for the current cycle.

    A shop fetched more than once (Jane rec + med) keeps its worst status, so
    one failed half is never hidden by a good other half."""
    out = {}
    try:
        with open(_cycle_dir() / "status.jsonl") as f:
            for line in f:
                r = json.loads(line)
                cur = out.get(r["shop"])
                if cur is None:
                    out[r["shop"]] = r
                    continue
                cur["got"] = (cur.get("got") or 0) + (r.get("got") or 0)
                if _RANK.get(r["status"], 2) > _RANK.get(cur["status"], 2):
                    cur["status"] = r["status"]
    except Exception:
        pass
    return out
