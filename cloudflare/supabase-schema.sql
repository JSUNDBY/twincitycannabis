-- Twin City Cannabis — Supabase schema (Phase 21)
--
-- Run this AFTER unpausing the tcc-analytics project. Order matters:
-- tables → RLS → policies → triggers.
--
-- Project: tcc-analytics  (paused as of 2026-05-02 per the Supabase email)
-- URL:     https://kmlwlmrlmuioogbfwcqx.supabase.co
--
-- After running this, set the following client env vars in index.html or
-- equivalent (publishable values only — never the service role key):
--   SUPABASE_URL              https://kmlwlmrlmuioogbfwcqx.supabase.co
--   SUPABASE_PUBLISHABLE_KEY  sb_publishable_UNf4k93M2YX07okjy3BfbQ_HJA0OnnN
--
-- Once configured, the client side (Phase 21 in js/app.js) will start
-- syncing the watchlist + thresholds + notify preferences to Supabase
-- whenever the user is signed in. Anonymous fallback still uses
-- localStorage exactly like before — auth is purely additive.

-- ─── 1. Profiles (1:1 with auth.users) ──────────────────────────────
create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    -- Visible-name shown in UI (optional)
    display_name text,
    -- Per-user notification preferences mirroring the localStorage flags
    notify_drops boolean not null default false
);

alter table public.profiles enable row level security;

create policy "profiles_self_select"
    on public.profiles for select
    using (auth.uid() = id);

create policy "profiles_self_upsert"
    on public.profiles for insert
    with check (auth.uid() = id);

create policy "profiles_self_update"
    on public.profiles for update
    using (auth.uid() = id);


-- ─── 2. Watchlist ───────────────────────────────────────────────────
-- One row per (user, productId). Lets us index by user_id for fast
-- per-user reads and by product_id for "who's watching this" lookups
-- (used by the push trigger when figuring out which subs to notify).
create table if not exists public.watchlist (
    user_id uuid not null references auth.users(id) on delete cascade,
    product_id text not null,
    added_at timestamptz not null default now(),
    last_seen_price numeric,
    last_seen_at timestamptz default now(),
    -- Threshold ($X) for "alert me when this drops below". Null = no threshold.
    threshold numeric,
    primary key (user_id, product_id)
);

create index if not exists watchlist_user_idx on public.watchlist (user_id);
create index if not exists watchlist_product_idx on public.watchlist (product_id);

alter table public.watchlist enable row level security;

create policy "watchlist_self_select"
    on public.watchlist for select
    using (auth.uid() = user_id);

create policy "watchlist_self_insert"
    on public.watchlist for insert
    with check (auth.uid() = user_id);

create policy "watchlist_self_update"
    on public.watchlist for update
    using (auth.uid() = user_id);

create policy "watchlist_self_delete"
    on public.watchlist for delete
    using (auth.uid() = user_id);


-- ─── 3. Auto-create profile row when an auth user is created ─────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    insert into public.profiles (id) values (new.id) on conflict do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();


-- ─── 4. Updated_at trigger for profiles ──────────────────────────────
create or replace function public.tick_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists profiles_tick_updated on public.profiles;
create trigger profiles_tick_updated
    before update on public.profiles
    for each row execute function public.tick_updated_at();


-- ─── 5. Helpful view for the push worker (when we wire that path) ────
-- The Cloudflare worker doesn't currently call Supabase — it stores its
-- own subscriptions in KV. If you later want push subscriptions to live
-- in Supabase too, this view will let the worker query for "users
-- watching this product" in one round trip.
create or replace view public.watchers_by_product as
    select product_id, array_agg(user_id) as user_ids, count(*) as watcher_count
    from public.watchlist
    group by product_id;

-- Grant read on the view to anon for the worker via service role.
-- (Service role bypasses RLS so this is informational only.)
