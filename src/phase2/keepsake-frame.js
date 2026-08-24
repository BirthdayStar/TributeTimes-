'use strict';
/**
 * Shared keepsake page frame ornaments — Phase 5 visual polish.
 * Solid+dotted double border CSS + four corner floral filigrees
 * (reference side-design only; no layout impact — absolute, pointer-events none).
 */

/** Classic certificate corner filigree — floral scrolls along both edges (ref style). */
const CORNER_FLOURISH_SVG = `<svg class="corner-ornament" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <g fill="none" stroke="#1a1712" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round">
    <!-- L spine hugging the corner -->
    <path d="M6 62 V14 Q6 6 14 6 H62"/>
    <path d="M10 52 V18 Q10 10 18 10 H52"/>
    <!-- Outer floral scroll on top edge -->
    <path d="M20 6 Q32 6 36 16 Q32 24 22 26 Q28 16 20 6"/>
    <path d="M38 6 Q50 8 52 18 Q46 22 38 18"/>
    <path d="M54 6 Q66 10 64 20 Q58 16 54 10"/>
    <!-- Outer floral scroll on left edge -->
    <path d="M6 20 Q6 32 16 36 Q24 32 26 22 Q16 28 6 20"/>
    <path d="M6 38 Q8 50 18 52 Q22 46 18 38"/>
    <path d="M6 54 Q10 66 20 64 Q16 58 10 54"/>
    <!-- Inner blossom -->
    <path d="M18 18 Q28 14 32 24 Q28 34 18 30 Q22 24 18 18"/>
    <path d="M22 22 Q30 20 32 28 Q28 30 22 26"/>
  </g>
  <g fill="#1a1712">
    <circle cx="24" cy="24" r="2.4"/>
    <circle cx="40" cy="12" r="1.5"/>
    <circle cx="12" cy="40" r="1.5"/>
    <circle cx="54" cy="14" r="1.2"/>
    <circle cx="14" cy="54" r="1.2"/>
    <!-- small leaf tips -->
    <path d="M44 8c3.5 1.2 5.5 3.8 6 7.2-1.6-2.4-3.6-4.2-6-5.4V8z"/>
    <path d="M8 44c1.2 3.5 3.8 5.5 7.2 6-2.4-1.6-4.2-3.6-5.4-6H8z"/>
  </g>
</svg>`;

function cornerOrnamentsHtml() {
  return `
  <div class="corner-ornament-wrap corner-tl" aria-hidden="true">${CORNER_FLOURISH_SVG}</div>
  <div class="corner-ornament-wrap corner-tr" aria-hidden="true">${CORNER_FLOURISH_SVG}</div>
  <div class="corner-ornament-wrap corner-bl" aria-hidden="true">${CORNER_FLOURISH_SVG}</div>
  <div class="corner-ornament-wrap corner-br" aria-hidden="true">${CORNER_FLOURISH_SVG}</div>`;
}

/** CSS fragment inserted into each keepsake renderer stylesheet. */
const KEEPSAKE_FRAME_CSS = `
  .authenticity-seal {
    position: absolute;
    bottom: 15.5mm;
    right: 5.5mm;
    width: 50mm;
    height: auto;
    opacity: 0.97;
    z-index: 5;
  }

  /* Solid outer + dotted inner — ref double frame (no layout impact). */
  .sheet::before {
    content: '';
    position: absolute;
    inset: 3mm;
    border: 0.55mm solid #1a1712;
    pointer-events: none;
    z-index: 4;
  }
  .sheet::after {
    content: '';
    position: absolute;
    inset: 4.4mm;
    border: 0.28mm dotted #2a2620;
    pointer-events: none;
    z-index: 4;
  }

  /* Floral filigree on every corner — ref side-design only. */
  .corner-ornament-wrap {
    position: absolute;
    width: 18mm;
    height: 18mm;
    z-index: 6;
    pointer-events: none;
    line-height: 0;
  }
  .corner-ornament-wrap svg {
    width: 100%;
    height: 100%;
    display: block;
  }
  .corner-tl { top: 3.4mm; left: 3.4mm; }
  .corner-tr { top: 3.4mm; right: 3.4mm; transform: scaleX(-1); }
  .corner-bl { bottom: 3.4mm; left: 3.4mm; transform: scaleY(-1); }
  .corner-br { bottom: 3.4mm; right: 3.4mm; transform: scale(-1, -1); }
`;

module.exports = { cornerOrnamentsHtml, KEEPSAKE_FRAME_CSS };
