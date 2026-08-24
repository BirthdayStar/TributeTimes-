-- ---------------------------------------------------------------------------
-- PHASE 8 — AUTOMATIC COMMISSION CALCULATION
-- Client request, 23 Aug 2026 (Col, replying to phase6.md's open question):
-- "Automatic commission calculation (rate x sales) - yes please, not the
-- free-text notes field. I don't want to manually calculate this every
-- time." Business partners (florist/cake shop/gift store/radio station)
-- all get the same 35% wholesale rate; individuals vary and are set
-- per-partner. Commission = rate x total_amount_nzd on every PAID order
-- attributed to that consultant (direct + referral + repeat-purchase —
-- the full chain already built in Phase 7, confirmed one level deep by
-- Col, no new attribution logic needed here — this step is purely the
-- rate storage + the read-side sum).
-- ---------------------------------------------------------------------------

alter table sales_consultants
  add column if not exists commission_rate numeric(5,2);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sales_consultants_commission_rate_check'
  ) then
    alter table sales_consultants
      -- Stored as a plain percentage number (e.g. 35.00 means 35%), not a
      -- 0-1 fraction — matches how the admin panel already displays
      -- percentages elsewhere (e.g. "20%" in commission_notes free text)
      -- and how Col described the number verbally ("35% discount").
      -- 0 is allowed (an explicit zero-commission partner is a valid,
      -- deliberate admin choice, distinct from null/"not set yet").
      add constraint sales_consultants_commission_rate_check
      check (commission_rate is null or (commission_rate >= 0 and commission_rate <= 100));
  end if;
end $$;
