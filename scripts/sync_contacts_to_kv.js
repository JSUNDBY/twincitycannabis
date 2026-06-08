#!/usr/bin/env node
/**
 * Push scraped dispensary contact info (emails + Instagram) into Cloudflare KV
 * so the admin dashboard shows it. The leads file (outreach/dispensary-emails.json)
 * is gitignored/private, so this is the bridge between the local scrape and the
 * live dashboard.
 *
 * Writes two KV blobs in the `tcc-overrides` namespace:
 *   index:emails  -> { "<dispensary-id>": "email@x.com", ... }
 *   index:social  -> { "<dispensary-id>": { instagram: "https://instagram.com/..." }, ... }
 *
 * The worker (handleAdminDispensaries) merges both onto the dispensary list.
 *
 * Run after a fresh email scrape:
 *   node scripts/scrape_dispensary_emails.js --render
 *   node scripts/build_contact_list.js
 *   node scripts/sync_contacts_to_kv.js
 *
 * Requires wrangler authenticated with Workers KV write (local OAuth, or a
 * CLOUDFLARE_API_TOKEN with KV edit). Pass --dry-run to preview without writing.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'outreach/dispensary-emails.json');
const KV_NAMESPACE_ID = '71b77df77ea74522ab66c82e20cc9339'; // tcc-overrides
const DRY = process.argv.includes('--dry-run');

// Reject asset filenames / template placeholders / vendor domains that the
// scraper can occasionally pick up, so junk never reaches the dashboard.
const ASSET_RE = /\.(png|jpe?g|gif|svg|webp|css|js|ico|woff2?|ttf)$|@\dx\./i;
const BAD_DOMAINS = [
  'mysite.com', 'example.com', 'email.com', 'domain.com', 'yourdomain.com',
  'latofonts.com', 'fontawesome.com', 'jsdelivr.net', 'wixpress.com', 'sentry',
];

function isJunkEmail(e) {
  if (!e || !e.includes('@')) return true;
  if (ASSET_RE.test(e)) return true;
  return BAD_DOMAINS.some((d) => e.includes(d));
}

function putKv(key, obj) {
  const tmp = path.join(ROOT, `.kv-${key.replace(/[^a-z]/gi, '_')}.json`);
  fs.writeFileSync(tmp, JSON.stringify(obj));
  try {
    execFileSync(
      'npx',
      ['wrangler', 'kv', 'key', 'put', key, '--path', tmp,
       '--namespace-id', KV_NAMESPACE_ID, '--remote'],
      { cwd: ROOT, stdio: 'inherit' }
    );
  } finally {
    fs.unlinkSync(tmp);
  }
}

function main() {
  const cache = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const emails = {};
  const social = {};
  for (const [id, v] of Object.entries(cache)) {
    const email = (v.email || '').trim().toLowerCase();
    if (email && !isJunkEmail(email)) emails[id] = email;
    if (v.instagram) social[id] = { instagram: v.instagram };
  }

  console.log(`emails: ${Object.keys(emails).length} · social(IG): ${Object.keys(social).length}`);
  if (DRY) {
    console.log('Dry run — not writing. Sample emails:', Object.entries(emails).slice(0, 3));
    console.log('Sample social:', Object.entries(social).slice(0, 3));
    return;
  }

  putKv('index:emails', emails);
  putKv('index:social', social);
  console.log('Synced contacts to KV. Refresh the admin dashboard to see them.');
}

main();
