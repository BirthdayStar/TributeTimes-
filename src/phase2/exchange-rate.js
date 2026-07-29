'use strict';

const fetch = require('node-fetch');

const DEFAULT_NZD_PHP_RATE_URL = 'https://api.frankfurter.dev/v2/rate/NZD/PHP';
const DEFAULT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 3500;

let cachedNzdToPhpRate = null;

async function getNzdToPhpRate() {
  const fallbackRate = parsePositiveNumber(process.env.GCASH_PHP_PER_NZD);
  const liveEnabled = String(process.env.GCASH_LIVE_RATE_ENABLED || 'true').trim().toLowerCase() !== 'false';

  if (!liveEnabled) {
    return buildFallbackRate(fallbackRate, 'Live exchange rates are disabled.');
  }

  if (cachedNzdToPhpRate && cachedNzdToPhpRate.expiresAt > Date.now()) {
    return cachedNzdToPhpRate.value;
  }

  try {
    const rate = await fetchLiveNzdToPhpRate();
    cachedNzdToPhpRate = {
      value: rate,
      expiresAt: Date.now() + getCacheTtlMs(),
    };
    return rate;
  } catch (error) {
    if (fallbackRate) {
      return buildFallbackRate(fallbackRate, error.message);
    }
    return {
      rate: null,
      source: 'unavailable',
      sourceUrl: getRateUrl(),
      date: null,
      isLive: false,
      error: error.message,
    };
  }
}

async function fetchLiveNzdToPhpRate() {
  const url = getRateUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getTimeoutMs());

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Live exchange-rate request failed with ${response.status}.`);
    }

    const data = await response.json();
    const rate = extractRate(data);
    if (!rate) {
      throw new Error('Live exchange-rate response did not include an NZD to PHP rate.');
    }

    return {
      rate,
      source: process.env.GCASH_RATE_SOURCE_LABEL || 'Frankfurter',
      sourceUrl: url,
      date: extractDate(data),
      isLive: true,
      error: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function extractRate(data) {
  const directRate = parsePositiveNumber(data?.rate);
  if (directRate) return directRate;

  const ratesPhp = parsePositiveNumber(data?.rates?.PHP);
  if (ratesPhp) return ratesPhp;

  const conversionRate = parsePositiveNumber(data?.conversion_rates?.PHP);
  if (conversionRate) return conversionRate;

  const resultRate = parsePositiveNumber(data?.result);
  if (resultRate) return resultRate;

  return null;
}

function extractDate(data) {
  return data?.date || data?.time_last_update_utc || data?.time_last_update_unix || null;
}

function buildFallbackRate(fallbackRate, reason) {
  if (!fallbackRate) {
    return {
      rate: null,
      source: 'unavailable',
      sourceUrl: getRateUrl(),
      date: null,
      isLive: false,
      error: reason || null,
    };
  }

  return {
    rate: fallbackRate,
    source: 'GCASH_PHP_PER_NZD fallback',
    sourceUrl: null,
    date: null,
    isLive: false,
    error: reason || null,
  };
}

function parsePositiveNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function getRateUrl() {
  return process.env.GCASH_RATE_API_URL || DEFAULT_NZD_PHP_RATE_URL;
}

function getCacheTtlMs() {
  const value = Number(process.env.GCASH_RATE_CACHE_TTL_MS || DEFAULT_CACHE_TTL_MS);
  return Number.isFinite(value) && value >= 60_000 ? value : DEFAULT_CACHE_TTL_MS;
}

function getTimeoutMs() {
  const value = Number(process.env.GCASH_RATE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  return Number.isFinite(value) && value >= 500 ? value : DEFAULT_TIMEOUT_MS;
}

module.exports = {
  getNzdToPhpRate,
};
