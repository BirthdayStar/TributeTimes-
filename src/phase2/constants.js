'use strict';

const PRODUCT_TIERS = Object.freeze({
  digital: Object.freeze({
    code: 'digital',
    label: 'Digital',
    // Client-corrected price, 19 Aug 2026 (Col: "Please note NZ price is
    // 9.95 its still showing as 14.95") — was 14.95/1495. This is the
    // real, authoritative charge amount: public-checkout.js's
    // buildLineItems() reads tier.priceCents directly for the Stripe
    // unit_amount, so this single change is what actually corrects what
    // customers get charged, not just what they see displayed.
    priceNzd: 9.95,
    priceCents: 995,
    needsFulfilment: false,
    includesFrame: false,
    packagingNotes: 'Digital delivery only',
  }),
  standard: Object.freeze({
    code: 'standard',
    label: 'Standard',
    priceNzd: 24.95,
    priceCents: 2495,
    needsFulfilment: true,
    includesFrame: false,
    packagingNotes: 'Plain cream envelope, cardboard mount, gold foil seal sticker',
  }),
  premium: Object.freeze({
    code: 'premium',
    label: 'Premium',
    priceNzd: 34.95,
    priceCents: 3495,
    needsFulfilment: true,
    includesFrame: true,
    packagingNotes: 'Floral embossed envelope, cardboard mount, gold foil seal sticker, frame included',
  }),
});

const DELIVERY_OPTIONS = Object.freeze({
  standard: Object.freeze({
    code: 'standard',
    label: 'Standard',
    surchargeNzd: 0,
    surchargeCents: 0,
    priority: 3,
    queueStatus: 'pending',
    customerMessage: 'Standard delivery 3-5 days.',
  }),
  '2day': Object.freeze({
    code: '2day',
    label: '2 Day',
    surchargeNzd: 5,
    surchargeCents: 500,
    priority: 2,
    queueStatus: 'pending',
    customerMessage: '2 Day delivery 2 days.',
  }),
  overnight: Object.freeze({
    code: 'overnight',
    label: 'Overnight',
    surchargeNzd: 12,
    surchargeCents: 1200,
    priority: 1,
    queueStatus: 'pending',
    customerMessage: 'Overnight delivery tomorrow.',
  }),
});

const QUEUE_STATUS = Object.freeze({
  pending: 'pending',
  printed: 'printed',
  posted: 'posted',
  delivered: 'delivered',
});

const SOURCE_PORTALS = Object.freeze({
  public: 'public',
  radio: 'radio',
  florist: 'florist',
});

const WATERMARK_STATUS = Object.freeze({
  none: 'none',
  samplePreview: 'sample_preview',
  cleanPaid: 'clean_paid',
});

const PAYMENT_STATUS = Object.freeze({
  notRequired: 'not_required',
  pending: 'pending',
  paid: 'paid',
  failed: 'failed',
  cancelled: 'cancelled',
  refunded: 'refunded',
});

const ATTRIBUTION_SOURCE = Object.freeze({
  none: 'none',
  promoCode: 'promo_code',
  postcode: 'postcode',
  manual: 'manual',
  // Phase 7 — client request 21 Aug 2026 (Col, Scenario A): a referred
  // friend's purchase (no promo code typed, arrived via a "Share the
  // Love" link) now falls back to the referral's origin consultant when
  // no other attribution source won. Distinguished from promoCode so this
  // isn't misrepresented as a typed-in code in reporting.
  referral: 'referral',
});

const SUPPORTED_COUNTRIES = Object.freeze([
  'New Zealand',
  'Australia',
  'Philippines',
  'United Kingdom',
  'Ireland',
  'United States',
  'South Africa',
  'Canada',
  'Singapore',
]);

const FAMOUS_BIRTHDAYS_COUNTRIES = Object.freeze([...SUPPORTED_COUNTRIES]);

const FLORIST_CREDIT_PACK_TYPES = Object.freeze({
  standard: Object.freeze({
    code: 'standard',
    label: 'Standard',
    description: 'Plain cream envelope',
    priceEnvPrefix: 'STRIPE_FLORIST_STANDARD_PACK',
    packs: Object.freeze({
      30: Object.freeze({ credits: 30, priceNzd: 90, priceCents: 9000 }),
      60: Object.freeze({ credits: 60, priceNzd: 192, priceCents: 19200 }),
      120: Object.freeze({ credits: 120, priceNzd: 380, priceCents: 38000 }),
    }),
  }),
  premiumFloral: Object.freeze({
    code: 'premiumFloral',
    label: 'Premium Floral',
    description: 'Floral embossed envelope',
    priceEnvPrefix: 'STRIPE_FLORIST_PREMIUM_FLORAL_PACK',
    packs: Object.freeze({
      30: Object.freeze({ credits: 30, priceNzd: 110, priceCents: 11000 }),
      60: Object.freeze({ credits: 60, priceNzd: 230, priceCents: 23000 }),
      120: Object.freeze({ credits: 120, priceNzd: 450, priceCents: 45000 }),
    }),
  }),
});
const FLORIST_CREDIT_PACK_SIZES = Object.freeze([30, 60, 120]);
// FLORIST_CREDIT_PACK_TYPES/SIZES above are kept in place (unused by the
// new purchasing flow, but not deleted) rather than removed outright —
// see FLORIST_WHOLESALE_PRICING below for the replacement.

// PAY-AS-YOU-USE WHOLESALE CREDITS — client decision, 19 Aug 2026 (Col):
// "With our new approach we are removing all boundaries for florists Gift
// Shops, Radio stations etc - They will buy as they use so no presales no
// stock on hand." Followed up 20 Aug 2026 with the actual rate: "The
// wholesale price is a 35% discount." Replaces the fixed 30/60/120-credit
// packs above — partners now buy any quantity, 1 credit at a time if they
// want, at a flat per-unit wholesale rate.
// The 35% discount is applied against the matching RETAIL printed tier —
// "Standard" wholesale credits produce the same plain-cream-envelope
// keepsake as the site's own retail Standard tier, "Premium Floral"
// wholesale credits produce the same floral-embossed keepsake as retail
// Premium — so the wholesale price is derived directly from
// PRODUCT_TIERS.standard/premium above rather than being a separately
// invented number that could silently drift out of sync with a future
// retail price change.
const WHOLESALE_DISCOUNT_RATE = 0.35;
function deriveWholesaleUnitPriceCents(retailPriceCents) {
  return Math.round(retailPriceCents * (1 - WHOLESALE_DISCOUNT_RATE));
}
const FLORIST_WHOLESALE_STANDARD_UNIT_CENTS = deriveWholesaleUnitPriceCents(PRODUCT_TIERS.standard.priceCents);
const FLORIST_WHOLESALE_PREMIUM_FLORAL_UNIT_CENTS = deriveWholesaleUnitPriceCents(PRODUCT_TIERS.premium.priceCents);
const FLORIST_WHOLESALE_PRICING = Object.freeze({
  standard: Object.freeze({
    code: 'standard',
    label: 'Standard',
    description: 'Plain cream envelope',
    unitPriceCents: FLORIST_WHOLESALE_STANDARD_UNIT_CENTS,
    unitPriceNzd: FLORIST_WHOLESALE_STANDARD_UNIT_CENTS / 100,
  }),
  premiumFloral: Object.freeze({
    code: 'premiumFloral',
    label: 'Premium Floral',
    description: 'Floral embossed envelope',
    unitPriceCents: FLORIST_WHOLESALE_PREMIUM_FLORAL_UNIT_CENTS,
    unitPriceNzd: FLORIST_WHOLESALE_PREMIUM_FLORAL_UNIT_CENTS / 100,
  }),
});
const FLORIST_WHOLESALE_MAX_QUANTITY = 500; // sanity ceiling against a
                                             // typo'd quantity (e.g. an
                                             // extra zero) creating an
                                             // unexpectedly large real
                                             // charge — not a real
                                             // business limit.
const DEFAULT_FLORIST_LOW_CREDIT_THRESHOLD = 10;
const ANTHROPIC_DAILY_ALERT_THRESHOLD_USD = 5;
const GENERATE_RATE_LIMIT_MAX = 10;
const GENERATE_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const ANTHROPIC_MODEL_PRICING_USD_PER_MILLION = Object.freeze({
  'claude-sonnet-4-6': Object.freeze({ input: 3, output: 15 }),
  'claude-sonnet-4-5': Object.freeze({ input: 3, output: 15 }),
  default: Object.freeze({ input: 3, output: 15 }),
});
const DEFAULT_CURRENCY_CODE = 'NZD';

module.exports = {
  PRODUCT_TIERS,
  DELIVERY_OPTIONS,
  QUEUE_STATUS,
  SOURCE_PORTALS,
  WATERMARK_STATUS,
  PAYMENT_STATUS,
  ATTRIBUTION_SOURCE,
  SUPPORTED_COUNTRIES,
  FAMOUS_BIRTHDAYS_COUNTRIES,
  FLORIST_CREDIT_PACK_TYPES,
  FLORIST_CREDIT_PACK_SIZES,
  WHOLESALE_DISCOUNT_RATE,
  FLORIST_WHOLESALE_PRICING,
  FLORIST_WHOLESALE_MAX_QUANTITY,
  DEFAULT_FLORIST_LOW_CREDIT_THRESHOLD,
  ANTHROPIC_DAILY_ALERT_THRESHOLD_USD,
  GENERATE_RATE_LIMIT_MAX,
  GENERATE_RATE_LIMIT_WINDOW_MS,
  ANTHROPIC_MODEL_PRICING_USD_PER_MILLION,
  DEFAULT_CURRENCY_CODE,
};
