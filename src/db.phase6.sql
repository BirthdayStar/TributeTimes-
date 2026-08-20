-- ---------------------------------------------------------------------------
-- PHASE 6 — WHOLESALE BUYING CODES + GIFT SHOP / CAKE SHOP PARTNER TYPES
-- Client request, 19 Aug 2026 (Col): pay-as-you-use wholesale model, all
-- partner types (florist, gift shop, cake shop, radio station) get a
-- wholesale buying code of the form "WS" + business name, and gift
-- shops/cake shops are new partner types alongside the existing florist
-- and radio account types (reusing the exact same `stations` table +
-- florist credit-balance infrastructure — no new tables needed).
-- ---------------------------------------------------------------------------

alter table stations
  add column if not exists wholesale_code text;

-- Case-insensitive uniqueness — the app-side generator (src/phase2/
-- wholesale-code.js) already checks for collisions before insert, but this
-- constraint is the real guarantee against a race between two simultaneous
-- signups picking the same code. NULLs (existing rows created before this
-- migration) are unrestricted by a unique index, so this is safe to add
-- without backfilling every historical row first.
create unique index if not exists idx_stations_wholesale_code_unique
  on stations (lower(wholesale_code))
  where wholesale_code is not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'stations_account_type_check'
  ) then
    alter table stations drop constraint stations_account_type_check;
  end if;

  alter table stations
    add constraint stations_account_type_check
    check (account_type in ('radio', 'florist', 'gift_shop', 'cake_shop'));
end $$;
