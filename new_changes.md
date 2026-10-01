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
