# TCC Recovery Runbook

If something goes wrong, this is the playbook. Print it, save it, refer to it
when panicked. The full system has six recoverable layers — each one is
covered below with the exact commands to bring it back.

> **Before you act:** breathe, take a screenshot of the current bad state,
> and save the most recent log output. Recovery is much easier when you can
> see what changed; it's much harder if you `rm -rf` first and look later.

---

## 1. The site (GitHub Pages, twincitycannabis.com)

**What it is:** static HTML/CSS/JS plus the SPA, served from this repo by
GitHub Pages (`CNAME` → twincitycannabis.com).

**What can go wrong:** bad commit, force-push that loses history, accidental
file deletion.

**Recover:**

```bash
# See recent commits
git log --oneline -20

# Roll a single bad commit back (keeps history clean)
git revert <bad-sha>
git push

# Or, if you need to hard-reset to a known-good commit:
# WARNING: destructive. Confirm the SHA is right first.
git reset --hard <good-sha>
git push --force-with-lease
```

GitHub Pages will redeploy within ~1–2 minutes of the push.

---

## 2. The Cloudflare Worker (dashboard.twincitycannabis.com)

**What it is:** the `worker.js` in `cloudflare/`. Source is in this repo.

**What can go wrong:** a bad deploy, corrupted env vars, accidental delete
in the Cloudflare dashboard.

**Recover:**

```bash
cd cloudflare
npx wrangler deploy
```

That redeploys whatever is on `main`. If the version on `main` is itself
broken, first `git checkout` to a known-good commit, then deploy:

```bash
git checkout <good-sha> -- cloudflare/worker.js
cd cloudflare && npx wrangler deploy
git checkout main -- cloudflare/worker.js  # restore working tree
```

**Worker secrets** (set with `wrangler secret put NAME`):
- `STRIPE_SECRET_KEY` — currently aspirational; Stripe rejected the account
- `STRIPE_WEBHOOK_SECRET` — same
- `RESEND_API_KEY` — for lead notification emails (Resend dashboard)
- `ADMIN_TOKEN` — gates `/admin/*` routes; pick something long & random

If a secret is lost: regenerate it from the source service, then
`npx wrangler secret put NAME` to re-attach it to the worker.

---

## 3. Cloudflare KV (`tcc-overrides` namespace)

**What it is:** the persistent store backing the worker. Holds tier
overrides, contact-form leads, scraped outreach emails, and analytics
counters (`stats:*` keys).

- Account ID: `0672ae6f0ce7a86086cafbcba03ed68f`
- Namespace ID: `71b77df77ea74522ab66c82e20cc9339`

**What can go wrong:** a wrangler `kv:key delete` or `kv:bulk delete`
wipes data. A bad `put` overwrites a key with garbage. Cloudflare itself
loses a key (extremely rare).

**Recover:**

A daily snapshot runs in `.github/workflows/kv-backup.yml`. Snapshots are
stored as **GitHub Actions artifacts** (private, 90-day retention) — not
committed to git, because the repo is public and KV holds PII.

```bash
# 1. Find the most recent successful "KV Backup" run on GitHub:
#    https://github.com/JSUNDBY/twincitycannabis/actions/workflows/kv-backup.yml

# 2. Download the artifact (it's named kv-tcc-overrides-<run-id>) — unzip it.
#    You'll get a file called kv-tcc-overrides.json in wrangler bulk format.

# 3. Restore via wrangler from the cloudflare/ directory:
cd cloudflare
npx wrangler kv:bulk put ../path/to/kv-tcc-overrides.json \
  --namespace-id=71b77df77ea74522ab66c82e20cc9339
```

The bulk put is **upsert** behavior — it only writes the keys in the file
and won't delete keys that exist in KV but not in the backup. So a partial
restore is safe; you can also restore individual keys with `kv:key put`.

**Trigger an out-of-cycle backup before doing anything risky:**

```bash
gh workflow run "KV Backup" --repo JSUNDBY/twincitycannabis
```

---

## 4. GitHub Actions secrets

These power the scheduled workflows. If lost, regenerate from the source
and re-add at Repo Settings → Secrets and variables → Actions.

- `CLOUDFLARE_API_TOKEN` — Cloudflare → My Profile → API Tokens. Needs
  `Workers KV Storage:Read` on the account. Used by the KV backup workflow.
- `PROXY_URL` — used by the dispensary scraper. Whatever proxy service
  you set up; recreate from there.
- (Any other secrets you've added — list them here as you add them.)

The KV backup workflow fails loud (with a `::error::` annotation) if its
secret is missing, so you'll find out quickly if a secret has rotated out.

---

## 5. Supabase project `tcc-analytics`

**What it is:** project provisioned for Phase 2 (claim/login flow). Empty
as of 2026-04-28.

- URL: `https://kmlwlmrlmuioogbfwcqx.supabase.co`
- Region: East US (Ohio)
- Org: SUPERTHOUGHTS
- Publishable key: `sb_publishable_UNf4k93M2YX07okjy3BfbQ_HJA0OnnN`
- DB password: stored separately (1Password)

**Recover:** while the project is empty, recovery just means re-creating it
in the Supabase dashboard. Once Phase 2 lands and there's real data:
- Enable Point-in-Time Recovery (Pro tier) so 7+ days of state is recoverable
- Add a daily `pg_dump` to a private R2 bucket as belt-and-suspenders

---

## 6. Aeropay (or whatever payment processor lands)

Placeholder. Once an account is approved:
- Save credentials in 1Password under "TCC — Aeropay"
- Add API keys as worker secrets (never commit to repo)
- Document webhook URL and how to rotate keys

---

## Principles that survive any incident

- **Don't make it worse.** Resist the urge to "clean up" before you
  understand what happened. Take a snapshot of the bad state first.
- **Restore a known-good commit. Don't hand-edit out of a bad state.**
  Git is the source of truth for code. KV backup artifacts are the source
  of truth for KV.
- **Re-verify after restore.** Hit the live worker with a simple curl
  (`curl https://dashboard.twincitycannabis.com/health` should return
  "TCC Stripe webhook worker — alive"). Visit the site. Check the
  dashboard for one dispensary you know has data.
- **Update this doc.** If you recover from something not covered here,
  add it.
