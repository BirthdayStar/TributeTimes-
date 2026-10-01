# NEW CHANGES — Ongoing Client Revision Batch (Oct 2026)

**Client:** Colin McCabe ("Col"). **Process locked by his own words (1 Oct 2026):** *"client send me more changes i will send you one by one, kinfly properly analyze and add stp by step in new_changed md, every step write properly analzye first and then wwrite problem solution tst bugs find live browser tst then move next."*

This file is the running log for this ongoing batch of client-reported issues/requests, arriving one at a time. Each one gets its own numbered step below, added **as it arrives** — this file grows over time, it is not written all at once from a single spec document (unlike `phase5.md`/`phase6.md`, which were scoped upfront from Col's own written requirements).

---

## 0. Process for every step (read this before adding a new one)

For **every single item** Col sends, in order:

1. **Analyze first** — read the actual current code/live site before assuming anything. Confirm the real root cause (reproduce it, don't guess from the screenshot alone). Grep for every class/selector/id touched and confirm what else (if anything) depends on it before deciding it's safe to change.
2. **Write the step below** — Problem (what's actually wrong, verified), Solution (what will change and why), Isolation notes (what this does and doesn't touch).
3. **Implement.**
4. **Find bugs for real — go looking, don't wait to trip over one.** A code read-through is not enough; this means deliberately trying to break the change, not just confirming it works in the one case you built it for:
   - **Adjacent/edge cases, not just the happy path** — empty states, the longest realistic piece of content next to the shortest, what happens if a dependent field is missing/null, what the *previous* behavior was and whether anything still expects it (e.g. an old CSS class, a JS selector, a stale comment referencing something now removed).
   - **Everything the change sits next to** — re-check the sections/elements immediately before and after it in the page flow, not just the thing itself in isolation. A deletion can leave a gap; a restructure can shift something else's spacing/alignment; a new section can collide with an existing one.
   - **Every viewport that matters** — desktop (the width you built it at), a laptop-ish mid width, and mobile (the project's existing breakpoints: `992px` and `680px` in `public/landing.html` — check whether the change needs its own entry in either `@media` block, don't assume the old responsive rules still apply correctly to new markup).
   - **Re-derive any number you report, don't eyeball it** — if a test claims "no longer stretched" or "same height" or "aligned," measure it in the browser (`getBoundingClientRect`, computed styles, natural vs. rendered dimensions) and show the actual numbers, the same way the Step 1/2 logo-stretch bug was only caught by measuring rendered-vs-natural aspect ratio instead of trusting how it looked in a screenshot.
   - **If a test assertion fails, find out why before explaining it away.** Distinguish a real app bug from a flawed test (wrong selector, timing/race condition, stale server) by direct evidence — re-run against a freshly-confirmed-correct server, check the actual DOM/response, don't assume "it's probably just the test."
5. **Live browser test — real browser automation, not a code read-through dressed up as a test.** Local first (confirm the actual running server is serving the current code — this project has repeatedly hit a stale/wrong server on port 3000; verify the page `<title>` or a known marker before trusting any test result), screenshot the actual visual result and look at it, then re-verify against production after deploy with the same checks (don't assume a local pass means the deploy is correct — confirm via a real marker in the live response, poll rather than guess timing).
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

**Known gap in this step's testing (flagged honestly, not re-opened unless it matters):** mobile viewport was not explicitly screenshotted for this step — the removed section had no mobile-specific CSS of its own (confirmed: no `.pricing-*`/`.tier-*` class appeared in either `@media` block before deletion), so there's no plausible mobile-only failure mode, but this was inferred from the CSS rather than directly screenshotted the way Step 2 was. Worth a quick mobile check if this area is revisited.

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

**Known gaps in this step's testing (flagged honestly):**
- Confirmed the country selector dropdown is *present* in the DOM after the restructure, but did not re-click it to confirm the open/close + country-switch *interaction* still works end to end (its JS selectors target ids, not the moved `.nav-brand`/logo markup, so this is low-risk — but "low-risk" isn't the same as "tested," and this was the exact kind of assumption that missed the Step 1/2 logo-stretch bug the first time around).
- Did not test a genuine mid-width/tablet viewport (e.g. ~900–1000px) between the two confirmed widths (1918px desktop, 400px mobile) — the `max-width: 992px` breakpoint in this file could behave differently there and wasn't directly checked.
- If this area gets touched again, close both gaps with a real interaction test (click the selector, confirm a different flag renders) and a tablet-width screenshot before calling it done.

**Status:** ✅ done, tested locally, committed. Not yet pushed/deployed.

---

## STEP 3 — Rewrite "How It Works" to match the real 12-step process, grouped into 3 sections

**Status: ANALYSIS ONLY per explicit client instruction — do not implement yet.** Col: *"just anayze and keep this step in new changes not implemnt, divide into multipe steps ifeneded evry stps has own problem soltion testing bugs find browser test."*

**Client message (1 Oct 2026, Col, plus a reference screenshot):** the current "How It Works" section doesn't reflect what actually happens. He drafted a correct 12-step process, then had a separate Claude session restructure it into 3 grouped sections (Create / Check and buy / Print and give) — his own words: *"Actually got Claude to redo this and he did a better job. Instead of a list of 12 split into 3 areas."* He wants that 3-group version used, and attached a screenshot specifically to show which text should render bold vs. normal weight within it.

**Follow-up message, same day, before this step was implemented:** Col sent two more requirements for this same section before any code was written (folded in here rather than as a separate step, since they're additions to this not-yet-built section, not a new request):
1. **A small icon next to each of the 12 lines**, his own mapping:
   - ✅ green tick — default/general lines (not otherwise specified below)
   - ⏳ — the "Click Create" line (step 4)
   - 🖨️ — the "Print" line (step 9)
   - 💳 — the payment line (step 7)
   - ❤️ — the "Present it" line (step 10) **and** the "Who's next?" line (step 12)
   - 🎁 — the "Come back" line (step 11)
2. **"The text needs to be large"** — his own stated reason: *"I think this overcomes the issue the lady from the florist association had"* — referring back to real client-reported feedback from a NZ Florist Association contact earlier in this project (*"The landing page is confusing... Florists are very visual and we like to see what we're getting"*). Large, clear text + a visual icon per step is Col's answer to that specific, already-documented complaint — not a new/unrelated request, so treat "readable at a glance" as the actual bar for this section's type sizing, not just "a bit bigger than now."

**This resolves the open "bold vs. normal per-item" question from the original analysis below** — Col's answer wasn't about bold text at all, it's icons instead. Treat the 3 group headers (Create / Check and buy / Print and give) as the only bold text in this section; every numbered line gets its mapped icon instead of inline bold.

**His final approved copy, with icons (verbatim text + Col's icon mapping, this is the content to use):**

> **How It Works**
>
> **Create**
> ✅ 1. Enter your special date
> ✅ 2. Enter the recipient's name
> ✅ 3. Enter your personal message
> ⏳ 4. Click Create. This can take up to 60 seconds while our system searches the internet for your date.
>
> **Check and buy**
> ✅ 5. Preview your newspaper. A screen image appears, protected with a security overlay.
> ✅ 6. Happy with it? Continue to payment.
> 💳 7. Make your payment. Use a discount code if you have one.
> ✅ 8. Download your high-resolution PDF.
>
> **Print and give**
> 🖨️ 9. Print it at home, as often as you like. It's yours! We recommend high-quality paper and a simple frame from your local print shop.
> ❤️ 10. Present it to the recipient and wait for the smile. That's your reward for being so thoughtful 😇
> 🎁 11. Come back and leave us a review to receive a second discount offer.
> ❤️ 12. Who's next? Who else would you like to put a smile on today?

**Analysis (verified in code before writing this):**
- Current section: `<section class="how-it-works">` in `public/landing.html`, heading "SIMPLE TO CREATE" / "How It Works", containing `.steps-grid` — a 3-column CSS grid of 3 simple `.step-card`s (icon circle + title + one-line description each): "Pick a Date," "We Craft It," "You Treasure It." This is a fundamentally different *shape* of content from the replacement — 3 short cards vs. 3 headed groups each containing 3–4 numbered steps (12 items total, with one list item — step 12 — being a closing/emotional line rather than an instruction).
- **This is a bigger structural change than a text edit**, not a simple copy swap into the existing `.step-card` markup — the existing cards have no room for a 3–4-item numbered sub-list each. New markup/CSS is needed.
- **Icon + large text, not bold text, is the confirmed visual treatment for individual lines** (see follow-up message above) — group headers stay bold, each numbered line gets its mapped icon plus larger body text than the current `.step-desc` size.
- **This already has an established emoji-reliability precedent in this exact codebase to watch for**: the social-platform icons in the Agents/admin work earlier in this project were deliberately swapped from emoji to real inline SVGs because Windows' system emoji font was confirmed to silently render some emoji as blank/wrong glyphs. Col's 6 icons here (✅⏳🖨️💳❤️🎁) are common, well-supported emoji (unlike the less-common flag glyphs that actually failed before), so this is lower risk than that prior case — but it still needs a real cross-platform check before calling it done, not an assumption. See Step 3c below.
- **Does NOT need DB/backend changes** — this is pure landing-page copy/markup/CSS, same category as Steps 1–2.
- **Open structural question to resolve before implementing** (not asked yet): with 12 items grouped into 3 sections, does Col want this to keep the current 3-column side-by-side grid layout (3 columns, each a tall card with its own mini numbered list), or does a 12-item list read better stacked vertically down the page (3 sections, one after another, full width)? The 3-column grid works well for 3 short cards; it may feel cramped with 3–4 list items packed into each column at normal page width, especially now that each line also needs to be visually larger per Col's "text needs to be large" requirement — if anything this makes the stacked/full-width option more likely to be the right call, but still worth confirming rather than assuming. Recommend asking Col for a quick preference (or showing both) before building, same as any other layout decision this size.

**Planned sub-steps (to be written up individually, each with its own Problem/Solution/Test/Bug-hunt, once implementation starts):**

- **Step 3a — confirm the one remaining open question with Col before writing any code.** (The bold/normal-text question is resolved — icons + large text per line, bold headers only, per his follow-up message above. Only the layout-shape question is still genuinely open.)
  - Layout shape: 3-column grid (current structure) vs. stacked full-width sections. Given Col's own "text needs to be large" requirement makes 3–4 large-text+icon lines packed into one column at normal page width more likely to feel cramped, lean toward recommending the stacked/full-width option when asking — but still ask, don't just decide. Show a quick mockup of both if asking isn't enough on its own, same as other layout-sized decisions this session.
  - **Test for this sub-step:** there's nothing to browser-test here — "done" means Col has given an unambiguous answer on the layout question in writing, not an implementation detail.

- **Step 3b — build the new 3-group markup + CSS**, replacing `.steps-grid`/`.step-card` entirely (nothing from the old 3-card version is preserved/merged — confirmed the old content, "Pick a Date"/"We Craft It"/"You Treasure It," is fully superseded by the new copy, not a partial edit).
  - **Specific things to get right, not just "build it":** heading hierarchy (the 3 group headers need a real heading element, not just a bold CSS class — screen readers and the page's own heading outline should reflect the real structure); the numbered list must render as real ordered-list numbers 1–12 continuing across all 3 groups (not 3 separate 1-4/1-4/1-4 restarts) unless Col's screenshot actually shows restarted numbering per group — check this specifically against his reference image before building, don't assume; each line's icon needs an `aria-hidden="true"` (decorative, the numbered text already conveys the meaning) so screen readers don't awkwardly announce "green check mark" before every line; text size must actually satisfy "the text needs to be large" — pick a concrete size, don't just bump it slightly and call it done, and sanity-check it reads clearly at a normal viewing distance on a real screen, not just "technically bigger than before."
  - **Bug hunt for this sub-step:** grep for `.steps-grid`/`.step-card`/`.step-icon-wrap`/`.step-title`/`.step-desc` anywhere else in the file before deleting the old CSS (same check pattern as Step 1); check the `max-width: 992px` and `max-width: 680px` media queries for any existing rule targeting these old classes that will need a new equivalent for the new markup, not just left stale.

- **Step 3c — verify all 7 icons (✅⏳🖨️💳❤️🎁 + the existing 😇 in step 10's own text) render correctly across platforms**, given this session already found and fixed a near-identical "emoji renders as a blank/wrong glyph on some platforms" problem once before (the social-platform icons were swapped from emoji to real SVGs for exactly this reason — see the agent-profile work earlier in this project). Col's icon set here is more common/widely-supported than the flag glyphs that actually failed before, so lower risk — but "lower risk" still isn't "verified," so this gets the same real check, not a pass based on that assumption.
  - **Specific test, not just "check it looks fine":** render the real page in at least two different environments (e.g. this Chrome-based test browser, plus ask Col to check on his own phone/Windows machine specifically) before accepting any of the 7 icons as final — Windows' system emoji font has previously been confirmed in this codebase to silently fall back to a blank/text glyph for some emoji; check each of the 7 individually, not just one and assume the rest are fine.
  - If any renders wrong anywhere tested: either pick a different Unicode emoji with better cross-platform support for that one line, or follow the established precedent in this codebase and use a small inline SVG instead for that icon specifically.

- **Step 3d — full real-browser test + live verification.**
  - Desktop (page's normal build width), the `992px` breakpoint specifically (not just "mobile" — confirm the exact pixel width where the current `.steps-grid` rule changes behavior and test just above/below it), and `680px` and below.
  - Confirm the ordered-list semantics are real (`<ol>`/`<li>`, not divs faked to look like a list) by checking the actual DOM, not just the visual rendering.
  - Confirm every one of the 12 lines has its correct mapped icon per Col's spec above (✅ x7 default lines, ⏳ step 4, 💳 step 7, 🖨️ step 9, ❤️ steps 10 and 12, 🎁 step 11) — check this against the actual rendered DOM/screenshot line by line, not just "icons are present somewhere."
  - Re-run the same "did this disturb anything else on the page" check used for Steps 1–2 — screenshot the sections immediately before and after this one, confirm no new gap/overlap.
  - After deploy: re-verify against the live URL with the same checks, confirm via a real marker in the live response rather than assuming the deploy succeeded.

**Status:** 📝 documented only, per explicit instruction not to implement yet. Waiting on Col's confirmation of the layout-shape question (Step 3a) before any code is written.

---
## OPEN QUESTION — Col: "why do we have the bar of flags, what do they do?"

**Col's message (verbatim):** *"I've asked this question before too, why do we have the bar of flags, what do they do? Other than advise price per newspaper in their local currency, it doesn't seem to link to anywhere on the website that I can see."*

**Answer (verified by reading the actual code, not guessed):** Col is correct, and that's the full extent of what it does. Read `applyPricingCountry()` in `public/landing.html` — the function behind `.local-pricing-section` / `#local-price-grid` (the flag strip). It does exactly two things when a flag is selected:
1. Updates the `.hero-price` text to show that country's price in local currency.
2. Toggles an `is-local` CSS class on the matching `.local-price-card` to visually highlight it.

That's it — no navigation, no link, no filtering, no connection to checkout or the `/public` flow. It is purely a "see your price in your currency" display widget. Confirmed via grep: no `href`, `onclick` navigation, or checkout-param wiring anywhere in that function or its surrounding markup.

**To relay back to Col:** confirm this is intentional/fine as-is, or ask if he wants it to do more (e.g. actually pass the selected currency/country into the `/public?...` checkout flow). No code changed — this is informational only, pending his reply.

---
## NOTED — Col: upcoming admin-page cosmetic changes (not started)

**Col's message (verbatim):** *"Once we have co.pleted tge landing page ill give you some changes to tge admin page. Only cosmetic changes. Like text size etc."*

Col has explicitly deferred this himself until the landing page work (Steps 1–3+) is finished. No action needed now — tracked here only so it isn't lost. Do not start until Col sends the actual list of admin-page changes.

---
## STEP 4 — Stats bar: remove 2 of 4 boxes, reword the remaining "Digital & Print" label

**Client message:** Screenshot of the stats bar (the 4-box row below the hero: "72 Keepsakes Created", "100% One-Page Geometry Locked", "NZ Delivery / Printed & Dispatched Locally", "Digital & Print / Instant PDF or Postal Delivery"). Red marks cross out the 2nd box ("100% One-Page Geometry Locked") and 3rd box ("NZ Delivery / Printed & Dispatched Locally") entirely, and strike through the label text of the 4th box. Col's instruction: *"Please change this info box. Make text line read 'instant pdf delivery, print at home'"*.

**Analysis (code read, not guessed):** This is `<section class="stats-bar">` in `public/landing.html:980-1009` — 4 `.stat-item` children in a CSS grid (`.stats-bar { grid-template-columns: repeat(4, 1fr); }`, `public/landing.html:401`). Each item is icon + `.stat-value`/`.stat-label` pair:
1. `✨` 72 (dynamic, `id="keepsakes-created-value"`) — "Keepsakes Created" — **keep, untouched**
2. `📰` "100%" — "One-Page Geometry Locked" — **crossed out, delete entirely**
3. `🇳🇿` "NZ Delivery" — "Printed & Dispatched Locally" — **crossed out, delete entirely**
4. `⚡` "Digital & Print" — "Instant PDF or Postal Delivery" — **keep the box, change the label text only**

**Problem:** Two of four boxes are no longer accurate/wanted (likely because "Printed & Dispatched Locally" / postal delivery no longer matches how the product actually works — it's self-print-at-home, not a printed/posted item — which is also why box 4's label is being corrected to say "print at home" instead of implying postal delivery). Leaving them in contradicts the corrected messaging on box 4.

**Solution:**
1. Delete stat-item 2 (`100%` / `One-Page Geometry Locked`, lines ~988–994) and stat-item 3 (`NZ Delivery` / `Printed & Dispatched Locally`, lines ~995–1001) entirely — markup only, nothing else references these two boxes elsewhere (confirm via grep before deleting).
2. Change stat-item 4's `.stat-value` text from "Digital & Print" — Col didn't cross out the value line, only the label line, so leave "Digital & Print" as-is unless he says otherwise.
3. Change stat-item 4's `.stat-label` text from "Instant PDF or Postal Delivery" to **"Instant PDF delivery, print at home"** — exact client wording, lowercase as given (confirm with Col if he wants it capitalized to match the site's existing title-case label style, e.g. "Instant PDF Delivery, Print At Home" — the other 3 labels are title case: "Keepsakes Created", "One-Page Geometry Locked", "Printed & Dispatched Locally" — so going with title case to match existing pattern is the safer default, but flag this to Col rather than silently deciding).
4. Fix the grid: `.stats-bar` is `grid-template-columns: repeat(4, 1fr)`. With only 2 items left, this must become `repeat(2, 1fr)` (desktop) or the two remaining boxes will be squashed into half the row with empty space on the right. Check the two responsive overrides too: `@media (max-width: 992px)` currently sets `repeat(2, 1fr)` (line 870) — with 2 items total this becomes redundant but harmless; `@media (max-width: 680px)` sets `repeat(1, 1fr)` (line 883) — stays correct for 2 items stacking on mobile.

**Isolation notes:** this only touches `<section class="stats-bar">` and its own CSS rule plus the 2 responsive overrides of that same selector — no other section references `.stat-item`/`.stat-value`/`.stat-label` classes (confirm via grep before editing). Confirmed by reading `public/landing.html:1447-1462`: box 1's counter is driven by `loadKeepsakesCreatedStat()`, which does `document.getElementById('keepsakes-created-value')`, fetches `/api/public/stats`, and sets `el.textContent` — it does **not** touch boxes 2/3/4 or iterate `.stat-item` by index/position, so deleting boxes 2 and 3 cannot break this function. The one real risk is if the deletion accidentally also removes or renames the `id="keepsakes-created-value"` div itself (e.g. a sloppy block-delete that takes the wrong `<div class="stat-item">...</div>` boundaries) — the fix must delete *only* stat-items 2 and 3's markup and leave stat-item 1's `id` byte-for-byte untouched.

**"one more same with image add also"** — Col's own message also said he'd send "one more same [change] with image" — meaning expect a **second, related screenshot/request** for this same stats-bar area (or similar), not yet received. Do not treat Step 4 as fully scoped until that follow-up arrives; check with Col or wait for the next message before marking this done if it's visibly incomplete relative to what he described.

**Test case:**
- Desktop: confirm exactly 2 stat boxes render ("Keepsakes Created" with live count, and "Digital & Print" with new label text), evenly spaced, no leftover empty grid cells, no stray third/fourth gap from a grid rule that wasn't actually updated.
- Confirm label text reads exactly "Instant PDF delivery, print at home" (or the title-cased variant, whichever Col confirms) — character-for-character, not paraphrased. Check for trailing/leading whitespace and curly vs straight apostrophes if any get introduced by copy-paste.
- `992px` and `680px` breakpoints: confirm no visual regression now that there are 2 items instead of 4 (recheck both `repeat(2,1fr)` and `repeat(1,1fr)` rules render correctly with only 2 children — don't just trust the CSS change was made, screenshot both widths and look).
- Load the page fresh (hard refresh / disable cache) and confirm box 1's count still populates from `/api/public/stats` — i.e. it changes from the placeholder `—` to a real number, not stuck on `—` (which would indicate the fetch or the element lookup broke).
- Throttle/slow the network (or just observe on first paint) to confirm the `—` → real-number swap for box 1 doesn't visually conflict with the now-shorter 2-box row (e.g. no layout jump when the number loads, since `.stat-value` has `style="font-size:1.65rem"` inline and the box width changed from `25%` to `50%` of the row).

**Bug hunt:**
- Grep for `.stat-item`, `.stat-value`, `.stat-label`, `.stat-icon`, `.stats-bar`, and specifically `keepsakes-created-value` across the whole file (including the `<script>` block) to confirm the id isn't duplicated or referenced anywhere a careless edit could silently rename/orphan it.
- Diff the actual deleted HTML block against lines 988–1001 in the original file before committing — confirm the deletion boundary starts exactly at `<div class="stat-item">` for box 2 and ends exactly at `</div>` closing box 3, not one tag early/late (an off-by-one here would either leave an orphaned `</div>` breaking the grid's DOM structure, or accidentally delete part of box 1 or box 4).
- Screenshot the hero section (`public/landing.html:977` close) immediately above and the "LOCAL PRICING STRIP" section (`public/landing.html:1011`, heading "One Keepsake, Priced For Where You Are") immediately below to confirm no spacing/overlap regression from shrinking this section's height — `.stats-bar` has `margin-bottom: 90px`, confirm that's still visually correct with a shorter row.
- Verify in the real rendered DOM (via `document.querySelectorAll('.stat-item').length`, not just a visual look) that exactly 2 `.stat-item` elements remain — not 4 with 2 hidden via CSS/`display:none` (that would be a lazy fix, not a real deletion, and would leave dead markup plus keep the deleted content in page source/SEO).
- Check for a flash-of-wrong-content on load: since box 1's value is fetched async, confirm the 2-box grid doesn't render with visibly mismatched heights for the ~0.1-0.5s before the fetch resolves (box 1 showing `—` placeholder vs box 4's static text) — not a blocker, but note it if it looks jarring.
- After deploy: re-check the live `/api/public/stats` response actually returns a `keepsakesCreated` field with the expected shape — don't assume the API still matches what the front-end expects just because the front-end code wasn't touched.

**Status:** 📝 documented, not yet implemented. Needs 2 confirmations from Col before/while building: (1) exact casing for the new label text, (2) what the "one more same with image" follow-up refers to, since it may change scope.

---
## STEP 5 — Admin panel: "Promo Codes Directory" shows wrong/mixed data, Col suspects financial reporting is broken

**Client message:** Screenshot of the admin panel's codes table (columns CODE / AGENT / M... truncated, "Showing 21 to 29 of 29 entries") — rows: `THANKYOU-355C0649`, `THANKYOU-0034F6D7`, `THANKYOU-5866A300`, `THANKYOU-62A0CB4B`, `THANKYOU-3E76B77F`, `GCASHB3FCD9C6`, `TEST21`, `TEST20`, `WELCOME20`, all with `Agent = Unassigned` and a `0` in the next column. Col: *"Are all of these thank you codes, promo codes that are issued after someone buys one?? I dont think the admin panel is actually working. Its reporting as if it is, but the financial side doesn't seem to work properly. I'll investigate more."*

This is a genuine functional/financial-reporting question, not a cosmetic request — treated as its own analysis step rather than folded into Step 4.

**Analysis (code-verified via full investigation of `src/phase2/second-purchase-discount.js`, `public-checkout.js`, `admin-fulfilment.js`, `admin.html`, and the DB schema files — not guessed):**

1. **The THANKYOU-\* codes are real.** `generateSecondPurchaseCode()` (`src/phase2/second-purchase-discount.js:49-51`) creates `THANKYOU-` + 8 random hex chars, fired by `issueSecondPurchaseDiscountCode()` from `reconcilePublicOrderPaymentFromSession` in `public-checkout.js` — **exactly once per real, paid order**, guarded by an atomic `UPDATE … WHERE payment_status='pending'` so it can't double-fire or fire on a test/unpaid order. Answer to Col's literal question: **yes**, these are genuine post-purchase "thank you, buy again" discount codes, auto-issued after a real sale — not test artifacts.

2. **`GCASHB3FCD9C6` / `TEST20` / `TEST21` / `WELCOME20` are a different code type, mixed into the same view.** Three `code_type` values exist in the schema: `consultant_demo`, `gcash_paid_access`, `campaign_single_use` (`src/db.phase2.sql:150-151`, `src/db.phase4.sql:23-24`). `GCASHB3FCD9C6` matches the GCASH payment-approval flow (`gcash_paid_access`); `TEST20`/`TEST21`/`WELCOME20` are short hand-chosen strings consistent with manually-created batch campaign codes, as opposed to the random-hex auto-generated pattern. No `created_by`/`source` column exists in the schema to definitively tag "manual" vs "auto" — the only distinguishing signals are the `batch_label` field (THANKYOU codes always carry the fixed label `'Second Purchase Discount (Auto)'`, `second-purchase-discount.js:32`) and the code string pattern itself.

3. **The actual bug: the admin screen Col is looking at has no type filter.** The table in the screenshot is the **"Promo Codes Directory"** (`public/admin.html:1551-1580`), backed by `GET /api/admin/promo-codes` (`admin-fulfilment.js:928-934`):
   ```js
   supabase.from('promo_codes').select('*, sales_consultants(id,name,email)', {count:'exact'}).order('created_at',...)
   ```
   This query has **no `.eq('code_type', …)` filter** — it pulls every row regardless of type, so consultant-referral codes, GCASH codes, campaign codes, and the auto-generated THANKYOU codes all land in one table meant for consultant-agent codes. That's why every row Col saw shows `Agent = Unassigned` — these codes were never meant to have an agent; they just leak into the wrong view.
   
   A separate, correctly-filtered **"Campaign Codes" screen already exists** (`admin.html:1584+`, `GET /api/admin/campaign-codes`, `admin-fulfilment.js:1144`, explicitly `.eq('code_type','campaign_single_use')`) with the right columns (Discount, Country, **Used X/Y**, Valid Until) — this is the correct place to see these specific codes and their real usage.

4. **The "0" Col saw is a column-metric mismatch, not a redemption-tracking bug.** `used_count` IS correctly tracked: `public-checkout.js:390` reads it, `:404` checks it against `max_uses` before allowing redemption, `:424-431` atomically increments it (`UPDATE … WHERE used_count < max_uses`) only on a real successful checkout — this write path is sound. But the Promo Codes Directory's 4th column ("Used This Month") is wired to `freeDemosUsedThisMonth` (`admin-fulfilment.js:956`), computed only from `keepsakes.is_free_demo` rows — a metric that only makes sense for `consultant_demo` codes. For campaign/GCASH code types it will always show 0, because those purchases never create `is_free_demo` keepsakes. **The real `used_count`/`max_uses` numbers exist correctly and are visible on the Campaign Codes screen** (`admin.html:3679`), just not on the screen Col is looking at.

**Net finding:** Col's instinct that "something isn't right" is correct, but the actual issue is **a display/filtering bug, not a financial/money-tracking bug.** The bug is that one admin screen shows the wrong code types with a metric that doesn't apply to them, creating the appearance that "nothing is tracked."

---
### LIVE VERIFICATION — actually run against production, not just read from code (2026-10-01)

Static code reading left one honest gap: whether `used_count` could silently drift under some edge case not visible from reading the code alone. Rather than leave that as a documented "should check," a real read-only query was run directly against the production Supabase `promo_codes` table (via a temporary `__verify_promo_codes.js` script using the real `SUPABASE_URL`/`SUPABASE_SECRET_KEY` from `.env`, deleted immediately after, confirmed via `ls __*.js` returning nothing). Full `promo_codes` table queried, 528 total rows.

**Ground-truth results:**
```
Counts by code_type: { "campaign_single_use": 510, "consultant_demo": 17, "gcash_paid_access": 1 }

THANKYOU-D0842ECD  | used=0/1 | batch=Second Purchase Discount (Auto) | created=2026-09-30
THANKYOU-0D9FCF08  | used=0/1 | batch=Second Purchase Discount (Auto) | created=2026-08-31
THANKYOU-ADA138F7  | used=0/1 | batch=Second Purchase Discount (Auto) | created=2026-08-23
THANKYOU-355C0649  | used=0/1 | batch=Second Purchase Discount (Auto) | created=2026-08-23
THANKYOU-0034F6D7  | used=0/1 | batch=Second Purchase Discount (Auto) | created=2026-08-23
THANKYOU-5866A300  | used=0/1 | batch=Second Purchase Discount (Auto) | created=2026-08-23
THANKYOU-62A0CB4B  | used=0/1 | batch=Second Purchase Discount (Auto) | created=2026-08-23
THANKYOU-3E76B77F  | used=0/1 | batch=Second Purchase Discount (Auto) | created=2026-08-13
GCASHB3FCD9C6      | used=1/1 | type=gcash_paid_access
TEST21             | used=1/1 | batch=Test
TEST20             | used=1/1 | batch=test code
WELCOME20          | used=1/1 | batch=First Purchase Bonus Code
```

**This settles the open question decisively:**
1. **`used_count` tracking is confirmed working, not theoretical.** 4 real rows across the whole table (`GCASHB3FCD9C6`, `TEST21`, `TEST20`, `WELCOME20`) show `used=1/1` — proof the increment logic actually fires on redemption in production, not just "looks correct in the code."
2. **A new, more specific finding Col should know:** **all 8 THANKYOU-\* codes currently in the table show `used=0/1` — not one of them has ever been redeemed**, spanning creation dates from 2026-08-13 to 2026-09-30 (6+ weeks for the oldest). That's not a tracking bug — the mechanism clearly works (see point 1) — but it IS a real business observation: the "second purchase / buy again" discount codes are being issued correctly but customers aren't using them yet. Whether that's expected (codes are new / customers haven't had time) or worth investigating (e.g. is the code actually being emailed/shown to the customer after purchase? check `email-service.js`'s usage of these codes) is a separate, genuine question worth raising with Col — not something to silently note and move past.
3. **Confirms the `code_type` split is real and matches the screenshot exactly**: all 8 THANKYOU rows + TEST20/TEST21/WELCOME20 are `campaign_single_use`; GCASHB3FCD9C6 is `gcash_paid_access`. Zero are `consultant_demo` — meaning literally none of the 9 rows Col saw in the Agent-based "Promo Codes Directory" belong in that table at all. This is not a borderline edge case, it's a complete type mismatch for every single visible row.

**Proposed fix (not yet built — this needs Col's go-ahead since it touches a real API endpoint, not just copy):**
1. Add a `code_type` filter to `GET /api/admin/promo-codes` (`admin-fulfilment.js:928-934`) so it only returns `consultant_demo` rows — stop campaign/GCASH/auto codes from leaking into the agent-based table.
2. Point Col at the existing Campaign Codes screen to see real usage counts for THANKYOU-*/GCASH*/TEST*/WELCOME20 codes right now, without needing any code change.
3. Optionally rename "Used This Month" or scope it per-screen so it's never misleading for code types it doesn't apply to.
4. **New, from the live data**: separately check with Col whether the 0% redemption rate on THANKYOU-* codes is expected or itself worth investigating (e.g. confirm the code is actually surfaced to the customer post-purchase — check `email-service.js` for whether/how the code is emailed, and check it isn't buried somewhere the customer never sees).

**Test case (once Col confirms this should be fixed):**
- After adding the `code_type` filter: confirm `GET /api/admin/promo-codes` response no longer includes any `THANKYOU-*`/`GCASH*`/`TEST*`/`WELCOME20` rows — only `consultant_demo` rows remain (17 real rows per the live count above), each with a real assigned agent or legitimately `Unassigned` if genuinely not yet assigned.
- Confirm the Campaign Codes screen still correctly lists all 510 `campaign_single_use` + 1 `gcash_paid_access` rows with accurate `used_count`/`max_uses` values matching the live query above exactly (spot-check at least the 12 rows from the screenshot).
- Re-run the same read-only verification query after the fix ships to confirm the live counts are unchanged by the filter change (a filter should never alter underlying data — if counts differ, something else broke).
- Confirm no other admin screen or report depends on `/api/admin/promo-codes` returning all code types (grep every caller of this endpoint before narrowing it) — this is a shared endpoint, so narrowing its filter could silently break something else in admin.html that wasn't part of this screenshot.

**Bug hunt:**
- Grep every call site of `GET /api/admin/promo-codes` in `admin.html` (not just the Promo Codes Directory table) to confirm nothing else reads this same endpoint expecting the unfiltered full list.
- ~~Run the live DB query against production to get ground truth~~ — **done above**, no longer an open gap.
- Live-test a real THANKYOU code redemption end-to-end (or the closest safe equivalent) to directly observe `used_count` incrementing in real time, as an extra confirmation beyond the static "4 rows already show used=1/1" evidence.
- Follow up on the 0%-redemption finding above as its own mini-investigation: confirm the THANKYOU code is actually delivered to the customer (email/on-screen) after a real purchase — if it's generated but never shown to anyone, that's a real, separate bug worth surfacing to Col even though it's outside the original filtering-bug scope.

**Status:** 📝 documented, analysis complete, **live-verified against production data (2026-10-01, read-only, test script deleted after use).** Not yet relayed to Col, not yet implemented. This needs Col's explicit go-ahead before touching `admin-fulfilment.js` (a real backend API change, higher risk than the landing-page CSS/copy steps) — report the findings to him: codes are real and correctly tracked (proven, not assumed), the admin screen has a filtering bug, and a new finding worth raising separately — none of the THANKYOU codes have been redeemed yet.

---
## STEP 6 — Logo header follow-up: "THE TRIBUTE" text size vs "TIMES", and nav links missing on mobile

**Client message:** Mobile-viewport screenshot of `tributetimes.co.nz`, showing the Step 2 logo banner above a row of red-marked empty gaps between the logo and the "CREATE YOURS" button. Col: *"The logo header is nearly right, the words The Tribute should be same size as the TIMES font. thank you, but the page link Index needs to be reinstated. Between logo and create yours. Does that make sense? Where the red lines are."*

Two genuinely separate asks in this one message — treated as 6a and 6b since they touch different things (an image asset vs. a CSS/markup behavior).

**Analysis (code + asset inspection, not guessed):**

**6a — "THE TRIBUTE" vs "TIMES" font size mismatch.** Confirmed via direct inspection: `public/logo_header.png` is a single flat raster image, `1600×531px`, RGBA — "THE TRIBUTE", the circular seal graphic, and "TIMES" are all baked into one PNG, not separate live HTML/CSS text elements (`public/landing.html:903`, `<img src="/logo_header.png" ...>`). This means **the font-size mismatch is a property of the source image file itself, not something `landing.html`'s CSS can fix** — there is no `font-size` rule to adjust because none of that text is real DOM text. Visually matches Col's screenshot: "THE TRIBUTE" (left of the seal) does appear notably smaller than "TIMES" (right of the seal) within the image.
- **This requires editing/regenerating the actual logo asset** (image editing — resizing "THE TRIBUTE" up to match "TIMES"'s point size, or recreating the whole lockup from source vector/design files if available), not a code change. Flag to Col: do you have the original design file (e.g. Illustrator/Figma/PSD) for this logo, or should this be redone by eyeballing/editing the existing PNG? A from-scratch edit of a flat PNG risks visible quality loss on the "THE TRIBUTE" text if it's scaled up from a lower-resolution source within the same file.

**6b — "the page link Index needs to be reinstated... between logo and create yours."** Confirmed via code: `public/landing.html:880`, inside `@media (max-width: 680px)`:
```css
.nav-links { display: none; }
```
This hides the entire `<ul class="nav-links">` (HOME / FLORISTS / STATIONS / AGENTS / CONTACT, `landing.html:908-931`) at mobile widths. Col's screenshot is a phone viewport (narrow, browser chrome visible, tab count "40" — clearly a real phone), so this rule is exactly what's causing the empty space he circled between the logo band and the country-selector/CREATE YOURS row.
- **Important: this is NOT a regression introduced by Step 2.** Checked git blame / the rule's context — `.nav-links { display: none; }` at 680px existed before Step 2's header restructure; Step 2 only moved the logo into its own band above the nav row, it didn't touch mobile nav visibility. So this has likely been a long-standing gap (no mobile menu was ever built), not something Step 2 broke — worth saying plainly to Col rather than letting him assume Step 2 caused it, since he's praising Step 2 ("nearly right") in the same message.
- **Col's literal ask ("reinstated... between logo and create yours") suggests he wants the links visible inline in that gap**, not necessarily a hamburger/dropdown menu — but 5 nav links (HOME/FLORISTS/STATIONS/AGENTS/CONTACT) sitting as plain inline text in that narrow mobile width is a real layout risk: could wrap awkwardly, crowd the country selector, or just look cramped on a small phone screen. This needs a design decision, not just flipping `display: none` back to `display: flex` — options: (a) plain inline/wrapped links as he literally described, (b) a simple horizontal scroll row, (c) a proper hamburger/dropdown menu (more work, better UX at narrow widths). Should confirm which with Col rather than assume, especially since (a) could look worse than the current empty-gap problem if 5 links wrap to 2-3 lines awkwardly.

**Problem:** 6a is a logo-asset quality issue (not a code bug) causing visual inconsistency in the lockup. 6b is confirmed pre-existing: mobile nav links are completely inaccessible site-wide at ≤680px — this is a genuine navigation/usability gap on every mobile visit, not just this one page element.

**Solution (pending Col's answers above):**
- 6a: either Col supplies original design files for a clean re-edit, or re-edit the existing flat PNG increasing "THE TRIBUTE" text size to visually match "TIMES" — re-export at the same 1600×531 (or higher) resolution to avoid the earlier Revision-1 stretch-bug class of problem; verify final result the same way Step 2's logo was verified (measure actual rendered + natural dimensions via browser, confirm ratio match, confirm no blur/pixelation on the enlarged text specifically).
- 6b: once Col confirms which mobile-nav treatment he wants (inline/wrap vs scroll vs hamburger), change `.nav-links { display: none; }` at `landing.html:880` to the agreed treatment — likely needs new CSS rather than just toggling `display`, since 5 items need to fit a narrow column layout (`.navbar` already goes `flex-direction: column` at this breakpoint, `landing.html:879`).

**Isolation notes:** 6a only touches the image file `public/logo_header.png` — no HTML/CSS change needed unless the image's own aspect ratio changes (it shouldn't, same 1600×531 canvas). 6b only touches the `@media (max-width: 680px)` block in `public/landing.html` (lines ~878-887) — confirm no other rule in that same media query depends on `.nav-links` staying hidden (e.g. spacing/margin rules elsewhere assuming it's absent).

**Test case:**
- 6a: load the live site on an actual phone (or Chrome device-emulation at common widths: 360px, 390px, 428px) and visually confirm "THE TRIBUTE" and "TIMES" now read as the same point size — measure cap-height in pixels for each word directly from a full-resolution screenshot (crop and compare pixel heights, not eyeball "looks closer now").
- 6a: confirm the logo still isn't stretched/distorted post-edit — same verification method as Step 2 (measure rendered width/height ratio via `getBoundingClientRect()`, compare to the new PNG's `naturalWidth`/`naturalHeight` ratio, confirm they match to at least 2 decimal places, not just "looks about right").
- 6a: specifically re-check the seal graphic (circular emblem between the two text blocks) wasn't accidentally shifted, resized, or had its own text ("THE TRIBUTE TIMES SEAL OF AUTHENTICITY") blurred as a side effect of editing the text around it — crop and compare the seal region pixel-for-pixel against the current image before/after.
- 6b: at ≤680px, confirm all 5 nav links (HOME/FLORISTS/STATIONS/AGENTS/CONTACT) are visible and tappable between the logo band and the country-selector/CREATE YOURS row, matching the gap Col circled.
- 6b: confirm each link's tap target meets a real minimum touch size (44×44px per standard mobile accessibility guidance, not just "visually present") and that tapping each one navigates correctly (`/`, `/florist`, `/station`, `/join`, `mailto:hello@tributetimes.co.nz`) — test by actual tap on a touch device/emulator, not just a mouse click, since touch target size bugs don't show up with a mouse.
- 6b: re-check `680px` boundary specifically (just above/below it, e.g. 679px vs 681px) and also the `992px` breakpoint to confirm nothing regresses at the tablet width where `.nav-links` is already visible today — a CSS change at one breakpoint can silently leak into or break an adjacent one if selectors aren't scoped carefully.
- 6b: test with the country selector's dropdown actually open (not just closed/idle) to confirm the reinstated nav links don't overlap or get overlapped by the open dropdown at narrow widths — these two UI elements are close together in the circled gap.

**Bug hunt:**
- 6a: after re-editing the PNG, diff file size/dimensions against the current `469862`-byte, `1600×531` original (confirmed via the Step 2 deploy log) to catch an accidental resize/recompress that degrades quality elsewhere in the image (the seal graphic, "TIMES" itself) — a naive "scale up THE TRIBUTE only" edit in a raster tool can introduce visible resampling artifacts around just that text while leaving the rest untouched, which would be an obvious giveaway on zoom.
- 6a: confirm the edited PNG's background stays transparent (RGBA, confirmed on the current file) — a re-export through some tools silently flattens transparency to a white or black background, which would show as a visible box around the logo on the actual cream-colored header band.
- 6b: grep for any other place `.nav-links` or `.navbar` is referenced (JS event listeners, inline styles, other media queries) to confirm re-enabling it at mobile doesn't trigger unrelated behavior (e.g. a resize listener elsewhere in the file that assumes `.nav-links` is always hidden below 680px and skips some initialization because of it).
- 6b: screenshot the full mobile header band (logo + reinstated nav + country selector + CREATE YOURS) together to confirm total vertical height is still reasonable — 5 stacked/wrapped nav items plus everything else already in that column could push the "CREATE YOURS" button far down the page on short phone screens (test against a genuinely short viewport like iPhone SE's 667px height, not just a tall modern phone); check this doesn't create a new usability problem while fixing the old one.
- 6b: confirm the reinstated `.nav-links` doesn't break the existing `.navbar { flex-direction: column }` rule at this breakpoint (`landing.html:879`) — i.e. the links need their own internal layout (row-wrap or stacked) within that column, not just inherited flex behavior that might squash or misalign them.
- After deploy: re-verify against the live URL on a real or emulated mobile viewport, not just desktop dev tools at a resized window — confirm via the same method Col used (an actual phone browser screenshot) since that's how he caught the original bug.

**Status:** 📝 documented, not yet implemented. Needs Col's confirmation on: (1) does he have original logo design files for 6a, or should the existing PNG be edited directly, (2) which mobile-nav treatment he wants for 6b (inline/wrap, scroll, or hamburger menu) before building either half of this step. Also worth telling him plainly: 6b is a pre-existing gap, not something Step 2 introduced.

---
## STEP 7 — Hero section: remove "Printed on Premium Paper" feature item and the price line

**Client message:** Screenshot of the hero section ("Give the Gift of History" heading, 3 feature items, "CREATE YOUR NEWSPAPER" button, price line below). Red marks cross out the 3rd feature item ("Printed on Premium Paper") entirely and the price line ("From NZ$9.95") entirely. No separate text message accompanied the first copy of this screenshot.

**Follow-up (same screenshot resent, with a direct question added):** *"Just noticed these changes too. Deleterious third box and the $nz 9.95. (Or does that price change depending on where they are buying from?"* — Col is asking whether `$9.95` is a fixed number or actually varies by the buyer's country.

**Answer to Col's question (code-verified, not guessed):** Yes, the price genuinely does change by country — this is the exact same mechanism already documented in Step 5's open question about the flag bar. `applyPricingCountry()` (`public/landing.html:1318-1324`) rewrites every `.hero-price` element's text to `From ${pricing.display}` using a `COUNTRY_PRICING` lookup table, triggered either by auto-detection or the header country-selector dropdown. So "$NZ9.95" is just the New Zealand/default value — a UK visitor would see a different number in GBP, a US visitor a different number in USD, etc. This is useful context for Col's decision: deleting the price line removes a dynamic, localized price display, not just a static "$9.95" label — worth mentioning back to him in case that changes his mind about removing it (e.g. if the localized price was valuable messaging) or doesn't (if he just wants a cleaner hero regardless).

**Analysis (code-verified, not guessed):** This is the first `<section class="hero-section">` in `public/landing.html:956-977`. The 3 feature items are `.hero-feature-item` divs (`lines 963-965`):
1. `📜 Authentic Vintage Style` — **not marked, keep**
2. `📄 One-Page Newspaper` — **not marked, keep**
3. `📦 Printed on Premium Paper` — **crossed out, delete**

Below that, `<div class="hero-price">From NZ$9.95</div>` (`line 969`) — **crossed out, delete**.

**Important — this exact `.hero-price` class is NOT unique to this section.** Grep confirms a second, separate hero-style section further down the page (`public/landing.html:1106`, "A Newspaper That Tells Their Story" section) also has its own `<div class="hero-price">From NZ$9.95</div>`. Both are driven by the same shared JS function `applyPricingCountry()` (`public/landing.html:1318-1324`):
```js
document.querySelectorAll('.hero-price').forEach(el => {
  el.textContent = `From ${pricing.display}`;
});
```
This function updates **every** `.hero-price` element on the page whenever the country selector changes — it has no concept of "which section." **This means simply deleting the `<div class="hero-price">` markup in this one hero section is safe and self-contained** (the `querySelectorAll` loop will just find one fewer element, no error) — but it's worth flagging to Col that his screenshot only shows the top hero section, and the second "A Newspaper That Tells Their Story" section further down has an identical price line that is NOT shown/marked in this screenshot. **Does he want the price line removed from both places, or only the one he screenshotted?** Don't assume — ask, since deleting only one creates visible inconsistency (price shown once on the page but not twice) which may or may not be what he wants.

**Problem:** The 3rd feature claim ("Printed on Premium Paper") may be inaccurate or no longer relevant given the broader context already uncovered in this project — Step 4 and the florist-association feedback both point toward the product being positioned as a self-print-at-home digital product, not something physically printed and shipped by the company. "Printed on Premium Paper" could be read as implying the company prints and sends it, which may be exactly the kind of confusing claim Col is now cleaning up across the whole page (consistent with Step 4's similar fix). The price line's removal reason isn't stated but may relate to wanting to simplify the hero's call-to-action, or ties into the broader pricing-display questions already raised in Step 5's open question about the flag bar.

**Solution:**
1. Delete the `.hero-feature-item` div for "Printed on Premium Paper" (`public/landing.html:965`) — leaves exactly 2 feature items in `.hero-features`.
2. Delete `<div class="hero-price">From NZ$9.95</div>` (`public/landing.html:969`) from this section only, pending Col's confirmation on whether the second occurrence (`line 1106`) should also go.
3. No CSS change needed for the feature-item removal: confirmed `.hero-features` (`public/landing.html:292-297`) is `display: flex; flex-wrap: wrap; gap: 20px;` — not a fixed-column grid like the stats bar was in Step 4. Removing 1 of 3 items naturally reflows with no layout fix required. (This is a direct contrast with Step 4, where the grid DID need `repeat(4,1fr)` changed to `repeat(2,1fr)` — worth not repeating that grid-fix step here since it doesn't apply.)

**Isolation notes:** `.hero-feature-item` and `.hero-price` are both reused elsewhere on the page (second hero-style section further down, `lines 1098-1106`) — any edit must target the specific `<div>` instances in the first hero section only (by surrounding context/line number), not a blanket find-and-replace on the class name, or it will silently also affect the second section. Confirmed `.hero-price` has its own CSS rule (`public/landing.html:334-339`: `font-size: 0.85rem; margin-top: 10px; font-weight: 600;`) — this rule must stay in the stylesheet untouched (section 2 still uses it), only the `<div>` instance in section 1 is deleted, not the class definition.

**Test case:**
- Desktop and mobile: confirm the first hero section shows exactly 2 feature items ("Authentic Vintage Style", "One-Page Newspaper") and no price line below the "CREATE YOUR NEWSPAPER" button.
- Confirm the vertical gap below "CREATE YOUR NEWSPAPER" looks intentional, not like something is visibly missing — `.hero-price` carried `margin-top: 10px` that disappears along with the text; check whether the button now needs its own `margin-bottom`/the section needs a small padding adjustment to avoid looking abruptly cut off, or whether it reads fine as-is (don't assume either way, look at the actual rendered result).
- Confirm the second "A Newspaper That Tells Their Story" section further down the page is untouched (still shows its own checklist and its own price line) — unless Col confirms he wants that one changed too, in which case update this test case accordingly.
- Confirm the country-selector price-update JS (`applyPricingCountry`) still runs without error after this section's `.hero-price` div is removed — open browser console, change the country selector, confirm no JS errors logged and the second section's price line still updates correctly (the `querySelectorAll('.hero-price')` loop should just silently find one fewer match and keep working on the remaining one).
- `992px` and `680px` breakpoints: confirm the 2 remaining feature items display cleanly with no leftover spacing artifact from the removed 3rd item — specifically check the `flex-wrap` behavior at narrow widths doesn't leave one item alone on its own row looking orphaned (2 items wrapping unevenly is a real visual risk `flex-wrap: wrap` can produce, worth actually looking rather than assuming it's fine because the CSS wasn't touched).
- Confirm page load (view source / hard refresh) doesn't show a flash of the old 3-item layout before any client-side JS runs — this is pure server-rendered HTML with no JS toggling these items, so there should be zero flash, but worth a direct check since the price line IS JS-updated (`applyPricingCountry` on load) and feature items are not, meaning the two deleted elements have different lifecycles worth testing separately.

**Bug hunt:**
- Grep `.hero-feature-item` and `.hero-price` across the whole file before editing to confirm exact count/locations (expect 3 `.hero-feature-item` in this section + however many in the second section; 2 total `.hero-price` instances) so the edit touches only the intended lines.
- Screenshot the hero's visual/image column (`.hero-visual`, `.hero-img` — the newspaper mockup image on the right) to confirm its vertical alignment doesn't look obviously off-balance now that the left column (text) is shorter by 2 removed lines — may need a visual check even if no code change is required, since asymmetry can look unintentional. Specifically compare against `.hero-img-floating`'s animation (check the `@keyframes`/animation class if one exists) to confirm the floating effect isn't now misaligned relative to a shorter text column.
- Check the raw HTML diff carefully for an off-by-one deletion: the 3 `.hero-feature-item` divs are adjacent siblings with no unique wrapper per item — deleting the 3rd one must stop exactly at its own closing `</div>`, not accidentally eat the closing tag of `.hero-features` itself or leave an orphaned one, which would silently break the whole `.hero-features` container's layout.
- Confirm `public/hero_new.png` (the actual image referenced at `line 974`) is unaffected/not confused with `public/hero_new.jpg`, a same-named-stem but different file that also exists in `public/` — not used by this markup, but worth a quick sanity check that the correct file is the one being displayed before/after this edit, since an unrelated mixup here would be an easy thing to miss.
- After deploy: re-verify against the live URL that both intended changes (feature item gone, price line gone) are present and the untouched second section is confirmed unaffected — screenshot both sections side by side on the live site, not just locally, since Col's screenshots have consistently come from the live `tributetimes.co.nz` domain, not a local dev server.

**Status:** 📝 documented, not yet implemented. **Needs one clarification from Col before building:** does the price-line removal apply only to this top hero section (as screenshotted), or also to the second, identical price line further down the page in the "A Newspaper That Tells Their Story" section? Don't guess — the screenshot doesn't show that section, so scope is genuinely ambiguous. His follow-up question about country-based pricing has been answered above (yes, it does vary by country) — worth confirming he still wants it removed now that he knows that, before deleting a working localization feature.
