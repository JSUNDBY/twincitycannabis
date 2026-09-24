#!/usr/bin/env python3
"""
Publish gate: the last check before a cycle's data goes live.

WHY THIS EXISTS
The old whole-cycle guard counted unique products and only reverted below
65% of the previous count. It did not stop the 2026-09-24 fall from 6,960 to
4,702 (32%), and a single shop losing its whole menu barely moved the number,
because most of that shop's products are also sold elsewhere. Each scraper
also carried a failed shop's last menu forward with no date on it, so a shop
that stopped answering could show month-old prices as current.

WHAT IT DOES, PER SHOP (a shop's "offers" = its priced listings)
  fresh   the fetch finished and the shop kept at least half its offers:
          publish, and stamp observed_at = now.
  held    the fetch failed or came back partial (raw_archive status), or a
          shop with 20+ offers lost more than half: put back last cycle's
          offers for that shop and keep its old observed_at. The site labels
          the menu "as of <date>".
  expired held for more than 72 hours: stop showing it. The watchdog then
          reports the menu as dark.

THEN, FOR THE WHOLE SITE
  After holds, the site must keep 85% of last cycle's offers (not counting
  shops that expired on purpose). Below that, something structural broke
  (a filter, a classifier, a merge), so the whole data.js reverts to last
  cycle's copy and Josh gets an email. Three or more shops held on one
  platform in one cycle is reported as a platform failure, in one message.

Also writes:
  scraper/data/menu_observed.json   per-shop observed_at / held state
  status.json                       the release record the off-site monitor
                                    reads (published_at, offers, held shops)
  TCC.menuObserved in data.js       what the site reads for "menu as of"

Exit 0 when data.js is safe to publish (including after a revert), 1 on a
crash. auto_scrape.sh reverts to the pre-cycle copy on 1: fail closed.

Run: python3 scripts/publish_gate.py [--before FILE] [--dry-run]
"""

import argparse
import json
import os
import re
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "js" / "data.js"
STATE = ROOT / "scraper" / "data" / "menu_observed.json"
STATUS = ROOT / "status.json"
sys.path.insert(0, str(ROOT / "scraper"))
sys.path.insert(0, str(ROOT / "scripts"))
import raw_archive  # noqa: E402
from tcc_alert import post_alert  # noqa: E402

HOLD_HOURS = 72     # longest a menu is shown after its last good read
SHOP_MIN = 20       # below this, a count drop alone is not judged
SHOP_KEEP = 0.5     # a shop keeping less than this share of its offers is held
SITE_KEEP = 0.85    # after holds, the site must keep this share of its offers
PLATFORM_WARN = 3   # this many new holds on one platform = platform failure

PREFIXES = [("du", "dutchie"), ("ds", "dispensary.shop"), ("tz", "treez"),
            ("bz", "blaze"), ("sw", "sweed"), ("j", "jane"), ("c", "carrot"),
            ("m", "meadow"), ("p", "weedmaps")]
ENTRY_SPLIT = r"(?=\{\s*id:\s*'[a-z]{1,2}\d+)"


def platform_of(pid):
    for pre, name in PREFIXES:
        if re.match(pre + r"\d", pid):
            return name
    return "other"


def load(path):
    js = ("global.window={};require(%s);const T=window.TCC;"
          "console.log(JSON.stringify({products:T.products.map(p=>({id:p.id,name:p.name||'',"
          "brand:p.brand||'',weight:p.weight||'',category:p.category||'',menu_type:p.menu_type||'rec',"
          "prices:p.prices||{}})),"
          "shops:T.dispensaries.map(d=>d.id)}))") % json.dumps(str(path))
    out = subprocess.run(["node", "-e", js], capture_output=True, text=True, timeout=180)
    if out.returncode != 0:
        raise RuntimeError(f"could not load {path}: {out.stderr.strip()[:300]}")
    return json.loads(out.stdout)


def offers_by_shop(products):
    n = defaultdict(int)
    for p in products:
        for shop, v in (p.get("prices") or {}).items():
            if v and float(v) > 0:
                n[shop] += 1
    return n


def key_of(p):
    return (re.sub(r"\s+", " ", (p.get("name") or "").lower()).strip(),
            (p.get("brand") or "").lower().strip(),
            (p.get("weight") or "").lower().strip(),
            p.get("category") or "",
            p.get("menu_type") or "rec")   # a med listing never absorbs a rec price


def parse_prices(entry):
    m = re.search(r"prices:\s*\{([^}]*)\}", entry)
    if not m:
        return {}
    return {k: float(v) for k, v in re.findall(r"'([^']+)':\s*([\d.]+)", m.group(1))}


def render_prices(prices):
    def num(v):
        return f"{v:.2f}".rstrip("0").rstrip(".")
    return "{ " + ", ".join(f"'{k}': {num(v)}" for k, v in prices.items()) + " }"


def set_prices(entry, prices):
    return re.sub(r"prices:\s*\{[^}]*\}", "prices: " + render_prices(prices), entry, count=1)


def split_entries(content):
    pm = re.search(r"(TCC\.products = \[)\n(.*?)\n(\];)", content, re.DOTALL)
    if not pm:
        raise RuntimeError("TCC.products array not found")
    entries = [e.strip().rstrip(",") for e in re.split(ENTRY_SPLIT, pm.group(2)) if e.strip()]
    return pm, entries


def entry_id(entry):
    m = re.match(r"\{\s*id:\s*'([^']+)'", entry)
    return m.group(1) if m else ""


def iso(dt):
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds")


def parse_iso(s):
    try:
        return datetime.fromisoformat(s)
    except Exception:
        return None


def rewrite(content, pm, entries):
    block = ",\n".join(entries)
    return content[:pm.start()] + pm.group(1) + "\n" + block + "\n" + pm.group(3) + content[pm.end():]


def stamp_observed(content, observed):
    """Put TCC.menuObserved in data.js, replacing any earlier copy."""
    content = re.sub(r"\nTCC\.menuObserved = \{.*?\};\n", "\n", content, flags=re.DOTALL)
    line = "TCC.menuObserved = " + json.dumps(observed, separators=(",", ":"), sort_keys=True) + ";\n"
    marker = "\nwindow.TCC = TCC;"
    if marker in content:
        return content.replace(marker, "\n" + line + marker, 1)
    return content + "\n" + line


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--before", default="/tmp/tcc_data_precycle.js")
    ap.add_argument("--dry-run", action="store_true", help="report only, write nothing, send nothing")
    args = ap.parse_args()

    now = datetime.now(timezone.utc)
    now_s = iso(now)
    before_path = Path(args.before).resolve()
    before = load(before_path)
    after = load(DATA)
    b_off = offers_by_shop(before["products"])
    a_off = offers_by_shop(after["products"])
    status = raw_archive.cycle_status()

    state_before = STATE.read_text() if STATE.exists() else "{}"
    state = json.loads(state_before)
    shops = state.setdefault("shops", {})

    # A shop's platform: what its scraper said, else the id prefix of its products.
    prefix_votes = defaultdict(lambda: defaultdict(int))
    for p in before["products"] + after["products"]:
        for shop in (p.get("prices") or {}):
            prefix_votes[shop][platform_of(p["id"])] += 1

    def platform(shop):
        if shop in status:
            return status[shop]["platform"]
        votes = prefix_votes.get(shop)
        return max(votes, key=votes.get) if votes else "other"

    restore, strip = set(), set()
    new_holds, released, expired = [], [], []
    for shop in sorted(set(b_off) | set(a_off)):
        b, a = b_off.get(shop, 0), a_off.get(shop, 0)
        st = (status.get(shop) or {}).get("status")
        rec = shops.setdefault(shop, {})
        # First run with no state: treat last cycle's menu as read then.
        rec.setdefault("observed_at", now_s)

        failed = st in ("partial", "failed")
        dropped = b >= SHOP_MIN and a < b * SHOP_KEEP
        if not failed and not dropped:
            if a > 0:
                if rec.get("held_since"):
                    released.append({"shop": shop, "offers": a, "since": rec["held_since"]})
                rec["observed_at"] = now_s
                rec.pop("held_since", None)
                rec.pop("reason", None)
            continue

        obs = parse_iso(rec.get("observed_at")) or now
        if now - obs > timedelta(hours=HOLD_HOURS):
            # Too old to present as a current menu. Stop putting it back.
            showing = a
            if a > 0 and st == "failed":
                # Nothing was read this cycle, so these rows are the failed
                # scraper's old feed file leaking through. Take them out.
                strip.add(shop)
                showing = 0
            elif a > 0:
                # A smaller menu was read this cycle; after 3 days it is the
                # truth, and it was read now.
                rec["observed_at"] = now_s
            if rec.get("held_since"):
                expired.append({"shop": shop, "since": rec["held_since"],
                                "last_full": rec.get("last_full_read", obs.isoformat()), "showing": showing})
                rec.pop("held_since", None)
                rec.pop("last_full_read", None)
            rec["expired_at"] = now_s
            continue

        if b > a:
            restore.add(shop)
        reason = f"fetch {st}" if failed else f"{b} -> {a} offers"
        if not rec.get("held_since"):
            rec["held_since"] = now_s
            rec["last_full_read"] = rec["observed_at"]
            new_holds.append({"shop": shop, "platform": platform(shop), "before": b, "after": a,
                              "reason": reason, "until": iso(obs + timedelta(hours=HOLD_HOURS))})
        rec["reason"] = reason

    # ---- rewrite data.js: put held offers back, take expired ones out ----
    content = DATA.read_text()
    pm, entries = split_entries(content)
    ids = {entry_id(e) for e in entries}
    by_key = {}
    for i, p in enumerate(after["products"]):
        by_key.setdefault(key_of(p), i)
    # after["products"] is in data.js order, so index i matches entries[i].
    if len(entries) != len(after["products"]):
        raise RuntimeError(f"entry split mismatch: {len(entries)} text entries vs "
                           f"{len(after['products'])} products")

    restored = 0
    emptied = set()
    if strip:
        for i, e in enumerate(entries):
            pr = parse_prices(e)
            if any(s in pr for s in strip):
                pr = {k: v for k, v in pr.items() if k not in strip}
                entries[i] = set_prices(e, pr)
                if not pr:
                    emptied.add(i)

    if restore:
        b_content = before_path.read_text()
        _, b_entries = split_entries(b_content)
        if len(b_entries) != len(before["products"]):
            raise RuntimeError("entry split mismatch in the pre-cycle copy")
        additions = []
        for p, text in zip(before["products"], b_entries):
            back = {s: float(v) for s, v in (p.get("prices") or {}).items()
                    if s in restore and v and float(v) > 0}
            if not back:
                continue
            i = by_key.get(key_of(p))
            if i is not None:
                pr = parse_prices(entries[i])
                added = {s: v for s, v in back.items() if s not in pr}
                if added:
                    pr.update(added)
                    entries[i] = set_prices(entries[i], pr)
                    restored += len(added)
                continue
            # Not on the site this cycle: bring the listing back under a new
            # id (ids are reassigned every cycle, so the old one may be taken).
            base = re.sub(r"h\d*$", "", p["id"])
            new_id, n = base + "h", 1
            while new_id in ids:
                n += 1
                new_id = f"{base}h{n}"
            ids.add(new_id)
            t = re.sub(r"^\{\s*id:\s*'[^']+'", "{ id: '" + new_id + "'", text, count=1)
            additions.append(set_prices(t, back))
            restored += len(back)
        entries += additions
    # Drop listings whose only shops expired (indexes are stable until here).
    entries = [e for i, e in enumerate(entries) if i not in emptied]

    b_total = sum(b_off.values())
    expired_offers = sum(b_off.get(x["shop"], 0) for x in expired)
    final_offers = sum(len(parse_prices(e)) for e in entries)
    final_shops = offers_by_shop([{"prices": parse_prices(e)} for e in entries])
    floor = int((b_total - expired_offers) * SITE_KEEP)
    reverted = b_total > 500 and final_offers < floor

    held_now = sorted(s for s, r in shops.items() if r.get("held_since"))
    observed = {s: shops[s]["observed_at"] for s in final_shops if s in shops}

    print(f"Publish gate: {sum(a_off.values())} offers scraped, {restored} held back in, "
          f"{final_offers} to publish (last cycle {b_total}, floor {floor}); "
          f"{len(held_now)} shop(s) held, {len(expired)} expired, {len(released)} released")
    for h in new_holds:
        print(f"  HOLD {h['shop']} [{h['platform']}] {h['reason']} until {h['until']}")
    for x in expired:
        print(f"  EXPIRED {x['shop']} (last full read {x['last_full']}, now showing {x['showing']})")
    for r in released:
        print(f"  RELEASED {r['shop']} ({r['offers']} offers)")

    if args.dry_run:
        print("(dry run: nothing written)" + ("  WOULD REVERT" if reverted else ""))
        return 0

    if reverted:
        DATA.write_text(before_path.read_text())
        # Last cycle's data is what ships, so last cycle's state stays true:
        # nothing was read, held, released or expired in this cycle.
        state = json.loads(state_before)
        shops = state.setdefault("shops", {})
        held_now = sorted(s for s, r in shops.items() if r.get("held_since"))
        new_holds, released, expired = [], [], []
        observed_line = None
    else:
        content = rewrite(content, pm, entries)
        content = stamp_observed(content, observed)
        tmp = DATA.with_suffix(".js.gate")
        tmp.write_text(content)
        os.replace(tmp, DATA)
        observed_line = observed

    STATE.write_text(json.dumps(state, indent=1, sort_keys=True))
    STATUS.write_text(json.dumps({
        "published_at": now_s,
        "cycle": os.environ.get("TCC_CYCLE_ID", ""),
        "offers": sum(b_off.values()) if reverted else final_offers,
        "shops_with_menus": len(b_off) if reverted else len(final_shops),
        "held": held_now,
        "reverted": reverted,
        "stamped": observed_line is not None,
    }, indent=1))

    # ---- tell Josh, once per change ----
    lines = []
    if reverted:
        lines += [f"PUBLISH BLOCKED: this cycle would have published {final_offers} offers, "
                  f"below the floor of {floor} (last cycle {b_total}).",
                  "The site keeps last cycle's data. Something structural dropped listings "
                  "(a filter, the classifier, a merge), not a single shop.",
                  "Check: journalctl -u tcc-scrape.service -n 300", ""]
    by_platform = defaultdict(list)
    for h in new_holds:
        by_platform[h["platform"]].append(h)
    for plat, hs in sorted(by_platform.items(), key=lambda kv: -len(kv[1])):
        if len(hs) >= PLATFORM_WARN:
            lines.append(f"{plat.upper()} MAY BE BROKEN: {len(hs)} shops on it failed in the same cycle. "
                         f"Usually the platform or our scraper for it; sometimes one chain's menu.")
    if new_holds:
        lines.append("Holding these menus at their last good read (the site marks them "
                     "'menu as of', and drops them after 3 days if they don't come back):")
        for h in new_holds:
            lines.append(f"  {h['shop']} [{h['platform']}]: {h['reason']}, held until {h['until'][:16]} UTC")
        lines.append("")
    if expired:
        lines.append("Held for 3 days without a full read, so the old menu is off the site now:")
        lines += [f"  {x['shop']}: last full read {x['last_full'][:16]} UTC, now showing "
                  + (f"{x['showing']} listings from the latest read" if x["showing"] else "no menu (the watchdog will list it as dark)")
                  for x in expired]
        lines.append("")
    if released:
        lines.append("Back to live reads:")
        lines += [f"  {r['shop']}: {r['offers']} offers" for r in released]
    if lines:
        post_alert("publish-gate", "\n".join(lines).strip())
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print(f"!!! PUBLISH GATE CRASHED: {e}")
        sys.exit(1)
