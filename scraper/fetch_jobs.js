#!/usr/bin/env node
/**
 * Fetch Minnesota cannabis job openings from employers' public ATS feeds
 * (Greenhouse job-board API today) into scraper/data/jobs.json, which
 * scripts/build_jobs.js turns into the /jobs/ pages.
 *
 * Only official public feeds: never Indeed/LinkedIn scraping (D60 spec).
 * Minnesota locations only.
 *
 * Fail-closed per source: a source that errors keeps its previous jobs with
 * their old `last_seen`, and the build drops any job not seen for
 * STALE_DAYS (build_jobs.js), so a dead feed expires instead of lingering.
 * A job missing from a successful fetch is gone immediately.
 *
 * Run: node scraper/fetch_jobs.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const SOURCES = path.join(__dirname, 'jobs_sources.json');
const OUT = path.join(__dirname, 'data', 'jobs.json');

const getJson = (url) => new Promise((resolve, reject) => {
  const req = https.get(url, { headers: { 'User-Agent': 'TwinCityCannabis/1.0 (+https://twincitycannabis.com/jobs/)' }, timeout: 20000 }, (res) => {
    if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
    let body = '';
    res.setEncoding('utf8');
    res.on('data', (c) => { body += c; });
    res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
  });
  req.on('timeout', () => req.destroy(new Error('timeout')));
  req.on('error', reject);
});

const decodeEntities = (s) => String(s || '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;|&#x27;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

// Keep employer formatting, drop everything else (scripts, styles, attributes).
const ALLOWED = new Set(['p', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'br', 'h2', 'h3', 'h4']);
const sanitize = (raw) => decodeEntities(raw)
  .replace(/<(script|style|iframe)[\s\S]*?<\/\1>/gi, '')
  .replace(/<\/?([a-z0-9]+)[^>]*>/gi, (m, tag) => {
    const t = tag.toLowerCase();
    if (!ALLOWED.has(t)) return '';
    return m.startsWith('</') ? `</${t}>` : (t === 'br' ? '<br>' : `<${t}>`);
  })
  .replace(/<p>\s*<\/p>/g, '')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const text = (h) => decodeEntities(String(h || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// "$70,000-$80,000" / "$19.78 - $24.73 per hour". Only ranges with a stated
// unit, or that are clearly annual, so a stray dollar figure never becomes pay.
const parseSalary = (plain) => {
  const m = plain.match(/\$\s?(\d[\d,]*(?:\.\d{1,2})?)\s*(?:-|–|—|to)\s*\$?\s?(\d[\d,]*(?:\.\d{1,2})?)([^.;]{0,30})/i);
  if (!m) return null;
  const min = parseFloat(m[1].replace(/,/g, ''));
  const max = parseFloat(m[2].replace(/,/g, ''));
  if (!(min > 0 && max >= min)) return null;
  const tail = m[3].toLowerCase();
  let unit = null;
  if (/hour|\/hr|\bhr\b|hourly/.test(tail)) unit = 'HOUR';
  else if (/year|annual|\/yr|salary/.test(tail) || min >= 20000) unit = 'YEAR';
  if (!unit) return null;
  if (unit === 'HOUR' && (min < 10 || max > 200)) return null;
  if (unit === 'YEAR' && (min < 20000 || max > 500000)) return null;
  return { min, max, unit };
};

const employmentType = (title, plain) => {
  const s = `${title} ${plain.slice(0, 1500)}`.toLowerCase();
  if (/part[- ]time/.test(s) && !/full[- ]time/.test(s)) return 'PART_TIME';
  if (/full[- ]time/.test(s) && !/part[- ]time/.test(s)) return 'FULL_TIME';
  return null;
};

// "Lindström, MN" -> { city: "Lindström", region: "MN" }. MN only.
const parseLocation = (name) => {
  const m = String(name || '').trim().match(/^(.+?),\s*(MN|Minnesota)$/i);
  if (!m) return null;
  const city = m[1].trim().replace(/\b([a-z])([A-Z]+)/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
  return { city: city.replace(/^MInneapolis$/i, 'Minneapolis'), region: 'MN' };
};

const fetchGreenhouse = async (src, now) => {
  const data = await getJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(src.board)}/jobs?content=true`);
  const jobs = [];
  for (const j of data.jobs || []) {
    const loc = parseLocation(j.location && j.location.name);
    if (!loc) continue;
    const description = sanitize(j.content);
    const plain = text(description);
    if (!j.title || plain.length < 80) continue;
    jobs.push({
      id: `${src.id}-${j.id}`,
      source: src.id,
      title: String(j.title).trim(),
      employer: src.employer || j.company_name,
      city: loc.city,
      region: loc.region,
      apply_url: j.absolute_url,
      date_posted: (j.first_published || j.updated_at || now).slice(0, 10),
      updated: (j.updated_at || now).slice(0, 10),
      deadline: j.application_deadline ? String(j.application_deadline).slice(0, 10) : null,
      salary: parseSalary(plain),
      employment_type: employmentType(j.title, plain),
      description_html: description,
      last_seen: now,
    });
  }
  return jobs;
};

const FETCHERS = { greenhouse: fetchGreenhouse };

(async () => {
  const now = new Date().toISOString();
  const sources = JSON.parse(fs.readFileSync(SOURCES, 'utf8'));
  let prev = { jobs: [], sources: {} };
  try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { /* first run */ }

  const out = { updated_at: now, sources: {}, jobs: [] };
  for (const src of sources) {
    const fetcher = FETCHERS[src.type];
    try {
      if (!fetcher) throw new Error(`unknown source type ${src.type}`);
      const jobs = await fetcher(src, now);
      out.jobs.push(...jobs);
      out.sources[src.id] = { status: 'ok', fetched_at: now, count: jobs.length };
      console.log(`jobs: ${src.id} ok, ${jobs.length} MN openings`);
    } catch (e) {
      const kept = (prev.jobs || []).filter(j => j.source === src.id);
      out.jobs.push(...kept);
      const last = prev.sources && prev.sources[src.id];
      out.sources[src.id] = { status: 'failed', error: String(e.message || e), fetched_at: last ? last.fetched_at : null, count: kept.length };
      console.log(`jobs: ${src.id} FAILED (${e.message || e}); kept ${kept.length} from last good fetch`);
    }
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
  console.log(`jobs: wrote ${out.jobs.length} jobs to ${path.relative(ROOT, OUT)}`);
})().catch((e) => { console.error('fetch_jobs failed:', e); process.exit(1); });
