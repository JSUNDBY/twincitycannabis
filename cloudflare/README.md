# TCC Stripe → Cloudflare Worker

Automated dispensary tier upgrades. When a dispensary owner pays through a Stripe
Payment Link on the [/for-dispensaries](../index.html) page, Stripe fires a
webhook to this Cloudflare Worker, the Worker writes the tier into Cloudflare KV,
and the static site reads from KV on every page load to show the right badges.

```
[Subscribe button on /for-dispensaries]
   │  (Stripe Payment Link with client_reference_id=dispensary_id)
   ▼
[Stripe Checkout]
   │  payment succeeds
   ▼
[Stripe Webhook → POST /webhook]
   │  HMAC verified, tier written to KV
   ▼
[Cloudflare KV: tier:{dispensary_id}]
   ▲
   │  GET /overrides
   │
[Frontend on twincitycannabis.com loads on init, applies tier overrides]
```

---

## Files

- **`worker.js`** — handles the webhook + serves the override JSON
- **`wrangler.toml`** — config (account ID + KV binding pre-filled)

---

## One-time setup

### 1. Create Stripe products (5 min, in Stripe dashboard)

Go to <https://dashboard.stripe.com/test/products> (test mode toggle on, top-right).

Create two products:

| Product name             | Pricing                       |
|--------------------------|-------------------------------|
| TCC Featured Listing     | Recurring, $299/month         |
| TCC Premium Listing      | Recurring, $599/month         |

After creating each, copy the **Price ID** (starts with `price_`).

### 2. Add the Price IDs to `worker.js`

Open [`worker.js`](./worker.js), find `PRICE_TO_TIER`, and fill in:

```js
const PRICE_TO_TIER = {
  'price_1ABC...featured...': 'featured',
  'price_1XYZ...premium...':  'premium',
};
```

### 3. Create Stripe Payment Links (one-time, in Stripe dashboard)

Go to <https://dashboard.stripe.com/test/payment-links/create>.

For each product:
1. Pick the product → recurring monthly
2. Under **Advanced options** → enable "Collect customer's name and address"
3. Under **After payment** → "Show confirmation page" or redirect back to `https://twincitycannabis.com/?upgraded=1`
4. Copy the resulting URL (looks like `https://buy.stripe.com/test_xxx`)

You'll have **two Payment Link URLs** (one Featured, one Premium). Paste them into
[`js/app.js`](../js/app.js) at the top, in the `TIER_PAYMENT_LINKS` config.

The Subscribe buttons append `?client_reference_id=<dispensary_id>` so the Worker
knows which dispensary is upgrading.

### 4. Deploy the Worker

```bash
cd cloudflare
npx wrangler login            # opens browser, log in to J.sundby@gmail.com
npx wrangler deploy
```

This deploys to `https://dashboard.twincitycannabis.com`. Verify with:

```bash
curl https://dashboard.twincitycannabis.com/health
# → "TCC Stripe webhook worker — alive"
```

### 5. Set secrets (NEVER commit these)

```bash
npx wrangler secret put STRIPE_SECRET_KEY
# paste your sk_test_... key (from stripe.com → Developers → API keys)

npx wrangler secret put STRIPE_WEBHOOK_SECRET
# you'll get this in step 6 — re-run after creating the webhook
```

### 6. Create the Stripe webhook endpoint

Go to <https://dashboard.stripe.com/test/webhooks/create>.

- **Endpoint URL:** `https://dashboard.twincitycannabis.com/webhook`
- **Events to send:**
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`

After saving, click **"Reveal signing secret"** and copy the `whsec_...` value.
Then run:

```bash
npx wrangler secret put STRIPE_WEBHOOK_SECRET
# paste the whsec_... value
```

### 7. Test end-to-end

1. Open the Featured Payment Link URL with a test dispensary id appended:
   `https://buy.stripe.com/test_xxx?client_reference_id=wildflower-5`
2. Pay with test card `4242 4242 4242 4242`, any future expiry, any CVC
3. Watch the worker logs: `npx wrangler tail`
4. You should see: `Wrote tier=featured for wildflower-5 (valid until ...)`
5. Check the override endpoint:
   `curl https://dashboard.twincitycannabis.com/overrides`
6. Reload <https://twincitycannabis.com> — Wildflower should now show a "Featured" badge

---

## Going live

When ready to take real money:

1. In Stripe dashboard → flip the test/live toggle (top-right)
2. Recreate the same two products + payment links in **live mode** (the IDs change)
3. Update `PRICE_TO_TIER` in `worker.js` with the live Price IDs (or keep both — same map)
4. Update `TIER_PAYMENT_LINKS` in `js/app.js` with the live Payment Link URLs
5. Recreate the webhook in **live mode** at the same URL
6. `npx wrangler secret put STRIPE_SECRET_KEY` → paste the **live** `sk_live_...` key
7. `npx wrangler secret put STRIPE_WEBHOOK_SECRET` → paste the new live `whsec_...`
8. `npx wrangler deploy`

---

## Operations

### Tail logs (live)
```bash
npx wrangler tail
```

### Check what's in KV
```bash
npx wrangler kv key list --binding=TCC_OVERRIDES
npx wrangler kv key get --binding=TCC_OVERRIDES "tier:wildflower-5"
```

### Manually grant a tier (e.g. for a comp / partner deal)
```bash
npx wrangler kv key put --binding=TCC_OVERRIDES "tier:wildflower-5" \
  '{"tier":"featured","valid_until":"2027-01-01T00:00:00Z","status":"comp"}'
```

### Manually revoke
```bash
npx wrangler kv key delete --binding=TCC_OVERRIDES "tier:wildflower-5"
```

### Free tier limits (you will not hit these)
- Workers: 100k requests/day
- KV: 100k reads/day, 1k writes/day, 1GB storage
- Way above expected dispensary subscription volume.

---

## Security notes

- ✅ Secrets stored as Cloudflare encrypted env vars, never committed
- ✅ Stripe signature verification (HMAC-SHA256) on every webhook
- ✅ Replay protection: rejects signatures older than 5 minutes
- ✅ Constant-time signature comparison
- ✅ `/overrides` is intentionally public (no PII, just tier badges)
- ✅ KV writes are isolated per dispensary key, no SQL/injection surface
