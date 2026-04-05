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
DATA_JS = Path(__file__).parent.parent / "js" / "data.js"

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
    "West St. Paul", "Stillwater",
}


def is_metro(disp):
    """Check if a dispensary is in the Twin Cities metro area."""
    lat = disp.get("lat", 0)
    lng = disp.get("lng", 0)
    city = disp.get("city", "")

    in_bounds = (
        METRO_BOUNDS["lat_min"] <= lat <= METRO_BOUNDS["lat_max"]
        and METRO_BOUNDS["lng_min"] <= lng <= METRO_BOUNDS["lng_max"]
    )
    in_city = city in METRO_CITIES

    return in_bounds or in_city


def build_dispensary_js(dispensaries):
    """Build JS array entries for dispensaries."""
    lines = []
    for d in dispensaries:
        features_js = json.dumps(d.get("features", []))
        scores = d.get("scores", {})

        lines.append(f"""    {{
        id: '{d["id"]}',
        name: '{_esc(d["name"])}',
        tagline: '{_esc(d.get("tagline", ""))}',
        address: '{_esc(d.get("address", ""))}',
        neighborhood: '{_esc(d.get("neighborhood", ""))}',
        city: '{_esc(d.get("city", ""))}',
        lat: {d.get("lat", 0)},
        lng: {d.get("lng", 0)},
        phone: '{d.get("phone", "")}',
        hours: {{ weekday: '{d.get("hours", {}).get("weekday", "10am-8pm")}', weekend: '{d.get("hours", {}).get("weekend", "10am-6pm")}', note: '{_esc(d.get("hours", {}).get("note", ""))}' }},
        website: '{d.get("website", "")}',
        tier: '{d.get("tier", "free")}',
        tcc_score: {d.get("tcc_score", 70)},
        scores: {{ pricing: {scores.get("pricing", 70)}, selection: {scores.get("selection", 70)}, service: {scores.get("service", 70)}, lab_testing: {scores.get("lab_testing", 70)} }},
        review_count: {d.get("review_count", 0)},
        verified: {'true' if d.get("verified") else 'false'},
        features: {features_js},
        gradient: '{d.get("gradient", "linear-gradient(135deg, #166534, #22c55e)")}',
        initial: '{d.get("initial", "TC")}',
        img: {json.dumps(d.get("img", "") or None)}
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

    print(f"Loaded {len(all_dispensaries)} total dispensaries")

    # Filter to metro area
    metro = [d for d in all_dispensaries if is_metro(d)]
    print(f"Filtered to {len(metro)} Twin Cities metro dispensaries")

    # Sort by TCC score
    metro.sort(key=lambda d: -d.get("tcc_score", 0))

    # Build JS and update
    js = build_dispensary_js(metro)
    success = update_data_js(js)

    if success:
        print(f"\nLive site will update on next GitHub Pages deploy.")
        # Print summary
        for d in metro:
            print(f"  TCC {d['tcc_score']:3d} | {d['name']:40s} | {d['city']}")


if __name__ == "__main__":
    main()
