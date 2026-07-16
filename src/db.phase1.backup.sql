-- THE TRIBUTE TIMES — Database Setup
-- Run this entire file in your Supabase SQL editor

-- STATIONS TABLE
create table if not exists stations (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  name text not null,
  country text not null default 'New Zealand',
  email text unique not null,
  password_hash text not null,
  tier text not null default 'community',
  footprint_label text default 'Up to 25,000',
  station_logo_url text,
  sponsor_logo_url text,
  sponsor_name text default '',
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text default 'trial',
  billing_interval text default 'monthly',
  trial_ends_at timestamptz default (now() + interval '14 days'),
  keepsakes_this_month int default 0,
  keepsakes_month_reset timestamptz default (date_trunc('month', now()) + interval '1 month'),
  frames_in_stock int default 0,
  verified boolean default false,
  active boolean default true,
  last_login timestamptz
);

-- DJS TABLE
create table if not exists djs (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  station_id uuid references stations(id) on delete cascade,
  name text not null,
  email text unique not null,
  password_hash text not null,
  active boolean default true,
  last_login timestamptz
);

-- KEEPSAKES TABLE
create table if not exists keepsakes (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  station_id uuid references stations(id),
  dj_id uuid references djs(id),
  dj_name text,
  occasion text not null default 'birthday',
  listener_name text not null,
  listener_dob date not null,
  country text not null,
  dj_message text,
  content jsonb,
  printed_at timestamptz,
  posted_at timestamptz,
  notes text
);

-- FRAME ORDERS TABLE
create table if not exists frame_orders (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  station_id uuid references stations(id),
  quantity int not null default 100,
  unit_price_nzd numeric(10,2) default 1.20,
  gst_nzd numeric(10,2),
  total_nzd numeric(10,2),
  stripe_payment_intent_id text,
  status text default 'pending',
  delivery_name text,
  delivery_address text,
  delivery_city text,
  delivery_postcode text,
  delivery_country text default 'New Zealand',
  shipped_at timestamptz,
  tracking_number text
);

-- INDEXES
create index if not exists idx_keepsakes_station on keepsakes(station_id);
create index if not exists idx_keepsakes_date on keepsakes(created_at desc);
create index if not exists idx_djs_station on djs(station_id);
create index if not exists idx_frame_orders_station on frame_orders(station_id);

-- Storage bucket for logos (run separately if needed)
-- insert into storage.buckets (id, name, public) values ('logos', 'logos', true)
-- on conflict do nothing;

select 'Tribute Times database ready' as status;
