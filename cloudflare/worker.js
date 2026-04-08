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
  // FILL THESE IN AFTER CREATING STRIPE PRODUCTS
  // 'price_1ABC...': 'featured',
  // 'price_1XYZ...': 'premium',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

// Active visitor tracking config
const VISITOR_TTL_SECONDS = 300;       // a "visitor" counts as active for 5 min
const BASELINE_MIN = 4;                 // never show fewer than this (modest TC floor)
const BASELINE_MAX = 7;                 // ceiling on the synthesized baseline boost

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname === '/webhook' && request.method === 'POST') {
      return handleWebhook(request, env);
    }

    if (url.pathname === '/overrides' && request.method === 'GET') {
      return handleOverridesRead(env);
    }

    if (url.pathname === '/ping' && request.method === 'POST') {
      return handlePing(request, env);
    }

    if (url.pathname === '/active' && request.method === 'GET') {
      return handleActiveCount(env);
    }

    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response('TCC Stripe webhook worker — alive', { status: 200 });
    }

    return new Response('Not found', { status: 404 });
  },
};

// ─── /ping ───────────────────────────────────────────────────────────────
// Browser sends this on page load and every ~2 minutes thereafter while the
// tab is active. We write a v:{session_id} key to KV with a 5-min TTL.
// Sessions naturally expire if the tab closes / user goes idle.
async function handlePing(request, env) {
  let body = {};
  try { body = await request.json(); } catch { /* fine, we'll generate */ }
  let sid = (body.sid || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
  if (!sid) {
    // Fallback: generate a server-side id from a random uuid
    sid = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  }
  await env.TCC_OVERRIDES.put(`v:${sid}`, '1', { expirationTtl: VISITOR_TTL_SECONDS });
  return new Response(JSON.stringify({ ok: true, sid }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

// ─── /active ─────────────────────────────────────────────────────────────
// Returns the live count: real (non-expired) sessions plus a small modest
// Twin Cities baseline so the number is never embarrassingly low. The
// baseline drifts gently with the minute-of-day so it doesn't pulse jaggedly.
async function handleActiveCount(env) {
  const list = await env.TCC_OVERRIDES.list({ prefix: 'v:', limit: 1000 });
  const real = list.keys.length;

  // Baseline = a small smooth wave between BASELINE_MIN and BASELINE_MAX,
  // seeded by the current 5-minute bucket so it changes slowly. Range is
  // intentionally tight (4-7) for a modest emerging market.
  const bucket = Math.floor(Date.now() / (5 * 60 * 1000));
  const noise = Math.abs(Math.sin(bucket * 1.7)) ;          // 0..1, smooth
  const baseline = BASELINE_MIN + Math.round(noise * (BASELINE_MAX - BASELINE_MIN));

  // Time-of-day damping: between 2-6 AM CDT, drop the baseline so it
  // matches reality (cannabis shoppers aren't browsing at 4 AM).
  // CDT = UTC-5, so 2-6 AM CDT = 7-11 UTC.
  const utcHour = new Date().getUTCHours();
  const isLateNight = utcHour >= 7 && utcHour < 11;
  const adjustedBaseline = isLateNight ? Math.max(2, baseline - 3) : baseline;

  // Day-of-week boost: Friday + Saturday evenings (UTC 22-04 = 5pm-11pm CDT),
  // bump baseline by 1-2 to reflect realistic peak shopping windows.
  const utcDay = new Date().getUTCDay();
  const isWeekendEvening = (utcDay === 6 || utcDay === 0 /* Sat/Sun UTC ~ Fri/Sat eve CDT */) && (utcHour >= 22 || utcHour < 4);
  const finalBaseline = isWeekendEvening ? adjustedBaseline + 2 : adjustedBaseline;

  const total = real + finalBaseline;

  return new Response(JSON.stringify({ active: total, real, baseline: finalBaseline }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=15, s-maxage=15',
      ...corsHeaders,
    },
  });
}

// ─── /overrides ──────────────────────────────────────────────────────────────
async function handleOverridesRead(env) {
  // List all KV keys with prefix "tier:" — each value is JSON
  const list = await env.TCC_OVERRIDES.list({ prefix: 'tier:' });
  const overrides = {};

  // Parallel fetch all values
  const entries = await Promise.all(
    list.keys.map(async (k) => {
      const dispensaryId = k.name.slice('tier:'.length);
      const value = await env.TCC_OVERRIDES.get(k.name, { type: 'json' });
      return [dispensaryId, value];
    })
  );

  for (const [id, value] of entries) {
    if (!value) continue;
    // Filter expired entries (subscription canceled but KV write hasn't propagated)
    if (value.valid_until && Date.parse(value.valid_until) < Date.now()) continue;
    overrides[id] = value;
  }

  return new Response(JSON.stringify(overrides), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300, s-maxage=300', // 5 min edge cache
      ...corsHeaders,
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

  // Active only if the subscription is active or trialing
  const isActive = sub.status === 'active' || sub.status === 'trialing';
  if (!isActive) {
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
