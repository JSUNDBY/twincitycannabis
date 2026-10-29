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
 *
 * loadJobs() is also used by build_seo.js for the "Now hiring" block on shop
 * pages. Each job is matched to a TCC shop when the match is certain: an
 * owner post names its shop; a feed job matches on city + street number; a
 * brand feed (Vireo -> Green Goods) matches a store job to the one shop of
 * that brand in the job's city.
 */
const fs = require('fs');
const path = require('path');

const STALE_DAYS = 7;      // a job its feed hasn't shown for this long is dropped
const VALID_DAYS = 30;     // validThrough when the feed gives no deadline
const CITY_PAGE_MIN = 2;
const DAY = 864e5;

const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
// Same street number plus at least one shared street word, so two shops with
// the same number on different streets never collide, while "1570 61 US-14"
// still matches "1570 US-14 61 E".
const streetParts = (s) => {
  const m = fold(s).split(',')[0].match(/^\s*(\d+)\s+(.*)$/);
  return m ? { n: m[1], words: new Set(m[2].split(/[^a-z0-9]+/).filter(w => w.length > 1 || /\d/.test(w))) } : null;
};
const sameStreet = (a, b) => {
  const x = streetParts(a), y = streetParts(b);
  return !!(x && y && x.n === y.n && [...x.words].some(w => y.words.has(w)));
};
const STORE_ROLE = /budtender|dispensary|retail|store|sales associate|patient/i;

// "3456 E Circle Drive NE, Rochester, MN 55906" -> street + ZIP.
const shopAddress = (d) => {
  const m = String(d.address || '').match(/^([^,]+),.*\bMN\s+(\d{5})/);
  return m ? { street: m[1].trim(), postal_code: m[2] } : null;
};

const matchShop = (j, shops) => {
  if (j.shop) return shops.find(d => d.id === j.shop) || null;
  const inCity = shops.filter(d => fold(d.city) === fold(j.city));
  if (j.street) {
    const hit = inCity.filter(d => sameStreet(j.street, d.address));
    if (hit.length === 1) return hit[0];
  }
  if (j.shop_brand && STORE_ROLE.test(j.title)) {
    const hit = inCity.filter(d => fold(d.name).includes(fold(j.shop_brand)));
    if (hit.length === 1) return hit[0];
  }
  return null;
};

function loadJobs({ ROOT, today, slugify, dispensaries }) {
  let data = { jobs: [] };
  try { data = JSON.parse(fs.readFileSync(path.join(ROOT, 'scraper', 'data', 'jobs.json'), 'utf8')); } catch { /* no jobs yet */ }

  const slug = (s) => slugify(String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  const now = Date.now();
  return (data.jobs || [])
    .filter(j => now - Date.parse(j.last_seen) < STALE_DAYS * DAY)
    .filter(j => !j.deadline || j.deadline >= today)
    .map(j => {
      const shop = matchShop(j, dispensaries || []);
      // Owner posts carry only the shop id; the listing supplies the rest.
      if (j.source === 'tcc-owner') {
        // Loud, not silent: this line lands in the Pi's build log.
        if (!shop) { console.error(`jobs: owner job ${j.id} names unknown shop "${j.shop}", dropped`); return null; }
        j = { ...j, employer: shop.name, city: shop.city };
      }
      const addr = shop && shopAddress(shop);
      // The shop's address fills a gap only when it can't contradict the
      // feed: no street of its own, and no ZIP or the same ZIP.
      const fill = addr && !j.street && (!j.postal_code || j.postal_code === addr.postal_code) ? addr : {};
      return {
        ...j,
        ...fill,
        shopId: shop ? shop.id : null,
        shopName: shop ? shop.name : null,
        slug: `${slug(j.title).endsWith(slug(j.city)) ? slug(j.title) : `${slug(j.title)}-${slug(j.city)}`}-${String(j.id).split('-').pop()}`,
        citySlug: slug(j.city),
        validThrough: j.deadline || new Date(Date.parse(j.last_seen) + VALID_DAYS * DAY).toISOString().slice(0, 10),
        // Featured jobs pin to the top of /jobs/ and city pages (D60 pricing).
        featured: !!(j.featured_until && j.featured_until >= today),
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.featured - a.featured) || b.date_posted.localeCompare(a.date_posted) || a.title.localeCompare(b.title));
}

// Stats key for apply clicks: the TCC shop when matched, else the employer.
const trackId = (j, slugify) => j.shopId || `employer-${slugify(fold(j.employer))}`.slice(0, 80);

const WORKER = 'https://dashboard.twincitycannabis.com';
// Same text as build_seo.js: MN Stat. 342.64 subd. 1(7) + OCM GM-2025-07.
const AD_WARNING = "Warning: Cannabis products are not for use by anyone under the age of 21. Cannabis use may cause drowsiness, affect focus, reaction time, and decision-making.";

function buildJobs({ ROOT, SITE, today, esc, slugify, headOpen, footer, renderFAQ, writePage, extraSitemap, dispensaries }) {
  const jobs = loadJobs({ ROOT, today, slugify, dispensaries });

  const usd = (n) => '$' + (n >= 1000 ? Math.round(n).toLocaleString('en-US') : n.toFixed(2).replace(/\.00$/, ''));
  const payText = (s) => s ? `${usd(s.min)}–${usd(s.max)}${s.unit === 'HOUR' ? '/hr' : '/yr'}` : '';
  const humanDay = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const typeText = { FULL_TIME: 'Full-time', PART_TIME: 'Part-time' };

  const cities = {};
  jobs.forEach(j => { (cities[j.citySlug] = cities[j.citySlug] || { name: j.city, jobs: [] }).jobs.push(j); });
  const cityPages = Object.entries(cities).filter(([, c]) => c.jobs.length >= CITY_PAGE_MIN)
    .sort((a, b) => b[1].jobs.length - a[1].jobs.length || a[1].name.localeCompare(b[1].name));

  // Featured rows sit first (loadJobs sorts them there) and carry the paid
  // placement notice required on every paid surface (MN Stat. 342.64).
  const table = (list) => `<table>
<thead><tr><th>Role</th><th>Employer</th><th>City</th><th>Pay</th><th>Posted</th></tr></thead>
<tbody>${list.map(j => `<tr${j.featured ? ' class="job-featured"' : ''}>
  <td>${j.featured ? '<span class="job-featured-pill" style="display:inline-block;font-size:.65rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#0a0d0a;background:var(--accent,#22c55e);padding:.15rem .45rem;border-radius:999px;margin-right:.4rem;vertical-align:middle">Featured</span>' : ''}<a href="/jobs/${j.slug}/">${esc(j.title)}</a></td>
  <td>${esc(j.employer)}</td>
  <td>${esc(j.city)}</td>
  <td>${esc(payText(j.salary)) || '—'}</td>
  <td>${esc(humanDay(j.date_posted))}</td>
</tr>`).join('\n')}</tbody>
</table>${list.some(j => j.featured) ? `
<p class="tcc-ad-warning tcc-ad-warning--unit">Jobs marked Featured are paid placements. ${AD_WARNING}</p>` : ''}`;

  const employerCta = `<div class="jobs-employer-cta" style="margin:2rem 0;padding:1rem 1.25rem;border:1px solid var(--border, #2a2a2a);border-radius:12px">
<h2 style="margin-top:0">Hiring at a Minnesota dispensary?</h2>
<p>Posting is free. <a href="/jobs/post/">Post a job</a> from your claimed listing and it goes up here, set up to show in Google's job search. If your shop already lists openings on Greenhouse, JazzHR, Lever or Workable, email the link to <a href="mailto:hello@twincitycannabis.com?subject=Job%20board%20link">hello@twincitycannabis.com</a> and we'll keep them in sync automatically.</p>
</div>`;

  // Job alerts: worker /jobs/alerts -> Kit subscriber tagged tcc-jobs. The
  // 21+ box is required; Minnesota dispensary work is 21+ anyway.
  const alertBox = `<div class="jobs-alert" style="margin:2rem 0;padding:1rem 1.25rem;border:1px solid var(--border, #2a2a2a);border-radius:12px;max-width:560px">
<h2 style="margin-top:0">Get new cannabis jobs by email</h2>
<form id="jobs-alert-form">
<input type="email" name="email" required maxlength="200" placeholder="you@email.com" autocomplete="email" style="width:100%;padding:.6rem .75rem;margin-bottom:.6rem;background:var(--bg-secondary,#0b120e);color:var(--text-primary,#f5f6f8);border:1px solid var(--border,#22302a);border-radius:8px;font:inherit">
<label style="display:flex;gap:.5rem;align-items:flex-start;font-size:.88rem;margin-bottom:.7rem"><input type="checkbox" name="adult" required style="margin-top:.2rem"> <span>I'm 21 or older. Email me new Minnesota cannabis jobs. Unsubscribe any time.</span></label>
<button type="submit" class="cta" style="border:none;cursor:pointer;font:inherit">Send me job alerts</button>
<p class="jobs-alert-err" hidden style="color:#f87171;font-size:.85rem;margin:.5rem 0 0"></p>
</form>
<p class="jobs-alert-thanks" hidden style="margin:0">You're on the list. New Minnesota cannabis jobs will come to your inbox.</p>
</div>
<script>
(function () {
  var f = document.getElementById('jobs-alert-form');
  if (!f) return;
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    var err = f.querySelector('.jobs-alert-err');
    err.hidden = true;
    fetch(${JSON.stringify(WORKER + '/jobs/alerts')}, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: f.email.value, adult: f.adult.checked }) })
      .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, b: b }; }); })
      .then(function (x) {
        if (!x.ok || !x.b.ok) throw new Error((x.b && x.b.message) || 'Something went wrong. Try again in a minute.');
        f.hidden = true; f.parentElement.querySelector('.jobs-alert-thanks').hidden = false;
      })
      .catch(function (e2) { err.textContent = e2.message; err.hidden = false; });
  });
})();
</script>`;

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
      { q: 'How can my dispensary post a job here?', a: 'Posting is free. Claimed owners post from twincitycannabis.com/jobs/post/. Or email the link to your Greenhouse, JazzHR, Lever or Workable board to hello@twincitycannabis.com and we keep your openings in sync.' },
    ]);
    const html = headOpen({ title, description, canonical, schema: [listSchema, faqSchema] }) + `
<div class="crumbs"><a href="/">Home</a> / Jobs</div>
<h1>Minnesota Cannabis Jobs</h1>
<p>${jobs.length ? `<strong>${jobs.length}</strong> open roles at Minnesota cannabis companies, from budtender to general manager.` : 'No open roles listed right now. Check back soon.'} Every listing comes from the employer's own job board and links to their application page. Updated ${esc(humanDay(today))}.</p>
${cityChips}
${jobs.length ? table(jobs) : ''}
${alertBox}
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
      jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', ...(j.street ? { streetAddress: j.street } : {}), addressLocality: j.city, addressRegion: 'MN', ...(j.postal_code ? { postalCode: j.postal_code } : {}), addressCountry: 'US' } },
      directApply: false,
      url: canonical,
    };
    if (j.employment_type) posting.employmentType = j.employment_type;
    if (j.salary) posting.baseSalary = { '@type': 'MonetaryAmount', currency: 'USD', value: { '@type': 'QuantitativeValue', minValue: j.salary.min, maxValue: j.salary.max, unitText: j.salary.unit } };

    const facts = [
      `<strong>Employer:</strong> ${esc(j.employer)}`,
      j.shopId ? `<strong>Store:</strong> <a href="/dispensaries/${esc(j.shopId)}/">${esc(j.shopName)}</a>` : (j.store ? `<strong>Store:</strong> ${esc(j.store)}` : ''),
      `<strong>Location:</strong> ${j.street ? esc(j.street) + ', ' : ''}${esc(j.city)}, MN`,
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
<p style="font-size:.85rem;color:var(--text-muted);margin-top:1rem">${j.source === 'tcc-owner' ? `Posted by ${esc(j.employer)} on Twin City Cannabis.` : `Listed from ${esc(j.employer)}'s public job board.`} Last checked ${esc(humanDay(j.last_seen.slice(0, 10)))}.</p>
<script>
(function () {
  // Apply clicks are the number Featured job pricing waits on (D60).
  document.querySelectorAll('a.cta[target="_blank"]').forEach(function (a) {
    a.addEventListener('click', function () {
      try { fetch(${JSON.stringify(WORKER + '/track')}, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ${JSON.stringify(trackId(j, slugify))}, event: 'apply_click' }), keepalive: true }).catch(function () {}); } catch (e) {}
    });
  });
})();
</script>
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
${alertBox}
${employerCta}
${workNote}
` + footer;
    writePage(`jobs/cannabis-jobs-${s}/index.html`, html);
    extraSitemap.push({ loc: canonical, priority: '0.6', changefreq: 'daily' });
    written++;
  });

  written += buildPostPage({ SITE, esc, headOpen, footer, writePage, extraSitemap, dispensaries });

  console.log(`Wrote ${written} jobs pages (${jobs.length} open jobs, ${jobs.filter(j => j.shopId).length} matched to shops, ${cityPages.length} city pages)`);
  return written;
}

module.exports = buildJobs;
module.exports.loadJobs = loadJobs;

// ---- /jobs/post/ ----
// Owner post form. Same gate as owner specials: the worker accepts a post only
// for a claimed listing, emails that owner a confirmation link, and the job
// reaches Josh's approval queue only after the owner clicks it. Approved jobs
// come back through fetch_jobs.js (source tcc-owner) on the next build.
function buildPostPage({ SITE, esc, headOpen, footer, writePage, extraSitemap, dispensaries }) {
  const shops = (dispensaries || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const field = 'width:100%;padding:.6rem .75rem;margin:.25rem 0 .8rem;background:var(--bg-secondary,#0b120e);color:var(--text-primary,#f5f6f8);border:1px solid var(--border,#22302a);border-radius:8px;font:inherit';
  const canonical = `${SITE}/jobs/post/`;
  const html = headOpen({
    title: 'Post a Cannabis Job in Minnesota (Free) | Twin City Cannabis',
    description: 'Minnesota dispensaries post job openings free on Twin City Cannabis. Listings are set up for Google job search and link to your application page.',
    canonical, schema: [],
  }) + `
<div class="crumbs"><a href="/">Home</a> / <a href="/jobs/">Jobs</a> / Post a job</div>
<h1>Post a job</h1>
<p>Posting is free for Minnesota dispensaries with a claimed listing. We email the owner address on your listing to confirm, review the post, and publish it on <a href="/jobs/">/jobs/</a> and your shop page, usually within a day. Your listing isn't claimed yet? <a href="/contact/">Claim it free</a> first.</p>
<form id="job-post-form" style="max-width:560px">
<label>Your shop *<select name="shop" required style="${field}"><option value="">Choose your listing</option>${shops.map(d => `<option value="${esc(d.id)}">${esc(d.name)}${d.city ? ` (${esc(d.city)})` : ''}</option>`).join('')}</select></label>
<label>Job title *<input name="title" required minlength="3" maxlength="90" placeholder="Budtender" style="${field}"></label>
<label>Type<select name="employment_type" style="${field}"><option value="">Not specified</option><option value="FULL_TIME">Full-time</option><option value="PART_TIME">Part-time</option></select></label>
<div style="display:flex;gap:.6rem;flex-wrap:wrap">
<label style="flex:1;min-width:110px">Pay from ($)<input name="pay_min" type="number" min="1" step="0.01" style="${field}"></label>
<label style="flex:1;min-width:110px">Pay to ($)<input name="pay_max" type="number" min="1" step="0.01" style="${field}"></label>
<label style="flex:1;min-width:110px">Per<select name="pay_unit" style="${field}"><option value="HOUR">hour</option><option value="YEAR">year</option></select></label>
</div>
<label>Application link *<input name="apply_url" type="url" required maxlength="500" placeholder="https://yourshop.com/careers" style="${field}"></label>
<label>Description * <span style="font-size:.8rem;color:var(--text-muted)">(duties, schedule, requirements; 80 characters or more)</span><textarea name="description" required minlength="80" maxlength="4000" rows="8" style="${field}"></textarea></label>
<label>Take it down on <span style="font-size:.8rem;color:var(--text-muted)">(optional, up to 60 days; default 30)</span><input name="ends" type="date" style="${field}"></label>
<button type="submit" class="cta" style="border:none;cursor:pointer;font:inherit">Send for review</button>
<p id="job-post-err" hidden style="color:#f87171;font-size:.9rem;margin:.6rem 0 0"></p>
</form>
<div id="job-post-thanks" hidden style="max-width:560px;padding:1rem 1.25rem;border:1px solid var(--border,#22302a);border-radius:12px">
<p style="margin:0">Check your inbox. We sent a confirmation link to <strong id="job-post-to"></strong>. After you click it, we review the job and publish it.</p>
</div>
<p style="font-size:.9rem;color:var(--text-muted);margin-top:1.5rem">Minnesota dispensary staff must be 21 or older and pass a background check. Twin City Cannabis never takes applications or fees from job seekers; the apply button goes to your link.</p>
<script>
(function () {
  var f = document.getElementById('job-post-form');
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    var err = document.getElementById('job-post-err');
    err.hidden = true;
    var body = {};
    ['shop', 'title', 'employment_type', 'pay_min', 'pay_max', 'pay_unit', 'apply_url', 'description', 'ends'].forEach(function (k) { body[k] = f[k].value; });
    fetch(${JSON.stringify(WORKER + '/jobs/post')}, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, b: b }; }); })
      .then(function (x) {
        if (!x.ok || !x.b.ok) throw new Error((x.b && (x.b.message || x.b.error)) || 'Something went wrong. Try again in a minute.');
        document.getElementById('job-post-to').textContent = x.b.confirm_sent_to || 'the owner email on your listing';
        f.hidden = true; document.getElementById('job-post-thanks').hidden = false;
      })
      .catch(function (e2) { err.textContent = e2.message; err.hidden = false; });
  });
})();
</script>
` + footer;
  writePage('jobs/post/index.html', html);
  extraSitemap.push({ loc: canonical, priority: '0.3', changefreq: 'monthly' });
  return 1;
}
