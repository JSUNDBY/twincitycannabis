#!/usr/bin/env python3
"""
Merges scraped dispensary data into js/data.js.
Replaces TCC.dispensaries array with fresh data from Weedmaps.
Filters to Twin Cities metro area only.
"""

import json
import re
from pathlib import Path
from datetime import datetime

DISPENSARY_FILE = Path(__file__).parent / "data" / "dispensaries.json"
MANUAL_DISPENSARY_FILE = Path(__file__).parent / "data" / "manual_dispensaries.json"
TIER_OVERRIDES_FILE = Path(__file__).parent / "data" / "tier_overrides.json"
DATA_JS = Path(__file__).parent.parent / "js" / "data.js"
INDEX_HTML = Path(__file__).parent.parent / "index.html"


def bump_freshness_timestamp():
    """Phase 16: stamp the LAST_UPDATED_HERO/FOOTER comment blocks in
    index.html so the "Live · Updated X" eyebrow never lags the actual
    Pi-cron data refresh by days. Idempotent — only writes if the
    timestamp would actually change.

    Independent of build_seo.js so the Pi can run this even when SEO
    rebuild is skipped or fails.
    """
    if not INDEX_HTML.exists():
        return False
    now_utc = datetime.utcnow()
    iso_utc = now_utc.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    # CDT label (best-effort; UTC-5 in summer)
    cdt_offset_hours = 5
    cdt = now_utc.replace(microsecond=0)
    cdt_hour = (cdt.hour - cdt_offset_hours) % 24
    am_pm = "AM" if cdt_hour < 12 else "PM"
    cdt_hour_12 = cdt_hour % 12 or 12
    human_cdt = cdt.strftime(f"%b %-d, {cdt_hour_12:d}:%M ") + am_pm + " CDT"

    hero_fresh = (
        f'<span class="fresh-ts" data-fresh-ts="{iso_utc}">'
        f'Updated just now · {human_cdt}</span>'
    )
    footer_fresh = (
        f'<span class="fresh-ts" data-fresh-ts="{iso_utc}">'
        f'Live data · last refresh {human_cdt}</span>'
    )

    content = INDEX_HTML.read_text()
    new_content = re.sub(
        r"<!-- LAST_UPDATED_HERO -->[\s\S]*?<!-- /LAST_UPDATED_HERO -->",
        f"<!-- LAST_UPDATED_HERO -->{hero_fresh}<!-- /LAST_UPDATED_HERO -->",
        content,
    )
    new_content = re.sub(
        r"<!-- LAST_UPDATED_FOOTER -->[\s\S]*?<!-- /LAST_UPDATED_FOOTER -->",
        f"<!-- LAST_UPDATED_FOOTER -->{footer_fresh}<!-- /LAST_UPDATED_FOOTER -->",
        new_content,
    )
    if new_content != content:
        INDEX_HTML.write_text(new_content)
        print(f"Bumped freshness timestamp → {iso_utc}")
        return True
    return False


def load_tier_overrides():
    """Returns dict mapping dispensary id -> tier. Empty dict if file missing."""
    if not TIER_OVERRIDES_FILE.exists():
        return {}
    try:
        with open(TIER_OVERRIDES_FILE) as f:
            data = json.load(f)
        # Strip the _comment key if present
        return {k: v for k, v in data.items() if not k.startswith("_")}
    except Exception:
        return {}


TIER_OVERRIDES = load_tier_overrides()

# Twin Cities metro area bounding box (generous)
METRO_BOUNDS = {
    "lat_min": 44.73,
    "lat_max": 45.15,
    "lng_min": -93.55,
    "lng_max": -92.80,
}

# Cities considered part of TC metro
METRO_CITIES = {
    "Minneapolis", "Saint Paul", "St. Paul", "Bloomington", "Edina",
    "Eden Prairie", "Hopkins", "Roseville", "New Brighton", "Brooklyn Park",
    "Blaine", "Eagan", "Burnsville", "Woodbury", "Lakeville",
    "Rosemount", "Anoka", "Ramsey", "Chaska", "Jordan",
    "West St. Paul", "Stillwater", "Fridley", "Mendota Heights",
    "Prior Lake",
}

# Manually included dispensaries that bypass the metro filter.
# Keep in sync with scraper.py and direct_menu_scrape.py.
MANUAL_INCLUDE_SLUGS = {
    "green-canopy-inc",  # Green Canopy Craft Dispensary, Lakeland Shores — owner requested 2026-04-10
}


def is_minnesota(disp):
    """True if the dispensary is in Minnesota (ZIP 55xxx-56xxx).

    Weedmaps mistags out-of-state dispensaries as MN in its raw data, so we
    rely on the ZIP code in the address — that's the only reliable signal.
    """
    address = disp.get("address", "")
    m = re.search(r"\s(\d{5})(?:-\d{4})?\s*$", address)
    if not m:
        return False
    zip_code = int(m.group(1))
    return 55000 <= zip_code <= 56999


def get_region(disp):
    """Returns 'metro' for Twin Cities metro, 'greater-mn' for the rest of MN."""
    city = disp.get("city", "")
    if city in METRO_CITIES:
        return "metro"
    lat = disp.get("lat", 0)
    lng = disp.get("lng", 0)
    in_bounds = (
        METRO_BOUNDS["lat_min"] <= lat <= METRO_BOUNDS["lat_max"]
        and METRO_BOUNDS["lng_min"] <= lng <= METRO_BOUNDS["lng_max"]
    )
    return "metro" if in_bounds else "greater-mn"


def is_included(disp):
    """Include any MN dispensary — metro AND greater MN — plus manual overrides."""
    slug = disp.get("weedmaps_slug", disp.get("id", ""))
    if slug in MANUAL_INCLUDE_SLUGS:
        return True
    return is_minnesota(disp)


def build_dispensary_js(dispensaries):
    """Build JS array entries for dispensaries."""
    lines = []
    for d in dispensaries:
        features_js = json.dumps(d.get("features", []))
        scores = d.get("scores", {})

        opened_at = d.get("opened_at", "")
        opened_at_js = f"        opened_at: '{opened_at}',\n" if opened_at else ""

        region = d.get("region") or get_region(d)
        lines.append(f"""    {{
        id: '{d["id"]}',
        name: '{_esc(d["name"])}',
        tagline: '{_esc(d.get("tagline", ""))}',
        address: '{_esc(d.get("address", ""))}',
        neighborhood: '{_esc(d.get("neighborhood", ""))}',
        city: '{_esc(d.get("city", ""))}',
        region: '{region}',
        lat: {d.get("lat", 0)},
        lng: {d.get("lng", 0)},
        phone: '{d.get("phone", "")}',
        hours: {{ weekday: '{d.get("hours", {}).get("weekday", "10am-8pm")}', weekend: '{d.get("hours", {}).get("weekend", "10am-6pm")}', note: '{_esc(d.get("hours", {}).get("note", ""))}' }},
        website: '{d.get("website", "")}',
        tier: '{TIER_OVERRIDES.get(d.get("id"), d.get("tier", "free"))}',
        tcc_score: {d.get("tcc_score", 70)},
        scores: {{ pricing: {scores.get("pricing", 70)}, selection: {scores.get("selection", 70)}, service: {scores.get("service", 70)}, lab_testing: {scores.get("lab_testing", 70)} }},
        review_count: {d.get("review_count", 0)},
        verified: {'true' if d.get("verified") else 'false'},
        features: {features_js},
        gradient: '{d.get("gradient", "linear-gradient(135deg, #166534, #22c55e)")}',
        initial: '{d.get("initial", "TC")}',
{opened_at_js}        img: {json.dumps(d.get("img", "") or None)}
    }}""")

    return ",\n".join(lines)


def _esc(s):
    """Escape for JS single-quoted strings."""
    return str(s).replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ")


def update_data_js(dispensaries_js):
    """Replace TCC.dispensaries in data.js."""
    if not DATA_JS.exists():
        print(f"data.js not found at {DATA_JS}")
        return False

    content = DATA_JS.read_text()

    # Replace dispensaries array
    pattern = r"(TCC\.dispensaries = \[)\n.*?\n(\];)"
    replacement = f"\\1\n{dispensaries_js}\n\\2"
    new_content, count = re.subn(pattern, replacement, content, count=1, flags=re.DOTALL)

    if count == 0:
        print("Could not find TCC.dispensaries array in data.js")
        return False

    # Update timestamp
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    ts_pattern = r"// Last auto-updated:.*\n"
    ts_line = f"// Last auto-updated: {timestamp}\n"
    if re.search(ts_pattern, new_content):
        new_content = re.sub(ts_pattern, ts_line, new_content)
    else:
        # Add before first line
        new_content = ts_line + new_content

    DATA_JS.write_text(new_content)
    print(f"Updated data.js with dispensary data at {timestamp}")
    return True


def main():
    if not DISPENSARY_FILE.exists():
        print("No dispensaries.json found. Run scraper.py first.")
        return

    with open(DISPENSARY_FILE) as f:
        all_dispensaries = json.load(f)

    print(f"Loaded {len(all_dispensaries)} total dispensaries from scraper")

    # Merge in manually-added dispensaries (e.g. just-opened ones not yet on Weedmaps).
    # These are kept in a separate file so the scraper doesn't wipe them out.
    if MANUAL_DISPENSARY_FILE.exists():
        with open(MANUAL_DISPENSARY_FILE) as f:
            manual = json.load(f)
        existing_ids = {d.get("id") for d in all_dispensaries}
        added = 0
        for m in manual:
            if m.get("id") not in existing_ids:
                all_dispensaries.append(m)
                added += 1
        if added:
            print(f"Merged {added} manually-added dispensaries from manual_dispensaries.json")

    # Filter to metro area + manual includes
    metro = [d for d in all_dispensaries if is_included(d)]
    print(f"Filtered to {len(metro)} dispensaries (metro + manual includes)")

    # Sort by TCC score
    metro.sort(key=lambda d: -d.get("tcc_score", 0))

    # Build JS and update
    js = build_dispensary_js(metro)
    success = update_data_js(js)

    if success:
        # Phase 16: stamp the freshness timestamp on index.html so the
        # "Live · Updated X" eyebrow tracks the actual cron cadence even
        # when SEO rebuild is skipped.
        bump_freshness_timestamp()
        # Phase 24: fire web push notifications for any consumer-relevant
        # price drops detected in this scrape. Safe to call even when
        # PUSH_TRIGGER_TOKEN isn't set — the script no-ops in that case.
        try:
            import subprocess
            subprocess.run(
                ["python3", str(Path(__file__).parent / "trigger_push.py")],
                timeout=60, check=False,
            )
        except Exception as e:
            print(f"Push trigger skipped: {e}")
        print(f"\nLive site will update on next GitHub Pages deploy.")
        # Print summary
        for d in metro:
            print(f"  TCC {d['tcc_score']:3d} | {d['name']:40s} | {d['city']}")


if __name__ == "__main__":
    main()
