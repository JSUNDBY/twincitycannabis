#!/usr/bin/env node
/**
 * Twin City Cannabis — SEO static page generator
 *
 * Reads js/data.js and emits SEO-friendly static HTML for:
 *   /dispensaries/{slug}/index.html  (one per dispensary, with LocalBusiness schema)
 *   /dispensaries/index.html         (index of all dispensaries)
 *   /products/{category}/index.html  (one per category, with ItemList schema)
 *   /products/index.html             (category hub)
 *   /sitemap.xml                     (all real URLs)
 *
 * These pages exist purely for crawlers + JS-disabled visitors. The interactive
 * SPA still lives at "/" — each static page links back to the matching SPA view.
 *
 * Run via: node scripts/build_seo.js
 * Auto-runs after every data scrape (see scraper/auto_scrape.sh).
 */

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://twincitycannabis.com';

// ---------- Load data.js by shimming a browser window ----------
global.window = {};
require(path.join(ROOT, 'js/data.js'));
const TCC = global.window.TCC || global.TCC;

if (!TCC || !TCC.dispensaries || !TCC.products) {
  console.error('Failed to load TCC data');
  process.exit(1);
}

// ---------- Helpers ----------
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const lowestPrice = (p) => {
  const v = Object.values(p.prices || {});
  return v.length ? Math.min(...v) : null;
};
const highestPrice = (p) => {
  const v = Object.values(p.prices || {});
  return v.length ? Math.max(...v) : null;
};

// ---------- Cannabis-only filter ----------
// Scraper data leaks accessories, snacks, papers, glassware, lab fees, etc.
// This filter is the last line of defense before products hit the SEO pages.
// Two layers: name regex blocklist, then per-category minimum price floors.
const ACCESSORY_RE = new RegExp(
  [
    // glass / hardware / accessories
    'bowl', 'pipe', 'bong', '\\brig\\b', 'banger', 'nail\\b', 'carb cap', 'dabber',
    'dab tool', 'dab rag', 'rags?\\b', '\\btray', 'holder', '\\bcase\\b', '\\bjar\\b',
    'ashtray', 'grinder', 'lighter', 'matches?', 'torch', 'butane',
    'battery', 'batteries', 'wick', '510 thread', 'mod\\b', '\\bcoil',
    'capsule', 'dosing capsule', 'humidor', 'boveda', 'humidipak',
    'cleaner', 'cleaning', 'cotton bud', 'cotton swab', 'q.?tip',
    '\\bkit\\b', 'starter kit', 'happy kit', 'dab kit',
    'nectar collector', 'dab grab', 'honey straw', 'silicone container',
    // vape devices / hardware (NOT cartridges with cannabis)
    'bud kup', '\\bkup\\b', '\\bgo stik\\b', '\\bstik\\b', 'roller\\b',
    '\\bpax\\b', 'dynavap', 'storz', 'volcano\\b', '\\bccell\\b', 'ccell go',
    'puffco', 'dr.? dabber', 'kandypens', 'davinci', 'firefly', 'pulsar',
    'kodo\\b', 'icons? - ', 'icons\\b',
    // papers / wraps / cones / tips (the actual paper, not infused pre-rolls)
    'rolling paper', 'rolling tray', 'raw cone', 'blunt cone', 'blunt cones',
    'pre.?rolled tips?', 'pre.?roll case', 'pre.?roll card', 'preroll card',
    'wraps?\\b', 'blunt wrap', 'hemp wrap',
    'filter tip', 'filter\\b', 'wood tip', 'glass tip', 'roach',
    // brands of accessories/papers
    '^raw ', '\\braw\\s', 'blazy', 'futurola', 'ooze', 'barbasol', 'king palm',
    'juicy jay', 'zig.?zag', 'elements\\b', 'ocb\\b',
    // labels / stickers / merch
    'velcro label', 'sticker', 'merch\\b', 't.?shirt', 'hoodie', 'hat\\b', 'beanie',
    // food / snacks (NOT edibles)
    'almonds?\\b', 'pretzels?\\b', 'popcorn', 'chips\\b', 'crackers?\\b',
    'beef jerky', 'jerky\\b', 'gum\\b(?!my)',
    // seeds (not consumable cannabis)
    'seeds?\\b', 'genetics\\b',
    // services / fees / non-products
    'donation', 'lab fee', 'testing fee', 'delivery fee', 'membership',
    'consultation', 'gift card', 'merchandise',
  ].join('|'),
  'i'
);

// Per-category minimum prices. Anything below is almost certainly an
// accessory, paper pack, or data error — real cannabis doesn't sell this low.
const MIN_PRICE_BY_CATEGORY = {
  'flower':       12,   // per gram, real flower in MN is $12-50
  'pre-roll':     5,    // mini joints can be cheap, $4 = papers
  'cartridge':    20,   // real carts $25+
  'edible':       4,    // single gummy floor
  'concentrate':  18,   // bargain rosin is $20+
  'topical':      8,    // bath bombs / lip balm gray area
  'tincture':     15,
  'beverage':     4,
};

// Category-specific whitelist rules — mirror the SPA filter in js/app.js
const _NOT_FLOWER_RE = /\b(cart(ridge)?|disposable|vape|shot|seltzer|soda|drink|tonic|lemonade|iced\s*tea|fl\s*oz|gummi|chocolate|candy|brownie|cookie|chew|mint|honey|lotion|balm|salve|bath\s*bomb|dab|wax|shatter|rosin|hash|tincture|dropper|capsule|softgel|book|bible|textbook|blend|deodorant|headband|blanket|guasha|bronners|soap\b|koozie|keychain|jewel|stoop|holiday|ornament|pack\b|box\b|scarf|buddy|pass\b|wash|immunity|mushroom|spirulina|wellness|roller|stik\b)\b/i;
const _NON_CANNABIS_SIGNAL_RE = /\b(mushroom|immunity|spirulina|wound|scarf|hat\b|shirt|blanket|deodorant|soap\b|tea\b|coffee|salt\b|wellness|bliss|mystery|flavor|magnesium|liver|ashwagandha|multivitamin|immune|organ|castor|canviva|pet\b|crochet|bone\b|mineral|probiotic|complex|supplement|rescue|wash\b|shield|guard|detox|cleanse|holistic|collagen|electrolyte|pre.?workout)\b/i;
const _FLOWER_WEIGHT_RE = /\b(1\/8|1\/4|1\/2|eighth|quarter|half\s*oz|ounce|oz\b|\d+(?:\.\d+)?\s*g\b|mixed\s*bud|whole\s*flower|pre.?pack)\b/i;
const _FLOWER_KEYWORD_RE = /\b(flower|bud|nug|smalls|popcorn|ground\b|shake\b)\b/i;
const _CART_KEYWORD_RE = /\b(cart(ridge)?s?|vape|vaporizer|disposable|pen|510|pod|pods|oil\b|distillate|live\s*resin|live\s*rosin|rosin\s*cart)\b/i;
const _MG_RE = /\b\d+\s*mg\b/i;
const _SUBSTRING_BLOCKLIST = [
  'crochet', 'canviva', 'graffe', 'lookah', 'spoon', 'flower and tree',
  'ashwagand', 'magnesium', 'spirulina', 'castor',
  'multivitamin', 'ps zinc', 'ps desiccated', 'ps liver', 'ps mineral',
  'immune rescue', 'organ complex', 'mushroom immunity',
  'fanny pack', 'koozie', 'keychain', 'scarf', 'headband',
  'bronners', 'dr. bronner', 'dandy blend', 'guasha',
];
const hasBlockedSubstring = (n) => {
  const ln = (n || '').toLowerCase();
  return _SUBSTRING_BLOCKLIST.some(b => ln.includes(b));
};

const looksLikeFlower = (p) => {
  const n = p.name || '';
  if (_NOT_FLOWER_RE.test(n)) return false;
  if (_MG_RE.test(n)) return false;
  if (_NON_CANNABIS_SIGNAL_RE.test(n)) return false;
  if (hasBlockedSubstring(n)) return false;
  if (_FLOWER_WEIGHT_RE.test(n) || _FLOWER_KEYWORD_RE.test(n)) return true;
  if (!/\d/.test(n) && /^[A-Za-z][A-Za-z '&.-]*$/.test(n) && n.split(/\s+/).filter(Boolean).length <= 3 && n.length >= 3) return true;
  return false;
};

const looksLikeCart = (p) => {
  const n = p.name || '';
  if (_NON_CANNABIS_SIGNAL_RE.test(n)) return false;
  if (hasBlockedSubstring(n)) return false;
  if (_CART_KEYWORD_RE.test(n)) return true;
  if (!/\d/.test(n) && n.split(/\s+/).filter(Boolean).length <= 4 && n.length >= 3) return true;
  return false;
};

const isRealCannabisProduct = (p) => {
  if (!p || !p.name) return false;
  if (ACCESSORY_RE.test(p.name)) return false;
  const lo = lowestPrice(p);
  if (lo == null) return false;
  const floor = MIN_PRICE_BY_CATEGORY[p.category];
  if (floor != null && lo < floor) return false;
  if (p.category === 'flower' && !looksLikeFlower(p)) return false;
  if (p.category === 'cartridge' && !looksLikeCart(p)) return false;
  return true;
};

const writePage = (relPath, html) => {
  const full = path.join(ROOT, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, html);
};

const today = new Date().toISOString().slice(0, 10);

// ---------- Shared chrome (nav/footer) ----------
const headOpen = ({ title, description, canonical, ogImage = '/og-image.png', schema = [] }) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${SITE}${ogImage}">
<meta property="og:site_name" content="Twin City Cannabis">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${SITE}${ogImage}">
<link rel="icon" type="image/png" sizes="32x32" href="/img/twin-city-cannabis-logo-32.png">
<link rel="icon" type="image/png" sizes="192x192" href="/img/twin-city-cannabis-logo-192.png">
<link rel="apple-touch-icon" href="/img/twin-city-cannabis-logo-192.png">
<link rel="stylesheet" href="/css/styles.css">
<script async src="https://www.googletagmanager.com/gtag/js?id=G-NEZH9HCSSH"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-NEZH9HCSSH');</script>
${schema.map(s => `<script type="application/ld+json">${JSON.stringify(s)}</script>`).join('\n')}
<style>
  body{background:var(--bg,#0a1410);color:var(--text-primary,#f5f6f8);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;margin:0;line-height:1.6}
  .seo-wrap{max-width:920px;margin:0 auto;padding:2rem 1.25rem 4rem}
  .seo-nav{display:flex;align-items:center;justify-content:space-between;padding:1rem 1.25rem;border-bottom:1px solid rgba(255,255,255,0.06);background:rgba(10,20,16,0.85);position:sticky;top:0;backdrop-filter:blur(10px);z-index:10}
  .seo-nav a.brand{display:flex;align-items:center;gap:.6rem;color:#f5f6f8;text-decoration:none;font-weight:700}
  .seo-nav a.brand img{height:36px;width:36px}
  .seo-nav .links a{color:#b8bcc4;text-decoration:none;margin-left:1.2rem;font-size:.95rem}
  .seo-nav .links a:hover{color:#22c55e}
  h1{font-size:clamp(1.8rem,4vw,2.6rem);line-height:1.15;margin:1.5rem 0 .5rem;letter-spacing:-.5px}
  h2{font-size:1.4rem;margin:2.5rem 0 .75rem;color:#f5f6f8}
  h3{font-size:1.05rem;margin:1.25rem 0 .25rem}
  p,li{color:#b8bcc4}
  a{color:#22c55e}
  .crumbs{font-size:.85rem;color:#8b909a;margin-bottom:.5rem}
  .crumbs a{color:#8b909a;text-decoration:none}
  .crumbs a:hover{color:#22c55e}
  .meta{display:flex;flex-wrap:wrap;gap:.5rem 1.25rem;color:#8b909a;font-size:.92rem;margin:.5rem 0 1.5rem}
  .stars{color:#f59e0b}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1rem;margin:1.5rem 0}
  .card{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:1.1rem 1.2rem;text-decoration:none;color:inherit;display:block;transition:border-color .2s,transform .2s}
  .card:hover{border-color:rgba(34,197,94,0.4);transform:translateY(-2px)}
  .card .title{color:#f5f6f8;font-weight:600;font-size:1rem;margin:0 0 .25rem}
  .card .sub{color:#8b909a;font-size:.85rem;margin:0}
  table{width:100%;border-collapse:collapse;margin:1rem 0;font-size:.94rem}
  th,td{text-align:left;padding:.6rem .5rem;border-bottom:1px solid rgba(255,255,255,0.06)}
  th{color:#8b909a;font-weight:500;font-size:.82rem;text-transform:uppercase;letter-spacing:.5px}
  td a{color:#f5f6f8;text-decoration:none}
  td a:hover{color:#22c55e}
  .price{color:#22c55e;font-weight:600}
  .review{background:rgba(255,255,255,0.03);border-left:3px solid #22c55e;padding:.85rem 1.1rem;border-radius:0 8px 8px 0;margin:.75rem 0}
  .review .author{font-weight:600;color:#f5f6f8;font-size:.9rem}
  .review .text{color:#b8bcc4;font-size:.92rem;margin:.35rem 0 0}
  .cta{display:inline-block;background:linear-gradient(135deg,#16a34a,#22c55e);color:#fff;padding:.85rem 1.6rem;border-radius:10px;text-decoration:none;font-weight:600;margin:1rem 0}
  footer{border-top:1px solid rgba(255,255,255,0.06);padding:2rem 1.25rem;text-align:center;color:#8b909a;font-size:.85rem;margin-top:3rem}
  footer a{color:#22c55e}
</style>
</head>
<body>
<nav class="seo-nav">
  <a class="brand" href="/"><img src="/img/twin-city-cannabis-logo-192.png" alt="Twin City Cannabis logo"> Twin City <span style="color:#22c55e">Cannabis</span></a>
  <div class="links">
    <a href="/">Home</a>
    <a href="/dispensaries/">Dispensaries</a>
    <a href="/products/">Products</a>
  </div>
</nav>
<main class="seo-wrap">
`;

const footer = `</main>
<footer>
  <p><strong style="color:#f5f6f8">Twin City Cannabis</strong> &middot; Real prices, real reviews, every Twin Cities dispensary.</p>
  <p><a href="/">Home</a> &middot; <a href="/dispensaries/">Dispensaries</a> &middot; <a href="/products/">Products</a> &middot; <a href="/events/">Events</a></p>
  <p><a href="/tax-calculator/">Tax Calculator</a> &middot; <a href="/dosage-calculator/">Dosage Calculator</a> &middot; <a href="/minnesota-cannabis-laws/">MN Cannabis Laws</a></p>
  <p style="margin-top:.75rem">Minneapolis &middot; Saint Paul &middot; Minnesota</p>
</footer>
</body>
</html>`;

// ---------- DISPENSARY PAGES ----------
const buildDispensaryPage = (d) => {
  const products = TCC.products
    .filter(p => p.prices && p.prices[d.id] != null && isRealCannabisProduct(p))
    .sort((a, b) => (a.prices[d.id] - b.prices[d.id]));

  const byCategory = {};
  products.forEach(p => {
    (byCategory[p.category] = byCategory[p.category] || []).push(p);
  });

  const reviews = (d.google && d.google.reviews) || [];
  const rating = d.google && d.google.rating;
  const reviewCount = (d.google && d.google.review_count) || d.review_count || 0;

  const title = `${d.name} — Menu, Prices & Reviews | ${d.city}, MN`;
  const description = `${d.name} in ${d.city}, MN. ${products.length > 0 ? `${products.length} products on the menu.` : 'Cannabis dispensary.'} ${rating ? `${rating}\u2605 from ${reviewCount} Google reviews.` : ''} Compare prices with every other Twin Cities dispensary on Twin City Cannabis.`.trim();
  const canonical = `${SITE}/dispensaries/${d.id}/`;

  // Schema.org LocalBusiness — the big SEO unlock
  const schema = [{
    '@context': 'https://schema.org',
    '@type': 'CannabisStore',
    name: d.name,
    image: d.img || `${SITE}/img/twin-city-cannabis-logo-512.png`,
    url: canonical,
    telephone: d.phone || undefined,
    address: (() => {
      const parts = (d.address || '').split(',').map(s => s.trim());
      return {
        '@type': 'PostalAddress',
        streetAddress: parts[0] || d.address,
        addressLocality: d.city || 'Minneapolis',
        addressRegion: 'MN',
        postalCode: (parts[2] || '').replace(/\D/g, '').slice(-5) || undefined,
        addressCountry: 'US'
      };
    })(),
    geo: (d.lat && d.lng) ? { '@type': 'GeoCoordinates', latitude: d.lat, longitude: d.lng } : undefined,
    aggregateRating: rating ? {
      '@type': 'AggregateRating',
      ratingValue: rating,
      reviewCount: reviewCount,
      bestRating: 5,
      worstRating: 1
    } : undefined,
    review: reviews.slice(0, 5).map(r => ({
      '@type': 'Review',
      author: { '@type': 'Person', name: r.author },
      reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5 },
      reviewBody: r.text,
      datePublished: today
    }))
  }, {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE },
      { '@type': 'ListItem', position: 2, name: 'Dispensaries', item: `${SITE}/dispensaries/` },
      { '@type': 'ListItem', position: 3, name: d.name, item: canonical }
    ]
  }];

  const starRow = rating ? `<span class="stars">${'★'.repeat(Math.round(rating))}${'☆'.repeat(5 - Math.round(rating))}</span> <strong>${rating}</strong> (${reviewCount} Google reviews)` : '';

  const menuHtml = Object.keys(byCategory).map(catId => {
    const cat = TCC.categories.find(c => c.id === catId);
    const catName = cat ? cat.name : catId;
    const items = byCategory[catId].slice(0, 25);
    return `
<h3>${esc(catName)} (${byCategory[catId].length})</h3>
<table>
<thead><tr><th>Product</th><th>Brand</th><th style="text-align:right">Price at ${esc(d.name)}</th><th style="text-align:right">Lowest in metro</th></tr></thead>
<tbody>
${items.map(p => {
  const here = p.prices[d.id];
  const lo = lowestPrice(p);
  const isBest = here === lo;
  return `<tr>
    <td><a href="/products/${esc(p.category)}/">${esc(p.name)}</a></td>
    <td>${esc(p.brand || '—')}</td>
    <td style="text-align:right" class="price">$${here.toFixed(2)}${isBest ? ' ✓' : ''}</td>
    <td style="text-align:right">$${lo.toFixed(2)}</td>
  </tr>`;
}).join('\n')}
</tbody>
</table>`;
  }).join('\n');

  const reviewsHtml = reviews.length ? `
<h2>What customers say on Google</h2>
${reviews.slice(0, 5).map(r => `
<div class="review">
  <div class="author">${esc(r.author)} <span class="stars">${'★'.repeat(r.rating)}</span></div>
  <p class="text">${esc(r.text)}</p>
</div>`).join('\n')}
${d.google && d.google.maps_url ? `<p><a href="${esc(d.google.maps_url)}" rel="nofollow noopener" target="_blank">See all reviews on Google →</a></p>` : ''}
` : '';

  return headOpen({ title, description, canonical, schema }) + `
<div class="crumbs"><a href="/">Home</a> / <a href="/dispensaries/">Dispensaries</a> / ${esc(d.name)}</div>
<h1>${esc(d.name)}</h1>
<div class="meta">
  ${starRow ? `<span>${starRow}</span>` : ''}
  ${d.address ? `<span>📍 ${esc(d.address)}</span>` : ''}
  ${d.phone ? `<span>📞 ${esc(d.phone)}</span>` : ''}
  ${d.hours && d.hours.note ? `<span>🕐 ${esc(d.hours.note)}</span>` : ''}
  ${d.website ? `<span><a href="${esc(d.website)}" rel="nofollow noopener" target="_blank">Official site →</a></span>` : ''}
</div>

<p>${esc(d.name)} is a cannabis dispensary in ${esc(d.city || 'the Twin Cities')}, Minnesota. ${products.length > 0 ? `Below is the current menu (${products.length} products), with each price compared against every other dispensary in the metro. Prices update daily.` : 'This listing is being indexed — full menu data is on its way.'}</p>

<a class="cta" href="/#dashboard/${esc(d.id)}">View interactive menu &amp; price compare →</a>

${products.length > 0 ? `<h2>Full menu &amp; live prices</h2>${menuHtml}` : ''}

${reviewsHtml}

<h2>Compare ${esc(d.name)} prices with every other Twin Cities dispensary</h2>
<p>Twin City Cannabis tracks prices daily across 33 dispensaries in the Minneapolis-Saint Paul metro. Use the interactive comparison to see if ${esc(d.name)} has the best deal on the products you want.</p>
<p><a class="cta" href="/#compare">Open price comparison tool →</a></p>
` + footer;
};

// ---------- DISPENSARIES INDEX ----------
const buildDispensariesIndex = () => {
  const title = 'All Twin Cities Cannabis Dispensaries — Menus, Prices & Reviews';
  const description = `Every cannabis dispensary in the Minneapolis-Saint Paul metro. ${TCC.dispensaries.length} dispensaries with real Google ratings, live menus, and daily price comparisons.`;
  const canonical = `${SITE}/dispensaries/`;

  const schema = [{
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: TCC.dispensaries.map((d, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${SITE}/dispensaries/${d.id}/`,
      name: d.name
    }))
  }];

  const cards = TCC.dispensaries
    .slice()
    .sort((a, b) => (b.tcc_score || 0) - (a.tcc_score || 0))
    .map(d => {
      const rating = d.google && d.google.rating;
      const rc = (d.google && d.google.review_count) || d.review_count || 0;
      return `<a class="card" href="/dispensaries/${esc(d.id)}/">
  <p class="title">${esc(d.name)}</p>
  <p class="sub">${esc(d.city || 'Twin Cities')}${rating ? ` &middot; <span class="stars">★</span> ${rating} (${rc})` : ''}</p>
</a>`;
    }).join('\n');

  return headOpen({ title, description, canonical, schema }) + `
<div class="crumbs"><a href="/">Home</a> / Dispensaries</div>
<h1>Every Twin Cities Cannabis Dispensary</h1>
<p>Real menus, real Google reviews, real prices — every recreational cannabis dispensary in the Minneapolis-Saint Paul metro area, all in one place. ${TCC.dispensaries.length} dispensaries tracked, prices updated daily.</p>
<a class="cta" href="/#dispensaries">Open interactive map &amp; filters →</a>
<div class="grid">
${cards}
</div>
` + footer;
};

// ---------- CATEGORY PAGES ----------
const buildCategoryPage = (cat) => {
  const products = TCC.products.filter(p => p.category === cat.id && isRealCannabisProduct(p));
  const sorted = products
    .slice()
    .sort((a, b) => (lowestPrice(a) || 9999) - (lowestPrice(b) || 9999));

  const title = `${cat.name} — Compare Prices Across Twin Cities Dispensaries`;
  const description = `${products.length} ${cat.name.toLowerCase()} products from Twin Cities dispensaries. Compare prices side-by-side, find the cheapest, see which dispensary has it. Updated daily.`;
  const canonical = `${SITE}/products/${cat.id}/`;

  const top = sorted.slice(0, 50);

  const schema = [{
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${cat.name} in the Twin Cities`,
    numberOfItems: products.length,
    itemListElement: top.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Product',
        name: p.name,
        brand: p.brand || undefined,
        image: p.image || undefined,
        offers: {
          '@type': 'AggregateOffer',
          priceCurrency: 'USD',
          lowPrice: lowestPrice(p),
          highPrice: highestPrice(p),
          offerCount: Object.keys(p.prices || {}).length
        }
      }
    }))
  }, {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE },
      { '@type': 'ListItem', position: 2, name: 'Products', item: `${SITE}/products/` },
      { '@type': 'ListItem', position: 3, name: cat.name, item: canonical }
    ]
  }];

  const rows = top.map(p => {
    const lo = lowestPrice(p);
    const hi = highestPrice(p);
    const offerCount = Object.keys(p.prices || {}).length;
    return `<tr>
  <td>${esc(p.name)}</td>
  <td>${esc(p.brand || '—')}</td>
  <td style="text-align:right" class="price">$${lo ? lo.toFixed(2) : '—'}</td>
  <td style="text-align:right">$${hi ? hi.toFixed(2) : '—'}</td>
  <td style="text-align:right">${offerCount}</td>
</tr>`;
  }).join('\n');

  return headOpen({ title, description, canonical, schema }) + `
<div class="crumbs"><a href="/">Home</a> / <a href="/products/">Products</a> / ${esc(cat.name)}</div>
<h1>${esc(cat.name)} in the Twin Cities</h1>
<p>${products.length} ${esc(cat.name.toLowerCase())} products tracked across 33 Minneapolis-Saint Paul dispensaries. Sorted by lowest price first.</p>
<a class="cta" href="/#compare">Open interactive comparison →</a>
<h2>Top ${top.length} cheapest ${esc(cat.name.toLowerCase())}</h2>
<table>
<thead><tr><th>Product</th><th>Brand</th><th style="text-align:right">Lowest</th><th style="text-align:right">Highest</th><th style="text-align:right">Stores</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
${products.length > top.length ? `<p style="color:#8b909a;font-size:.9rem">Showing top ${top.length} of ${products.length}. <a href="/#compare">See all ${products.length} on the comparison tool →</a></p>` : ''}
` + footer;
};

// ---------- PRODUCTS HUB ----------
const buildProductsHub = () => {
  const title = 'Browse Cannabis Products by Category — Twin City Cannabis';
  const description = `Browse 1,400+ cannabis products from every Twin Cities dispensary by category: flower, pre-rolls, cartridges, edibles, concentrates, and more. Live price comparison.`;
  const canonical = `${SITE}/products/`;

  const cards = TCC.categories.map(c => {
    const count = TCC.products.filter(p => p.category === c.id && isRealCannabisProduct(p)).length;
    return `<a class="card" href="/products/${esc(c.id)}/">
  <p class="title">${esc(c.name)}</p>
  <p class="sub">${count} products tracked</p>
</a>`;
  }).join('\n');

  return headOpen({ title, description, canonical }) + `
<div class="crumbs"><a href="/">Home</a> / Products</div>
<h1>Browse Cannabis Products by Category</h1>
<p>Every cannabis product tracked at Twin Cities dispensaries, organized by category. Click any category to see live prices across all 33 dispensaries.</p>
<div class="grid">
${cards}
</div>
` + footer;
};

// ---------- BRAND HELPERS ----------
const slugify = (s) => String(s).toLowerCase()
  .replace(/&/g, 'and')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const BRAND_BLOCKLIST = new Set([
  'house', 'gummies', 'disposable', 'cartridge', 'flower', 'vape',
  'disposable-vape-pen-ix', 'cartridge-vape-ix', 'pre-roll'
]);

const isJunkBrand = (name) => {
  const s = slugify(name);
  if (BRAND_BLOCKLIST.has(s)) return true;
  if (/-ix$/i.test(s)) return true;
  if (/\d+\s*mg/i.test(name)) return true;          // dosage in name = SKU not brand
  if (/\b(cbd|skincare|mocktail|seltzer|soda|gummies|infusions|narc|drops|tincture|pretzels|nano)\b/i.test(name)) return true;
  if (name.length > 28) return true;                // overlong = likely a product variant
  return false;
};

const getBrands = () => {
  const counts = {};
  TCC.products.forEach(p => {
    if (!p.brand) return;
    counts[p.brand] = (counts[p.brand] || 0) + 1;
  });
  return Object.entries(counts)
    .filter(([name, n]) => n >= 5)
    .filter(([name]) => !isJunkBrand(name))
    .map(([name, n]) => ({ name, slug: slugify(name), count: n }))
    .sort((a, b) => b.count - a.count);
};

// ---------- BRAND PAGE ----------
const buildBrandPage = (brand) => {
  const products = TCC.products
    .filter(p => p.brand === brand.name && isRealCannabisProduct(p))
    .sort((a, b) => (lowestPrice(a) || 9999) - (lowestPrice(b) || 9999));

  const carriedBy = new Set();
  products.forEach(p => Object.keys(p.prices || {}).forEach(id => carriedBy.add(id)));
  const dispensaries = Array.from(carriedBy)
    .map(id => TCC.dispensaries.find(d => d.id === id))
    .filter(Boolean);

  const title = `${brand.name} — Where to Buy in the Twin Cities | Prices & Dispensaries`;
  const description = `${brand.name} cannabis products at Twin Cities dispensaries. ${products.length} products tracked across ${dispensaries.length} stores. Compare prices, find the cheapest.`;
  const canonical = `${SITE}/brands/${brand.slug}/`;

  const schema = [{
    '@context': 'https://schema.org',
    '@type': 'Brand',
    name: brand.name,
    url: canonical,
    description: `${brand.name} is a cannabis brand carried at ${dispensaries.length} dispensaries in the Minneapolis-Saint Paul metro.`
  }, {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE },
      { '@type': 'ListItem', position: 2, name: 'Brands', item: `${SITE}/brands/` },
      { '@type': 'ListItem', position: 3, name: brand.name, item: canonical }
    ]
  }];

  const rows = products.slice(0, 50).map(p => {
    const lo = lowestPrice(p);
    const hi = highestPrice(p);
    return `<tr>
  <td>${esc(p.name)}</td>
  <td>${esc((TCC.categories.find(c => c.id === p.category) || {}).name || p.category)}</td>
  <td style="text-align:right" class="price">$${lo ? lo.toFixed(2) : '—'}</td>
  <td style="text-align:right">$${hi ? hi.toFixed(2) : '—'}</td>
  <td style="text-align:right">${Object.keys(p.prices || {}).length}</td>
</tr>`;
  }).join('\n');

  const dispLinks = dispensaries.map(d => `<a class="card" href="/dispensaries/${esc(d.id)}/"><p class="title">${esc(d.name)}</p><p class="sub">${esc(d.city || 'Twin Cities')}</p></a>`).join('\n');

  return headOpen({ title, description, canonical, schema }) + `
<div class="crumbs"><a href="/">Home</a> / <a href="/brands/">Brands</a> / ${esc(brand.name)}</div>
<h1>${esc(brand.name)}</h1>
<p>${esc(brand.name)} is a cannabis brand sold at ${dispensaries.length} Twin Cities dispensaries. We track ${products.length} ${esc(brand.name)} products with daily price updates so you can find the cheapest store carrying what you want.</p>
<a class="cta" href="/#compare">Compare ${esc(brand.name)} prices →</a>
<h2>${esc(brand.name)} products &amp; prices</h2>
<table>
<thead><tr><th>Product</th><th>Category</th><th style="text-align:right">Lowest</th><th style="text-align:right">Highest</th><th style="text-align:right">Stores</th></tr></thead>
<tbody>${rows}</tbody>
</table>
<h2>Dispensaries carrying ${esc(brand.name)}</h2>
<div class="grid">${dispLinks}</div>
` + footer;
};

const buildBrandsIndex = (brands) => {
  const title = 'Cannabis Brands Sold in the Twin Cities — Browse by Brand';
  const description = `Every cannabis brand carried at Minneapolis-Saint Paul dispensaries. ${brands.length} brands tracked with live pricing.`;
  const canonical = `${SITE}/brands/`;
  const schema = [{
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: brands.map((b, i) => ({
      '@type': 'ListItem', position: i + 1,
      url: `${SITE}/brands/${b.slug}/`, name: b.name
    }))
  }];

  const cards = brands.map(b => `<a class="card" href="/brands/${esc(b.slug)}/">
<p class="title">${esc(b.name)}</p>
<p class="sub">${b.count} products tracked</p>
</a>`).join('\n');

  return headOpen({ title, description, canonical, schema }) + `
<div class="crumbs"><a href="/">Home</a> / Brands</div>
<h1>Cannabis Brands in the Twin Cities</h1>
<p>${brands.length} brands carried across 33 Minneapolis-Saint Paul dispensaries, ranked by how many distinct products we track. Click any brand to see prices and which stores carry it.</p>
<div class="grid">${cards}</div>
` + footer;
};

// ---------- CITY PAGE ----------
const buildCityPage = (cityName, slug) => {
  const dispensaries = TCC.dispensaries.filter(d =>
    (d.city || '').toLowerCase() === cityName.toLowerCase());
  if (dispensaries.length === 0) return null;

  const title = `Cannabis Dispensaries in ${cityName}, MN — Menus, Prices & Reviews`;
  const description = `Every recreational cannabis dispensary in ${cityName}, Minnesota. ${dispensaries.length} stores with real Google ratings, live menus, and side-by-side price comparison. Updated daily.`;
  const canonical = `${SITE}/${slug}/`;

  const schema = [{
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Cannabis dispensaries in ${cityName}, MN`,
    itemListElement: dispensaries.map((d, i) => ({
      '@type': 'ListItem', position: i + 1,
      url: `${SITE}/dispensaries/${d.id}/`, name: d.name
    }))
  }];

  const cards = dispensaries.map(d => {
    const rating = d.google && d.google.rating;
    const rc = (d.google && d.google.review_count) || 0;
    return `<a class="card" href="/dispensaries/${esc(d.id)}/">
  <p class="title">${esc(d.name)}</p>
  <p class="sub">${esc(d.address || cityName)}${rating ? ` · <span class="stars">★</span> ${rating} (${rc})` : ''}</p>
</a>`;
  }).join('\n');

  return headOpen({ title, description, canonical, schema }) + `
<div class="crumbs"><a href="/">Home</a> / <a href="/dispensaries/">Dispensaries</a> / ${esc(cityName)}</div>
<h1>Cannabis Dispensaries in ${esc(cityName)}, Minnesota</h1>
<p>${dispensaries.length} recreational cannabis ${dispensaries.length === 1 ? 'dispensary' : 'dispensaries'} in ${esc(cityName)}. We track every menu, every price, every Google review — updated daily — so you can compare before you drive.</p>
<a class="cta" href="/#dispensaries">Open interactive map →</a>
<h2>All ${esc(cityName)} dispensaries</h2>
<div class="grid">${cards}</div>
<h2>Compare prices across ${esc(cityName)} stores</h2>
<p>Twin City Cannabis is the only place that shows real-time prices side-by-side across every recreational cannabis store in ${esc(cityName)} and the broader Minneapolis-Saint Paul metro. No affiliate links, no pay-to-play rankings.</p>
<p><a class="cta" href="/#compare">Compare ${esc(cityName)} prices →</a></p>
` + footer;
};

// ---------- BEST RATED ----------
const buildBestRatedPage = () => {
  const ranked = TCC.dispensaries
    .filter(d => d.google && d.google.rating)
    .sort((a, b) => {
      const rd = b.google.rating - a.google.rating;
      if (rd !== 0) return rd;
      return (b.google.review_count || 0) - (a.google.review_count || 0);
    });

  const title = `Best-Rated Cannabis Dispensaries in the Twin Cities (${today.slice(0, 4)})`;
  const description = `The highest-rated recreational cannabis dispensaries in Minneapolis-Saint Paul, ranked by real Google reviews. Updated daily with verified ratings.`;
  const canonical = `${SITE}/best-dispensaries-twin-cities/`;

  const rows = ranked.map((d, i) => `<tr>
  <td>${i + 1}</td>
  <td><a href="/dispensaries/${esc(d.id)}/">${esc(d.name)}</a></td>
  <td>${esc(d.city || '—')}</td>
  <td><span class="stars">★</span> <strong>${d.google.rating}</strong></td>
  <td style="text-align:right">${d.google.review_count}</td>
</tr>`).join('\n');

  return headOpen({ title, description, canonical }) + `
<div class="crumbs"><a href="/">Home</a> / Best-rated dispensaries</div>
<h1>Best-Rated Cannabis Dispensaries in the Twin Cities</h1>
<p>Ranked by real Google reviews — no editorial picks, no pay-to-play. Pulled directly from Google Maps and refreshed weekly. Last updated ${today}.</p>
<table>
<thead><tr><th>#</th><th>Dispensary</th><th>City</th><th>Rating</th><th style="text-align:right">Reviews</th></tr></thead>
<tbody>${rows}</tbody>
</table>
<h2>How we rank</h2>
<p>Every dispensary on Twin City Cannabis is matched against its Google Maps profile so the rating and review count you see are pulled from the source — not from our own opinion or paid placements. Free listings rank exactly the same as Featured listings.</p>
<a class="cta" href="/dispensaries/">See full dispensary directory →</a>
` + footer;
};

// ---------- CHEAPEST PAGE ----------
const buildCheapestPage = () => {
  const title = 'Cheapest Cannabis in the Twin Cities — Best Deals by Category';
  const description = `The cheapest cannabis products at Minneapolis-Saint Paul dispensaries, by category. Real prices, updated daily. Save money before you shop.`;
  const canonical = `${SITE}/cheapest-cannabis-twin-cities/`;

  const sections = TCC.categories.map(cat => {
    const top10 = TCC.products
      .filter(p => p.category === cat.id && isRealCannabisProduct(p))
      .sort((a, b) => lowestPrice(a) - lowestPrice(b))
      .slice(0, 10);
    if (top10.length === 0) return '';

    const rows = top10.map(p => {
      const lo = lowestPrice(p);
      const cheapestStoreId = Object.entries(p.prices).sort((a, b) => a[1] - b[1])[0][0];
      const store = TCC.dispensaries.find(d => d.id === cheapestStoreId);
      return `<tr>
  <td>${esc(p.name)}</td>
  <td class="price">$${lo.toFixed(2)}</td>
  <td>${store ? `<a href="/dispensaries/${esc(store.id)}/">${esc(store.name)}</a>` : '—'}</td>
</tr>`;
    }).join('\n');

    return `<h2>Cheapest ${esc(cat.name.toLowerCase())}</h2>
<table>
<thead><tr><th>Product</th><th>Lowest price</th><th>At dispensary</th></tr></thead>
<tbody>${rows}</tbody>
</table>
<p style="font-size:.9rem"><a href="/products/${esc(cat.id)}/">See all ${esc(cat.name.toLowerCase())} →</a></p>`;
  }).join('\n');

  return headOpen({ title, description, canonical }) + `
<div class="crumbs"><a href="/">Home</a> / Cheapest cannabis</div>
<h1>Cheapest Cannabis in the Twin Cities</h1>
<p>The lowest-priced products in every category, pulled from live menus across 33 Minneapolis-Saint Paul dispensaries. Prices update daily. Last refreshed ${today}.</p>
${sections}
<h2>Why prices vary</h2>
<p>Twin Cities cannabis is brand new — Minnesota only legalized recreational sales in August 2023. With dispensaries still ramping supply chains, the same product can cost $20 more at one store than another a few miles away. Twin City Cannabis is the only site that shows you the spread before you drive.</p>
<a class="cta" href="/#compare">Open interactive comparison →</a>
` + footer;
};

// ---------- PRODUCT PAGES (top N by # of stores carrying) ----------
const productSlug = (p) => slugify(p.name).slice(0, 80);

const buildProductPage = (p) => {
  const offerCount = Object.keys(p.prices || {}).length;
  const lo = lowestPrice(p);
  const hi = highestPrice(p);
  const sortedOffers = Object.entries(p.prices)
    .map(([id, price]) => ({ d: TCC.dispensaries.find(x => x.id === id), price }))
    .filter(x => x.d)
    .sort((a, b) => a.price - b.price);

  const cat = TCC.categories.find(c => c.id === p.category) || { id: p.category, name: p.category };
  const slug = productSlug(p);
  const canonical = `${SITE}/products/${cat.id}/${slug}/`;
  const title = `${p.name} — Compare Prices at ${offerCount} Twin Cities Dispensaries`;
  const savings = (hi - lo).toFixed(2);
  const description = `${p.name}${p.brand ? ' by ' + p.brand : ''} at ${offerCount} Minneapolis-Saint Paul dispensaries. Lowest $${lo.toFixed(2)}, highest $${hi.toFixed(2)} — save up to $${savings}. Updated daily.`;

  const schema = [{
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    brand: p.brand ? { '@type': 'Brand', name: p.brand } : undefined,
    image: p.image || undefined,
    description: `${p.name} from ${p.brand || 'a Twin Cities cannabis brand'}, available at ${offerCount} dispensaries in the Minneapolis-Saint Paul metro.`,
    category: cat.name,
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'USD',
      lowPrice: lo,
      highPrice: hi,
      offerCount,
      offers: sortedOffers.map(o => ({
        '@type': 'Offer',
        price: o.price,
        priceCurrency: 'USD',
        seller: { '@type': 'CannabisStore', name: o.d.name }
      }))
    }
  }, {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE },
      { '@type': 'ListItem', position: 2, name: 'Products', item: `${SITE}/products/` },
      { '@type': 'ListItem', position: 3, name: cat.name, item: `${SITE}/products/${cat.id}/` },
      { '@type': 'ListItem', position: 4, name: p.name, item: canonical }
    ]
  }];

  const rows = sortedOffers.map((o, i) => `<tr>
  <td>${i + 1}</td>
  <td><a href="/dispensaries/${esc(o.d.id)}/">${esc(o.d.name)}</a></td>
  <td>${esc(o.d.city || '—')}</td>
  <td style="text-align:right" class="price">$${o.price.toFixed(2)}${o.price === lo ? ' ✓ best' : ''}</td>
</tr>`).join('\n');

  return headOpen({ title, description, canonical, schema }) + `
<div class="crumbs"><a href="/">Home</a> / <a href="/products/">Products</a> / <a href="/products/${esc(cat.id)}/">${esc(cat.name)}</a> / ${esc(p.name)}</div>
<h1>${esc(p.name)}</h1>
<div class="meta">
  ${p.brand ? `<span>Brand: <a href="/brands/${esc(slugify(p.brand))}/">${esc(p.brand)}</a></span>` : ''}
  ${p.thc ? `<span>THC: ${esc(p.thc)}</span>` : ''}
  ${p.cbd ? `<span>CBD: ${esc(p.cbd)}</span>` : ''}
  ${p.weight ? `<span>Size: ${esc(p.weight)}</span>` : ''}
</div>
<p>${esc(p.name)} is currently sold at <strong>${offerCount} Twin Cities dispensaries</strong>. The cheapest store is selling it for <strong class="price">$${lo.toFixed(2)}</strong>, while the most expensive is at <strong>$${hi.toFixed(2)}</strong>. You can save up to <strong>$${savings}</strong> by checking the comparison below before you shop. Prices update daily.</p>

<a class="cta" href="/#compare">Open interactive price tracker →</a>

<h2>Where to buy ${esc(p.name)} in the Twin Cities</h2>
<table>
<thead><tr><th>#</th><th>Dispensary</th><th>City</th><th style="text-align:right">Price</th></tr></thead>
<tbody>${rows}</tbody>
</table>

<h2>About this product</h2>
<p>${esc(p.name)} is a ${esc(cat.name.toLowerCase().replace(/s$/, ''))}${p.brand ? ' from ' + esc(p.brand) : ''}${p.thc ? ` testing at ${esc(p.thc)} THC` : ''}. Twin City Cannabis tracks its price daily across every dispensary in the Minneapolis-Saint Paul metro that carries it, so you always know which store has the best deal before you leave home.</p>

<h2>More ${esc(cat.name.toLowerCase())} to compare</h2>
<p><a class="cta" href="/products/${esc(cat.id)}/">See all ${esc(cat.name.toLowerCase())} →</a></p>
` + footer;
};

// ---------- NEIGHBORHOOD PAGES ----------
// Hand-curated neighborhood centers for Minneapolis + Saint Paul. Each dispensary
// is assigned to its nearest neighborhood (Haversine), capped at ~1.5mi so distant
// stores don't get falsely lumped in.
const NEIGHBORHOODS = [
  { slug: 'northeast-minneapolis',     name: 'Northeast Minneapolis',          city: 'Minneapolis', lat: 45.0090, lng: -93.2470 },
  { slug: 'dinkytown-marcy-holmes',    name: 'Dinkytown / Marcy-Holmes',       city: 'Minneapolis', lat: 44.9810, lng: -93.2370 },
  { slug: 'north-loop-warehouse',      name: 'North Loop & Warehouse District',city: 'Minneapolis', lat: 44.9870, lng: -93.2750 },
  { slug: 'downtown-minneapolis',      name: 'Downtown Minneapolis',           city: 'Minneapolis', lat: 44.9740, lng: -93.2650 },
  { slug: 'uptown-lyn-lake',           name: 'Uptown / Lyn-Lake',              city: 'Minneapolis', lat: 44.9490, lng: -93.2880 },
  { slug: 'highland-park-saint-paul',  name: 'Highland Park, Saint Paul',      city: 'Saint Paul',  lat: 44.9210, lng: -93.1880 },
  { slug: 'macalester-groveland',      name: 'Macalester-Groveland, Saint Paul', city: 'Saint Paul', lat: 44.9300, lng: -93.1700 },
  { slug: 'midway-saint-paul',         name: 'Midway, Saint Paul',             city: 'Saint Paul',  lat: 44.9580, lng: -93.1910 },
];

const haversineMiles = (lat1, lng1, lat2, lng2) => {
  const R = 3958.8;
  const toRad = (x) => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const assignNeighborhood = (d) => {
  if (!d.lat || !d.lng) return null;
  let best = null;
  for (const n of NEIGHBORHOODS) {
    const miles = haversineMiles(d.lat, d.lng, n.lat, n.lng);
    if (miles > 1.5) continue;
    if (!best || miles < best.miles) best = { n, miles };
  }
  return best ? best.n : null;
};

const buildNeighborhoodPage = (n, dispensaries) => {
  const title = `Cannabis Dispensaries in ${n.name} | Twin City Cannabis`;
  const description = `Recreational cannabis dispensaries in ${n.name}. ${dispensaries.length} stores within walking or biking distance, with real Google reviews and live price comparison.`;
  const canonical = `${SITE}/neighborhoods/${n.slug}/`;

  const schema = [{
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Cannabis dispensaries in ${n.name}`,
    itemListElement: dispensaries.map((d, i) => ({
      '@type': 'ListItem', position: i + 1,
      url: `${SITE}/dispensaries/${d.id}/`, name: d.name
    }))
  }, {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE },
      { '@type': 'ListItem', position: 2, name: 'Neighborhoods', item: `${SITE}/neighborhoods/` },
      { '@type': 'ListItem', position: 3, name: n.name, item: canonical }
    ]
  }];

  const cards = dispensaries.map(d => {
    const rating = d.google && d.google.rating;
    const rc = (d.google && d.google.review_count) || 0;
    return `<a class="card" href="/dispensaries/${esc(d.id)}/">
  <p class="title">${esc(d.name)}</p>
  <p class="sub">${esc(d.address || n.city)}${rating ? ` &middot; <span class="stars">★</span> ${rating} (${rc})` : ''}</p>
</a>`;
  }).join('\n');

  return headOpen({ title, description, canonical, schema }) + `
<div class="crumbs"><a href="/">Home</a> / <a href="/neighborhoods/">Neighborhoods</a> / ${esc(n.name)}</div>
<h1>Cannabis Dispensaries in ${esc(n.name)}</h1>
<p>${dispensaries.length} recreational cannabis ${dispensaries.length === 1 ? 'dispensary' : 'dispensaries'} in ${esc(n.name)}. All within roughly 1.5 miles of the neighborhood center — most are walkable or a quick bike ride. Real Google reviews, real prices, updated daily.</p>
<a class="cta" href="/#dispensaries">Open the interactive map →</a>
<h2>Stores in ${esc(n.name)}</h2>
<div class="grid">${cards}</div>
<h2>Compare prices in ${esc(n.name)}</h2>
<p>Twin City Cannabis is the only place where you can compare what every nearby store is charging side-by-side before you walk in. Whether you're going to your closest shop or willing to bike a few blocks for a better deal, we show you the spread.</p>
<p><a class="cta" href="/#compare">Compare ${esc(n.name)} prices →</a></p>
` + footer;
};

const buildNeighborhoodsIndex = (groups) => {
  const title = 'Cannabis Dispensaries by Neighborhood — Minneapolis & Saint Paul';
  const description = `Browse Twin Cities cannabis dispensaries by neighborhood. ${groups.length} walkable neighborhood guides covering Northeast, Uptown, Highland Park, Midway, and more.`;
  const canonical = `${SITE}/neighborhoods/`;

  const cards = groups.map(g => `<a class="card" href="/neighborhoods/${esc(g.n.slug)}/">
  <p class="title">${esc(g.n.name)}</p>
  <p class="sub">${g.dispensaries.length} ${g.dispensaries.length === 1 ? 'dispensary' : 'dispensaries'}</p>
</a>`).join('\n');

  return headOpen({ title, description, canonical }) + `
<div class="crumbs"><a href="/">Home</a> / Neighborhoods</div>
<h1>Cannabis Dispensaries by Twin Cities Neighborhood</h1>
<p>The Minneapolis and Saint Paul cannabis scene is concentrated in a handful of walkable neighborhoods. Pick yours below to see every dispensary within ~1.5 miles, plus prices and reviews.</p>
<div class="grid">${cards}</div>
` + footer;
};

// ---------- LEGAL / CONTACT PAGES ----------
const buildTermsPage = () => {
  const title = 'Terms of Use — Twin City Cannabis';
  const description = 'Terms and conditions for using twincitycannabis.com — a free cannabis price comparison tool for the Minneapolis-Saint Paul metro.';
  const canonical = `${SITE}/terms/`;
  const schema = [{
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    url: canonical,
    datePublished: today,
    dateModified: today,
  }];

  return headOpen({ title, description, canonical, schema }) + `
<div class="crumbs"><a href="/">Home</a> / Terms</div>
<h1>Terms of Use</h1>
<p style="color:#8b909a;font-size:.9rem">Last updated: ${today}</p>

<p>Welcome to Twin City Cannabis ("we", "us", "our"). By using twincitycannabis.com (the "Site"), you agree to these terms. If you don't agree, please don't use the Site.</p>

<h2>1. Who can use this site</h2>
<p>The Site is intended for adults aged <strong>21 or older</strong>. By using the Site you affirm that you are 21 or older. The Site is intended for use within the state of Minnesota where adult-use recreational cannabis is legal.</p>

<h2>2. What we do (and don't do)</h2>
<p>Twin City Cannabis is a free, independent price comparison tool. We aggregate publicly available menu data, ratings, and reviews from licensed cannabis dispensaries in the Minneapolis-Saint Paul metro area.</p>
<ul>
  <li><strong>We don't sell cannabis.</strong> All purchases happen at the dispensary, not on this Site.</li>
  <li><strong>We don't deliver cannabis.</strong></li>
  <li><strong>We don't accept payment from consumers.</strong> The Site is free to use.</li>
  <li><strong>We're not affiliated with any dispensary unless explicitly stated.</strong> Featured and Premium tier dispensaries pay for additional visibility but never influence organic rankings.</li>
</ul>

<h2>3. Accuracy of information</h2>
<p>We work hard to keep prices, menus, hours, and other dispensary information accurate and up to date. Our scraper updates multiple times per day. However, dispensary inventory and pricing can change at any moment, and we cannot guarantee that what you see on the Site matches what you'll find in store at any given moment.</p>
<p><strong>Always verify with the dispensary directly</strong> before traveling to make a purchase.</p>

<h2>4. Reviews and ratings</h2>
<p>Reviews displayed on the Site are pulled from public Google Maps profiles. Star ratings reflect Google's aggregate score at the time of last fetch. We do not edit, moderate, or curate review content — what's on Google is what shows up here.</p>

<h2>5. Health and safety</h2>
<p>Cannabis affects everyone differently. The Site provides general information about cannabis products, methods, and effects, but it is not medical, legal, or health advice. Effects vary based on dosage, body weight, metabolism, food intake, tolerance, and individual chemistry.</p>
<ul>
  <li>Do not consume cannabis if you are pregnant, nursing, or planning to become pregnant.</li>
  <li>Do not operate a vehicle, machinery, or perform tasks that require alertness while under the influence.</li>
  <li>Keep cannabis products out of reach of children and pets.</li>
  <li>Consult a healthcare provider if you have a medical condition or are taking medication.</li>
</ul>

<h2>6. Acceptable use</h2>
<p>You agree not to:</p>
<ul>
  <li>Scrape or copy Site content for commercial republication without permission</li>
  <li>Submit false reviews or impersonate dispensaries or other users</li>
  <li>Attempt to reverse-engineer, attack, or interfere with the Site or its infrastructure</li>
  <li>Use the Site if you are under 21 or in a jurisdiction where cannabis is illegal</li>
</ul>

<h2>7. Third-party links</h2>
<p>The Site links to dispensary websites, Google Maps, and other third-party services. We're not responsible for the content, accuracy, or practices of those sites.</p>

<h2>8. Disclaimer of warranties</h2>
<p>The Site is provided "as is" and "as available", without warranties of any kind, express or implied. We don't guarantee that the Site will be uninterrupted, error-free, or completely accurate.</p>

<h2>9. Limitation of liability</h2>
<p>To the maximum extent allowed by law, Twin City Cannabis is not liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Site, including but not limited to lost profits, lost data, or any cannabis purchase decision made based on Site information.</p>

<h2>10. Dispensary listings &amp; paid tiers</h2>
<p>Every licensed Twin Cities dispensary is listed for free. Featured ($299/month) and Premium ($599/month) tiers add extra visibility in clearly-labeled sections of the Site. Paid tiers do not influence organic search rankings, the TCC Score, or review display.</p>

<h2>11. Changes to these terms</h2>
<p>We may update these terms from time to time. The "Last updated" date at the top will reflect the most recent revision. Continued use of the Site after changes means you accept the updated terms.</p>

<h2>12. Contact</h2>
<p>Questions about these terms? Email <a href="mailto:hello@twincitycannabis.com">hello@twincitycannabis.com</a>.</p>

<p style="margin-top:3rem;font-size:.85rem;color:#8b909a">Twin City Cannabis is operated independently in Minneapolis, Minnesota.</p>
` + footer;
};

const buildPrivacyPage = () => {
  const title = 'Privacy Policy — Twin City Cannabis';
  const description = 'How Twin City Cannabis collects, uses, and protects your information. Plain-English privacy policy.';
  const canonical = `${SITE}/privacy/`;
  const schema = [{
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    url: canonical,
    datePublished: today,
    dateModified: today,
  }];

  return headOpen({ title, description, canonical, schema }) + `
<div class="crumbs"><a href="/">Home</a> / Privacy</div>
<h1>Privacy Policy</h1>
<p style="color:#8b909a;font-size:.9rem">Last updated: ${today}</p>

<p>This is the plain-English version of how Twin City Cannabis ("we", "us", "our") handles information about you when you use twincitycannabis.com.</p>

<h2>The short version</h2>
<ul>
  <li>We don't sell your data. Ever.</li>
  <li>We don't ask you to create an account.</li>
  <li>We don't track you across other websites.</li>
  <li>We use Google Analytics and Meta Pixel to understand site traffic, and Kit (formerly ConvertKit) for the optional email signup.</li>
  <li>If you sign up for price alerts or contact us, we keep your email and any info you submit, and use it only to send you what you signed up for.</li>
</ul>

<h2>What we collect</h2>

<h3>Automatically (via analytics)</h3>
<p>When you visit the Site, our analytics tools collect standard web data:</p>
<ul>
  <li>Pages you view and how long you spend on them</li>
  <li>Approximate location (city / region, not precise GPS)</li>
  <li>Device type, browser, screen size, operating system</li>
  <li>How you found us (search engine, direct link, social media)</li>
  <li>Anonymous identifiers in cookies (so we can tell repeat visitors from new ones)</li>
</ul>
<p>This data is aggregated and used to understand which pages are useful, which dispensaries are popular, and how to improve the Site.</p>

<h3>When you sign up</h3>
<p>If you submit the price alerts form, the dispensary inquiry form, or otherwise contact us, we collect:</p>
<ul>
  <li>Your email address</li>
  <li>Your name (if you provide it)</li>
  <li>Anything else you choose to include in the form (dispensary name, phone, message)</li>
</ul>

<h2>How we use it</h2>
<ul>
  <li><strong>To send you what you signed up for</strong> — price alerts, occasional updates, or a personal reply if you contacted us</li>
  <li><strong>To improve the Site</strong> — what's working, what's broken, what people want more of</li>
  <li><strong>To respond to dispensary inquiries</strong> — when a dispensary owner contacts us about a listing</li>
</ul>

<h2>Who has access</h2>
<p>We use the following third-party services. Your data is subject to their respective privacy policies:</p>
<ul>
  <li><strong>Google Analytics</strong> — anonymous traffic analytics. <a href="https://policies.google.com/privacy" rel="nofollow noopener" target="_blank">Google's policy</a></li>
  <li><strong>Meta Pixel (Facebook)</strong> — used for understanding ad performance if we ever run ads. <a href="https://www.facebook.com/policy.php" rel="nofollow noopener" target="_blank">Meta's policy</a></li>
  <li><strong>Kit (ConvertKit)</strong> — handles the email signup forms and sends emails. <a href="https://kit.com/privacy" rel="nofollow noopener" target="_blank">Kit's policy</a></li>
  <li><strong>Stripe</strong> — handles payment processing if a dispensary subscribes to a paid tier. We never see your full credit card number. <a href="https://stripe.com/privacy" rel="nofollow noopener" target="_blank">Stripe's policy</a></li>
  <li><strong>Cloudflare</strong> — runs the small backend that handles dispensary tier upgrades. <a href="https://www.cloudflare.com/privacypolicy/" rel="nofollow noopener" target="_blank">Cloudflare's policy</a></li>
  <li><strong>GitHub Pages</strong> — hosts the website itself. <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement" rel="nofollow noopener" target="_blank">GitHub's policy</a></li>
</ul>

<h2>Cookies</h2>
<p>The Site uses cookies for analytics and to remember your theme preference (light/dark mode). You can disable cookies in your browser settings, but some Site features may not work correctly.</p>

<h2>Your choices</h2>
<ul>
  <li><strong>Unsubscribe from emails</strong> — every email we send has an unsubscribe link in the footer. One click and you're out.</li>
  <li><strong>Delete your data</strong> — email <a href="mailto:hello@twincitycannabis.com">hello@twincitycannabis.com</a> and we'll remove your email and any info you've submitted.</li>
  <li><strong>Opt out of analytics</strong> — install a browser extension like uBlock Origin or Privacy Badger.</li>
</ul>

<h2>Children</h2>
<p>The Site is intended for adults 21 and older. We do not knowingly collect information from anyone under 21. If you believe we have, contact us and we'll delete it.</p>

<h2>Changes to this policy</h2>
<p>We may update this policy from time to time. The "Last updated" date at the top will reflect the most recent revision.</p>

<h2>Contact</h2>
<p>Questions, requests, or concerns? Email <a href="mailto:hello@twincitycannabis.com">hello@twincitycannabis.com</a>.</p>
` + footer;
};

const buildContactPage = () => {
  const title = 'Contact — Twin City Cannabis';
  const description = 'Get in touch with Twin City Cannabis. For questions, listing corrections, partnerships, and dispensary inquiries.';
  const canonical = `${SITE}/contact/`;
  const schema = [{
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    name: title,
    url: canonical,
  }];

  return headOpen({ title, description, canonical, schema }) + `
<div class="crumbs"><a href="/">Home</a> / Contact</div>
<h1>Get in Touch</h1>
<p>Twin City Cannabis is built and maintained by one person — me, Josh — based in the Twin Cities. I read and reply to every message personally. No autoresponders, no support tickets, no phone tree.</p>

<h2>Email</h2>
<p style="font-size:1.15rem"><a href="mailto:hello@twincitycannabis.com">hello@twincitycannabis.com</a></p>
<p>I usually reply within 24 hours.</p>

<h2>What to email me about</h2>
<ul>
  <li><strong>Listing corrections</strong> — wrong hours, wrong address, missing menu, outdated info on your dispensary</li>
  <li><strong>Dispensary inquiries</strong> — Featured / Premium tier upgrades, free 30-day trials, custom requests</li>
  <li><strong>Press &amp; partnerships</strong> — local journalism, podcast guests, content collaborations</li>
  <li><strong>Bug reports</strong> — something broken or weird on the site</li>
  <li><strong>Feature requests</strong> — what would you want to see?</li>
  <li><strong>Just saying hi</strong> — always welcome</li>
</ul>

<h2>Dispensary owners — claim your listing</h2>
<p>Every Twin Cities dispensary is already listed for free. If you're a dispensary owner who wants to update info, see analytics, or upgrade to a paid tier with extra visibility, the dispensary signup form is the fastest path:</p>
<a class="cta" href="/#for-dispensaries">For dispensaries →</a>

<h2>Mailing address</h2>
<p>Twin City Cannabis<br>Minneapolis, Minnesota</p>

<p style="margin-top:3rem;font-size:.85rem;color:#8b909a">For privacy and security reasons we don't publish a physical street address. All communication is via email.</p>
` + footer;
};

// ---------- EVENTS PAGE ----------
const buildEventsPage = () => {
  const title = 'Minnesota Cannabis Events 2026 — Twin City Cannabis';
  const description = 'Upcoming cannabis events, expos, and industry meetups in Minnesota. CannaFest, NECANN, Legacy Cup, and more.';
  const canonical = `${SITE}/events/`;
  const schema = [{
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title, url: canonical, description, dateModified: today,
  }];

  return headOpen({ title, description, canonical, schema }) + `
<style>
/* ─── Full-page Aurora Night Sky ─── */
body{background:#030712 !important}

/* Fixed sky background that shows behind all content */
.night-sky{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;background:linear-gradient(180deg,#030712 0%,#051015 40%,#081a12 75%,#0a1f15 100%)}

/* Stars */
.sky-stars{position:absolute;inset:0;
  background-image:
    radial-gradient(1px 1px at 7% 12%,rgba(255,255,255,.8),transparent),
    radial-gradient(1.5px 1.5px at 18% 6%,rgba(255,255,240,.9),transparent),
    radial-gradient(1px 1px at 30% 20%,rgba(255,255,255,.6),transparent),
    radial-gradient(1px 1px at 42% 4%,rgba(240,240,255,.7),transparent),
    radial-gradient(2px 2px at 55% 15%,rgba(255,255,255,.9),transparent),
    radial-gradient(1px 1px at 68% 9%,rgba(255,255,240,.5),transparent),
    radial-gradient(1px 1px at 80% 22%,rgba(255,255,255,.7),transparent),
    radial-gradient(1.5px 1.5px at 92% 5%,rgba(240,240,255,.8),transparent),
    radial-gradient(1px 1px at 12% 32%,rgba(255,255,255,.4),transparent),
    radial-gradient(1px 1px at 35% 38%,rgba(255,255,240,.5),transparent),
    radial-gradient(1.5px 1.5px at 50% 28%,rgba(255,255,255,.7),transparent),
    radial-gradient(1px 1px at 75% 35%,rgba(255,255,255,.5),transparent),
    radial-gradient(1px 1px at 88% 26%,rgba(240,240,255,.6),transparent),
    radial-gradient(1px 1px at 22% 44%,rgba(255,255,255,.3),transparent),
    radial-gradient(1px 1px at 62% 40%,rgba(255,255,240,.4),transparent),
    radial-gradient(2px 2px at 5% 8%,rgba(255,255,255,.9),transparent),
    radial-gradient(1px 1px at 47% 10%,rgba(255,255,255,.6),transparent),
    radial-gradient(1px 1px at 73% 3%,rgba(255,255,240,.7),transparent);
  animation:sky-twinkle 5s ease-in-out infinite alternate}
@keyframes sky-twinkle{0%{opacity:.6}100%{opacity:1}}

/* Aurora — soft diffused bands across the sky */
.sky-aurora{position:absolute;top:0;left:-10%;width:120%;height:60%;filter:blur(80px);opacity:.4;
  background:
    radial-gradient(ellipse 80% 50% at 25% 40%,rgba(34,197,94,.35),transparent 70%),
    radial-gradient(ellipse 60% 40% at 55% 30%,rgba(56,189,248,.2),transparent 65%),
    radial-gradient(ellipse 70% 45% at 75% 45%,rgba(34,197,94,.25),transparent 70%);
  animation:sky-aurora-move 25s ease-in-out infinite alternate}
.sky-aurora-2{position:absolute;top:5%;left:0;width:100%;height:50%;filter:blur(100px);opacity:.25;
  background:
    radial-gradient(ellipse 50% 60% at 40% 35%,rgba(139,92,246,.2),transparent 65%),
    radial-gradient(ellipse 70% 40% at 70% 50%,rgba(16,185,129,.2),transparent 70%);
  animation:sky-aurora-move2 35s ease-in-out 5s infinite alternate}
@keyframes sky-aurora-move{
  0%{transform:translateX(0) translateY(0)}
  50%{transform:translateX(3%) translateY(-10px)}
  100%{transform:translateX(-2%) translateY(5px)}
}
@keyframes sky-aurora-move2{
  0%{transform:translateX(0) scale(1)}
  50%{transform:translateX(-4%) scale(1.08)}
  100%{transform:translateX(2%) scale(0.95)}
}

/* Misty clouds drifting slowly */
.sky-mist{position:absolute;width:200%;height:40%;filter:blur(60px);opacity:.12}
.sky-mist-1{top:20%;left:-50%;
  background:radial-gradient(ellipse at 30% 50%,rgba(200,220,210,.4),transparent 50%),
    radial-gradient(ellipse at 70% 40%,rgba(180,200,190,.3),transparent 45%);
  animation:mist-drift 60s linear infinite}
.sky-mist-2{top:35%;left:-80%;
  background:radial-gradient(ellipse at 40% 50%,rgba(180,210,200,.3),transparent 50%),
    radial-gradient(ellipse at 65% 45%,rgba(200,220,210,.2),transparent 45%);
  animation:mist-drift 90s linear 15s infinite}
@keyframes mist-drift{
  0%{transform:translateX(0)}
  100%{transform:translateX(50%)}
}

/* Horizon glow */
.sky-horizon{position:absolute;bottom:12%;left:0;right:0;height:20%;
  background:linear-gradient(180deg,transparent,rgba(34,197,94,.06) 50%,rgba(34,197,94,.1) 80%,rgba(16,163,74,.05));
  filter:blur(25px)}

/* Pine trees — fixed at bottom of viewport */
.sky-trees{position:fixed;bottom:0;left:0;right:0;height:160px;z-index:1;pointer-events:none}
.sky-trees svg{width:100%;height:100%;display:block}

/* All page content floats above */
.seo-nav{position:relative;z-index:10}
.seo-wrap{position:relative;z-index:5;padding-bottom:180px}
.seo-wrap .card{background:rgba(6,18,16,.85);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.seo-wrap h1{text-shadow:0 2px 30px rgba(0,0,0,.6)}
.seo-wrap h2{text-shadow:0 1px 15px rgba(0,0,0,.4)}
footer{position:relative;z-index:5;background:rgba(6,18,16,.95) !important;padding-bottom:180px}

@media (prefers-reduced-motion:reduce){
  .sky-stars,.sky-aurora,.sky-aurora-2,.sky-mist-1,.sky-mist-2{animation:none !important}
}
@media (max-width:768px){
  .sky-trees{height:100px}
  .seo-wrap{padding-bottom:120px}
  footer{padding-bottom:120px}
}

/* ─── EVENT PAGE HERO ─── */
.events-hero{position:relative;margin:1.5rem 0 2.5rem;padding:3rem 2rem 2.5rem;
  border-radius:20px;overflow:hidden;
  background:
    radial-gradient(ellipse at 20% 0%,rgba(34,197,94,.18),transparent 55%),
    radial-gradient(ellipse at 85% 100%,rgba(139,92,246,.12),transparent 60%),
    linear-gradient(160deg,rgba(10,30,20,.75),rgba(6,18,14,.9));
  border:1px solid rgba(34,197,94,.2);
  backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.events-hero::before{content:'';position:absolute;top:-20px;right:-20px;width:180px;height:180px;
  background:radial-gradient(circle,rgba(34,197,94,.15),transparent 70%);pointer-events:none}
.events-hero-eyebrow{color:#22c55e;font-weight:800;font-size:.78rem;letter-spacing:3px;
  text-transform:uppercase;margin:0 0 .7rem}
.events-hero h1{font-size:clamp(2rem,5vw,3.2rem);line-height:1.05;margin:0 0 .8rem;color:#f5f6f8;
  letter-spacing:-.02em;font-weight:800}
.events-hero h1 .accent{color:#22c55e}
.events-hero-sub{color:#b8bcc4;font-size:clamp(.95rem,1.6vw,1.1rem);line-height:1.55;max-width:640px;margin:0 0 1.5rem}
.events-hero-stats{display:flex;flex-wrap:wrap;gap:1.5rem 2.5rem;margin-top:1.2rem;padding-top:1.2rem;
  border-top:1px solid rgba(255,255,255,.08)}
.events-hero-stat{display:flex;flex-direction:column}
.events-hero-stat-num{font-family:var(--font-display,Inter,sans-serif);font-size:1.6rem;font-weight:800;color:#22c55e;line-height:1}
.events-hero-stat-label{font-size:.7rem;color:#8b909a;text-transform:uppercase;letter-spacing:1.2px;margin-top:.35rem;font-weight:600}
@media (max-width:560px){.events-hero{padding:2.2rem 1.4rem 1.8rem}}

/* ─── SUBMIT CTA BANNER ─── */
.events-submit-cta{margin:2.5rem 0;padding:1.8rem 2rem;border-radius:16px;
  background:linear-gradient(135deg,rgba(34,197,94,.12),rgba(34,197,94,.04));
  border:1px solid rgba(34,197,94,.3);
  display:flex;align-items:center;justify-content:space-between;gap:1.5rem;flex-wrap:wrap}
.events-submit-cta-text{min-width:0;flex:1 1 320px}
.events-submit-cta-title{color:#f5f6f8;font-size:1.2rem;font-weight:700;margin:0 0 .3rem;letter-spacing:-.01em}
.events-submit-cta-desc{color:#b8bcc4;font-size:.92rem;margin:0;line-height:1.5}
.events-submit-cta-btn{display:inline-flex;align-items:center;gap:.5rem;padding:.9rem 1.4rem;
  background:linear-gradient(135deg,#16a34a,#22c55e);color:#fff !important;font-weight:700;
  font-size:.95rem;border-radius:12px;text-decoration:none;white-space:nowrap;
  box-shadow:0 6px 20px rgba(34,197,94,.35);transition:transform .15s ease,box-shadow .15s ease}
.events-submit-cta-btn:hover{transform:translateY(-2px);box-shadow:0 10px 28px rgba(34,197,94,.5)}

/* ─── EVENT CARDS ─── */
.events-intro{color:#b8bcc4;font-size:1rem;margin:0 0 2rem;max-width:640px}
.events-section-head{display:flex;align-items:baseline;gap:.8rem;margin:2.5rem 0 1.2rem;
  padding-bottom:.6rem;border-bottom:1px solid rgba(34,197,94,.18)}
.events-section-head h2{margin:0;color:#f5f6f8}
.events-section-count{color:#22c55e;font-size:.8rem;font-weight:700;padding:.2rem .6rem;
  background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.25);border-radius:999px}

.event-card{position:relative;display:grid;grid-template-columns:130px 1fr;gap:1.5rem;
  background:rgba(6,18,14,.85);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
  border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:1.4rem;margin:1rem 0;
  transition:transform .25s ease,border-color .25s ease,box-shadow .25s ease;overflow:hidden}
.event-card:hover{border-color:rgba(34,197,94,.45);transform:translateY(-3px);
  box-shadow:0 16px 44px rgba(0,0,0,.5),0 0 40px rgba(34,197,94,.12)}
.event-card::before{content:'';position:absolute;inset:0;background:
  radial-gradient(ellipse at top right,rgba(34,197,94,.06),transparent 60%);pointer-events:none}
@media (max-width:560px){.event-card{grid-template-columns:100px 1fr;gap:1rem;padding:1rem}}

.event-date{display:flex;flex-direction:column;align-items:center;justify-content:center;
  padding:.9rem .6rem;border-radius:12px;text-align:center;position:relative;
  background:linear-gradient(180deg,rgba(34,197,94,.14),rgba(22,163,74,.04));
  border:1px solid rgba(34,197,94,.28)}
.event-date-month{color:#22c55e;font-weight:800;font-size:.78rem;letter-spacing:1.5px;
  text-transform:uppercase;line-height:1}
.event-date-day{color:#f5f6f8;font-weight:900;font-size:2.8rem;line-height:1;margin:.25rem 0;
  font-variant-numeric:tabular-nums;text-shadow:0 2px 14px rgba(34,197,94,.3)}
.event-date-range{color:#f5f6f8;font-weight:800;font-size:1.5rem;line-height:1.05;margin:.35rem 0;
  font-variant-numeric:tabular-nums}
.event-date-year{color:#8b909a;font-size:.7rem;letter-spacing:1px;font-weight:600}
@media (max-width:560px){.event-date{padding:.6rem}.event-date-day{font-size:2.2rem}}

.event-countdown{display:block;margin-top:.45rem;padding:.2rem .55rem;font-size:.65rem;
  font-weight:700;letter-spacing:.7px;text-transform:uppercase;border-radius:999px;
  background:rgba(34,197,94,.15);border:1px solid rgba(34,197,94,.3);color:#22c55e;white-space:nowrap}
.event-countdown.soon{background:rgba(245,158,11,.2);border-color:rgba(245,158,11,.5);color:#fbbf24;
  animation:cd-pulse 2s ease-in-out infinite}
.event-countdown.today{background:rgba(239,68,68,.2);border-color:rgba(239,68,68,.5);color:#ef4444}
.event-countdown.past{background:rgba(120,120,120,.12);border-color:rgba(120,120,120,.3);color:#8b909a}
@keyframes cd-pulse{0%,100%{box-shadow:0 0 0 0 rgba(245,158,11,.35)}50%{box-shadow:0 0 0 5px rgba(245,158,11,0)}}

.event-body{min-width:0;position:relative;z-index:1}
.event-type{display:inline-flex;align-items:center;gap:.35rem;padding:.22rem .6rem;
  background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:999px;
  font-size:.66rem;color:#b8bcc4;text-transform:uppercase;letter-spacing:1.1px;font-weight:700;
  margin-bottom:.55rem}
.event-title{color:#f5f6f8;font-size:1.4rem;font-weight:800;line-height:1.15;margin:0 0 .35rem;
  letter-spacing:-.4px}
.event-tagline{color:#22c55e;font-weight:600;font-size:.95rem;margin:0 0 .6rem;font-style:italic}
.event-meta{display:flex;flex-wrap:wrap;gap:.35rem 1rem;color:#8b909a;font-size:.85rem;margin:.15rem 0 .8rem}
.event-meta span{display:inline-flex;align-items:center;gap:.3rem;white-space:nowrap}
.event-desc{color:#b8bcc4;font-size:.95rem;line-height:1.55;margin:.4rem 0}
.event-audience{color:#7a7f88;font-size:.8rem;font-style:italic;margin:.5rem 0 .9rem}
.event-cta{display:inline-flex;align-items:center;gap:.4rem;padding:.6rem 1.1rem;
  background:linear-gradient(135deg,#16a34a,#22c55e);color:#fff !important;font-weight:700;
  font-size:.85rem;border-radius:10px;text-decoration:none;transition:transform .15s ease,box-shadow .15s ease;
  box-shadow:0 4px 14px rgba(34,197,94,.3)}
.event-cta:hover{transform:translateY(-2px);box-shadow:0 8px 22px rgba(34,197,94,.45)}
.event-cta-ig{color:#8b909a !important;font-size:.8rem;text-decoration:none;margin-left:.8rem}
.event-cta-ig:hover{color:#22c55e !important}

.event-sponsors{display:flex;flex-wrap:wrap;gap:.4rem;margin:.9rem 0;
  padding:.65rem .85rem;background:rgba(255,255,255,.03);border-radius:10px;
  border:1px solid rgba(255,255,255,.06)}
.event-sponsors-label{color:#8b909a;font-size:.66rem;text-transform:uppercase;letter-spacing:1.3px;
  font-weight:800;margin-right:.3rem;align-self:center}
.event-sponsor{padding:.28rem .65rem;background:rgba(34,197,94,.08);
  border:1px solid rgba(34,197,94,.18);border-radius:999px;color:#d4f5e0;
  font-size:.72rem;font-weight:600}

.event-featured{border:1px solid rgba(34,197,94,.4);
  box-shadow:0 20px 60px rgba(0,0,0,.5),0 0 80px rgba(34,197,94,.1)}
.event-featured-ribbon{position:absolute;top:0;left:0;right:0;text-align:center;padding:.4rem;
  background:linear-gradient(90deg,#15803d,#22c55e,#15803d);color:#fff;font-weight:800;
  font-size:.7rem;text-transform:uppercase;letter-spacing:2.5px;z-index:2}
.event-featured{padding-top:2.6rem !important}
.event-featured .event-title{font-size:1.65rem}

.org-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1rem;margin:1.2rem 0}
.org-card{background:rgba(6,18,14,.8);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.08);
  border-radius:12px;padding:1.2rem;transition:all .2s ease}
.org-card:hover{border-color:rgba(34,197,94,.35);transform:translateY(-2px)}
.org-card h3{margin:0 0 .4rem;color:#f5f6f8;font-size:1.05rem}
.org-card p{color:#b8bcc4;font-size:.88rem;margin:.3rem 0;line-height:1.5}
.org-card a{color:#22c55e;font-size:.85rem;font-weight:600;text-decoration:none}
.org-card a:hover{text-decoration:underline}

.events-footer-block{margin-top:3rem;padding:1.8rem;background:rgba(6,18,14,.85);
  backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.08);border-radius:14px}
.events-footer-block h2{margin-top:0}
</style>

<!-- Full-page night sky background -->
<div class="night-sky">
  <div class="sky-stars"></div>
  <div class="sky-aurora"></div>
  <div class="sky-aurora-2"></div>
  <div class="sky-mist sky-mist-1"></div>
  <div class="sky-mist sky-mist-2"></div>
  <div class="sky-horizon"></div>
</div>

<!-- Trees fixed at bottom of viewport -->
<div class="sky-trees">
  <svg viewBox="0 0 1600 160" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0a1a12"/>
        <stop offset="100%" stop-color="#061210"/>
      </linearGradient>
    </defs>
    <!-- Far trees (lighter, misty) -->
    <g fill="#0c1f16" opacity=".5">
      <polygon points="20,160 30,95 33,110 36,75 39,105 42,55 45,100 48,80 51,108 54,92 57,115 60,160"/>
      <polygon points="100,160 108,100 111,80 114,98 117,60 120,92 123,45 126,88 129,72 132,100 135,160"/>
      <polygon points="200,160 210,105 214,82 218,100 222,58 226,95 230,42 234,90 238,75 242,102 246,160"/>
      <polygon points="330,160 338,98 342,78 346,96 350,55 354,90 358,40 362,85 366,70 370,98 374,160"/>
      <polygon points="460,160 468,102 472,80 476,98 480,56 484,92 488,38 492,86 496,72 500,100 504,160"/>
      <polygon points="580,160 588,95 592,76 596,94 600,52 604,88 608,36 612,84 616,68 620,96 624,160"/>
      <polygon points="710,160 718,100 722,78 726,96 730,54 734,90 738,38 742,86 746,70 750,98 754,160"/>
      <polygon points="840,160 848,98 852,76 856,94 860,52 864,88 868,35 872,84 876,68 880,96 884,160"/>
      <polygon points="970,160 978,102 982,80 986,98 990,56 994,92 998,40 1002,88 1006,72 1010,100 1014,160"/>
      <polygon points="1100,160 1108,96 1112,78 1116,96 1120,54 1124,90 1128,38 1132,86 1136,70 1140,98 1144,160"/>
      <polygon points="1230,160 1238,100 1242,80 1246,98 1250,58 1254,92 1258,42 1262,88 1266,72 1270,100 1274,160"/>
      <polygon points="1370,160 1378,95 1382,76 1386,94 1390,52 1394,88 1398,36 1402,84 1406,68 1410,96 1414,160"/>
      <polygon points="1500,160 1508,98 1512,78 1516,96 1520,55 1524,90 1528,40 1532,86 1536,70 1540,98 1544,160"/>
    </g>
    <!-- Near trees (darker, taller, prominent) -->
    <g fill="url(#tg)">
      <polygon points="0,160 8,110 11,85 14,108 17,60 20,100 23,40 26,95 29,70 32,105 35,88 38,115 45,160"/>
      <polygon points="55,160 65,105 68,80 72,102 76,52 80,95 84,30 88,90 92,65 96,100 100,82 104,112 112,160"/>
      <polygon points="140,160 148,108 152,82 156,105 160,55 164,98 168,32 172,92 176,68 180,102 184,85 188,115 195,160"/>
      <polygon points="240,160 250,100 254,75 258,98 262,48 266,90 270,28 274,85 278,62 282,95 286,78 290,108 298,160"/>
      <polygon points="350,160 358,105 362,78 366,100 370,50 374,92 378,30 382,88 386,64 390,98 394,80 398,110 406,160"/>
      <polygon points="440,160 450,102 454,76 458,98 462,48 466,90 470,26 474,86 478,62 482,96 486,78 490,108 498,160"/>
      <polygon points="540,160 548,108 552,82 556,104 560,54 564,96 568,32 572,90 576,66 580,100 584,82 588,112 596,160"/>
      <polygon points="640,160 650,100 654,74 658,96 662,46 666,88 670,24 674,84 678,60 682,94 686,76 690,106 698,160"/>
      <polygon points="750,160 758,106 762,80 766,102 770,52 774,94 778,30 782,88 786,64 790,98 794,80 798,110 806,160"/>
      <polygon points="850,160 860,102 864,76 868,98 872,48 876,90 880,28 884,86 888,62 892,96 896,78 900,108 908,160"/>
      <polygon points="950,160 958,108 962,82 966,104 970,54 974,96 978,32 982,90 986,66 990,100 994,82 998,112 1006,160"/>
      <polygon points="1050,160 1060,100 1064,74 1068,96 1072,46 1076,88 1080,24 1084,84 1088,60 1092,94 1096,76 1100,106 1108,160"/>
      <polygon points="1150,160 1158,106 1162,80 1166,102 1170,52 1174,94 1178,30 1182,88 1186,64 1190,98 1194,80 1198,110 1206,160"/>
      <polygon points="1250,160 1260,102 1264,76 1268,98 1272,48 1276,90 1280,28 1284,86 1288,62 1292,96 1296,78 1300,108 1308,160"/>
      <polygon points="1350,160 1358,108 1362,82 1366,104 1370,54 1374,96 1378,32 1382,90 1386,66 1390,100 1394,82 1398,112 1406,160"/>
      <polygon points="1450,160 1460,100 1464,74 1468,96 1472,46 1476,88 1480,24 1484,84 1488,60 1492,94 1496,76 1500,106 1508,160"/>
      <polygon points="1550,160 1558,106 1562,80 1566,102 1570,52 1574,94 1578,30 1582,88 1586,64 1590,98 1594,80 1598,110 1600,160"/>
    </g>
    <rect x="0" y="148" width="1600" height="12" fill="#061210"/>
  </svg>
</div>

<script>
// Subtle parallax on the stars and aurora
(function(){
  var stars = document.querySelector('.sky-stars');
  var aurora = document.querySelector('.sky-aurora');
  if (!stars || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var t = false;
  window.addEventListener('scroll', function(){
    if (!t) { requestAnimationFrame(function(){
      var y = window.scrollY;
      stars.style.transform = 'translateY(' + (y * 0.12) + 'px)';
      if (aurora) aurora.style.transform = 'translateY(' + (y * 0.06) + 'px)';
      t = false;
    }); t = true; }
  });
})();
</script>

<div class="crumbs"><a href="/">Home</a> / Events</div>

<section class="events-hero">
  <div class="events-hero-eyebrow">Minnesota Cannabis Calendar</div>
  <h1>Every MN cannabis event,<br><span class="accent">in one place.</span></h1>
  <p class="events-hero-sub">Festivals, fashion shows, B2B conventions, community meetups &mdash; sorted by date with live countdowns. If it&rsquo;s happening in Minnesota cannabis, it&rsquo;s here.</p>
  <div class="events-hero-stats">
    <div class="events-hero-stat"><span class="events-hero-stat-num" id="hero-upcoming">&nbsp;</span><span class="events-hero-stat-label">Upcoming events</span></div>
    <div class="events-hero-stat"><span class="events-hero-stat-num">3</span><span class="events-hero-stat-label">Recurring orgs</span></div>
    <div class="events-hero-stat"><span class="events-hero-stat-num">Free</span><span class="events-hero-stat-label">Always</span></div>
  </div>
</section>

<div class="events-section-head">
  <h2>Upcoming events</h2>
  <span class="events-section-count" id="upcoming-count">&nbsp;</span>
</div>

<!-- CannaFest -->
<article class="event-card" data-event-date="2026-04-16">
  <div class="event-date">
    <div class="event-date-month">Apr</div>
    <div class="event-date-day">16</div>
    <div class="event-date-year">2026</div>
    <span class="event-countdown" data-countdown>&nbsp;</span>
  </div>
  <div class="event-body">
    <div class="event-type">&#127863; Product Showcase</div>
    <div class="event-title">CannaFest 2026</div>
    <div class="event-meta">
      <span>&#128337; Thu 6:00 &ndash; 9:00 PM</span>
      <span>&#128205; The Lowlands, St. Paul</span>
      <span>&#127915; $40</span>
    </div>
    <p class="event-desc">Premium product showcase in a meet-the-makers format. Talk directly with Minnesota cannabis brands, sample products, and connect with the community.</p>
    <p class="event-audience">Good for consumers who want to explore products and meet brands face-to-face.</p>
    <a class="event-cta" href="https://events.humanitix.com/cannafest-2026" rel="noopener" target="_blank">Get tickets &rarr;</a>
  </div>
</article>

<!-- Smokin on the Runway — FEATURED -->
<article class="event-card event-featured" data-event-date="2026-05-03">
  <div class="event-featured-ribbon">&#9733; Featured Event</div>
  <div class="event-date">
    <div class="event-date-month">May</div>
    <div class="event-date-day">3</div>
    <div class="event-date-year">2026</div>
    <span class="event-countdown" data-countdown>&nbsp;</span>
  </div>
  <div class="event-body">
    <div class="event-type">&#128092; Fashion &middot; Culture</div>
    <div class="event-title">Smokin on the Runway</div>
    <p class="event-tagline">MN&rsquo;s Canna Fashion Show &mdash; &ldquo;Together Again, Rooted in Community&rdquo;</p>
    <div class="event-meta">
      <span>&#128337; Sun 4:00 &ndash; 10:00 PM</span>
      <span>&#128205; The Hook &amp; Ladder, 3010 Minnehaha Ave, Minneapolis</span>
    </div>
    <p class="event-desc">Cannabis meets fashion on the runway. A night of live shows, local cannabis culture, and community connection.</p>
    <div class="event-sponsors">
      <span class="event-sponsors-label">Sponsors</span>
      <span class="event-sponsor">K&uuml;ressence</span>
      <span class="event-sponsor">Cannon J&rsquo;s</span>
      <span class="event-sponsor">Stone Daze</span>
      <span class="event-sponsor">21 Simpatico</span>
      <span class="event-sponsor">NECANN</span>
      <span class="event-sponsor">Zen</span>
      <span class="event-sponsor">Cannon Coffee</span>
      <span class="event-sponsor">Foundry Nation</span>
    </div>
    <a class="event-cta" href="https://thehookmpls.com/event/smokin-on-the-runway/" rel="noopener" target="_blank">Get tickets &rarr;</a>
    <a class="event-cta-ig" href="https://www.instagram.com/smokinontherunway/" rel="noopener" target="_blank">&#9656; @smokinontherunway</a>
  </div>
</article>

<!-- NECANN -->
<article class="event-card" data-event-date="2026-05-14">
  <div class="event-date">
    <div class="event-date-month">May</div>
    <div class="event-date-range">14&ndash;15</div>
    <div class="event-date-year">2026</div>
    <span class="event-countdown" data-countdown>&nbsp;</span>
  </div>
  <div class="event-body">
    <div class="event-type">&#127970; B2B Convention</div>
    <div class="event-title">NECANN Minnesota Cannabis Convention</div>
    <div class="event-meta">
      <span>&#128197; Two-day convention</span>
      <span>&#128205; Minneapolis Convention Center</span>
    </div>
    <p class="event-desc">The biggest B2B cannabis event in the state. 120+ exhibitors, 60+ speakers, thousands of attendees. Networking, education, and industry deals.</p>
    <p class="event-audience">Good for dispensary owners, industry professionals, and anyone building a cannabis business in Minnesota.</p>
    <a class="event-cta" href="https://necann.com/minnesota-convention/" rel="noopener" target="_blank">Learn more &amp; register &rarr;</a>
  </div>
</article>

<!-- Legacy Cup -->
<article class="event-card" data-event-date="2026-09-26">
  <div class="event-date">
    <div class="event-date-month">Sep</div>
    <div class="event-date-day">26</div>
    <div class="event-date-year">2026</div>
    <span class="event-countdown" data-countdown>&nbsp;</span>
  </div>
  <div class="event-body">
    <div class="event-type">&#127881; Festival</div>
    <div class="event-title">Legacy Cup Minnesota</div>
    <div class="event-meta">
      <span>&#128197; Saturday, all-day</span>
      <span>&#128205; Surly Festival Field, Minneapolis</span>
    </div>
    <p class="event-desc">Minnesota&rsquo;s first licensed cannabis festival. Flower competition, live music (past headliners include Killer Mike and Lupe Fiasco), skate demos, art, food. Running annually since 2019.</p>
    <p class="event-audience">Good for everyone. The big consumer-facing event of the year.</p>
    <a class="event-cta" href="https://legacycupmn.com/" rel="noopener" target="_blank">Learn more &rarr;</a>
  </div>
</article>

<div class="events-submit-cta">
  <div class="events-submit-cta-text">
    <p class="events-submit-cta-title">Got an event? Tell us about it.</p>
    <p class="events-submit-cta-desc">Hosting a cannabis event in Minnesota, or know about one we&rsquo;re missing? Send us the details and we&rsquo;ll add it to the calendar. Free, always.</p>
  </div>
  <a class="events-submit-cta-btn" href="mailto:hello@twincitycannabis.com?subject=Event%20Submission">Email hello@twincitycannabis.com &rarr;</a>
</div>

<div class="events-section-head">
  <h2>Recurring meetups &amp; organizations</h2>
</div>

<div class="org-grid">
  <div class="org-card">
    <h3>Canna Connect MN</h3>
    <p>Regular cannabis community events, education, and The Canna Connect Show podcast.</p>
    <a href="https://cannaconnectmn.com" rel="nofollow noopener" target="_blank">cannaconnectmn.com &rarr;</a>
  </div>
  <div class="org-card">
    <h3>SotaCann</h3>
    <p>Member-based organization offering industry meetups, education events, and legislative updates.</p>
    <a href="https://www.sotacann.org" rel="nofollow noopener" target="_blank">sotacann.org &rarr;</a>
  </div>
  <div class="org-card">
    <h3>MN Cannabis Growers Co-op</h3>
    <p>Co-op with networking events, group purchasing, and legislative advocacy.</p>
    <a href="https://mncannabis.coop" rel="nofollow noopener" target="_blank">mncannabis.coop &rarr;</a>
  </div>
</div>

<div class="events-footer-block">
  <h2 style="margin-top:0">Dispensary openings</h2>
  <p>New dispensaries are opening across the Twin Cities every month. We track every new opening automatically.</p>
  <p><a class="cta" href="/dispensaries/">Browse all ${TCC.dispensaries.length} dispensaries &rarr;</a></p>

  <h2 style="margin-top:2rem">Know about an event we&rsquo;re missing?</h2>
  <p>Email <a href="mailto:hello@twincitycannabis.com">hello@twincitycannabis.com</a> and we&rsquo;ll add it.</p>

  <h2 style="margin-top:2rem">Want to partner on an event?</h2>
  <p>Twin City Cannabis tracks ${TCC.products.length.toLocaleString()}+ products across ${TCC.dispensaries.length} dispensaries with real-time pricing. If you&rsquo;re organizing a cannabis event in Minnesota and want a data partner or media coverage, <a href="/contact/">get in touch</a>.</p>
</div>

<script>
// Live countdown — re-renders every minute
(function(){
  var MS_DAY = 86400000;
  function tick(){
    var now = new Date(); now.setHours(0,0,0,0);
    var upcoming = 0;
    document.querySelectorAll('.event-card[data-event-date]').forEach(function(card){
      var when = new Date(card.getAttribute('data-event-date') + 'T00:00:00');
      var days = Math.round((when - now) / MS_DAY);
      var badge = card.querySelector('[data-countdown]');
      if (!badge) return;
      badge.classList.remove('soon','today','past');
      if (days < 0) { badge.textContent = 'Past'; badge.classList.add('past'); card.style.opacity = '0.55'; }
      else if (days === 0) { badge.textContent = 'Today'; badge.classList.add('today'); upcoming++; }
      else if (days === 1) { badge.textContent = 'Tomorrow'; badge.classList.add('soon'); upcoming++; }
      else if (days <= 14) { badge.textContent = 'In ' + days + ' days'; badge.classList.add('soon'); upcoming++; }
      else { badge.textContent = 'In ' + days + ' days'; upcoming++; }
    });
    var c = document.getElementById('upcoming-count');
    if (c) c.textContent = upcoming;
    var h = document.getElementById('hero-upcoming');
    if (h) h.textContent = upcoming;
  }
  tick();
  setInterval(tick, 60000);
})();
</script>
` + footer;
};

// ---------- LAWS PAGE ----------
const buildLawsPage = () => {
  const title = 'Minnesota Cannabis Laws — What\u2019s Legal in 2026';
  const description = `Plain-English guide to Minnesota recreational cannabis laws: possession limits, where you can use it, driving, public consumption, and home growing. Updated 2026.`;
  const canonical = `${SITE}/minnesota-cannabis-laws/`;

  const schema = [{
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: 'Minnesota Cannabis Laws — What\u2019s Legal in 2026',
    description,
    datePublished: today,
    dateModified: today,
    author: { '@type': 'Organization', name: 'Twin City Cannabis' },
    publisher: {
      '@type': 'Organization', name: 'Twin City Cannabis',
      logo: { '@type': 'ImageObject', url: `${SITE}/img/twin-city-cannabis-logo-512.png` }
    },
    mainEntityOfPage: canonical
  }];

  return headOpen({ title, description, canonical, schema }) + `
<div class="crumbs"><a href="/">Home</a> / Minnesota cannabis laws</div>
<h1>Minnesota Cannabis Laws — What\u2019s Legal in 2026</h1>
<p>Minnesota legalized recreational cannabis on August 1, 2023. Here\u2019s the plain-English version of what adults 21+ can and can\u2019t do, current as of ${today}.</p>

<h2>How much can I have?</h2>
<p>Adults 21 and over can possess up to <strong>2 ounces of cannabis flower</strong> in public, <strong>2 pounds at home</strong>, <strong>8 grams of concentrate</strong>, and <strong>edibles containing up to 800 mg of THC</strong>.</p>

<h2>Where can I buy it?</h2>
<p>Only at licensed retail dispensaries. <a href="/dispensaries/">Twin City Cannabis lists every licensed dispensary in the metro</a> with current menus and prices.</p>

<h2>Where can I use it?</h2>
<ul>
  <li><strong>Yes:</strong> private property (with the owner\u2019s permission)</li>
  <li><strong>No:</strong> in a vehicle (even as a passenger), in public, on school grounds, or anywhere smoking tobacco is banned</li>
  <li><strong>No:</strong> federal land — that includes national parks and federal buildings</li>
</ul>

<h2>Driving</h2>
<p>It is illegal to drive under the influence of cannabis in Minnesota. There is no per-se THC limit like alcohol\u2019s 0.08 BAC — impairment is determined by the officer and field sobriety tests. Treat it like alcohol: do not drive impaired.</p>

<h2>Home growing</h2>
<p>Adults 21+ can grow up to <strong>8 cannabis plants</strong> at home, with no more than 4 mature/flowering at once. Plants must be in an enclosed, locked space not visible from public view.</p>

<h2>Out-of-state visitors</h2>
<p>Non-residents 21+ can purchase and possess the same amounts as residents. You cannot legally transport cannabis across state lines, including into Wisconsin or Iowa where it remains illegal.</p>

<h2>Expungement</h2>
<p>Minnesota is automatically expunging eligible low-level cannabis convictions. You don\u2019t need to apply — the state Cannabis Expungement Board is processing records on a rolling basis.</p>

<a class="cta" href="/dispensaries/">Browse Twin Cities dispensaries →</a>

<p style="margin-top:2rem;font-size:.85rem;color:#8b909a">This page is informational and not legal advice. For the official statute, see Minnesota Statutes Chapter 342.</p>
` + footer;
};

// ---------- SITEMAP ----------
const buildSitemap = (extras = []) => {
  const urls = [
    { loc: `${SITE}/`,                         priority: '1.0', changefreq: 'daily' },
    { loc: `${SITE}/dispensaries/`,            priority: '0.9', changefreq: 'daily' },
    { loc: `${SITE}/products/`,                priority: '0.9', changefreq: 'daily' },
    { loc: `${SITE}/brands/`,                  priority: '0.8', changefreq: 'weekly' },
    { loc: `${SITE}/best-dispensaries-twin-cities/`, priority: '0.8', changefreq: 'weekly' },
    { loc: `${SITE}/cheapest-cannabis-twin-cities/`, priority: '0.8', changefreq: 'daily' },
    { loc: `${SITE}/minnesota-cannabis-laws/`, priority: '0.7', changefreq: 'monthly' },
    { loc: `${SITE}/tax-calculator/`,          priority: '0.8', changefreq: 'monthly' },
    { loc: `${SITE}/dosage-calculator/`,       priority: '0.7', changefreq: 'monthly' },
    { loc: `${SITE}/events/`,                  priority: '0.7', changefreq: 'weekly' },
    { loc: `${SITE}/terms/`,                   priority: '0.3', changefreq: 'yearly' },
    { loc: `${SITE}/privacy/`,                 priority: '0.3', changefreq: 'yearly' },
    { loc: `${SITE}/contact/`,                 priority: '0.5', changefreq: 'monthly' },
    ...TCC.dispensaries.map(d => ({
      loc: `${SITE}/dispensaries/${d.id}/`,    priority: '0.8', changefreq: 'daily'
    })),
    ...TCC.categories.map(c => ({
      loc: `${SITE}/products/${c.id}/`,        priority: '0.7', changefreq: 'daily'
    })),
    ...extras,
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;
};

// ---------- BUILD ----------
let count = 0;
const extraSitemap = [];

// Dispensaries
TCC.dispensaries.forEach(d => {
  writePage(`dispensaries/${d.id}/index.html`, buildDispensaryPage(d));
  count++;
});
writePage('dispensaries/index.html', buildDispensariesIndex());
count++;

// Categories
TCC.categories.forEach(c => {
  writePage(`products/${c.id}/index.html`, buildCategoryPage(c));
  count++;
});
writePage('products/index.html', buildProductsHub());
count++;

// Brands
const brands = getBrands();
brands.forEach(b => {
  writePage(`brands/${b.slug}/index.html`, buildBrandPage(b));
  extraSitemap.push({ loc: `${SITE}/brands/${b.slug}/`, priority: '0.6', changefreq: 'weekly' });
  count++;
});
writePage('brands/index.html', buildBrandsIndex(brands));
count++;

// City landing pages (auto-generated for every city with ≥1 dispensary)
const cities = [...new Set(TCC.dispensaries.map(d => d.city).filter(Boolean))];
const citySlug = (c) => `${slugify(c)}-cannabis-dispensaries`;
cities.forEach(city => {
  const html = buildCityPage(city, citySlug(city));
  if (html) {
    writePage(`${citySlug(city)}/index.html`, html);
    extraSitemap.push({ loc: `${SITE}/${citySlug(city)}/`, priority: '0.7', changefreq: 'weekly' });
    count++;
  }
});

// Long-tail content pages
writePage('best-dispensaries-twin-cities/index.html', buildBestRatedPage());
count++;
writePage('cheapest-cannabis-twin-cities/index.html', buildCheapestPage());
count++;
writePage('minnesota-cannabis-laws/index.html', buildLawsPage());
count++;
writePage('events/index.html', buildEventsPage());
count++;
writePage('terms/index.html', buildTermsPage());
count++;
writePage('privacy/index.html', buildPrivacyPage());
count++;
writePage('contact/index.html', buildContactPage());
count++;

// Per-product pages — top by offer count, min 3 stores carrying. Highest-value
// long-tail SEO surfaces ("Vireo Blue Dream cartridge minneapolis price").
const topProducts = TCC.products
  .filter(p => Object.keys(p.prices || {}).length >= 3 && isRealCannabisProduct(p))
  .sort((a, b) => Object.keys(b.prices).length - Object.keys(a.prices).length)
  .slice(0, 100);
const seenProductSlugs = new Set();
topProducts.forEach(p => {
  let slug = productSlug(p);
  if (!slug) return;
  let final = slug, n = 2;
  while (seenProductSlugs.has(`${p.category}/${final}`)) { final = `${slug}-${n++}`; }
  seenProductSlugs.add(`${p.category}/${final}`);
  // store final slug for sitemap
  p._seoSlug = final;
  writePage(`products/${p.category}/${final}/index.html`, buildProductPage(p));
  extraSitemap.push({ loc: `${SITE}/products/${p.category}/${final}/`, priority: '0.6', changefreq: 'daily' });
  count++;
});

// Neighborhood pages
const neighborhoodGroups = NEIGHBORHOODS.map(n => ({
  n,
  dispensaries: TCC.dispensaries.filter(d => {
    const assigned = assignNeighborhood(d);
    return assigned && assigned.slug === n.slug;
  })
})).filter(g => g.dispensaries.length > 0);

neighborhoodGroups.forEach(g => {
  writePage(`neighborhoods/${g.n.slug}/index.html`, buildNeighborhoodPage(g.n, g.dispensaries));
  extraSitemap.push({ loc: `${SITE}/neighborhoods/${g.n.slug}/`, priority: '0.7', changefreq: 'weekly' });
  count++;
});
writePage('neighborhoods/index.html', buildNeighborhoodsIndex(neighborhoodGroups));
extraSitemap.push({ loc: `${SITE}/neighborhoods/`, priority: '0.8', changefreq: 'weekly' });
count++;

// ============================================================================
// DISPENSARY VS DISPENSARY COMPARISON PAGES
// ============================================================================
// Auto-generates /compare/A-vs-B/ pages for the top ~25 metro dispensaries by
// TCC score. Pure long-tail SEO play — people search "bloomn vs wildflower"
// and there's literally no good answer right now.
const buildVsPage = (a, b) => {
  const title = `${a.name} vs ${b.name} — Price & Score Comparison | Twin City Cannabis`;
  const description = `Side-by-side comparison of ${a.name} and ${b.name} — real prices, Google ratings, product selection, and TCC Score. Updated ${today}.`;
  const canonical = `${SITE}/compare/${a.id}-vs-${b.id}/`;

  const prodsA = TCC.products.filter(p => p.prices && p.prices[a.id] !== undefined && isRealCannabisProduct(p));
  const prodsB = TCC.products.filter(p => p.prices && p.prices[b.id] !== undefined && isRealCannabisProduct(p));
  // Products both carry — compare heads up by name+brand match
  const keyOf = (p) => `${(p.brand || '').toLowerCase()}|${p.name.toLowerCase().slice(0, 40)}`;
  const bByKey = new Map(prodsB.map(p => [keyOf(p), p]));
  const overlap = prodsA
    .map(pa => ({ pa, pb: bByKey.get(keyOf(pa)) }))
    .filter(x => x.pb);
  // Sort by biggest absolute price difference — that's what readers care about
  overlap.sort((x, y) => Math.abs(y.pa.prices[a.id] - y.pb.prices[b.id]) - Math.abs(x.pa.prices[a.id] - x.pb.prices[b.id]));

  const productRows = overlap.slice(0, 15).map(({ pa, pb }) => {
    const pA = pa.prices[a.id];
    const pB = pb.prices[b.id];
    const winner = pA < pB ? 'a' : pA > pB ? 'b' : 'tie';
    return `<tr>
  <td>${esc(pa.name)}</td>
  <td class="price"${winner === 'a' ? ' style="color:#22c55e;font-weight:700"' : ''}>$${pA.toFixed(2)}</td>
  <td class="price"${winner === 'b' ? ' style="color:#22c55e;font-weight:700"' : ''}>$${pB.toFixed(2)}</td>
  <td>${winner === 'tie' ? 'Tie' : winner === 'a' ? esc(a.name.split(' ')[0]) + ` $${(pB - pA).toFixed(2)} cheaper` : esc(b.name.split(' ')[0]) + ` $${(pA - pB).toFixed(2)} cheaper`}</td>
</tr>`;
  }).join('\n');

  const aWins = overlap.filter(x => x.pa.prices[a.id] < x.pb.prices[b.id]).length;
  const bWins = overlap.filter(x => x.pb.prices[b.id] < x.pa.prices[a.id]).length;
  const ties  = overlap.length - aWins - bWins;

  const statsRow = (label, va, vb, fmt = (x) => x) => `<tr>
  <td><strong>${esc(label)}</strong></td>
  <td>${fmt(va)}</td>
  <td>${fmt(vb)}</td>
</tr>`;

  return headOpen({ title, description, canonical }) + `
<div class="crumbs"><a href="/">Home</a> / <a href="/dispensaries/">Dispensaries</a> / ${esc(a.name)} vs ${esc(b.name)}</div>
<h1>${esc(a.name)} vs ${esc(b.name)}</h1>
<p>Side-by-side price and score comparison for two Twin Cities dispensaries. Data pulled from live menus and refreshed multiple times daily — last updated ${today}.</p>

<h2>At a glance</h2>
<table>
<thead><tr><th></th><th><a href="/dispensaries/${esc(a.id)}/">${esc(a.name)}</a></th><th><a href="/dispensaries/${esc(b.id)}/">${esc(b.name)}</a></th></tr></thead>
<tbody>
${statsRow('Location', a.city || '—', b.city || '—')}
${statsRow('TCC Score', a.tcc_score || '—', b.tcc_score || '—')}
${statsRow('Google Rating', a.google && a.google.rating ? `★ ${a.google.rating} (${a.google.review_count || 0})` : '—', b.google && b.google.rating ? `★ ${b.google.rating} (${b.google.review_count || 0})` : '—')}
${statsRow('Products listed', prodsA.length, prodsB.length)}
${statsRow('Products overlapping', overlap.length, overlap.length)}
</tbody>
</table>

${overlap.length > 0 ? `<h2>Price comparison on products both carry</h2>
<p>${aWins > bWins ? esc(a.name) + ' has the cheaper price on ' + aWins + ' of ' + overlap.length + ' shared products' : bWins > aWins ? esc(b.name) + ' has the cheaper price on ' + bWins + ' of ' + overlap.length + ' shared products' : 'Both dispensaries are evenly matched on price'}${ties ? ` (${ties} ties)` : ''}.</p>
<table>
<thead><tr><th>Product</th><th>${esc(a.name.split(' ')[0])}</th><th>${esc(b.name.split(' ')[0])}</th><th>Winner</th></tr></thead>
<tbody>${productRows}</tbody>
</table>` : '<h2>Shared products</h2><p>These two dispensaries don\'t currently carry the same brand-name products in our data, so a price head-to-head isn\'t possible right now. Check their individual menus for current selection.</p>'}

<h2>Which should you choose?</h2>
<p>Cannabis isn't a one-size-fits-all purchase. Consider: distance, your preferred brands, specific strains you like, in-stock alerts, and whether you value lowest price over experience. Both dispensaries are listed on Twin City Cannabis for a reason — they're both legal, licensed Minnesota operations with real inventory.</p>
<ul>
<li><a href="/dispensaries/${esc(a.id)}/">Open ${esc(a.name)}'s full profile →</a></li>
<li><a href="/dispensaries/${esc(b.id)}/">Open ${esc(b.name)}'s full profile →</a></li>
</ul>

<a class="cta" href="/#compare">Compare every dispensary in Minnesota →</a>
` + footer;
};

// Pick top metro dispensaries, build pairs (score-weighted so best pairs get priority)
const comparePool = TCC.dispensaries
  .filter(d => d.region === 'metro' && d.tcc_score >= 85)
  .sort((a, b) => (b.tcc_score || 0) - (a.tcc_score || 0))
  .slice(0, 18);
// Skip obvious chain duplicates (two RISE locations don't need a vs page)
const isChain = (n) => /^(rise|green goods|leafline)/i.test(n || '');
const chainKey = (n) => (n || '').match(/^(rise|green goods|leafline)/i)?.[1].toLowerCase() || '';
const comparePairs = [];
const seenChainPair = new Set();
for (let i = 0; i < comparePool.length; i++) {
  for (let j = i + 1; j < comparePool.length; j++) {
    const a = comparePool[i], b = comparePool[j];
    // Skip same-chain comparisons
    if (isChain(a.name) && isChain(b.name) && chainKey(a.name) === chainKey(b.name)) continue;
    comparePairs.push([a, b]);
    if (comparePairs.length >= 30) break;
  }
  if (comparePairs.length >= 30) break;
}
comparePairs.forEach(([a, b]) => {
  writePage(`compare/${a.id}-vs-${b.id}/index.html`, buildVsPage(a, b));
  extraSitemap.push({ loc: `${SITE}/compare/${a.id}-vs-${b.id}/`, priority: '0.6', changefreq: 'weekly' });
  count++;
});
console.log(`Wrote ${comparePairs.length} dispensary comparison pages`);

// ============================================================================
// CATEGORY × CITY PAGES
// ============================================================================
// "/cheapest-flower-minneapolis/" type long-tail pages. High-volume searches
// with essentially zero good results in the current landscape.
const METRO_CITIES = ['Minneapolis', 'Saint Paul', 'Bloomington', 'Edina', 'Brooklyn Park',
  'Blaine', 'Roseville', 'Eagan', 'Woodbury', 'Burnsville', 'Lakeville', 'Fridley', 'Anoka'];

const buildCheapestCategoryCity = (catId, catName, city) => {
  const citySlug2 = slugify(city);
  const dispensariesHere = TCC.dispensaries.filter(d => d.city === city);
  if (dispensariesHere.length === 0) return null;
  const dispIds = new Set(dispensariesHere.map(d => d.id));
  const productsHere = TCC.products
    .filter(p => p.category === catId && isRealCannabisProduct(p))
    .map(p => {
      const offers = Object.entries(p.prices || {}).filter(([id]) => dispIds.has(id));
      if (!offers.length) return null;
      offers.sort((x, y) => x[1] - y[1]);
      return { p, price: offers[0][1], dispensaryId: offers[0][0] };
    })
    .filter(Boolean)
    .sort((a, b) => a.price - b.price)
    .slice(0, 20);

  if (productsHere.length < 3) return null; // not enough data to make a page worth reading

  const title = `Cheapest ${catName} in ${city} — Real Prices, Updated Daily | Twin City Cannabis`;
  const description = `The lowest-priced ${catName.toLowerCase()} at ${city} cannabis dispensaries, compared side-by-side. Real prices from every licensed shop, refreshed multiple times a day.`;
  const canonical = `${SITE}/cheapest-${catId}-${citySlug2}/`;

  const rows = productsHere.map((o, i) => {
    const store = TCC.dispensaries.find(d => d.id === o.dispensaryId);
    return `<tr>
  <td>${i + 1}</td>
  <td>${esc(o.p.name)}</td>
  <td class="price">$${o.price.toFixed(2)}</td>
  <td>${store ? `<a href="/dispensaries/${esc(store.id)}/">${esc(store.name)}</a>` : '—'}</td>
</tr>`;
  }).join('\n');

  const dispList = dispensariesHere.slice(0, 8).map(d => `<a href="/dispensaries/${esc(d.id)}/">${esc(d.name)}</a>`).join(' · ');

  return headOpen({ title, description, canonical }) + `
<div class="crumbs"><a href="/">Home</a> / <a href="/${citySlug(city)}/">${esc(city)}</a> / Cheapest ${esc(catName.toLowerCase())}</div>
<h1>Cheapest ${esc(catName)} in ${esc(city)}</h1>
<p>The lowest-priced ${esc(catName.toLowerCase())} at ${dispensariesHere.length} licensed cannabis ${dispensariesHere.length === 1 ? 'dispensary' : 'dispensaries'} in ${esc(city)}, pulled from live menus. Updated ${today} — prices shift throughout the day as inventory moves.</p>

<table>
<thead><tr><th>#</th><th>Product</th><th>Lowest price</th><th>At dispensary</th></tr></thead>
<tbody>${rows}</tbody>
</table>

<h2>${esc(city)} dispensaries on Twin City Cannabis</h2>
<p>${dispList}${dispensariesHere.length > 8 ? ` · <a href="/${citySlug(city)}/">see all ${dispensariesHere.length} →</a>` : ''}</p>

<h2>Why prices vary</h2>
<p>Minnesota legalized recreational cannabis in 2023 and retail only opened statewide in 2024, so supply chains and pricing strategies still vary wildly between dispensaries. Even on identical brand-name products, the same item can cost 20-50% more at one ${esc(city)} shop than at another a few miles away.</p>

<a class="cta" href="/#compare">Open full ${esc(city)} comparison →</a>
` + footer;
};

let catCityCount = 0;
const SEO_CATEGORIES = [
  { id: 'flower', name: 'Flower' },
  { id: 'edible', name: 'Edibles' },
  { id: 'cartridge', name: 'Vape Cartridges' },
  { id: 'pre-roll', name: 'Pre-Rolls' },
  { id: 'beverage', name: 'Beverages' },
];
SEO_CATEGORIES.forEach(cat => {
  METRO_CITIES.forEach(city => {
    const html = buildCheapestCategoryCity(cat.id, cat.name, city);
    if (!html) return;
    const path = `cheapest-${cat.id}-${slugify(city)}`;
    writePage(`${path}/index.html`, html);
    extraSitemap.push({ loc: `${SITE}/${path}/`, priority: '0.7', changefreq: 'daily' });
    count++;
    catCityCount++;
  });
});
console.log(`Wrote ${catCityCount} category-by-city pages`);

// ============================================================================
// STRAIN × LOCATION PAGES
// ============================================================================
// Top strains × top cities. People search "blue dream in minneapolis" — we can
// actually answer that with real prices and dispensary names.
const getTopStrains = () => {
  // Pull a list of real brand names to exclude (many product names START with the
  // brand, which we don't want to treat as a strain).
  const brandSet = new Set(
    Object.values(TCC.products).reduce((acc, p) => {
      if (p.brand) acc.push(p.brand.toLowerCase());
      return acc;
    }, [])
  );
  // Category / form words we don't want to treat as strains
  const STRAIN_JUNK = new Set([
    'flower', 'flowers', 'pre-roll', 'preroll', 'pre', 'roll', 'rolls',
    'cartridge', 'cart', 'carts', 'vape', 'vapes', 'disposable', 'disposables',
    'edible', 'edibles', 'gummy', 'gummies', 'chocolate', 'brownie', 'bar',
    'beverage', 'beverages', 'drink', 'seltzer', 'soda', 'tonic',
    'tincture', 'tinctures', 'topical', 'topicals', 'salve', 'balm',
    'concentrate', 'concentrates', 'wax', 'shatter', 'rosin', 'hash',
    'bag', 'pack', 'oz', 'gram', 'grams', 'indica', 'sativa', 'hybrid',
    'true canna', 'unbound', 'house', 'craft', 'premium', 'select',
    'packed', 'packaged', 'deli', 'bulk', 'co', 'collective', 'cannabis',
  ]);
  const looksLikeStrain = (name) => {
    const n = name.toLowerCase().trim();
    if (n.length < 5 || n.length > 30) return false;
    if (brandSet.has(n)) return false;
    if (STRAIN_JUNK.has(n)) return false;
    // Exclude names that are just a category word + modifier
    const words = n.split(/\s+/);
    if (words.length < 2) return false; // strains usually have 2+ words: Blue Dream, Pine Soul
    if (words.some(w => STRAIN_JUNK.has(w))) return false;
    // Exclude anything starting with a number or containing mg
    if (/^\d|\bmg\b|\boz\b|\bg\b/i.test(n)) return false;
    return true;
  };

  const counts = {};
  TCC.products.forEach(p => {
    if (p.category !== 'flower' && p.category !== 'pre-roll' && p.category !== 'cartridge') return;
    if (!p.name) return;
    // Extract the segment between separators that looks most strain-like
    const parts = p.name.split(/[\|\-]/).map(s => s.trim()).filter(Boolean);
    for (const part of parts) {
      if (looksLikeStrain(part)) {
        // Normalize casing to title case for clean URLs
        const norm = part.replace(/\b\w/g, c => c.toUpperCase());
        counts[norm] = (counts[norm] || 0) + 1;
        break; // only count first hit per product
      }
    }
  });
  return Object.entries(counts)
    .filter(([, n]) => n >= 4)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([name]) => name);
};

const buildStrainCityPage = (strain, city) => {
  const citySlug2 = slugify(city);
  const strainSlug = slugify(strain);
  const dispensariesHere = TCC.dispensaries.filter(d => d.city === city);
  if (dispensariesHere.length === 0) return null;
  const dispIds = new Set(dispensariesHere.map(d => d.id));

  const matches = TCC.products
    .filter(p => isRealCannabisProduct(p) && p.name && p.name.toLowerCase().includes(strain.toLowerCase()))
    .map(p => {
      const offers = Object.entries(p.prices || {}).filter(([id]) => dispIds.has(id));
      if (!offers.length) return null;
      offers.sort((x, y) => x[1] - y[1]);
      return { p, price: offers[0][1], dispensaryId: offers[0][0] };
    })
    .filter(Boolean)
    .sort((a, b) => a.price - b.price);

  if (matches.length < 2) return null;

  const title = `${strain} in ${city} — Where to Buy & Real Prices | Twin City Cannabis`;
  const description = `Find ${strain} at licensed ${city} cannabis dispensaries. Real prices, side-by-side, updated daily. ${matches.length} listings across ${dispensariesHere.length} shops.`;
  const canonical = `${SITE}/${strainSlug}-${citySlug2}/`;

  const lowPrice = matches[0].price;
  const highPrice = matches[matches.length - 1].price;
  const offerCount = matches.length;
  // Pick the dominant category across matches (flower/pre-roll/cartridge) so
  // the schema can label the canonical form. Default to "Cannabis" if mixed.
  const catTally = {};
  matches.forEach(m => { const c = m.p.category; catTally[c] = (catTally[c] || 0) + 1; });
  const dominantCat = Object.entries(catTally).sort((a, b) => b[1] - a[1])[0][0];
  const schemaCategory = `Cannabis ${dominantCat[0].toUpperCase()}${dominantCat.slice(1)}`;

  const schema = [{
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${strain} in ${city}`,
    description: `${strain} cannabis available at ${dispensariesHere.length} licensed ${city} dispensaries. ${offerCount} listings, prices from $${lowPrice.toFixed(2)} to $${highPrice.toFixed(2)}.`,
    category: schemaCategory,
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'USD',
      lowPrice: lowPrice.toFixed(2),
      highPrice: highPrice.toFixed(2),
      offerCount,
      offers: matches.slice(0, 15).map(o => {
        const store = TCC.dispensaries.find(d => d.id === o.dispensaryId);
        return {
          '@type': 'Offer',
          price: o.price.toFixed(2),
          priceCurrency: 'USD',
          itemOffered: { '@type': 'Product', name: o.p.name },
          availability: 'https://schema.org/InStock',
          seller: store ? {
            '@type': 'CannabisStore',
            name: store.name,
            url: `${SITE}/dispensaries/${store.id}/`
          } : undefined
        };
      })
    }
  }, {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE },
      { '@type': 'ListItem', position: 2, name: city, item: `${SITE}/${citySlug(city)}/` },
      { '@type': 'ListItem', position: 3, name: strain, item: canonical }
    ]
  }];

  const rows = matches.slice(0, 15).map((o, i) => {
    const store = TCC.dispensaries.find(d => d.id === o.dispensaryId);
    return `<tr>
  <td>${esc(o.p.name)}</td>
  <td>${esc(o.p.category)}</td>
  <td class="price">$${o.price.toFixed(2)}</td>
  <td>${store ? `<a href="/dispensaries/${esc(store.id)}/">${esc(store.name)}</a>` : '—'}</td>
</tr>`;
  }).join('\n');

  return headOpen({ title, description, canonical, schema }) + `
<div class="crumbs"><a href="/">Home</a> / <a href="/${citySlug(city)}/">${esc(city)}</a> / ${esc(strain)}</div>
<h1>${esc(strain)} in ${esc(city)}</h1>
<p>Every listing of ${esc(strain)} at licensed cannabis dispensaries in ${esc(city)}. Includes flower, pre-rolls, and cartridges where available. Real prices, refreshed multiple times a day — last updated ${today}.</p>

<table>
<thead><tr><th>Product</th><th>Form</th><th>Price</th><th>Dispensary</th></tr></thead>
<tbody>${rows}</tbody>
</table>

<h2>About this comparison</h2>
<p>Twin City Cannabis scrapes live menus from every licensed dispensary in Minnesota and matches products by name. Prices shown are the current lowest available at each shop and may change as inventory moves. Always confirm stock with the dispensary before driving.</p>

<a class="cta" href="/${citySlug(city)}/">See all ${esc(city)} dispensaries →</a>
` + footer;
};

let strainCityCount = 0;
const topStrains = getTopStrains();
topStrains.forEach(strain => {
  METRO_CITIES.forEach(city => {
    const html = buildStrainCityPage(strain, city);
    if (!html) return;
    const p = `${slugify(strain)}-${slugify(city)}`;
    writePage(`${p}/index.html`, html);
    extraSitemap.push({ loc: `${SITE}/${p}/`, priority: '0.6', changefreq: 'daily' });
    count++;
    strainCityCount++;
  });
});
console.log(`Wrote ${strainCityCount} strain-by-city pages`);

// ============================================================================
// MARKET INSIGHTS PAGE
// ============================================================================
// Single page that updates with every scrape. Biggest price drops, new product
// launches, trending strains. Signals freshness to Google, gives consumers a
// reason to return. Update-friendly — the Pi regenerates it on every cron run.
const buildMarketInsightsPage = () => {
  // Biggest price drops — products where priceHistory shows a meaningful decrease
  const drops = TCC.products
    .filter(p => p.priceHistory && p.priceHistory.length >= 2 && isRealCannabisProduct(p))
    .map(p => {
      const ph = p.priceHistory;
      return { p, diff: ph[0] - ph[ph.length - 1], start: ph[0], now: ph[ph.length - 1] };
    })
    .filter(x => x.diff >= 3)
    .sort((a, b) => b.diff - a.diff)
    .slice(0, 10);

  // Top carried products this week (most widely available)
  const widespread = TCC.products
    .filter(p => isRealCannabisProduct(p))
    .map(p => ({ p, count: Object.keys(p.prices || {}).length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Highest score dispensaries
  const topDisps = TCC.dispensaries
    .filter(d => d.tcc_score)
    .sort((a, b) => b.tcc_score - a.tcc_score)
    .slice(0, 8);

  const title = `Minnesota Cannabis Market Insights — Price Drops & Trends | ${today}`;
  const description = `This week's biggest cannabis price drops, most-carried products, and top-rated dispensaries in Minnesota. Updated daily from live menu data across 80+ shops.`;
  const canonical = `${SITE}/market-insights/`;

  const dropRows = drops.map(d => {
    const store = Object.entries(d.p.prices).sort((a, b) => a[1] - b[1])[0];
    const disp = TCC.dispensaries.find(x => x.id === store[0]);
    return `<tr>
  <td>${esc(d.p.name)}</td>
  <td class="price">$${d.start.toFixed(2)}</td>
  <td class="price" style="color:#22c55e;font-weight:700">$${d.now.toFixed(2)}</td>
  <td style="color:#22c55e">−$${d.diff.toFixed(2)}</td>
  <td>${disp ? `<a href="/dispensaries/${esc(disp.id)}/">${esc(disp.name)}</a>` : '—'}</td>
</tr>`;
  }).join('\n');

  const widespreadRows = widespread.map((x, i) => `<tr>
  <td>${i + 1}</td>
  <td>${esc(x.p.name)}</td>
  <td>${esc(x.p.category)}</td>
  <td>${x.count} dispensar${x.count === 1 ? 'y' : 'ies'}</td>
</tr>`).join('\n');

  const dispRows = topDisps.map((d, i) => `<tr>
  <td>${i + 1}</td>
  <td><a href="/dispensaries/${esc(d.id)}/">${esc(d.name)}</a></td>
  <td>${esc(d.city || '—')}</td>
  <td>${d.tcc_score}</td>
  <td>${d.google && d.google.rating ? `★ ${d.google.rating}` : '—'}</td>
</tr>`).join('\n');

  return headOpen({ title, description, canonical }) + `
<div class="crumbs"><a href="/">Home</a> / Market Insights</div>
<h1>Minnesota Cannabis Market Insights</h1>
<p>Live trends from every licensed dispensary in Minnesota. Pulled from real menu data, refreshed multiple times daily. Last updated ${today}.</p>

${drops.length > 0 ? `<h2>&#128200; This week's biggest price drops</h2>
<p>Products where the lowest available price dropped the most across tracked dispensaries.</p>
<table>
<thead><tr><th>Product</th><th>Was</th><th>Now</th><th>Saved</th><th>At</th></tr></thead>
<tbody>${dropRows}</tbody>
</table>` : ''}

<h2>&#127775; Most widely carried products</h2>
<p>Products available at the most Minnesota dispensaries — strong signals of what's hot statewide.</p>
<table>
<thead><tr><th>#</th><th>Product</th><th>Category</th><th>Availability</th></tr></thead>
<tbody>${widespreadRows}</tbody>
</table>

<h2>&#127942; Top-scored dispensaries</h2>
<p>Ranked by TCC Score, combining pricing, selection, service, and lab testing.</p>
<table>
<thead><tr><th>#</th><th>Dispensary</th><th>City</th><th>TCC Score</th><th>Google</th></tr></thead>
<tbody>${dispRows}</tbody>
</table>

<h2>How to use this page</h2>
<p>Bookmark it. Prices change constantly as dispensaries adjust inventory, run promotions, and bring in new brands. This page regenerates automatically throughout the day, so it's always current. Share price drops with friends — if you know someone buying the same cart every week, check if theirs is on the list.</p>

<a class="cta" href="/#compare">Open full comparison tool →</a>
` + footer;
};
writePage('market-insights/index.html', buildMarketInsightsPage());
extraSitemap.push({ loc: `${SITE}/market-insights/`, priority: '0.8', changefreq: 'daily' });
count++;
console.log('Wrote market-insights page');

// Sitemap
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), buildSitemap(extraSitemap));

// ---------- INJECT INTERNAL CRAWL FOOTER INTO index.html ----------
// Replaces the marked block with up-to-date links to all generated pages so the
// SPA homepage exposes a real, crawlable internal link graph to every static SEO
// page (dispensaries, brands, cities, long-tail content). This is what tells
// Google all those pages exist and are considered important by the homepage.
const indexPath = path.join(ROOT, 'index.html');
let indexHtml = fs.readFileSync(indexPath, 'utf8');

const dispLinks = TCC.dispensaries
  .slice()
  .sort((a, b) => a.name.localeCompare(b.name))
  .map(d => `<a href="/dispensaries/${esc(d.id)}/">${esc(d.name)}</a>`).join(' &middot; ');

const cityLinks = cities
  .slice()
  .sort()
  .map(c => `<a href="/${citySlug(c)}/">${esc(c)}</a>`).join(' &middot; ');

const brandLinks = brands
  .map(b => `<a href="/brands/${esc(b.slug)}/">${esc(b.name)}</a>`).join(' &middot; ');

const catLinks = TCC.categories
  .map(c => `<a href="/products/${esc(c.id)}/">${esc(c.name)}</a>`).join(' &middot; ');

const seoFooter = `
    <section class="seo-crawl-footer" style="background:rgba(255,255,255,0.02);border-top:1px solid rgba(255,255,255,0.06);padding:3rem 0 2rem;margin-top:4rem;overflow-wrap:break-word;word-wrap:break-word">
      <div class="container" style="max-width:1100px;padding-left:1.25rem;padding-right:1.25rem">
        <h2 style="font-size:1.1rem;font-weight:600;color:var(--text-primary);margin:0 0 1.5rem;letter-spacing:.3px;text-transform:uppercase">Browse Twin City Cannabis</h2>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:2rem">

          <div style="min-width:0">
            <h3 style="font-size:.78rem;text-transform:uppercase;color:var(--text-muted);font-weight:600;letter-spacing:.5px;margin:0 0 .75rem">Top guides</h3>
            <ul style="list-style:none;padding:0;margin:0;font-size:.92rem;line-height:1.9">
              <li><a href="/best-dispensaries-twin-cities/" style="color:var(--text-secondary);text-decoration:none">Best-rated dispensaries in the Twin Cities</a></li>
              <li><a href="/cheapest-cannabis-twin-cities/" style="color:var(--text-secondary);text-decoration:none">Cheapest cannabis in the Twin Cities</a></li>
              <li><a href="/minnesota-cannabis-laws/" style="color:var(--text-secondary);text-decoration:none">Minnesota cannabis laws</a></li>
              <li><a href="/events/" style="color:var(--text-secondary);text-decoration:none">Cannabis events in Minnesota</a></li>
              <li><a href="/dispensaries/" style="color:var(--text-secondary);text-decoration:none">All ${TCC.dispensaries.length} dispensaries</a></li>
              <li><a href="/products/" style="color:var(--text-secondary);text-decoration:none">All product categories</a></li>
              <li><a href="/brands/" style="color:var(--text-secondary);text-decoration:none">All cannabis brands</a></li>
            </ul>
          </div>

          <div style="min-width:0">
            <h3 style="font-size:.78rem;text-transform:uppercase;color:var(--text-muted);font-weight:600;letter-spacing:.5px;margin:0 0 .75rem">By category</h3>
            <p style="font-size:.88rem;line-height:1.8;color:var(--text-secondary);margin:0;overflow-wrap:break-word">${catLinks}</p>
          </div>

          <div style="min-width:0">
            <h3 style="font-size:.78rem;text-transform:uppercase;color:var(--text-muted);font-weight:600;letter-spacing:.5px;margin:0 0 .75rem">By city</h3>
            <p style="font-size:.88rem;line-height:1.8;color:var(--text-secondary);margin:0;overflow-wrap:break-word">${cityLinks}</p>
          </div>

        </div>

        <h3 style="font-size:.78rem;text-transform:uppercase;color:var(--text-muted);font-weight:600;letter-spacing:.5px;margin:2rem 0 .75rem">All dispensaries</h3>
        <p style="font-size:.85rem;line-height:1.9;color:var(--text-secondary);margin:0 0 1.5rem;overflow-wrap:break-word">${dispLinks}</p>

        <h3 style="font-size:.78rem;text-transform:uppercase;color:var(--text-muted);font-weight:600;letter-spacing:.5px;margin:1.5rem 0 .75rem">Brands</h3>
        <p style="font-size:.85rem;line-height:1.9;color:var(--text-secondary);margin:0;overflow-wrap:break-word">${brandLinks}</p>

      </div>
    </section>
`;

indexHtml = indexHtml.replace(
  /<!-- SEO_LINKS_START[^>]*-->[\s\S]*?<!-- SEO_LINKS_END -->/,
  `<!-- SEO_LINKS_START — auto-generated by scripts/build_seo.js, do not edit by hand -->${seoFooter}    <!-- SEO_LINKS_END -->`
);

// ---------- INJECT LIVE FRESHNESS TIMESTAMP ----------
// Replaces the LAST_UPDATED_HERO and LAST_UPDATED_FOOTER blocks with the
// current build time. Runs on every cron, so visitors always see "Updated X
// minutes ago" relative to the most recent scrape. The hero/footer use a
// data-fresh-ts attribute so a tiny inline script can render relative time
// on the client side too (e.g., "Updated 12 minutes ago" without reloading).
const now = new Date();
const isoUtc = now.toISOString(); // machine-readable UTC for client-side relative time
const cdtFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago',
  month: 'short', day: 'numeric',
  hour: 'numeric', minute: '2-digit',
  hour12: true,
});
const humanCdt = cdtFormatter.format(now) + ' CDT';

const heroFresh = `<span class="fresh-ts" data-fresh-ts="${isoUtc}">Updated just now · ${humanCdt}</span>`;
const footerFresh = `<span class="fresh-ts" data-fresh-ts="${isoUtc}">Live data · last refresh ${humanCdt}</span>`;

indexHtml = indexHtml.replace(
  /<!-- LAST_UPDATED_HERO -->[\s\S]*?<!-- \/LAST_UPDATED_HERO -->/g,
  `<!-- LAST_UPDATED_HERO -->${heroFresh}<!-- /LAST_UPDATED_HERO -->`
);
indexHtml = indexHtml.replace(
  /<!-- LAST_UPDATED_FOOTER -->[\s\S]*?<!-- \/LAST_UPDATED_FOOTER -->/g,
  `<!-- LAST_UPDATED_FOOTER -->${footerFresh}<!-- /LAST_UPDATED_FOOTER -->`
);

// Inline script that turns server-rendered absolute timestamps into rolling
// "Updated X minutes ago" labels on the client. Idempotent — only injected once
// thanks to the marker comment.
if (!indexHtml.includes('/* fresh-ts client */')) {
  const freshScript = `
<script>/* fresh-ts client */
(function(){
  function fmt(ts){
    var diff = (Date.now() - new Date(ts).getTime()) / 1000;
    if (diff < 60)        return 'Updated just now';
    if (diff < 3600)      return 'Updated ' + Math.floor(diff/60) + ' min ago';
    if (diff < 7200)      return 'Updated 1 hour ago';
    if (diff < 86400)     return 'Updated ' + Math.floor(diff/3600) + ' hours ago';
    return 'Updated ' + Math.floor(diff/86400) + ' days ago';
  }
  function tick(){
    document.querySelectorAll('.fresh-ts[data-fresh-ts]').forEach(function(el){
      var ts = el.getAttribute('data-fresh-ts');
      if (ts) el.textContent = fmt(ts);
    });
  }
  tick();
  setInterval(tick, 60000);
})();
</script>
`;
  indexHtml = indexHtml.replace('</body>', freshScript + '</body>');
}

// Replace dead footer links with real /privacy/, /terms/, /contact/ paths.
// Idempotent — only matches the literal href="#" instances next to those labels.
indexHtml = indexHtml
  .replace(/<a href="#">Privacy<\/a>/g,  '<a href="/privacy/">Privacy</a>')
  .replace(/<a href="#">Terms<\/a>/g,    '<a href="/terms/">Terms</a>')
  .replace(/<a href="#">Contact<\/a>/g,  '<a href="/contact/">Contact</a>');

// ---------- INJECT LIVE DISPENSARY / PRODUCT COUNTS ----------
// Replaces hardcoded counts like "35 dispensaries" and "1,500+ products" across
// meta tags, OG tags, schema.org, announce bar, and marketing copy with real
// values from TCC data. Runs after every scrape so numbers never go stale.
const liveDispCount = TCC.dispensaries.length;
const liveProdRaw   = TCC.products.length;
const liveProdRound = Math.floor(liveProdRaw / 100) * 100;
const liveProdLabel = liveProdRound.toLocaleString('en-US') + '+';

// "33 Twin Cities dispensaries" pattern (number + city name + dispensaries) — must run before plain pattern
indexHtml = indexHtml.replace(/\b\d{2}\s+Twin Cities\s+dispensaries\b/g, `${liveDispCount} Twin Cities dispensaries`);

// Any 2-digit number + " dispensaries" (e.g. "33 dispensaries", "37 dispensaries")
// Negative lookbehind skips "First 10 dispensaries" and similar — those are
// Founding Member copy where the number is intentional, not a stale count.
indexHtml = indexHtml.replace(/(?<!first\s|First\s)\b\d{2}\s+dispensaries\b/g, `${liveDispCount} dispensaries`);

// Dispensary count inside HTML tags: >33</strong> dispensaries, >33</span> dispensaries
indexHtml = indexHtml.replace(/(id="announce-disp-count">)\d{2}(<\/)/g, `$1${liveDispCount}$2`);

// Any formatted number + "+ products" (e.g. "1,500+ products", "2,000+ products")
indexHtml = indexHtml.replace(/[\d,]+\+\s*products/g, `${liveProdLabel} products`);

// Product counts inside HTML tags (announce bar, hero stat, stats bar, proof bar)
indexHtml = indexHtml.replace(/(id="announce-product-count">)[\d,]+\+(<\/)/g, `$1${liveProdLabel}$2`);
indexHtml = indexHtml.replace(/(id="hero-stat-products">)[\d,]+\+(<\/)/g, `$1${liveProdLabel}$2`);
indexHtml = indexHtml.replace(/(id="stats-bar-products">)[\d,]+\+(<\/)/g, `$1${liveProdLabel}$2`);
indexHtml = indexHtml.replace(/(id="proof-stat-products">)[\d,]+\+(<\/)/g, `$1${liveProdLabel}$2`);

console.log(`Injected live counts: ${liveDispCount} dispensaries, ${liveProdLabel} products (${liveProdRaw} actual)`);

// ---------- CACHE-BUST data.js + app.js ----------
// Append ?v=<short content hash> to the script tags so any change to either
// file invalidates browsers' caches automatically. Without this, returning
// visitors silently keep stale dispensary data for hours after a deploy.
const crypto = require('crypto');
function fileHash(relPath) {
  const buf = fs.readFileSync(path.join(ROOT, relPath));
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
}
const dataHash = fileHash('js/data.js');
const appHash  = fileHash('js/app.js');
indexHtml = indexHtml
  .replace(/(<script[^>]+src=)"js\/data\.js(?:\?v=[^"]*)?"/g, `$1"js/data.js?v=${dataHash}"`)
  .replace(/(<script[^>]+src=)"js\/app\.js(?:\?v=[^"]*)?"/g,  `$1"js/app.js?v=${appHash}"`);
console.log(`Cache-bust: data.js?v=${dataHash}, app.js?v=${appHash}`);

fs.writeFileSync(indexPath, indexHtml);
console.log('Injected internal crawl footer + fixed dead legal links into index.html');

console.log(`SEO build complete: ${count} static pages + sitemap.xml`);
console.log(`  Dispensaries:    ${TCC.dispensaries.length}`);
console.log(`  Categories:      ${TCC.categories.length}`);
console.log(`  Brands:          ${brands.length}`);
console.log(`  Cities:          ${cities.length}`);
console.log(`  Neighborhoods:   ${neighborhoodGroups.length}`);
console.log(`  Top products:    ${topProducts.length}`);
console.log(`  Total products:  ${TCC.products.length}`);
