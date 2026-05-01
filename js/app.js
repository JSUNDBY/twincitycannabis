// ============================================================
// Twin City Cannabis — App Logic
// Hash routing, page rendering, search, filters, interactivity
// ============================================================

(function() {
    'use strict';

    // ─── HTML escape — prevents XSS from scraped data in innerHTML ──────────
    const _escMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    const esc = (s) => s == null ? '' : String(s).replace(/[&<>"']/g, c => _escMap[c]);

    // ─── Geolocation for "Near me" sorting ───────────────────────────────
    let _userLat = null, _userLng = null;
    function _haversine(lat1, lng1, lat2, lng2) {
        const R = 3959; // miles
        const toRad = d => d * Math.PI / 180;
        const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
        const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    function _getDistanceMi(d) {
        if (_userLat == null || !d.lat || !d.lng) return null;
        return Math.round(_haversine(_userLat, _userLng, d.lat, d.lng) * 10) / 10;
    }
    function _requestLocation() {
        return new Promise((resolve) => {
            if (_userLat != null) return resolve(true);
            if (!navigator.geolocation) return resolve(false);
            navigator.geolocation.getCurrentPosition(
                (pos) => { _userLat = pos.coords.latitude; _userLng = pos.coords.longitude; resolve(true); },
                () => resolve(false),
                { timeout: 8000, maximumAge: 300000 }
            );
        });
    }

    // ─── Cannabis-only filter — keep this in sync with build_seo.js ─────────
    // Scraper data leaks humidity packs, rolling papers, electrolyte sticks,
    // glass bowls, kits, etc. all mis-tagged as "flower". We apply two layers:
    // a name regex blocklist + per-category minimum price floors.
    const ACCESSORY_RE = new RegExp([
        'bowl', 'pipe', 'bong', '\\brig\\b', 'banger', 'nail\\b', 'carb cap', 'dabber',
        'dab tool', 'dab rag', 'rags?\\b', '\\btray', 'holder', '\\bcase\\b', '\\bjar\\b',
        'ashtray', 'grinder', 'lighter', 'matches?', 'torch', 'butane',
        'battery', 'batteries', 'wick', '510 thread', 'mod\\b', '\\bcoil',
        'capsule', 'dosing capsule', 'humidor', 'boveda', 'humidipak',
        'cleaner', 'cleaning', 'cotton bud', 'cotton swab', 'q.?tip',
        '\\bkit\\b', 'starter kit', 'happy kit', 'dab kit',
        'nectar collector', 'dab grab', 'honey straw', 'silicone container',
        'bud kup', '\\bkup\\b', '\\bgo stik\\b', '\\bstik\\b', 'roller\\b',
        '\\bpax\\b', 'dynavap', 'storz', 'volcano\\b', '\\bccell\\b', 'ccell go',
        'puffco', 'dr.? dabber', 'kandypens', 'davinci', 'firefly', 'pulsar',
        'kodo\\b', 'icons? - ', 'icons\\b',
        'rolling paper', 'rolling tray', 'raw cone', 'blunt cone', 'blunt cones',
        'pre.?rolled tips?', 'pre.?roll case', 'pre.?roll card', 'preroll card',
        'wraps?\\b', 'blunt wrap', 'hemp wrap',
        'filter tip', 'filter\\b', 'wood tip', 'glass tip', 'roach',
        '^raw ', '\\braw\\s', 'blazy', 'futurola', 'ooze', 'barbasol', 'king palm',
        'juicy jay', 'zig.?zag', 'elements\\b', 'ocb\\b',
        'velcro label', 'sticker', 'merch\\b', 't.?shirt', 'hoodie', 'hat\\b', 'beanie',
        'coloring book', 'color book', 'exit bag', 'koozie', 'magnifier',
        'screens?\\b', 'root riot', 'cube\\b(?!.*gummy)', 'shears', 'electrolyte', 'probiotic',
        'pre.?workout', 'sunblaster', 'garden', 'wrapping paper', 'gift wrap',
        'fanny pack', 'backpack', 'tote bag', 'dugout', 'keychain',
        'on a stoop', 'holiday elf', 'christmas', 'ornament',
        'almonds?\\b', 'pretzels?\\b', 'popcorn', 'chips\\b', 'crackers?\\b',
        'beef jerky', 'jerky\\b', 'gum\\b(?!my)',
        'seeds?\\b', 'genetics\\b',
        'donation', 'lab fee', 'testing fee', 'delivery fee', 'membership',
        'consultation', 'gift card', 'merchandise',
    ].join('|'), 'i');

    const MIN_PRICE_BY_CATEGORY = {
        'flower':      12,
        'pre-roll':    5,
        'cartridge':   20,
        'edible':      4,
        'concentrate': 18,
        'topical':     8,
        'tincture':    15,
        'beverage':    4,
    };

    const _lowestPriceOf = (p) => {
        const v = Object.values(p.prices || {});
        return v.length ? Math.min(...v) : null;
    };

    // Category-specific sanity: does the name actually look like its category?
    const _NOT_ANYTHING_CANNABIS_RE = /\b(book|handbook|field guide|guide to|coloring|foundation|fertilizer|soil\b|nutrient|rooting|grow tent|tent kit|field\s*guide|textbook|novel|story|bible)\b/i;

    const _FLOWER_WEIGHT_RE = /\b(1\/8|1\/4|1\/2|eighth|quarter|half\s*oz|ounce|oz\b|\d+(?:\.\d+)?\s*g(?:rams?)?\b|mixed\s*bud|whole\s*flower|pre.?pack)\b/i;
    const _FLOWER_KEYWORD_RE = /\b(flower|bud|nug|smalls|popcorn|ground\b|shake\b)\b/i;
    const _NOT_FLOWER_RE = /\b(cart(ridge)?|disposable|vape|shot|seltzer|soda|drink|tonic|lemonade|iced\s*tea|fl\s*oz|gummi|chocolate|candy|brownie|cookie|chew|mint|honey|lotion|balm|salve|bath\s*bomb|dab|wax|shatter|rosin|hash|tincture|dropper|capsule|softgel|book|bible|textbook|blend|deodorant|headband|blanket|guasha|bronners|soap\b|koozie|keychain|jewel|stoop|holiday|ornament|pack\b|box\b|scarf|buddy|pass\b|wash|immunity|mushroom|spirulina|wellness|roller|stik\b)\b/i;
    const _MG_RE = /\b\d+\s*mg\b/i;
    // Obviously not-cannabis words — supplements, household, pet products,
    // merchandise, etc. that get mistakenly tagged with a cannabis category.
    const _NON_CANNABIS_SIGNAL_RE = /\b(mushroom|immunity|spirulina|wound|scarf|hat\b|shirt|blanket|deodorant|soap\b|tea\b|coffee|salt\b|wellness|bliss|mystery|flavor|magnesium|liver|ashwagandha|multivitamin|immune|organ|castor|canviva|pet\b|crochet|bone\b|mineral|probiotic|complex|supplement|rescue|wash\b|shield|guard|detox|cleanse|balance(?!\s*point)|clarity(?!\s*gumm)|focus(?!\s*gumm)|energy(?!\s*drink)|sleep\s*aid|anxiety|recovery(?!\s*gumm)|blend(?!ed)|holistic|ashwaganda|essential\s*oil|fish\s*oil|flax|turmeric|collagen|electrolyte|pre.?workout|protein\s*powder)\b/i;

    const _CART_KEYWORD_RE = /\b(cart(ridge)?s?|vape|vaporizer|disposable|pen|510|pod|pods|oil\b|distillate|live\s*resin|live\s*rosin|rosin\s*cart)\b/i;

    // Case-insensitive substring blocklist — catches prefix/suffix variants
    // (crochet / crocheted / crocheting) that regex \b\b misses.
    const _SUBSTRING_BLOCKLIST = [
        'crochet', 'canviva', 'graffe', 'lookah', 'spoon', 'flower and tree',
        'ashwagand', 'ashwaganda', 'magnesium', 'spirulina', 'castor',
        'multivitamin', 'ps zinc', 'ps desiccated', 'ps liver', 'ps mineral',
        'immune rescue', 'organ complex', 'mushroom immunity',
        'fanny pack', 'koozie', 'keychain', 'scarf', 'headband',
        'bronners', 'dr. bronner', 'dandy blend', 'guasha',
        'nf1 - 3.5g', // crochet art named NF1
    ];

    const hasBlockedSubstring = (name) => {
        const ln = name.toLowerCase();
        return _SUBSTRING_BLOCKLIST.some(b => ln.includes(b));
    };

    const looksLikeFlower = (p) => {
        const n = p.name || '';
        const w = p.weight || '';
        if (_NOT_FLOWER_RE.test(n)) return false;
        if (_MG_RE.test(n)) return false;
        if (_NON_CANNABIS_SIGNAL_RE.test(n)) return false;
        if (hasBlockedSubstring(n)) return false;
        // Whitelist: explicit flower weight (in name OR weight field) or flower keyword
        if (_FLOWER_WEIGHT_RE.test(n) || _FLOWER_WEIGHT_RE.test(w) || _FLOWER_KEYWORD_RE.test(n)) return true;
        // Bare strain names: 1-3 words, letters only, no digits, no red flags.
        // Strip parenthetical suffixes ("ZestyParm (Phylos)") before checking,
        // since dispensary.shop wraps the genetics provider in parens.
        const bare = n.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
        if (!/\d/.test(bare)
            && /^[A-Za-z][A-Za-z '&.-]*$/.test(bare)
            && bare.split(/\s+/).filter(Boolean).length <= 3
            && bare.length >= 3) {
            return true;
        }
        return false;
    };

    const looksLikeCart = (p) => {
        const n = p.name || '';
        if (_NON_CANNABIS_SIGNAL_RE.test(n)) return false;
        if (hasBlockedSubstring(n)) return false;
        if (_CART_KEYWORD_RE.test(n)) return true;
        if (!/\d/.test(n)
            && n.split(/\s+/).filter(Boolean).length <= 4
            && n.length >= 3) return true;
        return false;
    };

    const looksLikeEdible = (p) => {
        // Edibles should smell like food/dose, not flower strains sold by the gram
        const n = p.name || '';
        if (/\b\d+(?:\.\d+)?\s*g\b/i.test(n) && !/gumm|chocolate|candy|brownie|cookie|bar\b|chew|mint/i.test(n)) return false;
        return true;
    };

    const isRealCannabisProduct = (p) => {
        if (!p || !p.name) return false;
        if (ACCESSORY_RE.test(p.name)) return false;
        if (_NOT_ANYTHING_CANNABIS_RE.test(p.name)) return false;
        const lo = _lowestPriceOf(p);
        if (lo == null) return false;
        const floor = MIN_PRICE_BY_CATEGORY[p.category];
        if (floor != null && lo < floor) return false;
        // Category-specific sanity checks
        if (p.category === 'flower' && !looksLikeFlower(p)) return false;
        if (p.category === 'edible' && !looksLikeEdible(p)) return false;
        if (p.category === 'cartridge' && !looksLikeCart(p)) return false;
        return true;
    };

    // Prune TCC.products on load so every renderer sees only real cannabis.
    // Keep the original array count available for any stats that want it.
    if (typeof TCC !== 'undefined' && Array.isArray(TCC.products)) {
        const originalLen = TCC.products.length;
        TCC.products = TCC.products.filter(isRealCannabisProduct);
        if (originalLen !== TCC.products.length) {
            console.log(`[TCC] Filtered ${originalLen - TCC.products.length} non-cannabis products (kept ${TCC.products.length})`);
        }
        // Parse TOTAL mg dosage from edible/beverage names for comparison.
        // Handles both "50mg" (total) and "5mg × 10ct" (per-piece × count).
        function _parseTotalMg(name) {
            const n = name || '';
            const allMg = [...n.matchAll(/(\d+(?:\.\d+)?)\s*mg/gi)].map(m => Number(m[1]));
            if (!allMg.length) return null;
            const countMatch = n.match(/(\d+)\s*(?:ct|pk|pcs?|pack|count|per\s*bag)/i);
            const count = countMatch ? Number(countMatch[1]) : 1;
            const maxMg = Math.max(...allMg);
            // If any mg value > 10, it's likely the total package mg
            if (maxMg > 10) return maxMg;
            // All mg values ≤ 10 = per-piece; multiply by count
            return maxMg * count;
        }
        // Parse grams + $/g for flower
        const _gramsRe = /\b(\d+(?:\.\d+)?)\s*g\b/i;
        const _ozFractions = { '1/8': 3.5, '1/4': 7, '1/2': 14, '1': 28 };
        function _parseGrams(name, weight) {
            // Try name first
            const m = (name || '').match(_gramsRe);
            if (m) return Number(m[1]);
            // Fallback: weight field
            if (!weight) return null;
            const w = String(weight).trim();
            // "4 g", "3.5g", "14g"
            const gMatch = w.match(/^(\d+(?:\.\d+)?)\s*g$/i);
            if (gMatch) return Number(gMatch[1]);
            // "1/8 oz", "1/4 oz", "1/2 oz", "1 oz"
            const ozMatch = w.match(/^(1(?:\/[248])?)?\s*oz$/i);
            if (ozMatch) return _ozFractions[ozMatch[1] || '1'] || 28;
            return null;
        }
        TCC.products.forEach(p => {
            if (p.category === 'flower') {
                const grams = _parseGrams(p.name, p.weight);
                if (grams && grams > 0 && grams <= 56) {
                    p.grams = grams;
                    const lo = _lowestPriceOf(p);
                    if (lo) p.pricePerGram = Math.round((lo / grams) * 100) / 100;
                }
            }
        });

        TCC.products.forEach(p => {
            if (p.category !== 'edible' && p.category !== 'beverage') return;
            let totalMg = _parseTotalMg(p.name);
            // Fallback: use the THC field if the name didn't have mg
            if (!totalMg && p.thc) {
                const thcMatch = String(p.thc).match(/(\d+(?:\.\d+)?)\s*mg/i);
                if (thcMatch) totalMg = Number(thcMatch[1]);
            }
            if (totalMg && totalMg > 0) {
                p.mg = totalMg;
                const lo = _lowestPriceOf(p);
                if (lo) p.pricePerMg = Math.round((lo / totalMg) * 100) / 100;
            }
        });
    }

    // ─── Stripe / Cloudflare config ──────────────────────────────────────────
    // Worker URL deployed from /cloudflare. Returns tier overrides as JSON.
    const TCC_WORKER_URL = 'https://dashboard.twincitycannabis.com';

    // Stripe Payment Link URLs. Replace these with the real URLs after creating
    // the products in Stripe (see /cloudflare/README.md step 3).
    // The Subscribe button appends ?client_reference_id=<dispensary_id> so the
    // worker can identify which dispensary is paying.
    window.TIER_PAYMENT_LINKS = {
        featured: 'https://buy.stripe.com/eVq5k0aRJblmetM7xGbQY80',
        premium:  'https://buy.stripe.com/7sYaEX39hdtuclzdW4bQY01',
    };
    // ─────────────────────────────────────────────────────────────────────────

    const App = {
        currentPage: 'home',
        currentDispensary: null,
        currentStrain: null,
        mapInstance: null,
        mapMarkers: [],
        chartInstance: null,
    };

    // ---- ICONS (inline SVG paths) ----
    // ============================================================
    // Dispensary website resolution
    // All dispensaries now have real websites from the Google Places
    // integration (see scraper/google_places.py). The fallback below
    // uses Google Maps if for any reason a website is missing.
    // ============================================================
    function getDispensaryWebsite(d) {
        if (!d) return '#';
        if (d.website && !d.website.includes('weedmaps.com')) return d.website;
        if (d.google && d.google.maps_url) return d.google.maps_url;
        const query = encodeURIComponent(`${d.name} ${d.address || d.city || ''}`.trim());
        return `https://www.google.com/maps/search/?api=1&query=${query}`;
    }

    function isOfficialWebsite(d) {
        if (!d) return false;
        return !!(d.website && !d.website.includes('weedmaps.com'));
    }

    // Identify the menu platform a shop uses, so the empty-menu state can
    // label its outbound link more usefully. Returns one of:
    //   'dutchie' | 'leafly' | 'weedmaps' | null
    // Pulled from the shop's website URL — if the shop website itself is on
    // a known platform's domain, that's a strong signal.
    function detectMenuPlatform(d) {
        const url = (d && d.website) || '';
        if (!url) return null;
        const u = url.toLowerCase();
        if (u.includes('dutchie.com')) return 'dutchie';
        if (u.includes('leafly.com')) return 'leafly';
        if (u.includes('weedmaps.com')) return 'weedmaps';
        return null;
    }

    // Format Google rating as "★ 4.7 (234)" — shown on dispensary cards
    function googleRatingHtml(d) {
        if (!d || !d.google || !d.google.rating) return '';
        const r = d.google.rating;
        const c = d.google.review_count || 0;
        return `<span class="google-rating" title="${c} Google reviews">
            <span class="google-rating-star">★</span>
            <span class="google-rating-num">${r.toFixed(1)}</span>
            <span class="google-rating-count">(${c.toLocaleString()})</span>
        </span>`;
    }

    // Custom SVG icon system - all icons inherit currentColor for theming
    const svgIcon = (size, body) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

    // Category icon — flat single-color silhouette in currentColor.
    // Clean, obvious, no ornament. Inherits parent color for theming.
    const catIcon = (body) => `<svg width="48" height="48" viewBox="0 0 40 40" fill="currentColor" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
    const Icons = {
        search: svgIcon(16, '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>'),
        pin: svgIcon(14, '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>'),
        clock: svgIcon(14, '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
        star: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
        phone: svgIcon(14, '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>'),
        check: svgIcon(14, '<path d="M20 6L9 17l-5-5"/>'),
        arrow: svgIcon(14, '<path d="M5 12h14M12 5l7 7-7 7"/>'),
        trending: svgIcon(14, '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>'),
        tag: svgIcon(14, '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>'),
        verified: '<svg width="14" height="14" viewBox="0 0 24 24" fill="var(--blue)" stroke="white" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>',

        // ===== CATEGORY ICONS =====
        // Flat silhouettes, single color (currentColor), bold and obvious.

        // Cannabis leaf — 7 lanceolate leaflets radiating from a center base.
        // Outer wrapper has class="leaf-fan" so it can be swayed on hover.
        leaf: catIcon(`
          <g class="leaf-fan" transform="translate(20 22.5)">
            <path d="M-0.7 0 C -1.4 -4 -1.9 -10 -1.2 -15 L 0 -20 L 1.2 -15 C 1.9 -10 1.4 -4 0.7 0 Z"/>
            <g transform="rotate(-34)"><path d="M-0.7 0 C -1.3 -4 -1.8 -9 -1.1 -13 L 0 -18 L 1.1 -13 C 1.8 -9 1.3 -4 0.7 0 Z"/></g>
            <g transform="rotate(34)"><path d="M-0.7 0 C -1.3 -4 -1.8 -9 -1.1 -13 L 0 -18 L 1.1 -13 C 1.8 -9 1.3 -4 0.7 0 Z"/></g>
            <g transform="rotate(-66)"><path d="M-0.7 0 C -1.2 -3 -1.6 -7 -1 -10 L 0 -14 L 1 -10 C 1.6 -7 1.2 -3 0.7 0 Z"/></g>
            <g transform="rotate(66)"><path d="M-0.7 0 C -1.2 -3 -1.6 -7 -1 -10 L 0 -14 L 1 -10 C 1.6 -7 1.2 -3 0.7 0 Z"/></g>
            <g transform="rotate(-96)"><path d="M-0.6 0 C -1 -2 -1.3 -5 -0.9 -7 L 0 -10 L 0.9 -7 C 1.3 -5 1 -2 0.6 0 Z"/></g>
            <g transform="rotate(96)"><path d="M-0.6 0 C -1 -2 -1.3 -5 -0.9 -7 L 0 -10 L 0.9 -7 C 1.3 -5 1 -2 0.6 0 Z"/></g>
          </g>
          <rect x="19.3" y="22.5" width="1.4" height="12" rx="0.7"/>`),

        // Pre-roll — clean angled joint, darker filter tip, one subtle ember
        joint: catIcon(`
          <path d="M6.5 27 L25 12.5 L28.5 15.5 L10 30 Z"/>
          <path d="M6.5 27 L11 23.5 L14.5 26 L10 30 Z" fill-opacity="0.45"/>
          <circle cx="26.5" cy="14" r="2.2"/>
          <circle cx="26.5" cy="14" r="3.5" fill-opacity="0.2"/>`),

        // Cart — cartridge outline with mouthpiece and pill shape
        cart: catIcon(`
          <rect x="16" y="3" width="8" height="5" rx="1.2"/>
          <path d="M13 10 L27 10 L27 27 C27 28 26 29 25 29 L15 29 C14 29 13 28 13 27 Z"/>
          <rect x="14.5" y="30" width="11" height="7" rx="1.5" fill-opacity="0.65"/>
          <circle cx="20" cy="33.5" r="1.2" fill-opacity="1"/>`),

        // Edible — wrapped candy, twist ends
        cookie: catIcon(`
          <ellipse cx="20" cy="20" rx="7.5" ry="5.5"/>
          <path d="M12.5 20 L5 15 L5 25 Z"/>
          <path d="M27.5 20 L35 15 L35 25 Z"/>
          <line x1="8" y1="17" x2="10" y2="20" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
          <line x1="8" y1="23" x2="10" y2="20" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
          <line x1="32" y1="17" x2="30" y2="20" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
          <line x1="32" y1="23" x2="30" y2="20" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>`),

        // Concentrate — bold diamond silhouette
        diamond: catIcon(`
          <path d="M20 4 L8 15 L20 36 L32 15 Z"/>
          <path d="M8 15 L32 15" stroke="currentColor" stroke-width="1.2" fill-opacity="0" opacity="0.35"/>`),

        // Topical — clean tube with cap
        drop: catIcon(`
          <rect x="14" y="3" width="12" height="4" rx="1.5" fill-opacity="0.5"/>
          <path d="M11 9 L29 9 L27 35 C26.5 36.5 25.5 37 24 37 L16 37 C14.5 37 13.5 36.5 13 35 Z"/>
          <rect x="14" y="18" width="12" height="8" rx="1" fill-opacity="0" stroke="currentColor" stroke-width="1.3"/>`),

        // Tincture — dropper bottle
        bottle: catIcon(`
          <rect x="15" y="3" width="10" height="5" rx="1" fill-opacity="0.55"/>
          <rect x="18" y="8" width="4" height="5" fill-opacity="0.4"/>
          <path d="M11 13 L29 13 L29 34 C29 35.5 27.5 37 26 37 L14 37 C12.5 37 11 35.5 11 34 Z"/>
          <rect x="14" y="20" width="12" height="8" rx="1" fill-opacity="0" stroke="currentColor" stroke-width="1.3"/>`),

        // Beverage — can with pull tab
        beverage: catIcon(`
          <ellipse cx="20" cy="7" rx="8.5" ry="2.5" fill-opacity="0.55"/>
          <path d="M11.5 7 L11.5 33 C11.5 34.5 15.5 37 20 37 C24.5 37 28.5 34.5 28.5 33 L28.5 7 Z"/>
          <path d="M17 6 L21 6 L20.5 8 L17.5 8 Z" fill-opacity="0" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
          <rect x="11.5" y="15" width="17" height="11" rx="0.5" fill-opacity="0" stroke="currentColor" stroke-width="1.1" opacity="0.4"/>`),

        fire: svgIcon(14, '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>'),
        sparkle: svgIcon(14, '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>'),
        deal: svgIcon(14, '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5"/>'),
        chart: svgIcon(14, '<polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/>'),
        globe: svgIcon(14, '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>'),
        leafLine: svgIcon(48, '<path d="M12 2c-.5 2.5-1.5 4.5-3 6 1.5.5 2.5 1.5 3 3 .5-1.5 1.5-2.5 3-3-1.5-1.5-2.5-3.5-3-6z"/><path d="M12 11c-2-1.5-4-2-6.5-2 1 2 2.5 3.5 4.5 4.5-2 .5-4 .5-6 0 2 2 4.5 3 7 3-1 1.5-2 2.5-3.5 3 2 .5 4 0 5.5-1.5"/><path d="M12 11c2-1.5 4-2 6.5-2-1 2-2.5 3.5-4.5 4.5 2 .5 4 .5 6 0-2 2-4.5 3-7 3 1 1.5 2 2.5 3.5 3-2 .5-4 0-5.5-1.5"/><line x1="12" y1="14" x2="12" y2="22"/>'),
    };

    const catIcons = { flower: Icons.leaf, 'pre-roll': Icons.joint, cartridge: Icons.cart, edible: Icons.cookie, concentrate: Icons.diamond, topical: Icons.drop, tincture: Icons.bottle, beverage: Icons.beverage };

    // ---- ROUTING ----
    function route() {
        const hashRaw = window.location.hash.slice(1) || 'home';
        // Strip ?query suffix and any trailing #fragment so deep-linked
        // anchors like #menu-upload?slug=foo route correctly.
        const hashClean = hashRaw.split('?')[0].split('#')[0];
        const parts = hashClean.split('/');
        let page = parts[0];
        const param = parts[1] || null;

        // Anchor handling: if hash isn't a known page but matches an element ID,
        // find the page that contains it, navigate there, then scroll to the anchor.
        // (This makes #for-dispensaries-claim work — the form lives inside the
        // for-dispensaries page.)
        const knownPages = new Set(['home','dispensaries','dispensary','dispensary-detail','deals','strains','strain','strain-detail','compare','learn','for-dispensaries','dashboard','welcome']);
        let anchorId = null;
        if (!knownPages.has(page)) {
            const anchorEl = document.getElementById(hashClean);
            if (anchorEl) {
                const parentPage = anchorEl.closest('.page');
                if (parentPage) {
                    page = parentPage.id.replace(/^page-/, '');
                    anchorId = hashClean;
                }
            }
        }

        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

        const navMap = { home: 'nav-home', dispensaries: 'nav-dispensaries', deals: 'nav-deals', strains: 'nav-strains', compare: 'nav-compare', learn: 'nav-learn', 'for-dispensaries': 'nav-for-dispensaries' };

        switch (page) {
            case 'dispensary':
                App.currentDispensary = param;
                showPage('dispensary-detail');
                renderDispensaryDetail(param);
                break;
            case 'strain':
                App.currentStrain = param;
                showPage('strain-detail');
                renderStrainDetail(param);
                break;
            case 'dashboard':
                showPage('dashboard');
                renderDashboard(param);
                break;
            case 'compare':
                // Handle #compare, #compare/<productId>, and #compare/cat/<category>
                showPage('compare');
                if (navMap[page]) {
                    const navEl = document.getElementById(navMap[page]);
                    if (navEl) navEl.classList.add('active');
                }
                if (parts[1] === 'cat' && parts[2]) {
                    Browse.category = parts[2];
                    Browse.page = 1;
                    renderCompare();
                } else if (parts[1]) {
                    renderCompare(parts[1]);
                } else {
                    renderCompare();
                }
                break;
            default:
                showPage(page);
                if (navMap[page]) {
                    const navEl = document.getElementById(navMap[page]);
                    if (navEl) navEl.classList.add('active');
                }
        }

        App.currentPage = page;

        // Scroll to anchor if one was specified, otherwise to top
        if (anchorId) {
            setTimeout(() => {
                const el = document.getElementById(anchorId);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        } else {
            window.scrollTo(0, 0);
        }

        closeSearchDropdown();
        closeMobileMenu();

        // After page change, force-visible any animation elements on the now-active page
        // so users never see invisible content gaps after navigation
        setTimeout(() => {
            document.querySelectorAll('.page.active .fade-in, .page.active .stagger').forEach(el => el.classList.add('visible'));
        }, 50);

        // Re-render dispensaries + map when page becomes visible.
        // Leaflet needs a visible container to position markers correctly,
        // so the initial render during init() (while page is hidden) produces
        // an empty map. Re-rendering here guarantees markers appear.
        if (page === 'dispensaries') {
            setTimeout(() => {
                applyDispFilters();
                if (App.mapInstance) App.mapInstance.invalidateSize();
            }, 80);
        }
    }

    function showPage(id) {
        const el = document.getElementById('page-' + id);
        if (el) el.classList.add('active');
    }

    function navigate(hash) {
        window.location.hash = hash;
    }

    // ---- RENDER: HOME ----
    function renderHome() {
        renderShopRotation();
        renderFeaturedDispensaries();
        renderRecentlyOpened();
        renderTodaysDeals();
        renderTrendingProducts();
        renderPopularStrains();
        renderMNBrands();
        renderComingSoon();
        renderShop();
    }

    // ─── Shop Rotation ──────────────────────────────────────────────────────
    // Surfaces three shops per visit on the homepage, weighted INVERSELY to
    // last-7-day view counts so under-seen shops get airtime. The same
    // picker powers the "More shops to explore" footer on dispensary detail
    // pages. Honest distribution mechanism — we're not inflating metrics,
    // we're rebalancing attention across every licensed shop in the state.
    App._viewCountsCache = null;
    App._viewCountsPromise = null;
    async function fetchViewCounts() {
        if (App._viewCountsCache) return App._viewCountsCache;
        if (App._viewCountsPromise) return App._viewCountsPromise;
        const slugs = (TCC.dispensaries || []).map(d => d.id).filter(Boolean);
        if (slugs.length === 0) return {};
        App._viewCountsPromise = (async () => {
            try {
                const url = `${TCC_WORKER_URL}/stats/list?slugs=${encodeURIComponent(slugs.join(','))}`;
                const res = await fetch(url, { cache: 'no-store' });
                if (!res.ok) throw new Error('stats/list ' + res.status);
                const data = await res.json();
                const map = {};
                for (const row of (data.shops || [])) {
                    map[row.slug] = { view_7d: row.view_7d || 0, view_total: row.view_total || 0 };
                }
                App._viewCountsCache = map;
                return map;
            } catch (_) {
                App._viewCountsCache = {};
                return {};
            } finally {
                App._viewCountsPromise = null;
            }
        })();
        return App._viewCountsPromise;
    }

    function pickShopsWeightedFair(count, opts) {
        opts = opts || {};
        const exclude = new Set(opts.exclude || []);
        const viewMap = opts.viewMap || {};
        let pool = (TCC.dispensaries || []).filter(d => d && d.id && !exclude.has(d.id));

        // Same-city preference (used on detail page): if at least `count`
        // shops share the city, restrict the pool to them. Otherwise fall
        // back to statewide so the widget always fills.
        if (opts.preferCity) {
            const cityPool = pool.filter(d => d.city === opts.preferCity);
            if (cityPool.length >= count) pool = cityPool;
        }

        if (pool.length === 0) return [];
        if (pool.length <= count) return pool.slice();

        // Weight inversely by last-7-day views (+1 to avoid divide-by-zero).
        // Newer/under-seen shops get larger weights; high-traffic shops get
        // small weights. A shop with 0 views in 7 days has weight 1.0;
        // a shop with 100 views has weight 0.0099.
        const weights = pool.map(d => 1 / (((viewMap[d.id] && viewMap[d.id].view_7d) || 0) + 1));
        const picked = [];
        const usedIdx = new Set();
        for (let n = 0; n < count; n++) {
            let totalW = 0;
            for (let i = 0; i < pool.length; i++) if (!usedIdx.has(i)) totalW += weights[i];
            if (totalW <= 0) break;
            let r = Math.random() * totalW;
            for (let i = 0; i < pool.length; i++) {
                if (usedIdx.has(i)) continue;
                r -= weights[i];
                if (r <= 0) {
                    usedIdx.add(i);
                    picked.push(pool[i]);
                    break;
                }
            }
        }
        return picked;
    }

    function rotationCardHTML(d) {
        const scoreColor = TCC.getScoreColor(d.tcc_score);
        const hasImg = d.img && d.img.length > 10 && !d.img.includes('placeholder');
        const avatar = hasImg
            ? `<img src="${esc(d.img)}" alt="" loading="lazy">`
            : esc(d.initial || (d.name || '?').slice(0, 1));
        const avatarStyle = hasImg ? '' : `background:${d.gradient || 'linear-gradient(135deg,#22c55e,#16a34a)'}`;
        const loc = d.neighborhood && d.neighborhood !== d.city
            ? `${esc(d.neighborhood)} · ${esc(d.city)}`
            : esc(d.city || '');
        return `<a class="rotation-card" href="#dispensary/${esc(d.id)}">
            <span class="rotation-card-avatar" style="${avatarStyle}">${avatar}</span>
            <span class="rotation-card-body">
                <span class="rotation-card-name">${esc(d.name)}</span>
                <span class="rotation-card-meta">${loc}</span>
            </span>
            <span class="rotation-card-score" style="background:${scoreColor}">${d.tcc_score}</span>
        </a>`;
    }

    async function renderShopRotation() {
        const grid = document.getElementById('shop-rotation-grid');
        if (!grid || !TCC.dispensaries) return;
        const viewMap = await fetchViewCounts();
        const picks = pickShopsWeightedFair(3, { viewMap });
        if (picks.length === 0) {
            const section = document.getElementById('shop-rotation-section');
            if (section) section.style.display = 'none';
            return;
        }
        grid.innerHTML = picks.map(rotationCardHTML).join('');
    }

    async function renderMoreShops(currentId, currentCity) {
        const grid = document.getElementById('detail-more-shops');
        const wrap = document.getElementById('detail-more-shops-wrap');
        if (!grid || !wrap) return;
        const viewMap = await fetchViewCounts();
        const picks = pickShopsWeightedFair(3, {
            exclude: [currentId],
            viewMap,
            preferCity: currentCity,
        });
        if (picks.length === 0) {
            wrap.style.display = 'none';
            return;
        }
        grid.innerHTML = picks.map(rotationCardHTML).join('');
        wrap.style.display = '';
    }

    function renderRecentlyOpened() {
        const container = document.getElementById('recently-opened-dispensaries');
        const section = document.getElementById('recently-opened-section');
        if (!container || !TCC.dispensaries) return;

        // Find dispensaries that opened in the last 60 days, sorted by most recent first
        const recent = TCC.dispensaries
            .filter(d => isRecentlyOpened(d))
            .sort((a, b) => new Date(b.opened_at) - new Date(a.opened_at));

        if (recent.length === 0) {
            // Hide the section entirely if there are no recent openings
            if (section) section.style.display = 'none';
            return;
        }

        if (section) section.style.display = '';
        container.innerHTML = recent.map(d => dispensaryCard(d)).join('');
    }

    function renderFeaturedDispensaries() {
        const grid = document.getElementById('featured-dispensaries');
        const ctaEl = document.getElementById('featured-cta');
        const activeEl = document.getElementById('featured-active');
        const pitchEl = document.getElementById('featured-pitch');

        const paid = TCC.dispensaries
            .filter(d => d.tier !== 'free')
            .sort((a, b) => {
                const tierOrder = { platinum: 0, premium: 1, featured: 2 };
                return (tierOrder[a.tier] || 3) - (tierOrder[b.tier] || 3) || b.tcc_score - a.tcc_score;
            })
            .slice(0, 6);

        if (grid) {
            grid.innerHTML = paid.map(d => dispensaryCard(d, 'grid')).join('');
        }

        // Show real grid OR the "be the first" pitch — never both
        if (activeEl && pitchEl) {
            activeEl.style.display = paid.length > 0 ? '' : 'none';
            pitchEl.style.display = paid.length > 0 ? 'none' : '';
        }

        if (ctaEl) {
            ctaEl.style.display = paid.length > 0 ? '' : 'none';
        }
    }

    function renderTodaysDeals() {
        const container = document.getElementById('todays-deals');
        // Sort by dispensary tier so Premium/Featured deals surface first.
        // Within the same tier, original deal order is preserved.
        const tierRank = { premium: 0, featured: 1, free: 2 };
        const today = new Date().toISOString().slice(0, 10);
        const deals = TCC.deals
            .filter(d => d.featured && (!d.expires || d.expires >= today))
            .slice()
            .sort((a, b) => {
                const da = TCC.dispensaries.find(x => x.id === a.dispensaryId);
                const db = TCC.dispensaries.find(x => x.id === b.dispensaryId);
                return (tierRank[da && da.tier] ?? 2) - (tierRank[db && db.tier] ?? 2);
            })
            .slice(0, 6);
        container.innerHTML = deals.map(d => dealCard(d)).join('');
    }

    // ─── Today's Picks ────────────────────────────────────────────────────
    // Auto-rotated daily. No editorial favoritism: products are scored by the
    // dollar spread between the cheapest and most expensive dispensary, so
    // every pick highlights real comparison value. One flower + one edible.
    function pickTodaysProducts() {
        const today = new Date();
        const dayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
        let dailySeed = 0;
        for (let i = 0; i < dayKey.length; i++) {
            dailySeed = ((dailySeed << 5) - dailySeed + dayKey.charCodeAt(i)) | 0;
        }
        dailySeed = Math.abs(dailySeed);

        const pool = (category) => TCC.products
            .map(p => {
                if (p.category !== category) return null;
                if (!p.image || p.image.length < 10) return null;
                const validPrices = Object.entries(p.prices || {})
                    .filter(([d, v]) => v > 0 && v <= 500 && TCC.dispensaries.find(x => x.id === d));
                if (validPrices.length < 2) return null;
                const prices = validPrices.map(([, v]) => v);
                const lo = Math.min(...prices);
                const hi = Math.max(...prices);
                const spread = hi - lo;
                if (spread < 5) return null;
                return { product: p, lo, hi, spread, dispCount: validPrices.length };
            })
            .filter(Boolean)
            .sort((a, b) => b.spread - a.spread)
            .slice(0, 30);

        const flowerPool = pool('flower');
        const ediblePool = pool('edible');
        const picks = [];
        if (flowerPool.length) picks.push({ ...flowerPool[dailySeed % flowerPool.length], label: 'Flower' });
        if (ediblePool.length) picks.push({ ...ediblePool[(dailySeed + 1) % ediblePool.length], label: 'Edible' });
        return picks;
    }

    function renderStaffPick() {
        const section = document.getElementById('staff-pick-section');
        const container = document.getElementById('staff-pick-card');
        if (!section || !container) return;

        const picks = pickTodaysProducts();
        const cards = picks.map(({ product, lo, hi, spread, dispCount, label }) => {
            const locations = Object.entries(product.prices || {})
                .filter(([d, v]) => v > 0 && v <= 500)
                .map(([dispId, price]) => {
                    const disp = TCC.dispensaries.find(x => x.id === dispId);
                    return disp ? { disp, price } : null;
                })
                .filter(Boolean)
                .sort((a, b) => a.price - b.price);
            if (!locations.length) return '';

            const priceRange = lo === hi ? `$${lo}` : `$${lo} – $${hi}`;
            const savingsLabel = `Save up to $${spread.toFixed(2).replace(/\.00$/, '')}`;

            return `
                <div class="card" style="display:grid;grid-template-columns:auto 1fr;gap:1.2rem;padding:1.3rem;border-color:rgba(234,179,8,0.25);background:linear-gradient(135deg,rgba(234,179,8,0.04),transparent 60%);cursor:pointer" onclick="window.location.hash='compare/${esc(product.id)}'">
                    <div style="width:120px;height:120px;border-radius:12px;overflow:hidden;background:var(--bg-secondary);flex-shrink:0;display:flex;align-items:center;justify-content:center">
                        <img src="${esc(product.image)}" alt="${esc(product.name)}" style="width:100%;height:100%;object-fit:cover">
                    </div>
                    <div style="min-width:0">
                        <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.3rem;flex-wrap:wrap">
                            <span style="font-size:0.6rem;font-weight:700;color:#eab308;background:rgba(234,179,8,0.12);padding:0.15rem 0.55rem;border-radius:var(--radius-full);letter-spacing:1.2px">&#11088; TODAY'S PICK</span>
                            <span class="tag tag-sm" style="background:rgba(34,197,94,0.1);color:var(--green)">${esc(label)}</span>
                        </div>
                        <div class="font-display font-bold" style="font-size:1.1rem;margin-bottom:0.3rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(product.name)}</div>
                        <p class="text-sm text-secondary" style="margin-bottom:0.7rem;line-height:1.5">${savingsLabel} by comparing prices across ${dispCount} dispensaries.</p>
                        <div style="font-size:1.15rem;font-weight:800;color:var(--green);margin-bottom:0.6rem">${priceRange}</div>
                        <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.4rem">At ${locations.length} dispensar${locations.length === 1 ? 'y' : 'ies'}:</div>
                        <div style="display:flex;flex-wrap:wrap;gap:0.35rem">
                            ${locations.slice(0, 5).map(l => `
                                <a href="#dispensary/${esc(l.disp.id)}" class="tag tag-sm" style="text-decoration:none;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);cursor:pointer" onclick="event.stopPropagation()">
                                    ${esc(l.disp.name)} <span style="color:var(--green);font-weight:700;margin-left:0.25rem">$${l.price}</span>
                                </a>
                            `).join('')}
                            ${locations.length > 5 ? `<span class="tag tag-sm" style="color:var(--text-muted)">+${locations.length - 5} more</span>` : ''}
                        </div>
                    </div>
                </div>`;
        }).filter(Boolean);

        if (!cards.length) return;
        section.style.display = '';
        container.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:1rem">${cards.join('')}</div>`;
    }

    function renderTrendingProducts() {
        const container = document.getElementById('trending-products');
        const trending = TCC.products
            .filter(p => p.priceHistory && p.priceHistory[0] - p.priceHistory[p.priceHistory.length - 1] > 5)
            .sort((a, b) => (b.priceHistory[0] - b.priceHistory[b.priceHistory.length - 1]) - (a.priceHistory[0] - a.priceHistory[a.priceHistory.length - 1]))
            .slice(0, 6);
        container.innerHTML = trending.map(p => productCard(p)).join('');
    }

    function renderPopularStrains() {
        const container = document.getElementById('popular-strains');
        if (!container || !TCC.strains) return;

        // Sort strains by real product count (from installStrainMatching)
        // and take the top 8 with at least one product. Strains with 0
        // products are hidden so we never show "0 products available".
        const popular = TCC.strains
            .map(s => ({ strain: s, count: TCC.getStrainProductCount(s.id) }))
            .filter(x => x.count > 0)
            .sort((a, b) => b.count - a.count)
            .slice(0, 8)
            .map(x => x.strain);

        if (popular.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-state-desc">No strain data yet — check back soon.</div></div>';
            return;
        }

        container.innerHTML = popular.map(s => strainCard(s)).join('');
    }

    function renderMNBrands() {
        const container = document.getElementById('mn-brands');
        if (!container || !TCC.mnBrands) return;
        container.innerHTML = TCC.mnBrands.map(b => `
            <div class="card">
                <div class="card-body-sm">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.4rem">
                        <div>
                            <div class="font-display font-semibold" style="font-size:0.95rem">${esc(b.name)}</div>
                            <div class="text-xs text-secondary">${esc(b.location)}</div>
                        </div>
                        <span class="tag tag-sm tag-green">${esc(b.type)}</span>
                    </div>
                    <div class="text-sm text-secondary" style="line-height:1.5;margin-bottom:0.5rem">${esc(b.desc)}</div>
                    <span class="tag tag-sm">${esc(b.specialty)}</span>
                </div>
            </div>
        `).join('');
    }

    function renderComingSoon() {
        const container = document.getElementById('coming-soon-dispensaries');
        if (!container || !TCC.comingSoon) return;
        container.innerHTML = TCC.comingSoon.map(d => `
            <div class="card">
                <div class="card-body-sm">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.4rem">
                        <div>
                            <div class="font-display font-semibold" style="font-size:0.95rem">${esc(d.name)}</div>
                            <div class="text-xs text-secondary">${esc(d.location)}</div>
                        </div>
                        <span class="tag tag-sm tag-amber">${esc(d.status)}</span>
                    </div>
                    <div class="text-sm text-secondary" style="line-height:1.5;margin-bottom:0.5rem">${esc(d.desc)}</div>
                    ${d.notable ? `<span class="tag tag-sm tag-purple">${esc(d.notable)}</span>` : ''}
                </div>
            </div>
        `).join('');
    }

    function renderShop() {
        const container = document.getElementById('tcc-shop');
        if (!container || !TCC.shopItems) return;
        container.innerHTML = TCC.shopItems.map(item => `
            <div class="card" style="cursor:default">
                <div class="card-body-sm">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.4rem">
                        <div>
                            <div class="font-display font-semibold" style="font-size:0.95rem">${esc(item.name)}</div>
                            <div class="text-xs text-secondary">${esc(item.desc)}</div>
                        </div>
                        <div style="text-align:right">
                            <div class="font-display font-bold text-green">$${item.price}</div>
                            <span class="tag tag-sm ${item.status === 'available' ? 'tag-green' : 'tag-amber'}" style="margin-top:0.2rem">${item.status === 'available' ? 'Available' : 'Coming Soon'}</span>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    // ---- RENDER: DISPENSARIES ----
    function renderDispensaries(filters = {}) {
        const container = document.getElementById('dispensary-list');
        let results = [...TCC.dispensaries];

        if (filters.search) {
            results = TCC.searchDispensaries(filters.search);
        }
        if (filters.city && filters.city !== 'all') {
            const METRO_CITIES = new Set([
                'Minneapolis', 'Saint Paul', 'St. Paul', 'Bloomington', 'Edina',
                'Eden Prairie', 'Hopkins', 'Roseville', 'New Brighton', 'Brooklyn Park',
                'Blaine', 'Eagan', 'Burnsville', 'Woodbury', 'Lakeville',
                'Rosemount', 'Anoka', 'Ramsey', 'Chaska', 'Jordan',
                'West St. Paul', 'Stillwater', 'Fridley', 'Mendota Heights',
            ]);
            if (filters.city === 'metro') {
                results = results.filter(d => METRO_CITIES.has(d.city));
            } else if (filters.city === 'greater-mn') {
                results = results.filter(d => !METRO_CITIES.has(d.city));
            } else {
                results = results.filter(d => d.city === filters.city);
            }
        }

        // Toggle filters
        if (filters.toggle && filters.toggle !== 'all') {
            const hour = new Date().getHours();
            switch (filters.toggle) {
                case 'open':
                    results = results.filter(d => hour >= 10 && hour < 20); // approximate
                    break;
                case 'delivery':
                    results = results.filter(d => (d.features || []).some(f => f.toLowerCase().includes('delivery')));
                    break;
                case 'curbside':
                    results = results.filter(d => (d.features || []).some(f => f.toLowerCase().includes('curbside')));
                    break;
                case 'deals':
                    results = results.filter(d => TCC.getDealsForDispensary && TCC.getDealsForDispensary(d.id).length > 0);
                    break;
                case 'verified':
                    results = results.filter(d => d.verified);
                    break;
            }
        }

        // Region grouping: metro first, then a divider, then greater MN.
        // Within each group, paid tiers pin to the top, then by score.
        const tierOrder = { platinum: 0, premium: 1, featured: 2, free: 3 };
        const regionOrder = { metro: 0, 'greater-mn': 1 };
        const isNearMe = filters.sort === 'near-me';
        const sortFn = filters.sort
            ? ({
                score: (a, b) => b.tcc_score - a.tcc_score,
                name: (a, b) => a.name.localeCompare(b.name),
                reviews: (a, b) => b.review_count - a.review_count,
                'near-me': (a, b) => (_getDistanceMi(a) ?? 9999) - (_getDistanceMi(b) ?? 9999),
            })[filters.sort]
            : null;
        if (isNearMe) {
            // Skip region grouping when sorting by distance
            results.sort((a, b) => (_getDistanceMi(a) ?? 9999) - (_getDistanceMi(b) ?? 9999));
        } else {
            results.sort((a, b) => {
                const ra = regionOrder[a.region] ?? 1;
                const rb = regionOrder[b.region] ?? 1;
                if (ra !== rb) return ra - rb;
                if (sortFn) return sortFn(a, b);
                const ta = tierOrder[a.tier] ?? 3;
                const tb = tierOrder[b.tier] ?? 3;
                if (ta !== tb) return ta - tb;
                return b.tcc_score - a.tcc_score;
            });
        }

        // Update count
        const countEl = document.getElementById('disp-count');
        if (countEl) {
            const metroN = results.filter(d => d.region === 'metro').length;
            const greaterN = results.filter(d => d.region === 'greater-mn').length;
            if (metroN && greaterN) {
                countEl.innerHTML = `Showing <strong>${metroN}</strong> Twin Cities + <strong>${greaterN}</strong> Greater MN dispensaries`;
            } else {
                countEl.textContent = `Showing ${results.length} dispensar${results.length === 1 ? 'y' : 'ies'}`;
            }
        }

        if (results.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">${Icons.search}</div>
                    <div class="empty-state-title">No dispensaries found</div>
                    <div class="empty-state-desc">Try adjusting your search or filters</div>
                </div>`;
            return;
        }

        // Build the rendered list, inserting a region divider when crossing
        // from metro into greater MN. Skip the divider if the user is filtered
        // to only one region.
        let html = '';
        let lastRegion = null;
        const hasMetro = results.some(d => d.region === 'metro');
        const hasGreater = results.some(d => d.region === 'greater-mn');
        results.forEach(d => {
            if (d.region !== lastRegion && hasMetro && hasGreater) {
                if (d.region === 'greater-mn') {
                    const greaterCount = results.filter(x => x.region === 'greater-mn').length;
                    html += `
                        <div class="dispensary-region-divider">
                            <div class="dispensary-region-divider-label">
                                <span class="region-divider-icon">${Icons.pin || '&#9678;'}</span>
                                Greater Minnesota
                                <span class="region-divider-count">${greaterCount}</span>
                            </div>
                            <div class="dispensary-region-divider-sub">Outside the Twin Cities metro</div>
                        </div>`;
                }
                lastRegion = d.region;
            }
            html += dispensaryCard(d);
        });
        container.innerHTML = html;
        renderMap(results);
    }

    function renderMap(dispensaries) {
        if (typeof L === 'undefined') return;

        const mapEl = document.getElementById('dispensary-map');
        if (!mapEl) return;

        if (App.mapInstance) {
            App.mapInstance.remove();
        }

        App.mapInstance = L.map('dispensary-map', {
            scrollWheelZoom: false,
            attributionControl: false
        }).setView([44.9778, -93.2650], 10);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 19,
        }).addTo(App.mapInstance);

        const bounds = [];
        dispensaries.forEach(d => {
            if (!d.lat || !d.lng) return;
            bounds.push([d.lat, d.lng]);
            const color = TCC.getScoreColor(d.tcc_score);
            const marker = L.circleMarker([d.lat, d.lng], {
                radius: 8,
                fillColor: color,
                color: color,
                weight: 2,
                opacity: 0.8,
                fillOpacity: 0.4,
            }).addTo(App.mapInstance);

            marker.bindPopup(`
                <div style="font-family:Inter,sans-serif;padding:0.3rem">
                    <strong style="font-size:0.85rem">${esc(d.name)}</strong><br>
                    <span style="font-size:0.75rem;color:#888">${esc(d.city || d.neighborhood)}</span><br>
                    <span style="font-size:0.85rem;color:${color};font-weight:700">TCC ${d.tcc_score}</span>
                </div>
            `);

            marker.on('click', () => navigate('dispensary/' + d.id));
        });

        // Auto-fit map to show all dispensary markers
        if (bounds.length > 1) {
            App.mapInstance.fitBounds(bounds, { padding: [20, 20], maxZoom: 11 });
        } else if (bounds.length === 1) {
            App.mapInstance.setView(bounds[0], 13);
        }
    }

    // ---- RENDER: DISPENSARY DETAIL ----
    function renderDispensaryDetail(id) {
        const d = TCC.getDispensary(id);
        if (!d) {
            navigate('dispensaries');
            return;
        }
        trackServerEvent(id, 'view');

        // Banner — uses uniform CSS background for visual consistency across
        // all 85 dispensaries (no longer override with d.gradient, which
        // routinely clashed with branded logos).
        const bannerEl = document.getElementById('detail-banner');
        bannerEl.style.background = '';
        const initialEl = document.getElementById('detail-banner-initial');
        const hasImg = d.img && d.img.length > 10 && !d.img.includes('placeholder');
        if (hasImg) {
            initialEl.innerHTML = `<img src="${esc(d.img)}" alt="${esc(d.name)}" loading="lazy">`;
        } else {
            initialEl.textContent = d.initial;
        }

        // Info
        document.getElementById('detail-name').textContent = d.name;
        document.getElementById('detail-tagline').textContent = d.tagline;
        document.getElementById('detail-address').innerHTML = `${Icons.pin} ${esc(d.address)}`;
        document.getElementById('detail-hours').innerHTML = `${Icons.clock} ${esc(d.hours.note || d.hours.weekday)}`;
        document.getElementById('detail-phone').innerHTML = `${Icons.phone} ${esc(d.phone)}`;

        // Score
        const scoreColor = TCC.getScoreColor(d.tcc_score);
        document.getElementById('detail-score-num').textContent = d.tcc_score;
        document.getElementById('detail-score-num').style.color = scoreColor;
        document.getElementById('detail-score-text').textContent = TCC.getScoreLabel(d.tcc_score);
        document.getElementById('detail-score-text').style.color = scoreColor;

        // Tier badge
        const tierEl = document.getElementById('detail-tier');
        if (d.tier !== 'free') {
            tierEl.style.display = 'inline-block';
            tierEl.textContent = TCC.getTierLabel(d.tier);
            tierEl.style.background = TCC.getTierColor(d.tier);
            tierEl.style.color = d.tier === 'platinum' ? '#0a0a0a' : '#fff';
        } else {
            tierEl.style.display = 'none';
        }

        // Verified
        const verEl = document.getElementById('detail-verified');
        verEl.style.display = d.verified ? 'inline-flex' : 'none';

        // Features
        document.getElementById('detail-features').innerHTML = d.features.map(f =>
            `<span class="tag tag-sm">${Icons.check} ${esc(f)}</span>`
        ).join('');

        // Dashboard link
        document.getElementById('detail-dashboard-link').href = `#dashboard/${d.id}`;

        // Score bars
        const scoreColors = { pricing: 'var(--green)', selection: 'var(--purple)', service: 'var(--amber)', lab_testing: 'var(--blue)' };
        const scoreLabels = { pricing: 'Pricing', selection: 'Selection', service: 'Service', lab_testing: 'Lab Testing' };
        document.getElementById('detail-score-bars').innerHTML = Object.entries(d.scores).map(([key, val]) =>
            `<div class="score-bar-item">
                <span class="score-bar-label">${scoreLabels[key]}</span>
                <div class="score-bar-track"><div class="score-bar-fill" style="width:${val}%;background:${scoreColors[key]}"></div></div>
                <span class="score-bar-value">${val}</span>
            </div>`
        ).join('');

        // Products with category filtering
        const allProducts = TCC.getProductsForDispensary(id);
        App._detailProducts = allProducts;
        App._detailDispId = id;

        // If no products at all, show a friendly empty-menu state.
        // When the shop's website lives on a known menu platform (Dutchie,
        // Leafly, Weedmaps), label the outbound link so visitors know where
        // they're going. Eventually each platform either gets a TCC scraper
        // or stays as an outbound link forever — both are honest.
        const productsContainer = document.getElementById('detail-products');
        const countEl = document.getElementById('detail-product-count');
        const catContainer = document.getElementById('detail-product-cats');

        if (allProducts.length === 0) {
            countEl.textContent = 'Menu coming soon';
            catContainer.innerHTML = '';
            const platform = detectMenuPlatform(d);
            const platformLabel = {
                dutchie: 'Shop menu on Dutchie',
                leafly:  'Shop menu on Leafly',
                weedmaps:'Shop menu on Weedmaps',
            }[platform] || (isOfficialWebsite(d) ? 'Visit Website' : 'Find on Google Maps');
            const ctaCopy = platform
                ? `${esc(d.name)} publishes their menu on ${platform[0].toUpperCase()+platform.slice(1)}. Tap through to see prices and order — or claim this listing to bring the menu directly into TCC for price comparison.`
                : `We're working on getting ${esc(d.name)}'s full menu into TCC. In the meantime, you can visit their site or call ahead.`;
            productsContainer.innerHTML = `
                <div class="empty-menu-state">
                    <div class="empty-menu-icon">${Icons.leafLine}</div>
                    <div class="empty-menu-title">Menu data not yet on TCC</div>
                    <div class="empty-menu-desc">${ctaCopy}</div>
                    <div class="empty-menu-actions">
                        <a href="${getDispensaryWebsite(d)}" target="_blank" rel="noopener" class="btn btn-primary btn-sm">${platformLabel} &rarr;</a>
                        <a href="tel:${(d.phone||'').replace(/[^0-9+]/g,'')}" class="btn btn-secondary btn-sm">${Icons.phone} Call</a>
                        ${platform ? `<a href="#menu-upload?slug=${encodeURIComponent(d.id)}" class="btn btn-secondary btn-sm">${Icons.verified || ''} Share your menu with TCC</a>` : ''}
                    </div>
                </div>`;
            // Skip the rest of product rendering
            // (still continue to reviews/deals below)
        } else {

        // Build category tabs
        const cats = {};
        allProducts.forEach(p => { cats[p.category] = (cats[p.category] || 0) + 1; });
        const catEntries = Object.entries(cats).sort((a, b) => b[1] - a[1]);
        if (catEntries.length > 1) {
            catContainer.innerHTML = `<button class="filter-toggle active" data-cat="all">All (${allProducts.length})</button>` +
                catEntries.map(([cat, count]) =>
                    `<button class="filter-toggle" data-cat="${cat}">${catIcons[cat] || ''} ${cat} (${count})</button>`
                ).join('');
            catContainer.querySelectorAll('.filter-toggle').forEach(btn => {
                btn.addEventListener('click', () => {
                    catContainer.querySelectorAll('.filter-toggle').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    renderDetailProducts(btn.dataset.cat, App._detailSort || 'price');
                });
            });
        } else {
            catContainer.innerHTML = '';
        }
        App._detailSort = 'price';
        renderDetailProducts('all', 'price');

        // Parse THC% from string like "22.0%". Returns null if not a percent.
        function thcPctOf(p) {
            if (!p.thc) return null;
            const s = String(p.thc).trim();
            if (!s.endsWith('%')) return null;
            const n = parseFloat(s);
            return isFinite(n) ? n : null;
        }

        function renderDetailProducts(catFilter, sortMode) {
            const filtered = catFilter === 'all' ? allProducts : allProducts.filter(p => p.category === catFilter);

            // Sort toggle: show only when at least 2 products in view have THC%
            const sortContainer = document.getElementById('detail-product-sort');
            const thcCount = filtered.filter(p => thcPctOf(p) != null).length;
            if (thcCount >= 2) {
                sortContainer.style.display = '';
                sortContainer.innerHTML = `
                    <span class="text-xs text-muted" style="align-self:center;margin-right:0.4rem">Sort:</span>
                    <button class="filter-toggle ${sortMode === 'price' ? 'active' : ''}" data-sort="price">Best price</button>
                    <button class="filter-toggle ${sortMode === 'thc-desc' ? 'active' : ''}" data-sort="thc-desc">Highest THC %</button>
                    <button class="filter-toggle ${sortMode === 'thc-asc' ? 'active' : ''}" data-sort="thc-asc">Lowest THC %</button>`;
                sortContainer.querySelectorAll('.filter-toggle').forEach(btn => {
                    btn.addEventListener('click', () => {
                        App._detailSort = btn.dataset.sort;
                        renderDetailProducts(catFilter, btn.dataset.sort);
                    });
                });
            } else {
                sortContainer.style.display = 'none';
                sortContainer.innerHTML = '';
            }

            // Apply sort
            const sorted = [...filtered];
            if (sortMode === 'thc-desc' || sortMode === 'thc-asc') {
                sorted.sort((a, b) => {
                    const ta = thcPctOf(a), tb = thcPctOf(b);
                    if (ta == null && tb == null) return 0;
                    if (ta == null) return 1;
                    if (tb == null) return -1;
                    return sortMode === 'thc-asc' ? (ta - tb) : (tb - ta);
                });
            } else {
                sorted.sort((a, b) => (a.prices[id] || 9e9) - (b.prices[id] || 9e9));
            }

            const countElInner = document.getElementById('detail-product-count');
            countElInner.textContent = `${sorted.length} product${sorted.length !== 1 ? 's' : ''}`;

            document.getElementById('detail-products').innerHTML = sorted.length ? sorted.map(p => {
                const price = p.prices[id];
                const lowest = TCC.getLowestPrice(p);
                const isLowest = lowest && lowest.dispensaryId === id;
                const hasImg = p.image && p.image.length > 10;
                const tPct = thcPctOf(p);
                const thcBadgeStyle = (sortMode === 'thc-desc' || sortMode === 'thc-asc') && tPct != null
                    ? 'background:rgba(251,191,36,0.18);color:#fbbf24;font-weight:700'
                    : '';
                return `<div class="card product-card" onclick="window.location.hash='compare/${p.id}'">
                    <div class="card-body-sm" style="display:flex;gap:0.8rem;align-items:flex-start">
                        ${hasImg ? `<div class="product-card-img" onclick="event.stopPropagation();openLightbox('${p.image}','${esc(p.name).replace(/'/g,"\\'")}','${esc(p.brand||"").replace(/'/g,"\\'")}','${TCC.formatPrice(TCC.getLowestPrice(p)?.price||0)}','${esc(p.category)}','${esc(p.thc||"")}')"><img src="${p.image}" alt="${esc(p.name)}" loading="lazy" onerror="this.parentElement.style.display='none'"></div>` : ''}
                        <div style="flex:1;min-width:0">
                            <div class="product-card-header">
                                <div style="min-width:0">
                                    <div class="product-card-name">${esc(p.name)}</div>
                                    <div class="product-card-brand">${esc(p.brand)}${p.weight ? ' &middot; ' + esc(p.weight) : ''}</div>
                                </div>
                                <div class="product-card-prices">
                                    <div class="product-card-price-low">${TCC.formatPrice(price)}</div>
                                    ${isLowest ? '<div style="font-size:0.65rem;color:var(--green)">Best price</div>' : ''}
                                </div>
                            </div>
                            <div class="product-card-meta">
                                <span class="tag tag-sm">${catIcons[p.category] || ''} ${esc(p.category)}</span>
                                ${p.thc ? `<span class="tag tag-sm" style="${thcBadgeStyle}">THC ${esc(p.thc)}</span>` : ''}
                            </div>
                        </div>
                    </div>
                </div>`;
            }).join('') : '<div class="empty-state"><div class="empty-state-desc">No products in this category</div></div>';
        }
        } // end else (allProducts.length > 0)

        // Reviews — use Google reviews from d.google.reviews if available
        const googleReviews = (d.google && d.google.reviews) || [];
        const fallbackReviews = TCC.getReviewsForDispensary(id);
        const reviews = googleReviews.length ? googleReviews : fallbackReviews;
        const totalCount = (d.google && d.google.review_count) || d.review_count || reviews.length;

        document.getElementById('detail-review-count').textContent =
            `${totalCount.toLocaleString()} Google review${totalCount === 1 ? '' : 's'}`;

        document.getElementById('detail-reviews').innerHTML = reviews.length ? `
            <div class="reviews-google-header">
                <div class="google-rating-badge">
                    <span class="stars">${'&#9733;'.repeat(Math.floor(d.google?.rating || 0))}${'&#9734;'.repeat(5 - Math.floor(d.google?.rating || 0))}</span>
                    <span class="rating-num">${(d.google?.rating || 0).toFixed(1)}</span>
                    <span class="text-muted text-xs">based on ${totalCount.toLocaleString()} Google reviews</span>
                </div>
                <a href="${(d.google && d.google.maps_url) || getDispensaryWebsite(d)}" target="_blank" rel="noopener" class="btn btn-sm btn-secondary">See all on Google &rarr;</a>
            </div>
            ${reviews.map(r => `
                <div class="review-item">
                    <div class="review-header">
                        <span class="review-author">${esc(r.author)}</span>
                        <span class="review-date">${esc(r.time || r.date || '')}</span>
                    </div>
                    <div class="review-stars">${'&#9733;'.repeat(r.rating)}${'&#9734;'.repeat(5 - r.rating)}</div>
                    <div class="review-text">${esc(r.text)}</div>
                </div>
            `).join('')}
        ` : '<div class="empty-state"><div class="empty-state-desc">No reviews yet</div></div>';

        // Deals
        const deals = TCC.getDealsForDispensary(id);
        document.getElementById('detail-deals').innerHTML = deals.length ? deals.map(dl => dealCard(dl)).join('') :
            '<div class="empty-state"><div class="empty-state-desc">No active deals</div></div>';

        // Reset tabs
        switchDetailTab('products');

        // Cross-link to other shops at the bottom of the page
        renderMoreShops(d.id, d.city);
    }

    function switchDetailTab(tabName) {
        document.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.detail-tab-content').forEach(t => t.classList.remove('active'));
        document.querySelector(`.detail-tab[data-tab="${tabName}"]`)?.classList.add('active');
        document.getElementById(`detail-tab-${tabName}`)?.classList.add('active');
    }

    // ---- RENDER: DEALS ----
    function renderDeals(filter = 'all') {
        const container = document.getElementById('deals-list');
        const todayStr = new Date().toISOString().slice(0, 10);
        let deals = TCC.deals.filter(d => !d.expires || d.expires >= todayStr);

        if (filter !== 'all') {
            deals = deals.filter(d => d.type === filter);
        }

        deals.sort((a, b) => {
            if (a.featured && !b.featured) return -1;
            if (!a.featured && b.featured) return 1;
            return 0;
        });

        container.innerHTML = deals.length ? deals.map(d => dealCard(d)).join('') :
            `<div class="empty-state" style="grid-column:1/-1">
                <div class="empty-state-icon">${Icons.deal}</div>
                <div class="empty-state-title">No deals in this category</div>
                <div class="empty-state-desc">Check back soon for new offers</div>
            </div>`;
    }

    // ---- RENDER: STRAINS ----
    function renderStrains(filters = {}) {
        const container = document.getElementById('strain-list');
        let results = [...TCC.strains];

        if (filters.search) {
            const q = filters.search.toLowerCase();
            results = results.filter(s =>
                s.name.toLowerCase().includes(q) ||
                s.type.includes(q) ||
                s.effects.some(e => e.toLowerCase().includes(q)) ||
                s.flavors.some(f => f.toLowerCase().includes(q))
            );
        }

        if (filters.type && filters.type !== 'all') {
            results = results.filter(s => s.type === filters.type);
        }

        // Sort: strains with products first (most → least), then 0-product strains
        results.sort((a, b) => {
            const ca = TCC.getStrainProductCount(a.id);
            const cb = TCC.getStrainProductCount(b.id);
            return cb - ca;
        });

        // Hide strains with zero products entirely (they're noise)
        results = results.filter(s => TCC.getStrainProductCount(s.id) > 0);

        container.innerHTML = results.length ? results.map(s => strainCard(s)).join('') :
            `<div class="empty-state" style="grid-column:1/-1">
                <div class="empty-state-icon">${Icons.leaf}</div>
                <div class="empty-state-title">No strains found</div>
                <div class="empty-state-desc">Try adjusting your search or filters</div>
            </div>`;
    }

    // ---- RENDER: STRAIN DETAIL ----
    function renderStrainDetail(id) {
        const s = TCC.getStrain(id);
        if (!s) { navigate('strains'); return; }

        document.getElementById('strain-detail-name').textContent = s.name;
        const typeTag = `strain-tag-${s.type}`;
        document.getElementById('strain-detail-type').className = `tag ${typeTag}`;
        document.getElementById('strain-detail-type').textContent = s.type;
        document.getElementById('strain-detail-desc').textContent = s.desc;
        document.getElementById('strain-detail-thc').textContent = s.thc;
        document.getElementById('strain-detail-cbd').textContent = s.cbd;

        document.getElementById('strain-detail-effects').innerHTML = s.effects.map(e =>
            `<span class="tag tag-green">${esc(e)}</span>`
        ).join('');

        document.getElementById('strain-detail-flavors').innerHTML = s.flavors.map(f =>
            `<span class="tag">${esc(f)}</span>`
        ).join('');

        // Products with this strain
        const products = TCC.getProductsByStrain(id);
        document.getElementById('strain-detail-products').innerHTML = products.length ?
            products.map(p => productCard(p)).join('') :
            '<div class="empty-state"><div class="empty-state-desc">No products found for this strain</div></div>';
    }

    // ---- RENDER: COMPARE ----
    // ---- RENDER: DASHBOARD ----
    function renderDashboard(dispensaryId) {
        const d = dispensaryId ? TCC.getDispensary(dispensaryId) : TCC.dispensaries[0];
        if (!d) { navigate('dispensaries'); return; }

        // Header
        document.getElementById('dash-name').textContent = d.name;
        document.getElementById('dash-address').textContent = d.address;

        // Tier badge
        const tierBadge = document.getElementById('dash-tier-badge');
        if (d.tier !== 'free') {
            tierBadge.textContent = TCC.getTierLabel(d.tier);
            tierBadge.style.background = TCC.getTierColor(d.tier);
            tierBadge.style.color = d.tier === 'platinum' ? '#0a0a0a' : '#fff';
            tierBadge.style.borderColor = TCC.getTierColor(d.tier);
        } else {
            tierBadge.textContent = 'Free Tier';
        }

        // Real analytics loaded asynchronously below; show a hyphen while
        // fetching and fall back to zero on error rather than fabricating.
        document.getElementById('dash-views').textContent = '—';
        document.getElementById('dash-clicks').textContent = '—';

        // Score
        const scoreEl = document.getElementById('dash-score');
        scoreEl.textContent = d.tcc_score;
        scoreEl.style.color = TCC.getScoreColor(d.tcc_score);
        document.getElementById('dash-score-label').textContent = TCC.getScoreLabel(d.tcc_score);

        // Rank
        const sorted = [...TCC.dispensaries].sort((a, b) => b.tcc_score - a.tcc_score);
        const rank = sorted.findIndex(x => x.id === d.id) + 1;
        document.getElementById('dash-rank').textContent = '#' + rank;

        // Score bars
        const scoreColors = { pricing: 'var(--green)', selection: 'var(--purple)', service: 'var(--amber)', lab_testing: 'var(--blue)' };
        const scoreLabels = { pricing: 'Pricing', selection: 'Selection', service: 'Service', lab_testing: 'Lab Testing' };
        document.getElementById('dash-score-bars').innerHTML = Object.entries(d.scores).map(([key, val]) =>
            `<div class="score-bar-item">
                <span class="score-bar-label">${scoreLabels[key]}</span>
                <div class="score-bar-track"><div class="score-bar-fill" style="width:${val}%;background:${scoreColors[key]}"></div></div>
                <span class="score-bar-value">${val}</span>
            </div>`
        ).join('');

        // Score improvement tip
        const lowest = Object.entries(d.scores).sort((a, b) => a[1] - b[1])[0];
        const tips = {
            pricing: 'Competitive pricing boosts your score. Consider price-matching popular products or running weekly specials.',
            selection: 'Expanding your product variety helps. Add more categories like edibles, beverages, or concentrates.',
            service: 'Customer service matters. Respond to reviews, offer curbside pickup, and train staff on product knowledge.',
            lab_testing: 'Transparency builds trust. Display lab results prominently and ensure all products have COAs available.',
        };
        document.getElementById('dash-score-tip').textContent = tips[lowest[0]] || 'Keep up the great work!';

        // Reviews
        const reviews = TCC.getReviewsForDispensary(d.id);
        document.getElementById('dash-review-count').textContent = `${d.review_count} total reviews`;
        document.getElementById('dash-reviews').innerHTML = reviews.length ? reviews.map(r => `
            <div class="review-item">
                <div class="review-header">
                    <span class="review-author">${esc(r.author)}</span>
                    <span class="review-date">${esc(r.date)}</span>
                </div>
                <div class="review-stars">${'&#9733;'.repeat(r.rating)}${'&#9734;'.repeat(5 - r.rating)}</div>
                <div class="review-text">${esc(r.text)}</div>
            </div>
        `).join('') : '<p class="text-secondary text-sm">No reviews on TCC yet. Share your profile link to start collecting reviews.</p>';

        // Competitor Intel (real data, blurred for demo)
        const compContainer = document.getElementById('dash-competitors');
        if (compContainer) {
            // Find dispensaries in the same city with overlapping products
            const myProducts = TCC.getProductsForDispensary(d.id);
            const myCats = new Set(myProducts.map(p => p.category));
            const nearby = TCC.dispensaries.filter(nd =>
                nd.id !== d.id && nd.city === d.city
            ).slice(0, 5);

            if (nearby.length > 0) {
                // Calculate average prices for shared products
                const compRows = nearby.map(nd => {
                    const shared = myProducts.filter(p => p.prices[nd.id] !== undefined);
                    if (shared.length === 0) return null;
                    const myAvg = shared.reduce((s, p) => s + p.prices[d.id], 0) / shared.length;
                    const theirAvg = shared.reduce((s, p) => s + p.prices[nd.id], 0) / shared.length;
                    const diff = theirAvg - myAvg;
                    return { name: nd.name, shared: shared.length, theirAvg, diff };
                }).filter(Boolean);

                compContainer.innerHTML = `
                    <div style="filter:blur(4px);pointer-events:none;user-select:none">
                        ${compRows.map(c => `
                            <div style="display:flex;justify-content:space-between;align-items:center;padding:0.5rem 0;border-bottom:1px solid var(--border)">
                                <div>
                                    <div class="text-sm font-semibold">${esc(c.name)}</div>
                                    <div class="text-xs text-muted">${c.shared} shared products</div>
                                </div>
                                <div style="text-align:right">
                                    <div class="text-sm" style="color:${c.diff > 0 ? 'var(--green)' : c.diff < 0 ? 'var(--red)' : 'var(--text-secondary)'}">
                                        ${c.diff > 0 ? 'You\'re $' + c.diff.toFixed(0) + ' cheaper' : c.diff < 0 ? 'They\'re $' + Math.abs(c.diff).toFixed(0) + ' cheaper' : 'Same pricing'}
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <div style="text-align:center;margin-top:1rem">
                        <p class="text-sm text-secondary">See full competitor breakdown: product-by-product pricing, market position, and weekly trends.</p>
                        <a href="mailto:hello@twincitycannabis.com?subject=Premium%20Inquiry%20-%20Competitor%20Intel" class="btn btn-sm btn-primary" style="margin-top:0.5rem">Unlock with Premium ($599/mo)</a>
                    </div>
                `;
            } else {
                compContainer.innerHTML = '<p class="text-sm text-muted">No nearby competitors found with overlapping products.</p>';
            }
        }

        // Contact form handler
        const contactForm = document.getElementById('dash-contact-form');
        if (contactForm) {
            contactForm.onsubmit = async (e) => {
                e.preventDefault();
                const formData = new FormData(contactForm);
                const data = Object.fromEntries(formData);
                data.dispensary = d.name;
                data.dispensary_id = d.id;

                const submitBtn = contactForm.querySelector('button[type="submit"]');
                if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Sending...'; }

                try {
                    await fetch(`${TCC_WORKER_URL}/contact`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data),
                    });
                } catch (_) {}

                trackEvent('generate_lead', { event_category: 'dispensary', event_label: 'claim_form', dispensary_id: d.id });
                contactForm.style.display = 'none';
                document.getElementById('dash-contact-success').style.display = 'block';
            };
        }

        // Real analytics fetch: totals populate the Views / Clicks cards and
        // the 30-day series renders into the chart. Fails softly to zero
        // rather than inventing numbers.
        (async () => {
            let stats = null;
            try {
                const res = await fetch(`${TCC_WORKER_URL}/stats/${encodeURIComponent(d.id)}`, { cache: 'no-store' });
                if (res.ok) stats = await res.json();
            } catch (_) {}

            const totals = (stats && stats.totals) || { view: 0, outbound: 0 };
            document.getElementById('dash-views').textContent = (totals.view || 0).toLocaleString();
            document.getElementById('dash-clicks').textContent = (totals.outbound || 0).toLocaleString();

            const canvas = document.getElementById('dash-traffic-chart');
            if (!canvas || typeof Chart === 'undefined') return;
            if (App.chartInstance) App.chartInstance.destroy();

            const series = (stats && Array.isArray(stats.series_30d)) ? stats.series_30d : (() => {
                // Empty 30-day frame if the API was unreachable — shows all zeros, honest.
                const today = new Date();
                return Array.from({ length: 30 }, (_, i) => {
                    const dt = new Date(today);
                    dt.setUTCDate(today.getUTCDate() - (29 - i));
                    return { date: dt.toISOString().slice(0, 10), view: 0, outbound: 0 };
                });
            })();

            const labels = series.map(row => {
                const dt = new Date(row.date + 'T00:00:00Z');
                return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
            });
            const viewData = series.map(row => row.view || 0);

            App.chartInstance = new Chart(canvas, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        label: 'Profile Views',
                        data: viewData,
                        backgroundColor: 'rgba(34, 197, 94, 0.3)',
                        borderColor: '#22c55e',
                        borderWidth: 1,
                        borderRadius: 3,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#555', font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
                        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#555', font: { size: 10 }, precision: 0 }, beginAtZero: true }
                    }
                }
            });
        })();
    }

    function renderCompare(productId) {
        const container = document.getElementById('compare-content');
        const browseHeader = document.getElementById('browse-mode-header');
        const compareHeader = document.getElementById('compare-mode-header');

        if (productId) {
            const product = TCC.getProduct(productId);
            if (!product) { renderCompareDefault(); return; }
            // Switch to compare mode header — contextual to the specific product
            if (browseHeader) browseHeader.style.display = 'none';
            if (compareHeader) {
                compareHeader.style.display = 'block';
                const titleEl = document.getElementById('compare-mode-title');
                const subEl = document.getElementById('compare-mode-sub');
                if (titleEl) titleEl.textContent = product.name;
                if (subEl) {
                    const numDisps = Object.keys(product.prices || {}).length;
                    const lowest = TCC.getLowestPrice(product);
                    const highest = TCC.getHighestPrice ? TCC.getHighestPrice(product) : null;
                    const savings = (highest && lowest) ? highest.price - lowest.price : 0;
                    let sub = `${esc(product.brand || 'Unknown brand')}${product.weight ? ' &middot; ' + esc(product.weight) : ''} &middot; Available at ${numDisps} dispensar${numDisps === 1 ? 'y' : 'ies'}`;
                    if (savings > 1) {
                        sub += ` &middot; <span style="color:var(--green-text);font-weight:600">Save up to $${savings.toFixed(0)}</span>`;
                    }
                    subEl.innerHTML = sub;
                }
            }
            renderCompareProduct(product);
        } else {
            // Switch back to browse mode header
            if (browseHeader) browseHeader.style.display = 'block';
            if (compareHeader) compareHeader.style.display = 'none';
            renderCompareDefault();
        }
    }

    // Browse page state
    const Browse = {
        category: 'all',
        sort: 'popular',
        query: '',
        page: 1,
        perPage: 24,
        menuType: 'rec',  // 'rec', 'med', or 'all'
        dosage: 'all',    // edible/bev mg filter: 'all','1-5','6-10','11-25','26-50','51-100','100+'
    };

    // Categories shown in the browse UI (excludes accessories/apparel/seeds/etc.)
    const BROWSE_CATEGORIES = ['flower', 'edible', 'cartridge', 'pre-roll', 'beverage', 'tincture', 'topical', 'concentrate'];

    function getBrowseFiltered() {
        let list = TCC.products.filter(p => BROWSE_CATEGORIES.includes(p.category));

        // Menu type filter: rec (default), med, or all
        const menuFilter = Browse.menuType || 'rec';
        if (menuFilter === 'rec') {
            list = list.filter(p => !p.menu_type || p.menu_type === 'rec');
        } else if (menuFilter === 'med') {
            list = list.filter(p => p.menu_type === 'med');
        }
        // 'all' shows everything

        if (Browse.category !== 'all') {
            list = list.filter(p => p.category === Browse.category);
        }

        if (Browse.query.trim()) {
            const q = Browse.query.trim().toLowerCase();
            list = list.filter(p => {
                const hay = `${p.name} ${p.brand || ''} ${p.strain || ''}`.toLowerCase();
                return hay.includes(q);
            });
        }

        // Dosage filter (edibles/beverages)
        if (Browse.dosage && Browse.dosage !== 'all') {
            const ranges = { '1-5': [0, 5], '6-10': [6, 10], '11-25': [11, 25], '26-50': [26, 50], '51-100': [51, 100], '100+': [101, 99999] };
            const [lo, hi] = ranges[Browse.dosage] || [0, 99999];
            list = list.filter(p => p.mg && p.mg >= lo && p.mg <= hi);
        }

        // Parse THC% from string like "22.0%"; ignore mg-form THC (edibles/tinctures).
        const thcPct = (p) => {
            if (!p.thc) return null;
            const s = String(p.thc).trim();
            if (!s.endsWith('%')) return null;
            const n = parseFloat(s);
            return isFinite(n) ? n : null;
        };

        // Sort
        switch (Browse.sort) {
            case 'price-asc':
                list.sort((a, b) => (TCC.getLowestPrice(a)?.price || 9e9) - (TCC.getLowestPrice(b)?.price || 9e9));
                break;
            case 'price-desc':
                list.sort((a, b) => (TCC.getLowestPrice(b)?.price || 0) - (TCC.getLowestPrice(a)?.price || 0));
                break;
            case 'price-per-mg':
                list.sort((a, b) => (a.pricePerMg || 9e9) - (b.pricePerMg || 9e9));
                break;
            case 'price-per-gram':
                list.sort((a, b) => (a.pricePerGram || 9e9) - (b.pricePerGram || 9e9));
                break;
            case 'thc-desc':
                list.sort((a, b) => {
                    const ta = thcPct(a), tb = thcPct(b);
                    if (ta == null && tb == null) return 0;
                    if (ta == null) return 1;
                    if (tb == null) return -1;
                    return tb - ta;
                });
                break;
            case 'thc-asc':
                list.sort((a, b) => {
                    const ta = thcPct(a), tb = thcPct(b);
                    if (ta == null && tb == null) return 0;
                    if (ta == null) return 1;
                    if (tb == null) return -1;
                    return ta - tb;
                });
                break;
            case 'mg-desc':
                list.sort((a, b) => (b.mg || 0) - (a.mg || 0));
                break;
            case 'name':
                list.sort((a, b) => a.name.localeCompare(b.name));
                break;
            case 'popular':
            default:
                // Popular = most dispensaries carrying it
                list.sort((a, b) => Object.keys(b.prices || {}).length - Object.keys(a.prices || {}).length);
        }

        return list;
    }

    function renderCompareDefault() {
        const container = document.getElementById('compare-content');
        const filtered = getBrowseFiltered();
        const total = filtered.length;
        const visible = filtered.slice(0, Browse.page * Browse.perPage);
        const hasMore = visible.length < total;

        // Render quick category pills (above grid)
        renderBrowsePills();

        container.innerHTML = `
            <div class="browse-result-meta">
                <span><strong>${total.toLocaleString()}</strong> ${total === 1 ? 'product' : 'products'}${Browse.query ? ` matching "${esc(Browse.query)}"` : ''}</span>
                ${total > 0 ? `<span class="text-muted">Showing ${visible.length} of ${total}</span>` : ''}
            </div>
            ${total === 0 ? `
                <div class="empty-state" style="padding:3rem 1rem;text-align:center">
                    <div class="empty-state-title">No products found</div>
                    <div class="empty-state-desc">Try a different category or search term.</div>
                </div>
            ` : `
                <div class="home-grid-2" id="browse-grid">
                    ${visible.map(p => productCard(p)).join('')}
                </div>
                ${hasMore ? `
                    <div style="text-align:center;margin-top:2rem">
                        <button class="btn btn-secondary btn-lg" id="browse-load-more">
                            Load ${Math.min(Browse.perPage, total - visible.length)} more
                        </button>
                    </div>
                ` : ''}
            `}
        `;

        // Wire up Load More
        const loadMoreBtn = document.getElementById('browse-load-more');
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', () => {
                Browse.page++;
                renderCompareDefault();
                // Smooth-scroll the newly loaded section into view
                setTimeout(() => {
                    const grid = document.getElementById('browse-grid');
                    if (grid && grid.children.length) {
                        grid.children[(Browse.page - 1) * Browse.perPage]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }, 50);
            });
        }
    }

    function renderBrowsePills() {
        const pillsContainer = document.getElementById('browse-pills');
        if (!pillsContainer) return;
        const cats = [{ id: 'all', name: 'All' }, ...BROWSE_CATEGORIES.map(id => ({
            id,
            name: TCC.categories?.find(c => c.id === id)?.name || id
        }))];
        pillsContainer.innerHTML = cats.map(c =>
            `<button class="browse-pill ${Browse.category === c.id ? 'active' : ''}" data-cat="${c.id}">${esc(c.name)}</button>`
        ).join('');
        pillsContainer.querySelectorAll('.browse-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                Browse.category = btn.dataset.cat;
                Browse.page = 1;
                const sel = document.getElementById('browse-category');
                if (sel) sel.value = Browse.category;
                const ds = document.getElementById('browse-dosage');
                if (ds) {
                    const show = Browse.category === 'edible' || Browse.category === 'beverage';
                    ds.style.display = show ? '' : 'none';
                    if (!show) { Browse.dosage = 'all'; ds.value = 'all'; }
                }
                renderCompareDefault();
            });
        });
    }

    function bindBrowseControls() {
        const searchInput = document.getElementById('browse-search-input');
        const catSelect = document.getElementById('browse-category');
        const sortSelect = document.getElementById('browse-sort');
        if (!searchInput) return;

        let searchTimer;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                Browse.query = e.target.value;
                Browse.page = 1;
                renderCompareDefault();
            }, 200);
        });

        const dosageSelect = document.getElementById('browse-dosage');

        function updateDosageVisibility() {
            if (dosageSelect) {
                const show = Browse.category === 'edible' || Browse.category === 'beverage';
                dosageSelect.style.display = show ? '' : 'none';
                if (!show) { Browse.dosage = 'all'; dosageSelect.value = 'all'; }
            }
        }

        catSelect.addEventListener('change', (e) => {
            Browse.category = e.target.value;
            Browse.page = 1;
            updateDosageVisibility();
            renderCompareDefault();
        });

        sortSelect.addEventListener('change', (e) => {
            Browse.sort = e.target.value;
            Browse.page = 1;
            renderCompareDefault();
        });

        if (dosageSelect) {
            dosageSelect.addEventListener('change', (e) => {
                Browse.dosage = e.target.value;
                Browse.page = 1;
                renderCompareDefault();
            });
        }

        const menuTypeSelect = document.getElementById('browse-menu-type');
        if (menuTypeSelect) {
            menuTypeSelect.addEventListener('change', (e) => {
                Browse.menuType = e.target.value;
                Browse.page = 1;
                renderCompareDefault();
            });
        }
    }

    function renderCompareProduct(product) {
        const container = document.getElementById('compare-content');
        const strain = product.strain ? TCC.getStrain(product.strain) : null;
        const lowest = TCC.getLowestPrice(product);
        const highest = TCC.getHighestPrice(product);

        // Sort entries by price ASC. When prices tie, use a deterministic but
        // FAIR shuffle that rotates each day so no single dispensary always wins
        // the top spot. The shuffle uses a daily seed + product id so the order
        // is stable within a session but rotates across days.
        const dailySeed = (function() {
            const today = new Date();
            const dayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
            // Cheap hash of (productId + day) → 0..1
            let h = 0;
            const s = (product.id || '') + dayKey;
            for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
            return Math.abs(h);
        })();

        const entries = Object.entries(product.prices)
            .map(([dispId, price], idx) => {
                // Per-dispensary tiebreaker score: combines TCC score (higher is better)
                // with a daily-rotating offset so no one dispensary dominates ties
                const disp = TCC.getDispensary(dispId);
                const score = disp ? disp.tcc_score : 70;
                // Hash dispensary id + dailySeed for stable but rotating order
                let h = dailySeed;
                for (let i = 0; i < dispId.length; i++) h = ((h << 5) - h + dispId.charCodeAt(i)) | 0;
                const dailyJitter = (Math.abs(h) % 1000) / 10000; // 0..0.1
                return { dispId, price, score, tiebreaker: -score + dailyJitter };
            })
            .sort((a, b) => {
                if (a.price !== b.price) return a.price - b.price;
                // Same price → use the tiebreaker (negative TCC score so higher score wins,
                // plus a daily-rotating jitter for fairness when scores also tie)
                return a.tiebreaker - b.tiebreaker;
            })
            .map(e => [e.dispId, e.price]);

        // Detect real price history (not just flat line)
        const ph = product.priceHistory || [];
        const hasRealHistory = ph.length >= 2 && new Set(ph).size > 1;
        const trendLabel = hasRealHistory
            ? (ph[ph.length-1] < ph[0] ? 'Trending down' : ph[ph.length-1] > ph[0] ? 'Trending up' : 'Stable')
            : '';

        container.innerHTML = `
            <div style="display:flex;gap:1.5rem;align-items:flex-start;flex-wrap:wrap;margin-bottom:2rem">
                ${product.image ? `<div style="width:140px;height:140px;border-radius:var(--radius-lg);overflow:hidden;background:var(--bg-card);border:1px solid var(--border);flex-shrink:0;display:flex;align-items:center;justify-content:center;padding:8px;cursor:pointer" onclick="openLightbox('${product.image}','${esc(product.name).replace(/'/g,"\\'")}','${esc(product.brand||"").replace(/'/g,"\\'")}','${TCC.formatPrice(lowest.price)}','${esc(product.category)}','${esc(product.thc||"")}')">
                    <img src="${product.image}" alt="${esc(product.name)}" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:var(--radius-sm)" onerror="this.parentElement.style.display='none'">
                </div>` : ''}
                <div style="flex:1;min-width:200px">
                    <h2 class="font-display font-bold text-2xl tracking-tight">${esc(product.name)}</h2>
                    <div class="text-secondary text-sm" style="margin-top:0.3rem">${esc(product.brand)}${product.weight ? ' &middot; ' + esc(product.weight) : ''} ${strain ? '&bull; ' + esc(strain.name) : ''}</div>
                    <div style="display:flex;gap:0.4rem;margin-top:0.6rem;flex-wrap:wrap">
                        <span class="tag">${esc(product.category)}</span>
                        ${product.thc ? `<span class="tag">THC ${esc(product.thc)}</span>` : ''}
                        ${product.cbd ? `<span class="tag">CBD ${esc(product.cbd)}</span>` : ''}
                        ${strain ? `<span class="tag strain-tag-${strain.type}">${strain.type}</span>` : ''}
                        <span class="tag tag-blue">${entries.length} dispensar${entries.length === 1 ? 'y' : 'ies'}</span>
                    </div>
                </div>
                <div style="text-align:right;flex-shrink:0">
                    <div class="text-sm text-muted">Best price</div>
                    <div class="font-display font-bold text-3xl text-green">${TCC.formatPrice(lowest.price)}</div>
                    <div class="text-xs text-secondary">at ${esc(TCC.getDispensary(lowest.dispensaryId)?.name || 'Unknown')}</div>
                    ${highest.price - lowest.price > 1 ? `<div class="tag tag-sm tag-green" style="margin-top:0.4rem">Save $${(highest.price - lowest.price).toFixed(0)} vs highest</div>` : ''}
                </div>
            </div>

            <div class="compare-table-wrapper" style="margin-bottom:2rem">
                <table class="compare-table">
                    <thead>
                        <tr>
                            <th>Dispensary</th>
                            <th>Location</th>
                            <th>TCC Score</th>
                            <th>Price</th>
                            <th>vs. Best</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${entries.map(([dispId, price]) => {
                            const disp = TCC.getDispensary(dispId);
                            if (!disp) return '';
                            const diff = price - lowest.price;
                            const isLowest = diff === 0;
                            return `<tr style="cursor:pointer" onclick="window.location.hash='dispensary/${dispId}'">
                                <td>
                                    <span style="font-weight:600">${esc(disp.name)}</span>
                                    ${disp.tier !== 'free' ? `<span class="tag tag-sm" style="margin-left:0.3rem;background:${TCC.getTierColor(disp.tier)};color:${disp.tier === 'platinum' ? '#0a0a0a' : '#fff'};border:none">${TCC.getTierLabel(disp.tier)}</span>` : ''}
                                </td>
                                <td class="text-secondary">${esc(disp.neighborhood)}</td>
                                <td><span style="color:${TCC.getScoreColor(disp.tcc_score)};font-weight:600">${disp.tcc_score}</span></td>
                                <td class="${isLowest ? 'compare-lowest' : ''}" style="font-family:var(--font-display);font-weight:600">${TCC.formatPrice(price)}</td>
                                <td class="text-muted">${isLowest ? '<span class="tag tag-sm tag-green">Best price</span>' : '+$' + diff.toFixed(2)}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>

            <div class="price-chart-container">
                <div class="price-chart-header">
                    <span class="price-chart-title">Price History</span>
                    ${hasRealHistory ? `<span class="tag tag-sm tag-green">${Icons.trending} ${trendLabel}</span>` : '<span class="tag tag-sm">Tracking started - updates daily</span>'}
                </div>
                ${hasRealHistory
                    ? '<div style="position:relative;height:220px"><canvas id="price-chart"></canvas></div>'
                    : `<div style="text-align:center;padding:2rem;color:var(--text-muted)">
                        <div style="font-size:1.5rem;margin-bottom:0.5rem">&#128200;</div>
                        <div style="font-size:0.9rem">Price tracking just started. Check back in a few days for real trend data.</div>
                        <div style="font-size:0.8rem;margin-top:0.3rem;color:var(--text-muted)">Current lowest: ${TCC.formatPrice(lowest.price)}</div>
                       </div>`
                }
            </div>

            <div style="margin-top:2rem">
                <h3 class="font-display font-semibold" style="margin-bottom:1rem">Similar Products</h3>
                <div class="home-grid-2">
                    ${TCC.products.filter(p => p.category === product.category && p.id !== product.id).slice(0, 4).map(p => productCard(p)).join('')}
                </div>
            </div>`;

        // Draw chart
        setTimeout(() => drawPriceChart(product), 100);
    }

    function drawPriceChart(product) {
        const canvas = document.getElementById('price-chart');
        if (!canvas || typeof Chart === 'undefined') return;

        if (App.chartInstance) {
            App.chartInstance.destroy();
        }

        App.chartInstance = new Chart(canvas, {
            type: 'line',
            data: {
                labels: TCC.priceHistoryLabels,
                datasets: [{
                    label: 'Lowest Price',
                    data: product.priceHistory,
                    borderColor: '#22c55e',
                    backgroundColor: 'rgba(34, 197, 94, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: '#22c55e',
                    pointBorderColor: '#0a0a0a',
                    pointBorderWidth: 2,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1a1a1a',
                        titleColor: '#f0f0f0',
                        bodyColor: '#999',
                        borderColor: '#333',
                        borderWidth: 1,
                        callbacks: {
                            label: (ctx) => `$${ctx.raw}`
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255,255,255,0.04)' },
                        ticks: { color: '#555', font: { size: 11 } }
                    },
                    y: {
                        grid: { color: 'rgba(255,255,255,0.04)' },
                        ticks: {
                            color: '#555',
                            font: { size: 11 },
                            callback: (v) => '$' + v
                        }
                    }
                }
            }
        });
    }

    // ---- CARD TEMPLATES ----
    // Check if a dispensary opened recently (within last 60 days).
    // Used to show a "Just Opened" badge and feature in the Recently Opened section.
    function isRecentlyOpened(d) {
        if (!d || !d.opened_at) return false;
        const opened = new Date(d.opened_at);
        if (isNaN(opened.getTime())) return false;
        const days = (Date.now() - opened.getTime()) / (1000 * 60 * 60 * 24);
        return days >= 0 && days <= 60;
    }

    function dispensaryCard(d, variant) {
        const scoreColor = TCC.getScoreColor(d.tcc_score);
        const justOpenedBadge = isRecentlyOpened(d)
            ? '<span class="dispensary-card-new">&#10024; Just Opened</span>'
            : '';

        // Real Google rating with star rendering
        const gRating = d.google?.rating || 0;
        const gCount = d.google?.review_count || 0;
        const fullStars = Math.floor(gRating);
        const halfStar = (gRating - fullStars) >= 0.5;
        const stars = '&#9733;'.repeat(fullStars) + (halfStar ? '&#189;' : '') + '&#9734;'.repeat(5 - fullStars - (halfStar ? 1 : 0));

        // Open/closed (approximate based on current hour)
        const hour = new Date().getHours();
        const isOpen = hour >= 10 && hour < 20;
        const statusBadge = isOpen
            ? '<span class="dispensary-card-status open">&#9679; Open</span>'
            : '<span class="dispensary-card-status closed">&#9679; Closed</span>';

        // Avatar (real image or gradient fallback)
        const hasImage = d.img && d.img.length > 10 && !d.img.includes('placeholder');
        const avatar = hasImage
            ? `<img src="${d.img}" alt="${esc(d.name)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'dispensary-card-avatar-fallback\\' style=\\'background:${d.gradient}\\'>${esc(d.initial)}</div>'">`
            : `<div class="dispensary-card-avatar-fallback" style="background:${d.gradient}">${esc(d.initial)}</div>`;

        // Deals for this dispensary
        const deals = TCC.getDealsForDispensary ? TCC.getDealsForDispensary(d.id) : [];
        const dealHtml = deals.length > 0
            ? `<div style="margin-top:0.4rem"><span class="tag tag-sm tag-green">${Icons.tag} ${deals.length} deal${deals.length > 1 ? 's' : ''}</span></div>`
            : '';

        // Product count
        const products = TCC.getProductsForDispensary ? TCC.getProductsForDispensary(d.id) : [];
        const productCount = products.length;

        // Features badges
        const featureBadges = (d.features || []).slice(0, 3).map(f =>
            `<span class="tag tag-sm">${esc(f)}</span>`
        ).join('');

        // Product spotlight for paid tiers — show up to 3 products with images
        // Priority: flower with images first, then best-selling categories
        let spotlightHtml = '';
        if (d.tier === 'premium' || d.tier === 'featured') {
            const spotProducts = products
                .filter(p => p.image && p.image.length > 10)
                .sort((a, b) => {
                    // Flower first, then edibles, then carts, then everything else
                    const catOrder = { flower: 0, edible: 1, cartridge: 2, 'pre-roll': 3, concentrate: 4 };
                    return (catOrder[a.category] ?? 9) - (catOrder[b.category] ?? 9);
                });
            // Premium gets 3 products everywhere (it has dedicated spotlight column
            // in grid view). Featured gets 1 in grid (narrow) or 2 in list view.
            const isGrid = variant === 'grid';
            const maxSpot = d.tier === 'premium'
                ? 3
                : (isGrid ? 1 : 2);
            const spots = spotProducts.slice(0, maxSpot);
            if (spots.length > 0) {
                const spotLabel = deals.length > 0
                    ? `${Icons.tag} Latest deals &amp; products`
                    : spots[0].category === 'flower' ? `${Icons.leaf} Newest flower` : `${Icons.leaf} On the menu`;
                spotlightHtml = `
                    <div class="dispensary-card-spotlight">
                        <div class="spotlight-label">${spotLabel}</div>
                        <div class="spotlight-items">
                            ${spots.map(p => {
                                const price = p.prices[d.id];
                                // Clean up noisy product names for the spotlight display.
                                // Strip everything after " | " (metadata), strip weight/THC
                                // tails, and cut to the strain name before the dash if the
                                // suffix is just a category like "Hybrid Flower".
                                let displayName = (p.name || '')
                                    .split(/\s*\|\s*/)[0]  // drop " | 17% THC (3.5g)"
                                    .replace(/\s*\([^)]*\)/g, '')  // drop "(3.5g)", "(100mg)"
                                    .replace(/\s*\[[^\]]*\]/g, '')
                                    .trim();
                                // If there's a trailing " - Hybrid Flower" / " - Sativa" etc, trim it
                                displayName = displayName
                                    .replace(/\s+[-–]\s+(Hybrid|Indica|Sativa|Cbd|CBD|Thc)(\s+(Flower|Pre.?roll|Cartridge|Vape|Edible|Gummies?))?\s*$/i, '')
                                    .trim();
                                if (displayName.length > 42) displayName = displayName.slice(0, 40) + '…';
                                if (!displayName) displayName = p.name;
                                const catIcon = Icons[ ({flower:'leaf','pre-roll':'joint',cartridge:'cart',edible:'cookie',concentrate:'diamond',topical:'drop',tincture:'bottle',beverage:'beverage'})[p.category] || 'leaf' ] || '';
                                return `<div class="spotlight-item">
                                    <div class="spotlight-item-cat">${catIcon}</div>
                                    <div class="spotlight-item-info">
                                        <div class="spotlight-item-name">${esc(displayName)}</div>
                                        <div class="spotlight-item-price">${price ? '$' + price.toFixed(2) : ''}</div>
                                    </div>
                                </div>`;
                            }).join('')}
                        </div>
                    </div>`;
            }
        }
        const isPaid = d.tier !== 'free';
        const tierClass = d.tier === 'premium' ? 'dispensary-card-premium'
                       : d.tier === 'featured' ? 'dispensary-card-featured'
                       : '';

        // Paid tiers: small "Sponsored" text above the name
        const sponsorLine = d.tier === 'premium'
            ? '<div class="dispensary-card-sponsor-label sponsor-label-premium">Sponsored</div>'
            : d.tier === 'featured'
            ? '<div class="dispensary-card-sponsor-label sponsor-label-featured">Featured</div>'
            : '';

        // Top Google review — only for paid tiers, pick a good one
        const topReview = isPaid && d.google?.reviews?.length > 0
            ? d.google.reviews.find(r => r.rating >= 4 && r.text && r.text.length > 40)
            : null;
        const quoteHtml = topReview
            ? `<div class="dispensary-card-quote">&ldquo;${esc(topReview.text.slice(0, 160))}${topReview.text.length > 160 ? '…' : ''}&rdquo; &mdash; ${esc(topReview.author)}</div>`
            : '';

        return `<div class="card dispensary-card ${tierClass} ${variant === 'grid' ? 'dispensary-card-grid' : ''}" onclick="window.location.hash='dispensary/${d.id}'">
            <div class="card-body">
                <div class="dispensary-card-avatar">
                    ${avatar}
                </div>
                <div class="dispensary-card-info">
                    ${sponsorLine}
                    <div class="dispensary-card-header">
                        <div style="min-width:0">
                            <div class="dispensary-card-name">${esc(d.name)}</div>
                            <div class="dispensary-card-loc">${Icons.pin} ${esc(d.neighborhood || d.city)}${d.neighborhood && d.neighborhood !== d.city ? ' &bull; ' + esc(d.city) : ''}${_getDistanceMi(d) != null ? ' &bull; <span style="color:var(--green)">' + _getDistanceMi(d) + ' mi</span>' : ''}</div>
                        </div>
                        <div class="dispensary-card-score">
                            <span class="dispensary-card-score-num" style="background:${scoreColor}">${d.tcc_score}</span>
                        </div>
                    </div>
                    <div class="dispensary-card-rating">
                        ${gRating > 0 ? `<span class="stars">${stars}</span><span class="rating-num">${gRating.toFixed(1)}</span><span class="count">(${gCount.toLocaleString()})</span>` : '<span class="text-muted text-xs">No reviews yet</span>'}
                        ${statusBadge}
                        ${justOpenedBadge}
                    </div>
                    <div class="dispensary-card-meta">
                        <span>${Icons.clock} ${esc(d.hours?.note || d.hours?.weekday || 'Check hours')}</span>
                        ${productCount > 0 ? `<span>${Icons.leaf} ${productCount} products</span>` : ''}
                        ${d.verified ? `<span>${Icons.verified} Verified</span>` : ''}
                    </div>
                    ${dealHtml}
                    ${spotlightHtml}
                    ${quoteHtml}
                    <div class="dispensary-card-actions">
                        <span class="btn btn-sm btn-primary">View Menu</span>
                        <span class="btn btn-sm btn-secondary" onclick="event.stopPropagation();window.open('${getDispensaryWebsite(d)}','_blank')">${isOfficialWebsite(d) ? 'Website' : 'Find on Maps'}</span>
                    </div>
                </div>
            </div>
        </div>`;
    }

    function priceTrendTag(p) {
        if (!p.priceHistory || p.priceHistory.length < 2) return '';
        const ph = p.priceHistory;
        const oldest = ph[0], newest = ph[ph.length - 1];
        const diff = oldest - newest;
        if (new Set(ph).size <= 1 || Math.abs(diff) < 1) {
            return `<span class="tag tag-sm" style="background:rgba(139,144,154,0.08);color:var(--text-muted)" title="Price stable over tracked period">&mdash; Stable</span>`;
        }
        if (diff > 0) return `<span class="tag tag-sm" style="background:rgba(34,197,94,0.1);color:var(--green)" title="Price dropped $${diff.toFixed(0)} recently">&darr; $${diff.toFixed(0)}</span>`;
        return `<span class="tag tag-sm" style="background:rgba(239,68,68,0.1);color:#ef4444" title="Price rose $${Math.abs(diff).toFixed(0)} recently">&uarr; $${Math.abs(diff).toFixed(0)}</span>`;
    }

    function productCard(p) {
        const range = TCC.getPriceRange(p);
        const strain = p.strain ? TCC.getStrain(p.strain) : null;
        const strainTag = strain ? `<span class="tag tag-sm strain-tag-${strain.type}">${strain.type}</span>` : '';
        const numDisps = Object.keys(p.prices).length;
        const savings = range.high && range.low ? range.high - range.low : 0;

        // Product image — falls back to category emoji tile if no real image
        const hasImg = p.image && p.image.length > 10;
        const catEmoji = { flower: '\u{1F33F}', 'pre-roll': '\u{1F4A8}', cartridge: '\u{1F52B}', edible: '\u{1F36C}', beverage: '\u{1F964}', tincture: '\u{1F48A}', topical: '\u{1F9F4}', concentrate: '\u{1F48E}' }[p.category] || '\u{1F33F}';
        const imgHtml = hasImg
            ? `<div class="product-card-img" onclick="event.stopPropagation();openLightbox('${p.image}','${esc(p.name).replace(/'/g,"\\'")}','${esc(p.brand||"").replace(/'/g,"\\'")}','${TCC.formatPrice(TCC.getLowestPrice(p)?.price||0)}','${esc(p.category)}','${esc(p.thc||"")}')"><img src="${p.image}" alt="${esc(p.name)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'product-card-img-fallback\\'>${catEmoji}</div>'"></div>`
            : `<div class="product-card-img"><div class="product-card-img-fallback">${catEmoji}</div></div>`;

        return `<div class="card product-card" onclick="window.location.hash='compare/${p.id}'">
            <div class="card-body-sm" style="display:flex;gap:0.8rem;align-items:flex-start">
                ${imgHtml}
                <div style="flex:1;min-width:0">
                    <div class="product-card-header">
                        <div style="min-width:0">
                            <div class="product-card-name">${esc(p.name)}${p.menu_type === 'med' ? ' <span class="rx-badge" title="Medical menu price">℞</span>' : ''}</div>
                            <div class="product-card-brand">${esc(p.brand)}${p.weight ? ' &middot; ' + esc(p.weight) : ''}</div>
                        </div>
                        <div class="product-card-prices">
                            <div class="product-card-price-low">${TCC.formatPrice(range.low)}</div>
                            ${range.low !== range.high ? `<div class="product-card-price-range">to ${TCC.formatPrice(range.high)}</div>` : ''}
                        </div>
                    </div>
                    <div class="product-card-meta">
                        <span class="tag tag-sm">${catIcons[p.category] || ''} ${esc(p.category)}</span>
                        ${p.grams ? `<span class="tag tag-sm" style="background:rgba(168,85,247,0.12);color:#a855f7">${p.grams}g</span>` : ''}
                        ${p.pricePerGram ? `<span class="tag tag-sm" style="background:rgba(34,197,94,0.08);color:var(--green)">$${p.pricePerGram.toFixed(2)}/g</span>` : ''}
                        ${p.mg ? `<span class="tag tag-sm" style="background:rgba(168,85,247,0.12);color:#a855f7">${p.mg}mg</span>` : ''}
                        ${p.pricePerMg ? `<span class="tag tag-sm" style="background:rgba(34,197,94,0.08);color:var(--green)">$${p.pricePerMg.toFixed(2)}/mg</span>` : ''}
                        ${p.thc && !p.mg ? `<span class="tag tag-sm" style="background:rgba(251,191,36,0.1);color:#fbbf24">THC ${esc(p.thc)}</span>` : ''}
                        ${strainTag}
                        ${numDisps > 1 ? `<span class="tag tag-sm tag-blue">${numDisps} dispensaries</span>` : ''}
                        ${savings > 3 ? `<span class="tag tag-sm tag-green">Save $${savings.toFixed(0)}</span>` : ''}
                        ${priceTrendTag(p)}
                    </div>
                </div>
            </div>
        </div>`;
    }

    function dealCard(d) {
        const disp = TCC.getDispensary(d.dispensaryId);
        const typeLabels = {
            'percent-off': `${d.discount}% Off`, 'dollar-off': `$${d.discount} Off`, flash: 'Flash Sale',
            bogo: 'BOGO', 'new-customer': 'New Customer', 'happy-hour': 'Happy Hour',
            veteran: 'Veterans', loyalty: 'Loyalty', 'price-drop': 'Price Drop', 'new-arrival': 'New Arrival'
        };

        return `<div class="card deal-card" onclick="${d.dispensaryId ? `window.location.hash='dispensary/${d.dispensaryId}'` : ''}">
            <div class="card-body">
                <span class="deal-card-badge deal-type-${d.type}">${typeLabels[d.type] || d.type}</span>
                ${d.featured ? '<span class="tag tag-sm tag-amber" style="margin-left:0.3rem">Featured</span>' : ''}
                <div class="deal-card-title">${esc(d.title)}</div>
                <div class="deal-card-dispensary">${disp ? esc(disp.name) + ' &bull; ' + esc(disp.neighborhood) : ''}</div>
                ${d.salePrice ? `<div class="deal-card-pricing">
                    <span class="deal-card-sale">${TCC.formatPrice(d.salePrice)}</span>
                    ${d.originalPrice ? `<span class="deal-card-original">${TCC.formatPrice(d.originalPrice)}</span>` : ''}
                </div>` : ''}
                ${d.expires ? `<div class="deal-card-expires">Expires ${esc(d.expires)}</div>` : ''}
            </div>
        </div>`;
    }

    function strainCard(s) {
        const products = TCC.getProductsByStrain(s.id);
        const prices = products.flatMap(p => Object.values(p.prices));
        const minPrice = prices.length ? Math.min(...prices) : null;

        return `<div class="card strain-card" onclick="window.location.hash='strain/${s.id}'">
            <div class="card-body">
                <div class="strain-card-header">
                    <div class="strain-card-name">${esc(s.name)}</div>
                    <span class="tag strain-tag-${s.type} strain-card-type">${esc(s.type)}</span>
                </div>
                <div class="strain-card-desc">${esc(s.desc)}</div>
                <div class="strain-card-effects">
                    ${s.effects.slice(0, 3).map(e => `<span class="tag tag-sm tag-green">${esc(e)}</span>`).join('')}
                </div>
                <div class="strain-card-footer">
                    <span class="strain-card-availability">${products.length} product${products.length !== 1 ? 's' : ''} available</span>
                    ${minPrice ? `<span class="strain-card-price">From ${TCC.formatPrice(minPrice)}</span>` : ''}
                </div>
            </div>
        </div>`;
    }

    // ---- SEARCH ----
    function handleSearch(query) {
        const dropdown = document.getElementById('search-dropdown');
        if (!query || query.length < 2) {
            dropdown.classList.remove('open');
            return;
        }

        const dispensaries = TCC.searchDispensaries(query).slice(0, 3);
        const products = TCC.searchProducts(query).slice(0, 4);
        const strains = TCC.strains.filter(s => s.name.toLowerCase().includes(query.toLowerCase())).slice(0, 3);

        if (!dispensaries.length && !products.length && !strains.length) {
            dropdown.classList.remove('open');
            return;
        }

        let html = '';

        if (dispensaries.length) {
            html += `<div class="search-dropdown-section">
                <div class="search-dropdown-label">Dispensaries</div>
                ${dispensaries.map(d => `
                    <div class="search-dropdown-item" onclick="window.location.hash='dispensary/${d.id}'">
                        <div class="search-dropdown-item-icon" style="background:${d.gradient}">${esc(d.initial)}</div>
                        <div class="search-dropdown-item-info">
                            <div class="search-dropdown-item-name">${esc(d.name)}</div>
                            <div class="search-dropdown-item-detail">${esc(d.neighborhood)} &bull; TCC ${d.tcc_score}</div>
                        </div>
                    </div>`).join('')}
            </div>`;
        }

        if (products.length) {
            html += `<div class="search-dropdown-section">
                <div class="search-dropdown-label">Products</div>
                ${products.map(p => {
                    const low = TCC.getLowestPrice(p);
                    return `<div class="search-dropdown-item" onclick="window.location.hash='compare/${p.id}'">
                        <div class="search-dropdown-item-icon" style="background:var(--bg-secondary);border:1px solid var(--border)">${catIcons[p.category] || ''}</div>
                        <div class="search-dropdown-item-info">
                            <div class="search-dropdown-item-name">${esc(p.name)}</div>
                            <div class="search-dropdown-item-detail">${esc(p.brand)}</div>
                        </div>
                        <div class="search-dropdown-item-price">${low ? TCC.formatPrice(low.price) : ''}</div>
                    </div>`;
                }).join('')}
            </div>`;
        }

        if (strains.length) {
            html += `<div class="search-dropdown-section">
                <div class="search-dropdown-label">Strains</div>
                ${strains.map(s => `
                    <div class="search-dropdown-item" onclick="window.location.hash='strain/${s.id}'">
                        <div class="search-dropdown-item-icon" style="background:var(--green-bg);border:1px solid rgba(34,197,94,0.2);color:var(--green)">${Icons.leaf}</div>
                        <div class="search-dropdown-item-info">
                            <div class="search-dropdown-item-name">${esc(s.name)}</div>
                            <div class="search-dropdown-item-detail">${esc(s.type)} &bull; THC ${esc(s.thc)}</div>
                        </div>
                    </div>`).join('')}
            </div>`;
        }

        dropdown.innerHTML = html;
        dropdown.classList.add('open');
    }

    function closeSearchDropdown() {
        const dd = document.getElementById('search-dropdown');
        if (dd) dd.classList.remove('open');
    }

    // ---- MOBILE MENU ----
    function closeMobileMenu() {
        document.querySelector('.nav-menu')?.classList.remove('open');
    }

    // ---- EVENT BINDING ----
    function bindEvents() {
        // Hash routing
        window.addEventListener('hashchange', route);

        // Logo click
        document.querySelector('.nav-logo')?.addEventListener('click', () => navigate('home'));

        // Mobile menu
        document.querySelector('.nav-mobile-toggle')?.addEventListener('click', () => {
            document.querySelector('.nav-menu')?.classList.toggle('open');
        });

        // Theme toggle (light/dark) — persists to localStorage
        document.getElementById('theme-toggle')?.addEventListener('click', () => {
            const html = document.documentElement;
            const isLight = html.getAttribute('data-theme') === 'light';
            if (isLight) {
                html.removeAttribute('data-theme');
                try { localStorage.setItem('tcc-theme', 'dark'); } catch (e) {}
            } else {
                html.setAttribute('data-theme', 'light');
                try { localStorage.setItem('tcc-theme', 'light'); } catch (e) {}
            }
        });

        // Dispensary Map/List view toggle (mobile UX)
        const viewToggle = document.getElementById('disp-view-toggle');
        if (viewToggle) {
            viewToggle.addEventListener('click', (e) => {
                const btn = e.target.closest('.disp-view-btn');
                if (!btn) return;
                const view = btn.dataset.view;
                const layout = document.getElementById('disp-split-layout');
                if (!layout) return;
                viewToggle.querySelectorAll('.disp-view-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                layout.classList.remove('view-list', 'view-map');
                layout.classList.add('view-' + view);
                if (view === 'map' && App.mapInstance) {
                    setTimeout(function() { App.mapInstance.invalidateSize(); }, 100);
                }
            });
        }

        // Global search
        const searchInput = document.getElementById('hero-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => handleSearch(e.target.value));
            searchInput.addEventListener('focus', (e) => { if (e.target.value.length >= 2) handleSearch(e.target.value); });
        }

        // Close search on click outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.hero-search-bar')) closeSearchDropdown();
        });

        // Search suggestions
        document.querySelectorAll('.search-suggestion').forEach(el => {
            el.addEventListener('click', () => {
                const q = el.dataset.query;
                const searchInput = document.getElementById('hero-search-input');
                if (searchInput) {
                    searchInput.value = q;
                    handleSearch(q);
                }
            });
        });

        // Quick category clicks — navigate to compare with category pre-filtered
        document.querySelectorAll('.quick-cat').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const cat = el.dataset.category || 'all';
                navigate(`compare/cat/${cat}`);
            });
        });

        // Dispensary filters
        const dispSearch = document.getElementById('disp-search');
        const dispCity = document.getElementById('disp-city');
        const dispSort = document.getElementById('disp-sort');

        if (dispSearch) dispSearch.addEventListener('input', () => applyDispFilters());
        if (dispCity) dispCity.addEventListener('change', () => applyDispFilters());
        if (dispSort) dispSort.addEventListener('change', () => applyDispFilters());

        // Dispensary filter toggles
        document.querySelectorAll('#disp-toggles .filter-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#disp-toggles .filter-toggle').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                applyDispFilters();
            });
        });

        // Deal filter tabs
        document.querySelectorAll('.deal-filter-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.deal-filter-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                renderDeals(tab.dataset.filter);
            });
        });

        // Strain filters
        const strainSearch = document.getElementById('strain-search');
        const strainType = document.getElementById('strain-type');
        if (strainSearch) strainSearch.addEventListener('input', () => applyStrainFilters());
        if (strainType) strainType.addEventListener('change', () => applyStrainFilters());

        // Detail tabs
        document.querySelectorAll('.detail-tab').forEach(tab => {
            tab.addEventListener('click', () => switchDetailTab(tab.dataset.tab));
        });

        // Consumer email signup is now a Kit embed (script tag in index.html,
        // form ee755f1be7). Kit handles submission + success state. We just
        // track the conversion event when the embed's submit button is clicked.
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('.kit-form-minimal button[type="submit"], .kit-form-minimal .formkit-submit');
            if (btn) {
                if (typeof gtag === 'function') gtag('event', 'generate_lead', { event_category: 'engagement', event_label: 'price_alert_signup' });
                if (typeof fbq === 'function') fbq('track', 'Lead', { content_name: 'TCC Price Alerts' });
            }
        });

        // Dispensary signup form is now a Kit embed (script tag in index.html)
        // Kit handles the submit + storage + success message. We just track
        // the conversion event when their submit button is clicked.
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('.kit-form-wrapper button[type="submit"], .formkit-submit');
            if (btn) {
                if (typeof gtag === 'function') gtag('event', 'generate_lead', { event_category: 'dispensary', event_label: 'dispensary_signup', value: 299 });
                if (typeof fbq === 'function') fbq('track', 'Lead', { content_name: 'Dispensary Signup', value: 299, currency: 'USD' });
            }
        });

        // Intersection observer for animations.
        // We add .js-animate to <body> ONLY if IntersectionObserver works,
        // so animations are progressive enhancement. CSS defaults to visible
        // so content never gets stuck invisible if anything fails.
        if ('IntersectionObserver' in window) {
            document.body.classList.add('js-animate');
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) entry.target.classList.add('visible');
                });
            }, { threshold: 0.05, rootMargin: '50px' });

            document.querySelectorAll('.fade-in, .stagger').forEach(el => observer.observe(el));

            // Safety net: after 1.5s force-show anything still hidden,
            // covers hash-route page transitions where new pages may not trigger
            setTimeout(() => {
                document.querySelectorAll('.fade-in:not(.visible), .stagger:not(.visible)').forEach(el => el.classList.add('visible'));
            }, 1500);
        }
    }

    async function applyDispFilters() {
        const search = document.getElementById('disp-search')?.value || '';
        const city = document.getElementById('disp-city')?.value || 'all';
        const sort = document.getElementById('disp-sort')?.value || 'score';
        const activeToggle = document.querySelector('#disp-toggles .filter-toggle.active');
        const toggle = activeToggle ? activeToggle.dataset.filter : 'all';
        // Request geolocation when "near me" sort is selected
        if (sort === 'near-me' && _userLat == null) {
            const ok = await _requestLocation();
            if (!ok) {
                // Couldn't get location, fall back to score
                document.getElementById('disp-sort').value = 'score';
                renderDispensaries({ search, city, sort: 'score', toggle });
                return;
            }
        }
        renderDispensaries({ search, city, sort, toggle });
    }

    function applyStrainFilters() {
        const search = document.getElementById('strain-search')?.value || '';
        const type = document.getElementById('strain-type')?.value || 'all';
        renderStrains({ search, type });
    }

    // ---- INIT ----
    // ---- LIGHTBOX ----
    window.openLightbox = function(imgSrc, name, brand, price, category, thc) {
        const lb = document.getElementById('lightbox');
        document.getElementById('lightbox-img').src = imgSrc;
        document.getElementById('lightbox-name').textContent = name;
        document.getElementById('lightbox-brand').textContent = brand;
        document.getElementById('lightbox-price').textContent = price;
        document.getElementById('lightbox-tags').innerHTML =
            `<span class="tag tag-sm">${category}</span>` +
            (thc ? `<span class="tag tag-sm">THC ${thc}</span>` : '');
        lb.classList.add('open');
    };

    // Close lightbox on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') document.getElementById('lightbox')?.classList.remove('open');
    });

    // Inject custom SVG icons into any element with [data-icon="iconName"]
    function injectDataIcons() {
        document.querySelectorAll('[data-icon]').forEach(el => {
            const name = el.getAttribute('data-icon');
            if (Icons[name] && !el.innerHTML.trim()) {
                // Render at element's intended size
                el.innerHTML = Icons[name];
                const svg = el.querySelector('svg');
                if (svg) {
                    svg.setAttribute('width', '100%');
                    svg.setAttribute('height', '100%');
                }
            }
        });
    }

    function updateHeroCounts() {
        const pc = TCC.products ? TCC.products.length.toLocaleString() + '+' : '2,000+';
        const dc = TCC.dispensaries ? TCC.dispensaries.length.toString() : '32';
        // Hero + announcement bar + home stats bar + for-dispensaries proof stats
        const productIds = ['hero-stat-products', 'announce-product-count', 'stats-bar-products', 'proof-stat-products'];
        const dispIds = ['hero-stat-dispensaries', 'announce-disp-count', 'stats-bar-disps', 'proof-stat-disps'];
        productIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = pc;
        });
        dispIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = dc;
        });
    }

    // Override TCC.getProductsByStrain with name-based matching since the
    // scraped product data has no strain field. This scans every product
    // name (and brand) for strain name + alias matches and caches results
    // so we don't re-scan on every call. Lives in app.js so it persists
    // across scraper-driven data.js regenerations.
    function installStrainMatching() {
        if (!TCC.strains || !TCC.products) return;
        const cache = {};

        // Build a regex for each strain (name + aliases). Word boundaries to
        // avoid partial matches like "Soap" in "Soapy" or "Mac" in "Magic".
        const strainRegexes = TCC.strains.map(s => {
            const variants = [s.name, ...(s.aliases || [])];
            // Sort by length descending so longer aliases match before shorter ones
            // (e.g., "Lemon Cherry Gelato" should match before "Gelato")
            variants.sort((a, b) => b.length - a.length);
            const escaped = variants.map(v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'));
            return {
                strain: s,
                regex: new RegExp('\\b(' + escaped.join('|') + ')\\b', 'i')
            };
        });

        // Pre-compute strain → matching products map for fast lookup
        const strainProducts = {};
        TCC.strains.forEach(s => { strainProducts[s.id] = []; });

        // For each product, check which strain it matches.
        // Greedy approach: a product can only match ONE strain (the longest/first).
        // This avoids "Lemon Cherry Gelato" being counted under both "Lemon Cherry Gelato" and "Gelato".
        TCC.products.forEach(p => {
            const haystack = `${p.name} ${p.brand || ''}`;
            for (const { strain, regex } of strainRegexes) {
                if (regex.test(haystack)) {
                    strainProducts[strain.id].push(p);
                    break;
                }
            }
        });

        // Replace the data.js implementation with our name-based one
        TCC.getProductsByStrain = (strainId) => {
            if (cache[strainId]) return cache[strainId];
            cache[strainId] = strainProducts[strainId] || [];
            return cache[strainId];
        };

        // Also expose a helper that returns total count without requiring full lookup
        TCC.getStrainProductCount = (strainId) => {
            return (strainProducts[strainId] || []).length;
        };

        // For debugging — number of strains with at least 1 product
        if (typeof console !== 'undefined') {
            const withProducts = TCC.strains.filter(s => strainProducts[s.id].length > 0).length;
            console.log(`[strain matching] ${withProducts}/${TCC.strains.length} strains have matching products`);
        }
    }

    // Fetch tier overrides from the Cloudflare Worker and merge into TCC.dispensaries.
    // Non-blocking — runs in the background after first paint. If it succeeds and
    // any dispensary's tier changed, re-renders the views that show tier badges.
    async function loadTierOverrides() {
        try {
            const res = await fetch(`${TCC_WORKER_URL}/overrides`, { cache: 'no-store' });
            if (!res.ok) return;
            const overrides = await res.json();
            let changed = 0;
            for (const id of Object.keys(overrides)) {
                const d = TCC.dispensaries.find(x => x.id === id);
                if (!d) continue;
                const newTier = overrides[id] && overrides[id].tier;
                if (newTier && d.tier !== newTier) {
                    d.tier = newTier;
                    changed++;
                }
            }
            // Update Founding Member slot counter on pricing page
            const slotsEl = document.getElementById('founding-slots-remaining');
            if (slotsEl) {
                const remaining = Math.max(0, 10 - Object.keys(overrides).length);
                slotsEl.textContent = remaining;
            }
            if (changed > 0) {
                console.log(`[overrides] applied ${changed} tier override(s)`);
                // Re-render anything that displays tier badges
                renderHome();
                renderDispensaries();
                renderCompare();
            }
        } catch (err) {
            // Silent failure — overrides are optional, base experience still works
            console.debug('[overrides] fetch failed (non-fatal):', err.message);
        }
    }

    // ─── Live "people comparing prices now" counter ──────────────────────
    // Pings the worker on load + every 2 min while tab is visible. Polls
    // /active every 30s to refresh the displayed count. Hybrid (Option C):
    // real visitors + small modest baseline server-side. Frontend just
    // displays whatever the worker returns. Silent failure: if the worker
    // is offline, the dash stays as "—" and nothing breaks.
    function startActiveCounter() {
        const el = document.getElementById('announce-active-count');
        const labelEl = document.getElementById('announce-active-label');
        if (!el) return;

        // Persistent session id so a single user counts as one visitor across
        // page navigations within the SPA. Stored in sessionStorage so it dies
        // when the tab closes — that's the desired behavior.
        let sid = sessionStorage.getItem('tcc-sid');
        if (!sid) {
            sid = Math.random().toString(36).slice(2, 14) + Date.now().toString(36).slice(-6);
            try { sessionStorage.setItem('tcc-sid', sid); } catch (e) {}
        }

        async function ping() {
            try {
                await fetch(`${TCC_WORKER_URL}/ping`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sid }),
                    keepalive: true,
                });
            } catch (e) { /* silent */ }
        }

        async function poll() {
            try {
                const res = await fetch(`${TCC_WORKER_URL}/active`, { cache: 'no-store' });
                if (!res.ok) return;
                const data = await res.json();
                const n = Math.max(1, Number(data.active) || 0);
                el.textContent = n;
                if (labelEl) {
                    labelEl.textContent = n === 1 ? 'person comparing prices now' : 'people comparing prices now';
                }
            } catch (e) { /* silent */ }
        }

        // Kick off immediately, then on a cadence
        ping();
        poll();
        setInterval(poll, 300000);  // refresh display every 5 min (synthetic, no need to hammer)
        setInterval(() => {
            // Re-ping every 2 min so we stay counted as active
            if (document.visibilityState === 'visible') ping();
        }, 120000);

        // Also re-ping when the tab regains focus after being backgrounded
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                ping();
                poll();
            }
        });
    }

    function init() {
        installStrainMatching();
        updateHeroCounts();
        injectDataIcons();
        renderHome();
        renderStaffPick();
        renderDispensaries({ city: 'metro' });
        renderDeals();
        renderStrains();
        renderCompare();
        bindBrowseControls();
        bindEvents();
        bindSubscribeButtons();
        bindMenuUploadForm();
        route();
        // Async post-init: load tier overrides + start the live counter
        loadTierOverrides();
        startActiveCounter();
    }

    // Wires the public menu-upload form on #menu-upload. Populates the shop
    // dropdown from TCC.dispensaries, prefills from ?slug= in the hash if
    // a visitor arrived via an empty-menu CTA, and POSTs FormData to the
    // worker's /menu-upload endpoint. The worker stores the submission in
    // KV and emails Josh; he runs scraper/import_uploaded_menu.py to merge
    // approved menus into TCC.products.
    function bindMenuUploadForm() {
        const form = document.getElementById('menu-upload-form');
        if (!form) return;
        const slugSel = document.getElementById('menu-upload-slug');
        const status  = document.getElementById('menu-upload-status');

        // Populate dropdown — alphabetized by display name
        if (slugSel && TCC.dispensaries) {
            const sorted = [...TCC.dispensaries].sort((a, b) =>
                (a.name || '').localeCompare(b.name || ''));
            for (const d of sorted) {
                const opt = document.createElement('option');
                opt.value = d.id;
                opt.textContent = `${d.name}${d.city ? ' — ' + d.city : ''}`;
                slugSel.appendChild(opt);
            }
        }

        // Prefill slug from hash query (e.g. #menu-upload?slug=fort-road-cannabis)
        function prefillFromHash() {
            const hash = window.location.hash || '';
            const m = hash.match(/[?&]slug=([a-z0-9-]+)/i);
            if (m && slugSel) slugSel.value = m[1];
        }
        prefillFromHash();
        window.addEventListener('hashchange', prefillFromHash);

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            status.className = 'menu-upload-status';
            status.textContent = '';
            const submitBtn = form.querySelector('button[type="submit"]');
            const fd = new FormData(form);
            // Sanity: require either a file OR pasted text
            const file = fd.get('menu_file');
            const text = (fd.get('menu_text') || '').toString().trim();
            if ((!file || !file.size) && !text) {
                status.className = 'menu-upload-status is-error';
                status.textContent = 'Attach a file or paste your menu data first.';
                return;
            }
            if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Sending…'; }
            try {
                const res = await fetch(`${TCC_WORKER_URL}/menu-upload`, { method: 'POST', body: fd });
                const data = await res.json().catch(() => ({}));
                if (!res.ok || !data.ok) {
                    throw new Error(data.error || `HTTP ${res.status}`);
                }
                status.className = 'menu-upload-status is-success';
                status.textContent = 'Got it. We’ll review your menu and reach out within 24 hours to confirm before it goes live.';
                form.reset();
                trackEvent('menu_upload_submit', { slug: fd.get('slug') });
            } catch (err) {
                status.className = 'menu-upload-status is-error';
                status.textContent = `Couldn't send right now (${err.message}). Email hello@twincitycannabis.com and we'll take it from there.`;
            } finally {
                if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Send menu →'; }
            }
        });
    }

    // Wires the Featured/Premium "Start Free Trial" / "Contact Us" buttons on
    // /for-dispensaries to the Stripe Payment Links (when configured). If a
    // dispensary id is in the URL hash (e.g. ?dispensary=wildflower-5), it
    // gets passed as client_reference_id so the webhook can identify the buyer.
    function bindSubscribeButtons() {
        const buttons = document.querySelectorAll('[data-subscribe-tier]');
        buttons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tier = btn.getAttribute('data-subscribe-tier');
                const url = (window.TIER_PAYMENT_LINKS || {})[tier];
                if (!url) return; // not configured yet, fall through to default href (claim form)
                e.preventDefault();
                const params = new URLSearchParams(window.location.search);
                const dispensaryId = params.get('dispensary') || sessionStorage.getItem('tcc_claim_dispensary');
                trackEvent('subscribe_click', { tier, dispensary_id: dispensaryId || 'unspecified' });
                let target = url;
                if (dispensaryId) {
                    target += (url.includes('?') ? '&' : '?') + 'client_reference_id=' + encodeURIComponent(dispensaryId);
                }
                window.location.href = target;
            });
        });
    }

    function trackEvent(name, params) {
        if (typeof window.gtag === 'function') {
            try { window.gtag('event', name, params || {}); } catch (_) {}
        }
    }

    // Fires a server-side event that increments per-dispensary counters in KV.
    // Powers the dispensary dashboard at /dashboard?id=X. Dedupes within the tab
    // so repeated renders of the same listing don't inflate the "views" count.
    const _trackedThisSession = new Set();
    function trackServerEvent(dispensaryId, event, { dedupe = true } = {}) {
        if (!dispensaryId) return;
        const dedupeKey = `${dispensaryId}:${event}`;
        if (dedupe && _trackedThisSession.has(dedupeKey)) return;
        _trackedThisSession.add(dedupeKey);
        try {
            fetch(`${TCC_WORKER_URL}/track`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: dispensaryId, event }),
                keepalive: true,
            }).catch(() => {});
        } catch (_) {}
    }

    // Classifies any outbound click so GA can show which dispensaries we drive
    // traffic to. Fires once per click, delegated so dynamically-rendered cards
    // are covered without re-wiring on every render.
    document.addEventListener('click', (e) => {
        const a = e.target.closest('a[href]');
        if (!a) return;
        let u;
        try { u = new URL(a.href, window.location.href); } catch (_) { return; }
        if (!u.hostname || u.hostname === window.location.hostname) return;
        const host = u.hostname.replace(/^www\./, '');
        // Subscribe clicks are already tracked in bindSubscribeButtons
        if (host.endsWith('buy.stripe.com')) return;
        if (host.endsWith('google.com') || host.endsWith('maps.google.com')) {
            trackEvent('google_outbound', { destination: host });
            return;
        }
        const card = a.closest('[data-dispensary-id]');
        const dispensaryId = (card && card.getAttribute('data-dispensary-id')) || null;
        // Also track via dispensary id if the page is a dispensary detail view
        const routeId = (window.location.hash || '').match(/#dispensary\/([a-z0-9-]+)/i);
        const effectiveId = dispensaryId || (routeId && routeId[1]) || null;
        trackEvent('dispensary_outbound', {
            destination: host,
            dispensary_id: effectiveId || 'unknown',
        });
        if (effectiveId) trackServerEvent(effectiveId, 'outbound', { dedupe: false });
    });

    // ─── Easter egg: type 420 anywhere to float away ──────────────────────
    // Keeps a short rolling buffer of digit keys. When the sequence 4-2-0
    // appears, drift off to /cloud-nine/. Ignored while typing in inputs so
    // search bars don't accidentally trigger it.
    (function () {
        let buf = '';
        document.addEventListener('keydown', (e) => {
            const tag = (e.target && e.target.tagName) || '';
            if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            if (!/^[0-9]$/.test(e.key)) { buf = ''; return; }
            buf = (buf + e.key).slice(-3);
            if (buf === '420') {
                buf = '';
                trackEvent('easter_egg', { egg: 'cloud_nine_420' });
                window.location.href = '/cloud-nine/';
            }
        });
        // Subtle hint for anyone peeking at DevTools
        try {
            console.log('%cTwin City Cannabis', 'color:#22c55e;font-weight:bold;font-size:14px');
            console.log('%ctry the magic number somewhere on the page ☁️', 'color:#8b909a;font-size:11px');
        } catch (_) {}
    })();

    // Wait for DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose for hash routing on compare
    window.addEventListener('hashchange', () => {
        const hash = window.location.hash.slice(1);
        if (hash.startsWith('compare/cat/')) {
            // Quick-category navigation from the homepage tiles
            const cat = hash.split('/')[2];
            Browse.category = cat || 'all';
            Browse.page = 1;
            renderCompare();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (hash.startsWith('compare/')) {
            const productId = hash.split('/')[1];
            renderCompare(productId);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (hash === 'compare') {
            renderCompare();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });

})();
