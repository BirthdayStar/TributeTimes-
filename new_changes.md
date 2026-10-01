# NEW CHANGES — Ongoing Client Revision Batch (Oct 2026)

**Client:** Colin McCabe ("Col"). **Process locked by his own words (1 Oct 2026):** *"client send me more changes i will send you one by one, kinfly properly analyze and add stp by step in new_changed md, every step write properly analzye first and then wwrite problem solution tst bugs find live browser tst then move next."*

This file is the running log for this ongoing batch of client-reported issues/requests, arriving one at a time. Each one gets its own numbered step below, added **as it arrives** — this file grows over time, it is not written all at once from a single spec document (unlike `phase5.md`/`phase6.md`, which were scoped upfront from Col's own written requirements).

---

## 0. Process for every step (read this before adding a new one)

For **every single item** Col sends, in order:

1. **Analyze first** — read the actual current code/live site before assuming anything. Confirm the real root cause (reproduce it, don't guess from the screenshot alone).
2. **Write the step below** — Problem (what's actually wrong, verified), Solution (what will change and why), Isolation notes (what this does and doesn't touch).
3. **Implement.**
4. **Find bugs for real** — not just a code read-through. Actually exercise the change.
5. **Live browser test** — real browser (local first, then production after deploy), not just "looks right in the code."
6. **Only then move to the next item.** Do not batch multiple client messages into one step unless Col explicitly says they're one request.

**Do not touch anything not named in the step being worked on.** If a step's fix seems to require touching an unrelated area, stop and confirm with Col before expanding scope — same discipline as every other phase file in this repo.

**Established project constraints that apply here too** (carried over from the rest of this session/project, not repeated per-step below):
- No automated migration runner — any DB schema change needs a new `src/db.phaseN.sql` file (check the highest existing number first) and Col must run it manually in Supabase's SQL editor.
- Always clean up test data/test accounts/test files afterward, verified with a follow-up query/listing showing zero leftovers.
- Production deploys from whichever branch Render is actually configured to watch — confirm current deploy target before assuming a push will go live; poll the live URL for a real marker after pushing rather than assuming deploy time.
- `origin` = real production repo; `me-origin` = personal backup fork with its own history — never force-push to either, reconcile with a real merge if they diverge.
- Report outcomes plainly — if something doesn't work, say so with real evidence (test output, screenshot), not a hopeful guess.

---

## Revision 1 — Landing page batch (completed before this file existed)

For reference/continuity only — this batch was already fully analyzed, implemented, tested, and deployed (confirmed live on tributetimes.co.nz, 29 Sept–1 Oct 2026) before Col asked for this file to be kept. Not re-documented step-by-step here since it predates this log; summarized for context:

- Removed price from the "Simple, Transparent Pricing" Digital Edition card.
- Deleted the "Contact a Station Manager" box entirely (HTML, JS, CSS).
- Deleted the bottom "Make Their Day Unforgettable" CTA banner (redundant with 4 other identical CTAs already on the page).
- Removed the footer country selector (header selector remains as the one control).
- Replaced the header logo (background removed, corrected proportions after a real stretch bug was found and fixed — see that bug's root cause below, since the same class of issue could recur).
- Shortened navbar links to single words (FLORISTS, STATIONS, AGENTS, etc.).
- Replaced the hero image with a real keepsake screenshot, styled with a floating shadow + slight tilt.
- Removed the "PERSONALISED VINTAGE NEWSPAPER KEEPSAKES" subtitle; realigned and resized the logo against the nav-links row.
- **Real bug found and fixed:** the logo appeared visually stretched in the header. Root cause (confirmed by measuring the live rendered element, not guessed): `.nav-brand` was `display: flex; flex-direction: column` with no `align-items` set, so its default (`stretch`) silently overrode the logo image's own `width: auto` intrinsic sizing — rendering it ~3.4x wider than its real aspect ratio. The image file itself was verified pixel-correct throughout; the bug was purely the flex container. Fixed by removing the now-unnecessary column layout once the subtitle (the other child) was removed.

---

## STEP 1 — Delete the "Simple, Transparent Pricing" / Digital Edition card entirely

**Client message (1 Oct 2026, Col, screenshot of the exact card):** *"Is there any reason a customer would want to know any of this? These are things we've discussed and somehow you've made part of tge design. Let's delete tge whole box please."*

**Analysis (verified in code before writing this):**
- The box in his screenshot is the `<section class="pricing-section">` block in `public/landing.html` — heading "CHOOSE YOUR EDITION" / "Simple, Transparent Pricing", containing one `.pricing-card` ("Digital Edition") with an icon, description, a 4-item feature checklist (high-res PDF, locked A4 geometry, historical data, dedication space), and a "Get Digital Edition" button linking to `/public?tier=digital`.
- Col's objection is specifically that the feature-checklist content ("Locked A4 single-page template geometry," etc.) is internal/technical detail he and the team discussed internally — not something a customer needs to see. His ask is to delete the whole box, not trim the list.
- **This is a genuinely separate section from the country-flag pricing strip** ("One Keepsake, Priced For Where You Are," `class="local-pricing-section"`) a bit further up the page — confirmed by reading both blocks and their CSS class names (`pricing-*`/`tier-*`/`btn-tier` vs `local-price-*`). That section is untouched by this step; nothing in his message or screenshot refers to it.
- **Checked whether this box is the only path to checkout** before deleting anything that removes a CTA: confirmed 3 other `<a href="/public">` buttons already exist elsewhere on the landing page (header "CREATE YOURS", hero "CREATE YOUR NEWSPAPER", "A Newspaper That Tells Their Story" section "CREATE YOURS TODAY") — removing this 4th one does not remove the only way to reach the checkout flow.
- **Checked every CSS class used inside this section** (`.pricing-section`, `.pricing-grid`, `.pricing-card` + `::before`/`:hover`, `.tier-icon`, `.tier-title`, `.tier-description`, `.tier-price-val` — already unused since the Step-0/earlier price removal, `.price-currency`, `.tier-features-list`, `.tier-feature-item`, `.tier-feature-check`, `.btn-tier` + `:hover`, plus one responsive override `.pricing-card { padding: ... }` in the `max-width: 992px` media query) — all of them are scoped to this one section only, none shared with any other part of the page. Safe to delete the whole block, no partial-removal risk.

**Problem:** the box exists and shows customer-irrelevant internal/technical detail Col never wanted presented this way.

**Solution:**
1. Delete the entire `<section class="pricing-section">...</section>` block from `public/landing.html`.
2. Delete its dedicated CSS block (`.pricing-section` through `.btn-tier:hover`) and the one responsive override line for `.pricing-card`.
3. Leave `local-pricing-section` (the country-flag strip) and every other CTA button on the page untouched.

**Isolation notes:** this section sits between the "A Newspaper That Tells Their Story" feature block and the (hidden, `display:none`) testimonials section — removing it just closes that gap in the page flow; nothing else references its markup or classes.

**Test case:**
- Real browser, local: confirm the "CHOOSE YOUR EDITION" / "Simple, Transparent Pricing" heading and the Digital Edition card are both gone from the page.
- Confirm the page still flows cleanly from "A Newspaper That Tells Their Story" straight to the next visible section, no leftover gap/empty space.
- Confirm no console/page errors from the removal.
- Confirm the other 3 `/public` CTA buttons on the page still work (checkout flow still reachable).
- Confirm `local-pricing-section` (country flags/prices) is completely unaffected.

**🐛 Bug hunt:** check for any other reference to `.pricing-card`/`.tier-*`/`.btn-tier` class names anywhere else in the file (JS selectors, other markup) before deleting the CSS, in case something unexpected depends on them beyond what a static grep already found. Result: none found — grepped for `querySelector`/`getElementById`/`getElementsByClassName` against every class name in this section, zero matches. Safe.

**Test results (real browser, local, 1 Oct 2026) — 11/11 passed:**
- "CHOOSE YOUR EDITION" / "Simple, Transparent Pricing" headings gone
- Digital Edition card content (feature checklist, "Get Digital Edition" button) gone
- `.pricing-card`/`.pricing-section` no longer exist in the DOM
- `.local-pricing-section` (country-flag strip) fully intact — heading present, all 5 country cards present
- 3 other `/public` CTA buttons still present and working
- No console/page errors
- Full-page screenshot reviewed: page now flows directly from "How It Works" into "Celebrate Life's Most Meaningful Moments," no gap left behind

**Status:** ✅ done, tested locally, committed. Not yet pushed/deployed — see commit for exact hash once pushed.
