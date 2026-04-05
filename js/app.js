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
    const Icons = {
        search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>',
        pin: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
        clock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
        star: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
        phone: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
        check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>',
        arrow: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>',
        trending: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
        tag: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
        verified: '<svg width="14" height="14" viewBox="0 0 24 24" fill="var(--blue)" stroke="white" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>',
        leaf: '&#127807;',
        joint: '&#128684;',
        cart: '&#128267;',
        cookie: '&#127850;',
        diamond: '&#128142;',
        drop: '&#128167;',
        bottle: '&#129514;',
        fire: '&#128293;',
        sparkle: '&#10024;',
        deal: '&#127381;',
        chart: '&#128200;',
        globe: '&#127760;',
    };

    const catIcons = { flower: Icons.leaf, 'pre-roll': Icons.joint, cartridge: Icons.cart, edible: Icons.cookie, concentrate: Icons.diamond, topical: Icons.drop, tincture: Icons.bottle, beverage: '&#127864;' };

    // ---- ROUTING ----
    function route() {
        const hash = window.location.hash.slice(1) || 'home';
        const parts = hash.split('/');
        const page = parts[0];
        const param = parts[1] || null;

        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

        const navMap = { home: 'nav-home', dispensaries: 'nav-dispensaries', deals: 'nav-deals', strains: 'nav-strains', compare: 'nav-compare' };

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
            default:
                showPage(page);
                if (navMap[page]) {
                    const navEl = document.getElementById(navMap[page]);
                    if (navEl) navEl.classList.add('active');
                }
        }

        App.currentPage = page;
        window.scrollTo(0, 0);
        closeSearchDropdown();
        closeMobileMenu();

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
        renderTodaysDeals();
        renderTrendingProducts();
        renderPopularStrains();
        renderMNBrands();
        renderComingSoon();
        renderShop();
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
        if (filters.sort) {
            switch (filters.sort) {
                case 'score': results.sort((a, b) => b.tcc_score - a.tcc_score); break;
                case 'name': results.sort((a, b) => a.name.localeCompare(b.name)); break;
                case 'reviews': results.sort((a, b) => b.review_count - a.review_count); break;
            }
        } else {
            // Default: tier priority then score
            const tierOrder = { platinum: 0, premium: 1, featured: 2, free: 3 };
            results.sort((a, b) => (tierOrder[a.tier] || 3) - (tierOrder[b.tier] || 3) || b.tcc_score - a.tcc_score);
        }

        if (results.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="grid-column: 1/-1">
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

        // Banner
        document.getElementById('detail-banner').style.background = d.gradient;
        document.getElementById('detail-banner-initial').textContent = d.initial;

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

        // Products
        const products = TCC.getProductsForDispensary(id);
        document.getElementById('detail-products').innerHTML = products.length ? products.map(p => {
            const price = p.prices[id];
            const lowest = TCC.getLowestPrice(p);
            const isLowest = lowest.dispensaryId === id;
            return `<div class="card product-card" onclick="window.location.hash='compare/${p.id}'">
                <div class="card-body-sm">
                    <div class="product-card-header">
                        <div>
                            <div class="product-card-name">${p.name}</div>
                            <div class="product-card-brand">${p.brand}</div>
                        </div>
                        <div class="product-card-prices">
                            <div class="product-card-price-low">${TCC.formatPrice(price)}</div>
                            ${isLowest ? '<div style="font-size:0.65rem;color:var(--green)">Lowest price</div>' : ''}
                        </div>
                    </div>
                    <div class="product-card-meta">
                        <span class="tag tag-sm">${p.category}</span>
                        <span class="tag tag-sm">THC ${p.thc}</span>
                    </div>
                </div>
            </div>`;
        }).join('') : '<div class="empty-state"><div class="empty-state-desc">No products listed yet</div></div>';

        // Reviews
        const reviews = TCC.getReviewsForDispensary(id);
        document.getElementById('detail-review-count').textContent = `${d.review_count} reviews`;
        document.getElementById('detail-reviews').innerHTML = reviews.length ? reviews.map(r => `
            <div class="review-item">
                <div class="review-header">
                    <span class="review-author">${r.author}</span>
                    <span class="review-date">${r.date}</span>
                </div>
                <div class="review-stars">${'&#9733;'.repeat(r.rating)}${'&#9734;'.repeat(5 - r.rating)}</div>
                <div class="review-text">${r.text}</div>
            </div>
        `).join('') : '<div class="empty-state"><div class="empty-state-desc">No reviews yet</div></div>';

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
    function renderCompare(productId) {
        const container = document.getElementById('compare-content');

        if (productId) {
            const product = TCC.getProduct(productId);
            if (!product) { renderCompareDefault(); return; }
            renderCompareProduct(product);
        } else {
            renderCompareDefault();
        }
    }

    function renderCompareDefault() {
        const container = document.getElementById('compare-content');
        // Show a product selector
        const categories = [...new Set(TCC.products.map(p => p.category))];

        container.innerHTML = `
            <div style="margin-bottom:2rem">
                <p class="section-desc">Select a product to compare prices across all dispensaries.</p>
            </div>
            ${categories.map(cat => {
                const products = TCC.getProductsByCategory(cat);
                const catObj = TCC.categories.find(c => c.id === cat);
                return `
                    <div style="margin-bottom:2rem">
                        <h3 class="font-display font-semibold" style="margin-bottom:1rem;display:flex;align-items:center;gap:0.5rem">
                            <span>${catIcons[cat] || ''}</span> ${catObj ? catObj.name : cat}
                        </h3>
                        <div class="home-grid-2">
                            ${products.map(p => productCard(p)).join('')}
                        </div>
                    </div>`;
            }).join('')}`;
    }

    function renderCompareProduct(product) {
        const container = document.getElementById('compare-content');
        const strain = product.strain ? TCC.getStrain(product.strain) : null;
        const lowest = TCC.getLowestPrice(product);
        const highest = TCC.getHighestPrice(product);
        const entries = Object.entries(product.prices).sort((a, b) => a[1] - b[1]);

        container.innerHTML = `
            <div style="margin-bottom:2rem">
                <a href="#compare" style="color:var(--text-secondary);font-size:0.85rem">&larr; All products</a>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:1rem;margin-bottom:2rem">
                <div>
                    <h2 class="font-display font-bold text-2xl tracking-tight">${product.name}</h2>
                    <div class="text-secondary text-sm" style="margin-top:0.3rem">${product.brand} ${strain ? '&bull; ' + strain.name : ''}</div>
                    <div style="display:flex;gap:0.4rem;margin-top:0.6rem">
                        <span class="tag">${product.category}</span>
                        <span class="tag">THC ${product.thc}</span>
                        ${strain ? `<span class="tag strain-tag-${strain.type}">${strain.type}</span>` : ''}
                    </div>
                </div>
                <div style="text-align:right">
                    <div class="text-sm text-muted">Best price</div>
                    <div class="font-display font-bold text-3xl text-green">${TCC.formatPrice(lowest.price)}</div>
                    <div class="text-xs text-secondary">at ${TCC.getDispensary(lowest.dispensaryId).name}</div>
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
                                <td class="text-muted">${isLowest ? '<span class="tag tag-sm tag-green">Best price</span>' : '+$' + diff}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>

            <div class="price-chart-container">
                <div class="price-chart-header">
                    <span class="price-chart-title">Price History (8 weeks)</span>
                    <span class="tag tag-sm tag-green">${Icons.trending} Trending down</span>
                </div>
                <div style="position:relative;height:220px"><canvas id="price-chart"></canvas></div>
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
    function dispensaryCard(d) {
        const tierBadge = d.tier !== 'free'
            ? `<span class="dispensary-card-tier" style="background:${TCC.getTierColor(d.tier)};color:${d.tier === 'platinum' ? '#0a0a0a' : '#fff'}">${TCC.getTierLabel(d.tier)}</span>`
            : '';
        const scoreColor = TCC.getScoreColor(d.tcc_score);

        return `<div class="card dispensary-card" onclick="window.location.hash='dispensary/${d.id}'">
            <div class="dispensary-card-banner" style="background:${d.gradient}">
                <span class="dispensary-card-initial">${d.initial}</span>
                ${tierBadge}
            </div>
            <div class="card-body" style="position:relative">
                <div class="dispensary-card-score" style="background:${scoreColor}">${d.tcc_score}</div>
                <div class="dispensary-card-name">${d.name}</div>
                <div class="dispensary-card-loc">${d.neighborhood} &bull; ${d.city}</div>
                <div class="dispensary-card-meta">
                    <span>${Icons.star} ${d.review_count} reviews</span>
                    <span>${Icons.clock} ${d.hours.weekday}</span>
                    ${d.verified ? `<span>${Icons.verified} Verified</span>` : ''}
                </div>
            </div>
        </div>`;
    }

    function productCard(p) {
        const range = TCC.getPriceRange(p);
        const strain = p.strain ? TCC.getStrain(p.strain) : null;
        const strainTag = strain ? `<span class="tag tag-sm strain-tag-${strain.type}">${strain.type}</span>` : '';

        return `<div class="card product-card" onclick="window.location.hash='compare/${p.id}'">
            <div class="card-body-sm">
                <div class="product-card-header">
                    <div>
                        <div class="product-card-name">${p.name}</div>
                        <div class="product-card-brand">${p.brand}</div>
                    </div>
                    <div class="product-card-prices">
                        <div class="product-card-price-low">${TCC.formatPrice(range.low)}</div>
                        ${range.low !== range.high ? `<div class="product-card-price-range">to ${TCC.formatPrice(range.high)}</div>` : ''}
                    </div>
                </div>
                <div class="product-card-meta">
                    <span class="tag tag-sm">${catIcons[p.category] || ''} ${p.category}</span>
                    <span class="tag tag-sm">THC ${p.thc}</span>
                    ${strainTag}
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

        // Alert form — submits to Kit (ConvertKit) or falls back to localStorage
        const alertForm = document.getElementById('alert-form');
        if (alertForm) {
            alertForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = alertForm.querySelector('input[name="email_address"]').value;
                const formId = alertForm.dataset.svForm;
                const btn = alertForm.querySelector('button');
                btn.textContent = 'Signing up...';
                btn.disabled = true;

                // Try Kit API first
                if (formId && formId !== 'YOUR_FORM_ID') {
                    try {
                        await fetch(`https://api.kit.com/forms/${formId}/subscribe`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email_address: email }),
                        });
                    } catch (err) {
                        console.log('Kit API fallback to localStorage', err);
                    }
                }

                // Always save locally as backup
                const signups = JSON.parse(localStorage.getItem('tcc-alerts') || '[]');
                signups.push({ email, timestamp: new Date().toISOString(), type: 'alert' });
                localStorage.setItem('tcc-alerts', JSON.stringify(signups));

                alertForm.style.display = 'none';
                document.getElementById('alert-success').style.display = 'block';
            });
        }

        // Intersection observer for animations
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) entry.target.classList.add('visible');
            });
        }, { threshold: 0.1 });

        document.querySelectorAll('.fade-in, .stagger').forEach(el => observer.observe(el));
    }

    function applyDispFilters() {
        const search = document.getElementById('disp-search')?.value || '';
        const city = document.getElementById('disp-city')?.value || 'all';
        const sort = document.getElementById('disp-sort')?.value || 'score';
        renderDispensaries({ search, city, sort });
    }

    function applyStrainFilters() {
        const search = document.getElementById('strain-search')?.value || '';
        const type = document.getElementById('strain-type')?.value || 'all';
        renderStrains({ search, type });
    }

    // ---- INIT ----
    function init() {
        renderHome();
        renderDispensaries();
        renderDeals();
        renderStrains();
        renderCompare();
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
