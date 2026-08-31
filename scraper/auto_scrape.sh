#!/bin/bash
# Twin City Cannabis — Auto Scraper
# Run this via cron on your Mac to keep data fresh.
# Weedmaps blocks datacenter IPs but allows residential connections.
#
# Install: crontab -e, then add:
# 0 7,11,15,19,23 * * * /Users/joshsundby/twincitycannabis/scraper/auto_scrape.sh >> /tmp/tcc-scrape.log 2>&1

set -e

# Run against whichever clone this script lives in (Pi: ~/twincitycannabis,
# Mac: ~/Code/apps/twincitycannabis) instead of a hardcoded path.
cd "$(cd "$(dirname "$0")/.." && pwd)"

# Node path resolved up front (cron/launchd PATH lacks /usr/local/bin) —
# needed by the brand-quality and deals steps below, not just build_seo.
NODE_BIN="$(command -v node 2>/dev/null || echo /usr/local/bin/node)"

echo ""
echo "=========================================="
echo "TCC Auto Scrape: $(date)"
echo "=========================================="

# 0. Sync repo state to origin/main. Without this, the Pi runs whatever local
#    copy of auto_scrape.sh it last had — so newly-added platform scrapers
#    (e.g. dispensary.shop, Meadow) silently don't run, and the
#    `direct_menu_scrape` step below wipes their products on every cycle.
#
#    This is a HARD SYNC, not a pull, and it is deliberate. Everything this
#    machine commits is generated output that the run below recreates from
#    scratch, so origin/main is always the truth and local commits are never
#    worth preserving. Rebasing hundreds of generated files instead produces
#    conflicts nobody is present to resolve.
#
#    History (2026-07-05 to 2026-08-17): a `git rebase -i` was abandoned here
#    and left `.git/rebase-merge` behind. Every later `git pull --rebase` died
#    instantly on "already a rebase-merge directory", and the old code swallowed
#    that with `|| echo WARNING` and kept going. Scrapes ran, commits landed,
#    pushes were rejected non-fast-forward, and the site served 11-day-old
#    prices while claiming daily freshness. Clearing stale rebase state and
#    resetting to origin makes that whole class of failure self-healing: a
#    push rejected this cycle is absorbed at the top of the next one.
# Hash this script before syncing: if the sync updates auto_scrape.sh itself,
# bash may be mid-read of the old file, so re-exec once to run the new version
# whole rather than a spliced half-old copy.
_sha() { command -v sha256sum >/dev/null 2>&1 && sha256sum "$1" | cut -d" " -f1 || shasum -a 256 "$1" | cut -d" " -f1; }
SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
SELF_HASH_BEFORE="$(_sha "$SELF")"

echo "Syncing to origin/main..."
rm -rf .git/rebase-merge .git/rebase-apply
if ! git fetch origin main --quiet; then
    echo "FATAL: git fetch failed — cannot verify repo state, refusing to run."
    echo "       A scrape from unsynced code can wipe products and cannot push."
    exit 1
fi
if ! git reset --hard origin/main --quiet; then
    echo "FATAL: git reset to origin/main failed — refusing to run."
    exit 1
fi
echo "Synced to $(git rev-parse --short HEAD) on $(git rev-parse --abbrev-ref HEAD)"

if [ "$TCC_REEXEC" != "1" ] && [ "$(_sha "$SELF")" != "$SELF_HASH_BEFORE" ]; then
    echo "auto_scrape.sh changed during sync — re-executing the updated version"
    export TCC_REEXEC=1
    exec bash "$SELF" "$@"
fi

# 1. Scrape dispensary listings
python3 scraper/scraper.py --export 2>/dev/null || echo "Dispensary scrape skipped"

# 2. Update dispensaries in data.js
python3 scraper/update_site.py 2>/dev/null || echo "Dispensary update skipped"

# 3. Scrape ALL menus (full product data) — applies smart name-based
#    categorization via scraper/normalize.py to keep cartridges as cartridges,
#    edibles as edibles, etc.
python3 scraper/direct_menu_scrape.py --update-site

# 4. Re-merge Google Places data (websites, ratings, reviews) — these get
#    wiped out by step 2 since update_site.py rewrites the dispensaries array.
#    The Google data is cached in scraper/data/google_places.json and refreshed
#    weekly by a separate cron (or manually via google_places.py --fetch).
python3 scraper/merge_google_data.py

# 4b. Apply manual website overrides for shops Google Places misses
python3 scraper/merge_website_overrides.py

# 5. Drop orphaned product price refs and reviews after metro filtering
python3 scraper/clean_orphans.py

# 6. Record prices for history tracking
python3 scraper/price_tracker.py record

# 7. Export price history
python3 scraper/price_tracker.py export

# 7.5. Pull menus from dispensary.shop platform (e.g. Fort Road Cannabis)
#      and merge them into TCC.products with id prefix 'ds####'. Must run
#      AFTER direct_menu_scrape.py since that step wipes TCC.products.
python3 scraper/dispensary_shop_scrape.py
python3 scraper/merge_dispensary_shop_data.py

# 7.6. Pull menus from Meadow platform (e.g. Lake Daze).
python3 scraper/meadow_scrape.py
python3 scraper/merge_meadow_data.py

# 7.7. Pull menus from Carrot platform (Wildflower NE + North Loop, Verist
#      Fields). These stores keep their Weedmaps listings stale or absent —
#      Carrot is their real menu. Non-fatal: a Carrot outage must not kill
#      the whole scrape, and merge skips cleanly on missing/empty output.
python3 scraper/carrot_scrape.py || echo "Carrot scrape failed (non-fatal)"
python3 scraper/merge_carrot_data.py

# 7.8. Pull menus from Jane/iHeartJane — all 8 Green Goods + all 8 RISE
#      locations, rec+med, via Jane's public Algolia search (no browser;
#      jane_algolia_scrape.py replaced the headless-Chromium jane_scrape.js
#      2026-08-28). Both chains left Weedmaps; Jane is their only source.
python3 scraper/jane_algolia_scrape.py || echo "Jane scrape failed (non-fatal)"
python3 scraper/merge_jane_data.py

# 7.9. Pull menus from Sweed POS storefronts (Legit Cannabis). Legit left
#      Weedmaps ~2026-08-25; their own Sweed shop is the only menu source.
python3 scraper/sweed_scrape.py || echo "Sweed scrape failed (non-fatal)"
python3 scraper/merge_sweed_data.py

# 7.95. Pull menus from Dutchie embedded menus (8 outstate/suburb shops:
#       Rochester, Morton, Ramsey, La Crescent, Welch, White Bear Lake,
#       Luverne, Monticello). curl_cffi passes Dutchie's Cloudflare; the
#       scrape self-paces. Skips cleanly if curl_cffi is missing.
python3 scraper/dutchie_scrape.py || echo "Dutchie scrape failed (non-fatal)"
python3 scraper/merge_dutchie_data.py


# 7.9. Backfill strain type (indica/sativa/hybrid) onto any products the live
#      scrape didn't tag, using the dispensaries' own labels. Never invents one.
python3 scraper/backfill_strain_type.py

# 7.92. Brand data quality: consolidate fragmented brand names + backfill
#       missing product images. These rewrite js/data.js, so guard: if the
#       result fails to parse, revert to the pre-step copy (keeps fresh prices,
#       never deploys a broken data file).
cp js/data.js /tmp/tcc_data_prebrand.js
python3 scraper/consolidate_brands.py --apply
python3 scraper/backfill_images.py
# Re-categorize by name + weight and drop non-cannabis. Fixes platform
# scrapers (dispensary.shop / Meadow) that dump every product into "flower"
# (flavor-named gummies, beverages, even toothpaste/pipes leaked in).
python3 scraper/recategorize_data_js.py
"$NODE_BIN" -e 'global.window={};require("./js/data.js")' 2>/dev/null \
  || { echo "data.js failed to parse after data-quality steps — reverting"; cp /tmp/tcc_data_prebrand.js js/data.js; }

# 7.95. Generate the real price-drop deals feed from priceHistory (no fakes).
"$NODE_BIN" scraper/generate_deals.js

# 7.96. Aggregate weekly price-trend medians from the history file for the
#       /minnesota-price-trends/ page. Non-fatal; the build skips the page
#       cleanly if the trends file is missing.
python3 scripts/build_price_trends.py || echo "Price trends aggregation failed (non-fatal)"

# 8. Rebuild static SEO pages (per-dispensary, per-category, sitemap.xml)
#    These are crawler-facing pages with LocalBusiness/Product Schema.org markup
#    so Google indexes every dispensary + category as its own URL.
"$NODE_BIN" scripts/build_seo.js

# 8.5. Remove orphaned page directories the build no longer emits (stale
#      strain/product/city pages from earlier runs). Uses git rm so the
#      deletions are staged and pushed by the commit below. Self-guards and
#      aborts without deleting anything if the sitemap looks broken.
python3 scripts/prune_orphans.py --apply

# 9. Git commit and push. The sitemap is the manifest: stage every page the
#    build just declared in it, so no generated surface (compare/, cheapest-
#    {category}-{city}, strain-city, calculators, market-insights, ...) is
#    ever silently left behind serving stale prices, and a brand-new page can
#    never appear in the pushed sitemap without its HTML being pushed too.
git add js/data.js index.html sitemap.xml \
    scraper/data/price_history.json scraper/data/price_history_export.json \
    scraper/data/full_menu_products.json scraper/data/last_weedmaps_scrape.txt \
    scraper/data/dispensaries.json scraper/data/dispensaries_export.json \
    scraper/data/dispensary_shop_products.json scraper/data/meadow_products.json \
    scraper/data/carrot_products.json scraper/data/jane_products.json \
    scraper/data/sweed_products.json scraper/data/dutchie_products.json \
    scraper/data/page_lastmod.json scraper/data/price_trends.json \
    llms.txt
grep -o '<loc>https://twincitycannabis.com/[^<]*</loc>' sitemap.xml \
  | sed 's|<loc>https://twincitycannabis.com/||;s|</loc>||;s|/$||' \
  | while read -r p; do
      [ -n "$p" ] && [ -f "$p/index.html" ] && git add "$p" || true
    done
if git diff --staged --quiet; then
    echo "No changes to commit"
else
    git commit -m "Auto-update: $(date +%Y-%m-%d\ %H:%M) - fresh prices"
    git push
    echo "Pushed fresh data"
    # Tell Bing & friends immediately (IndexNow) — ChatGPT search leans on Bing.
    bash scripts/indexnow_ping.sh || true
fi

# Heartbeat: ping the uptime monitor. set -e means we only reach here on a
# fully successful run, so a failed/aborted scrape never pings -> monitor goes
# red. URL is supplied via env (TCC_HEARTBEAT_URL) so the push token stays out
# of this public repo.
if [ -n "$TCC_HEARTBEAT_URL" ]; then
    curl -fsS --max-time 10 "$TCC_HEARTBEAT_URL" >/dev/null 2>&1 \
      && echo "Heartbeat sent" || echo "Heartbeat failed (non-fatal)"
fi

echo "Done: $(date)"
