# PHASE 6 — Partner Sign-Up & Code-Based Attribution

**Client:** Colin McCabe ("Col"). Scope defined across 3 messages (21 Aug, 10:37 / 10:53 / 10:56) — read all three before starting, summarized below.

This file is the only source of truth for this phase. Do not pull in anything from `new_changes.md` or `phase5.md` unless referenced from here — this is a separate, unrelated phase (Phase 5 is pure keepsake-page visual work; this is attribution/backend logic).

---

## 0. Read this before touching anything

- **What Col actually wants, in his own words:** *"I give someone a code... When someone uses that code to buy, I need the system to know: this sale came from that person's code... It does NOT matter where the buyer lives, what their postcode is, or what country they're in. Only the code matters."* Plus two specific chains that must credit back to the original code owner: a referred friend's purchase, and the same customer's repeat purchase.
- **This is a bug-fix + feature phase, not a redesign.** The consultant/promo-code attribution system already exists and already mostly works this way (see Step 1 — promo code already wins over postcode when both are present). The real gaps are narrower and more specific than "rebuild attribution": (a) no partner-type field, (b) referral purchases don't carry attribution, (c) repeat-purchase discount codes don't carry attribution. Fix those three things — do not rearchitect the whole `sales_consultants`/`promo_codes` system.
- **Do not touch:** Phase 5's renderer files, PDF generation, GCash-specific logic (`src/phase2/gcash-payment-requests.js` — flag if a change there looks tempting, don't make it without re-reading this file first), Stripe checkout amount logic, the wholesale/florist-credit system from earlier phases, or any AI-prompt/content-generation file. This phase touches `src/phase2/attribution.js`, `src/phase2/public-checkout.js`, `src/phase2/second-purchase-discount.js`, `src/phase2/admin-fulfilment.js`, and `public/admin.html` only.
- **The "Edit Territory" screenshot Col sent is a rough AI-generated mockup, not a literal spec** — it has visibly duplicated dropdown entries (mockup-generation noise). Use it only for the *general idea* of fields (name, type, country/city, sales made, gross profit, commission rate/due, commission paid) — the country/city field on that mockup is informational display only (where the partner is based), it must never be used to *determine* attribution, which is the whole point of this phase.
- **Real database changes are needed.** This phase requires new columns (`partner_type` on `sales_consultants`, `origin_consultant_id` on `viral_shares`, `consultant_id` on the second-purchase-discount insert). Follow the exact same migration pattern as `src/db.phase6.sql`... **wait — that filename is already taken by the wholesale-codes migration from the previous phase.** Name this phase's migration `src/db.phase7.sql`, continuing the existing sequence (`db.phase2.sql` through `db.phase6.sql` already exist). Like every prior migration in this repo, it must be run manually in Supabase's SQL editor — there is no automated migration runner in this project (confirmed in earlier phases).
- ⚠️ **Ask Col before building the full sign-up UI:** his screenshot only shows an editing modal, not necessarily how it's triggered (a new "Partners" admin section vs. extending the existing "Sales Consultants" section vs. something else). Step 4 below extends the *existing* Sales Consultants section with a type field — the lowest-risk interpretation of his ask. If he actually wants an entirely separate "Partners/Resellers" admin area with its own list, that's a bigger UI decision — confirm with him before restructuring the admin nav, don't assume.

---

## 1. Master Prompt (use this verbatim if handing this file to a fresh agent)

> You are implementing Phase 6 of The Tribute Times: partner sign-up and code-based sales attribution, defined in `phase6.md` at the project root. Read that entire file first, and read `src/phase2/attribution.js` and `src/phase2/public-checkout.js` in full before writing any code — this phase requires understanding exactly how attribution currently resolves. Implement Steps 1 through 4 in strict order; each step has a "Bug Hunt" block that must be completed (find real bugs, fix them, retest) before moving to the next step — do not skip straight to "looks done." Do not touch Phase 5's files, GCash logic, or Stripe checkout amounts. When all 4 steps are done, run the Master Test Script in Step 5, confirm scope via `git diff --stat`, and stop — report back to Col rather than proceeding to build a full separate "Partners" UI unless he's confirmed that's what he wants (see the note in Section 0).

---

## STEP 1 — Add a partner-type field to sales consultants

**Purpose:** Col wants to sign up "a sales rep, an influencer, a florist, a cake shop — doesn't matter who" as the same underlying concept (a code-holder who gets attribution credit). Right now the system has no way to record *what kind* of partner someone is.

**Problem (verified in code):** `src/phase2/admin-fulfilment.js`'s sales-consultant creation insert only accepts `name`, `email`, `phone`, `active`, `commissionNotes`, `adminNotes` — there is no category/type field anywhere in the `sales_consultants` table or its admin UI. Every consultant is the same flat concept regardless of whether they're actually a florist, an influencer, or an individual rep.

**Solution:**
1. **Migration** (`src/db.phase7.sql`, new file, follow the exact pattern in `src/db.phase2.sql`/`src/db.phase6.sql`):
   ```sql
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
   ```
   Match Col's mockup categories exactly (dedupe the visible duplicates in his screenshot — "Radio Station" and "florists"/"gift store" each appeared twice, that's mockup noise, not two distinct types).
2. In `src/phase2/admin-fulfilment.js`, add `partner_type: String(body.partnerType || 'individual').trim()` to the existing consultant-creation insert (find the exact insert block reported in the investigation — `name`/`email`/`phone`/`active`/`commission_notes`/`admin_notes`). Validate against the same allow-list as the DB constraint before inserting (don't rely on the DB constraint alone to catch a bad value — fail with a clear 400 error first).
3. In `public/admin.html`'s existing Sales Consultants create/edit form, add a "Partner Type" `<select>` with the 6 options above — follow the exact same pattern already used for the florist "Business Type" selector added in an earlier phase (same file, same modal-select approach) for visual/code consistency.
4. Display the partner type in the consultants list table the same low-risk way the wholesale code was added to the florists table in an earlier phase — as a small subtitle under the name, not a new table column (avoids touching `<thead>`/colspan).

**Isolation notes:** additive column with a safe default (`'individual'`), so existing consultant rows are unaffected. Only the consultant creation endpoint and its admin form are touched — nothing about promo code or territory logic changes in this step.

**Test case:**
- Create a new consultant of each of the 6 types via the real admin UI, confirm each saves and displays correctly.
- Confirm an *existing* consultant (created before this migration) still loads/edits/saves correctly with `partner_type` defaulting to `'individual'` — don't break old data.
- Confirm the DB constraint actually rejects an invalid `partner_type` value sent directly to the API (bypass the UI, hit the endpoint with a bad value) — the 400 error should be clear, not a raw DB error leaking to the client.

**🐛 Bug hunt (find → fix → retest) — do this before moving to Step 2:**
- Check the edit (PUT) path for an existing consultant, not just create — does editing an existing consultant accidentally reset `partner_type` back to the default if the edit form doesn't send it? (This exact class of bug — a field silently defaulting/resetting on edit — has happened before in this codebase; check for it deliberately, don't assume it's fine.)
- Try creating a consultant with no `partnerType` sent at all (simulate an old/cached frontend that doesn't know about the new field) — confirm it gracefully defaults rather than 500ing.
- If you find anything wrong: fix it, then re-run the full test case above before moving on.

---

## STEP 2 — Fix referral purchases so they attribute back to the original consultant (Scenario A)

**Purpose:** Col: *"Customer buys with JHEANN20, then refers a friend who buys using the referral discount/link. Does that friend's purchase get credited to Jhe-Ann?"* — currently, no.

**Problem (verified in code, not assumed):**
- `createOrReuseShareCode` (`src/phase2/public-checkout.js`) inserts into `viral_shares` with only `code`, `origin_type`, `origin_keepsake_id`, `origin_order_id` — **no consultant linkage stored at all.**
- When a referred friend checks out, `resolvePaidOrderAttribution` (`src/phase2/attribution.js`) is called with only `promoCode: payload.promoCode` — **`payload.referralCode` is never passed to it.** The referral code only ever drives a flat 10%-off Stripe coupon; it has zero path into the attribution system.
- Confirmed: this is why Scenario A currently returns `attribution_source: none`, `sales_consultant_id: null` for the referred friend's order.

**Solution:**
1. **Migration** (same `src/db.phase7.sql` file as Step 1, append):
   ```sql
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
   ```
2. In `createOrReuseShareCode` (`public-checkout.js`), before inserting the new `viral_shares` row: look up the origin order/keepsake's `sales_consultant_id` (the function already receives `keepsakeId`/`orderId` — query the `orders` or `keepsakes` table for whichever one is present, same tables `resolvePaidOrderAttribution` already reads from) and store it as `origin_consultant_id` on the insert.
3. In `resolveViralShareRow` (`public-checkout.js`), change the `.select('id, redeemed_count')` to also select `origin_consultant_id`.
4. This is the important part: **`resolvePaidOrderAttribution` itself must not be changed to accept a referral code directly** — keep that function's responsibility exactly as-is (promo code → existing keepsake → postcode fallback). Instead, at the call site in `public-checkout.js` (where `resolvePaidOrderAttribution` and `resolveViralShareRow` are both already called), add: if `resolvePaidOrderAttribution` returned no consultant (`attribution.salesConsultantId` is null) AND a valid `viralShare.origin_consultant_id` exists, use the referral's consultant as a *fallback* attribution source. This preserves the existing priority order (an explicit promo code typed at checkout should still win over an inherited referral attribution) while filling the actual gap Col reported.
5. Add a new `ATTRIBUTION_SOURCE` value (check `src/phase2/constants.js` for where `ATTRIBUTION_SOURCE` is defined) — e.g. `referral: 'referral'` — so this new attribution path is distinguishable in the data from a direct promo code, rather than silently reusing `promoCode` as the source for something that wasn't actually a typed-in code.

**Isolation notes:** this only affects orders that come in via a referral link with no other attribution already present. An order with its own valid promo code, or one matched by postcode territory, is completely unaffected — verify this explicitly in testing, don't just assume the priority logic works because it reads correctly.

**Test case:**
- Real end-to-end test: create a test order attributed to a real test consultant, generate a post-purchase share link from it, complete a second test checkout using that referral link with **no promo code entered**, confirm the second order's `sales_consultant_id` matches the first.
- Confirm a referral checkout that ALSO has a promo code typed in still attributes to the typed code's consultant, not the referral's — the explicit code must still win.
- Confirm a referral link from an order that had NO consultant attribution (a plain organic sale) correctly produces `origin_consultant_id: null`, and the referred purchase correctly stays unattributed too — don't accidentally invent attribution where none existed.

**🐛 Bug hunt (find → fix → retest) — do this before moving to Step 3:**
- Test a referral code that doesn't exist / is mistyped — confirm it fails the same graceful way promo codes already do (falls through to no-attribution, does not throw and block checkout — this exact failure mode was a real, previously-fixed bug in this codebase for promo codes, per the comment already in `attribution.js`; make sure the referral path doesn't reintroduce the same class of bug).
- Test the pre-payment share flow (`originType === 'pre_payment'`, generated *before* the referrer has even paid) separately from the post-purchase flow — does a pre-payment share link (generated from a keepsake, not yet an order) correctly look up consultant attribution from the keepsake row, or does it silently fail to find one because it's checking the wrong table?
- Confirm the existing GCash referral/discount paths (if any reference `viral_shares`) weren't broken by the new column — grep for other `viral_shares` usages beyond what's described here before considering this step done.
- If you find anything wrong: fix it, then re-run the full test case above before moving on.

---

## STEP 3 — Fix repeat-purchase discount codes so they attribute back to the original consultant (Scenario B)

**Purpose:** Col: *"The original customer uses the repeat-purchase discount to buy a second keepsake... does that second purchase still get credited to Jhe-Ann?"* — currently, no.

**Problem (verified in code, not assumed):**
- `issueSecondPurchaseDiscountCode({ supabase, stripe })` (`src/phase2/second-purchase-discount.js`) is called with **no customer, order, or consultant context at all**. The `promo_codes` row it inserts has no `consultant_id` set.
- When the customer later uses that `THANKYOU-XXXXXXXX` code, `loadPromoCode` finds it fine (no `code_type` filter), but `promo.consultant_id` is `null` — so the second order resolves to `attribution_source: promo_code`, `sales_consultant_id: null`.
- Confirmed call site: `public-checkout.js` line ~741, where `updatedOrder` (the just-completed first order) is already in scope and already has `sales_consultant_id` available on it.

**Solution:**
1. Change `issueSecondPurchaseDiscountCode`'s signature to accept the originating consultant id: `issueSecondPurchaseDiscountCode({ supabase, stripe, consultantId })`.
2. Add `consultant_id: consultantId || null` to its `promo_codes` insert.
3. At the call site in `public-checkout.js`, pass `consultantId: updatedOrder.sales_consultant_id` — this is data already available at that exact point in the code, no new lookup needed.
4. No new migration needed for this step — `promo_codes.consultant_id` already exists (it's how the original `JHEANN20`-style codes attribute in the first place).

**Isolation notes:** this is a narrow, surgical change — one new parameter threaded through one function and one call site. It does not change the coupon logic, the discount percentage, the email sent, or anything about how the code is redeemed at checkout (that path already correctly reads `consultant_id` off whatever promo code is used, per Step-1-verified behavior in `resolvePaidOrderAttribution`).

**Test case:**
- Real end-to-end test: complete a test purchase attributed to a real test consultant, confirm the automatically-issued `THANKYOU-...` code now has that consultant's id on it (query `promo_codes` directly).
- Complete a second test purchase using that `THANKYOU-...` code, confirm the second order's `sales_consultant_id` matches the first.
- Complete a test purchase with **no** consultant attribution (organic, no code/territory match) and confirm its resulting `THANKYOU-...` code correctly has `consultant_id: null` — don't accidentally attribute organic sales' follow-up codes to a random consultant.

**🐛 Bug hunt (find → fix → retest) — do this before moving to Step 4:**
- Check the `existingKeepsake` carry-over path in `resolvePaidOrderAttribution` (the second of its three fallback branches) — does a customer resuming an abandoned checkout via the `THANKYOU` code interact oddly with that carry-over logic, potentially double-attributing or conflicting?
- Confirm this change doesn't affect the `code_type = 'campaign_single_use'` codes used for OTHER campaigns (not just second-purchase) if `issueSecondPurchaseDiscountCode`'s pattern is reused elsewhere — grep for other callers before assuming this function is only ever used for this one purpose.
- Test what happens if `updatedOrder.sales_consultant_id` is itself null (organic sale) all the way through: does `consultant_id: null` on the new promo code correctly behave identically to how it works today (no regression for the common case, which is most sales), not just for the attributed case?
- If you find anything wrong: fix it, then re-run the full test case above before moving on.

---

## STEP 4 — Simple partner sign-up form (name + type + commission rate → unique code)

**Purpose:** Col: *"A simple way to create a new person/business in the system (name, code, type)... Each one gets their own unique code."*

**Problem (current state):** creating a consultant already exists (admin panel), and creating a promo code for that consultant already exists (`createPromoCode` in `admin-fulfilment.js`) — but they're two separate steps/forms today. Col wants this to feel like one simple action: fill in a partner's details once, get a code.

**Solution — the lowest-risk approach, matching the existing pattern already used for the wholesale-code feature (auto-generate the code, don't make the admin type one):**
1. Extend the existing Sales Consultant creation form/endpoint (already touched in Step 1 for `partner_type`) to also accept a `buyingRate`/`commissionRate` field, stored in the already-existing `commission_notes` field for now (it's a free-text field — don't add a new numeric column unless Col specifically wants commission *calculated* automatically, which is a bigger, separate ask not in his current 3 messages; ask him to confirm that scope before building numeric commission math).
2. On successful consultant creation, **automatically create their first promo code too** in the same request (server-side: call the existing `createPromoCode(supabase, body)` logic right after the consultant insert succeeds — note it requires `consultantId` and an exact `code` string as input; it does not generate the code itself, the caller must).
3. **Reuse only the name-cleaning half of `src/phase2/wholesale-code.js`, not its collision-checker.** `buildBaseWholesaleCode(name)` (the pure lowercase/strip-special-characters/truncate function) is safe and correct to reuse as-is for turning a partner's name into a base code. But `createUniqueWholesaleCode()` — the function that checks for duplicates — **queries the `stations.wholesale_code` column, a completely different namespace from `promo_codes.code`.** Reusing it as-is here would check collisions against the wrong table: it wouldn't catch a real duplicate against an existing attribution/promo code, and — confirmed `promo_codes` has a real unique index on `lower(code)` (`idx_promo_codes_code_lower`, `src/db.phase2.sql:48`) — a genuine collision would surface as a raw insert error (from `createPromoCode`'s `.insert()`) rather than the graceful `NAME2`-style auto-numbering partners get in the wholesale-code flow. Write a small equivalent that checks `promo_codes` instead:
   ```js
   const { buildBaseWholesaleCode, resolveAvailableCode } = require('./wholesale-code');
   async function createUniqueAttributionCode(supabase, partnerName) {
     const baseCode = buildBaseWholesaleCode(partnerName).replace(/^WS/i, ''); // drop the "WS" prefix — that prefix means "wholesale credit-buying code" elsewhere in this app; reusing it here for an unrelated attribution code would visually suggest the wrong thing to anyone reading the admin panel or the database
     const { data, error } = await supabase.from('promo_codes').select('code').ilike('code', `${baseCode}%`);
     if (error) throw error;
     const existing = new Set((data || []).map(row => String(row.code || '').toLowerCase()));
     return resolveAvailableCode(baseCode, existing).toUpperCase(); // promo_codes.code convention is uppercase (see normalizePromoCode in attribution.js) — wholesale codes are lowercase by convention, don't carry that over here either
   }
   ```
   This keeps the proven cleaning/truncation/numbered-suffix logic (`buildBaseWholesaleCode`, `resolveAvailableCode`) without inheriting the wrong table check or the wrong visual convention from a genuinely different feature.
4. Show the generated code back to the admin immediately in the success message — follow the exact pattern already used for showing the wholesale code after florist creation in an earlier phase (`✓ [Name] created — code: [CODE]`).

**Isolation notes:** this reuses `createPromoCode` as-is and `buildBaseWholesaleCode`'s cleaning logic only (not its collision-checker, per point 3 above) — the goal is not duplicating logic that already works, while still not blindly inheriting a check that's wired to the wrong table for this purpose.

**Test case:**
- Create a new partner end-to-end via the real admin UI: name + type + commission notes → confirm a consultant row AND a promo code row are both created, linked by `consultant_id`, and the code is shown to the admin immediately.
- Confirm the generated code actually works at real checkout — complete a real test purchase using it, confirm it attributes to the new consultant.
- Test name collisions (two partners with very similar names) — confirm the code generator's existing collision-numbering (already proven in an earlier phase) kicks in correctly here too, not just for florist wholesale codes.

**🐛 Bug hunt (find → fix → retest) — do this before running the Master Test Script:**
- What happens if consultant creation succeeds but the automatic promo-code creation fails right after (e.g. a transient DB error)? Does the admin end up with a consultant that has no code and no clear way to retry just the code part? Decide and implement a sane recovery path (e.g. a "Generate Code" button that appears if a consultant has no code yet) rather than leaving it as a silent dead end.
- Confirm creating a partner with an empty/missing commission-rate field doesn't break anything — it should be optional.
- Deliberately create two partners with names that clean down to the same base code (e.g. "Rose Garden" and "Rose Garden Ltd") — confirm the second one gets a numbered suffix against `promo_codes`, not a raw insert failure, and confirm it did NOT check/collide against `stations.wholesale_code` from the unrelated wholesale-credit feature (a code that happens to be free in one table but taken in the other should still resolve correctly for whichever table this step actually writes to).
- Re-verify Steps 2 and 3 still work correctly for a partner created through this new combined flow, not just for a consultant created the old way — confirm the whole chain (sign-up → first sale → referral → repeat purchase) genuinely works end-to-end for someone onboarded entirely through this new Step 4 flow, not just for pre-existing test consultants used in earlier steps' tests.
- If you find anything wrong: fix it, then re-run the full test case above.

---

## STEP 5 — Master Test Script (run after Steps 1–4 are all complete)

- Full end-to-end chain test, real data, not fragments: sign up a brand-new test partner via Step 4's flow → complete a real purchase with their code → generate a referral link from that purchase → complete a second real purchase via that referral link with no code typed in → complete a third real purchase using the auto-issued repeat-purchase code on the ORIGINAL customer → confirm all three purchases show `sales_consultant_id` pointing to the same test partner in the `orders` table.
- Confirm zero regression on plain, unattributed organic purchases (no code, no territory match, no referral) — still resolves to `attribution_source: none` exactly as before.
- Confirm zero regression on the existing postcode-territory attribution path (Col's earlier "Territory" feature) — a sale still correctly attributes via postcode when no code/referral is present, exactly as before this phase.
- Confirm via `git diff --stat` that only the files listed in Section 0 changed — nothing in Phase 5's renderer files, GCash logic, or Stripe checkout-amount code.
- Clean up all test consultants/codes/orders created during testing (matches this repo's existing convention — don't leave test data in the real database).
- Delete any scratch test files created for this testing before considering the phase done.

---

## ❓ Open questions to confirm with Col before or during this phase — do not silently guess

- Does he want commission **calculated automatically** (rate × sales) or is `commission_notes` free text enough for now? (Step 4 assumes free text; automatic calculation is a bigger, separate feature.)
- Does he want a dedicated "Partners" admin section, or is extending the existing "Sales Consultants" section (this guide's approach) sufficient? (See the flag in Section 0.)
- For Scenario A/B, does he want the referral/repeat-purchase attribution to have unlimited depth (a referred friend's own future referrals also chain back to the *original* consultant, indefinitely) or just one level deep (only the direct next purchase/referral, not their referrals' referrals)? This guide implements **one level deep** for both scenarios, matching exactly what he described — confirm before extending further.
