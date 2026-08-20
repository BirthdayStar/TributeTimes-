-- ============================================================
-- PHASE 5 MIGRATION — new_changes.md Step 8: Automatic mailing list capture
-- Run this once in the Supabase SQL Editor.
-- ============================================================

-- `email` is always lowercased by the application before insert/upsert
-- (see src/phase2/marketing-contacts.js), so a plain unique constraint on
-- the column is sufficient and matches Supabase's `onConflict: 'email'`
-- upsert syntax (which requires a real column/constraint, not an
-- expression index like `lower(email)`).
create table if not exists marketing_contacts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  consented boolean not null default true,
  source text not null default 'public_checkout',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- new_changes.md Step 6: Second "residence country" field
-- Purely metadata (segmentation/marketing) — the existing `country`
-- column continues to drive "on this day" content sourcing (birth
-- country), unchanged.
-- ============================================================
alter table keepsakes add column if not exists residence_country text;
