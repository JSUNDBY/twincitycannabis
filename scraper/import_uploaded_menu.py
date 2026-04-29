#!/usr/bin/env python3
"""
Twin City Cannabis — uploaded menu importer

Pulls pending menu uploads from the Cloudflare KV namespace (submitted
by dispensary owners via the /menu-upload form), parses them as CSV,
and merges into TCC.products with id prefix 'u####' (user-uploaded).

Pending uploads live at KV keys `menu-upload:<slug>:<timestamp>`. An
index of submissions is kept at `index:menu-uploads`. After import,
each submission is marked `processed=true` in the index so we don't
re-import on subsequent runs.

Run interactively (review prompts before each import):
    python3 scraper/import_uploaded_menu.py

Or auto-import everything pending without prompts:
    python3 scraper/import_uploaded_menu.py --yes

Required env vars (or pass via --token):
    CLOUDFLARE_API_TOKEN   — needs Workers KV Storage:Read+Write

Account / namespace IDs are wired in below to match the rest of the
TCC tooling. Update if you ever rotate KV namespaces.
"""

import argparse
import csv
import io
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

ACCOUNT_ID = "0672ae6f0ce7a86086cafbcba03ed68f"
KV_NAMESPACE_ID = "71b77df77ea74522ab66c82e20cc9339"
INDEX_KEY = "index:menu-uploads"

REPO_ROOT = Path(__file__).parent.parent
DATA_JS = REPO_ROOT / "js" / "data.js"

sys.path.insert(0, str(Path(__file__).parent))
from normalize import categorize_by_name  # noqa: E402
from merge_jane_data import _strip_entries_with_id_prefix  # noqa: E402

ID_PREFIX = "u"


def kv_url(suffix=""):
    base = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/storage/kv/namespaces/{KV_NAMESPACE_ID}"
    return base + suffix


def http(method, url, token, body=None, raw=False):
    req = urllib.request.Request(url, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    if body is not None:
        if isinstance(body, (dict, list)):
            data = json.dumps(body).encode()
            req.add_header("Content-Type", "application/json")
        else:
            data = body if isinstance(body, bytes) else body.encode()
        req.data = data
    with urllib.request.urlopen(req, timeout=30) as r:
        body = r.read()
    return body if raw else json.loads(body)


def list_pending(token):
    idx = http("GET", kv_url(f"/values/{urllib.parse.quote(INDEX_KEY, safe='')}"),
               token, raw=True)
    if not idx:
        return []
    try:
        items = json.loads(idx)
    except Exception:
        return []
    return [i for i in items if not i.get("processed")]


def fetch_submission(token, key):
    raw = http("GET", kv_url(f"/values/{urllib.parse.quote(key, safe='')}"),
               token, raw=True)
    return json.loads(raw) if raw else None


def mark_processed(token, key):
    raw = http("GET", kv_url(f"/values/{urllib.parse.quote(INDEX_KEY, safe='')}"),
               token, raw=True)
    items = json.loads(raw) if raw else []
    for item in items:
        if item.get("key") == key:
            item["processed"] = True
            item["processed_at"] = datetime.utcnow().isoformat() + "Z"
    http("PUT", kv_url(f"/values/{urllib.parse.quote(INDEX_KEY, safe='')}"),
         token, body=json.dumps(items))


# ─── CSV parsing ──────────────────────────────────────────────────────────
EXPECTED_COLUMNS = {"name", "brand", "category", "weight", "thc", "cbd",
                    "price", "image_url", "description"}


def parse_csv(text):
    """Robust CSV parser: tolerates Tab-separated input, BOM, and column
    name variants (e.g. 'price_each' → 'price')."""
    text = text.lstrip("﻿")
    sample = text[:1024]
    delim = "\t" if "\t" in sample and sample.count("\t") > sample.count(",") else ","
    reader = csv.DictReader(io.StringIO(text), delimiter=delim)
    rows = []
    for row in reader:
        normalized = {}
        for k, v in row.items():
            if not k:
                continue
            key = k.strip().lower().replace(" ", "_")
            # Common synonyms
            key = {"img": "image_url", "image": "image_url", "photo": "image_url",
                   "picture": "image_url", "price_each": "price",
                   "size": "weight", "amount": "weight",
                   "thc_pct": "thc", "thc_percent": "thc",
                   "cbd_pct": "cbd", "cbd_percent": "cbd"}.get(key, key)
            normalized[key] = (v or "").strip()
        if normalized.get("name"):
            rows.append(normalized)
    return rows


def normalize_row(row, dispensary_id):
    name = row.get("name", "")
    brand = row.get("brand", "") or "House"
    raw_cat = (row.get("category", "") or "").lower()
    weight = row.get("weight", "")
    thc = row.get("thc", "")
    cbd = row.get("cbd", "")
    image = row.get("image_url", "")
    price_str = (row.get("price", "") or "").strip()
    price = None
    if price_str:
        m = re.search(r"[\d.]+", price_str.replace(",", ""))
        if m:
            try:
                price = round(float(m.group()), 2)
            except ValueError:
                price = None
    if not name or price is None or price <= 0:
        return None

    cat = categorize_by_name(name, brand, raw_cat)
    valid = ("flower", "pre-roll", "cartridge", "edible", "concentrate",
             "topical", "tincture", "beverage")
    if cat == "EXCLUDE" or cat not in valid:
        return None

    return {
        "dispensary_id": dispensary_id,
        "name": name,
        "brand": brand,
        "category": cat,
        "weight": weight,
        "thc": thc,
        "cbd": cbd,
        "image": image,
        "price": price,
    }


def merge_into_data_js(submissions):
    """submissions: list of (slug, list_of_normalized_rows)"""
    if not submissions:
        return 0
    content = DATA_JS.read_text()
    m = re.search(r"TCC\.products\s*=\s*\[", content)
    if not m:
        print("Could not find TCC.products in data.js", file=sys.stderr)
        return 0
    start = m.end()
    depth, pos = 1, start
    while depth > 0 and pos < len(content):
        if content[pos] == "[":
            depth += 1
        elif content[pos] == "]":
            depth -= 1
        pos += 1
    end = pos - 1
    products_text = content[start:end]

    products_text, removed = _strip_entries_with_id_prefix(products_text, ID_PREFIX)
    if removed:
        print(f"Stripped {removed} prior u#### entries before re-adding")

    # Group by name+brand+weight across submissions for multi-shop pricing
    grouped = {}
    for slug, rows in submissions:
        for r in rows:
            key = f"{r['name']}|||{r['brand']}|||{r['weight']}"
            if key not in grouped:
                grouped[key] = {
                    "name": r["name"], "brand": r["brand"],
                    "category": r["category"], "weight": r["weight"],
                    "thc": r["thc"], "cbd": r["cbd"],
                    "image": r["image"], "prices": {},
                }
            grouped[key]["prices"][r["dispensary_id"]] = r["price"]

    new_entries = []
    for p in grouped.values():
        if not p["prices"]:
            continue
        prices_js = ", ".join(f"'{k}': {v}" for k, v in sorted(p["prices"].items()))
        low = min(p["prices"].values())
        history = [low] * 8
        ne = (
            p["name"].replace("\\", "\\\\").replace("'", "\\'"),
            p["brand"].replace("\\", "\\\\").replace("'", "\\'"),
            (p["image"] or "").replace('"', '\\"'),
        )
        entry = (
            f"{{ id: '{ID_PREFIX}{len(new_entries):04d}', "
            f"name: '{ne[0]}', brand: '{ne[1]}', "
            f"category: '{p['category']}', strain: null, "
            f"weight: '{p['weight']}', "
            f"thc: '{p.get('thc','')}', cbd: '{p.get('cbd','')}',\n"
            f"      image: \"{ne[2]}\",\n"
            f"      prices: {{ {prices_js} }},\n"
            f"      priceHistory: {json.dumps(history)} }}"
        )
        new_entries.append(entry)

    if new_entries:
        block = ",\n".join(new_entries)
        new_products = products_text.rstrip().rstrip(",") + ",\n" + block + "\n"
        content = content[:start] + new_products + content[end:]
        DATA_JS.write_text(content)
    return len(new_entries)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--token", help="Cloudflare API token (else from CLOUDFLARE_API_TOKEN env)")
    ap.add_argument("--yes", "-y", action="store_true", help="Auto-import without prompting")
    ap.add_argument("--dry-run", action="store_true", help="Parse + show; don't write data.js")
    args = ap.parse_args()

    token = args.token or os.environ.get("CLOUDFLARE_API_TOKEN")
    if not token:
        print("Need CLOUDFLARE_API_TOKEN env var or --token flag", file=sys.stderr)
        return 1

    pending = list_pending(token)
    print(f"Pending menu uploads: {len(pending)}")
    if not pending:
        return 0

    accepted = []
    for item in pending:
        sub = fetch_submission(token, item["key"])
        if not sub:
            print(f"  ! could not fetch {item['key']}, skipping")
            continue
        rows = parse_csv(sub.get("menu_text", ""))
        normalized = []
        for r in rows:
            n = normalize_row(r, sub["slug"])
            if n:
                normalized.append(n)
        print(f"\n=== {sub['slug']} (submitted {sub.get('submitted_at', '?')}) ===")
        print(f"  by: {sub.get('contact','')} <{sub.get('email','')}>")
        if sub.get("notes"):
            print(f"  notes: {sub['notes'][:200]}")
        print(f"  parsed {len(rows)} CSV rows → {len(normalized)} valid cannabis products")
        if normalized:
            for r in normalized[:3]:
                print(f"    - {r['category']:10s}  {r['brand']:18s}  {r['name'][:40]:40s}  ${r['price']}")
            if len(normalized) > 3:
                print(f"    ... and {len(normalized) - 3} more")
        if not normalized:
            print("  no valid rows — skipping (re-fetch via Cloudflare dashboard if you want to inspect)")
            continue

        if args.yes or args.dry_run:
            ok = True
        else:
            resp = input("  Import this? [y/N/email-back] ").strip().lower()
            ok = resp in ("y", "yes")
            if resp.startswith("e"):
                print(f"  Reply with: \"hello@twincitycannabis.com → {sub.get('email')}\" — open mail client manually")
                continue

        if ok:
            accepted.append((sub["slug"], normalized))
            if not args.dry_run:
                mark_processed(token, item["key"])

    if args.dry_run:
        total = sum(len(rows) for _, rows in accepted)
        print(f"\n[dry-run] would import {total} products from {len(accepted)} submissions")
        return 0

    added = merge_into_data_js(accepted)
    print(f"\nMerged {added} products into js/data.js (from {len(accepted)} submissions)")
    if added:
        print("Next: python3 scraper/update_site.py && node scripts/build_seo.js && git add -A && git commit && git push")
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
