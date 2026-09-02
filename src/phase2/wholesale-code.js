'use strict';

// WHOLESALE BUYING CODES — client spec, 19 Aug 2026 (Col): "Format for the
// wholesale codes: 'WS' followed by the business name in lowercase, no
// spaces. E.g. a florist called 'Flower Power' would get the code
// WSflowerpower." Applies uniformly to every partner type — florist, gift
// shop, cake shop, radio station — all `stations` table rows, distinguished
// only by `account_type`.
//
// Client's 3 explicit rules:
// 1. Strip spaces, apostrophes, and special characters from the business
//    name (e.g. "Mary's Flowers" -> WSmarysflowers).
// 2. On duplicate/near-duplicate business names, auto-append a number
//    (WSrosegarden, WSrosegarden2, WSrosegarden3, ...).
// 3. Very long business names may be reasonably truncated for a cleaner
//    code.

const MAX_NAME_LENGTH = 24; // "reasonably truncated" — keeps codes short
                             // and readable while still recognisably tied
                             // to the business name.
const MAX_COLLISION_ATTEMPTS = 50; // generous ceiling; a name colliding
                                    // with 50 others is effectively
                                    // impossible in practice — this just
                                    // guards against an infinite loop.

/**
 * Pure function: business name -> base wholesale code (no collision
 * handling). "WS" + lowercase + spaces/apostrophes/special chars stripped
 * + reasonably truncated. Exported separately from the DB-aware version
 * below so this can be unit-tested without a database connection.
 */
function buildBaseWholesaleCode(businessName) {
  const cleaned = String(businessName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') // strips spaces, apostrophes, and any other
                                // special/non-alphanumeric characters
    .slice(0, MAX_NAME_LENGTH);
  return `WS${cleaned || 'partner'}`; // 'partner' fallback only for the
                                       // pathological case of a business
                                       // name with zero alphanumeric
                                       // characters at all (e.g. "!!!")
                                       // — never actually blank.
}

/**
 * Given a base code and a Set of codes already in use, returns the first
 * available code following the client's exact numbering scheme: the bare
 * name first (WSrosegarden), then 2, 3, 4... on collision
 * (WSrosegarden2, WSrosegarden3) — never skips to a random suffix.
 */
function resolveAvailableCode(baseCode, existingCodesSet) {
  if (!existingCodesSet.has(baseCode)) return baseCode;
  for (let n = 2; n <= MAX_COLLISION_ATTEMPTS; n++) {
    const candidate = `${baseCode}${n}`;
    if (!existingCodesSet.has(candidate)) return candidate;
  }
  // Effectively unreachable in practice (50 businesses with the exact same
  // cleaned name) — falls back to a timestamp suffix rather than looping
  // forever or throwing, so account creation never hard-fails on this.
  return `${baseCode}${Date.now()}`;
}

/**
 * DB-aware version: generates a unique wholesale code for a new partner
 * account, checking against every wholesale_code already in the `stations`
 * table (across all account types — florist/gift_shop/cake_shop/radio all
 * share one code namespace, since they're all rows of the same table and
 * a collision between e.g. a florist and a radio station would be just as
 * broken as one between two florists).
 */
async function createUniqueWholesaleCode(supabase, businessName) {
  const baseCode = buildBaseWholesaleCode(businessName);
  const { data, error } = await supabase
    .from('stations')
    .select('wholesale_code')
    .not('wholesale_code', 'is', null)
    .ilike('wholesale_code', `${baseCode}%`);

  if (error) throw error;

  const existingCodesSet = new Set((data || []).map(row => String(row.wholesale_code || '').toLowerCase()));
  return resolveAvailableCode(baseCode, existingCodesSet);
}

/**
 * DB-aware version for ATTRIBUTION codes (Phase 6/7, client request 21 Aug
 * 2026 — Col: "each one gets their own unique code"). Deliberately
 * separate from createUniqueWholesaleCode() above, not a thin wrapper
 * around it: that function checks collisions against `stations
 * .wholesale_code`, a completely different namespace from `promo_codes
 * .code` — reusing it as-is here would check the wrong table (see
 * phase6.md Step 4 for the full reasoning). Reuses only the proven
 * cleaning/truncation (buildBaseWholesaleCode) and numbering
 * (resolveAvailableCode) logic, dropping the "WS" prefix (that prefix
 * specifically means "wholesale credit-buying code" elsewhere in this
 * app — keeping it here would visually misrepresent an unrelated
 * attribution code as one) and matching promo_codes' own uppercase
 * convention (see normalizePromoCode in attribution.js) instead of
 * wholesale codes' lowercase one.
 */
/**
 * Bug fix, 2 Sept 2026 (client report, Col — screenshot showing a
 * reseller's auto-generated code saved as "MUHAMMADISMAEEL" instead of
 * his required format). Col's own spec, verbatim: "Every reseller starts
 * with (first name lower case) surname first letter in Caps and then the
 * offer 20 being 20% discount... colinM20 colinMlove20 colinMmum30...
 * jhe-annB20." This builds exactly that: lowercase first name + capital
 * surname initial + the commission rate as a whole number — instead of
 * the old buildBaseWholesaleCode()-based logic, which just lowercased
 * and concatenated the ENTIRE name with no surname split and no rate
 * suffix at all, and which this function used to also force uppercase
 * afterward, destroying the mixed case even where the base logic did
 * happen to produce it. Deliberately a separate function from
 * buildBaseWholesaleCode()/createUniqueWholesaleCode() above — that pair
 * is proven, tested logic for a DIFFERENT format (WS+businessname,
 * lowercase, no rate) used for the wholesale-credit system; conflating
 * the two would risk regressing that working feature to chase this
 * different one.
 */
function buildResellerCodeBase(partnerName, commissionRate) {
  const words = String(partnerName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  // Each name word cleaned the same way (lowercase, alphanumeric + hyphen
  // only) so "Jhe-Ann" survives as "jhe-ann" — Col's own example keeps
  // the hyphen — while still stripping anything that isn't safe in a URL
  // query parameter or a typed-in checkout field.
  const clean = (w) => String(w || '').toLowerCase().replace(/[^a-z0-9-]/g, '');

  const firstName = clean(words[0]) || 'partner';
  // Surname initial only when there IS a second word — a single-word
  // name (just "Cher", or a business name with no clear "surname") has
  // nothing to take an initial from, so the code is just the first name
  // + rate rather than guessing at a fake initial.
  const surnameInitial = words.length > 1 ? clean(words[words.length - 1]).charAt(0).toUpperCase() : '';

  const rateSuffix = Number.isFinite(commissionRate) && commissionRate !== null
    ? String(Math.round(commissionRate))
    : '';

  return `${firstName}${surnameInitial}${rateSuffix}`;
}

async function createUniqueAttributionCode(supabase, partnerName, commissionRate) {
  const baseCode = buildResellerCodeBase(partnerName, commissionRate);
  const { data, error } = await supabase
    .from('promo_codes')
    .select('code')
    .ilike('code', `${baseCode}%`);

  if (error) throw error;

  // Collision comparison stays case-insensitive (matches the DB's own
  // lower(code) unique index), but resolveAvailableCode is handed the
  // correctly-cased baseCode and only ever appends a plain number on
  // collision — it never changes the case of what's already there.
  const existingCodesSet = new Set((data || []).map(row => String(row.code || '').toLowerCase()));
  const existingCodesSetLower = new Set([...existingCodesSet]);
  if (existingCodesSetLower.has(baseCode.toLowerCase())) {
    // resolveAvailableCode expects the exact string it's checking for in
    // the set — feed it the lowercase form for the membership test, but
    // reconstruct the real (mixed-case) candidate at each step.
    for (let n = 2; n <= 50; n++) {
      const candidate = `${baseCode}${n}`;
      if (!existingCodesSetLower.has(candidate.toLowerCase())) return candidate;
    }
    return `${baseCode}${Date.now()}`;
  }
  return baseCode;
}

module.exports = { buildBaseWholesaleCode, resolveAvailableCode, createUniqueWholesaleCode, createUniqueAttributionCode, buildResellerCodeBase };
