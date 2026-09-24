#!/usr/bin/env node
/*
 * JS half of tests/check_fixtures.py. Runs the fixture cases against the
 * code the site actually ships, lifted out of js/app.js and
 * scripts/build_seo.js by marker, so a fix in one copy and not the other
 * fails here instead of on the live site.
 *
 * If a marker moves and extraction fails, this fails loudly. Update the
 * marker here; never delete the check.
 *
 * Usage: node tests/fixtures_site.js [--data js/data.js]
 * Prints one line per failure, exits 1 on any.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FIX = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/incidents.json'), 'utf8'));
const APP = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
const SEO = fs.readFileSync(path.join(ROOT, 'scripts/build_seo.js'), 'utf8');
const failures = [];

function between(src, startMarker, endMarker, label) {
  const a = src.indexOf(startMarker);
  const b = a < 0 ? -1 : src.indexOf(endMarker, a);
  if (a < 0 || b < 0) throw new Error(`${label}: marker not found (${a < 0 ? startMarker : endMarker})`);
  return src.slice(a, b + endMarker.length);
}

function loadFilters() {
  const app = new Function(
    between(APP, 'const ACCESSORY_RE = new RegExp([', '// Prune TCC.products on load', 'app.js filter')
    + '\nreturn isRealCannabisProduct;')();
  const seo = new Function(
    between(SEO, 'const lowestPrice = (p) => {', '\n};\n', 'build_seo lowestPrice')
    + between(SEO, 'const ACCESSORY_RE = new RegExp(', 'const isRealCannabisProduct = (p) => {', 'build_seo filter head')
      .replace(/const isRealCannabisProduct = \(p\) => \{$/, '')
    + between(SEO, 'const isRealCannabisProduct = (p) => {', '\n};\n', 'build_seo filter')
    + '\nreturn isRealCannabisProduct;')();
  return { app, seo };
}

function loadMgKey() {
  const norm = between(APP, 'const norm = (s) =>', ';\n', 'app.js norm');
  const mg = between(APP, 'const mgKey = (p) => {', '\n        };\n', 'app.js mgKey');
  return new Function(norm + '\n' + mg + '\nreturn mgKey;')();
}

let filters, mgKey;
try { filters = loadFilters(); } catch (e) { failures.push(`extract: ${e.message}`); }
try { mgKey = loadMgKey(); } catch (e) { failures.push(`extract: ${e.message}`); }

if (filters) {
  for (const c of FIX.site_filter) {
    const p = { id: c.id, name: c.name, category: c.category, weight: c.weight, prices: { 'fixture-shop': c.price } };
    for (const [where, fn] of Object.entries(filters)) {
      const kept = !!fn(p);
      if (kept !== c.keep) failures.push(`site_filter [${where}] "${c.name}" ${kept ? 'kept' : 'dropped'}, expected ${c.keep ? 'kept' : 'dropped'} (${c.incident})`);
    }
  }
}

if (mgKey) {
  for (const c of FIX.edible_size_key) {
    const got = mgKey({ name: c.name });
    if (got !== c.expect) failures.push(`edible_size_key "${c.name}" -> "${got}", expected "${c.expect}" (${c.incident})`);
  }
}

// Invariants on the built data, with the site's own filter.
const dataArg = process.argv.indexOf('--data');
if (dataArg > 0 && filters) {
  const inv = FIX.site_invariants;
  global.window = {};
  require(path.resolve(process.argv[dataArg + 1]));
  const T = window.TCC;
  const tot = {}, vis = {};
  let all = 0, seen = 0;
  for (const p of T.products) {
    const keep = filters.app(p);
    for (const shop of Object.keys(p.prices || {})) {
      const k = shop + ' / ' + p.category;
      tot[k] = (tot[k] || 0) + 1; all++;
      if (keep) { vis[k] = (vis[k] || 0) + 1; seen++; }
    }
  }
  for (const [k, n] of Object.entries(tot)) {
    const share = (vis[k] || 0) / n;
    if (n >= inv.min_offers_shop_category && share < inv.min_visible_share) {
      failures.push(`invariant: ${k} has ${n} listings in data.js but the site shows ${vis[k] || 0} (${Math.round(share * 100)}%)`);
    }
  }
  if (all && seen / all < inv.min_site_visible_share) {
    failures.push(`invariant: the site filter hides ${all - seen} of ${all} listings (${Math.round((1 - seen / all) * 100)}%)`);
  }
}

for (const f of failures) console.log('FAIL ' + f);
console.log(failures.length ? `${failures.length} JS fixture failure(s)` : 'JS fixtures: all pass');
process.exit(failures.length ? 1 : 0);
