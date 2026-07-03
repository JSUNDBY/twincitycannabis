#!/usr/bin/env node
/**
 * CRM / marketing-partner report — the "who can we reach, who's missing out"
 * view across every tracked dispensary.
 *
 * Joins four sources:
 *   - js/data.js                          dispensaries + priced products (public)
 *   - scraper/data/menu_platforms.json    menu platform per shop (public, committed)
 *   - outreach/dispensary-emails.json     emails + instagram (PRIVATE, gitignored)
 *   - live product prices                 menu LIVE vs DARK
 *
 * Classifies every shop:
 *   menu:  LIVE  (priced products on TCC) | DARK (listed but no menu data —
 *          invisible in the price comparison = missing the marketing)
 *   reach: EMAIL > INSTAGRAM > WEBSITE (contact form only) > PHONE > UNREACHABLE
 *
 * Output: outreach/crm-report.csv (PRIVATE — outreach/ is gitignored) plus a
 * console summary. Run anytime:  node scripts/crm_report.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
global.window = {};
require(path.join(ROOT, 'js/data.js'));
const TCC = global.window.TCC || global.TCC;

const platforms = JSON.parse(fs.readFileSync(path.join(ROOT, 'scraper/data/menu_platforms.json'), 'utf8'));

let contacts = {};
const leadsPath = path.join(ROOT, 'outreach/dispensary-emails.json');
if (fs.existsSync(leadsPath)) {
  contacts = JSON.parse(fs.readFileSync(leadsPath, 'utf8'));
} else {
  console.warn('WARN: outreach/dispensary-emails.json not found — reach column will be website/phone only');
}

// Priced-product count per dispensary
const productCount = {};
TCC.products.forEach(p => {
  Object.entries(p.prices || {}).forEach(([id, price]) => {
    if (price > 0) productCount[id] = (productCount[id] || 0) + 1;
  });
});

const rows = TCC.dispensaries.map(d => {
  const c = contacts[d.id] || {};
  const email = c.email || (Array.isArray(c.emails) ? c.emails[0] : '') || '';
  const instagram = c.instagram || (c.social && c.social.instagram) || '';
  const website = d.website && !/weedmaps\.com/i.test(d.website) ? d.website : '';
  const plat = (platforms[d.id] || {}).platform || (website ? 'UNKNOWN' : 'NO-WEBSITE');
  const menuCount = productCount[d.id] || 0;
  const menu = menuCount > 0 ? 'LIVE' : 'DARK';
  const reach = email ? 'EMAIL' : instagram ? 'INSTAGRAM' : website ? 'WEBSITE' : d.phone ? 'PHONE' : 'UNREACHABLE';
  // The pitch priority: DARK shops we CAN reach are the hottest outreach —
  // they're visibly missing out and one conversation fixes it.
  const opportunity = menu === 'DARK' && (email || instagram) ? 'HOT: dark menu, reachable'
    : menu === 'DARK' && website ? 'WARM: dark menu, contact form'
    : menu === 'DARK' ? 'STUCK: dark menu, hard to reach'
    : email ? 'READY: live menu, emailable'
    : '';
  return {
    id: d.id, name: d.name, city: d.city || '', region: d.region || '',
    platform: plat, menu, menuCount, reach, email, instagram, phone: d.phone || '',
    website, opportunity,
  };
});

// CSV (private, into gitignored outreach/)
const cols = ['name', 'city', 'region', 'platform', 'menu', 'menuCount', 'reach', 'email', 'instagram', 'phone', 'website', 'opportunity', 'id'];
const csv = [cols.join(',')].concat(rows.map(r =>
  cols.map(k => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(',')
)).join('\n');
fs.mkdirSync(path.join(ROOT, 'outreach'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'outreach/crm-report.csv'), csv + '\n');

// Console summary
const n = (f) => rows.filter(f).length;
console.log('=== TCC MARKETING-PARTNER CRM —', rows.length, 'dispensaries ===\n');
console.log('MENU VISIBILITY');
console.log('  LIVE on TCC (in the price comparison):', n(r => r.menu === 'LIVE'));
console.log('  DARK (listed, no menu = missing out):  ', n(r => r.menu === 'DARK'));
console.log('\nREACHABILITY');
['EMAIL', 'INSTAGRAM', 'WEBSITE', 'PHONE', 'UNREACHABLE'].forEach(k =>
  console.log(`  ${k.padEnd(12)}`, n(r => r.reach === k)));
console.log('\nPLATFORMS (shops with real websites)');
const byPlat = {};
rows.forEach(r => { byPlat[r.platform] = (byPlat[r.platform] || 0) + 1; });
Object.entries(byPlat).sort((a, b) => b[1] - a[1]).forEach(([p, c]) => console.log(`  ${p.padEnd(16)}`, c));
console.log('\nOPPORTUNITY QUEUE');
console.log('  HOT   (dark menu, emailable/IG):', n(r => r.opportunity.startsWith('HOT')));
console.log('  WARM  (dark menu, contact form):', n(r => r.opportunity.startsWith('WARM')));
console.log('  STUCK (dark menu, hard to reach):', n(r => r.opportunity.startsWith('STUCK')));
console.log('  READY (live menu, emailable):   ', n(r => r.opportunity.startsWith('READY')));
console.log('\nHOT LIST (dark + reachable — call these first):');
rows.filter(r => r.opportunity.startsWith('HOT')).forEach(r =>
  console.log(`  ${r.name} (${r.city}) — ${r.platform} — ${r.email || r.instagram}`));
console.log('\nWrote outreach/crm-report.csv (private).');
