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
<script async src="https://www.googletagmanager.com/gtag/js?id=G-S151YE55PJ"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-S151YE55PJ');</script>
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
  <p><a href="/">Home</a> &middot; <a href="/dispensaries/">All dispensaries</a> &middot; <a href="/products/">Browse by category</a></p>
  <p style="margin-top:.75rem">Minneapolis &middot; Saint Paul &middot; Minnesota</p>
</footer>
</body>
</html>`;

// ---------- DISPENSARY PAGES ----------
const buildDispensaryPage = (d) => {
  const products = TCC.products
    .filter(p => p.prices && p.prices[d.id] != null)
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
  const products = TCC.products.filter(p => p.category === cat.id);
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
    const count = TCC.products.filter(p => p.category === c.id).length;
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
    .filter(p => p.brand === brand.name)
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
      .filter(p => p.category === cat.id && lowestPrice(p) != null)
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

// Per-product pages — top by offer count, min 3 stores carrying. Highest-value
// long-tail SEO surfaces ("Vireo Blue Dream cartridge minneapolis price").
const topProducts = TCC.products
  .filter(p => Object.keys(p.prices || {}).length >= 3)
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
    <section class="seo-crawl-footer" style="background:rgba(255,255,255,0.02);border-top:1px solid rgba(255,255,255,0.06);padding:3rem 0 2rem;margin-top:4rem">
      <div class="container" style="max-width:1100px">
        <h2 style="font-size:1.1rem;font-weight:600;color:var(--text-primary);margin:0 0 1.5rem;letter-spacing:.3px;text-transform:uppercase">Browse Twin City Cannabis</h2>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:2rem">

          <div>
            <h3 style="font-size:.78rem;text-transform:uppercase;color:var(--text-muted);font-weight:600;letter-spacing:.5px;margin:0 0 .75rem">Top guides</h3>
            <ul style="list-style:none;padding:0;margin:0;font-size:.92rem;line-height:1.9">
              <li><a href="/best-dispensaries-twin-cities/" style="color:var(--text-secondary);text-decoration:none">Best-rated dispensaries in the Twin Cities</a></li>
              <li><a href="/cheapest-cannabis-twin-cities/" style="color:var(--text-secondary);text-decoration:none">Cheapest cannabis in the Twin Cities</a></li>
              <li><a href="/minnesota-cannabis-laws/" style="color:var(--text-secondary);text-decoration:none">Minnesota cannabis laws</a></li>
              <li><a href="/dispensaries/" style="color:var(--text-secondary);text-decoration:none">All ${TCC.dispensaries.length} dispensaries</a></li>
              <li><a href="/products/" style="color:var(--text-secondary);text-decoration:none">All product categories</a></li>
              <li><a href="/brands/" style="color:var(--text-secondary);text-decoration:none">All cannabis brands</a></li>
            </ul>
          </div>

          <div>
            <h3 style="font-size:.78rem;text-transform:uppercase;color:var(--text-muted);font-weight:600;letter-spacing:.5px;margin:0 0 .75rem">By category</h3>
            <p style="font-size:.88rem;line-height:1.8;color:var(--text-secondary);margin:0">${catLinks}</p>
          </div>

          <div>
            <h3 style="font-size:.78rem;text-transform:uppercase;color:var(--text-muted);font-weight:600;letter-spacing:.5px;margin:0 0 .75rem">By city</h3>
            <p style="font-size:.88rem;line-height:1.8;color:var(--text-secondary);margin:0">${cityLinks}</p>
          </div>

        </div>

        <h3 style="font-size:.78rem;text-transform:uppercase;color:var(--text-muted);font-weight:600;letter-spacing:.5px;margin:2rem 0 .75rem">All dispensaries</h3>
        <p style="font-size:.85rem;line-height:1.9;color:var(--text-secondary);margin:0 0 1.5rem">${dispLinks}</p>

        <h3 style="font-size:.78rem;text-transform:uppercase;color:var(--text-muted);font-weight:600;letter-spacing:.5px;margin:1.5rem 0 .75rem">Brands</h3>
        <p style="font-size:.85rem;line-height:1.9;color:var(--text-secondary);margin:0">${brandLinks}</p>

      </div>
    </section>
`;

indexHtml = indexHtml.replace(
  /<!-- SEO_LINKS_START[^>]*-->[\s\S]*?<!-- SEO_LINKS_END -->/,
  `<!-- SEO_LINKS_START — auto-generated by scripts/build_seo.js, do not edit by hand -->${seoFooter}    <!-- SEO_LINKS_END -->`
);

fs.writeFileSync(indexPath, indexHtml);
console.log('Injected internal crawl footer into index.html');

console.log(`SEO build complete: ${count} static pages + sitemap.xml`);
console.log(`  Dispensaries:    ${TCC.dispensaries.length}`);
console.log(`  Categories:      ${TCC.categories.length}`);
console.log(`  Brands:          ${brands.length}`);
console.log(`  Cities:          ${cities.length}`);
console.log(`  Neighborhoods:   ${neighborhoodGroups.length}`);
console.log(`  Top products:    ${topProducts.length}`);
console.log(`  Total products:  ${TCC.products.length}`);
