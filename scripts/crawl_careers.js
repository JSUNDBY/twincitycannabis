#!/usr/bin/env node
/**
 * One-time (re-runnable) scan of every listed shop's own website for a
 * public job feed: Greenhouse, Lever, Workable, BambooHR, JazzHR, Paylocity,
 * ADP, Workday, Breezy, Rippling, or a plain /careers page. Feeds with a
 * public API become entries in scraper/jobs_sources.json (by hand, after a
 * look); everything else is a lead for the owner post form.
 *
 * Reads only each shop's homepage plus /careers and /jobs. Writes
 * scraper/data/careers_scan.json.
 *
 * Run: node scripts/crawl_careers.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
global.window = {};
require(path.join(ROOT, 'js/data.js'));
const TCC = global.window.TCC || global.TCC;
const OUT = path.join(ROOT, 'scraper/data/careers_scan.json');

const ATS = [
  ['greenhouse', /(?:boards|job-boards)\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-z0-9_-]+)/i],
  ['lever', /jobs\.lever\.co\/([a-z0-9_-]+)/i],
  ['workable', /apply\.workable\.com\/([a-z0-9_-]+)/i],
  ['bamboohr', /([a-z0-9-]+)\.bamboohr\.com/i],
  ['jazzhr', /([a-z0-9-]+)\.applytojob\.com/i],
  ['paylocity', /recruiting\.paylocity\.com\/recruiting\/jobs\/All\/([a-z0-9-]+)/i],
  ['adp', /workforcenow\.adp\.com[^"' ]*cid=([a-z0-9-]+)/i],
  ['workday', /([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com/i],
  ['breezy', /([a-z0-9-]+)\.breezy\.hr/i],
  ['rippling', /ats\.rippling\.com\/([a-z0-9-]+)/i],
  ['indeed', /indeed\.com\/(?:cmp|viewjob|job)[^"' ]*/i],
];

const get = async (url) => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TwinCityCannabis/1.0; +https://twincitycannabis.com/jobs/)' } });
    if (!r.ok) return { status: r.status, html: '' };
    const type = r.headers.get('content-type') || '';
    if (!type.includes('html')) return { status: r.status, html: '' };
    return { status: r.status, html: (await r.text()).slice(0, 600000), url: r.url };
  } catch (e) {
    return { status: 0, html: '', error: String(e.name || e) };
  } finally { clearTimeout(t); }
};

const scanShop = async (d) => {
  let base;
  try { base = new URL(d.website); } catch { return { id: d.id, name: d.name, city: d.city, website: d.website || null, result: 'no-website' }; }
  const origin = base.origin;
  const pages = [origin + '/', origin + '/careers', origin + '/jobs'];
  const found = {};
  let careersPage = null;
  let reached = false;
  for (const u of pages) {
    const r = await get(u);
    if (r.html) reached = true;
    if (r.html && u !== origin + '/' && /career|job|position|hiring|apply/i.test(r.html.slice(0, 200000))) careersPage = careersPage || (r.url || u);
    for (const [name, re] of ATS) {
      const m = r.html.match(re);
      if (m && !found[name]) found[name] = m[1] || m[0];
    }
    // A homepage link to a careers page counts, even if /careers itself 404s.
    const link = r.html.match(/href=["']([^"']*(?:careers|jobs|employment|join-our-team|work-with-us)[^"']*)["']/i);
    if (link && !careersPage) { try { careersPage = new URL(link[1], origin).href; } catch { /* bad href */ } }
  }
  return {
    id: d.id, name: d.name, city: d.city, website: origin,
    result: Object.keys(found).length ? 'ats' : careersPage ? 'careers-page' : reached ? 'none' : 'unreachable',
    ats: found, careers_page: careersPage,
  };
};

(async () => {
  const shops = TCC.dispensaries.filter((d) => d.website);
  const out = [];
  const queue = shops.slice();
  const worker = async () => { while (queue.length) out.push(await scanShop(queue.shift())); };
  await Promise.all(Array.from({ length: 8 }, worker));
  out.sort((a, b) => a.id.localeCompare(b.id));
  const tally = out.reduce((t, r) => ((t[r.result] = (t[r.result] || 0) + 1), t), {});
  fs.writeFileSync(OUT, JSON.stringify({ scanned_at: new Date().toISOString(), shops: TCC.dispensaries.length, with_website: shops.length, tally, results: out }, null, 1) + '\n');
  console.log(`careers scan: ${shops.length} shop sites`, tally);
  for (const r of out.filter((x) => x.result === 'ats')) console.log(`  ${r.id}: ${JSON.stringify(r.ats)}`);
})();
