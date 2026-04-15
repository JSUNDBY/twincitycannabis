#!/usr/bin/env node
/**
 * Scrape dispensary emails from their websites.
 *
 * For each dispensary with a website URL, fetches the homepage + likely
 * contact pages and extracts email addresses. Writes results to
 * outreach/dispensary-emails.json, which build_contact_list.js reads
 * to populate the email column.
 *
 * Run:
 *   node scripts/scrape_dispensary_emails.js
 *
 * Re-runnable — caches by dispensary id. Pass --force to re-fetch all.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'outreach');
const OUT_FILE = path.join(OUT_DIR, 'dispensary-emails.json');

const FORCE = process.argv.includes('--force');

global.window = {};
require(path.join(ROOT, 'js/data.js'));
const TCC = global.window.TCC || global.TCC;

// Pages we try to fetch, relative to the dispensary homepage
const CONTACT_PATHS = ['', '/contact', '/contact/', '/contact-us', '/contact-us/', '/about', '/about/'];

// Emails to ignore (WordPress auto-generated, boilerplate, etc)
const IGNORE_DOMAINS = [
  'wordpress.com', 'wixpress.com', 'sentry.io', 'example.com',
  'google.com', 'facebook.com', 'squarespace.com', 'shopify.com',
  'gstatic.com', 'googleapis.com', 'cloudflare.com', 'weedmaps.com',
  'sentry.wixpress.com',
];
const IGNORE_LOCAL_PARTS = [
  'no-reply', 'noreply', 'donotreply', 'do-not-reply',
  'abuse', 'postmaster', 'webmaster', 'admin@example',
];

const EMAIL_RE = /\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g;

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36';

async function fetchText(url) {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
      signal: AbortSignal.timeout(12000),
      redirect: 'follow',
    });
    if (!r.ok) return null;
    return await r.text();
  } catch (_) {
    return null;
  }
}

function normalizeUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch (_) {
    return null;
  }
}

function scoreEmail(email, dispensary) {
  // Higher is better.
  const lower = email.toLowerCase();
  const local = lower.split('@')[0];
  const domain = lower.split('@')[1] || '';

  // Ignore filter
  if (IGNORE_DOMAINS.some((d) => domain.endsWith(d))) return -1;
  if (IGNORE_LOCAL_PARTS.some((p) => local.startsWith(p))) return -1;

  let score = 0;
  // Domain matches dispensary website — strong signal
  if (dispensary.website) {
    try {
      const webHost = new URL(dispensary.website).host.replace(/^www\./, '');
      if (domain.endsWith(webHost)) score += 50;
    } catch (_) {}
  }
  // Preferred local parts
  if (['info', 'hello', 'contact', 'sales', 'orders', 'team'].includes(local)) score += 10;
  // Shorter local part = more likely canonical
  score += Math.max(0, 10 - local.length);
  return score;
}

async function extractEmails(homepage, dispensary) {
  const found = new Set();
  let instagram = '';

  for (const p of CONTACT_PATHS) {
    const url = homepage + p;
    const html = await fetchText(url);
    if (!html) continue;

    // mailto: links
    const mailtos = html.match(/mailto:([^"'?\s>]+)/g) || [];
    mailtos.forEach((m) => found.add(m.slice(7).toLowerCase()));

    // Bare email patterns in text
    const matches = html.match(EMAIL_RE) || [];
    matches.forEach((e) => found.add(e.toLowerCase()));

    // Instagram link (useful fallback — lots of dispensaries have email in IG bio)
    if (!instagram) {
      const igMatch = html.match(/https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9._]+)/);
      if (igMatch) instagram = `https://instagram.com/${igMatch[1]}`;
    }
  }

  // Score and pick the best
  const ranked = [...found]
    .map((e) => ({ email: e, score: scoreEmail(e, dispensary) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score);

  return {
    best: ranked[0]?.email || '',
    all: ranked.slice(0, 5).map((r) => r.email),
    instagram,
  };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let cache = {};
  if (fs.existsSync(OUT_FILE)) {
    cache = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
  }

  const targets = TCC.dispensaries.filter((d) => {
    if (!d.website) return false;
    if (!FORCE && cache[d.id]?.email) return false;
    return true;
  });

  console.log(`Scraping ${targets.length} dispensaries for emails...`);
  console.log('(previously-found emails are cached; pass --force to re-scrape)');
  console.log();

  let found = 0;
  for (const d of targets) {
    const homepage = normalizeUrl(d.website);
    if (!homepage) {
      process.stdout.write(`  skip (bad url):  ${d.name}\n`);
      continue;
    }
    // Skip weedmaps URLs — they don't have the dispensary's actual email
    if (homepage.includes('weedmaps.com')) {
      process.stdout.write(`  skip (weedmaps): ${d.name}\n`);
      continue;
    }
    process.stdout.write(`  ${d.name}... `);
    const result = await extractEmails(homepage, d);
    if (result.best) {
      cache[d.id] = {
        email: result.best,
        source: 'website',
        all_emails: result.all,
        instagram: result.instagram,
        scraped_at: new Date().toISOString().slice(0, 10),
      };
      found++;
      process.stdout.write(`${result.best}\n`);
    } else if (result.instagram) {
      cache[d.id] = {
        email: '',
        source: 'none',
        instagram: result.instagram,
        scraped_at: new Date().toISOString().slice(0, 10),
      };
      process.stdout.write(`no email (IG: ${result.instagram})\n`);
    } else {
      cache[d.id] = { email: '', source: 'none', scraped_at: new Date().toISOString().slice(0, 10) };
      process.stdout.write(`no email found\n`);
    }
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(cache, null, 2));
  console.log();
  console.log(`Done. ${found}/${targets.length} new emails found.`);
  console.log(`Cache: ${path.relative(ROOT, OUT_FILE)}`);
  console.log();
  console.log(`Next: re-run build_contact_list.js to update the CSV/markdown.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
