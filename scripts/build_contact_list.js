#!/usr/bin/env node
/**
 * Build a dispensary contact list for outreach.
 *
 * Merges data from:
 *   - js/data.js (id, name, city, neighborhood, tier, region, tagline)
 *   - scraper/data/google_places.json (phone, website)
 *
 * Outputs:
 *   - outreach/dispensary-contacts.csv  (for spreadsheets / mail merge)
 *   - outreach/dispensary-contacts.md   (for quick scanning)
 *
 * Email column is intentionally blank — Google Places doesn't expose
 * email and we don't want to guess. Fill in as you find them.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://twincitycannabis.com';
const OUT_DIR = path.join(ROOT, 'outreach');

// Load data.js by shimming a browser window
global.window = {};
require(path.join(ROOT, 'js/data.js'));
const TCC = global.window.TCC || global.TCC;

const places = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'scraper/data/google_places.json'), 'utf8')
);

// Some dispensaries are keyed by slug, some by place_id. Build a lookup by slug.
const placesBySlug = {};
Object.entries(places).forEach(([key, entry]) => {
  // Key is usually the TCC dispensary slug
  placesBySlug[key] = entry;
});

function escCsv(s) {
  if (s == null) return '';
  const str = String(s).replace(/"/g, '""');
  return /[",\n]/.test(str) ? `"${str}"` : str;
}

// Load previously-scraped emails if they exist, so re-running this script
// doesn't wipe out collected contacts.
const EMAIL_CACHE = path.join(ROOT, 'outreach/dispensary-emails.json');
let emailCache = {};
if (fs.existsSync(EMAIL_CACHE)) {
  emailCache = JSON.parse(fs.readFileSync(EMAIL_CACHE, 'utf8'));
}

const rows = TCC.dispensaries.map((d) => {
  const place = placesBySlug[d.id];
  const details = (place && place.details) || {};
  const cached = emailCache[d.id] || {};
  return {
    // ── CRM columns (yours to maintain) ────────────────────────
    status: '',            // not-contacted | emailed | replied | signed-up | passed
    last_contact: '',      // YYYY-MM-DD
    next_followup: '',     // YYYY-MM-DD
    notes: '',             // anything: owner name, objections, topics
    // ── Contact info ──────────────────────────────────────────
    id: d.id,
    name: d.name,
    city: d.city || '',
    neighborhood: d.neighborhood || '',
    region: d.region || 'metro',
    tier: d.tier || 'free',
    email: cached.email || '',
    email_source: cached.source || '',  // e.g. "website", "instagram", "manual"
    phone: details.phone || d.phone || '',
    website: details.website || d.website || '',
    instagram: cached.instagram || '',
    tcc_score: d.tcc_score || '',
    google_rating: details.rating || '',
    google_reviews: details.review_count || '',
    listing_url: `${SITE}/#dispensary/${d.id}`,
    address: d.address || details.address || '',
  };
});

// Sort: metro first, then greater-mn, each alphabetical by name
const regionOrder = { metro: 0, 'greater-mn': 1 };
rows.sort((a, b) => {
  const ra = regionOrder[a.region] ?? 1;
  const rb = regionOrder[b.region] ?? 1;
  if (ra !== rb) return ra - rb;
  return a.name.localeCompare(b.name);
});

fs.mkdirSync(OUT_DIR, { recursive: true });

// ── CSV ─────────────────────────────────────────────────────────
const headers = [
  'status', 'last_contact', 'next_followup', 'notes',
  'name', 'id', 'city', 'neighborhood', 'region', 'tier',
  'email', 'email_source', 'phone', 'website', 'instagram', 'listing_url',
  'tcc_score', 'google_rating', 'google_reviews', 'address',
];
const csv = [
  headers.join(','),
  ...rows.map((r) => headers.map((h) => escCsv(r[h])).join(',')),
].join('\n');
fs.writeFileSync(path.join(OUT_DIR, 'dispensary-contacts.csv'), csv);

// ── Markdown ────────────────────────────────────────────────────
const mdLines = [];
mdLines.push('# Twin City Cannabis — Dispensary Contact List');
mdLines.push('');
mdLines.push(`_Generated ${new Date().toISOString().slice(0, 10)} · ${rows.length} dispensaries_`);
mdLines.push('');
mdLines.push('Outreach priorities, in order:');
mdLines.push('');
mdLines.push('1. **Metro dispensaries** — your primary audience');
mdLines.push('2. **Paid tiers** (Premium / Featured) first — they already know you');
mdLines.push('3. **Greater Minnesota** — these are new to the site, big opportunity');
mdLines.push('');

const groups = [['metro', 'Twin Cities Metro'], ['greater-mn', 'Greater Minnesota']];
for (const [region, title] of groups) {
  const group = rows.filter((r) => r.region === region);
  if (!group.length) continue;
  mdLines.push(`## ${title} (${group.length})`);
  mdLines.push('');
  mdLines.push('| Name | City | Phone | Website | Tier | Listing |');
  mdLines.push('|---|---|---|---|---|---|');
  for (const r of group) {
    const site = r.website ? `[site](${r.website})` : '—';
    const listing = `[view](${r.listing_url})`;
    const tier = r.tier === 'free' ? '' : `**${r.tier}**`;
    mdLines.push(`| ${r.name} | ${r.city} | ${r.phone || '—'} | ${site} | ${tier} | ${listing} |`);
  }
  mdLines.push('');
}

mdLines.push('## Missing info');
mdLines.push('');
const noPhone = rows.filter((r) => !r.phone).length;
const noSite = rows.filter((r) => !r.website).length;
mdLines.push(`- ${noPhone} dispensaries missing phone numbers`);
mdLines.push(`- ${noSite} dispensaries missing websites`);
mdLines.push(`- All 79 missing emails — fill in as you source them`);

fs.writeFileSync(path.join(OUT_DIR, 'dispensary-contacts.md'), mdLines.join('\n'));

console.log(`Generated contact list:`);
console.log(`  CSV:      ${path.relative(ROOT, path.join(OUT_DIR, 'dispensary-contacts.csv'))}`);
console.log(`  Markdown: ${path.relative(ROOT, path.join(OUT_DIR, 'dispensary-contacts.md'))}`);
console.log(`  ${rows.length} dispensaries (${rows.filter(r => r.region === 'metro').length} metro, ${rows.filter(r => r.region === 'greater-mn').length} greater MN)`);
console.log(`  With phone: ${rows.filter(r => r.phone).length}`);
console.log(`  With website: ${rows.filter(r => r.website).length}`);
