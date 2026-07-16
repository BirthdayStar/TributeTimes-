-- THE TRIBUTE TIMES - Phase 2 additive schema
-- Run this after the Phase 1 schema in Supabase SQL Editor
-- This file adds Phase 2 tables and columns without replacing the existing schema

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- SUPPORT TABLES
-- ---------------------------------------------------------------------------

create table if not exists admins (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  display_name text not null,
  email text not null,
  password_hash text not null,
  active boolean default true,
  last_login timestamptz
);

create unique index if not exists idx_admins_email_lower on admins (lower(email));

create table if not exists sales_consultants (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  name text not null,
  email text,
  phone text,
  active boolean default true,
  commission_notes text,
  admin_notes text
);

create unique index if not exists idx_sales_consultants_email_lower
  on sales_consultants (lower(email))
  where email is not null;

create table if not exists promo_codes (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  consultant_id uuid references sales_consultants(id) on delete set null,
  code text not null,
  active boolean default true,
  monthly_free_demo_limit int not null default 5 check (monthly_free_demo_limit >= 0),
  notes text
);

create unique index if not exists idx_promo_codes_code_lower on promo_codes (lower(code));
create index if not exists idx_promo_codes_consultant on promo_codes(consultant_id);

create table if not exists postcode_territories (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  consultant_id uuid references sales_consultants(id) on delete set null,
  territory_name text not null default '',
  country text not null default 'New Zealand',
  match_type text not null default 'exact'
    check (match_type in ('exact', 'prefix', 'range')),
  postcode_start text not null,
  postcode_end text,
  priority int not null default 100,
  active boolean default true,
  notes text
);

create index if not exists idx_postcode_territories_lookup
  on postcode_territories(country, active, priority, postcode_start);
create index if not exists idx_postcode_territories_consultant
  on postcode_territories(consultant_id);

create table if not exists famous_birthdays_import_runs (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  source_name text not null default 'Wikipedia',
  requested_day int check (requested_day between 1 and 31),
  requested_month int check (requested_month between 1 and 12),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed')),
  rows_seen int not null default 0,
  rows_inserted int not null default 0,
  rows_updated int not null default 0,
  rows_rejected int not null default 0,
  notes text,
  completed_at timestamptz
);

create table if not exists famous_birthdays (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  import_run_id uuid references famous_birthdays_import_runs(id) on delete set null,
  full_name text not null,
  birth_day int not null check (birth_day between 1 and 31),
  birth_month int not null check (birth_month between 1 and 12),
  main_public_country text not null,
  occupation text,
  short_bio text,
  birth_year int,
  raw_extract text,
  source_name text not null default 'Wikipedia',
  source_url text,
  wikipedia_title text,
  curation_status text not null default 'pending'
    check (curation_status in ('pending', 'approved', 'rejected')),
  display_priority int not null default 100,
  active boolean default true,
  admin_notes text
);

alter table famous_birthdays
  add column if not exists birth_year int,
  add column if not exists raw_extract text;

create index if not exists idx_famous_birthdays_query
  on famous_birthdays(birth_month, birth_day, main_public_country, curation_status);
create index if not exists idx_famous_birthdays_import_run
  on famous_birthdays(import_run_id);
create unique index if not exists idx_famous_birthdays_unique_source_day
  on famous_birthdays(lower(full_name), birth_month, birth_day, source_name);

-- ---------------------------------------------------------------------------
-- PHASE 2 ORDER TABLES
-- ---------------------------------------------------------------------------

create table if not exists orders (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  parent_order_id uuid references orders(id) on delete set null,
  keepsake_id uuid not null references keepsakes(id) on delete cascade,
  station_id uuid references stations(id) on delete set null,
  dj_id uuid references djs(id) on delete set null,
  sales_consultant_id uuid references sales_consultants(id) on delete set null,
  promo_code_id uuid references promo_codes(id) on delete set null,
  territory_id uuid references postcode_territories(id) on delete set null,
  order_number text not null,
  source_portal text not null
    check (source_portal in ('public', 'radio', 'florist')),
  customer_name text not null,
  customer_email text,
  recipient_name text not null,
  product_tier text not null
    check (product_tier in ('digital', 'standard', 'premium')),
  delivery_option text
    check (delivery_option in ('standard', '2day', 'overnight')),
  queue_status text
    check (queue_status in ('pending', 'printed', 'posted', 'delivered')),
  payment_status text not null default 'pending'
    check (payment_status in ('not_required', 'pending', 'paid', 'failed', 'cancelled', 'refunded')),
  attribution_source text not null default 'none'
    check (attribution_source in ('none', 'promo_code', 'postcode', 'manual')),
  needs_fulfilment boolean default false,
  delivery_priority int not null default 99,
  currency_code text not null default 'NZD',
  base_amount_nzd numeric(10,2) not null default 0,
  delivery_surcharge_nzd numeric(10,2) not null default 0,
  total_amount_nzd numeric(10,2) not null default 0,
  packaging_notes text,
  includes_frame boolean default false,
  shipping_name text,
  shipping_address_line1 text,
  shipping_address_line2 text,
  shipping_city text,
  shipping_region text,
  shipping_postcode text,
  shipping_country text default 'New Zealand',
  pdf_path text,
  payment_provider text default 'stripe',
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  notes text,
  paid_at timestamptz,
  printed_at timestamptz,
  posted_at timestamptz,
  delivered_at timestamptz
);

create unique index if not exists idx_orders_order_number on orders(order_number);
create index if not exists idx_orders_keepsake on orders(keepsake_id);
create index if not exists idx_orders_queue on orders(needs_fulfilment, delivery_priority, created_at desc);
create index if not exists idx_orders_payment_status on orders(payment_status, created_at desc);
create index if not exists idx_orders_source_portal on orders(source_portal, created_at desc);
create index if not exists idx_orders_attribution on orders(sales_consultant_id, promo_code_id, territory_id);

create table if not exists fulfilment_events (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  order_id uuid not null references orders(id) on delete cascade,
  previous_status text
    check (previous_status in ('pending', 'printed', 'posted', 'delivered')),
  new_status text not null
    check (new_status in ('pending', 'printed', 'posted', 'delivered')),
  changed_by_admin_id uuid references admins(id) on delete set null,
  triggered_email boolean default false,
  note text
);

create index if not exists idx_fulfilment_events_order on fulfilment_events(order_id, created_at desc);

create table if not exists anthropic_usage_logs (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  usage_date date not null default current_date,
  keepsake_id uuid references keepsakes(id) on delete set null,
  order_id uuid references orders(id) on delete set null,
  source_portal text not null
    check (source_portal in ('public', 'radio', 'florist')),
  model_name text not null,
  input_tokens int not null default 0 check (input_tokens >= 0),
  output_tokens int not null default 0 check (output_tokens >= 0),
  estimated_cost_usd numeric(10,4) not null default 0,
  request_ip inet,
  admin_alert_sent boolean default false,
  alert_sent_at timestamptz,
  alert_note text
);

alter table anthropic_usage_logs
  add column if not exists keepsake_id uuid references keepsakes(id) on delete set null,
  add column if not exists order_id uuid references orders(id) on delete set null,
  add column if not exists source_portal text default 'public',
  add column if not exists model_name text default 'unknown',
  add column if not exists input_tokens int not null default 0,
  add column if not exists output_tokens int not null default 0,
  add column if not exists estimated_cost_usd numeric(10,4) not null default 0,
  add column if not exists request_ip inet,
  add column if not exists admin_alert_sent boolean default false,
  add column if not exists alert_sent_at timestamptz,
  add column if not exists alert_note text;

create index if not exists idx_anthropic_usage_logs_date on anthropic_usage_logs(usage_date, admin_alert_sent);
create index if not exists idx_anthropic_usage_logs_keepsake on anthropic_usage_logs(keepsake_id);

-- ---------------------------------------------------------------------------
-- EXTEND EXISTING TABLES
-- ---------------------------------------------------------------------------

alter table stations
  add column if not exists account_type text default 'radio',
  add column if not exists sales_consultant_id uuid,
  add column if not exists florist_credit_balance int not null default 0,
  add column if not exists florist_last_pack_size int,
  add column if not exists florist_low_credit_threshold int not null default 10,
  add column if not exists florist_credit_updated_at timestamptz,
  add column if not exists admin_notes text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'stations_account_type_check'
  ) then
    alter table stations
      add constraint stations_account_type_check
      check (account_type in ('radio', 'florist'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'stations_sales_consultant_fk'
  ) then
    alter table stations
      add constraint stations_sales_consultant_fk
      foreign key (sales_consultant_id)
      references sales_consultants(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_stations_account_type on stations(account_type, active);
create index if not exists idx_stations_sales_consultant on stations(sales_consultant_id);

alter table keepsakes
  add column if not exists source_portal text default 'radio',
  add column if not exists edition text default 'radio',
  add column if not exists sender_name text,
  add column if not exists station_name text,
  add column if not exists customer_name text,
  add column if not exists customer_email text,
  add column if not exists rendered_html text,
  add column if not exists pdf_path text,
  add column if not exists watermark_status text default 'none',
  add column if not exists promo_code_id uuid,
  add column if not exists sales_consultant_id uuid,
  add column if not exists is_free_demo boolean default false,
  add column if not exists request_ip inet,
  add column if not exists anthropic_input_tokens int not null default 0,
  add column if not exists anthropic_output_tokens int not null default 0,
  add column if not exists anthropic_estimated_cost_usd numeric(10,4) not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'keepsakes_source_portal_check'
  ) then
    alter table keepsakes
      add constraint keepsakes_source_portal_check
      check (source_portal in ('public', 'radio', 'florist'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'keepsakes_watermark_status_check'
  ) then
    alter table keepsakes
      add constraint keepsakes_watermark_status_check
      check (watermark_status in ('none', 'sample_preview', 'clean_paid'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'keepsakes_promo_code_fk'
  ) then
    alter table keepsakes
      add constraint keepsakes_promo_code_fk
      foreign key (promo_code_id)
      references promo_codes(id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'keepsakes_sales_consultant_fk'
  ) then
    alter table keepsakes
      add constraint keepsakes_sales_consultant_fk
      foreign key (sales_consultant_id)
      references sales_consultants(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_keepsakes_source_portal on keepsakes(source_portal, created_at desc);
create index if not exists idx_keepsakes_promo_code on keepsakes(promo_code_id, created_at desc);
create index if not exists idx_keepsakes_sales_consultant on keepsakes(sales_consultant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- FINAL NOTE
-- ---------------------------------------------------------------------------

select 'Tribute Times Phase 2 schema ready' as status;
