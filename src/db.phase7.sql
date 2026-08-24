-- ---------------------------------------------------------------------------
-- PHASE 7 — PARTNER SIGN-UP & CODE-BASED ATTRIBUTION
-- Client request, 21 Aug 2026 (Col): partner type field for sales
-- consultants (florist/cake shop/gift store/radio station/influencer/
-- individual), plus attribution linkage for referral and repeat-purchase
-- flows so a sale traces back to the original code-holder regardless of
-- buyer location. See phase6.md for full context.
-- ---------------------------------------------------------------------------

-- STEP 1 — partner type on sales_consultants
alter table sales_consultants
  add column if not exists partner_type text default 'individual';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sales_consultants_partner_type_check'
  ) then
    alter table sales_consultants
      add constraint sales_consultants_partner_type_check
      check (partner_type in ('individual', 'radio_station', 'florist', 'cake_shop', 'gift_store', 'influencer'));
  end if;
end $$;

-- STEP 2 — referral attribution linkage on viral_shares
alter table viral_shares
  add column if not exists origin_consultant_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'viral_shares_origin_consultant_fk'
  ) then
    alter table viral_shares
      add constraint viral_shares_origin_consultant_fk
      foreign key (origin_consultant_id)
      references sales_consultants(id)
      on delete set null;
  end if;
end $$;

-- STEP 3 — no new columns needed (promo_codes.consultant_id already exists,
-- confirmed src/db.phase2.sql:49 idx_promo_codes_consultant).

-- ---------------------------------------------------------------------------
-- BUG FIX, 23 Aug 2026 (found in post-migration live audit): Step 2 above
-- added ATTRIBUTION_SOURCE.referral = 'referral' in src/phase2/constants.js
-- and started writing it into orders.attribution_source for referred
-- purchases — but this file never updated the CHECK CONSTRAINT on that
-- column (src/db.phase2.sql:258-259), which only allowed
-- ('none', 'promo_code', 'postcode', 'manual'). Missed entirely until this
-- statement was added — meaning every real referred purchase would have
-- CRASHED at checkout with a raw "violates check constraint
-- orders_attribution_source_check" error the moment a customer actually
-- used a referral link with no promo code, the exact scenario Step 2 exists
-- to support. Confirmed via a live end-to-end test after Steps 1-2's other
-- migrations were already applied. This statement was added AFTER the rest
-- of this file was first run — if you already ran this file once, you
-- still need to run this ALTER separately (it's safe/idempotent either way,
-- same drop-and-recreate-if-different-name pattern isn't needed here since
-- postgres allows redefining a check constraint by dropping the old one by
-- name first).
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'orders_attribution_source_check'
  ) then
    alter table orders drop constraint orders_attribution_source_check;
  end if;
  alter table orders
    add constraint orders_attribution_source_check
    check (attribution_source in ('none', 'promo_code', 'postcode', 'manual', 'referral'));
end $$;
