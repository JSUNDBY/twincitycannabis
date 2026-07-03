#!/usr/bin/env node
/**
 * Push menu-platform + menu-visibility intel into Cloudflare KV so the admin
 * dashboard CRM shows, per dispensary: which ecommerce platform their website
 * runs (DUTCHIE, DISPENSARY.SHOP, MEADOW, ...) and whether their menu is LIVE
 * on TCC (priced products in the comparison) or DARK (listed but invisible —
 * the "missing out on the marketing" shops).
 *
 * Writes one KV blob in the `tcc-overrides` namespace:
 *   index:platforms -> { "<dispensary-id>": { platform, menu, menuCount }, ... }
 *
 * Sources (both public/committed):
 *   scraper/data/menu_platforms.json  (platform fingerprint sweep)
 *   js/data.js                        (priced products -> LIVE/DARK)
 *
 * Run after re-running the platform sweep or when menu coverage shifts:
 *   node scripts/sync_platforms_to_kv.js [--dry-run]
 *
 * Requires wrangler authenticated (local OAuth or CLOUDFLARE_API_TOKEN).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const KV_NAMESPACE_ID = '71b77df77ea74522ab66c82e20cc9339'; // tcc-overrides
const DRY = process.argv.includes('--dry-run');

global.window = {};
require(path.join(ROOT, 'js/data.js'));
const TCC = global.window.TCC || global.TCC;

const platforms = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'scraper/data/menu_platforms.json'), 'utf8'));

// Priced-product count per dispensary -> LIVE/DARK
const productCount = {};
TCC.products.forEach((p) => {
  Object.entries(p.prices || {}).forEach(([id, price]) => {
    if (price > 0) productCount[id] = (productCount[id] || 0) + 1;
  });
});

const blob = {};
TCC.dispensaries.forEach((d) => {
  const plat = platforms[d.id] || {};
  const count = productCount[d.id] || 0;
  blob[d.id] = {
    platform: plat.platform || (d.website && !/weedmaps\.com/i.test(d.website) ? 'UNKNOWN' : 'NO-WEBSITE'),
    menu: count > 0 ? 'LIVE' : 'DARK',
    menuCount: count,
  };
});

const live = Object.values(blob).filter((v) => v.menu === 'LIVE').length;
console.log(`platforms blob: ${Object.keys(blob).length} shops · ${live} LIVE · ${Object.keys(blob).length - live} DARK`);

if (DRY) {
  console.log('Dry run — not writing. Sample:', Object.entries(blob).slice(0, 3));
  process.exit(0);
}

const tmp = path.join(ROOT, '.kv-index_platforms.json');
fs.writeFileSync(tmp, JSON.stringify(blob));
try {
  execFileSync(
    'npx',
    ['wrangler', 'kv', 'key', 'put', 'index:platforms', '--path', tmp,
     '--namespace-id', KV_NAMESPACE_ID, '--remote'],
    { cwd: ROOT, stdio: 'inherit' }
  );
} finally {
  fs.unlinkSync(tmp);
}
console.log('Synced index:platforms to KV.');
