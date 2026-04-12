#!/usr/bin/env node
/**
 * Capture mobile screenshots of twincitycannabis.com for social video.
 * Outputs 1170x2532 PNGs to assets/social/shots/
 */

const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const path = require("path");

puppeteer.use(StealthPlugin());

const SITE = process.env.TCC_SITE || "https://twincitycannabis.com";
const OUT = path.join(__dirname, "..", "assets", "social", "shots");

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const SHOTS = process.env.TCC_TIER_TEST
  ? [
      { name: "tier-list", url: "/#dispensaries", scrollY: 600 },
    ]
  : [
  { name: "01-home-hero",         url: "/",                                   scrollY: 0 },
  { name: "02-home-search",       url: "/",                                   scrollY: 600 },
  { name: "03-cheapest",          url: "/cheapest-cannabis-twin-cities/",     scrollY: 0 },
  { name: "04-cheapest-list",     url: "/cheapest-cannabis-twin-cities/",     scrollY: 900 },
  { name: "05-best-dispensaries", url: "/best-dispensaries-twin-cities/",     scrollY: 400 },
  { name: "06-minneapolis",       url: "/minneapolis-cannabis-dispensaries/", scrollY: 300 },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    defaultViewport: {
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    },
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) " +
      "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
  );

  // Prime age gate before any navigation
  await page.goto(SITE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.setItem("tcc-age-confirmed", "1");
    localStorage.setItem("tcc-theme", "dark");
  });

  for (const shot of SHOTS) {
    const url = SITE + shot.url;
    console.log(`→ ${shot.name}  ${url}`);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    // Give lazy content a beat
    await new Promise((r) => setTimeout(r, 1500));

    if (shot.scrollY) {
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), shot.scrollY);
      await new Promise((r) => setTimeout(r, 800));
    }

    const out = path.join(OUT, `${shot.name}.png`);
    await page.screenshot({ path: out, type: "png" });
    console.log(`  ✓ ${out}`);
  }

  await browser.close();
  console.log(`\nDone. ${SHOTS.length} shots in ${OUT}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
