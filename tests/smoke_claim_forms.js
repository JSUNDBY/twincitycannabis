#!/usr/bin/env node
/*
 * Daily smoke test of the two claim forms, run on the LIVE site the way an
 * owner uses them: open the page, pass the age gate, fill the form, press
 * Send, and wait for the thank-you panel.
 *
 * Why: from July to 2026-09-15 the dispensary claim form silently did
 * nothing (its handler looked up ids that were not in the markup), and 19
 * owner claims were lost before that on a Kit embed. Every check we had
 * tested the worker endpoint, never the page. This tests the page.
 *
 * The worker recognizes SMOKE_EMAIL: it records the time in KV
 * (smoke:contact:<kind>) and returns ok without storing a lead or emailing
 * anyone. The worker's hourly monitor alerts when that time goes stale, so
 * a broken form, or this test not running, both reach Josh.
 *
 * Run: node tests/smoke_claim_forms.js   (CHROME_PATH=... to pick a browser)
 * Exit 0 = both forms reached the worker and showed the thank-you panel.
 */
const puppeteer = require('puppeteer-core');

const SITE = process.env.SITE || 'https://twincitycannabis.com';
const SMOKE_EMAIL = 'smoke-test@twincitycannabis.com';
const CHROME = process.env.CHROME_PATH || (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : '/usr/bin/google-chrome');

const FORMS = [
  { page: 'for-dispensaries', kind: 'dispensary', orgField: 'dispensary' },
  { page: 'for-cultivators', kind: 'brand', orgField: 'brand' },
];

async function check(browser, f) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(`${SITE}/?smoke=${Date.now()}#${f.page}`, { waitUntil: 'networkidle2', timeout: 60000 });
    const gate = await page.$('#tcc-age-yes');
    if (gate && await gate.isIntersectingViewport()) await gate.click();

    const sel = `form.claim-form[data-kind="${f.kind}"]`;
    await page.waitForSelector(`${sel} [name="name"]`, { visible: true, timeout: 20000 });
    await page.type(`${sel} [name="name"]`, 'TCC smoke test');
    await page.type(`${sel} [name="email"]`, SMOKE_EMAIL);
    await page.type(`${sel} [name="${f.orgField}"]`, 'Automated daily form check (discarded)');
    await page.type(`${sel} [name="message"]`, 'Automated check that this form reaches the worker.');

    const posted = page.waitForResponse(
      (r) => r.url().endsWith('/contact') && r.request().method() === 'POST', { timeout: 30000 });
    await page.click(`${sel} button[type="submit"]`);
    const res = await posted;
    if (!res.ok()) throw new Error(`worker answered ${res.status()}`);

    // The thank-you panel is the form's next sibling; it must become visible.
    await page.waitForFunction((s) => {
      const form = document.querySelector(s);
      const thanks = form && form.parentElement.querySelector('.claim-thanks');
      return form && form.hidden && thanks && !thanks.hidden;
    }, { timeout: 15000 }, sel);
    console.log(`ok   ${f.kind} form (#${f.page}): posted, worker ${res.status()}, thank-you shown`);
    return true;
  } catch (e) {
    console.log(`FAIL ${f.kind} form (#${f.page}): ${e.message}` + (errors.length ? `\n     page errors: ${errors.join(' | ')}` : ''));
    return false;
  } finally {
    await page.close();
  }
}

// The worker's hourly monitor must have run in the last 2 hours. It emails
// Josh about everything else; this is the one thing it cannot report itself.
async function checkMonitor() {
  try {
    const r = await fetch('https://dashboard.twincitycannabis.com/monitor-status', { headers: { 'Cache-Control': 'no-cache' } });
    const s = await r.json();
    const age = s.at ? (Date.now() - Date.parse(s.at)) / 3600e3 : Infinity;
    if (age > 2) throw new Error(s.at ? `last ran ${age.toFixed(1)}h ago (${s.at})` : 'has never run');
    console.log(`ok   hourly monitor: last ran ${Math.round(age * 60)} min ago` + (s.problems && s.problems.length ? `, open: ${s.problems.join(', ')}` : ', all clear'));
    return true;
  } catch (e) {
    console.log(`FAIL hourly monitor: ${e.message}`);
    return false;
  }
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  let ok = true;
  for (const f of FORMS) ok = (await check(browser, f)) && ok;
  await browser.close();
  if (process.env.SKIP_MONITOR_CHECK !== '1') ok = (await checkMonitor()) && ok;
  process.exit(ok ? 0 : 1);
})();
