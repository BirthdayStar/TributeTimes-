-- ---------------------------------------------------------------------------
-- PHASE 10 — AGENT PROFILE FIELDS (address, city, country, socials w/ follower counts)
-- Client request, 3 Sept 2026 (Col, reference screenshots of an
-- "Add Agent" form and an "Approved" agent record): "This form allows us
-- to sign up all types of sellers of the product... standardized
-- information gathering... information that allows us to complete our
-- backend work, payments etc." Adds the fields shown in his screenshots
-- that the Phase 6/7/9 schema didn't have yet: a full postal address
-- (Address 1, Address 2, City, Country), and a follower-count number per
-- social platform (not just the handle/link Phase 9 already collects) —
-- 7 platforms per his screenshot: Facebook, Instagram, X/Twitter,
-- LinkedIn, TikTok, YouTube, WhatsApp.
--
-- Applied to BOTH sales_consultants (the real, approved agent record —
-- his 2nd screenshot, "Add Agent - Approved") and reseller_signup_requests
-- (the public /join submission, Phase 9) so a submitted application's
-- extra detail survives all the way through into the real agent record on
-- approval, matching his existing 4-way "individual/business/influencer/
-- radio_station" public form plus the follower counts he now also wants
-- collected up front.
--
-- Note — "Resellers go completely and is replaced with Agents": per
-- confirmed scope, this is a VISIBLE-LABEL rename only (nav text, page
-- titles, form labels). The underlying table stays sales_consultants and
-- reseller_signup_requests — already-tested, working table/column names,
-- not worth the risk of renaming for a client-facing wording change only.
-- ---------------------------------------------------------------------------

-- STEP 1 — address + socials-with-follower-counts on the real agent table
alter table sales_consultants
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists city text,
  add column if not exists country text,
  add column if not exists facebook_followers text,
  add column if not exists instagram_followers text,
  add column if not exists twitter_followers text,
  add column if not exists linkedin_followers text,
  add column if not exists tiktok_followers text,
  add column if not exists youtube_followers text,
  add column if not exists whatsapp_followers text;

-- STEP 2 — same fields on the public sign-up request table, so a /join
-- submission can carry this detail through to approval without asking the
-- agent to re-enter anything.
alter table reseller_signup_requests
  add column if not exists address_line2 text,
  add column if not exists city text,
  add column if not exists country text,
  add column if not exists facebook_followers text,
  add column if not exists instagram_followers text,
  add column if not exists twitter_followers text,
  add column if not exists linkedin_followers text,
  add column if not exists tiktok_followers text,
  add column if not exists youtube_followers text,
  add column if not exists whatsapp_followers text;
-- Note: reseller_signup_requests.address already exists from Phase 9 and
-- is reused as "Address 1" here rather than duplicated under a new name.
