'use strict';

const PRODUCT_TIERS = Object.freeze({
  digital: Object.freeze({
    code: 'digital',
    label: 'Digital',
    priceNzd: 14.95,
    priceCents: 1495,
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
      30: Object.freeze({ credits: 30, priceNzd: 96, priceCents: 9600 }),
      60: Object.freeze({ credits: 60, priceNzd: 192, priceCents: 19200 }),
      120: Object.freeze({ credits: 120, priceNzd: 380, priceCents: 38000 }),
    }),
  }),
});
const FLORIST_CREDIT_PACK_SIZES = Object.freeze([30, 60, 120]);
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
  DEFAULT_FLORIST_LOW_CREDIT_THRESHOLD,
  ANTHROPIC_DAILY_ALERT_THRESHOLD_USD,
  GENERATE_RATE_LIMIT_MAX,
  GENERATE_RATE_LIMIT_WINDOW_MS,
  ANTHROPIC_MODEL_PRICING_USD_PER_MILLION,
  DEFAULT_CURRENCY_CODE,
};
