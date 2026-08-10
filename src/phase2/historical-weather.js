'use strict';

// ── HISTORICAL WEATHER (real data, not AI-invented) ──
// Client-reported bug (10 Aug 2026 punch list): the weather panel was
// AI-composed seasonal-sounding text (e.g. "Spring in Australia... around
// 22°C") rather than actual recorded weather — the same category of issue
// already fixed for famous birthdays (see famous-birthdays.js), where
// invented-sounding "factual" content was replaced with a verified source.
// This module calls Open-Meteo's historical weather API using the
// keepsake's date and a representative location for the selected country
// (lat/long is the finest location granularity the form captures — see
// form-template.html, only a country dropdown is collected) and returns
// real recorded temperature/conditions for that day. The caller
// (tribute-times-server-update.js) overwrites the AI/fallback-generated
// content.weather with this before rendering; if the API is unreachable or
// the date has no archive coverage, it returns null and the caller simply
// leaves the existing weather content untouched — isolated, non-breaking.
//
// LICENSING: Open-Meteo's free endpoint (archive-api.open-meteo.com) is
// non-commercial only per their published terms — a paid product like
// Tribute Times does not qualify. Once a commercial API key is purchased
// (open-meteo.com/en/pricing), set OPEN_METEO_API_KEY and this
// automatically switches to their commercial customer endpoint
// (customer-archive-api.open-meteo.com) with no other code change. Until
// a key is set, it still calls the free endpoint so weather keeps working
// during development/testing — this is a business/billing action item,
// not a code gap.

const fetch = require('node-fetch');

const DEFAULT_TIMEOUT_MS = 4000;
const FREE_ARCHIVE_API_URL = 'https://archive-api.open-meteo.com/v1/archive';
const COMMERCIAL_ARCHIVE_API_URL = 'https://customer-archive-api.open-meteo.com/v1/archive';

// One representative city per supported country (see SUPPORTED_COUNTRIES
// in src/phase2/constants.js) — the same 9-country list already used for
// currency and famous-birthdays matching.
const COUNTRY_COORDINATES = Object.freeze({
  'New Zealand':    { latitude: -36.8485, longitude: 174.7633, timezone: 'Pacific/Auckland' },   // Auckland
  'Australia':      { latitude: -33.8688, longitude: 151.2093, timezone: 'Australia/Sydney' },   // Sydney
  'Philippines':    { latitude: 14.5995,  longitude: 120.9842, timezone: 'Asia/Manila' },         // Manila
  'United Kingdom': { latitude: 51.5072,  longitude: -0.1276,  timezone: 'Europe/London' },       // London
  'Ireland':        { latitude: 53.3498,  longitude: -6.2603,  timezone: 'Europe/Dublin' },       // Dublin
  'United States':  { latitude: 40.7128,  longitude: -74.0060, timezone: 'America/New_York' },    // New York
  'South Africa':   { latitude: -26.2041, longitude: 28.0473,  timezone: 'Africa/Johannesburg' }, // Johannesburg
  'Canada':         { latitude: 43.6511,  longitude: -79.3832, timezone: 'America/Toronto' },     // Toronto
  'Singapore':      { latitude: 1.3521,   longitude: 103.8198, timezone: 'Asia/Singapore' },      // Singapore
});

const SOUTHERN_HEMISPHERE_COUNTRIES = new Set(['New Zealand', 'Australia', 'South Africa']);
const TROPICAL_COUNTRIES = new Set(['Philippines', 'Singapore']);

// WMO weather codes -> {icon, condition}, per Open-Meteo's documented code table.
const WEATHER_CODE_MAP = {
  0:  { icon: '☀️', condition: 'Clear sky' },
  1:  { icon: '🌤️', condition: 'Mainly clear' },
  2:  { icon: '⛅', condition: 'Partly cloudy' },
  3:  { icon: '☁️', condition: 'Overcast' },
  45: { icon: '🌫️', condition: 'Foggy' },
  48: { icon: '🌫️', condition: 'Freezing fog' },
  51: { icon: '🌦️', condition: 'Light drizzle' },
  53: { icon: '🌦️', condition: 'Drizzle' },
  55: { icon: '🌧️', condition: 'Dense drizzle' },
  56: { icon: '🌧️', condition: 'Freezing drizzle' },
  57: { icon: '🌧️', condition: 'Freezing drizzle' },
  61: { icon: '🌧️', condition: 'Light rain' },
  63: { icon: '🌧️', condition: 'Rain' },
  65: { icon: '🌧️', condition: 'Heavy rain' },
  66: { icon: '🌧️', condition: 'Freezing rain' },
  67: { icon: '🌧️', condition: 'Heavy freezing rain' },
  71: { icon: '🌨️', condition: 'Light snow' },
  73: { icon: '🌨️', condition: 'Snow' },
  75: { icon: '❄️', condition: 'Heavy snow' },
  77: { icon: '🌨️', condition: 'Snow grains' },
  80: { icon: '🌦️', condition: 'Rain showers' },
  81: { icon: '🌧️', condition: 'Rain showers' },
  82: { icon: '⛈️', condition: 'Heavy rain showers' },
  85: { icon: '🌨️', condition: 'Snow showers' },
  86: { icon: '❄️', condition: 'Heavy snow showers' },
  95: { icon: '⛈️', condition: 'Thunderstorm' },
  96: { icon: '⛈️', condition: 'Thunderstorm with hail' },
  99: { icon: '⛈️', condition: 'Severe thunderstorm with hail' },
};

// Fetches the recorded weather for a keepsake's exact date and country.
// Returns { icon, temp, condition, season, source, isLive } on success, or
// null if the country isn't mapped, the date has no archive coverage, or
// the request fails — callers should treat null as "leave existing
// weather content as-is", never throw.
async function fetchHistoricalWeather({ day, month, year, country }) {
  const enabled = String(process.env.HISTORICAL_WEATHER_ENABLED || 'true').trim().toLowerCase() !== 'false';
  if (!enabled) return null;

  const coords = COUNTRY_COORDINATES[country];
  if (!coords) return null;

  const dateStr = buildDateString(year, month, day);
  if (!dateStr) return null;

  const apiKey = String(process.env.OPEN_METEO_API_KEY || '').trim();
  const baseUrl = apiKey ? COMMERCIAL_ARCHIVE_API_URL : FREE_ARCHIVE_API_URL;

  const url = `${baseUrl}?latitude=${coords.latitude}&longitude=${coords.longitude}` +
    `&start_date=${dateStr}&end_date=${dateStr}` +
    `&daily=weathercode,temperature_2m_max,temperature_2m_min` +
    `&timezone=${encodeURIComponent(coords.timezone)}` +
    (apiKey ? `&apikey=${encodeURIComponent(apiKey)}` : '');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getTimeoutMs());

  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) return null;

    const data = await response.json();
    const daily = data && data.daily;
    if (!daily || !Array.isArray(daily.time) || daily.time.length === 0) return null;

    const code = daily.weathercode ? daily.weathercode[0] : null;
    const tempMax = daily.temperature_2m_max ? daily.temperature_2m_max[0] : null;
    const tempMin = daily.temperature_2m_min ? daily.temperature_2m_min[0] : null;
    if (code === null || code === undefined || tempMax === null || tempMax === undefined) return null;

    const mapped = WEATHER_CODE_MAP[code] || { icon: '🌡️', condition: 'Recorded conditions' };
    const temp = Number.isFinite(tempMin) ? Math.round((tempMax + tempMin) / 2) : Math.round(tempMax);

    return {
      icon: mapped.icon,
      temp: String(temp),
      condition: mapped.condition,
      season: resolveSeason(country, month),
      source: 'Open-Meteo Historical Weather API',
      isLive: true,
    };
  } catch (error) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function resolveSeason(country, month) {
  if (TROPICAL_COUNTRIES.has(country)) {
    return (month >= 11 || month <= 4) ? 'Dry season' : 'Wet season';
  }

  const isSouthern = SOUTHERN_HEMISPHERE_COUNTRIES.has(country);
  // Meteorological seasons for the Northern hemisphere; Southern is offset by 6 months.
  const northernSeason =
    [12, 1, 2].includes(month) ? 'Winter' :
    [3, 4, 5].includes(month) ? 'Spring' :
    [6, 7, 8].includes(month) ? 'Summer' : 'Autumn';

  if (!isSouthern) return northernSeason;

  const SOUTHERN_FLIP = { Winter: 'Summer', Summer: 'Winter', Spring: 'Autumn', Autumn: 'Spring' };
  return SOUTHERN_FLIP[northernSeason];
}

function buildDateString(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1940) return null; // Open-Meteo's historical archive starts in 1940.

  const candidate = new Date(Date.UTC(y, m - 1, d));
  if (candidate.getUTCFullYear() !== y || candidate.getUTCMonth() !== m - 1 || candidate.getUTCDate() !== d) return null;

  // Archive data lags a few days behind real time — a future or very recent
  // date simply has no recorded weather yet.
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 5);
  if (candidate > cutoff) return null;

  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function getTimeoutMs() {
  const value = Number(process.env.HISTORICAL_WEATHER_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  return Number.isFinite(value) && value >= 500 ? value : DEFAULT_TIMEOUT_MS;
}

module.exports = {
  fetchHistoricalWeather,
  COUNTRY_COORDINATES,
};
