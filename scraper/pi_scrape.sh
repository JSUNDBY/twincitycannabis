#!/bin/bash
# Twin City Cannabis — Pi Auto Scraper
# Runs 4x/day via cron on studio-pi (7am, 12pm, 5pm, 10pm CDT).
# Full pipeline: Weedmaps + Jane scrape -> merge -> SEO build -> git push.

set -e

LOG=/home/josh/twincitycannabis/scraper/data/pi_scrape.log
exec >> "$LOG" 2>&1

cd /home/josh/twincitycannabis

echo ""
echo "=========================================="
echo "TCC Pi Scrape: $(date)"
echo "=========================================="

# Pull latest first so we do not race with manual commits
git pull --rebase --autostash 2>&1 || echo "git pull warning, continuing"

# 1. Dispensary listings (Weedmaps Discovery API)
python3 scraper/scraper.py --export 2>/dev/null || echo "Dispensary scrape skipped"

# 2. Update dispensaries in data.js
python3 scraper/update_site.py 2>/dev/null || echo "Dispensary update skipped"

# 3. Full menu scrape from Weedmaps (the heavy step)
python3 scraper/direct_menu_scrape.py --update-site

# 4. Jane rec menu scrape (Green Goods locations)
#    Pulls verified recreational prices directly from dispensary websites.
#    Replaces Weedmaps medical prices for these dispensaries.
echo "--- Jane scrape ---"
node scraper/jane_scrape.js 2>&1 || echo "Jane scrape failed, continuing with Weedmaps data"

# 5. Merge Jane data over Weedmaps data for Jane-scraped dispensaries
if [ -f scraper/data/jane_products.json ]; then
    python3 scraper/merge_jane_data.py 2>&1 || echo "Jane merge skipped"
fi

# 6. Re-merge Google Places data (cached file, no API call usually)
python3 scraper/merge_google_data.py 2>&1 || echo "Google merge skipped"

# 7. Drop orphans
python3 scraper/clean_orphans.py 2>&1 || echo "Clean orphans skipped"

# 8. Record prices into history
python3 scraper/price_tracker.py record

# 9. Export price history for data.js
python3 scraper/price_tracker.py export

# 10. Rebuild static SEO pages
node scripts/build_seo.js

# 11. Commit and push
git add js/data.js index.html sitemap.xml \
    scraper/data/price_history.json scraper/data/price_history_export.json \
    scraper/data/full_menu_products.json scraper/data/dispensaries.json \
    scraper/data/dispensaries_export.json scraper/data/jane_products.json \
    dispensaries products brands neighborhoods \
    best-dispensaries-twin-cities cheapest-cannabis-twin-cities minnesota-cannabis-laws \
    terms privacy contact 2>/dev/null || true
for d in *-cannabis-dispensaries; do [ -d "$d" ] && git add "$d"; done
if git diff --staged --quiet; then
    echo "No changes to commit"
else
    git commit -m "Pi auto: $(date +%Y-%m-%d\ %H:%M) - fresh prices"
    git push
    echo "Pushed fresh data"
fi

echo "Done: $(date)"
