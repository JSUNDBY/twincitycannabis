#!/usr/bin/env python3
"""
Menu-platform probe: when a shop's menu dies, find out where it went.

Shops change menu platform without telling anyone. The watchdog notices the
menu hit zero; until now that was a dead end and someone had to open the
shop's website by hand, read the page source, work out which platform it was,
and dig the identifier out. That is the single most repeated manual task on
this project (Irie, Great Cannabis, Levitated, Bloom, Legit all went this way).

This does that pass automatically, every cycle, for every shop with no menu:
fetch the site, fingerprint the platform, pull the identifier the scraper
needs, and report it. It never edits a scraper. It hands over a finding with
the exact value to paste, because adding a shop to the wrong scraper silently
publishes wrong prices, and that call stays human.

Output: scraper/data/menu_probe.json  (also alerts via the worker on change)
Run:    python3 scripts/probe_menus.py [--all] [--limit N]
"""

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent   # resolve(): node needs an absolute path
DATA_DIR = ROOT / "scraper" / "data"
OUT = DATA_DIR / "menu_probe.json"
DATA_JS = ROOT / "js" / "data.js"

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

# Paths a shop's menu tends to live behind, in the order worth trying.
MENU_PATHS = ["", "menu/", "shop/", "order/", "shop-online/", "menu", "shop"]

# Each platform: how to recognise it, and how to pull the value a scraper
# needs. Each extractor returns scraper-ready fields, or {} when the page
# names the platform but not the id.
def _first(pattern, html, group=1):
    m = re.search(pattern, html, re.I)
    return m.group(group) if m else None


def _ex_dutchie(h):
    # The 24-hex id in the embed loader IS the dispensaryId the API wants.
    v = _first(r"dutchie\.com/api/v\d/embedded-menu/([0-9a-f]{24})", h)
    if v:
        return {"dispensary_id": v}
    v = _first(r"dutchie\.com/(?:embedded-menu|dispensary)/([a-z0-9-]+)", h)
    return {"cname": v} if v else {}


def _ex_carrot(h):
    out = {}
    key = re.search(r"sp_[A-Za-z0-9]{16,}", h)
    if key:
        out["space_key"] = key.group(0)
    sid = _first(r"carrot-space-id['\"]?\s*[:=]\s*['\"]?(\d+)", h)
    if sid:
        out["space_id"] = sid
    if out:
        out["loc_id"] = _first(r"locId['\"]?\s*[:=]\s*['\"]?(\d+)", h) or "1"
    return out


def _ex_blaze(h):
    v = _first(r'"site"\s*:\s*\{\s*"id"\s*:\s*"([0-9a-f-]{36})"', h)
    if v:
        return {"site_uuid": v}
    m = re.search(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", h)
    return {"uuid_seen": m.group(0)} if m else {}


def _ex_treez(h):
    out = {}
    for field, pat in (
        ("subdomain", r"search-([a-z0-9-]+)\.gapcommerceapi\.com"),
        ("entity_id", r"mso_store_entity_id['\"]?\s*[:=]\s*['\"]([0-9a-f-]{36})"),
        ("org_id", r"mso_org_id['\"]?\s*[:=]\s*['\"]([0-9a-f-]{36})"),
    ):
        v = _first(pat, h)
        if v:
            out[field] = v
    return out


def _ex_dshop(h):
    m = re.search(r"[a-z0-9-]+\.dispensary\.shop", h, re.I)
    return {"hostname": m.group(0)} if m else {}


def _ex_sweed(h):
    v = _first(r'"storeId"\s*:\s*(\d+)', h)
    return {"store_id": v} if v else {}


def _ex_jane(h):
    v = _first(r"iheartjane\.com/(?:embed/)?stores?/(\d+)", h)
    return {"store_id": v} if v else {}


def _ex_none(h):
    return {}


PLATFORMS = [
    ("dutchie", re.compile(r"dutchie\.com|dutchie-embed", re.I), _ex_dutchie),
    ("carrot", re.compile(r"getcarrot\.io|carrot-space", re.I), _ex_carrot),
    ("blaze/tymber", re.compile(r"ecom-api\.blaze\.me|blaze\.me|tymber", re.I), _ex_blaze),
    ("treez/gapcommerce", re.compile(r"gapcommerceapi\.com|meet-treez|treez\.io", re.I), _ex_treez),
    ("dispensary.shop", re.compile(r"[a-z0-9-]+\.dispensary\.shop", re.I), _ex_dshop),
    ("sweed", re.compile(r"sweedpos|sweed\.", re.I), _ex_sweed),
    ("jane", re.compile(r"iheartjane\.com|jane-dispensary|embed\.iheartjane", re.I), _ex_jane),
    ("meadow", re.compile(r"getmeadow\.com|meadow-menu", re.I), _ex_none),
    ("leafly", re.compile(r"leafly\.com/(?:dispensary-info|embed)", re.I), _ex_none),
    ("dispense/alpineiq", re.compile(r"dispenseapp\.com|alpineiq", re.I), _ex_none),
    ("weedmaps", re.compile(r"weedmaps\.com/embed|weedmaps-menu", re.I), _ex_none),
]

# Platforms we already read. A shop landing on one of these is actionable
# today; anything else is a heads-up that a new integration would be needed.
SUPPORTED = {"dutchie", "carrot", "blaze/tymber", "treez/gapcommerce",
             "dispensary.shop", "sweed", "jane", "meadow", "weedmaps"}


def fetch(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(1_500_000).decode("utf-8", "ignore"), r.geturl()


def load_site():
    """Shops and their live product counts, straight from the built data.js."""
    import subprocess
    js = (
        "global.window={};require(%s);"
        "const T=window.TCC;const n={};"
        "T.products.forEach(p=>Object.entries(p.prices||{}).forEach(([k,v])=>{if(v>0)n[k]=(n[k]||0)+1}));"
        "console.log(JSON.stringify(T.dispensaries.map(d=>({id:d.id,name:d.name,website:d.website||'',count:n[d.id]||0}))));"
        % json.dumps(str(DATA_JS))
    )
    out = subprocess.run(["node", "-e", js], capture_output=True, text=True, timeout=180)
    if out.returncode != 0:
        print("could not read data.js:", out.stderr.strip()[:200])
        return []
    return json.loads(out.stdout)


def probe(shop):
    """Try the shop's site for a recognisable menu platform."""
    site = (shop.get("website") or "").strip()
    if not site:
        return {"status": "no-website"}
    if not site.startswith("http"):
        site = "https://" + site
    base = site.rstrip("/") + "/"

    seen_error = None
    for path in MENU_PATHS:
        url = base + path
        try:
            html, final = fetch(url)
        except urllib.error.HTTPError as e:
            seen_error = f"HTTP {e.code}"
            continue
        except Exception as e:
            seen_error = type(e).__name__
            continue

        for name, pattern, extract in PLATFORMS:
            if not pattern.search(html):
                continue
            try:
                fields = extract(html) or {}
            except Exception:
                fields = {}
            return {
                "status": "found",
                "platform": name,
                "supported": name in SUPPORTED,
                "identifiers": fields,
                "found_at": final,
            }
        time.sleep(0.4)

    return {"status": "no-platform-detected", "error": seen_error, "site": base}


def alert(text):
    url = os.environ.get("TCC_ALERT_URL")
    token = os.environ.get("TCC_ALERT_TOKEN")
    if not url or not token:
        print("(no alert env — printing only)")
        return
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps({"source": "menu-probe", "text": text}).encode(),
            headers={"Content-Type": "application/json", "x-alert-token": token,
                     # Cloudflare 403s the default Python agent.
                     "User-Agent": "TCC-menu-probe/1.0 (+https://twincitycannabis.com)"},
        )
        urllib.request.urlopen(req, timeout=20)
        print("Probe findings emailed.")
    except Exception as e:
        print(f"!!! PROBE ALERT POST FAILED — nobody was told: {e}")


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true", help="probe every shop, not just menu-less ones")
    ap.add_argument("--limit", type=int, default=25, help="max shops to probe in one run")
    args = ap.parse_args()

    shops = load_site()
    if not shops:
        return
    targets = [s for s in shops if (args.all or s["count"] == 0) and s.get("website")]
    targets.sort(key=lambda s: s["name"])
    targets = targets[: args.limit]
    print(f"Probing {len(targets)} shop(s) with no menu (of {len(shops)} listed)")

    prev = {}
    try:
        prev = {r["id"]: r for r in json.loads(OUT.read_text()).get("shops", [])}
    except Exception:
        pass

    results, fresh_finds = [], []
    for s in targets:
        r = probe(s)
        r.update(id=s["id"], name=s["name"], website=s.get("website", ""),
                 checked=date.today().isoformat())
        results.append(r)
        mark = r.get("platform") or r["status"]
        print(f"  {s['name'][:38]:40} {mark}"
              + (f"  {r.get('identifiers')}" if r.get("identifiers") else ""))
        # Only shout about a platform we can actually act on, and only the
        # first time we see it, so this never becomes daily noise.
        was = prev.get(s["id"], {})
        if (r["status"] == "found" and r.get("supported")
                and (was.get("platform") != r.get("platform")
                     or was.get("identifiers") != r.get("identifiers"))):
            fresh_finds.append(r)

    OUT.write_text(json.dumps(
        {"generated_at": datetime.utcnow().isoformat() + "Z", "shops": results}, indent=1))
    print(f"Wrote {OUT}")

    if fresh_finds:
        lines = ["Shops with no menu that look scrapeable — platform found on their own site:", ""]
        for r in fresh_finds:
            ids = ", ".join(f"{k}={v}" for k, v in (r.get("identifiers") or {}).items()) or "(no id extracted)"
            lines += [f"{r['name']} ({r['id']})",
                      f"  platform: {r['platform']}",
                      f"  {ids}",
                      f"  seen at: {r.get('found_at','')}", ""]
        lines.append("Add to the matching scraper's store list, then run one cycle and check the count.")
        alert("\n".join(lines))
    else:
        print("No new actionable platform found this run.")


if __name__ == "__main__":
    main()
