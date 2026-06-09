#!/usr/bin/env node
/**
 * Generate REAL deals from price history (replaces the old hardcoded samples).
 *
 * A "deal" here is an honest, detected price drop: a product whose current
 * lowest price is meaningfully below its recent high in priceHistory. Nothing
 * is invented — every deal traces to a real price movement and points at the
 * dispensary currently offering the low price.
 *
 * Writes the `TCC.deals = [...]` array in js/data.js. Run after the scrape +
 * price_tracker so priceHistory is current.
 *
 * Run: node scraper/generate_deals.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'js', 'data.js');

global.window = {};
require(DATA);
const TCC = global.window.TCC || global.TCC;

const MIN_DROP_DOLLARS = 2;
const MIN_DROP_PCT = 8;
// Real retail price drops rarely exceed ~45%. Anything bigger is almost always
// a data artifact (different sizes/units mixed under one product name, e.g. an
// ounce price next to an eighth). Reject those so we never show a fake "85% off".
const MAX_DROP_PCT = 45;
const MAX_DEALS = 48;     // keep the feed tight and high-signal
const FEATURED_COUNT = 6;

function lowestDispensary(p) {
  let best = null, bestPrice = Infinity;
  for (const [id, price] of Object.entries(p.prices || {})) {
    if (typeof price === 'number' && price < bestPrice) { bestPrice = price; best = id; }
  }
  return best ? { id: best, price: bestPrice } : null;
}

const candidates = [];
for (const p of TCC.products) {
  const ph = (p.priceHistory || []).filter((x) => typeof x === 'number' && x > 0);
  if (ph.length < 2) continue;
  const cur = ph[ph.length - 1];
  const peak = Math.max(...ph);
  const dropD = peak - cur;
  const dropPct = peak > 0 ? (dropD / peak) * 100 : 0;
  if (cur >= peak || dropD < MIN_DROP_DOLLARS || dropPct < MIN_DROP_PCT || dropPct > MAX_DROP_PCT) continue;

  const low = lowestDispensary(p);
  if (!low) continue;

  candidates.push({
    productId: p.id,
    dispensaryId: low.id,
    title: p.name.split('|').map((s) => s.trim()).filter(Boolean).slice(0, 2).join(' ').slice(0, 48) || p.name.slice(0, 48),
    type: 'price-drop',
    discount: Math.round(dropPct),
    originalPrice: Math.round(peak * 100) / 100,
    salePrice: Math.round(cur * 100) / 100,
    _pct: dropPct,
  });
}

// Dedupe by product title + dispensary, keep the biggest drop; sort by % drop.
const seen = new Set();
const deals = candidates
  .sort((a, b) => b._pct - a._pct)
  .filter((d) => {
    const k = `${d.title.toLowerCase()}|${d.dispensaryId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  })
  .slice(0, MAX_DEALS)
  .map((d, i) => ({
    id: `d${String(i + 1).padStart(3, '0')}`,
    dispensaryId: d.dispensaryId,
    productId: d.productId,
    title: d.title,
    type: 'price-drop',
    discount: d.discount,
    originalPrice: d.originalPrice,
    salePrice: d.salePrice,
    featured: i < FEATURED_COUNT,
  }));

// Serialize and splice into data.js
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const dealsJs = deals.map((d) =>
  `  { id: '${d.id}', dispensaryId: '${esc(d.dispensaryId)}', productId: '${d.productId}', `
  + `title: '${esc(d.title)}', type: 'price-drop', discount: ${d.discount}, `
  + `originalPrice: ${d.originalPrice}, salePrice: ${d.salePrice}, featured: ${d.featured} }`
).join(',\n');

let content = fs.readFileSync(DATA, 'utf8');
const re = /(TCC\.deals = \[)[\s\S]*?(\n?\];)/;
if (!re.test(content)) { console.error('Could not find TCC.deals in data.js'); process.exit(1); }
content = content.replace(re, `$1\n${dealsJs}\n];`);
fs.writeFileSync(DATA, content);

console.log(`Generated ${deals.length} real price-drop deals (from ${candidates.length} detected drops).`);
if (deals[0]) console.log(`  Top: ${deals[0].title} $${deals[0].originalPrice} -> $${deals[0].salePrice} (-${deals[0].discount}%)`);
