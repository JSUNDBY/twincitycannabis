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


def _post_alert(alerts):
    """Push alerts to hello@ via the worker /alert endpoint. A cron log
    nobody reads is a silent store — the 2026-09-11 Dutchie wipe sat
    unseen for three cycles. Non-fatal: env vars come from
    /etc/tcc-scrape.env on the Pi; missing means log-only."""
    import os
    import urllib.request
    url = os.environ.get("TCC_ALERT_URL")
    token = os.environ.get("TCC_ALERT_TOKEN")
    if not url or not token:
        return
    text = "\n".join(
        f"{a['kind']}: {a['shop']} ({a['before']} -> {a['after']} products)"
        for a in alerts
    ) + "\n\nLikely left its menu platform; probe the shop's website for a new menu system."
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps({"source": "menu-watchdog", "text": text}).encode(),
            headers={"Content-Type": "application/json", "x-alert-token": token},
        )
        urllib.request.urlopen(req, timeout=15)
        print("Watchdog alert emailed via worker /alert")
    except Exception as e:  # never kill the scrape over a notification
        print(f"Watchdog alert POST failed (non-fatal): {e}")


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
        _post_alert(alerts)
    else:
        print(f"Menu watchdog: {sum(1 for v in counts.values() if v > 0)} shops "
              f"with menus, no deaths.")


if __name__ == "__main__":
    main()
