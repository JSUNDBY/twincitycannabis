# Phase 24 + 21 deploy checklist

Everything is shipped. To turn either feature on, run the steps below.

## Web Push (Phase 24)

### One-time setup

1. **Set worker secrets** (run from `cloudflare/` directory):

   ```bash
   cd cloudflare
   npx wrangler secret put VAPID_PUBLIC_KEY
   # paste: BD4Y7dzUQJGZ-I_04BQ6fy9h-ZB_Nl18w72dbMziijpDGktPpOQdB-AevbJzHUQuj1u9ZtNju4aFv-aJLoNMiRQ

   npx wrangler secret put VAPID_PRIVATE_KEY
   # paste: UpiUwXeDYtRotCSva651EOfjlkpA4BqCQ7hCoR2SnOk

   npx wrangler secret put PUSH_TRIGGER_TOKEN
   # paste any random string you generate, e.g. via:
   #   openssl rand -hex 32
   ```

2. **Deploy the worker:**

   ```bash
   npx wrangler deploy
   ```

3. **Set the same `PUSH_TRIGGER_TOKEN` as an env var on the Pi** so
   `scraper/trigger_push.py` can authenticate:

   ```bash
   echo 'export PUSH_TRIGGER_TOKEN=<same-token-as-above>' >> ~/.bashrc
   source ~/.bashrc
   ```

   Or set it inline in the cron entry that runs `update_site.py`.

### How it works once deployed

- Visitor clicks **"Enable drop alerts"** on the watchlist page.
- Browser prompts for permission; on grant, `subscribeToPush()` registers
  the SW with the push service and POSTs the subscription + the visitor's
  current watchlist + thresholds to `https://dashboard.twincitycannabis.com/push/subscribe`.
- Worker stores it in KV under `push:<endpointHash>`.
- Pi cron (`auto_scrape.sh` calling `update_site.py`) runs every few hours.
  After data refresh, `trigger_push.py` builds a "moves" manifest of
  retail-band price drops and POSTs to `/push/trigger` with the bearer token.
- Worker fans out one push per matched subscription. Push services
  (FCM/APNs/Mozilla) deliver to the user's device even when no tab is open.
- Click the notification → SW routes back to `/#watchlist`.

### Verifying

After deploy, the public key endpoint should work:

```bash
curl -s https://dashboard.twincitycannabis.com/push/vapid-public-key | jq .
```

Should return `{ "publicKey": "BD4Y7dz..." }`.

### Troubleshooting

- 401 from `/push/trigger`: `PUSH_TRIGGER_TOKEN` mismatch between Pi and worker.
- 500 from `/push/vapid-public-key`: secrets not set on worker.
- Pushes failing silently: check `wrangler tail` for crypto errors. Likely
  endpoint expired (push services return 410); worker auto-deletes those.

---

## Supabase sync (Phase 21)

### One-time setup

1. **Run the schema** in the Supabase SQL editor for the `tcc-sync` project
   (https://mxplunjfsbbyreqqqvvm.supabase.co):

   ```bash
   cat cloudflare/supabase-schema.sql
   ```

   Copy-paste into the SQL editor, run.

3. **Add the publishable key + URL to `index.html`**, right before the
   data.js script tag:

   ```html
   <script>
     window.TCC_SUPABASE_CONFIG = {
       url: 'https://mxplunjfsbbyreqqqvvm.supabase.co',
       anonKey: 'sb_publishable_u0rrtBf5D6JT0bHqRAn0Yw_UJruXk3M',
     };
   </script>
   <script defer src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
   ```

4. **Add a sign-in button** somewhere (watchlist page is the natural fit).
   The `Sync` module exposes `signInWithEmail(email)` and `signOut()`.

### How it works once configured

- Anonymous visitor: localStorage as before. Nothing changes.
- Visitor signs in (magic link via `Sync.signInWithEmail('user@example.com')`):
  - Supabase creates `auth.users` row; trigger auto-inserts `profiles` row.
  - `Sync.pullWatchlist()` merges any saved items from Supabase into local state.
  - From then on, every `Watchlist.add/remove/toggle` also calls
    `Sync.pushWatchlist()`, which upserts to the `watchlist` table.
- Different browser, same email: sign in, `Sync.pullWatchlist()` reconstitutes
  the watchlist from the server. Cross-device sync without manual share URLs.

### Verifying

After deploy, open the console on the homepage and run:

```js
TCCSync.config()        // → { url, anonKey } if configured, null otherwise
TCCSync.isConfigured()  // → true if both config + supabase-js are loaded
TCCSync.signedIn()      // → true after successful signInWithEmail
```

---

## What does NOT need a deploy

The following work today on the live site already and do not depend on
the worker or Supabase:

- Watchlist (localStorage)
- Per-product alert thresholds
- Drop banner on homepage
- Share-URL for cross-device watchlist (`#watchlist?import=<token>`)
- Per-visit browser notifications via Notification API (no real-time push,
  but fires on return visits)
- Service worker offline shell + notification-click routing
