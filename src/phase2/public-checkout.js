'use strict';

const crypto = require('crypto');
const {
  PRODUCT_TIERS,
  DELIVERY_OPTIONS,
  SOURCE_PORTALS,
  PAYMENT_STATUS,
  ATTRIBUTION_SOURCE,
  SUPPORTED_COUNTRIES,
  WATERMARK_STATUS,
} = require('./constants');
const { PHASE2_CONFIG } = require('./config');
const { getNextOrderNumber } = require('./order-number');
const { saveKeepsakeRecord, updateKeepsakeRecord } = require('./save-keepsake');
const { generatePdfFromHtml } = require('./pdf-service');
const { buildPublicOrderAdminEmail, buildSecondPurchaseDiscountEmail } = require('./email-service');
const { resolvePaidOrderAttribution } = require('./attribution');
const { tryRedeemGcashPaidPromoCode } = require('./gcash-payment-requests');
const { issueSecondPurchaseDiscountCode, SECOND_PURCHASE_DISCOUNT_PERCENT } = require('./second-purchase-discount');
const { captureMarketingContact } = require('./marketing-contacts');

function registerPublicCheckoutRoutes(app, { stripe, supabase, sendEmail }) {
  if (!app) throw new Error('Express app is required.');
  if (!stripe) throw new Error('Stripe client is required.');
  if (!supabase) throw new Error('Supabase client is required.');

  app.post('/api/public/checkout-session', async (req, res) => {
    try {
      const rawPayload = normalizePayload(req.body || {}, req.ip);
      const payload = await enrichPayloadFromExistingKeepsake(supabase, rawPayload);
      const gcashRedemption = await tryRedeemGcashPaidPromoCode({
        supabase,
        sendEmail,
        payload,
      });
      if (gcashRedemption) {
        return res.json(gcashRedemption);
      }

      const baseUrl = getBaseUrl(req);
      const attribution = await resolvePaidOrderAttribution({
        supabase,
        promoCode: payload.promoCode,
        existingKeepsake: payload.existingKeepsake,
        postcode: payload.shippingPostcode,
        country: payload.shippingCountry || payload.country,
      });
      const keepsakeId = payload.keepsakeId || await createKeepsakeIfNeeded(supabase, payload, attribution);
      const tier = PRODUCT_TIERS[payload.productTier];
      const delivery = payload.deliveryOption ? DELIVERY_OPTIONS[payload.deliveryOption] : null;
      const orderNumber = await getNextOrderNumber(supabase);
      const orderRecord = await createPendingOrder({
        supabase,
        keepsakeId,
        orderNumber,
        payload,
        tier,
        delivery,
        attribution,
      });

      const lineItems = buildLineItems(tier, delivery);
      const viralShare = payload.referralCode ? await resolveViralShareRow(supabase, payload.referralCode) : null;
      const campaignCode = payload.promoCode
        ? await resolveCampaignPromoCode(supabase, payload.promoCode, payload.shippingCountry || payload.country)
        : null;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        customer_email: payload.customerEmail,
        billing_address_collection: 'auto',
        line_items: lineItems,
        ...(campaignCode
          ? { discounts: [{ coupon: campaignCode.stripe_coupon_id }] }
          : viralShare && process.env.STRIPE_VIRAL_SHARE_COUPON_ID
          ? { discounts: [{ coupon: process.env.STRIPE_VIRAL_SHARE_COUPON_ID }] }
          : {}),
        success_url: `${baseUrl}/public?checkout=success&order=${orderRecord.id}`,
        cancel_url: `${baseUrl}/public?checkout=cancelled&order=${orderRecord.id}`,
        metadata: {
          type: 'public_order',
          order_id: orderRecord.id,
          order_number: orderNumber,
          keepsake_id: keepsakeId,
          source_portal: SOURCE_PORTALS.public,
          tier: payload.productTier,
          delivery_option: payload.deliveryOption || '',
          promo_code: attribution.promoCode || payload.promoCode || '',
          attribution_source: orderRecord.attribution_source || ATTRIBUTION_SOURCE.none,
          sales_consultant_id: orderRecord.sales_consultant_id || '',
          territory_id: orderRecord.territory_id || '',
          viral_share_code: viralShare ? payload.referralCode.toUpperCase() : '',
          campaign_code: campaignCode ? campaignCode.code : '',
          marketing_consent: payload.marketingConsent ? '1' : '0',
        },
      });

      await supabase
        .from('orders')
        .update({ stripe_checkout_session_id: session.id })
        .eq('id', orderRecord.id);

      if (viralShare) {
        await supabase
          .from('viral_shares')
          .update({ redeemed_count: (viralShare.redeemed_count || 0) + 1 })
          .eq('id', viralShare.id);
      }

      if (campaignCode) {
        // Same atomic, self-verifying consume pattern as the GCash-generated
        // codes (Step 2) — a conditional update guarded on used_count/active/
        // expiry, checked for zero-row failure, not a blind increment.
        await consumeCampaignPromoCode(supabase, campaignCode, orderRecord.id);
      }

      return res.json({
        url: session.url,
        orderId: orderRecord.id,
        orderNumber,
        checkoutSessionId: session.id,
      });
    } catch (error) {
      console.error('Public checkout error:', error);
      return res.status(400).json({ error: error.message || 'Unable to create checkout session.' });
    }
  });

  app.get('/api/public/orders/:orderId', async (req, res) => {
    try {
      const order = await loadPublicOrder(supabase, req.params.orderId);
      const resolvedOrder = await resolvePublicOrderStatus({
        stripe,
        supabase,
        sendEmail,
        order,
      });

      return res.json(buildPublicOrderResponse(resolvedOrder));
    } catch (error) {
      console.error('Public order lookup error:', error);
      return res.status(404).json({ error: error.message || 'Order not found.' });
    }
  });

  // Lets the frontend confirm a ?ref= code is real BEFORE telling the visitor
  // "10% off applied" — the checkout-session route below re-validates this
  // same code server-side regardless, this is purely so the UI never claims
  // a discount that won't actually show up at Stripe checkout.
  app.get('/api/public/share/validate', async (req, res) => {
    const code = String(req.query.code || '').trim();
    if (!code) return res.json({ valid: false });
    const row = await resolveViralShareRow(supabase, code);
    return res.json({ valid: Boolean(row) });
  });

  // Client-reported bug (11 Aug 2026, urgent — "Promo/referral discount
  // doesn't apply"): the checkout promo code field had no Apply button and
  // no way to trigger validation — entering a code and tabbing out gave no
  // confirmation and no error either way, same complaint the share-code
  // validate route above already solved for referral links. Mirrors that
  // exact pattern for the checkout promo field: lets the frontend show a
  // real "valid"/"not valid, here's why" message as soon as the customer
  // leaves the field, using the same resolveCampaignPromoCode() check the
  // checkout-session route re-runs anyway — so this is purely an early,
  // friendlier preview, never the sole gate (checkout-session below still
  // authoritatively re-validates before any Stripe session is created).
  app.get('/api/public/promo/validate', async (req, res) => {
    const code = String(req.query.code || '').trim();
    const country = String(req.query.country || '').trim();
    if (!code) return res.json({ valid: false });
    try {
      const campaign = await resolveCampaignPromoCode(supabase, code, country);
      return res.json({ valid: Boolean(campaign) });
    } catch (error) {
      return res.json({ valid: false, message: error.message || 'That promo code is not valid.' });
    }
  });

  // Viral share loop (Tasks 1.7/1.8). Pre-payment shares unlock 10% off
  // immediately for the sharer; post-purchase shares create a link that
  // gives the next visitor 10% off at their own checkout.
  app.post('/api/public/share', async (req, res) => {
    try {
      const keepsakeId = req.body?.keepsakeId || null;
      const orderId = req.body?.orderId || null;
      if (!keepsakeId && !orderId) {
        throwStatus(400, 'A keepsake or order is required to create a share link.');
      }

      const originType = orderId ? 'post_purchase' : 'pre_payment';
      const code = await createOrReuseShareCode(supabase, { keepsakeId, orderId, originType });
      const baseUrl = getBaseUrl(req);

      return res.json({
        code,
        shareUrl: `${baseUrl}/public?ref=${encodeURIComponent(code)}`,
        discountUnlocked: originType === 'pre_payment',
      });
    } catch (error) {
      console.error('Share link error:', error);
      return res.status(error.statusCode || 400).json({ error: error.message || 'Unable to create share link.' });
    }
  });
}

async function createOrReuseShareCode(supabase, { keepsakeId, orderId, originType }) {
  const matchColumn = orderId ? 'origin_order_id' : 'origin_keepsake_id';
  const matchValue = orderId || keepsakeId;

  const { data: existing } = await supabase
    .from('viral_shares')
    .select('code')
    .eq('origin_type', originType)
    .eq(matchColumn, matchValue)
    .maybeSingle();
  if (existing) return existing.code;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    const { data, error } = await supabase
      .from('viral_shares')
      .insert({
        code,
        origin_type: originType,
        origin_keepsake_id: keepsakeId || null,
        origin_order_id: orderId || null,
      })
      .select('code')
      .single();

    if (!error) return data.code;
    if (error.code !== '23505') {
      throw new Error(`Unable to create share link: ${error.message}`);
    }
  }

  throw new Error('Unable to generate a unique share code.');
}

async function resolveViralShareRow(supabase, referralCode) {
  const code = String(referralCode || '').trim().toUpperCase();
  if (!code) return null;

  const { data, error } = await supabase
    .from('viral_shares')
    .select('id, redeemed_count')
    .ilike('code', code)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

// Single-use, batch-generated campaign codes (Step 5, new_changes.md — the
// Philippines florist/GCash single-use promo code system). Distinct from
// resolveViralShareRow (referral codes) and the gcash_paid_access codes
// handled in gcash-payment-requests.js.
async function resolveCampaignPromoCode(supabase, code, customerCountry) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) return null;

  const { data, error } = await supabase
    .from('promo_codes')
    .select('id, code, used_count, max_uses, active, valid_until, country, stripe_coupon_id')
    .ilike('code', normalized)
    .eq('code_type', 'campaign_single_use')
    .maybeSingle();
  // Not a campaign code at all (wrong code_type or genuinely doesn't exist) —
  // return null quietly and let the earlier attribution lookup in
  // attribution.js handle "this code doesn't exist anywhere" with its own
  // error. But once we've found a row that IS a campaign code, every
  // remaining failure reason below throws a specific, honest error instead
  // of silently letting checkout proceed at full price — the same principle
  // as the referral-discount fix: never let a customer submit a code and
  // have it silently not apply with no explanation.
  if (error || !data) return null;

  if (!data.active || Number(data.used_count || 0) >= Number(data.max_uses || 1)) {
    throwStatus(400, 'This promo code has already been used.');
  }
  if (data.valid_until && new Date(data.valid_until) < new Date()) {
    throwStatus(400, 'This promo code has expired.');
  }
  if (data.country && customerCountry && data.country.toLowerCase() !== String(customerCountry).toLowerCase()) {
    throwStatus(400, `This promo code is only valid for customers in ${data.country}.`);
  }
  if (!data.stripe_coupon_id) {
    throwStatus(500, 'This promo code is misconfigured — no discount is attached. Please contact support.');
  }

  return data;
}

async function consumeCampaignPromoCode(supabase, promo, orderId) {
  const { data, error } = await supabase
    .from('promo_codes')
    .update({
      used_count: Number(promo.used_count || 0) + 1,
      used_at: new Date().toISOString(),
      used_order_id: orderId,
      active: Number(promo.used_count || 0) + 1 >= Number(promo.max_uses || 1) ? false : true,
    })
    .eq('id', promo.id)
    .eq('active', true)
    .lt('used_count', Number(promo.max_uses || 1))
    .select('id')
    .single();

  if (error || !data) {
    // Lost the race (redeemed by someone else a moment earlier) — the
    // discount has already been applied to this Stripe session, which is
    // the same acceptable tradeoff the existing viral-share codes make
    // (consumed at session-creation time, not at confirmed-payment time).
    // Logged, not thrown, so a rare double-attempt doesn't break checkout.
    console.warn('Campaign promo code consume race or already used:', promo.code);
  }
}

function getBaseUrl(req) {
  const host = req.get('host') || '';
  const forwardedProto = req.get('x-forwarded-proto');
  const protocol = forwardedProto || req.protocol || 'http';

  if (/^localhost(?::\d+)?$/i.test(host) || /^127\.0\.0\.1(?::\d+)?$/i.test(host)) {
    return `${protocol}://${host}`;
  }

  return process.env.APP_URL || 'http://localhost:3000';
}

function normalizePayload(body, requestIp) {
  const productTier = String(body.productTier || '').trim().toLowerCase();
  const deliveryOptionRaw = String(body.deliveryOption || '').trim().toLowerCase();
  const promoCode = String(body.promoCode || '').trim();
  const referralCode = String(body.referralCode || '').trim();

  if (!PRODUCT_TIERS[productTier]) {
    throw new Error('Invalid product tier.');
  }

  // Digital-only for the public portal for now (new_changes.md bug #12,
  // client decision, 7 Aug 2026) — Standard/Premium are hidden in the
  // checkout UI, but this is the actual enforcement: a direct API request
  // bypassing the frontend can't select a tier that isn't for sale.
  if (productTier !== 'digital') {
    throw new Error('This product option is not currently available. Digital is the only option right now.');
  }

  const needsFulfilment = PRODUCT_TIERS[productTier].needsFulfilment;
  const deliveryOption = needsFulfilment ? (deliveryOptionRaw || 'standard') : null;

  if (deliveryOption && !DELIVERY_OPTIONS[deliveryOption]) {
    throw new Error('Invalid delivery option.');
  }

  if (!body.customerName || !String(body.customerName).trim()) {
    throw new Error('Customer name is required.');
  }
  if (!body.customerEmail || !String(body.customerEmail).trim()) {
    throw new Error('Customer email is required.');
  }
  const keepsakeId = body.keepsakeId || null;
  const recipientName = String(body.recipientName || '').trim();
  const dateOfBirth = String(body.dateOfBirth || '').trim();
  const country = String(body.country || '').trim();

  if (!keepsakeId && !recipientName) {
    throw new Error('Recipient name is required.');
  }
  if (!keepsakeId && !dateOfBirth) {
    throw new Error('Date is required.');
  }
  if (country && !SUPPORTED_COUNTRIES.includes(country)) {
    throw new Error('Unsupported country.');
  }

  if (needsFulfilment) {
    validateShippingFields(body);
  }

  return {
    keepsakeId,
    productTier,
    deliveryOption,
    promoCode,
    referralCode,
    customerName: String(body.customerName).trim(),
    customerEmail: String(body.customerEmail).trim(),
    marketingConsent: body.marketingConsent !== false,
    recipientName,
    dateOfBirth,
    country,
    residenceCountry: String(body.residenceCountry || '').trim() || null,
    occasion: String(body.occasion || 'Birthday').trim(),
    senderName: String(body.senderName || '').trim() || null,
    stationName: String(body.stationName || '').trim() || null,
    personalMessage: String(body.personalMessage || '').trim() || null,
    renderedHtml: typeof body.renderedHtml === 'string' ? body.renderedHtml : null,
    generatedContent: body.generatedContent && typeof body.generatedContent === 'object' ? body.generatedContent : null,
    requestIp: requestIp || body.requestIp || null,
    shippingName: String(body.shippingName || body.customerName || '').trim() || null,
    shippingAddressLine1: String(body.shippingAddressLine1 || '').trim() || null,
    shippingAddressLine2: String(body.shippingAddressLine2 || '').trim() || null,
    shippingCity: String(body.shippingCity || '').trim() || null,
    shippingRegion: String(body.shippingRegion || '').trim() || null,
    shippingPostcode: String(body.shippingPostcode || '').trim() || null,
    shippingCountry: String(body.shippingCountry || country || 'New Zealand').trim(),
  };
}

async function enrichPayloadFromExistingKeepsake(supabase, payload) {
  if (!payload.keepsakeId) {
    return payload;
  }

  const { data, error } = await supabase
    .from('keepsakes')
    .select('listener_name, listener_dob, country, occasion, sender_name, station_name, dj_message, rendered_html, content, promo_code_id, sales_consultant_id, is_free_demo')
    .eq('id', payload.keepsakeId)
    .single();

  if (error || !data) {
    throw new Error('Unable to find the existing keepsake for this order.');
  }

  return {
    ...payload,
    recipientName: payload.recipientName || data.listener_name,
    dateOfBirth: payload.dateOfBirth || data.listener_dob,
    country: payload.country || data.country,
    occasion: payload.occasion || data.occasion || 'Birthday',
    senderName: payload.senderName || data.sender_name,
    stationName: payload.stationName || data.station_name,
    personalMessage: payload.personalMessage || data.dj_message,
    renderedHtml: payload.renderedHtml || data.rendered_html,
    generatedContent: payload.generatedContent || data.content,
    existingKeepsake: data,
  };
}

function validateShippingFields(body) {
  const required = [
    ['shippingName', 'Shipping name'],
    ['shippingAddressLine1', 'Shipping address'],
    ['shippingCity', 'Shipping city'],
    ['shippingPostcode', 'Shipping postcode'],
    ['shippingCountry', 'Shipping country'],
  ];

  for (const [field, label] of required) {
    if (!body[field] || !String(body[field]).trim()) {
      throw new Error(`${label} is required for printed orders.`);
    }
  }
}

async function createKeepsakeIfNeeded(supabase, payload, attribution = {}) {
  if (!payload.renderedHtml) {
    throw new Error('Generated keepsake preview is required before checkout.');
  }

  const record = await saveKeepsakeRecord(supabase, {
    sourcePortal: SOURCE_PORTALS.public,
    edition: SOURCE_PORTALS.public,
    occasion: payload.occasion,
    recipientName: payload.recipientName,
    dateOfBirth: payload.dateOfBirth,
    country: payload.country,
    residenceCountry: payload.residenceCountry,
    senderName: payload.senderName,
    stationName: payload.stationName,
    customerName: payload.customerName,
    customerEmail: payload.customerEmail,
    personalMessage: payload.personalMessage,
    content: payload.generatedContent,
    renderedHtml: payload.renderedHtml,
    watermarkStatus: WATERMARK_STATUS.samplePreview,
    promoCodeId: attribution.promoCodeId || null,
    salesConsultantId: attribution.salesConsultantId || null,
    isFreeDemo: false,
    requestIp: payload.requestIp,
  });

  return record.id;
}

async function createPendingOrder({ supabase, keepsakeId, orderNumber, payload, tier, delivery, attribution = {} }) {
  const needsFulfilment = Boolean(tier.needsFulfilment);
  const deliveryPriority = needsFulfilment ? (delivery ? delivery.priority : DELIVERY_OPTIONS.standard.priority) : 99;
  const deliveryCode = needsFulfilment ? (payload.deliveryOption || 'standard') : null;
  const surcharge = delivery ? delivery.surchargeNzd : 0;
  const total = Number((tier.priceNzd + surcharge).toFixed(2));

  const insertPayload = {
    keepsake_id: keepsakeId,
    order_number: orderNumber,
    source_portal: SOURCE_PORTALS.public,
    customer_name: payload.customerName,
    customer_email: payload.customerEmail,
    recipient_name: payload.recipientName,
    product_tier: payload.productTier,
    delivery_option: deliveryCode,
    queue_status: needsFulfilment ? 'pending' : null,
    payment_status: PAYMENT_STATUS.pending,
    attribution_source: attribution.attributionSource || ATTRIBUTION_SOURCE.none,
    promo_code_id: attribution.promoCodeId || null,
    sales_consultant_id: attribution.salesConsultantId || null,
    territory_id: attribution.territoryId || null,
    needs_fulfilment: needsFulfilment,
    delivery_priority: deliveryPriority,
    currency_code: PHASE2_CONFIG.defaultCurrencyCode,
    base_amount_nzd: tier.priceNzd,
    delivery_surcharge_nzd: surcharge,
    total_amount_nzd: total,
    packaging_notes: tier.packagingNotes,
    includes_frame: Boolean(tier.includesFrame),
    shipping_name: needsFulfilment ? payload.shippingName : null,
    shipping_address_line1: needsFulfilment ? payload.shippingAddressLine1 : null,
    shipping_address_line2: needsFulfilment ? payload.shippingAddressLine2 : null,
    shipping_city: needsFulfilment ? payload.shippingCity : null,
    shipping_region: needsFulfilment ? payload.shippingRegion : null,
    shipping_postcode: needsFulfilment ? payload.shippingPostcode : null,
    shipping_country: needsFulfilment ? payload.shippingCountry : null,
    notes: buildAttributionNote(payload, attribution),
  };

  const { data, error } = await supabase
    .from('orders')
    .insert(insertPayload)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Unable to create order: ${error.message}`);
  }

  return data;
}

function buildLineItems(tier, delivery) {
  const items = [
    {
      price_data: {
        currency: 'nzd',
        unit_amount: tier.priceCents,
        product_data: {
          name: `The Tribute Times - ${tier.label}`,
        },
      },
      quantity: 1,
    },
  ];

  if (delivery && delivery.surchargeCents > 0) {
    items.push({
      price_data: {
        currency: 'nzd',
        unit_amount: delivery.surchargeCents,
        product_data: {
          name: `Delivery Upgrade - ${delivery.label}`,
        },
      },
      quantity: 1,
    });
  }

  return items;
}

function buildAttributionNote(payload, attribution) {
  if (attribution.attributionSource === ATTRIBUTION_SOURCE.promoCode) {
    const code = attribution.promoCode || payload.promoCode || 'existing keepsake promo';
    return `Attribution: promo code ${code}.`;
  }
  if (attribution.attributionSource === ATTRIBUTION_SOURCE.postcode) {
    return `Attribution: postcode territory matched from ${payload.shippingPostcode || 'checkout postcode'}.`;
  }
  if (attribution.attributionSource === ATTRIBUTION_SOURCE.manual) {
    return 'Attribution: inherited from existing keepsake.';
  }
  return null;
}

async function loadPublicOrder(supabase, orderId) {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      keepsakes (
        id,
        listener_dob,
        country,
        occasion,
        sender_name,
        station_name,
        dj_message,
        rendered_html,
        pdf_path,
        watermark_status
      )
    `)
    .eq('id', orderId)
    .eq('source_portal', SOURCE_PORTALS.public)
    .single();

  if (error || !data) {
    throw new Error('Public order not found.');
  }

  return data;
}

async function resolvePublicOrderStatus({ stripe, supabase, sendEmail, order }) {
  if (!order || order.payment_status === PAYMENT_STATUS.paid || !order.stripe_checkout_session_id) {
    return order;
  }

  const session = await stripe.checkout.sessions.retrieve(order.stripe_checkout_session_id);

  if (session.payment_status === 'paid') {
    return reconcilePublicOrderPaymentFromSession({ stripe, supabase, sendEmail, session });
  }

  if (session.status === 'expired') {
    await supabase
      .from('orders')
      .update({ payment_status: PAYMENT_STATUS.cancelled })
      .eq('id', order.id)
      .eq('payment_status', PAYMENT_STATUS.pending);

    return loadPublicOrder(supabase, order.id);
  }

  return order;
}

async function reconcilePublicOrderPaymentFromSession({ stripe, supabase, sendEmail, session }) {
  if (!session?.metadata || session.metadata.type !== 'public_order') {
    return null;
  }

  const order = await loadPublicOrder(supabase, session.metadata.order_id);
  if (order.payment_status === PAYMENT_STATUS.paid) {
    return order;
  }

  const paidAt = new Date().toISOString();
  const { data: updatedRows, error } = await supabase
    .from('orders')
    .update({
      payment_status: PAYMENT_STATUS.paid,
      paid_at: paidAt,
      stripe_payment_intent_id: session.payment_intent || null,
      customer_email: order.customer_email || session.customer_details?.email || null,
      customer_name: order.customer_name || session.customer_details?.name || null,
    })
    .eq('id', order.id)
    .eq('payment_status', PAYMENT_STATUS.pending)
    .select('*');

  if (error) {
    throw new Error(`Unable to mark public order as paid: ${error.message}`);
  }

  if (!updatedRows || updatedRows.length === 0) {
    return loadPublicOrder(supabase, order.id);
  }

  const updatedOrder = updatedRows[0];

  await updateKeepsakeRecord(supabase, order.keepsake_id, {
    watermarkStatus: WATERMARK_STATUS.cleanPaid,
    customerEmail: updatedOrder.customer_email,
    customerName: updatedOrder.customer_name,
  });

  if (updatedOrder.needs_fulfilment) {
    await supabase
      .from('fulfilment_events')
      .insert({
        order_id: updatedOrder.id,
        previous_status: null,
        new_status: 'pending',
        triggered_email: false,
        note: 'Public printed order paid and added to fulfilment queue.',
      });
  }

  if (sendEmail) {
    try {
      let attachments = [];
      try {
        const pdf = await generatePdfFromHtml({
          html: updatedOrder.keepsakes?.rendered_html || order.keepsakes?.rendered_html || '',
          fileStem: updatedOrder.order_number || 'tribute-times-public-order',
        });
        attachments = [{
          filename: `${updatedOrder.order_number || 'tribute-times-order'}.pdf`,
          content: pdf.pdfBuffer,
        }];
      } catch (pdfError) {
        console.error('Public order email PDF attachment failed:', pdfError);
      }

      await sendEmail({
        to: PHASE2_CONFIG.adminAlertEmail,
        subject: `New public order paid - ${updatedOrder.order_number}`,
        html: buildPublicOrderAdminEmail(updatedOrder),
        attachments,
      });
    } catch (emailError) {
      console.error('Public order admin email failed:', emailError);
    }
  }

  // ── MAILING LIST CAPTURE (new_changes.md Step 8) ──
  // Consent comes from the checkout-time checkbox, carried through on the
  // Stripe session metadata (no new database column needed) rather than
  // defaulting to true unconditionally, now that the Privacy Policy this
  // checkbox links to actually exists (Step 18).
  if (updatedOrder.customer_email) {
    await captureMarketingContact(supabase, {
      email: updatedOrder.customer_email,
      name: updatedOrder.customer_name,
      source: 'public_checkout',
      consented: session.metadata?.marketing_consent !== '0',
    });
  }

  // ── SECOND-PURCHASE DISCOUNT (new_changes.md Step 7) ──
  // Every completed direct-consumer purchase automatically gets a
  // follow-up discount code for a second keepsake. This block only ever
  // runs once per order: reaching this point already required the atomic
  // `payment_status = 'pending' -> 'paid'` update above to have won, so a
  // retried status check for an already-paid order returns early at the
  // top of this function and never reaches here again.
  if (stripe && sendEmail && updatedOrder.customer_email) {
    try {
      const discountCode = await issueSecondPurchaseDiscountCode({ supabase, stripe });
      await sendEmail({
        to: updatedOrder.customer_email,
        subject: 'A thank-you discount for your next Tribute Times keepsake',
        html: buildSecondPurchaseDiscountEmail({
          customerName: updatedOrder.customer_name,
          code: discountCode.code,
          discountPercent: SECOND_PURCHASE_DISCOUNT_PERCENT,
          validUntil: discountCode.valid_until,
          appUrl: process.env.APP_URL || '',
        }),
      });
    } catch (discountError) {
      console.error('Second-purchase discount email failed:', discountError);
    }
  }

  return loadPublicOrder(supabase, updatedOrder.id);
}

function buildPublicOrderResponse(order) {
  const keepsake = order.keepsakes || {};

  return {
    id: order.id,
    orderNumber: order.order_number,
    keepsakeId: order.keepsake_id,
    customerName: order.customer_name,
    customerEmail: order.customer_email,
    recipientName: order.recipient_name,
    productTier: order.product_tier,
    deliveryOption: order.delivery_option,
    paymentStatus: order.payment_status,
    needsFulfilment: Boolean(order.needs_fulfilment),
    totalAmountNzd: Number(order.total_amount_nzd || 0),
    shippingName: order.shipping_name,
    shippingAddressLine1: order.shipping_address_line1,
    shippingAddressLine2: order.shipping_address_line2,
    shippingCity: order.shipping_city,
    shippingRegion: order.shipping_region,
    shippingPostcode: order.shipping_postcode,
    shippingCountry: order.shipping_country,
    downloadPdfUrl: `/api/public/orders/${order.id}/download-pdf`,
    dateOfBirth: keepsake.listener_dob || null,
    country: keepsake.country || null,
    occasion: keepsake.occasion || null,
    senderName: keepsake.sender_name || null,
    stationName: keepsake.station_name || null,
    personalMessage: keepsake.dj_message || null,
    renderedHtml: keepsake.rendered_html || '',
    pdfPath: keepsake.pdf_path || null,
    watermarkStatus: keepsake.watermark_status || WATERMARK_STATUS.none,
  };
}

function throwStatus(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = {
  registerPublicCheckoutRoutes,
  reconcilePublicOrderPaymentFromSession,
};
