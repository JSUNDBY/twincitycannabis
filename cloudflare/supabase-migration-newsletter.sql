-- Twin City Cannabis — Phase 21b additive migration
--
-- Run this in the Supabase SQL editor for the tcc-sync project AFTER the
-- main supabase-schema.sql has already been applied. Adds the columns +
-- updated trigger required for the newsletter opt-in checkbox on the
-- sign-in form (separate signal from transactional drop alerts).
--
-- Idempotent: safe to re-run.

-- 1. Add newsletter_optin + email columns to profiles
alter table public.profiles
    add column if not exists newsletter_optin boolean not null default false,
    add column if not exists email text;

-- 2. Backfill email for any existing profiles (no-op if none exist yet)
update public.profiles p
    set email = u.email
    from auth.users u
    where p.id = u.id and p.email is null;

-- 3. Update handle_new_user trigger to populate email on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    insert into public.profiles (id, email) values (new.id, new.email)
        on conflict (id) do update set email = excluded.email;
    return new;
end;
$$;
-- (Trigger itself was already created in the original schema; just replacing
--  the function body is enough — no need to recreate the trigger binding.)

-- 4. Helpful view for exporting newsletter subscribers
create or replace view public.newsletter_subscribers as
    select id, email, created_at, updated_at
    from public.profiles
    where newsletter_optin = true and email is not null
    order by created_at desc;
