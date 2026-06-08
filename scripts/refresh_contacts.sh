#!/bin/bash
# Weekly dispensary contact refresh for Twin City Cannabis.
#
# Scrapes emails + Instagram from dispensary sites (headless Chrome via
# puppeteer), rebuilds the leads list, and syncs both into the admin
# dashboard's Cloudflare KV. Runs locally because it needs this Mac's Chrome
# and wrangler login — CI can't do either.
#
# Scheduled by the LaunchAgent com.twincitycannabis.contacts (Sundays 5am,
# runs on next wake if the Mac was asleep). Logs to data/contacts_refresh.log.
#
# Run manually any time:  bash scripts/refresh_contacts.sh

export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"
cd /Users/joshsundby/Code/apps/twincitycannabis || exit 1

LOG="scraper/data/contacts_refresh.log"
{
  echo "==== refresh start: $(date) ===="
  node scripts/scrape_dispensary_emails.js --render || echo "[warn] scrape step failed"
  node scripts/build_contact_list.js              || echo "[warn] build step failed"
  node scripts/sync_contacts_to_kv.js             || echo "[warn] sync step failed"
  echo "==== refresh done:  $(date) ===="
} >> "$LOG" 2>&1
