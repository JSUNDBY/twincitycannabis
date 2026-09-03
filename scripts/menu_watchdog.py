#!/usr/bin/env python3
"""
Menu-death watchdog. Every scrape cycle, compare each shop's product count
against the previous cycle. A shop that drops to zero (or loses >80% of a
meaningful menu) is exactly how we silently lost Verist, Legit, Green
Goods, RISE, and Green Rose when they left Weedmaps — this makes the next
one surface itself within hours instead of whenever Josh happens to look.

Writes scraper/data/shop_counts.json (the rolling snapshot) and, when
something dies, scraper/data/menu_alerts.json + a loud log line the
weekly engine and any human reading the cron log will see.
"""

import json
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).parent.parent
SNAPSHOT = ROOT / "scraper" / "data" / "shop_counts.json"
ALERTS = ROOT / "scraper" / "data" / "menu_alerts.json"


def current_counts():
    out = subprocess.run(
        ["node", "-e", """
global.window={};require('%s/js/data.js');
const T=window.TCC;const c={};
T.dispensaries.forEach(d=>{c[d.id]=T.products.filter(p=>p.prices&&p.prices[d.id]!=null).length});
console.log(JSON.stringify(c));
""" % ROOT],
        capture_output=True, text=True, timeout=120,
    )
    return json.loads(out.stdout.strip())


def main():
    counts = current_counts()
    prev = json.loads(SNAPSHOT.read_text()) if SNAPSHOT.exists() else {}
    prev_counts = prev.get("counts", {})

    alerts = []
    for shop, before in prev_counts.items():
        after = counts.get(shop, 0)
        if before >= 10 and after == 0:
            alerts.append({"shop": shop, "before": before, "after": after,
                           "kind": "MENU DIED"})
        elif before >= 20 and after < before * 0.2:
            alerts.append({"shop": shop, "before": before, "after": after,
                           "kind": "MENU COLLAPSED"})

    SNAPSHOT.write_text(json.dumps({
        "date": date.today().isoformat(),
        "counts": counts,
    }, indent=0))

    if alerts:
        existing = json.loads(ALERTS.read_text()) if ALERTS.exists() else []
        for a in alerts:
            a["date"] = date.today().isoformat()
            print(f"🚨 MENU WATCHDOG: {a['kind']} — {a['shop']} "
                  f"({a['before']} -> {a['after']} products). "
                  f"Likely left its menu platform; probe their website.")
        ALERTS.write_text(json.dumps((alerts + existing)[:50], indent=1))
    else:
        print(f"Menu watchdog: {sum(1 for v in counts.values() if v > 0)} shops "
              f"with menus, no deaths.")


if __name__ == "__main__":
    main()
