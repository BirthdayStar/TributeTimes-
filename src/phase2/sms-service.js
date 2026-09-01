'use strict';

// SMS ALERTS (Semaphore, Philippines SMS gateway) — client request 28 Aug
// 2026 (Col): "notify [me]... this is info and check your gcash and
// approve from admin." Fires alongside the existing GCash admin email
// alert (sendGcashAdminAlert, gcash-payment-requests.js) at the same call
// sites — same reasoning as the email pattern this mirrors
// (email-service.js): a thin fetch wrapper, no-op (returns false) if not
// configured, throws on a real API failure so the caller's own
// .catch(console.error) pattern (already used for every existing
// sendGcashAdminAlert call) logs it without ever blocking the actual
// GCash payment-request flow on an SMS failure.
const fetch = require('node-fetch');

const SEMAPHORE_ENDPOINT = 'https://api.semaphore.co/api/v4/messages';

// Semaphore's documented format is 09XXXXXXXXX or 639XXXXXXXXX (no '+',
// no spaces/dashes). Col gave the number as "+63 956 084 8051" — normalize
// whatever format it arrives in (env var, future admin-settings field)
// rather than requiring it to already be in exactly the right shape.
function normalizePhilippinesNumber(raw) {
  const digitsOnly = String(raw || '').replace(/[^\d]/g, '');
  if (digitsOnly.startsWith('63') && digitsOnly.length === 12) return digitsOnly;
  if (digitsOnly.startsWith('0') && digitsOnly.length === 11) return '63' + digitsOnly.slice(1);
  if (digitsOnly.length === 10) return '63' + digitsOnly; // bare 9XXXXXXXXX
  return digitsOnly; // fall through as-is; Semaphore will reject a genuinely malformed number with a clear error
}

async function sendSms({ to, message }) {
  if (!process.env.SEMAPHORE_API_KEY) return false;
  const number = normalizePhilippinesNumber(to);
  if (!number) return false;
  if (!message || !String(message).trim()) {
    throw new Error('SMS message text is required.');
  }

  const body = new URLSearchParams({
    apikey: process.env.SEMAPHORE_API_KEY,
    number,
    message: String(message).trim(),
  });

  const response = await fetch(SEMAPHORE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const responseText = await response.text().catch(() => '');
  if (!response.ok) {
    throw new Error(`Semaphore request failed (${response.status}): ${responseText.slice(0, 200)}`);
  }

  // Semaphore returns 200 with a JSON array even for some rejected
  // requests (e.g. insufficient credits, invalid number) — a non-2xx
  // status alone isn't a reliable enough failure signal, so also check
  // the parsed body for an explicit error/message_id.
  let parsed;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    throw new Error(`Semaphore returned a non-JSON response: ${responseText.slice(0, 200)}`);
  }
  const result = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!result || (!result.message_id && !result.id)) {
    throw new Error(`Semaphore did not confirm delivery: ${responseText.slice(0, 200)}`);
  }

  return true;
}

module.exports = {
  sendSms,
  normalizePhilippinesNumber,
};
