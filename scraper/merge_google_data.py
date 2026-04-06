#!/usr/bin/env python3
"""
Merges Google Places data (websites, ratings, hours, reviews) into js/data.js.

For each dispensary, updates:
  - website   -> real Google website
  - phone     -> Google phone (more current)
  - hours     -> Google opening hours formatted as note
  - google    -> NEW field: rating, review_count, maps_url, reviews[]

Also rewrites TCC.reviews with real Google reviews.

Run: python3 scraper/merge_google_data.py
"""

import json
import re
import sys
from pathlib import Path

DATA_JS = Path(__file__).parent.parent / "js" / "data.js"
PLACES_CACHE = Path(__file__).parent / "data" / "google_places.json"


def _esc(s):
    """Escape for JS single-quoted string."""
    return str(s).replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ").replace("\r", "")


def format_hours(hours_obj):
    """Format Google's regularOpeningHours into a single human-readable string."""
    if not hours_obj or not hours_obj.get("weekdayDescriptions"):
        return ""
    descs = hours_obj["weekdayDescriptions"]
    # Get today's day-of-week index (Monday=0)
    import datetime
    dow = datetime.datetime.now().weekday()
    if dow < len(descs):
        # Format like "10:00 AM - 8:00 PM" stripping the day name
        today = descs[dow]
        # "Monday: 10:00 AM – 8:00 PM" -> "10:00 AM – 8:00 PM"
        if ":" in today:
            return today.split(":", 1)[1].strip()
    return ""


def merge():
    if not PLACES_CACHE.exists():
        print(f"Google cache not found at {PLACES_CACHE}")
        print("Run: python3 scraper/google_places.py --all")
        sys.exit(1)

    if not DATA_JS.exists():
        print(f"data.js not found at {DATA_JS}")
        sys.exit(1)

    cache = json.loads(PLACES_CACHE.read_text())
    content = DATA_JS.read_text()

    # Find the dispensaries array
    disp_match = re.search(r"(TCC\.dispensaries = \[)\n(.*?)\n(\];)", content, re.DOTALL)
    if not disp_match:
        print("Could not find TCC.dispensaries array")
        sys.exit(1)

    disp_block = disp_match.group(2)

    # Split dispensaries on the boundary "    {" at line start
    entries = re.split(r'(?=^    \{)', disp_block, flags=re.MULTILINE)
    entries = [e.rstrip().rstrip(',').rstrip() for e in entries if e.strip()]

    print(f"Parsed {len(entries)} dispensary entries")

    # Helper: parse the id from an entry
    def get_id(entry):
        m = re.search(r"id:\s*'([^']+)'", entry)
        return m.group(1) if m else None

    updated = 0
    skipped = 0
    new_entries = []

    for entry in entries:
        tcc_id = get_id(entry)
        if not tcc_id or tcc_id not in cache:
            new_entries.append(entry)
            skipped += 1
            continue

        details = cache[tcc_id].get("details", {})
        if not details:
            new_entries.append(entry)
            skipped += 1
            continue

        website = details.get("website", "")
        phone = details.get("phone", "")
        rating = details.get("rating", 0)
        review_count = details.get("review_count", 0)
        maps_url = details.get("google_maps_uri", "")
        reviews = details.get("reviews", [])
        hours_text = format_hours(details.get("hours", {}))

        # Replace website (only if Google has one)
        if website:
            entry = re.sub(
                r"website:\s*'[^']*'",
                f"website: '{_esc(website)}'",
                entry, count=1
            )

        # Replace phone (only if Google has one and looks well-formatted)
        if phone:
            entry = re.sub(
                r"phone:\s*'[^']*'",
                f"phone: '{_esc(phone)}'",
                entry, count=1
            )

        # Replace hours.note with today's hours from Google (if available)
        if hours_text:
            entry = re.sub(
                r"(hours:\s*\{[^}]*?note:\s*)'[^']*'",
                f"\\1'{_esc(hours_text)}'",
                entry, count=1
            )

        # Build google sub-object as a JS literal
        reviews_js = "[]"
        if reviews:
            review_objs = []
            for r in reviews:
                review_objs.append(
                    "{"
                    f"author: '{_esc(r.get('author','Anonymous'))}', "
                    f"rating: {int(r.get('rating', 0))}, "
                    f"text: '{_esc((r.get('text','') or '')[:400])}', "
                    f"time: '{_esc(r.get('relative_time',''))}'"
                    "}"
                )
            reviews_js = "[" + ", ".join(review_objs) + "]"

        google_js = (
            "{ "
            f"rating: {rating or 0}, "
            f"review_count: {review_count or 0}, "
            f"maps_url: '{_esc(maps_url)}', "
            f"reviews: {reviews_js}"
            " }"
        )

        # Update review_count to Google's count (much more accurate)
        if review_count > 0:
            entry = re.sub(
                r"review_count:\s*\d+",
                f"review_count: {review_count}",
                entry, count=1
            )

        # Inject google field — insert before the closing brace of the entry
        if 'google:' not in entry:
            # Find the last field and append google after it
            # Strategy: replace the closing "    }" with google field then close
            entry = re.sub(
                r"(\n\s+img:\s*[^\n]+)(\n\s+\})\s*$",
                f"\\1,\n        google: {google_js}\\2",
                entry
            )

        new_entries.append(entry)
        updated += 1

    # Reassemble
    new_block = ",\n".join(new_entries)
    new_content = (
        content[:disp_match.start()]
        + f"{disp_match.group(1)}\n{new_block}\n{disp_match.group(3)}"
        + content[disp_match.end():]
    )

    # Now also generate TCC.reviews from Google data — replaces seeded fakes
    review_lines = []
    for tcc_id, entry in cache.items():
        details = entry.get("details") or {}
        for r in details.get("reviews", []):
            review_lines.append(
                "    { dispensaryId: '" + tcc_id + "', "
                f"author: '{_esc(r.get('author','Anonymous'))}', "
                f"date: '{_esc(r.get('relative_time',''))}', "
                f"rating: {int(r.get('rating',0))}, "
                f"text: '{_esc((r.get('text','') or '')[:500])}', "
                "source: 'google' }"
            )

    reviews_js = ",\n".join(review_lines)

    rev_pattern = re.search(r"(TCC\.reviews = \[)\n(.*?)\n(\];)", new_content, re.DOTALL)
    if rev_pattern:
        new_content = (
            new_content[:rev_pattern.start()]
            + f"{rev_pattern.group(1)}\n{reviews_js}\n{rev_pattern.group(3)}"
            + new_content[rev_pattern.end():]
        )
        print(f"Replaced TCC.reviews with {len(review_lines)} real Google reviews")

    DATA_JS.write_text(new_content)
    print(f"\nUpdated {updated} dispensaries with Google data")
    print(f"Skipped {skipped} (no cache entry)")


if __name__ == "__main__":
    merge()
