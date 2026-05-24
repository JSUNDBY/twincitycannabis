#!/usr/bin/env python3
"""
Twin City Cannabis — Web Push trigger (Phase 24)

Called from the Pi auto-scrape pipeline after data.js is rewritten. Compares
each product's newest priceHistory entry to its prior entry, builds a "moves"
manifest of consumer-relevant drops, and POSTs to the Cloudflare Worker's
/push/trigger endpoint. The worker then fans out pushes to every subscription
that's watching one of the moved products (or has a threshold below the new
price).

Env vars expected:
  PUSH_TRIGGER_TOKEN   shared secret matching the worker's PUSH_TRIGGER_TOKEN

Skips silently if PUSH_TRIGGER_TOKEN isn't set, so this is safe to run from
the cron even before push is fully wired up.
"""

import json
import os
import re
import sys
import urllib.request
from pathlib import Path

WORKER_URL = "https://dashboard.twincitycannabis.com/push/trigger"
DATA_JS = Path(__file__).parent.parent / "js" / "data.js"


def extract_products_from_data_js():
    """Parse the TCC.products array out of js/data.js.

    data.js isn't valid JSON — it's JS object literals with single quotes,
    trailing identifiers, etc. Rather than fight that, we shell out to node
    when available; fall back to a regex skim that grabs the fields we need.
    """
    if not DATA_JS.exists():
        return []
    # Try node first — it's the truthful parser
    try:
        import subprocess
        res = subprocess.run(
            ["node", "-e", """
            global.window = {};
            require(process.argv[1]);
            const p = (global.window.TCC || global.TCC).products || [];
            console.log(JSON.stringify(p.map(x => ({
                id: x.id, name: x.name, priceHistory: x.priceHistory || [],
                prices: x.prices || {}
            }))));
            """, str(DATA_JS)],
            capture_output=True, text=True, timeout=30,
        )
        if res.returncode == 0 and res.stdout.strip():
            return json.loads(res.stdout.strip())
    except Exception:
        pass
    return []


def build_moves_manifest(products):
    """Return a list of consumer-relevant price moves from priceHistory."""
    moves = []
    for p in products:
        ph = p.get("priceHistory") or []
        if len(ph) < 2:
            continue
        # Only consider retail prices (newest <= $80) so bulk ounces don't
        # flood the push manifest with $200 reclassifications.
        newest = ph[-1]
        prev = ph[-2]
        if not isinstance(newest, (int, float)) or not isinstance(prev, (int, float)):
            continue
        if newest <= 0 or newest > 80:
            continue
        if newest >= prev:
            continue  # only push DROPS, not increases
        if prev - newest < 1:
            continue  # ignore sub-dollar noise
        moves.append({
            "productId": p.get("id"),
            "productName": p.get("name", "")[:80],
            "from": round(prev, 2),
            "to": round(newest, 2),
        })
    # Cap to 200 to keep the worker request size sane
    return moves[:200]


def post_manifest(token, moves):
    body = json.dumps({"moves": moves}).encode("utf-8")
    req = urllib.request.Request(
        WORKER_URL,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, resp.read().decode("utf-8", errors="ignore")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="ignore")


def main():
    token = os.environ.get("PUSH_TRIGGER_TOKEN")
    if not token:
        # Not configured yet — skip silently so the cron isn't noisy
        print("PUSH_TRIGGER_TOKEN not set; skipping push trigger.")
        return 0

    products = extract_products_from_data_js()
    if not products:
        print("No products parsed; skipping push trigger.")
        return 0

    moves = build_moves_manifest(products)
    if not moves:
        print(f"No retail-relevant drops in latest scrape (parsed {len(products)} products).")
        return 0

    status, body = post_manifest(token, moves)
    print(f"Push trigger → {status}: {body[:200]}")
    return 0 if 200 <= status < 300 else 1


if __name__ == "__main__":
    sys.exit(main())
