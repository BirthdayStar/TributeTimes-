-- ---------------------------------------------------------------------------
-- PHASE 9 — PUBLIC RESELLER SIGN-UP REQUESTS
-- Client request, 21 Aug 2026 (Col, phase6.md) + reconfirmed 2/3 Sept 2026:
-- "Creation of a new signing up page bringing it all together and using
-- the information for marketing purposes later." A prospective reseller
-- fills in their own details on a public page; it lands here as a PENDING
-- request, never auto-creates a real reseller — Col/Jhe-Ann review it,
-- create the account + code manually (via the existing, already-tested
-- reseller creation flow), and the request row is marked approved/
-- rejected. Deliberately a separate table from sales_consultants: an
-- unapproved submission is not a reseller yet, and keeping the two apart
-- means the public form can never accidentally create a live, working
-- reseller account without a human in the loop — matches Col's own
-- answer: "Would come to Jhe-Ann or me for approval first."
-- ---------------------------------------------------------------------------

create table if not exists reseller_signup_requests (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz not null default now(),

  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),

  -- "choose what option they are is most critical" — Col, 2 Sept 2026.
  -- Reuses the exact same 4-way distinction already used for real
  -- resellers (partner_type on sales_consultants), minus radio_station's
  -- separate onboarding path and the influencer/individual split not
  -- being relevant to how the public form frames itself (a submitter
  -- picks one of these 4 broad categories, not the 6-way admin-only list).
  partner_type text not null
    check (partner_type in ('individual', 'business', 'influencer', 'radio_station')),

  first_name text not null,
  surname text not null,
  -- Only used/required when partner_type = 'business' — client spec,
  -- 2 Sept 2026 (Col): "Add business name after surname and address
  -- under that only used when registering a business." Left nullable at
  -- the DB level (enforced at the application layer instead, same
  -- pattern as every other conditional-required field in this codebase)
  -- so a non-business submission never fights a NOT NULL constraint here.
  business_name text,
  address text,

  gcash_number text,
  phone text,
  email text not null,
  facebook text,
  instagram text,
  tiktok text,
  whatsapp text,
  telegram text,
  other_social text,

  -- Set when Col/Jhe-Ann act on the request — links back to the real
  -- reseller record once approved, so "who did this request turn into"
  -- is always answerable directly instead of having to match by name.
  reviewed_at timestamptz,
  reviewed_by_admin_id uuid references admins(id) on delete set null,
  review_notes text,
  created_consultant_id uuid references sales_consultants(id) on delete set null
);

create index if not exists idx_reseller_signup_requests_status
  on reseller_signup_requests (status, created_at desc);
