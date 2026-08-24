# PHASE 5 — Keepsake Visual Enhancements

**Client:** Colin McCabe ("Col"). **Scope locked by his own words:** *"For now, please action these four items only — we'll let this settle before deciding on anything further."*

This file is the only source of truth for this phase. Do not pull in anything from `new_changes.md` or elsewhere unless it's referenced from here.

---

## 0. Read this before touching anything

- **Only 4 things are in scope.** Everything else in this document is either a required side-effect of one of those 4, or explicitly listed as OUT OF SCOPE at the bottom. If you find yourself editing anything not named in Steps 1–5 below, stop — you've drifted out of scope.
- **Do not touch:** payment/checkout logic, GCash, Stripe, admin panel, station/florist portals, AI prompt files (`tribute-times-*-prompt.js`), `src/phase2/*`, `server.js`, or any content-generation logic. This phase is pure HTML/CSS inside the renderer files only.
- **The single-page guarantee is sacred.** `.sheet` has `overflow: hidden` and a fixed 210mm × 297mm size specifically so a keepsake can never spill onto a second page — this codebase has a long history (visible in existing comments throughout `tribute-times-renderer.js`) of very hard-won fixes for exactly this kind of overflow. Every step below adds *something* to the page (a seal, a border, rule lines). After **every single step**, re-render a real keepsake and visually confirm nothing got clipped or pushed off — not just "it looks okay," actually check the bottom edge and every column.
- **Which files:** the primary target is `tribute-times-renderer.js` (birthday/general occasions — this is what Col's reference sample matches), plus exactly **one line** in `tribute-times-server-update.js` (see Step 2 — adding the seal to the shared `FONTS` object). `tribute-times-anniversary-renderer.js` and `tribute-times-memorial-renderer.js` share the same visual structure but are separate files with their own copies of this CSS (confirmed earlier this project — they import shared helpers like `cleanTruncate` but NOT the page CSS itself). **Do Step 1–5 on `tribute-times-renderer.js` first, get it fully approved by Col, then repeat the identical change on the other two.** Do not touch anniversary/memorial until birthday is confirmed working — this keeps each change isolated and testable on its own, and if Col asks for a tweak, you're not re-doing 3 files' worth of guesswork. (The `FONTS` object addition is shared/global and only needs doing once — see Step 2's note.)
- **Asset already provided:** `public/tribute_times_seal.png` (dropped in by the team, ~7MB, gold/green circular seal, transparent background, reads "TRIBUTE TIMES · SEAL OF AUTHENTICITY"). Do not use `public/tribute-times-seal-watermark-gray.png` — that's a pre-existing, unrelated asset used elsewhere; touching it is out of scope.
- ⚠️ **Flag to Col before finalizing:** the seal image and the reference sample pages he sent all carry a visible **"Dola AI" watermark** — they're screenshots from a competitor's product, used as design reference. Confirm with him whether `tribute_times_seal.png` is meant as final artwork or just a style reference before shipping it as-is in a paying customer's keepsake.

---

## 1. Master Prompt (use this verbatim if handing this file to a fresh agent)

> You are implementing Phase 5 of The Tribute Times keepsake visual enhancements, defined in `phase5.md` at the project root. Read that entire file first. Implement Steps 1 through 5 in order, on `tribute-times-renderer.js` only, to start. After each step, render a real test keepsake (see the Master Test Script in Step 6) and visually confirm the single-page guarantee still holds and nothing outside this file's stated scope was touched. Do not implement anything under "Explicitly Deferred." Do not touch payment, admin, or AI-prompt files. When all 5 steps pass on `tribute-times-renderer.js`, stop and report back before touching the anniversary/memorial renderer files.

---

## STEP 1 — Move "The Night Sky" (moon phase) section out of the bottom-right corner

**Why this is Step 1 and not Step 2:** the seal in Step 2 needs the bottom-right corner. This section is currently sitting there, so it has to move first or the two will visually collide.

**Problem (current state):** `.s-starmap` (heading "The Night Sky", contains the moon-phase graphic and "You are N days old today" text) is the *last* section in the *third* (rightmost) column — i.e. it's the bottom-right-most content block on the page, exactly where the seal needs to go.

**Solution:**
1. In `tribute-times-renderer.js`, find the block:
   ```html
   <section class="s-starmap">
     <h3>The Night Sky</h3>
     <div class="starmap-graphic">${starMap.svg}</div>
     <div class="starmap-caption" data-field="moon-phase">...</div>
     ${daysOldStr ? `<div class="agecount" data-field="days-old">${daysOldStr}</div>` : ''}
   </section>
   ```
   (it's the last section inside `<!-- ============ COLUMN 3 ============ -->`).
2. Move this entire `<section>` block to **Column 1** (the leftmost `<!-- ============ COLUMN 1 (or similar comment) ============ -->`), appended as the *last* section in that column — i.e. after `.s-worldnumbers` (or after `.s-prices` if `.s-worldnumbers` isn't present that render, since it's conditional).
3. Do not change anything inside the section itself — only its position in the HTML.

**Isolation notes:** this changes *where* the section renders, not what it renders or its CSS class (`.s-starmap`'s own styling stays untouched, so its internal layout is unaffected). Column 1 currently holds `.s-news1`, `.s-news2`, `.s-prices`, and optionally `.s-worldnumbers` — adding a 5th section here is the real risk (Column 1 already has tight height budgets per the file's own extensive prior-bug comments). This is exactly why this step must be tested in isolation before Step 2 begins.

**Test case:**
- Render a keepsake using the existing test-fixture pattern (`scratch_renderer_stress_test.js` in the repo root is the established pattern — reuse its shape, don't call the real Anthropic API).
- Confirm "The Night Sky" now appears at the bottom of Column 1 (left), not Column 3 (right).
- Confirm Column 1's total content does not overflow — check the very bottom of the column against the page edge, with a *worst-case* content test (long news bodies, 4 world-in-numbers rows) not just a short-content happy path.
- Confirm Column 3 still looks balanced (not oddly short) now that its last section is gone — if it leaves a large empty gap, flag this back to Col rather than silently stretching something to fill it (do not invent a fix not asked for).

**🐛 Bug hunt (find → fix → retest) — do this before moving to Step 2:**
Don't just confirm the happy path above and move on. Actively try to break this step:
- Render with the *shortest* realistic content (short news bodies, no world-in-numbers, 0 birthdays) as well as the worst-case test — does Column 1 look sparse/unbalanced now that it has a 5th section, even though nothing overflows?
- Render with `daysOldStr` both present and absent (it's conditional) — confirm the move didn't break that conditional.
- Try at least one occasion type where `worldNumbersHTML` is empty (its section is conditionally omitted) — confirm the starmap section still renders correctly as the last item in Column 1 in that case, not orphaned or duplicated.
- If you find anything wrong: fix it, then re-run the full test case above from scratch (not just the part that broke) before considering Step 1 done.

---

## STEP 2 — Add the Seal of Authenticity

**Purpose:** Col's exact words: *"Add the Seal of Authenticity (finished asset included in the document, bottom corner near the keepsake ref number)"* — corrected in his follow-up message to specifically the **bottom-right** corner.

**Problem (current state):** no seal exists anywhere on the page. The footer (`<footer class="foot">`) is a thin 7mm strip containing only two text spans (site name, and "Keepsake Ref: TT-XXXX") in a `space-between` layout — there's no visual mark of authenticity anywhere on the keepsake.

**Solution:**
1. `.sheet` needs `position: relative` added to its existing CSS block (check first — it may not currently have a `position` set) so the seal can be positioned relative to the whole page, not just the footer strip.
2. Add a new CSS rule:
   ```css
   .authenticity-seal {
     position: absolute;
     bottom: 9mm;   /* clear of the .foot bar so it doesn't overlap the ref text */
     right: 9mm;
     width: 18mm;   /* start here, adjust after visual test — must not collide with the last column's content above it */
     height: auto;
     opacity: 0.94;
     z-index: 5;
   }
   ```
3. **Embed the image as base64, following the exact existing font pattern — do not reference it by `/path`.** Checked directly: `src/phase2/pdf-service.js` renders via Puppeteer's `page.setContent(finalHtml, ...)`, which has no real page origin/base URL to resolve a path like `/tribute_times_seal.png` against (this is *exactly* why the Chomsky font in this same file is already embedded as a base64 data URI instead of a normal `@font-face url()` — same underlying constraint, already solved once in this file). Confirmed there are zero `<img src="/...">`-style path references anywhere in this renderer currently — the font is the only precedent, and it's base64. Follow it:
   - **First, downscale/compress `public/tribute_times_seal.png`** — it's currently ~7MB, but the rendered seal is only ~18mm on an A4 page, so it needs nowhere near that resolution. Base64 inflates file size by ~33%, and this gets embedded into *every single generated keepsake's* `rendered_html` (stored per-keepsake in Supabase, confirmed in `src/phase2/save-keepsake.js`) — a real, ongoing per-order cost, not a one-time one. Get it down to a few hundred KB before embedding. This is a prerequisite for the step working sanely, not a separate optional task — just don't touch the artwork itself, only its file size/resolution.
   - The `fonts` object passed into `renderNewspaper(data, content, fonts)` is built once at startup in `tribute-times-server-update.js:41-47` (`const FONTS = { chomsky: fs.readFileSync(...).toString('base64'), poppinsB: ..., ... }`). Add a new key there the same way: `sealAuthenticity: fs.readFileSync(path.join(__dirname, 'public/tribute_times_seal.png')).toString('base64')`.
   - Confirmed via `tribute-times-server-update.js:374-376`: all three renderers (`renderNewspaper`, `renderAnniversaryNewspaper`, `renderMemorialNewspaper`) are called with this exact same `FONTS` object from one call site — so this `fs.readFileSync(...)` addition only needs to happen **once**, here, not once per renderer file.
   - In `tribute-times-renderer.js`, add the image as the *last* child inside `.sheet`, after the `</footer>` closing tag but before `.sheet`'s own closing `</div>`:
     ```html
     <img class="authenticity-seal" src="data:image/png;base64,${fonts.sealAuthenticity}" alt="" />
     ```
     Use `alt=""` (decorative image, not content). When you repeat Step 2 on the anniversary/memorial renderers later, you only need to add this `<img>` line there (`fonts.sealAuthenticity` is already available via the shared `FONTS` object) — do not re-add the file-read.
4. If for some reason a plain path reference (`src="/tribute_times_seal.png"`) genuinely does work when you test it against the real PDF output, it's simpler and fine to use instead — but verify with an actual rendered PDF, not a browser preview, before choosing it over the base64 approach above. Given the font precedent, expect it not to work.

**Isolation notes:** this touches `tribute-times-renderer.js` (one new CSS rule, one new `<img>` element) plus a single new line in `tribute-times-server-update.js`'s existing `FONTS` object (adding the `sealAuthenticity` key next to `chomsky`/`poppinsB`/etc. — do not restructure that object, just add one key the same way the existing ones are defined). It does not touch the footer's existing two spans, their layout, any other section, or any other part of `tribute-times-server-update.js` (routing, generation logic, rate limiting, etc. are all elsewhere in that file — leave them alone).

**Test case:**
- Render a test keepsake, confirm the seal appears in the bottom-right corner, doesn't overlap "Keepsake Ref: TT-XXXX" text, and doesn't get clipped by `.sheet`'s `overflow: hidden`.
- Confirm it renders correctly in the actual generated PDF (via `pdf-service.js`'s existing puppeteer path), not just in a browser preview — screen and PDF rendering have differed before in this codebase (see prior CSP/puppeteer history).
- Confirm Column 3's bottom content (now ending in `.s-sport`, since Step 1 moved the starmap out) doesn't visually collide with the seal.

**🐛 Bug hunt (find → fix → retest) — do this before moving to Step 3:**
- Test with worst-case Column 3 content (longest sport/horoscope text) — does the seal overlap it at any content length, not just the average case?
- Confirm the base64 data URI didn't silently break `page.setContent()` in the PDF path (e.g. check actual generation time didn't spike, and the PDF file isn't unexpectedly huge) — compare file size/generation time before and after this step, not just "it produced a PDF."
- Re-check Step 1's fix is still intact after this step's edits (the starmap section should still be at the bottom of Column 1) — confirm one step's change didn't accidentally revert or interact with the previous one.
- If you find anything wrong: fix it, then re-run this step's full test case again before moving on.

---

## STEP 3 — Add a decorative border frame around the page

**Purpose:** Col: *"Add a decorative border frame around the page (reference image included in the document)"* and separately: *"I do like the border though — it really sets the page off nicely."*

**Problem (current state):** `.sheet` has no border/frame at all — just a plain `box-shadow` for the screen-preview drop-shadow effect (which is not part of the printed page itself).

**Solution — do this the safe way, not the risky way:**
- **Do NOT use a regular CSS `border`.** A `border` is included in `box-sizing: border-box` (already set globally), so technically it wouldn't change `.sheet`'s outer 210×297mm size — but it *would* eat into the content area alongside the existing padding, tightening the already-proven-tight vertical budget every section in this file was tuned against. That's a real regression risk for a "just add a border" request.
- **Instead use CSS `outline` with a negative `outline-offset`.** An outline is drawn *without affecting layout at all* — it doesn't add to box size and doesn't consume any content padding, so it can't push any existing section around or trigger the overflow-clipping bug class this file has a long history of. This is the correct technique for "add a decorative frame" without disturbing anything working:
  ```css
  .sheet {
    /* ...existing properties, unchanged... */
    outline: 0.5mm solid #1a1712;
    outline-offset: -4mm;
  }
  ```
  Adjust the offset so the frame sits inside the existing 8-9mm page padding, not on top of any text.
- For a closer match to Col's reference image (which shows an ornate double-line / flourish-style border, not a plain single rule), a **double outline effect** can be built with a wrapping `::before` pseudo-element positioned `absolute; inset: Xmm;` with its own border — still doesn't affect flow since it's absolutely positioned. Use this richer version if a plain single outline looks too plain against the reference; keep whichever version and remove the other, don't ship both.
- If Col's reference image shows actual ornate corner flourish graphics (not just lines) that can't reasonably be done in pure CSS, do not attempt to hand-draw them in CSS — flag this back and ask whether a corner-flourish image asset (like the seal) is needed, the same way the seal itself was provided as a finished asset.

**Isolation notes:** outline/pseudo-element techniques specifically avoid touching any existing padding, margin, or content layout — this is the whole point of choosing this approach. Do not add real `border` or `padding` changes to `.sheet` under this step.

**Test case:**
- Render a test keepsake, visually compare the border against Col's reference image.
- Confirm no section's content shifted position compared to a pre-Step-3 render (take a screenshot before and after, diff them — content position outside the new frame itself should be identical).
- Confirm the frame doesn't get clipped by `overflow: hidden` at any edge.

**🐛 Bug hunt (find → fix → retest) — do this before moving to Step 4:**
- Check all 4 corners individually, not just a general glance — an outline/pseudo-element frame is exactly the kind of thing that can look right at 3 corners and be subtly misaligned at the 4th.
- If you built the richer `::before` double-outline version, confirm it doesn't intercept clicks/selection in a browser preview (it shouldn't, since it's decorative, but verify `pointer-events` isn't accidentally blocking anything if the preview is ever interactive).
- Re-verify Steps 1 and 2 are both still intact (starmap position, seal position) — a page-wide frame is exactly the kind of change that could visually shift where those absolutely-positioned/repositioned elements land relative to the new frame.
- If you find anything wrong: fix it, then re-run this step's full test case again before moving on.

---

## STEP 4 — Enforce justified text throughout

**Purpose:** Col: *"Confirm/enforce justified text throughout."*

**Problem (current state):** `section p { text-align: justify; }` already exists and covers most body text (news stories, "Also On This Day", weather, horoscope, sport — all rendered as `<p>` tags inside `<section>`). But two real gaps exist because they're `<div>`s, not `<p>`s, so the existing rule doesn't reach them:
1. `.msg` — the personal dedication message box (`<div class="msg" data-field="msg-body">`). Note the actual CSS selector is `.s-message .msg { ... }`, not a bare `.msg {}` — grep for that exact string, a plain `.msg {` search may not find it.
2. `.desc` — birthday/book note text (`<span class="desc">` inside `.bday` divs).

**Solution:**
1. Add `text-align: justify;` to the existing `.s-message .msg` CSS rule (find it, don't create a duplicate rule).
2. Add `text-align: justify;` to the existing `.bday .desc` CSS rule (find it, don't create a duplicate rule).
3. Double-check `.starmap-caption` and `.agecount` — these are short single-line captions, not body prose; justify has no visible effect on single-line text and is not needed there, but confirm they don't accidentally end up ragged/misaligned from anything else in this phase.
4. Grep the full file for every other `<div` or `<span` that holds multi-line prose text and isn't already covered by `section p` or the two fixes above — cross-check there's nothing else missed before calling this step done.

**Isolation notes:** this is a pure CSS addition to existing selectors — no new markup, no new classes, no change to what text is generated or shown.

**Test case:**
- Render a test keepsake with deliberately long dedication message text and long birthday notes (worst-case length, matching the existing character budgets in this file) and visually confirm both now justify correctly (even right edge) rather than ragged-right.
- Spot-check every other body-text section (news, otd, weather, horoscope, sport) still justifies correctly — confirming the existing rule wasn't accidentally broken.

**🐛 Bug hunt (find → fix → retest) — do this before moving to Step 5:**
- Check very SHORT text in `.msg` and `.desc` too — justified text on a single short line (or a line that's almost the full column width) can sometimes stretch word-spacing oddly; confirm it still reads naturally, not just that it "is technically justified."
- Grep once more, fresh, for any remaining un-styled prose container you might have missed the first time (Step 4's own instruction #4 already asks for this — actually do it, don't skip because you think you already covered everything).
- If you find anything wrong: fix it, then re-run this step's full test case again before moving on.

---

## STEP 5 — Verify (and strengthen if needed) vertical rule lines between columns

**Purpose:** Col: *"Add vertical rule lines between columns."*

**Problem (current state) — check this carefully, it may already be done:** `.cols` already has:
```css
.col + .col { border-left: .2mm solid #b9b09a; padding-left: 4mm; }
```
This already draws a vertical rule between Column 1↔2 and Column 2↔3. **Do not add a duplicate/second rule line on top of this without checking first.**

**Solution:**
1. Render a test keepsake and look closely at the actual PDF output (not just the browser preview) — confirm the existing rule line is genuinely visible. `#b9b09a` is a fairly light tan color at only 0.2mm width; it's possible this reads as "basically invisible" in print, which would explain why Col is still asking for it despite it technically existing in the code.
2. If it's already clearly visible in the real PDF: **no code change needed for this step** — just report back that this requirement was already met, with a screenshot as evidence.
3. If it's too faint to read as an intentional design element: increase visibility minimally — e.g. darken the color slightly (`#8a8570` or similar, staying in the page's existing sepia/vintage palette, not a stark black) and/or bump the width slightly (`0.3mm`). Do not redesign the column layout — this is a color/weight tweak only, to the exact same existing rule.

**Isolation notes:** if a change is needed at all, it's a one-line color/width tweak to an existing rule — nothing structural.

**Test case:**
- Screenshot the real PDF output at real print size (not zoomed-in browser view) and confirm the vertical rules are clearly visible as an intentional design element, not something you have to squint to find.

**🐛 Bug hunt (find → fix → retest) — do this before moving to Step 6:**
- If you darkened/widened the rule, confirm it doesn't now clash visually with the new border frame from Step 3 (two competing "line" design elements too close in weight can look like a layout mistake rather than two intentional design choices).
- Confirm the rule still renders correctly with Column 1 now containing a 5th section (the moved starmap from Step 1) — full-height columns of differing content lengths are exactly where a `border-left` can look uneven.
- If you find anything wrong: fix it, then re-run this step's full test case again before moving to Step 6.

---

## STEP 6 — Master Test Script (run after Steps 1–5 are all complete)

Reproduce the exact pattern already established in this repo (`scratch_renderer_stress_test.js` / `scratch_renderer_normal_test.js` in the root — read one of these first, don't invent a new test harness from scratch) with:
- One **worst-case** content test: longest realistic news bodies, 4 birthdays, full world-in-numbers table, long dedication message — confirms nothing overflows under maximum real-world content.
- One **best-case/normal** content test: typical-length content — confirms the new elements (seal, border, moved starmap) look correct under normal conditions too, not just checked for overflow.
- Render both to actual PDF via the real `pdf-service.js` path, not just HTML-in-browser — screen and PDF have differed before in this codebase.
- Screenshot both and manually compare against Col's reference images for the seal position, border style, and justified text.
- Confirm via `git diff --stat` that only `tribute-times-renderer.js` (and, once approved, the anniversary/memorial renderer files) changed — nothing in `server.js`, `src/phase2/`, admin/station/florist HTML, or any prompt file.
- Delete any scratch test files/output HTML created for this testing before considering the phase done (matches this repo's existing convention of not leaving `__*` or `scratch_*_output.html` files lying around after a testing session).

---

## ❌ EXPLICITLY DEFERRED — do not implement any of this in Phase 5

Col's own words: *"we'll let this settle before deciding on anything further."*

- Drop cap on the lead story.
- Star map graphic resizing.
- Icon-based section headers (postage stamp / cinema ticket / petrol pump / inflation icons) — Col likes the idea in principle but explicitly said it can wait.
- Trimming "Top Baby Names" content, or any baby-names feature at all — not a current feature of this app; Col's comment was about a competitor's sample page, not a request to add this.
- Rewriting any section as a narrative "story" format — same, this was commentary on a competitor's reference sample, not a request for this app.
- Anything else visible in the reference sample images (economy stats, cultural snapshot, day archive) that isn't one of the 4 items above — Col said the existing ticker bar already covers most of this.

If any of the above feels tempting to "just also fix while you're in there" — don't. Stop at the 4 items. Report back and let Col decide what's next.
