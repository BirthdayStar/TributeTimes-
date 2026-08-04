'use strict';

// ============================================================
// POST-PURCHASE SECOND-PURCHASE DISCOUNT (new_changes.md Step 7)
// Every completed direct-consumer (public portal) purchase should
// automatically receive a follow-up discount code for a second
// keepsake — distinct from the pre-purchase share/referral widget,
// which is a different, already-built feature.
//
// Reuses the exact same infrastructure built for the Philippines
// campaign-code system (Step 5): a single Stripe coupon, a single-use
// row in `promo_codes`, and the existing `resolveCampaignPromoCode` /
// `consumeCampaignPromoCode` server-side validation in
// public-checkout.js — so this code is verified redeemable at
// checkout time, never just a static/guessed string embedded in an
// email. Requires no new database columns: all codes from this
// feature share one fixed `batch_id`/`batch_label` so they're
// trackable/reportable separately from manually-created campaign
// batches in the existing admin Campaign Codes screen.
//
// No idempotency check is needed here: the caller
// (reconcilePublicOrderPaymentFromSession in public-checkout.js) only
// reaches this function once per order, ever — its own atomic
// `UPDATE ... WHERE payment_status = 'pending'` guard means a repeat
// call for an already-paid order short-circuits before this point.
// ============================================================

const crypto = require('crypto');

const SECOND_PURCHASE_COUPON_ID = 'second-purchase-10pc';
const SECOND_PURCHASE_BATCH_ID = '7b1e9c9a-5f3d-4a1c-9e77-000000000001';
const SECOND_PURCHASE_BATCH_LABEL = 'Second Purchase Discount (Auto)';
const SECOND_PURCHASE_DISCOUNT_PERCENT = 10;
const SECOND_PURCHASE_VALID_DAYS = 90;

async function getOrCreateSecondPurchaseCoupon(stripe) {
  try {
    return await stripe.coupons.retrieve(SECOND_PURCHASE_COUPON_ID);
  } catch (error) {
    return stripe.coupons.create({
      id: SECOND_PURCHASE_COUPON_ID,
      percent_off: SECOND_PURCHASE_DISCOUNT_PERCENT,
      duration: 'once',
      name: 'Second Purchase Discount - 10%',
    });
  }
}

function generateSecondPurchaseCode() {
  const suffix = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `THANKYOU-${suffix}`;
}

// Creates one single-use, server-validated promo code and returns it.
async function issueSecondPurchaseDiscountCode({ supabase, stripe }) {
  const coupon = await getOrCreateSecondPurchaseCoupon(stripe);
  const validUntil = new Date(Date.now() + SECOND_PURCHASE_VALID_DAYS * 24 * 60 * 60 * 1000).toISOString();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await supabase
      .from('promo_codes')
      .insert({
        code: generateSecondPurchaseCode(),
        code_type: 'campaign_single_use',
        active: true,
        monthly_free_demo_limit: 0,
        max_uses: 1,
        used_count: 0,
        discount_type: 'percent',
        discount_value: SECOND_PURCHASE_DISCOUNT_PERCENT,
        country: null,
        valid_until: validUntil,
        batch_id: SECOND_PURCHASE_BATCH_ID,
        batch_label: SECOND_PURCHASE_BATCH_LABEL,
        stripe_coupon_id: coupon.id,
      })
      .select('*')
      .single();

    if (!data && error?.code === '23505') continue; // code collision, retry with a fresh random suffix
    if (error) throw error;
    return data;
  }

  throw new Error('Unable to issue a second-purchase discount code after 3 attempts.');
}

module.exports = {
  issueSecondPurchaseDiscountCode,
  SECOND_PURCHASE_DISCOUNT_PERCENT,
};
