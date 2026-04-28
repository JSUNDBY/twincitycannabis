#!/bin/bash
# Twin City Cannabis — Auto Scraper
# Run this via cron on your Mac to keep data fresh.
# Weedmaps blocks datacenter IPs but allows residential connections.
#
# Install: crontab -e, then add:
# 0 7,11,15,19,23 * * * /Users/joshsundby/twincitycannabis/scraper/auto_scrape.sh >> /tmp/tcc-scrape.log 2>&1

set -e

cd /Users/joshsundby/twincitycannabis

echo ""
echo "=========================================="
echo "TCC Auto Scrape: $(date)"
echo "=========================================="

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

# 8. Rebuild static SEO pages (per-dispensary, per-category, sitemap.xml)
#    These are crawler-facing pages with LocalBusiness/Product Schema.org markup
#    so Google indexes every dispensary + category as its own URL.
#    Use absolute path because cron's PATH doesn't include /usr/local/bin
#    on macOS — without this, step 8 silently fails and the live site never
#    gets rebuilt with fresh prices.
NODE_BIN="$(command -v node 2>/dev/null || echo /usr/local/bin/node)"
"$NODE_BIN" scripts/build_seo.js

# 9. Git commit and push (include all generated SEO surfaces)
git add js/data.js index.html sitemap.xml \
    scraper/data/price_history.json scraper/data/price_history_export.json \
    dispensaries products brands neighborhoods \
    best-dispensaries-twin-cities cheapest-cannabis-twin-cities minnesota-cannabis-laws \
    terms privacy contact
# city landing pages (auto-generated, slug pattern: <city>-cannabis-dispensaries)
for d in *-cannabis-dispensaries; do [ -d "$d" ] && git add "$d"; done
if git diff --staged --quiet; then
    echo "No changes to commit"
else
    git commit -m "Auto-update: $(date +%Y-%m-%d\ %H:%M) - fresh prices"
    git push
    echo "Pushed fresh data"
fi

echo "Done: $(date)"
