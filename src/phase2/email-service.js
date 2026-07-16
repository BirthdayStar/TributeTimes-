'use strict';

const fetch = require('node-fetch');
const { PHASE2_CONFIG } = require('./config');

const DEFAULT_FROM = PHASE2_CONFIG.resendFromEmail || 'The Tribute Times <hello@tributetimes.co.nz>';

async function sendEmail({ to, cc, subject, html, text, attachments = [], replyTo }) {
  if (!process.env.RESEND_API_KEY) return false;

  const payload = {
    from: DEFAULT_FROM,
    to,
    subject,
    html,
  };

  if (cc) payload.cc = cc;
  if (text) payload.text = text;
  if (replyTo) payload.reply_to = replyTo;
  if (attachments.length) {
    payload.attachments = attachments.map(normalizeAttachment);
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Resend request failed (${response.status}): ${body.slice(0, 200)}`);
  }

  return true;
}

function normalizeAttachment(attachment) {
  if (!attachment || !attachment.filename) {
    throw new Error('Each attachment must include a filename.');
  }

  const content = Buffer.isBuffer(attachment.content)
    ? attachment.content.toString('base64')
    : String(attachment.content || '');

  return {
    filename: attachment.filename,
    content,
  };
}

function buildStationWelcomeEmail(name, tier) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
    <h1 style="color:#8b1010;">Welcome to The Tribute Times</h1>
    <p>Hi ${escapeHtml(name)},</p>
    <p>Your <strong>${escapeHtml(tierLabel(tier))}</strong> station account is ready. You have a 14-day free trial — no card required.</p>
    <p>Log in at <a href="https://tributetimes.co.nz/login">tributetimes.co.nz</a> to set up your station branding, add your DJs, and start creating your first birthday keepsakes.</p>
    <p>Questions? Reply to this email — we're here to help.</p>
    <p style="color:#8b1010;font-weight:bold;">The Tribute Times Team</p>
  </div>`;
}

function buildDjWelcomeEmail(name, email, password) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
    <h1 style="color:#8b1010;">Your Tribute Times DJ Account</h1>
    <p>Hi ${escapeHtml(name)},</p>
    <p>Your station manager has set up your DJ account on The Tribute Times.</p>
    <p><strong>Login:</strong> <a href="https://tributetimes.co.nz/dj">tributetimes.co.nz/dj</a><br/>
    <strong>Email:</strong> ${escapeHtml(email)}<br/>
    <strong>Password:</strong> ${escapeHtml(password)}</p>
    <p>Please change your password after first login.</p>
    <p style="color:#8b1010;font-weight:bold;">The Tribute Times Team</p>
  </div>`;
}

function buildSubscriptionActiveEmail(name, tier) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
    <h1 style="color:#8b1010;">Subscription Active</h1>
    <p>Hi ${escapeHtml(name)},</p>
    <p>Your <strong>${escapeHtml(tierLabel(tier))}</strong> plan is now active. You can generate up to ${escapeHtml(tierKeepsakes(tier))} keepsakes per month.</p>
    <p>Log in at <a href="https://tributetimes.co.nz/dashboard">tributetimes.co.nz/dashboard</a></p>
    <p style="color:#8b1010;font-weight:bold;">The Tribute Times Team</p>
  </div>`;
}

function buildPublicOrderAdminEmail(order) {
  const shippingLines = order.needs_fulfilment
    ? [
        order.shipping_name,
        order.shipping_address_line1,
        order.shipping_address_line2,
        [order.shipping_city, order.shipping_region].filter(Boolean).join(', '),
        [order.shipping_postcode, order.shipping_country].filter(Boolean).join(' ').trim(),
      ].filter(Boolean)
    : [];

  return `
    <h2>New public order paid</h2>
    <p><strong>Order number:</strong> ${escapeHtml(order.order_number)}</p>
    <p><strong>Customer:</strong> ${escapeHtml(order.customer_name || '')}</p>
    <p><strong>Email:</strong> ${escapeHtml(order.customer_email || '')}</p>
    <p><strong>Recipient:</strong> ${escapeHtml(order.recipient_name || '')}</p>
    <p><strong>Tier:</strong> ${escapeHtml(order.product_tier || '')}</p>
    <p><strong>Delivery:</strong> ${escapeHtml(order.delivery_option || 'digital')}</p>
    <p><strong>Total:</strong> NZ$${Number(order.total_amount_nzd || 0).toFixed(2)}</p>
    ${shippingLines.length ? `<p><strong>Shipping address:</strong><br/>${shippingLines.map(escapeHtml).join('<br/>')}</p>` : '<p><strong>Delivery:</strong> Digital only</p>'}
  `;
}

function buildRadioOrderAdminEmail(order) {
  const shippingLines = [
    order.shipping_name,
    order.shipping_address_line1,
    order.shipping_address_line2,
    [order.shipping_city, order.shipping_region].filter(Boolean).join(', '),
    [order.shipping_postcode, order.shipping_country].filter(Boolean).join(' ').trim(),
  ].filter(Boolean);

  return `
    <h2>New radio order paid</h2>
    <p><strong>Order number:</strong> ${escapeHtml(order.order_number)}</p>
    <p><strong>Listener:</strong> ${escapeHtml(order.recipient_name || '')}</p>
    <p><strong>Email:</strong> ${escapeHtml(order.customer_email || '')}</p>
    <p><strong>Station name:</strong> ${escapeHtml(order.station_name || '')}</p>
    <p><strong>DJ / Presenter:</strong> ${escapeHtml(order.sender_name || '')}</p>
    <p><strong>Postal address:</strong><br/>${shippingLines.map(escapeHtml).join('<br/>')}</p>
  `;
}

function buildFloristLowCreditEmail(station, repEmail) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
    <h1 style="color:#8b1010;">Florist credits running low</h1>
    <p>Hi ${escapeHtml(station?.name || 'there')},</p>
    <p>Your florist credit balance is down to ${escapeHtml(String(station?.florist_credit_balance ?? 0))} credits.</p>
    <p>Purchase another pack to top up your balance. The current low-credit threshold is ${escapeHtml(String(station?.florist_low_credit_threshold ?? PHASE2_CONFIG.floristLowCreditThreshold))} credits.</p>
    <p style="color:#8b1010;font-weight:bold;">The Tribute Times Team</p>
  </div>`;
}

function buildPostedOrderCustomerEmail() {
  return `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#1f1f1f;line-height:1.6">
    <p>Your Tribute Times keepsake has been posted and is on its way. Standard delivery 3-5 days / 2 Day delivery 2 days / Overnight delivery tomorrow.</p>
  </div>`;
}

function buildAnthropicSpendAlertEmail({ usageDate, totalUsd, thresholdUsd }) {
  return `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#1f1f1f;line-height:1.6">
    <h1 style="color:#8b1010;">Anthropic Spend Alert</h1>
    <p>The estimated Anthropic spend on ${escapeHtml(usageDate)} has reached US$${Number(totalUsd || 0).toFixed(2)}.</p>
    <p>The current alert threshold is US$${Number(thresholdUsd || PHASE2_CONFIG.anthropicDailyAlertThresholdUsd).toFixed(2)}.</p>
  </div>`;
}

function buildFrameOrderAdminEmail({ stationId, qty, deliveryName, deliveryAddress, deliveryCity, deliveryPostcode, deliveryCountry }) {
  return `<p>Station ${escapeHtml(stationId)} ordered ${escapeHtml(String(qty))} frames. Deliver to: ${escapeHtml(deliveryName)}, ${escapeHtml(deliveryAddress)}, ${escapeHtml(deliveryCity)}, ${escapeHtml(deliveryPostcode)}, ${escapeHtml(deliveryCountry)}</p>`;
}

function tierLabel(tier) {
  return {
    community: 'Community',
    regional: 'Regional',
    city: 'City',
    national: 'National',
  }[tier] || String(tier || '');
}

function tierKeepsakes(tier) {
  return {
    community: 30,
    regional: 75,
    city: 200,
    national: 9999,
  }[tier] || 0;
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
  sendEmail,
  buildStationWelcomeEmail,
  buildDjWelcomeEmail,
  buildSubscriptionActiveEmail,
  buildPublicOrderAdminEmail,
  buildRadioOrderAdminEmail,
  buildFloristLowCreditEmail,
  buildPostedOrderCustomerEmail,
  buildAnthropicSpendAlertEmail,
  buildFrameOrderAdminEmail,
};
