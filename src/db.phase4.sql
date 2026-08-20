-- Phase 4: Single-use campaign promo codes (Philippines florist/GCash model)
--
-- Adds support for batch-generated, single-use, country-scoped discount codes
-- (e.g. WELCOME20 for Jhe-Ann's Facebook campaign). This is a distinct feature
-- from the existing code_type values already in this table:
--   - 'consultant_demo'    — reusable, monthly free-demo quota tied to a sales
--                            consultant (the existing hidden Promo Codes/
--                            Consultants admin section)
--   - 'gcash_paid_access'  — auto-generated, single-use codes that unlock an
--                            already-GCash-paid order (Step 2 in
--                            new_changes.md)
--   - 'campaign_single_use' (NEW) — admin-created, single-use, percentage or
--                            fixed-amount discount codes, optionally scoped to
--                            one country, created individually or in batches.
--
-- Run this once in the Supabase SQL Editor (same workflow as db.sql / the
-- other phase files — see README.md "Deploy in 10 Minutes", Step 1).

alter table promo_codes
  drop constraint if exists promo_codes_code_type_check;

alter table promo_codes
  add constraint promo_codes_code_type_check
  check (code_type in ('consultant_demo', 'gcash_paid_access', 'campaign_single_use'));

alter table promo_codes
  add column if not exists discount_type text check (discount_type in ('percent', 'fixed')),
  add column if not exists discount_value numeric(10,2),
  add column if not exists country text,
  add column if not exists batch_id uuid,
  add column if not exists batch_label text,
  add column if not exists stripe_coupon_id text;

create index if not exists idx_promo_codes_batch
  on promo_codes(batch_id) where batch_id is not null;
create index if not exists idx_promo_codes_campaign_type
  on promo_codes(code_type, active, country) where code_type = 'campaign_single_use';
