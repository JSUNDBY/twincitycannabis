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

# 3. Scrape ALL menus (full product data)
python3 scraper/direct_menu_scrape.py --update-site

# 4. Record prices for history tracking
python3 scraper/price_tracker.py record

# 5. Export price history
python3 scraper/price_tracker.py export

# 6. Git commit and push
git add js/data.js scraper/data/price_history.json scraper/data/price_history_export.json
if git diff --staged --quiet; then
    echo "No changes to commit"
else
    git commit -m "Auto-update: $(date +%Y-%m-%d\ %H:%M) - fresh prices"
    git push
    echo "Pushed fresh data"
fi

echo "Done: $(date)"
