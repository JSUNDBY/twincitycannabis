/**
 * /jobs/ — Minnesota cannabis job board (D60 pilot, 2026-10-26).
 *
 * Reads scraper/data/jobs.json (written by scraper/fetch_jobs.js) and emits:
 *   /jobs/                          every open job
 *   /jobs/<role>-<city>-<id>/       one job, JobPosting JSON-LD for Google for Jobs
 *   /jobs/cannabis-jobs-<city>/     city pages, for cities with 2+ open jobs
 *
 * Called from build_seo.js with its page helpers so the pages share the site
 * shell, lastmod manifest and sitemap. Expired jobs simply stop being emitted;
 * prune_orphans.py then removes their directories because they leave the
 * sitemap.
 */
const fs = require('fs');
const path = require('path');

const STALE_DAYS = 7;      // a job its feed hasn't shown for this long is dropped
const VALID_DAYS = 30;     // validThrough when the feed gives no deadline
const CITY_PAGE_MIN = 2;
const DAY = 864e5;

module.exports = function buildJobs({ ROOT, SITE, today, esc, slugify, headOpen, footer, renderFAQ, writePage, extraSitemap }) {
  let data = { jobs: [] };
  try { data = JSON.parse(fs.readFileSync(path.join(ROOT, 'scraper', 'data', 'jobs.json'), 'utf8')); } catch { /* no jobs yet */ }

  const slug = (s) => slugify(String(s).normalize('NFD').replace(/[̀-ͯ]/g, ''));
  const now = Date.now();
  const jobs = (data.jobs || [])
    .filter(j => now - Date.parse(j.last_seen) < STALE_DAYS * DAY)
    .filter(j => !j.deadline || j.deadline >= today)
    .map(j => ({
      ...j,
      slug: `${slug(j.title).endsWith(slug(j.city)) ? slug(j.title) : `${slug(j.title)}-${slug(j.city)}`}-${String(j.id).split('-').pop()}`,
      citySlug: slug(j.city),
      validThrough: j.deadline || new Date(Date.parse(j.last_seen) + VALID_DAYS * DAY).toISOString().slice(0, 10),
    }))
    .sort((a, b) => b.date_posted.localeCompare(a.date_posted) || a.title.localeCompare(b.title));

  const usd = (n) => '$' + (n >= 1000 ? Math.round(n).toLocaleString('en-US') : n.toFixed(2).replace(/\.00$/, ''));
  const payText = (s) => s ? `${usd(s.min)}–${usd(s.max)}${s.unit === 'HOUR' ? '/hr' : '/yr'}` : '';
  const humanDay = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const typeText = { FULL_TIME: 'Full-time', PART_TIME: 'Part-time' };

  const cities = {};
  jobs.forEach(j => { (cities[j.citySlug] = cities[j.citySlug] || { name: j.city, jobs: [] }).jobs.push(j); });
  const cityPages = Object.entries(cities).filter(([, c]) => c.jobs.length >= CITY_PAGE_MIN)
    .sort((a, b) => b[1].jobs.length - a[1].jobs.length || a[1].name.localeCompare(b[1].name));

  const table = (list) => `<table>
<thead><tr><th>Role</th><th>Employer</th><th>City</th><th>Pay</th><th>Posted</th></tr></thead>
<tbody>${list.map(j => `<tr>
  <td><a href="/jobs/${j.slug}/">${esc(j.title)}</a></td>
  <td>${esc(j.employer)}</td>
  <td>${esc(j.city)}</td>
  <td>${esc(payText(j.salary)) || '—'}</td>
  <td>${esc(humanDay(j.date_posted))}</td>
</tr>`).join('\n')}</tbody>
</table>`;

  const employerCta = `<div class="jobs-employer-cta" style="margin:2rem 0;padding:1rem 1.25rem;border:1px solid var(--border, #2a2a2a);border-radius:12px">
<h2 style="margin-top:0">Hiring at a Minnesota dispensary?</h2>
<p>Posting is free. Email the role, pay and your application link to <a href="mailto:hello@twincitycannabis.com?subject=Job%20post">hello@twincitycannabis.com</a> and it goes up here, set up to show in Google's job search. If your shop already lists openings on Greenhouse, Lever or Workable, send us the link and we'll keep them in sync automatically.</p>
</div>`;

  const workNote = `<p style="font-size:.9rem;color:var(--text-muted)">Minnesota requires dispensary workers to be 21 or older and to pass a background check. Every listing links to the employer's own application page; Twin City Cannabis never takes applications or fees from job seekers.</p>`;

  const cityChips = cityPages.length ? `<p class="jobs-cities">${cityPages.map(([s, c]) => `<a href="/jobs/cannabis-jobs-${s}/">${esc(c.name)} (${c.jobs.length})</a>`).join(' &middot; ')}</p>` : '';

  let written = 0;

  // ---- /jobs/ ----
  {
    const title = `Minnesota Cannabis Jobs: Dispensary & Budtender Openings (${today.slice(0, 4)})`;
    const description = jobs.length
      ? `${jobs.length} open cannabis jobs in Minnesota: budtenders, store managers, cultivation and operations roles, each linked to the employer's application page. Updated ${humanDay(today)}.`
      : `Minnesota cannabis jobs: budtender, dispensary manager and cultivation openings, linked to each employer's application page.`;
    const canonical = `${SITE}/jobs/`;
    const listSchema = {
      '@context': 'https://schema.org', '@type': 'ItemList', name: 'Minnesota cannabis job openings',
      numberOfItems: jobs.length,
      itemListElement: jobs.map((j, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/jobs/${j.slug}/` })),
    };
    const { html: faqHtml, schema: faqSchema } = renderFAQ([
      { q: 'How old do you have to be to work at a Minnesota dispensary?', a: '21 or older. Minnesota also requires a criminal background check for dispensary employees.' },
      { q: 'How do I apply for these cannabis jobs?', a: "Every listing links straight to the employer's own application page. Twin City Cannabis doesn't collect applications or charge job seekers anything." },
      { q: 'How can my dispensary post a job here?', a: 'Posting is free. Email the role, pay and application link to hello@twincitycannabis.com, or send the link to your Greenhouse, Lever or Workable board and we keep your openings in sync.' },
    ]);
    const html = headOpen({ title, description, canonical, schema: [listSchema, faqSchema] }) + `
<div class="crumbs"><a href="/">Home</a> / Jobs</div>
<h1>Minnesota Cannabis Jobs</h1>
<p>${jobs.length ? `<strong>${jobs.length}</strong> open roles at Minnesota cannabis companies, from budtender to general manager.` : 'No open roles listed right now. Check back soon.'} Every listing comes from the employer's own job board and links to their application page. Updated ${esc(humanDay(today))}.</p>
${cityChips}
${jobs.length ? table(jobs) : ''}
${employerCta}
${workNote}
${faqHtml}
` + footer;
    writePage('jobs/index.html', html);
    extraSitemap.push({ loc: canonical, priority: '0.7', changefreq: 'daily' });
    written++;
  }

  // ---- /jobs/<slug>/ ----
  jobs.forEach(j => {
    const pay = payText(j.salary);
    const title = `${j.title} — ${j.employer}, ${j.city}, MN | Cannabis Jobs`;
    const description = `${j.employer} is hiring a ${j.title} in ${j.city}, Minnesota${pay ? ` (${pay})` : ''}. Apply on the employer's site.`;
    const canonical = `${SITE}/jobs/${j.slug}/`;
    const posting = {
      '@context': 'https://schema.org',
      '@type': 'JobPosting',
      title: j.title,
      description: j.description_html,
      identifier: { '@type': 'PropertyValue', name: j.employer, value: String(j.id) },
      datePosted: j.date_posted,
      validThrough: `${j.validThrough}T23:59:59-05:00`,
      hiringOrganization: { '@type': 'Organization', name: j.employer },
      jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: j.city, addressRegion: 'MN', addressCountry: 'US' } },
      directApply: false,
      url: canonical,
    };
    if (j.employment_type) posting.employmentType = j.employment_type;
    if (j.salary) posting.baseSalary = { '@type': 'MonetaryAmount', currency: 'USD', value: { '@type': 'QuantitativeValue', minValue: j.salary.min, maxValue: j.salary.max, unitText: j.salary.unit } };

    const facts = [
      `<strong>Employer:</strong> ${esc(j.employer)}`,
      `<strong>Location:</strong> ${esc(j.city)}, MN`,
      pay ? `<strong>Pay:</strong> ${esc(pay)}` : '',
      j.employment_type ? `<strong>Type:</strong> ${typeText[j.employment_type]}` : '',
      `<strong>Posted:</strong> ${esc(humanDay(j.date_posted))}`,
    ].filter(Boolean).join(' &middot; ');
    const more = jobs.filter(o => o.id !== j.id && o.citySlug === j.citySlug).slice(0, 5);
    const cityLink = cities[j.citySlug].jobs.length >= CITY_PAGE_MIN ? `<a href="/jobs/cannabis-jobs-${j.citySlug}/">all cannabis jobs in ${esc(j.city)}</a>` : '';

    const html = headOpen({ title, description, canonical, schema: [posting] }) + `
<div class="crumbs"><a href="/">Home</a> / <a href="/jobs/">Jobs</a> / ${esc(j.title)}</div>
<h1>${esc(j.title)}</h1>
<p>${facts}</p>
<a class="cta" href="${esc(j.apply_url)}" rel="nofollow noopener" target="_blank">Apply on ${esc(j.employer)}'s site →</a>
<style>.job-description p,.job-description ul{margin:.85rem 0}.job-description li{margin:.3rem 0}</style>
<div class="job-description" style="margin-top:1.5rem">
${j.description_html}
</div>
<a class="cta" href="${esc(j.apply_url)}" rel="nofollow noopener" target="_blank">Apply for this job →</a>
<p style="font-size:.85rem;color:var(--text-muted);margin-top:1rem">Listed from ${esc(j.employer)}'s public job board. Last checked ${esc(humanDay(j.last_seen.slice(0, 10)))}.</p>
${more.length ? `<h2>More cannabis jobs in ${esc(j.city)}</h2><ul>${more.map(o => `<li><a href="/jobs/${o.slug}/">${esc(o.title)}</a> — ${esc(o.employer)}</li>`).join('')}</ul>` : ''}
<p><a href="/jobs/">All Minnesota cannabis jobs</a>${cityLink ? ` &middot; ${cityLink}` : ''}</p>
${workNote}
` + footer;
    writePage(`jobs/${j.slug}/index.html`, html);
    extraSitemap.push({ loc: canonical, priority: '0.6', changefreq: 'daily' });
    written++;
  });

  // ---- /jobs/cannabis-jobs-<city>/ ----
  cityPages.forEach(([s, c]) => {
    const title = `Cannabis Jobs in ${c.name}, MN — ${c.jobs.length} Dispensary Openings (${today.slice(0, 4)})`;
    const description = `${c.jobs.length} open cannabis jobs in ${c.name}, Minnesota: ${Array.from(new Set(c.jobs.map(j => j.title))).slice(0, 3).join(', ')}. Updated ${humanDay(today)}.`;
    const canonical = `${SITE}/jobs/cannabis-jobs-${s}/`;
    const listSchema = {
      '@context': 'https://schema.org', '@type': 'ItemList', name: `Cannabis jobs in ${c.name}, MN`,
      numberOfItems: c.jobs.length,
      itemListElement: c.jobs.map((j, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/jobs/${j.slug}/` })),
    };
    const html = headOpen({ title, description, canonical, schema: [listSchema] }) + `
<div class="crumbs"><a href="/">Home</a> / <a href="/jobs/">Jobs</a> / ${esc(c.name)}</div>
<h1>Cannabis Jobs in ${esc(c.name)}, MN</h1>
<p><strong>${c.jobs.length}</strong> open roles at cannabis companies in ${esc(c.name)}. Each links to the employer's application page. Updated ${esc(humanDay(today))}.</p>
${table(c.jobs)}
<p><a href="/jobs/">See all ${jobs.length} Minnesota cannabis jobs →</a></p>
${employerCta}
${workNote}
` + footer;
    writePage(`jobs/cannabis-jobs-${s}/index.html`, html);
    extraSitemap.push({ loc: canonical, priority: '0.6', changefreq: 'daily' });
    written++;
  });

  console.log(`Wrote ${written} jobs pages (${jobs.length} open jobs, ${cityPages.length} city pages)`);
  return written;
};
