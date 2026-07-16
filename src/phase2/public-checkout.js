'use strict';

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
const { buildPublicOrderAdminEmail } = require('./email-service');
const { resolvePaidOrderAttribution } = require('./attribution');

function registerPublicCheckoutRoutes(app, { stripe, supabase, sendEmail }) {
  if (!app) throw new Error('Express app is required.');
  if (!stripe) throw new Error('Stripe client is required.');
  if (!supabase) throw new Error('Supabase client is required.');

  app.post('/api/public/checkout-session', async (req, res) => {
    try {
      const rawPayload = normalizePayload(req.body || {}, req.ip);
      const payload = await enrichPayloadFromExistingKeepsake(supabase, rawPayload);
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
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        customer_email: payload.customerEmail,
        billing_address_collection: 'auto',
        line_items: lineItems,
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
        },
      });

      await supabase
        .from('orders')
        .update({ stripe_checkout_session_id: session.id })
        .eq('id', orderRecord.id);

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

  if (!PRODUCT_TIERS[productTier]) {
    throw new Error('Invalid product tier.');
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
    customerName: String(body.customerName).trim(),
    customerEmail: String(body.customerEmail).trim(),
    recipientName,
    dateOfBirth,
    country,
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
    return reconcilePublicOrderPaymentFromSession({ supabase, sendEmail, session });
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

async function reconcilePublicOrderPaymentFromSession({ supabase, sendEmail, session }) {
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
