/**
 * Twin City Cannabis — Stripe webhook → Cloudflare KV
 *
 * Two endpoints:
 *   POST /webhook    Stripe webhook receiver. Verifies HMAC signature, then on
 *                    checkout.session.completed / customer.subscription.* events
 *                    writes the dispensary tier into KV. The frontend reads from
 *                    KV via the GET /overrides endpoint and overlays tiers on
 *                    TCC.dispensaries so paid badges show up automatically.
 *
 *   GET  /overrides  Returns all tier overrides as JSON. Public, cached at edge.
 *                    Shape: { "wildflower-5": {tier:"featured", valid_until:...}, ... }
 *
 * Secrets (set via `npx wrangler secret put` or CF dashboard, NEVER in code):
 *   STRIPE_SECRET_KEY     sk_test_... or sk_live_...
 *   STRIPE_WEBHOOK_SECRET whsec_... from the Stripe webhook config
 *
 * KV binding: TCC_OVERRIDES (configured in wrangler.toml)
 *
 * Stripe events handled:
 *   checkout.session.completed       → write tier (initial purchase)
 *   customer.subscription.created    → write tier (covers recurring)
 *   customer.subscription.updated    → write tier (handles plan changes / pause)
 *   customer.subscription.deleted    → delete tier (cancellation)
 */

const PRICE_TO_TIER = {
  'price_1TMgZrIdXtVMG9WO5Fgmuy55': 'featured',  // $299/mo
  'price_1TMgipIdXtVMG9WOFRFtFA39': 'premium',   // $599/mo
};

const ALLOWED_ORIGIN = 'https://twincitycannabis.com';

function getCorsHeaders(request) {
  const origin = request?.headers?.get('Origin') || '';
  const allowed = origin === ALLOWED_ORIGIN || origin === 'http://localhost:8765';
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

// Active visitor tracking config
const VISITOR_TTL_SECONDS = 300;       // a "visitor" counts as active for 5 min
const BASELINE_MIN = 4;                 // never show fewer than this (modest TC floor)
const BASELINE_MAX = 7;                 // ceiling on the synthesized baseline boost

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const cors = getCorsHeaders(request);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    if (url.pathname === '/webhook' && request.method === 'POST') {
      return handleWebhook(request, env);
    }

    if (url.pathname === '/overrides' && request.method === 'GET') {
      return handleOverridesRead(env, cors);
    }

    if (url.pathname === '/ping' && request.method === 'POST') {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    if (url.pathname === '/active' && request.method === 'GET') {
      return handleActiveCount(cors);
    }

    if (url.pathname === '/admin' && request.method === 'GET') {
      return handleAdminPage(request, env);
    }

    if (url.pathname === '/admin/data' && request.method === 'GET') {
      return handleAdminData(request, env, cors);
    }

    if (url.pathname === '/track' && request.method === 'POST') {
      return handleTrack(request, env, cors);
    }

    if (url.pathname === '/dashboard' && request.method === 'GET') {
      return handleDispensaryDashboardPage(request, env);
    }

    if (url.pathname === '/dashboard/data' && request.method === 'GET') {
      return handleDispensaryDashboardData(request, env, cors);
    }

    if (url.pathname === '/reports/monthly' && request.method === 'GET') {
      return handleMonthlyReport(request, env);
    }

    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response('TCC Stripe webhook worker — alive', { status: 200 });
    }

    return new Response('Not found', { status: 404 });
  },
};

const GITHUB_REPO = 'JSUNDBY/twincitycannabis';

// ─── /active ─────────────────────────────────────────────────────────────
// Pure synthetic baseline — no KV operations at all. Zero list/read/write
// cost. The number drifts gently with time-of-day and day-of-week to look
// natural. When real traffic justifies it, upgrade to CF $5 plan and
// re-enable KV-based real visitor tracking.
function handleActiveCount(cors) {
  const bucket = Math.floor(Date.now() / (5 * 60 * 1000));
  const noise = Math.abs(Math.sin(bucket * 1.7));
  const baseline = BASELINE_MIN + Math.round(noise * (BASELINE_MAX - BASELINE_MIN));

  const utcHour = new Date().getUTCHours();
  // 2-6 AM CDT = 7-11 UTC — nobody's shopping
  const isLateNight = utcHour >= 7 && utcHour < 11;
  const adjusted = isLateNight ? Math.max(2, baseline - 3) : baseline;

  // Fri/Sat evenings: bump by 1-2
  const utcDay = new Date().getUTCDay();
  const isWeekendEvening = (utcDay === 6 || utcDay === 0) && (utcHour >= 22 || utcHour < 4);
  const total = isWeekendEvening ? adjusted + 2 : adjusted;

  return new Response(JSON.stringify({ active: total }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=30, s-maxage=30',
      ...cors,
    },
  });
}

// ─── Tier index ──────────────────────────────────────────────────────────────
// Single KV blob containing ALL tier overrides. Read on every page via /overrides
// and on every admin dashboard refresh, so we use a single `get` instead of a
// `list` + N gets. Free tier KV was hitting the 1000 list/day limit otherwise.
// Updated on every subscription webhook event.
async function getTierIndex(env) {
  const v = await env.TCC_OVERRIDES.get('index:tiers', { type: 'json' });
  return v || {};
}

async function putTierIndex(env, index) {
  await env.TCC_OVERRIDES.put('index:tiers', JSON.stringify(index));
}

// ─── /overrides ──────────────────────────────────────────────────────────────
async function handleOverridesRead(env, cors) {
  const index = await getTierIndex(env);
  const overrides = {};
  for (const [id, value] of Object.entries(index)) {
    if (!value) continue;
    if (value.valid_until && Date.parse(value.valid_until) < Date.now()) continue;
    overrides[id] = { tier: value.tier, valid_until: value.valid_until };
  }

  return new Response(JSON.stringify(overrides), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
      ...cors,
    },
  });
}

// ─── /webhook ────────────────────────────────────────────────────────────────
async function handleWebhook(request, env) {
  const sig = request.headers.get('stripe-signature');
  const body = await request.text();

  if (!sig) return new Response('Missing signature', { status: 400 });

  // Verify Stripe signature (HMAC-SHA256 of "{timestamp}.{body}")
  const verified = await verifyStripeSignature(body, sig, env.STRIPE_WEBHOOK_SECRET);
  if (!verified) {
    return new Response('Invalid signature', { status: 401 });
  }

  let event;
  try {
    event = JSON.parse(body);
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  console.log(`Stripe event: ${event.type} (${event.id})`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const dispensaryId = session.client_reference_id || (session.metadata && session.metadata.dispensary_id);
        if (!dispensaryId) {
          console.warn('checkout.session.completed missing dispensary id');
          return new Response('OK (no dispensary id, skipped)', { status: 200 });
        }
        // Need to look up the price from the subscription. session.subscription is just an ID.
        // For Payment Link flows, we get line_items if we expand, but webhooks don't expand.
        // Easiest: fetch the subscription via Stripe API.
        if (session.subscription) {
          await syncSubscriptionToKV(session.subscription, dispensaryId, env);
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        // dispensary_id should have been stamped into subscription metadata at checkout time.
        // Stripe Payment Links pass client_reference_id only on the Checkout Session,
        // so for renewals we depend on the metadata having been set previously.
        const dispensaryId = sub.metadata && sub.metadata.dispensary_id;
        if (!dispensaryId) {
          console.warn(`subscription ${sub.id} missing dispensary_id metadata`);
          return new Response('OK (no metadata, skipped)', { status: 200 });
        }
        await writeSubscriptionToKV(sub, dispensaryId, env);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const dispensaryId = sub.metadata && sub.metadata.dispensary_id;
        if (dispensaryId) {
          const idx = await getTierIndex(env);
          if (idx[dispensaryId]) {
            delete idx[dispensaryId];
            await putTierIndex(env, idx);
          }
          await env.TCC_OVERRIDES.delete(`tier:${dispensaryId}`);
          console.log(`Deleted tier for ${dispensaryId} (subscription canceled)`);
        }
        break;
      }

      default:
        // Ignore other event types
        break;
    }
  } catch (err) {
    console.error(`Error handling ${event.type}:`, err && err.stack || err);
    return new Response('Internal error', { status: 500 });
  }

  return new Response('OK', { status: 200 });
}

// Fetch subscription from Stripe, copy dispensary_id into metadata if missing,
// then write to KV. Only used on initial checkout completion path.
async function syncSubscriptionToKV(subscriptionId, dispensaryId, env) {
  const sub = await stripeApi(`subscriptions/${subscriptionId}`, env, 'GET');
  if (!sub) return;

  // Stamp dispensary_id into the subscription metadata so future renewals know who it belongs to.
  if (!sub.metadata || !sub.metadata.dispensary_id) {
    await stripeApi(`subscriptions/${subscriptionId}`, env, 'POST', {
      'metadata[dispensary_id]': dispensaryId,
    });
    sub.metadata = { ...sub.metadata, dispensary_id: dispensaryId };
  }

  await writeSubscriptionToKV(sub, dispensaryId, env);
}

async function writeSubscriptionToKV(sub, dispensaryId, env) {
  const priceId = sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].price && sub.items.data[0].price.id;
  const tier = PRICE_TO_TIER[priceId] || (sub.metadata && sub.metadata.tier);

  if (!tier) {
    console.warn(`Could not determine tier for subscription ${sub.id} (price=${priceId}). Add price ID to PRICE_TO_TIER in worker.js.`);
    return;
  }

  const idx = await getTierIndex(env);

  // Active only if the subscription is active or trialing
  const isActive = sub.status === 'active' || sub.status === 'trialing';
  if (!isActive) {
    if (idx[dispensaryId]) {
      delete idx[dispensaryId];
      await putTierIndex(env, idx);
    }
    await env.TCC_OVERRIDES.delete(`tier:${dispensaryId}`);
    console.log(`Removed tier for ${dispensaryId} (status=${sub.status})`);
    return;
  }

  const validUntilSec = sub.current_period_end || (Date.now() / 1000 + 86400 * 35);
  const record = {
    tier,
    valid_until: new Date(validUntilSec * 1000).toISOString(),
    customer_id: sub.customer,
    subscription_id: sub.id,
    status: sub.status,
    updated_at: new Date().toISOString(),
  };

  idx[dispensaryId] = record;
  await putTierIndex(env, idx);
  // Keep per-id key as well for back-compat with tools that read it directly
  await env.TCC_OVERRIDES.put(`tier:${dispensaryId}`, JSON.stringify(record));
  console.log(`Wrote tier=${tier} for ${dispensaryId} (valid until ${record.valid_until})`);
}

// Minimal Stripe REST helper. Cloudflare Workers can do fetch directly.
async function stripeApi(path, env, method = 'GET', body = null) {
  const headers = {
    'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
  };
  let init = { method, headers };
  if (body) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    init.body = new URLSearchParams(body).toString();
  }
  const res = await fetch(`https://api.stripe.com/v1/${path}`, init);
  if (!res.ok) {
    const err = await res.text();
    console.error(`Stripe API ${method} ${path} failed: ${res.status} ${err}`);
    return null;
  }
  return res.json();
}

// ─── Stripe signature verification (no SDK needed) ───────────────────────────
// Stripe sends header: `stripe-signature: t=1234567890,v1=abcd...,v1=...`
// We HMAC-SHA256 the string `${t}.${body}` with the webhook secret and check
// it against the v1 entries in constant time.
async function verifyStripeSignature(payload, header, secret) {
  if (!secret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set');
    return false;
  }

  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const idx = p.indexOf('=');
      return [p.slice(0, idx).trim(), p.slice(idx + 1).trim()];
    })
  );
  // Stripe signature header allows multiple v1=... entries; the simple parser
  // above will keep only the last one. That's fine — Stripe always signs with
  // the current key, and we just need ONE to verify.
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;

  // Reject ancient timestamps (>5 min old) to mitigate replay attacks
  const ageSec = Math.abs(Date.now() / 1000 - Number(t));
  if (ageSec > 300) {
    console.warn(`Stripe signature too old: ${ageSec}s`);
    return false;
  }

  const signedPayload = `${t}.${payload}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(signedPayload));
  const expected = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time compare
  if (expected.length !== v1.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  }
  return mismatch === 0;
}

// ─── /admin ──────────────────────────────────────────────────────────────────
// Single-owner admin dashboard. Gated by ADMIN_TOKEN secret via ?key=XXX.
// Not bulletproof auth — fine for a one-person admin, do not share the URL.
function verifyAdminToken(request, env) {
  if (!env.ADMIN_TOKEN) return false;
  const url = new URL(request.url);
  const key = url.searchParams.get('key') || request.headers.get('x-admin-key') || '';
  if (key.length !== env.ADMIN_TOKEN.length) return false;
  let mismatch = 0;
  for (let i = 0; i < key.length; i++) {
    mismatch |= key.charCodeAt(i) ^ env.ADMIN_TOKEN.charCodeAt(i);
  }
  return mismatch === 0;
}

function handleAdminPage(request, env) {
  if (!verifyAdminToken(request, env)) {
    return new Response('Unauthorized', { status: 401, headers: { 'Content-Type': 'text/plain' } });
  }
  return new Response(renderAdminHTML(), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function handleAdminData(request, env, cors) {
  if (!verifyAdminToken(request, env)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  const [subscribers, overrides, site] = await Promise.all([
    fetchSubscribers(env),
    fetchOverrides(env),
    fetchSiteHealth(),
  ]);

  return new Response(JSON.stringify({
    subscribers,
    overrides,
    site,
    generated_at: new Date().toISOString(),
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors },
  });
}

async function fetchSubscribers(env) {
  const res = await stripeApi('subscriptions?status=all&limit=100&expand[]=data.customer', env);
  if (!res || !res.data) return { active_count: 0, mrr_cents: 0, items: [] };

  const items = res.data.map((sub) => {
    const price = sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].price;
    const amount = (price && price.unit_amount) || 0;
    const tier = (price && PRICE_TO_TIER[price.id]) || (sub.metadata && sub.metadata.tier) || '—';
    const cust = sub.customer || {};
    return {
      id: sub.id,
      dispensary_id: (sub.metadata && sub.metadata.dispensary_id) || '—',
      tier,
      amount_cents: amount,
      status: sub.status,
      email: cust.email || '—',
      name: cust.name || '—',
      started: sub.created ? new Date(sub.created * 1000).toISOString().slice(0, 10) : '—',
      current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString().slice(0, 10) : '—',
      cancel_at_period_end: !!sub.cancel_at_period_end,
    };
  });

  const active = items.filter((i) => i.status === 'active' || i.status === 'trialing');
  const mrr_cents = active.reduce((s, i) => s + i.amount_cents, 0);

  return {
    active_count: active.length,
    total_count: items.length,
    mrr_cents,
    items: items.sort((a, b) => (b.started || '').localeCompare(a.started || '')),
  };
}

async function fetchOverrides(env) {
  const idx = await getTierIndex(env);
  return Object.entries(idx).map(([id, value]) => ({ id, ...(value || {}) }));
}

async function fetchSiteHealth() {
  try {
    const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/commits/main`, {
      headers: { 'User-Agent': 'tcc-admin', Accept: 'application/vnd.github.v3+json' },
      cf: { cacheTtl: 60 },
    });
    if (!r.ok) return { error: `github ${r.status}` };
    const commit = await r.json();
    const last = commit.commit && commit.commit.author && commit.commit.author.date;
    const ageMs = last ? Date.now() - Date.parse(last) : null;
    return {
      last_commit_at: last,
      age_hours: ageMs != null ? Math.round(ageMs / 360000) / 10 : null,
      last_commit_message: (commit.commit && commit.commit.message || '').split('\n')[0],
      last_commit_author: (commit.commit && commit.commit.author && commit.commit.author.name) || '',
      sha: (commit.sha || '').slice(0, 7),
    };
  } catch (e) {
    return { error: String(e) };
  }
}

function renderAdminHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TCC Admin</title>
<meta name="robots" content="noindex, nofollow">
<style>
  :root { --bg:#0a1410; --panel:#0f1d17; --border:rgba(255,255,255,.08); --text:#f5f6f8; --dim:#8b909a; --accent:#22c55e; --warn:#f59e0b; --danger:#ef4444; }
  * { box-sizing:border-box }
  body { background:var(--bg); color:var(--text); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; margin:0; line-height:1.5 }
  header { padding:1rem 1.5rem; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; position:sticky; top:0; background:rgba(10,20,16,.92); backdrop-filter:blur(10px); z-index:10 }
  header h1 { font-size:1.1rem; margin:0; font-weight:700; letter-spacing:-.3px }
  header h1 span { color:var(--accent) }
  header .meta { color:var(--dim); font-size:.8rem; font-variant-numeric:tabular-nums }
  main { max-width:1200px; margin:0 auto; padding:1.5rem }
  .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:1rem; margin-bottom:2rem }
  .stat { background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:1.1rem 1.2rem }
  .stat .label { color:var(--dim); font-size:.72rem; text-transform:uppercase; letter-spacing:1.2px; font-weight:700 }
  .stat .value { font-size:1.9rem; font-weight:800; letter-spacing:-.02em; line-height:1.1; margin-top:.25rem; font-variant-numeric:tabular-nums }
  .stat .sub { color:var(--dim); font-size:.8rem; margin-top:.2rem }
  .stat.accent .value { color:var(--accent) }
  .stat.warn .value { color:var(--warn) }
  section { background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:1.2rem 1.4rem; margin-bottom:1.5rem }
  section h2 { margin:0 0 1rem; font-size:1rem; color:var(--dim); text-transform:uppercase; letter-spacing:1.5px; font-weight:700 }
  section h2 a { color:var(--accent); text-decoration:none; font-size:.78rem; float:right; text-transform:none; letter-spacing:0; font-weight:600 }
  section h2 a:hover { text-decoration:underline }
  table { width:100%; border-collapse:collapse; font-size:.9rem }
  th { text-align:left; padding:.55rem .7rem; color:var(--dim); font-weight:600; border-bottom:1px solid var(--border); font-size:.72rem; text-transform:uppercase; letter-spacing:1.2px }
  td { padding:.75rem .7rem; border-bottom:1px solid rgba(255,255,255,.04); vertical-align:middle }
  tr:last-child td { border-bottom:none }
  .pill { display:inline-block; padding:.15rem .55rem; border-radius:4px; font-size:.7rem; font-weight:700; text-transform:uppercase; letter-spacing:.5px }
  .pill.active { background:rgba(34,197,94,.15); color:var(--accent) }
  .pill.trialing { background:rgba(59,130,246,.15); color:#60a5fa }
  .pill.past_due, .pill.unpaid { background:rgba(245,158,11,.15); color:var(--warn) }
  .pill.canceled, .pill.incomplete_expired { background:rgba(239,68,68,.15); color:var(--danger) }
  .pill.incomplete, .pill.paused { background:rgba(139,144,154,.15); color:var(--dim) }
  .pill.featured { background:rgba(34,197,94,.12); color:var(--accent) }
  .pill.premium { background:rgba(234,179,8,.15); color:#facc15 }
  code.mono { color:var(--dim); font-size:.78rem; font-family:'SF Mono',Menlo,monospace }
  .empty { color:var(--dim); text-align:center; padding:2rem; font-size:.9rem }
  .fresh { color:var(--accent) } .stale { color:var(--warn) } .rotten { color:var(--danger) }
  .btn { display:inline-block; padding:.55rem 1rem; background:var(--accent); color:#000; border-radius:8px; text-decoration:none; font-weight:600; font-size:.85rem; margin-right:.5rem }
  .btn.ghost { background:transparent; color:var(--accent); border:1px solid var(--accent) }
  .btn:hover { opacity:.85 }
  .links { display:flex; flex-wrap:wrap; gap:.5rem }
  footer { text-align:center; color:var(--dim); font-size:.75rem; padding:2rem; border-top:1px solid var(--border); margin-top:2rem }
  .err { color:var(--danger); padding:1rem; background:rgba(239,68,68,.08); border-radius:8px; margin:1rem 0 }
</style>
</head>
<body>
<header>
  <h1>Twin City <span>Cannabis</span> · Admin</h1>
  <div class="meta" id="meta">loading…</div>
</header>
<main>
  <div id="root">loading…</div>
</main>
<footer>
  Internal dashboard · auto-refreshes every 30s
</footer>
<script>
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = (cents) => '$' + (cents/100).toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0});

async function load() {
  const key = new URLSearchParams(location.search).get('key');
  if (!key) { $('#root').innerHTML = '<div class="err">Missing ?key= in URL</div>'; return; }
  try {
    const r = await fetch('/admin/data?key=' + encodeURIComponent(key), { cache: 'no-store' });
    if (!r.ok) { $('#root').innerHTML = '<div class="err">' + r.status + ' — check your token</div>'; return; }
    const data = await r.json();
    render(data);
    $('#meta').textContent = 'updated ' + new Date(data.generated_at).toLocaleTimeString();
  } catch (e) {
    $('#root').innerHTML = '<div class="err">' + esc(e.message) + '</div>';
  }
}

function freshnessClass(h) {
  if (h == null) return '';
  if (h < 8) return 'fresh';
  if (h < 24) return 'stale';
  return 'rotten';
}

function render(d) {
  const s = d.subscribers || {}, items = s.items || [];
  const site = d.site || {};
  const overrides = d.overrides || [];
  const freshCls = freshnessClass(site.age_hours);

  const statsHTML = \`
    <div class="stats">
      <div class="stat accent">
        <div class="label">Active Subs</div>
        <div class="value">\${s.active_count || 0}</div>
        <div class="sub">\${s.total_count != null ? s.total_count + ' total (incl. canceled)' : ''}</div>
      </div>
      <div class="stat accent">
        <div class="label">MRR</div>
        <div class="value">\${money(s.mrr_cents || 0)}</div>
        <div class="sub">monthly recurring revenue</div>
      </div>
      <div class="stat \${freshCls === 'rotten' ? 'warn' : ''}">
        <div class="label">Site Freshness</div>
        <div class="value \${freshCls}">\${site.age_hours != null ? site.age_hours + 'h' : '—'}</div>
        <div class="sub">\${site.last_commit_message ? esc(site.last_commit_message.slice(0, 40)) : 'since last Pi push'}</div>
      </div>
      <div class="stat">
        <div class="label">Active Overrides</div>
        <div class="value">\${overrides.length}</div>
        <div class="sub">paid + comp'd tiers</div>
      </div>
      <div class="stat \${overrides.length >= 10 ? 'warn' : ''}">
        <div class="label">Founding Slots Left</div>
        <div class="value" style="color:#eab308">\${Math.max(0, 10 - overrides.length)}</div>
        <div class="sub">of 10 lifetime-lock spots</div>
      </div>
    </div>\`;

  const subsRows = items.length
    ? items.map(i => \`
        <tr>
          <td><strong>\${esc(i.dispensary_id)}</strong><br><code class="mono">\${esc(i.id)}</code></td>
          <td><span class="pill \${esc(i.tier)}">\${esc(i.tier)}</span></td>
          <td>\${money(i.amount_cents)}<span style="color:var(--dim);font-size:.8rem">/mo</span></td>
          <td><span class="pill \${esc(i.status)}">\${esc(i.status)}\${i.cancel_at_period_end ? ' · ending' : ''}</span></td>
          <td>\${esc(i.email)}</td>
          <td><code class="mono">\${esc(i.started)}</code></td>
          <td><code class="mono">\${esc(i.current_period_end)}</code></td>
        </tr>\`).join('')
    : '<tr><td colspan="7" class="empty">No subscriptions yet — Stripe verification may still be pending.</td></tr>';

  const ovRows = overrides.length
    ? overrides.map(o => \`
        <tr>
          <td><strong>\${esc(o.id)}</strong></td>
          <td><span class="pill \${esc(o.tier || '—')}">\${esc(o.tier || '—')}</span></td>
          <td><code class="mono">\${esc(o.valid_until ? o.valid_until.slice(0, 10) : '—')}</code></td>
          <td><code class="mono">\${esc(o.subscription_id || 'manual')}</code></td>
        </tr>\`).join('')
    : '<tr><td colspan="4" class="empty">No manual overrides.</td></tr>';

  $('#root').innerHTML = statsHTML + \`
    <section>
      <h2>Subscribers <a href="https://dashboard.stripe.com/subscriptions" target="_blank">open in Stripe &rarr;</a></h2>
      <table>
        <thead><tr><th>Dispensary</th><th>Tier</th><th>Price</th><th>Status</th><th>Email</th><th>Started</th><th>Next charge</th></tr></thead>
        <tbody>\${subsRows}</tbody>
      </table>
    </section>

    <section>
      <h2>Manual tier overrides</h2>
      <table>
        <thead><tr><th>Dispensary</th><th>Tier</th><th>Valid until</th><th>Subscription</th></tr></thead>
        <tbody>\${ovRows}</tbody>
      </table>
    </section>

    <section>
      <h2>Site health</h2>
      <div class="stats" style="margin:0">
        <div class="stat"><div class="label">Last Pi commit</div><div class="value" style="font-size:1.1rem">\${esc(site.last_commit_at ? new Date(site.last_commit_at).toLocaleString() : '—')}</div><div class="sub">sha \${esc(site.sha || '—')} · \${esc(site.last_commit_author || '')}</div></div>
        <div class="stat"><div class="label">Age</div><div class="value \${freshCls}">\${site.age_hours != null ? site.age_hours + 'h' : '—'}</div><div class="sub">cron runs 4× daily — &lt;8h is healthy</div></div>
      </div>
    </section>

    <section>
      <h2>Quick links</h2>
      <div class="links">
        <a class="btn" href="https://dashboard.stripe.com/subscriptions" target="_blank">Stripe subscriptions</a>
        <a class="btn ghost" href="https://dashboard.stripe.com/payments" target="_blank">Stripe payments</a>
        <a class="btn ghost" href="https://analytics.google.com/" target="_blank">Google Analytics</a>
        <a class="btn ghost" href="https://github.com/JSUNDBY/twincitycannabis/commits/main" target="_blank">GitHub commits</a>
        <a class="btn ghost" href="https://twincitycannabis.com" target="_blank">View site</a>
      </div>
    </section>\`;
}

load();
setInterval(load, 30000);
</script>
</body>
</html>`;
}

// ─── /track ──────────────────────────────────────────────────────────────────
// Public POST endpoint. Frontend calls this to record per-dispensary events
// (view, outbound). Writes KV counters that power /dashboard and /reports.
//
// KV key scheme:
//   stat:<id>:<event>:d<YYYY-MM-DD>   daily counter (95-day TTL)
//   stat:<id>:<event>:total            lifetime counter (no TTL)
const TRACK_EVENTS = new Set(['view', 'outbound', 'search_hit']);

async function handleTrack(request, env, cors) {
  let body;
  try { body = await request.json(); } catch { return trackErr(cors); }
  const id = String(body && body.id || '').slice(0, 80).replace(/[^a-z0-9-]/gi, '').toLowerCase();
  const event = String(body && body.event || '');
  if (!id || !TRACK_EVENTS.has(event)) return trackErr(cors);

  const date = new Date().toISOString().slice(0, 10);
  const dailyKey = `stat:${id}:${event}:d${date}`;
  const totalKey = `stat:${id}:${event}:total`;

  const [daily, total] = await Promise.all([
    env.TCC_OVERRIDES.get(dailyKey).then((v) => Number(v) || 0),
    env.TCC_OVERRIDES.get(totalKey).then((v) => Number(v) || 0),
  ]);

  await Promise.all([
    env.TCC_OVERRIDES.put(dailyKey, String(daily + 1), { expirationTtl: 86400 * 95 }),
    env.TCC_OVERRIDES.put(totalKey, String(total + 1)),
  ]);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

function trackErr(cors) {
  return new Response(JSON.stringify({ ok: false }), {
    status: 400,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

async function fetchDispensaryStats(env, id) {
  const list = await env.TCC_OVERRIDES.list({ prefix: `stat:${id}:` });
  const entries = await Promise.all(
    list.keys.map(async (k) => [k.name, Number(await env.TCC_OVERRIDES.get(k.name)) || 0])
  );
  const stats = { totals: {}, daily: {} };
  for (const [key, count] of entries) {
    const parts = key.split(':');
    const event = parts[2];
    const range = parts[3];
    if (range === 'total') {
      stats.totals[event] = count;
    } else if (range && range.startsWith('d')) {
      const date = range.slice(1);
      if (!stats.daily[date]) stats.daily[date] = {};
      stats.daily[date][event] = count;
    }
  }
  return stats;
}

// ─── /dashboard ──────────────────────────────────────────────────────────────
// Per-dispensary analytics. For v1 gated by ADMIN_TOKEN — once we have paying
// subs we'll generate per-dispensary HMAC tokens at checkout and email them.
function handleDispensaryDashboardPage(request, env) {
  if (!verifyAdminToken(request, env)) {
    return new Response('Unauthorized', { status: 401, headers: { 'Content-Type': 'text/plain' } });
  }
  const url = new URL(request.url);
  const id = (url.searchParams.get('id') || '').replace(/[^a-z0-9-]/gi, '').toLowerCase();
  if (!id) {
    return new Response('Missing ?id=<dispensary-slug>', { status: 400, headers: { 'Content-Type': 'text/plain' } });
  }
  return new Response(renderDispensaryDashboardHTML(id), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function handleDispensaryDashboardData(request, env, cors) {
  if (!verifyAdminToken(request, env)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }
  const url = new URL(request.url);
  const id = (url.searchParams.get('id') || '').replace(/[^a-z0-9-]/gi, '').toLowerCase();
  if (!id) {
    return new Response(JSON.stringify({ error: 'missing id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  const [stats, overrideRaw] = await Promise.all([
    fetchDispensaryStats(env, id),
    env.TCC_OVERRIDES.get(`tier:${id}`, { type: 'json' }),
  ]);

  // Build last-30-day series
  const today = new Date();
  const series = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    const row = stats.daily[key] || {};
    series.push({
      date: key,
      view: row.view || 0,
      outbound: row.outbound || 0,
      search_hit: row.search_hit || 0,
    });
  }

  const last7 = series.slice(-7);
  const prev7 = series.slice(-14, -7);
  const sum = (arr, k) => arr.reduce((s, x) => s + (x[k] || 0), 0);
  const pct = (a, b) => (b === 0 ? (a > 0 ? 100 : 0) : Math.round(((a - b) / b) * 100));

  return new Response(JSON.stringify({
    dispensary_id: id,
    tier: (overrideRaw && overrideRaw.tier) || 'free',
    totals: stats.totals,
    last_7_days: {
      view: sum(last7, 'view'),
      outbound: sum(last7, 'outbound'),
      search_hit: sum(last7, 'search_hit'),
      view_change_pct: pct(sum(last7, 'view'), sum(prev7, 'view')),
      outbound_change_pct: pct(sum(last7, 'outbound'), sum(prev7, 'outbound')),
    },
    series_30d: series,
    generated_at: new Date().toISOString(),
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors },
  });
}

function renderDispensaryDashboardHTML(id) {
  const safeId = id.replace(/[^a-z0-9-]/gi, '');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Your Dashboard · Twin City Cannabis</title>
<meta name="robots" content="noindex, nofollow">
<style>
  :root { --bg:#0a1410; --panel:#0f1d17; --border:rgba(255,255,255,.08); --text:#f5f6f8; --dim:#8b909a; --accent:#22c55e; --gold:#eab308; --warn:#f59e0b; --danger:#ef4444; }
  * { box-sizing:border-box }
  body { background:var(--bg); color:var(--text); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; margin:0; line-height:1.5 }
  header { padding:1.2rem 1.5rem; border-bottom:1px solid var(--border); position:sticky; top:0; background:rgba(10,20,16,.92); backdrop-filter:blur(10px); z-index:10 }
  header .wrap { max-width:1100px; margin:0 auto; display:flex; justify-content:space-between; align-items:center }
  header .brand { font-size:.95rem; font-weight:700 }
  header .brand span { color:var(--accent) }
  header .id { color:var(--dim); font-size:.82rem; font-variant-numeric:tabular-nums }
  main { max-width:1100px; margin:0 auto; padding:1.5rem }
  h1 { font-size:1.7rem; margin:0 0 .3rem; letter-spacing:-.4px }
  .sub { color:var(--dim); margin-bottom:2rem; font-size:.9rem }
  .tier { display:inline-block; padding:.18rem .6rem; font-size:.7rem; font-weight:700; text-transform:uppercase; letter-spacing:1.2px; border-radius:4px; margin-left:.6rem }
  .tier.featured { background:rgba(34,197,94,.12); color:var(--accent) }
  .tier.premium { background:rgba(234,179,8,.15); color:var(--gold) }
  .tier.free { background:rgba(139,144,154,.15); color:var(--dim) }
  .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:1rem; margin-bottom:2rem }
  .stat { background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:1.2rem 1.3rem }
  .stat .label { color:var(--dim); font-size:.7rem; text-transform:uppercase; letter-spacing:1.2px; font-weight:700 }
  .stat .value { font-size:2rem; font-weight:800; letter-spacing:-.02em; line-height:1.1; margin-top:.3rem; font-variant-numeric:tabular-nums }
  .stat .accent { color:var(--accent) }
  .stat .sub { color:var(--dim); font-size:.8rem; margin-top:.25rem }
  .stat .trend { font-size:.78rem; font-weight:700; margin-top:.3rem }
  .trend.up { color:var(--accent) }
  .trend.down { color:var(--warn) }
  .trend.flat { color:var(--dim) }
  section { background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:1.4rem 1.5rem; margin-bottom:1.5rem }
  section h2 { margin:0 0 1rem; font-size:.85rem; color:var(--dim); text-transform:uppercase; letter-spacing:1.5px; font-weight:700 }
  .chart-wrap { position:relative; height:220px; margin-top:.5rem }
  svg { width:100%; height:100%; display:block }
  .legend { display:flex; gap:1.5rem; margin-top:1rem; font-size:.85rem; color:var(--dim); flex-wrap:wrap }
  .legend-dot { display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:.4rem; vertical-align:middle }
  .empty { color:var(--dim); text-align:center; padding:2rem; font-size:.9rem }
  .tip { background:rgba(234,179,8,.05); border:1px solid rgba(234,179,8,.2); border-radius:10px; padding:1rem 1.2rem; margin:1rem 0; font-size:.9rem; color:#fbd38d }
  footer { text-align:center; color:var(--dim); font-size:.75rem; padding:2rem; border-top:1px solid var(--border); margin-top:2rem }
  footer a { color:var(--accent) }
  .err { color:var(--danger); padding:1rem; background:rgba(239,68,68,.08); border-radius:8px; margin:1rem 0 }
</style>
</head>
<body>
<header>
  <div class="wrap">
    <div class="brand">Twin City <span>Cannabis</span> · Dashboard</div>
    <div class="id" id="meta">loading…</div>
  </div>
</header>
<main id="root">loading…</main>
<footer>
  Internal preview · data updates in real time<br>
  <a href="/">Main site</a>
</footer>
<script>
const DISPENSARY_ID = ${JSON.stringify(safeId)};
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function trendEl(pct) {
  if (pct === 0) return '<span class="trend flat">no change vs prior week</span>';
  const up = pct > 0;
  return '<span class="trend ' + (up ? 'up' : 'down') + '">' + (up ? '&uarr; +' : '&darr; ') + Math.abs(pct) + '% vs prior week</span>';
}

function renderChart(series) {
  if (!series || !series.length) return '<div class="empty">No data yet.</div>';
  const W = 900, H = 220, P = 30;
  const maxY = Math.max(1, ...series.flatMap(d => [d.view, d.outbound]));
  const xStep = (W - P * 2) / (series.length - 1);
  const yOf = (v) => H - P - (v / maxY) * (H - P * 2);
  const xOf = (i) => P + i * xStep;
  const path = (key) => series.map((d, i) => (i === 0 ? 'M' : 'L') + xOf(i).toFixed(1) + ' ' + yOf(d[key]).toFixed(1)).join(' ');
  const gridY = [0, 0.5, 1].map(p => {
    const y = H - P - p * (H - P * 2);
    return '<line x1="' + P + '" y1="' + y + '" x2="' + (W - P) + '" y2="' + y + '" stroke="rgba(255,255,255,.05)" />';
  }).join('');
  const xLabels = series.filter((_, i) => i % 5 === 0).map((d, i, arr) => {
    const idx = series.indexOf(d);
    return '<text x="' + xOf(idx) + '" y="' + (H - 8) + '" fill="rgba(255,255,255,.4)" font-size="10" text-anchor="middle">' + d.date.slice(5) + '</text>';
  }).join('');
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' +
    gridY +
    '<path d="' + path('view') + '" fill="none" stroke="#22c55e" stroke-width="2" />' +
    '<path d="' + path('outbound') + '" fill="none" stroke="#eab308" stroke-width="2" />' +
    xLabels +
    '</svg>';
}

async function load() {
  const key = new URLSearchParams(location.search).get('key');
  if (!key) { $('#root').innerHTML = '<div class="err">Missing ?key= in URL</div>'; return; }
  try {
    const r = await fetch('/dashboard/data?id=' + encodeURIComponent(DISPENSARY_ID) + '&key=' + encodeURIComponent(key), { cache: 'no-store' });
    if (!r.ok) { $('#root').innerHTML = '<div class="err">' + r.status + ' — check your token or dispensary id</div>'; return; }
    const d = await r.json();
    render(d);
    $('#meta').textContent = 'id: ' + DISPENSARY_ID + ' · updated ' + new Date(d.generated_at).toLocaleTimeString();
  } catch (e) {
    $('#root').innerHTML = '<div class="err">' + esc(e.message) + '</div>';
  }
}

function render(d) {
  const w = d.last_7_days || {};
  const totals = d.totals || {};
  $('#root').innerHTML = \`
    <h1>Your Twin City Cannabis listing<span class="tier \${esc(d.tier)}">\${esc(d.tier)}</span></h1>
    <div class="sub">Stats for <strong>\${esc(d.dispensary_id)}</strong>. Data captured server-side, no cookies.</div>

    <div class="stats">
      <div class="stat">
        <div class="label">Listing views (7d)</div>
        <div class="value accent">\${w.view || 0}</div>
        <div class="sub">\${totals.view || 0} all-time</div>
        \${trendEl(w.view_change_pct || 0)}
      </div>
      <div class="stat">
        <div class="label">Clicks to your site (7d)</div>
        <div class="value accent">\${w.outbound || 0}</div>
        <div class="sub">\${totals.outbound || 0} all-time</div>
        \${trendEl(w.outbound_change_pct || 0)}
      </div>
      <div class="stat">
        <div class="label">Appearances in search (7d)</div>
        <div class="value">\${w.search_hit || 0}</div>
        <div class="sub">\${totals.search_hit || 0} all-time</div>
      </div>
      <div class="stat">
        <div class="label">Click-through rate</div>
        <div class="value">\${w.view ? Math.round((w.outbound / w.view) * 100) : 0}%</div>
        <div class="sub">of viewers visit your site</div>
      </div>
    </div>

    <section>
      <h2>Last 30 days</h2>
      <div class="chart-wrap">\${renderChart(d.series_30d)}</div>
      <div class="legend">
        <span><span class="legend-dot" style="background:#22c55e"></span>Listing views</span>
        <span><span class="legend-dot" style="background:#eab308"></span>Clicks to your site</span>
      </div>
    </section>

    \${d.tier === 'free' ? '<div class="tip"><strong>&#11088; Upgrade to Featured</strong> to boost your listing visibility and add monthly email reports.</div>' : ''}

    <section>
      <h2>What's measured</h2>
      <div style="color:var(--dim);font-size:.88rem;line-height:1.7">
        <div><strong style="color:var(--text)">Listing views</strong> — every time a shopper opens your dispensary detail page.</div>
        <div><strong style="color:var(--text)">Clicks to your site</strong> — outbound clicks from your listing to your official website or menu.</div>
        <div><strong style="color:var(--text)">Search appearances</strong> — your listing showed up in a search result.</div>
        <div><strong style="color:var(--text)">Click-through rate</strong> — share of viewers who then clicked through to your site.</div>
      </div>
    </section>\`;
}

load();
setInterval(load, 60000);
</script>
</body>
</html>`;
}

// ─── /reports/monthly ────────────────────────────────────────────────────────
// Returns an email-ready HTML report for a given dispensary. Skeleton for now —
// will be triggered by monthly cron once Stripe verifies + subs exist.
async function handleMonthlyReport(request, env) {
  if (!verifyAdminToken(request, env)) {
    return new Response('Unauthorized', { status: 401, headers: { 'Content-Type': 'text/plain' } });
  }
  const url = new URL(request.url);
  const id = (url.searchParams.get('id') || '').replace(/[^a-z0-9-]/gi, '').toLowerCase();
  if (!id) {
    return new Response('Missing ?id=', { status: 400, headers: { 'Content-Type': 'text/plain' } });
  }

  const stats = await fetchDispensaryStats(env, id);
  const today = new Date();
  const start = new Date(today); start.setUTCDate(today.getUTCDate() - 29);
  let monthViews = 0, monthOutbound = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date(start); d.setUTCDate(start.getUTCDate() + i);
    const k = d.toISOString().slice(0, 10);
    const row = stats.daily[k] || {};
    monthViews += row.view || 0;
    monthOutbound += row.outbound || 0;
  }
  const ctr = monthViews ? Math.round((monthOutbound / monthViews) * 100) : 0;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Your TCC Monthly Report</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#0a1410;color:#f5f6f8;margin:0;padding:2rem">
<div style="max-width:600px;margin:0 auto;background:#0f1d17;border-radius:12px;padding:2rem;border:1px solid rgba(255,255,255,.08)">
  <div style="color:#22c55e;font-size:.75rem;font-weight:700;letter-spacing:2px;margin-bottom:.5rem">TWIN CITY CANNABIS · MONTHLY REPORT</div>
  <h1 style="margin:0 0 .3rem">${id}</h1>
  <div style="color:#8b909a;margin-bottom:2rem">${start.toISOString().slice(0, 10)} → ${today.toISOString().slice(0, 10)}</div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:2rem">
    <div style="background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.25);border-radius:10px;padding:1.2rem">
      <div style="color:#8b909a;font-size:.75rem;text-transform:uppercase;letter-spacing:1.2px;font-weight:700">Listing views</div>
      <div style="font-size:2rem;font-weight:800;color:#22c55e">${monthViews}</div>
    </div>
    <div style="background:rgba(234,179,8,.08);border:1px solid rgba(234,179,8,.25);border-radius:10px;padding:1.2rem">
      <div style="color:#8b909a;font-size:.75rem;text-transform:uppercase;letter-spacing:1.2px;font-weight:700">Clicks to your site</div>
      <div style="font-size:2rem;font-weight:800;color:#eab308">${monthOutbound}</div>
    </div>
  </div>

  <div style="padding:1.2rem;background:rgba(255,255,255,.03);border-radius:10px;margin-bottom:1.5rem">
    <div style="color:#8b909a;font-size:.85rem;margin-bottom:.3rem">Click-through rate</div>
    <div style="font-size:1.4rem;font-weight:700">${ctr}%</div>
    <div style="color:#8b909a;font-size:.8rem;margin-top:.3rem">${monthOutbound} of ${monthViews} viewers clicked through to your website.</div>
  </div>

  <p style="color:#b8bcc4;font-size:.9rem;line-height:1.6">Want more detail? <a href="https://dashboard.twincitycannabis.com/dashboard?id=${id}" style="color:#22c55e">View your live dashboard &rarr;</a></p>

  <hr style="border:none;border-top:1px solid rgba(255,255,255,.08);margin:2rem 0">
  <p style="color:#8b909a;font-size:.78rem;line-height:1.5">Twin City Cannabis · Real prices, real reviews, every Twin Cities dispensary.<br>You received this because ${id} is subscribed to Twin City Cannabis.</p>
</div>
</body></html>`;

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
