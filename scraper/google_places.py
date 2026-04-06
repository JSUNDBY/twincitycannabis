#!/usr/bin/env python3
"""
Google Places API integration for TCC.

Two phases:
  1. Discover Place IDs for each dispensary (one-time, runs once per dispensary)
  2. Fetch Place Details (websites, ratings, reviews) — runs weekly via cron

Cached to scraper/data/google_places.json so we don't re-query unnecessarily.

Requires environment variable: GOOGLE_PLACES_API_KEY
"""

import json
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

API_KEY = os.environ.get("GOOGLE_PLACES_API_KEY", "")
DATA_DIR = Path(__file__).parent / "data"
PLACES_CACHE = DATA_DIR / "google_places.json"
DISPENSARIES_FILE = DATA_DIR / "dispensaries.json"

PLACES_API_URL = "https://places.googleapis.com/v1/places:searchText"
PLACE_DETAILS_URL = "https://places.googleapis.com/v1/places/{place_id}"

# Twin Cities + surrounding area bounding box (matches update_site.py)
LOCATION_BIAS = {
    "rectangle": {
        "low": {"latitude": 43.5, "longitude": -97.5},
        "high": {"latitude": 47.5, "longitude": -91.0},
    }
}


def http_post(url, body, headers):
    """POST JSON request, return parsed JSON response."""
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        print(f"  HTTP {e.code}: {body[:200]}")
        return None
    except Exception as e:
        print(f"  Error: {e}")
        return None


def http_get(url, headers):
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        print(f"  HTTP {e.code}: {body[:200]}")
        return None
    except Exception as e:
        print(f"  Error: {e}")
        return None


def find_place_id(name, address=""):
    """Search for a place by name + address. Returns the top match's place_id."""
    query = f"{name} {address}".strip()
    body = {
        "textQuery": query,
        "locationBias": LOCATION_BIAS,
        "maxResultCount": 1,
    }
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": API_KEY,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress",
    }
    result = http_post(PLACES_API_URL, body, headers)
    if not result or "places" not in result or not result["places"]:
        return None
    return result["places"][0]


def fetch_place_details(place_id):
    """Fetch full details for a Place ID: website, rating, count, reviews, hours."""
    fields = [
        "id",
        "displayName",
        "formattedAddress",
        "websiteUri",
        "nationalPhoneNumber",
        "rating",
        "userRatingCount",
        "reviews",
        "regularOpeningHours",
        "currentOpeningHours",
        "googleMapsUri",
    ]
    headers = {
        "X-Goog-Api-Key": API_KEY,
        "X-Goog-FieldMask": ",".join(fields),
    }
    return http_get(PLACE_DETAILS_URL.format(place_id=place_id), headers)


def load_cache():
    if PLACES_CACHE.exists():
        return json.loads(PLACES_CACHE.read_text())
    return {}


def save_cache(cache):
    PLACES_CACHE.write_text(json.dumps(cache, indent=2))


def discover_place_ids(force=False):
    """For each dispensary in dispensaries.json, find its Google Place ID
    if we don't already have one cached."""
    if not API_KEY:
        print("ERROR: GOOGLE_PLACES_API_KEY not set in environment")
        sys.exit(1)

    if not DISPENSARIES_FILE.exists():
        print(f"dispensaries.json not found at {DISPENSARIES_FILE}")
        sys.exit(1)

    dispensaries = json.loads(DISPENSARIES_FILE.read_text())
    cache = load_cache()
    found = 0
    skipped = 0
    failed = 0

    print(f"Looking up Place IDs for {len(dispensaries)} dispensaries\n")
    for d in dispensaries:
        tcc_id = d["id"]
        if not force and tcc_id in cache and cache[tcc_id].get("place_id"):
            skipped += 1
            continue

        name = d["name"]
        address = d.get("address", "")
        print(f"  {tcc_id:<45} {name[:40]}")

        place = find_place_id(name, address)
        if not place:
            print(f"    NOT FOUND")
            failed += 1
            cache[tcc_id] = {"place_id": None, "name": name, "looked_up_at": time.strftime("%Y-%m-%d")}
            continue

        cache[tcc_id] = {
            "place_id": place["id"],
            "google_name": place.get("displayName", {}).get("text", ""),
            "google_address": place.get("formattedAddress", ""),
            "looked_up_at": time.strftime("%Y-%m-%d"),
        }
        found += 1
        print(f"    -> {place['id']}")

        # Save cache periodically so we don't lose progress
        if found % 5 == 0:
            save_cache(cache)
        time.sleep(0.1)  # be nice to the API

    save_cache(cache)
    print(f"\n  Found: {found}")
    print(f"  Skipped (cached): {skipped}")
    print(f"  Failed: {failed}")
    print(f"\nCache saved to {PLACES_CACHE}")


def fetch_all_details(force=False):
    """For every cached Place ID, fetch fresh details (website, rating, reviews)."""
    if not API_KEY:
        print("ERROR: GOOGLE_PLACES_API_KEY not set in environment")
        sys.exit(1)

    cache = load_cache()
    if not cache:
        print("No Place IDs cached yet. Run with --discover first.")
        sys.exit(1)

    fetched = 0
    skipped = 0
    failed = 0

    print(f"Fetching details for {len(cache)} dispensaries\n")
    for tcc_id, entry in cache.items():
        place_id = entry.get("place_id")
        if not place_id:
            skipped += 1
            continue

        print(f"  {tcc_id:<45}", end=" ", flush=True)
        details = fetch_place_details(place_id)
        if not details:
            print("FAILED")
            failed += 1
            continue

        # Merge details into the cache entry
        entry["details"] = {
            "website": details.get("websiteUri", ""),
            "phone": details.get("nationalPhoneNumber", ""),
            "rating": details.get("rating", 0),
            "review_count": details.get("userRatingCount", 0),
            "google_maps_uri": details.get("googleMapsUri", ""),
            "address": details.get("formattedAddress", ""),
            "hours": details.get("regularOpeningHours", {}),
            "reviews": [
                {
                    "author": r.get("authorAttribution", {}).get("displayName", "Anonymous"),
                    "rating": r.get("rating", 0),
                    "text": (r.get("text", {}) or {}).get("text", "")[:500],
                    "relative_time": r.get("relativePublishTimeDescription", ""),
                }
                for r in (details.get("reviews", []) or [])[:5]
            ],
            "fetched_at": time.strftime("%Y-%m-%d"),
        }
        fetched += 1
        rating = details.get("rating", 0)
        count = details.get("userRatingCount", 0)
        print(f"★ {rating} ({count} reviews)")

        if fetched % 10 == 0:
            save_cache(cache)
        time.sleep(0.1)

    save_cache(cache)
    print(f"\n  Fetched: {fetched}")
    print(f"  Skipped (no place_id): {skipped}")
    print(f"  Failed: {failed}")


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--discover", action="store_true", help="Find Place IDs for all dispensaries")
    parser.add_argument("--fetch", action="store_true", help="Fetch fresh details for cached Place IDs")
    parser.add_argument("--all", action="store_true", help="Discover + fetch in one pass")
    parser.add_argument("--force", action="store_true", help="Re-do even if cached")
    args = parser.parse_args()

    if args.discover or args.all:
        discover_place_ids(force=args.force)
    if args.fetch or args.all:
        fetch_all_details(force=args.force)
    if not (args.discover or args.fetch or args.all):
        parser.print_help()


if __name__ == "__main__":
    main()
