// ============================================================
// Twin City Cannabis — App Logic
// Hash routing, page rendering, search, filters, interactivity
// ============================================================

(function() {
    'use strict';

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

        // ===== CUSTOM CATEGORY ICONS =====
        // Cannabis leaf — symmetric 7-leaflet design
        leaf: svgIcon(16, '<path d="M12 2c-.5 2.5-1.5 4.5-3 6 1.5.5 2.5 1.5 3 3 .5-1.5 1.5-2.5 3-3-1.5-1.5-2.5-3.5-3-6z"/><path d="M12 11c-2-1.5-4-2-6.5-2 1 2 2.5 3.5 4.5 4.5-2 .5-4 .5-6 0 2 2 4.5 3 7 3-1 1.5-2 2.5-3.5 3 2 .5 4 0 5.5-1.5"/><path d="M12 11c2-1.5 4-2 6.5-2-1 2-2.5 3.5-4.5 4.5 2 .5 4 .5 6 0-2 2-4.5 3-7 3 1 1.5 2 2.5 3.5 3-2 .5-4 0-5.5-1.5"/><line x1="12" y1="14" x2="12" y2="22"/>'),
        // Pre-roll — joint with smoke wisp
        joint: svgIcon(16, '<path d="M3 14l13-3 4 1.5-1 2.5-4 1L3 16z"/><line x1="14" y1="11.5" x2="15" y2="15.5"/><path d="M19 6c-1 1.5-1 3 0 4.5M21 4c-1.5 2-1.5 4 0 6"/>'),
        // Cartridge — vape pen
        cart: svgIcon(16, '<rect x="9" y="2" width="6" height="10" rx="1"/><path d="M11 12v3h2v-3"/><rect x="8" y="15" width="8" height="7" rx="1.5"/><line x1="10" y1="18" x2="14" y2="18"/>'),
        // Edible — gummy bear silhouette
        cookie: svgIcon(16, '<path d="M8 6a2 2 0 1 1 4 0M12 6a2 2 0 1 1 4 0"/><path d="M6 13c0-3 1.5-5 6-5s6 2 6 5v3c0 2-1.5 3-3 3h-1v-2h-4v2H9c-1.5 0-3-1-3-3z"/><circle cx="10" cy="13" r=".7" fill="currentColor"/><circle cx="14" cy="13" r=".7" fill="currentColor"/>'),
        // Concentrate — diamond/crystal
        diamond: svgIcon(16, '<path d="M6 9l6-6 6 6-6 12z"/><path d="M6 9h12M12 3l-3 6 3 12 3-12z"/>'),
        // Topical — tube of cream
        drop: svgIcon(16, '<path d="M8 4h8l-1 2h-6z"/><rect x="7" y="6" width="10" height="14" rx="2"/><path d="M10 11h4M10 14h4"/>'),
        // Tincture — dropper bottle
        bottle: svgIcon(16, '<rect x="9" y="2" width="6" height="3" rx="0.5"/><path d="M8 5h8l-1 2v12a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2V7z"/><line x1="10" y1="11" x2="14" y2="11"/>'),
        // Beverage — can with tab
        beverage: svgIcon(16, '<rect x="7" y="4" width="10" height="17" rx="1.5"/><path d="M10 4V3h4v1"/><line x1="9" y1="8" x2="15" y2="8"/>'),

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
        const hash = window.location.hash.slice(1) || 'home';
        const parts = hash.split('/');
        let page = parts[0];
        const param = parts[1] || null;

        // Anchor handling: if hash isn't a known page but matches an element ID,
        // find the page that contains it, navigate there, then scroll to the anchor.
        // (This makes #for-dispensaries-claim work — the form lives inside the
        // for-dispensaries page.)
        const knownPages = new Set(['home','dispensaries','dispensary','dispensary-detail','deals','strains','strain','strain-detail','compare','learn','for-dispensaries','dashboard']);
        let anchorId = null;
        if (!knownPages.has(page)) {
            const anchorEl = document.getElementById(hash);
            if (anchorEl) {
                const parentPage = anchorEl.closest('.page');
                if (parentPage) {
                    page = parentPage.id.replace(/^page-/, '');
                    anchorId = hash;
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

        // Fix map: invalidate size when dispensaries page becomes visible
        if ((page === 'dispensaries') && App.mapInstance) {
            setTimeout(() => App.mapInstance.invalidateSize(), 100);
        }
        // Re-render map on first visit to dispensaries
        if (page === 'dispensaries' && !App.mapInstance) {
            setTimeout(() => renderDispensaries(), 50);
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
        renderFeaturedDispensaries();
        renderRecentlyOpened();
        renderTodaysDeals();
        renderTrendingProducts();
        renderPopularStrains();
        renderMNBrands();
        renderComingSoon();
        renderShop();
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
        const container = document.getElementById('featured-dispensaries');
        const featured = TCC.dispensaries
            .filter(d => d.tier !== 'free')
            .sort((a, b) => {
                const tierOrder = { platinum: 0, premium: 1, featured: 2 };
                return (tierOrder[a.tier] || 3) - (tierOrder[b.tier] || 3) || b.tcc_score - a.tcc_score;
            })
            .slice(0, 6);

        container.innerHTML = featured.map(d => dispensaryCard(d)).join('');
    }

    function renderTodaysDeals() {
        const container = document.getElementById('todays-deals');
        const deals = TCC.deals.filter(d => d.featured).slice(0, 6);
        container.innerHTML = deals.map(d => dealCard(d)).join('');
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
        const popular = TCC.strains.slice(0, 8);
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
                            <div class="font-display font-semibold" style="font-size:0.95rem">${b.name}</div>
                            <div class="text-xs text-secondary">${b.location}</div>
                        </div>
                        <span class="tag tag-sm tag-green">${b.type}</span>
                    </div>
                    <div class="text-sm text-secondary" style="line-height:1.5;margin-bottom:0.5rem">${b.desc}</div>
                    <span class="tag tag-sm">${b.specialty}</span>
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
                            <div class="font-display font-semibold" style="font-size:0.95rem">${d.name}</div>
                            <div class="text-xs text-secondary">${d.location}</div>
                        </div>
                        <span class="tag tag-sm tag-amber">${d.status}</span>
                    </div>
                    <div class="text-sm text-secondary" style="line-height:1.5;margin-bottom:0.5rem">${d.desc}</div>
                    ${d.notable ? `<span class="tag tag-sm tag-purple">${d.notable}</span>` : ''}
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
                            <div class="font-display font-semibold" style="font-size:0.95rem">${item.name}</div>
                            <div class="text-xs text-secondary">${item.desc}</div>
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
            results = results.filter(d => d.city === filters.city);
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

        if (filters.sort) {
            switch (filters.sort) {
                case 'score': results.sort((a, b) => b.tcc_score - a.tcc_score); break;
                case 'name': results.sort((a, b) => a.name.localeCompare(b.name)); break;
                case 'reviews': results.sort((a, b) => b.review_count - a.review_count); break;
            }
        } else {
            const tierOrder = { platinum: 0, premium: 1, featured: 2, free: 3 };
            results.sort((a, b) => (tierOrder[a.tier] || 3) - (tierOrder[b.tier] || 3) || b.tcc_score - a.tcc_score);
        }

        // Update count
        const countEl = document.getElementById('disp-count');
        if (countEl) countEl.textContent = `Showing ${results.length} dispensar${results.length === 1 ? 'y' : 'ies'}`;

        if (results.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">${Icons.search}</div>
                    <div class="empty-state-title">No dispensaries found</div>
                    <div class="empty-state-desc">Try adjusting your search or filters</div>
                </div>`;
            return;
        }

        container.innerHTML = results.map(d => dispensaryCard(d)).join('');
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
        }).setView([44.9778, -93.2650], 11);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 19,
        }).addTo(App.mapInstance);

        dispensaries.forEach(d => {
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
                    <strong style="font-size:0.85rem">${d.name}</strong><br>
                    <span style="font-size:0.75rem;color:#888">${d.neighborhood}</span><br>
                    <span style="font-size:0.85rem;color:${color};font-weight:700">TCC ${d.tcc_score}</span>
                </div>
            `);

            marker.on('click', () => navigate('dispensary/' + d.id));
        });
    }

    // ---- RENDER: DISPENSARY DETAIL ----
    function renderDispensaryDetail(id) {
        const d = TCC.getDispensary(id);
        if (!d) {
            navigate('dispensaries');
            return;
        }

        // Banner - show logo image if available
        const bannerEl = document.getElementById('detail-banner');
        bannerEl.style.background = d.gradient;
        const initialEl = document.getElementById('detail-banner-initial');
        const hasImg = d.img && d.img.length > 10 && !d.img.includes('placeholder');
        if (hasImg) {
            initialEl.innerHTML = `<img src="${d.img}" alt="${d.name}" style="max-height:120px;max-width:280px;object-fit:contain;border-radius:12px">`;
        } else {
            initialEl.textContent = d.initial;
        }

        // Info
        document.getElementById('detail-name').textContent = d.name;
        document.getElementById('detail-tagline').textContent = d.tagline;
        document.getElementById('detail-address').innerHTML = `${Icons.pin} ${d.address}`;
        document.getElementById('detail-hours').innerHTML = `${Icons.clock} ${d.hours.note || d.hours.weekday}`;
        document.getElementById('detail-phone').innerHTML = `${Icons.phone} ${d.phone}`;

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
            `<span class="tag tag-sm">${Icons.check} ${f}</span>`
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

        // If no products at all, show a friendly empty-menu state
        const productsContainer = document.getElementById('detail-products');
        const countEl = document.getElementById('detail-product-count');
        const catContainer = document.getElementById('detail-product-cats');

        if (allProducts.length === 0) {
            countEl.textContent = 'Menu coming soon';
            catContainer.innerHTML = '';
            productsContainer.innerHTML = `
                <div class="empty-menu-state">
                    <div class="empty-menu-icon">${Icons.leafLine}</div>
                    <div class="empty-menu-title">Menu data not yet available</div>
                    <div class="empty-menu-desc">We're working on getting ${d.name}'s full menu into TCC. In the meantime, you can visit their site or call ahead.</div>
                    <div class="empty-menu-actions">
                        <a href="${getDispensaryWebsite(d)}" target="_blank" rel="noopener" class="btn btn-primary btn-sm">${isOfficialWebsite(d) ? 'Visit Website &rarr;' : 'Find on Google Maps &rarr;'}</a>
                        <a href="tel:${(d.phone||'').replace(/[^0-9+]/g,'')}" class="btn btn-secondary btn-sm">${Icons.phone} Call</a>
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
                    renderDetailProducts(btn.dataset.cat);
                });
            });
        } else {
            catContainer.innerHTML = '';
        }
        renderDetailProducts('all');

        function renderDetailProducts(catFilter) {
            const filtered = catFilter === 'all' ? allProducts : allProducts.filter(p => p.category === catFilter);
            const countElInner = document.getElementById('detail-product-count');
            countElInner.textContent = `${filtered.length} product${filtered.length !== 1 ? 's' : ''}`;

            document.getElementById('detail-products').innerHTML = filtered.length ? filtered.map(p => {
                const price = p.prices[id];
                const lowest = TCC.getLowestPrice(p);
                const isLowest = lowest && lowest.dispensaryId === id;
                const hasImg = p.image && p.image.length > 10;
                return `<div class="card product-card" onclick="window.location.hash='compare/${p.id}'">
                    <div class="card-body-sm" style="display:flex;gap:0.8rem;align-items:flex-start">
                        ${hasImg ? `<div class="product-card-img" onclick="event.stopPropagation();openLightbox('${p.image}','${p.name.replace(/'/g,"\\'")}','${(p.brand||"").replace(/'/g,"\\'")}','${TCC.formatPrice(TCC.getLowestPrice(p)?.price||0)}','${p.category}','${p.thc||""}')"><img src="${p.image}" alt="${p.name}" loading="lazy" onerror="this.parentElement.style.display='none'"></div>` : ''}
                        <div style="flex:1;min-width:0">
                            <div class="product-card-header">
                                <div style="min-width:0">
                                    <div class="product-card-name">${p.name}</div>
                                    <div class="product-card-brand">${p.brand}${p.weight ? ' &middot; ' + p.weight : ''}</div>
                                </div>
                                <div class="product-card-prices">
                                    <div class="product-card-price-low">${TCC.formatPrice(price)}</div>
                                    ${isLowest ? '<div style="font-size:0.65rem;color:var(--green)">Best price</div>' : ''}
                                </div>
                            </div>
                            <div class="product-card-meta">
                                <span class="tag tag-sm">${catIcons[p.category] || ''} ${p.category}</span>
                                ${p.thc ? `<span class="tag tag-sm">THC ${p.thc}</span>` : ''}
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
                        <span class="review-author">${r.author}</span>
                        <span class="review-date">${r.time || r.date || ''}</span>
                    </div>
                    <div class="review-stars">${'&#9733;'.repeat(r.rating)}${'&#9734;'.repeat(5 - r.rating)}</div>
                    <div class="review-text">${r.text}</div>
                </div>
            `).join('')}
        ` : '<div class="empty-state"><div class="empty-state-desc">No reviews yet</div></div>';

        // Deals
        const deals = TCC.getDealsForDispensary(id);
        document.getElementById('detail-deals').innerHTML = deals.length ? deals.map(dl => dealCard(dl)).join('') :
            '<div class="empty-state"><div class="empty-state-desc">No active deals</div></div>';

        // Reset tabs
        switchDetailTab('products');
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
        let deals = [...TCC.deals];

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
            `<span class="tag tag-green">${e}</span>`
        ).join('');

        document.getElementById('strain-detail-flavors').innerHTML = s.flavors.map(f =>
            `<span class="tag">${f}</span>`
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

        // Simulated analytics (based on score and reviews for demo)
        const baseViews = d.review_count * 12 + d.tcc_score * 3;
        const baseClicks = Math.floor(baseViews * 0.18);
        document.getElementById('dash-views').textContent = baseViews.toLocaleString();
        document.getElementById('dash-clicks').textContent = baseClicks.toLocaleString();

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
                    <span class="review-author">${r.author}</span>
                    <span class="review-date">${r.date}</span>
                </div>
                <div class="review-stars">${'&#9733;'.repeat(r.rating)}${'&#9734;'.repeat(5 - r.rating)}</div>
                <div class="review-text">${r.text}</div>
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
                                    <div class="text-sm font-semibold">${c.name}</div>
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
            contactForm.onsubmit = (e) => {
                e.preventDefault();
                const formData = new FormData(contactForm);
                const data = Object.fromEntries(formData);
                data.dispensary = d.name;
                data.dispensary_id = d.id;
                data.timestamp = new Date().toISOString();

                // Save locally + fire tracking
                const claims = JSON.parse(localStorage.getItem('tcc-claims') || '[]');
                claims.push(data);
                localStorage.setItem('tcc-claims', JSON.stringify(claims));

                if (typeof gtag === 'function') gtag('event', 'generate_lead', { event_category: 'dispensary', event_label: 'claim_form' });
                if (typeof fbq === 'function') fbq('track', 'Lead', { content_name: 'Dispensary Claim: ' + d.name });

                contactForm.style.display = 'none';
                document.getElementById('dash-contact-success').style.display = 'block';

                // Also send via mailto as backup
                const subject = encodeURIComponent('Dispensary Claim: ' + d.name);
                const body = encodeURIComponent(`Name: ${data.name}\nRole: ${data.role}\nEmail: ${data.email}\nPhone: ${data.phone || 'N/A'}\nDispensary: ${d.name}\nMessage: ${data.message || 'N/A'}`);
                window.open(`mailto:hello@twincitycannabis.com?subject=${subject}&body=${body}`, '_blank');
            };
        }

        // Traffic chart
        setTimeout(() => {
            const canvas = document.getElementById('dash-traffic-chart');
            if (!canvas || typeof Chart === 'undefined') return;
            if (App.chartInstance) App.chartInstance.destroy();

            const days = Array.from({length: 30}, (_, i) => `${i + 1}`);
            const viewData = days.map(() => Math.floor(baseViews / 30 * (0.7 + Math.random() * 0.6)));

            App.chartInstance = new Chart(canvas, {
                type: 'bar',
                data: {
                    labels: days,
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
                        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#555', font: { size: 10 } }, beginAtZero: true }
                    }
                }
            });
        }, 100);
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
                    let sub = `${product.brand || 'Unknown brand'}${product.weight ? ' &middot; ' + product.weight : ''} &middot; Available at ${numDisps} dispensar${numDisps === 1 ? 'y' : 'ies'}`;
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
    };

    // Categories shown in the browse UI (excludes accessories/apparel/seeds/etc.)
    const BROWSE_CATEGORIES = ['flower', 'edible', 'cartridge', 'pre-roll', 'beverage', 'tincture', 'topical', 'concentrate'];

    function getBrowseFiltered() {
        let list = TCC.products.filter(p => BROWSE_CATEGORIES.includes(p.category));

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

        // Sort
        switch (Browse.sort) {
            case 'price-asc':
                list.sort((a, b) => (TCC.getLowestPrice(a)?.price || 9e9) - (TCC.getLowestPrice(b)?.price || 9e9));
                break;
            case 'price-desc':
                list.sort((a, b) => (TCC.getLowestPrice(b)?.price || 0) - (TCC.getLowestPrice(a)?.price || 0));
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
                <span><strong>${total.toLocaleString()}</strong> ${total === 1 ? 'product' : 'products'}${Browse.query ? ` matching "${Browse.query}"` : ''}</span>
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
            `<button class="browse-pill ${Browse.category === c.id ? 'active' : ''}" data-cat="${c.id}">${c.name}</button>`
        ).join('');
        pillsContainer.querySelectorAll('.browse-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                Browse.category = btn.dataset.cat;
                Browse.page = 1;
                const sel = document.getElementById('browse-category');
                if (sel) sel.value = Browse.category;
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

        catSelect.addEventListener('change', (e) => {
            Browse.category = e.target.value;
            Browse.page = 1;
            renderCompareDefault();
        });

        sortSelect.addEventListener('change', (e) => {
            Browse.sort = e.target.value;
            Browse.page = 1;
            renderCompareDefault();
        });
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
                ${product.image ? `<div style="width:140px;height:140px;border-radius:var(--radius-lg);overflow:hidden;background:var(--bg-card);border:1px solid var(--border);flex-shrink:0;display:flex;align-items:center;justify-content:center;padding:8px;cursor:pointer" onclick="openLightbox('${product.image}','${product.name.replace(/'/g,"\\'")}','${(product.brand||"").replace(/'/g,"\\'")}','${TCC.formatPrice(lowest.price)}','${product.category}','${product.thc||""}')">
                    <img src="${product.image}" alt="${product.name}" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:var(--radius-sm)" onerror="this.parentElement.style.display='none'">
                </div>` : ''}
                <div style="flex:1;min-width:200px">
                    <h2 class="font-display font-bold text-2xl tracking-tight">${product.name}</h2>
                    <div class="text-secondary text-sm" style="margin-top:0.3rem">${product.brand}${product.weight ? ' &middot; ' + product.weight : ''} ${strain ? '&bull; ' + strain.name : ''}</div>
                    <div style="display:flex;gap:0.4rem;margin-top:0.6rem;flex-wrap:wrap">
                        <span class="tag">${product.category}</span>
                        ${product.thc ? `<span class="tag">THC ${product.thc}</span>` : ''}
                        ${product.cbd ? `<span class="tag">CBD ${product.cbd}</span>` : ''}
                        ${strain ? `<span class="tag strain-tag-${strain.type}">${strain.type}</span>` : ''}
                        <span class="tag tag-blue">${entries.length} dispensar${entries.length === 1 ? 'y' : 'ies'}</span>
                    </div>
                </div>
                <div style="text-align:right;flex-shrink:0">
                    <div class="text-sm text-muted">Best price</div>
                    <div class="font-display font-bold text-3xl text-green">${TCC.formatPrice(lowest.price)}</div>
                    <div class="text-xs text-secondary">at ${TCC.getDispensary(lowest.dispensaryId)?.name || 'Unknown'}</div>
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
                                    <span style="font-weight:600">${disp.name}</span>
                                    ${disp.tier !== 'free' ? `<span class="tag tag-sm" style="margin-left:0.3rem;background:${TCC.getTierColor(disp.tier)};color:${disp.tier === 'platinum' ? '#0a0a0a' : '#fff'};border:none">${TCC.getTierLabel(disp.tier)}</span>` : ''}
                                </td>
                                <td class="text-secondary">${disp.neighborhood}</td>
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
        const tierBadge = d.tier !== 'free'
            ? `<span class="dispensary-card-tier" style="background:${TCC.getTierColor(d.tier)};color:${d.tier === 'platinum' ? '#0a0a0a' : '#fff'}">${TCC.getTierLabel(d.tier)}</span>`
            : '';
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
            ? `<img src="${d.img}" alt="${d.name}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'dispensary-card-avatar-fallback\\' style=\\'background:${d.gradient}\\'>${d.initial}</div>'">`
            : `<div class="dispensary-card-avatar-fallback" style="background:${d.gradient}">${d.initial}</div>`;

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
            `<span class="tag tag-sm">${f}</span>`
        ).join('');

        return `<div class="card dispensary-card ${variant === 'grid' ? 'dispensary-card-grid' : ''}" onclick="window.location.hash='dispensary/${d.id}'">
            <div class="card-body">
                <div class="dispensary-card-avatar">
                    ${avatar}
                </div>
                <div class="dispensary-card-info">
                    <div class="dispensary-card-header">
                        <div style="min-width:0">
                            <div class="dispensary-card-name">${d.name}</div>
                            <div class="dispensary-card-loc">${Icons.pin} ${d.neighborhood || d.city}${d.neighborhood && d.neighborhood !== d.city ? ' &bull; ' + d.city : ''}</div>
                        </div>
                        <div class="dispensary-card-score">
                            <span class="dispensary-card-score-num" style="background:${scoreColor}">${d.tcc_score}</span>
                        </div>
                    </div>
                    <div class="dispensary-card-rating">
                        ${gRating > 0 ? `<span class="stars">${stars}</span><span class="rating-num">${gRating.toFixed(1)}</span><span class="count">(${gCount.toLocaleString()})</span>` : '<span class="text-muted text-xs">No reviews yet</span>'}
                        ${statusBadge}
                        ${tierBadge}
                        ${justOpenedBadge}
                    </div>
                    <div class="dispensary-card-meta">
                        <span>${Icons.clock} ${d.hours?.note || d.hours?.weekday || 'Check hours'}</span>
                        ${productCount > 0 ? `<span>${Icons.leaf} ${productCount} products</span>` : ''}
                        ${d.verified ? `<span>${Icons.verified} Verified</span>` : ''}
                    </div>
                    ${dealHtml}
                    <div class="dispensary-card-actions">
                        <span class="btn btn-sm btn-primary">View Menu</span>
                        <span class="btn btn-sm btn-secondary" onclick="event.stopPropagation();window.open('${getDispensaryWebsite(d)}','_blank')">${isOfficialWebsite(d) ? 'Website' : 'Find on Maps'}</span>
                    </div>
                </div>
            </div>
        </div>`;
    }

    function productCard(p) {
        const range = TCC.getPriceRange(p);
        const strain = p.strain ? TCC.getStrain(p.strain) : null;
        const strainTag = strain ? `<span class="tag tag-sm strain-tag-${strain.type}">${strain.type}</span>` : '';
        const numDisps = Object.keys(p.prices).length;
        const savings = range.high && range.low ? range.high - range.low : 0;

        // Product image
        const hasImg = p.image && p.image.length > 10;
        const imgHtml = hasImg
            ? `<div class="product-card-img" onclick="event.stopPropagation();openLightbox('${p.image}','${p.name.replace(/'/g,"\\'")}','${(p.brand||"").replace(/'/g,"\\'")}','${TCC.formatPrice(TCC.getLowestPrice(p)?.price||0)}','${p.category}','${p.thc||""}')"><img src="${p.image}" alt="${p.name}" loading="lazy" onerror="this.parentElement.style.display='none'"></div>`
            : '';

        return `<div class="card product-card" onclick="window.location.hash='compare/${p.id}'">
            <div class="card-body-sm" style="display:flex;gap:0.8rem;align-items:flex-start">
                ${imgHtml}
                <div style="flex:1;min-width:0">
                    <div class="product-card-header">
                        <div style="min-width:0">
                            <div class="product-card-name">${p.name}</div>
                            <div class="product-card-brand">${p.brand}${p.weight ? ' &middot; ' + p.weight : ''}</div>
                        </div>
                        <div class="product-card-prices">
                            <div class="product-card-price-low">${TCC.formatPrice(range.low)}</div>
                            ${range.low !== range.high ? `<div class="product-card-price-range">to ${TCC.formatPrice(range.high)}</div>` : ''}
                        </div>
                    </div>
                    <div class="product-card-meta">
                        <span class="tag tag-sm">${catIcons[p.category] || ''} ${p.category}</span>
                        ${p.thc ? `<span class="tag tag-sm">THC ${p.thc}</span>` : ''}
                        ${strainTag}
                        ${numDisps > 1 ? `<span class="tag tag-sm tag-blue">${numDisps} dispensaries</span>` : ''}
                        ${savings > 3 ? `<span class="tag tag-sm tag-green">Save $${savings.toFixed(0)}</span>` : ''}
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
                <div class="deal-card-title">${d.title}</div>
                <div class="deal-card-dispensary">${disp ? disp.name + ' &bull; ' + disp.neighborhood : ''}</div>
                ${d.salePrice ? `<div class="deal-card-pricing">
                    <span class="deal-card-sale">${TCC.formatPrice(d.salePrice)}</span>
                    ${d.originalPrice ? `<span class="deal-card-original">${TCC.formatPrice(d.originalPrice)}</span>` : ''}
                </div>` : ''}
                ${d.expires ? `<div class="deal-card-expires">Expires ${d.expires}</div>` : ''}
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
                    <div class="strain-card-name">${s.name}</div>
                    <span class="tag strain-tag-${s.type} strain-card-type">${s.type}</span>
                </div>
                <div class="strain-card-desc">${s.desc}</div>
                <div class="strain-card-effects">
                    ${s.effects.slice(0, 3).map(e => `<span class="tag tag-sm tag-green">${e}</span>`).join('')}
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
                        <div class="search-dropdown-item-icon" style="background:${d.gradient}">${d.initial}</div>
                        <div class="search-dropdown-item-info">
                            <div class="search-dropdown-item-name">${d.name}</div>
                            <div class="search-dropdown-item-detail">${d.neighborhood} &bull; TCC ${d.tcc_score}</div>
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
                            <div class="search-dropdown-item-name">${p.name}</div>
                            <div class="search-dropdown-item-detail">${p.brand}</div>
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
                            <div class="search-dropdown-item-name">${s.name}</div>
                            <div class="search-dropdown-item-detail">${s.type} &bull; THC ${s.thc}</div>
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

        // Quick category clicks
        document.querySelectorAll('.quick-cat').forEach(el => {
            el.addEventListener('click', () => {
                const cat = el.dataset.category;
                navigate('compare');
                // Wait for page to render, then filter would happen
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

        // Alert form (consumer email signup) — real HTML form posts directly
        // to Kit via target="_blank". We don't preventDefault so the browser
        // performs a real POST submission. We just track the conversion event
        // and swap to a success message after a short delay.
        const alertForm = document.getElementById('alert-form');
        if (alertForm) {
            alertForm.addEventListener('submit', () => {
                const email = alertForm.querySelector('input[name="email_address"]')?.value;
                if (!email) return;

                // Save locally as backup so you can verify signups locally
                try {
                    const signups = JSON.parse(localStorage.getItem('tcc-alerts') || '[]');
                    signups.push({ email, timestamp: new Date().toISOString(), type: 'alert' });
                    localStorage.setItem('tcc-alerts', JSON.stringify(signups));
                } catch (err) {}

                // Conversion tracking
                if (typeof gtag === 'function') gtag('event', 'generate_lead', { event_category: 'engagement', event_label: 'price_alert_signup' });
                if (typeof fbq === 'function') fbq('track', 'Lead', { content_name: 'TCC Price Alerts' });

                // Swap to success message after a beat (the real form post still goes through)
                setTimeout(() => {
                    alertForm.style.display = 'none';
                    const successEl = document.getElementById('alert-success');
                    if (successEl) successEl.style.display = 'block';
                }, 400);
            });
        }

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

    function applyDispFilters() {
        const search = document.getElementById('disp-search')?.value || '';
        const city = document.getElementById('disp-city')?.value || 'all';
        const sort = document.getElementById('disp-sort')?.value || 'score';
        const activeToggle = document.querySelector('#disp-toggles .filter-toggle.active');
        const toggle = activeToggle ? activeToggle.dataset.filter : 'all';
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

    function init() {
        updateHeroCounts();
        injectDataIcons();
        renderHome();
        renderDispensaries();
        renderDeals();
        renderStrains();
        renderCompare();
        bindBrowseControls();
        bindEvents();
        route();
    }

    // Wait for DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose for hash routing on compare
    window.addEventListener('hashchange', () => {
        const hash = window.location.hash.slice(1);
        if (hash.startsWith('compare/')) {
            const productId = hash.split('/')[1];
            renderCompare(productId);
        } else if (hash === 'compare') {
            renderCompare();
        }
    });

})();
