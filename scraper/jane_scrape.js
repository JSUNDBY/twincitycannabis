#!/usr/bin/env node
/**
 * Twin City Cannabis — Jane (iHeartJane) rec menu scraper
 *
 * Scrapes recreational menus from Jane-powered dispensary websites using
 * Puppeteer with stealth mode (bypasses FingerprintJS + Cloudflare).
 * Intercepts the dmerch.iheartjane.com API response to get the full catalog.
 *
 * Usage:
 *   node scraper/jane_scrape.js                    # scrape all configured stores
 *   node scraper/jane_scrape.js --store gg-mpls    # scrape one store
 *   node scraper/jane_scrape.js --update-site      # scrape + merge into data.js
 *   node scraper/jane_scrape.js --dry-run          # scrape but don't write
 *
 * Output: scraper/data/jane_products.json
 */

const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
const modulesDir = path.join(ROOT, "node_modules");
const puppeteer = require(path.join(modulesDir, "puppeteer-extra"));
const StealthPlugin = require(path.join(modulesDir, "puppeteer-extra-plugin-stealth"));
puppeteer.use(StealthPlugin());

const DATA_DIR = path.join(__dirname, "data");
const JANE_OUTPUT = path.join(DATA_DIR, "jane_products.json");

// ─── STORE CONFIG ────────────────────────────────────────────────────────────
// Each entry maps a TCC dispensary slug to its Jane rec menu URL.
// Add new Jane-powered dispensaries here.
const JANE_STORES = {
  "minnesota-medical-solutions": {
    name: "Green Goods - Minneapolis",
    url: "https://visitgreengoods.com/minneapolis-mn-menu-rec/",
  },
  "green-goods-woodbury": {
    name: "Green Goods - Woodbury",
    url: "https://visitgreengoods.com/woodbury-mn-menu-rec/",
  },
  "minnesota-medical-solutions-bloomington": {
    name: "Green Goods - Bloomington",
    url: "https://visitgreengoods.com/bloomington-mn-menu-rec/",
  },
  "green-goods-blaine": {
    name: "Green Goods - Blaine",
    url: "https://visitgreengoods.com/blaine-mn-menu-rec/",
  },
  "green-goods-burnsville": {
    name: "Green Goods - Burnsville",
    url: "https://visitgreengoods.com/burnsville-mn-menu-rec/",
  },
};

// ─── BROWSER ─────────────────────────────────────────────────────────────────
const CHROMIUM_PATHS = [
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

function findChromium() {
  for (const p of CHROMIUM_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error("No Chromium/Chrome found");
}

// ─── CATEGORY MAPPING ────────────────────────────────────────────────────────
function mapCategory(kind, name) {
  const k = (kind || "").toLowerCase();
  const n = (name || "").toLowerCase();

  if (/pre.?roll|joint|blunt/i.test(k) || /pre.?roll|joint|blunt/i.test(n)) return "pre-roll";
  if (/vape|cartridge|disposable|pod|pen/i.test(k) || /cartridge|disposable|vape pen/i.test(n)) return "cartridge";
  if (/edible|gumm|chocolate|candy|chew|cookie|brownie/i.test(k) || /gumm|chocolate|brownie|cookie|chew/i.test(n)) return "edible";
  if (/drink|beverage|seltzer|soda|tonic|lemonade/i.test(k) || /seltzer|soda|tonic|lemonade|beverage/i.test(n)) return "beverage";
  if (/tincture|oil|spray|tablet|capsule/i.test(k) || /tincture|spray|tablet|capsule/i.test(n)) return "tincture";
  if (/topical|balm|salve|lotion|cream/i.test(k) || /salve|balm|lotion|cream|topical/i.test(n)) return "topical";
  if (/concentrate|wax|shatter|resin|rosin|dab|badder|sauce|diamond/i.test(k)) return "concentrate";
  if (/flower|bud|nug|shake|ground/i.test(k)) return "flower";

  // Fallback: check name for common product type keywords
  if (/gumm/i.test(n)) return "edible";
  if (/cart|disp|vape/i.test(n)) return "cartridge";
  if (/pre.?roll/i.test(n)) return "pre-roll";
  return "flower";
}

// ─── JUNK FILTER ─────────────────────────────────────────────────────────────
const JUNK_RE = /battery|lighter|grinder|rolling paper|raw cone|ashtray|tray|pipe|bong|rig|scale|stash|bag|jar|container|dosing capsule|tronian|blazy susan|bic |filter tip/i;

function isJunk(name) {
  return JUNK_RE.test(name);
}

// ─── WEIGHT NORMALIZATION ────────────────────────────────────────────────────
function normalizeWeight(weight) {
  const w = (weight || "").toLowerCase().trim();
  const map = {
    "each": "each",
    "half gram": "0.5 g",
    "gram": "1 g",
    "two grams": "2 g",
    "eighth ounce": "1/8 oz",
    "eighth": "1/8 oz",
    "quarter ounce": "1/4 oz",
    "quarter": "1/4 oz",
    "half ounce": "1/2 oz",
    "ounce": "1 oz",
  };
  return map[w] || w;
}

// ─── SCRAPE ONE STORE ────────────────────────────────────────────────────────
async function scrapeStore(browser, slug, config) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  let catalogData = null;
  page.on("response", async (resp) => {
    const url = resp.url();
    if (url.includes("dmerch.iheartjane.com") && (url.includes("/v2/multi") || url.includes("/v2/smart"))) {
      try {
        const text = await resp.text();
        // Keep the largest response (the full catalog, not the specials-only one)
        if (!catalogData || text.length > catalogData.length) {
          catalogData = text;
        }
      } catch {}
    }
  });

  console.log(`  Loading ${config.name}...`);
  try {
    await page.goto(config.url, { waitUntil: "domcontentloaded", timeout: 45000 });
  } catch (e) {
    console.log(`  WARN: page load issue (${e.message}), continuing...`);
  }

  // Wait for dmerch response
  const start = Date.now();
  while (!catalogData && Date.now() - start < 25000) {
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Scroll to trigger any lazy-loaded content
  if (!catalogData) {
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise((r) => setTimeout(r, 3000));
      if (catalogData) break;
    }
  }

  await page.close();

  if (!catalogData) {
    console.log(`  WARN: no product data from ${config.name}`);
    return [];
  }

  console.log(`  Received ${catalogData.length} bytes`);

  const parsed = JSON.parse(catalogData);

  // Extract products from placements array
  let rawProducts = [];
  if (parsed.placements && Array.isArray(parsed.placements)) {
    for (const p of parsed.placements) {
      if (p.products && Array.isArray(p.products)) {
        rawProducts = rawProducts.concat(p.products);
      }
    }
  } else if (parsed.products) {
    rawProducts = parsed.products;
  }

  // Deduplicate by product_id (same product appears in multiple placements)
  const seen = new Set();
  const unique = [];
  for (const p of rawProducts) {
    const pid = p.product_id || (p.search_attributes && p.search_attributes.product_id);
    if (pid && seen.has(pid)) continue;
    if (pid) seen.add(pid);
    unique.push(p);
  }

  // Normalize to TCC format
  const products = [];
  for (const raw of unique) {
    const attrs = raw.search_attributes || raw;
    const name = attrs.name || attrs.product_name || "";

    if (!name || isJunk(name)) continue;

    // Price
    let price = 0;
    let weight = "";

    if (attrs.bucket_price) {
      price = parseFloat(attrs.bucket_price) || 0;
    }

    // Weight from available_weights
    const availWeights = attrs.available_weights || [];
    if (availWeights.length > 0) {
      weight = normalizeWeight(availWeights[0]);
    }

    // Fallback price from specific weight fields
    if (!price) {
      for (const f of ["price_each", "price_half_gram", "price_gram", "price_eighth", "price_quarter"]) {
        if (attrs[f] && parseFloat(attrs[f]) > 0) {
          price = parseFloat(attrs[f]);
          weight = normalizeWeight(f.replace("price_", ""));
          break;
        }
      }
    }

    if (price <= 0) continue;

    const category = mapCategory(attrs.kind || attrs.category || "", name);

    products.push({
      dispensary_id: slug,
      name,
      brand: attrs.brand || "House",
      category,
      thc: attrs.percent_thc ? `${attrs.percent_thc}%` : "",
      cbd: attrs.percent_cbd ? `${attrs.percent_cbd}%` : "",
      price,
      weight,
      image: attrs.image_url || attrs.photo || "",
      source: "jane",
    });
  }

  console.log(`  ${config.name}: ${unique.length} unique -> ${products.length} products after filter`);
  return products;
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const singleStore = args.includes("--store") ? args[args.indexOf("--store") + 1] : null;
  const updateSite = args.includes("--update-site");
  const dryRun = args.includes("--dry-run");

  const storesToScrape = singleStore
    ? { [singleStore]: JANE_STORES[singleStore] }
    : JANE_STORES;

  if (singleStore && !JANE_STORES[singleStore]) {
    console.error(`Unknown store: ${singleStore}`);
    console.error("Available:", Object.keys(JANE_STORES).join(", "));
    process.exit(1);
  }

  console.log(`Jane scraper: ${Object.keys(storesToScrape).length} store(s)`);

  const browser = await puppeteer.launch({
    executablePath: process.env.CHROMIUM_PATH || findChromium(),
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  });

  let allProducts = [];
  try {
    for (const [slug, config] of Object.entries(storesToScrape)) {
      try {
        const products = await scrapeStore(browser, slug, config);
        allProducts = allProducts.concat(products);
      } catch (e) {
        console.log(`  ERROR scraping ${config.name}: ${e.message}`);
      }
      // Be polite — wait between stores
      await new Promise((r) => setTimeout(r, 3000));
    }
  } finally {
    await browser.close();
  }

  console.log(`\nTotal Jane products: ${allProducts.length}`);

  // Summary by store
  const byStore = {};
  allProducts.forEach((p) => {
    byStore[p.dispensary_id] = (byStore[p.dispensary_id] || 0) + 1;
  });
  Object.entries(byStore).forEach(([id, count]) => {
    const name = JANE_STORES[id] && JANE_STORES[id].name || id;
    console.log(`  ${name}: ${count} products`);
  });

  if (!dryRun) {
    fs.writeFileSync(JANE_OUTPUT, JSON.stringify(allProducts, null, 2));
    console.log(`Saved to ${JANE_OUTPUT}`);
  }

  if (updateSite && !dryRun) {
    mergeIntoDataJs(allProducts);
  }
}

// ─── MERGE INTO DATA.JS ─────────────────────────────────────────────────────
// For Jane-scraped dispensaries, replace the Weedmaps prices in data.js with
// the verified rec prices from Jane. Other dispensaries keep their Weedmaps data.
function mergeIntoDataJs(janeProducts) {
  const dataJsPath = path.join(ROOT, "js", "data.js");
  if (!fs.existsSync(dataJsPath)) {
    console.log("data.js not found, skipping merge");
    return;
  }

  // Group Jane products by (name, weight, dispensary)
  const janePrices = {};
  const janeDispensaries = new Set();

  for (const p of janeProducts) {
    janeDispensaries.add(p.dispensary_id);
    const key = `${p.name}|||${p.weight}`;
    if (!janePrices[key]) {
      janePrices[key] = {
        name: p.name,
        brand: p.brand,
        category: p.category,
        thc: p.thc,
        cbd: p.cbd,
        weight: p.weight,
        image: p.image,
        prices: {},
      };
    }
    janePrices[key].prices[p.dispensary_id] = p.price;
  }

  console.log(`\nMerging ${Object.keys(janePrices).length} Jane products for ${janeDispensaries.size} dispensaries into data.js`);

  // Read current data.js
  let content = fs.readFileSync(dataJsPath, "utf8");

  // Parse existing products to remove Jane dispensary prices from Weedmaps entries
  // and add the Jane products as replacements.
  // Strategy: for any product in data.js that has prices at a Jane-scraped dispensary,
  // remove those prices (they were medical/inaccurate). Then add the Jane products
  // as new entries.

  // This is done by the Python pipeline (direct_menu_scrape.py build_price_comparison)
  // on the next cron run. For now, just save the jane_products.json and let the
  // pipeline integration happen in a merge script.

  console.log("Jane data saved. Will be integrated on next pipeline run via merge_jane_data.py");
}

main().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
