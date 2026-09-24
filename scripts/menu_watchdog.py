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


def _post_alert_text(body):
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
    text = body
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps({"source": "menu-watchdog", "text": text}).encode(),
            # Cloudflare 403s the default "Python-urllib/3.x" agent, so every
            # menu-death alert this script ever sent was rejected at the edge
            # and logged as non-fatal. Found 2026-09-24. curl was unaffected,
            # which is why the bash alerts in auto_scrape.sh kept working.
            headers={"Content-Type": "application/json", "x-alert-token": token,
                     "User-Agent": "TCC-menu-watchdog/1.0 (+https://twincitycannabis.com)"},
        )
        urllib.request.urlopen(req, timeout=15)
        print("Watchdog alert emailed via worker /alert")
    except Exception as e:  # never kill the scrape over a notification
        # Loud on purpose: this is the notification path itself failing.
        print(f"!!! WATCHDOG ALERT POST FAILED — nobody was told: {e}")


def main():
    counts = current_counts()
    state = json.loads(SNAPSHOT.read_text()) if SNAPSHOT.exists() else {}
    baseline = state.get("counts", {})
    # Shops already known to be down: {shop: {"since": date, "told": date, "was": n}}
    down = state.get("down", {})
    today = date.today().isoformat()

    def days_since(d):
        try:
            return (date.today() - date.fromisoformat(d)).days
        except Exception:
            return 999

    new_deaths, recoveries, still_down = [], [], []

    for shop, before in baseline.items():
        after = counts.get(shop, 0)
        died = (before >= 10 and after == 0)
        collapsed = (before >= 20 and after < before * 0.2)
        if not (died or collapsed):
            continue
        kind = "MENU DIED" if died else "MENU COLLAPSED"
        if shop in down:
            # Already reported. Say it again at most weekly, so a shop that
            # is genuinely gone does not alert five times a day forever —
            # that is how a real alert becomes something you ignore.
            if days_since(down[shop].get("told", "1970-01-01")) >= 7:
                still_down.append({"shop": shop, "before": down[shop].get("was", before),
                                   "after": after, "kind": kind + " (still)",
                                   "since": down[shop].get("since", today)})
                down[shop]["told"] = today
        else:
            new_deaths.append({"shop": shop, "before": before, "after": after, "kind": kind})
            down[shop] = {"since": today, "told": today, "was": before}

    # Recovery is news too, and it is the signal that says stop looking.
    for shop in list(down):
        if counts.get(shop, 0) > 0:
            recoveries.append({"shop": shop, "after": counts[shop],
                               "since": down[shop].get("since", "?"),
                               "was": down[shop].get("was", 0)})
            del down[shop]

    # Baseline: advance every healthy shop, but hold the last good count for
    # shops that are down so a recovery is still measurable against it.
    merged = dict(baseline)
    for shop, c in counts.items():
        if c > 0 or shop not in down:
            merged[shop] = c
    for shop, info in down.items():
        merged[shop] = info.get("was", baseline.get(shop, 0))

    SNAPSHOT.write_text(json.dumps(
        {"date": today, "counts": merged, "down": down}, indent=0))

    alerts = new_deaths + still_down
    if alerts or recoveries:
        if alerts:
            existing = json.loads(ALERTS.read_text()) if ALERTS.exists() else []
            for a in alerts:
                a["date"] = today
                print(f"\U0001f6a8 MENU WATCHDOG: {a['kind']} \u2014 {a['shop']} "
                      f"({a['before']} -> {a['after']} products).")
            ALERTS.write_text(json.dumps((alerts + existing)[:50], indent=1))
        for r in recoveries:
            print(f"\u2705 RECOVERED: {r['shop']} is back ({r['after']} products, "
                  f"down since {r['since']}).")
        lines = []
        if new_deaths:
            lines.append("Menus that just went dark:")
            lines += [f"  {a['shop']}: {a['before']} -> 0" for a in new_deaths]
            lines.append("")
            lines.append("Check scraper/data/menu_probe.json — the nightly probe may "
                         "already have found where they moved.")
        if still_down:
            lines.append("")
            lines.append("Still down (weekly reminder, not a new failure):")
            lines += [f"  {a['shop']}: dark since {a['since']}" for a in still_down]
        if recoveries:
            lines.append("")
            lines.append("Back up:")
            lines += [f"  {r['shop']}: {r['after']} products" for r in recoveries]
        _post_alert_text("\n".join(lines))
    else:
        live = sum(1 for v in counts.values() if v > 0)
        quiet = f", {len(down)} known down" if down else ""
        print(f"Menu watchdog: {live} shops with menus, no new deaths{quiet}.")


if __name__ == "__main__":
    main()
