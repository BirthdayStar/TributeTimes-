-- ============================================================
-- THE TRIBUTE TIMES — PHASE 3 SCHEMA ADDITIONS
-- Run this in the Supabase SQL editor (same as db.phase2.sql was).
-- ============================================================

-- ── Task 1.6: generated AI content cache ──
-- The bulk of a keepsake's AI-generated content (on-this-day news, prices,
-- chart, weather, ticker, horoscope, birthdays) depends only on the
-- date/country/occasion/edition combination, not on the specific
-- recipient — so it's safe to reuse across requests. The personal
-- message is deliberately NOT trusted from this cache at read time (see
-- loadCachedContent in tribute-times-server-update.js) since it names a
-- specific sender.
create table if not exists generated_content_cache (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  cache_key text not null unique,
  birth_day int not null check (birth_day between 1 and 31),
  birth_month int not null check (birth_month between 1 and 12),
  birth_year int not null,
  country text not null,
  occasion text not null,
  edition text not null,
  content jsonb not null,
  hits int not null default 0,
  last_used_at timestamptz default now()
);

create index if not exists idx_generated_content_cache_lookup
  on generated_content_cache (birth_day, birth_month, birth_year, country, occasion, edition);

-- ── Tasks 1.7/1.8: viral share loop ──
-- A share code created either before payment (origin_type='pre_payment',
-- unlocks 10% off for the sharer immediately per the confirmed scope
-- decision — no verification a friend actually used it) or after payment
-- (origin_type='post_purchase', unlocks 10% off for whoever the customer
-- shares the link with next). Any visitor arriving via /public?ref=<code>
-- gets the same 10% off at their own checkout, applied through the Stripe
-- coupon in STRIPE_VIRAL_SHARE_COUPON_ID.
create table if not exists viral_shares (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  code text not null unique,
  origin_type text not null check (origin_type in ('pre_payment', 'post_purchase')),
  origin_keepsake_id uuid references keepsakes(id) on delete set null,
  origin_order_id uuid references orders(id) on delete set null,
  redeemed_count int not null default 0
);

create index if not exists idx_viral_shares_code on viral_shares (lower(code));
