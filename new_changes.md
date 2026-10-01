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

---

## STEP 2 — Restructure the header: full-width logo banner, nav menu in its own row below

**Client message (1 Oct 2026, Col, screenshot with red circle around the current logo+nav row):** *"I meant the 'tribute logo times' image would be stretched across the whole page so that become the website header. The menu would sit immediate below that. Does that make sense. Please ask if you don't understand."*

**Clarification asked and answered:** the literal reading ("stretched across the whole page") would mean distorting the actual logo image file edge-to-edge — badly blurring/warping a compact text+seal+text lockup that was never designed as a wide banner graphic. Asked Col directly whether he wanted the image itself distorted, or just its containing header band to span full width with the logo staying undistorted inside it. **His answer: keep the logo image itself undistorted ("keep logo same") — find whichever approach fulfils the actual intent (a prominent full-width header banner with the nav below it) without the distortion problem.**

**Analysis (verified in code before writing this):**
- Current structure: `<header class="container"><nav class="navbar">...</nav></header>` — a single row containing the logo (left), nav links (center), and country-selector + CTA button (right), all side-by-side.
- `.container` (the class on `<header>`) is `max-width: 1180px; margin: 0 auto; padding: 0 24px` — this is why the header currently sits in a centered, width-capped column rather than spanning the page edge-to-edge. This is the actual mechanism to change to get a "full width" header.
- The logo image itself (`public/logo_header.png`) is a horizontal lockup (text—seal—text, ~3:1 aspect ratio) sized for sitting compactly in a single nav row, currently rendered at `height: 80px`. It is not a wide banner-shaped asset — stretching it to span ~1400px+ of viewport width while keeping it at a normal height would require either (a) distorting its aspect ratio (what Col confirmed he does NOT want), or (b) scaling it up hugely to fill the width at its real ratio, which would make it enormous and push the nav far down the page.
- **Resolution:** split the current single `<header>` row into two: Row 1 is a genuinely full-width band (no `.container` max-width constraint) with its own background, containing just the logo — centered, at a sensible size, not distorted or stretched. Row 2 is the existing nav menu (links, country selector, CREATE YOURS button), kept at the normal `.container` width to match the rest of the page's content width, sitting directly below Row 1. This satisfies "the logo image would become the website header" (its own full-width band, the first thing a visitor sees) and "the menu would sit immediately below that" literally, without distorting the actual image file.

**Problem:** the current header is a single compact row; Col wants the logo elevated into its own prominent full-width header band, with navigation as a clearly separate row beneath it.

**Solution:**
1. Split `<header class="container"><nav class="navbar">` into two sibling elements: a new full-width `<div class="header-logo-band">` (own background color/padding, no `.container` width cap) containing the centered logo, followed by `<header class="container"><nav class="navbar">` (nav links + country selector + CTA button only, logo removed from this row).
2. New CSS for `.header-logo-band` — full viewport width, centered content, a background color/texture consistent with the site's palette (not a plain color clash), enough vertical padding that it reads as a real banner, not just a slightly taller strip.
3. Logo size inside the band: larger than the current 80px (since it now has a whole dedicated row to itself) but capped at a sensible max so it doesn't dominate the page at wide viewports — same `width: auto` discipline as before so it never distorts.
4. `.navbar`'s CSS stays otherwise the same (flex row, space-between) minus the logo/`.nav-brand` piece, which moves to the new band.

**Isolation notes:** this only touches the `<header>` markup/CSS at the very top of `public/landing.html` — no other section, no JS behavior (country selector / CTA button logic unchanged, just relocated within the same page), no other page (`/florist`, `/station`, `/join`, `/public` etc. have their own separate headers, confirmed not shared markup with landing.html).

**Test case:**
- Real browser, local: confirm the logo sits in its own full-width band, centered, undistorted (natural aspect ratio preserved — measure rendered width/height ratio against the image's natural ratio, same method used to catch the earlier stretch bug).
- Confirm the nav menu (HOME/FLORISTS/STATIONS/AGENTS/CONTACT, country selector, CREATE YOURS button) renders immediately below the logo band, not overlapping or with an awkward gap.
- Confirm responsive behavior at mobile width still works sensibly (nav already collapses to a column at `max-width: 680px` — confirm the new two-row structure doesn't break that).
- Confirm no console/page errors.
- Screenshot both the full header and a zoomed crop of just the logo band for visual review before calling this done.

**🐛 Bug hunt:** re-check the "flex column + align-items stretch" bug class (the same root cause as the earlier logo-stretch bug) doesn't reappear in the new band's container — explicitly verify the logo's rendered aspect ratio matches its natural ratio after the restructure, don't just eyeball it. Result: avoided by construction — `.header-logo-band` is a single-child flex row (not a column), so there's nothing for `align-items: stretch` to distort in the cross-axis the way the old bug happened; confirmed anyway by measuring rendered vs. natural ratio directly (see test results).

**Test results (real browser, local, 1 Oct 2026) — 9/9 passed:**
- Logo band genuinely spans full page width (measured: 1918px band = 1918px body, no `.container` cap)
- Logo image loads correctly
- Logo rendered aspect ratio (361.6/120 = 3.013) matches its natural ratio (1600/531 = 3.013) exactly — confirmed NOT distorted
- Nav menu sits directly below the logo band with zero gap and zero overlap
- Old `.nav-brand`/`.brand-logo-img` classes fully removed from the DOM
- All 5 nav links, the CREATE YOURS button, and the country selector all still present and correctly labelled
- No console/page errors
- Screenshot reviewed: clean white full-width banner with the logo centered and prominent, nav row in its own band directly below on the page's normal cream background — matches Col's description exactly
- Also checked mobile viewport (400px): logo band scales down sensibly via its `max-height: 14vw` cap, nav row's existing mobile behavior (collapses to just country selector + CTA button, text links hidden) is pre-existing and unaffected by this change

**Status:** ✅ done, tested locally, committed. Not yet pushed/deployed.
