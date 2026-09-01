'use strict';

const {
  ANTHROPIC_DAILY_ALERT_THRESHOLD_USD,
  DEFAULT_CURRENCY_CODE,
  DEFAULT_FLORIST_LOW_CREDIT_THRESHOLD,
  GENERATE_RATE_LIMIT_MAX,
  GENERATE_RATE_LIMIT_WINDOW_MS,
} = require('./constants');

const PHASE2_CONFIG = Object.freeze({
  adminAlertEmail: process.env.ADMIN_ALERT_EMAIL || 'colindavidmccabe@gmail.com',
  // SMS alert recipient — client request 28 Aug 2026 (Col): text him the
  // instant a customer submits GCash payment proof, same moment as the
  // existing admin email alert. Kept as its own env var (not hardcoded)
  // so it can change without a redeploy, same reasoning as adminAlertEmail.
  adminAlertPhone: process.env.ADMIN_ALERT_PHONE || '',
  resendFromEmail: process.env.RESEND_FROM_EMAIL || '',
  defaultCurrencyCode: DEFAULT_CURRENCY_CODE,
  anthropicDailyAlertThresholdUsd: Number(process.env.ANTHROPIC_DAILY_ALERT_THRESHOLD_USD || ANTHROPIC_DAILY_ALERT_THRESHOLD_USD),
  floristLowCreditThreshold: DEFAULT_FLORIST_LOW_CREDIT_THRESHOLD,
  generateRateLimitMax: Number(process.env.GENERATE_RATE_LIMIT_MAX || GENERATE_RATE_LIMIT_MAX),
  generateRateLimitWindowMs: Number(process.env.GENERATE_RATE_LIMIT_WINDOW_MS || GENERATE_RATE_LIMIT_WINDOW_MS),
});

module.exports = {
  PHASE2_CONFIG,
};
