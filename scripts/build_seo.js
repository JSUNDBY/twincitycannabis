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

// ---------- SITEMAP ----------
const buildSitemap = () => {
  const urls = [
    { loc: `${SITE}/`,                         priority: '1.0', changefreq: 'daily' },
    { loc: `${SITE}/dispensaries/`,            priority: '0.9', changefreq: 'daily' },
    { loc: `${SITE}/products/`,                priority: '0.9', changefreq: 'daily' },
    ...TCC.dispensaries.map(d => ({
      loc: `${SITE}/dispensaries/${d.id}/`,    priority: '0.8', changefreq: 'daily'
    })),
    ...TCC.categories.map(c => ({
      loc: `${SITE}/products/${c.id}/`,        priority: '0.7', changefreq: 'daily'
    })),
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

TCC.dispensaries.forEach(d => {
  writePage(`dispensaries/${d.id}/index.html`, buildDispensaryPage(d));
  count++;
});
writePage('dispensaries/index.html', buildDispensariesIndex());
count++;

TCC.categories.forEach(c => {
  writePage(`products/${c.id}/index.html`, buildCategoryPage(c));
  count++;
});
writePage('products/index.html', buildProductsHub());
count++;

fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), buildSitemap());

console.log(`SEO build complete: ${count} static pages + sitemap.xml`);
console.log(`  Dispensaries: ${TCC.dispensaries.length}`);
console.log(`  Categories:   ${TCC.categories.length}`);
console.log(`  Products:     ${TCC.products.length}`);
