'use strict';

const { FAMOUS_BIRTHDAYS_COUNTRIES } = require('./constants');

const COUNTRY_ALIASES = Object.freeze({
  NZ: 'New Zealand',
  'NEW ZEALAND': 'New Zealand',
  AU: 'Australia',
  AUS: 'Australia',
  AUSTRALIA: 'Australia',
  PH: 'Philippines',
  PHL: 'Philippines',
  PHILIPPINES: 'Philippines',
  UK: 'United Kingdom',
  GB: 'United Kingdom',
  GBR: 'United Kingdom',
  'UNITED KINGDOM': 'United Kingdom',
  BRITAIN: 'United Kingdom',
  ENGLAND: 'United Kingdom',
  SCOTLAND: 'United Kingdom',
  WALES: 'United Kingdom',
  IRELAND: 'Ireland',
  IE: 'Ireland',
  USA: 'United States',
  US: 'United States',
  'UNITED STATES': 'United States',
  AMERICA: 'United States',
  'SOUTH AFRICA': 'South Africa',
  ZA: 'South Africa',
  CANADA: 'Canada',
  CA: 'Canada',
  SINGAPORE: 'Singapore',
  SG: 'Singapore',
});

function registerFamousBirthdayRoutes(app, { supabase }) {
  if (!app) throw new Error('Express app is required.');
  if (!supabase) throw new Error('Supabase client is required.');

  app.get('/api/famous-birthdays', async (req, res) => {
    try {
      const day = parseDay(req.query.day);
      const month = parseMonth(req.query.month);
      const country = normalizeCountry(req.query.country);
      const limit = Math.min(Math.max(Number(req.query.limit) || 5, 1), 20);

      const rows = await queryApprovedFamousBirthdays({ supabase, day, month, country, limit });
      return res.json({
        day,
        month,
        country,
        birthdays: rows.map(buildPublicBirthday),
      });
    } catch (error) {
      return res.status(error.statusCode || 400).json({ error: error.message || 'Unable to load famous birthdays.' });
    }
  });
}

async function queryApprovedFamousBirthdays({ supabase, day, month, country, limit = 5 }) {
  const { data, error } = await supabase
    .from('famous_birthdays')
    .select('id, full_name, birth_day, birth_month, birth_year, main_public_country, occupation, short_bio, source_url, display_priority')
    .eq('birth_day', day)
    .eq('birth_month', month)
    .eq('main_public_country', country)
    .eq('curation_status', 'approved')
    .eq('active', true)
    .order('display_priority', { ascending: true })
    .order('full_name', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Unable to query famous birthdays: ${error.message}`);
  }

  return data || [];
}

function buildPublicBirthday(row) {
  return {
    id: row.id,
    name: row.full_name,
    birthYear: row.birth_year || null,
    country: row.main_public_country,
    occupation: row.occupation || '',
    summary: row.short_bio || '',
    sourceUrl: row.source_url || '',
  };
}

function parseDay(value) {
  const day = Number(value);
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    const error = new Error('Day must be a number from 1 to 31.');
    error.statusCode = 400;
    throw error;
  }
  return day;
}

function parseMonth(value) {
  const month = Number(value);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    const error = new Error('Month must be a number from 1 to 12.');
    error.statusCode = 400;
    throw error;
  }
  return month;
}

function normalizeCountry(value) {
  const key = String(value || '').trim().toUpperCase();
  const country = COUNTRY_ALIASES[key] || String(value || '').trim();
  if (!FAMOUS_BIRTHDAYS_COUNTRIES.includes(country)) {
    const error = new Error('Country is not supported for famous birthdays.');
    error.statusCode = 400;
    throw error;
  }
  return country;
}

function inferMainPublicCountry(text) {
  const value = String(text || '').toLowerCase();
  const checks = [
    ['New Zealand', /\b(new zealand|kiwi|auckland|wellington|christchurch)\b/],
    ['Australia', /\b(australia|australian|sydney|melbourne|brisbane|perth)\b/],
    ['Philippines', /\b(philippines|filipino|filipina|manila)\b/],
    ['United Kingdom', /\b(united kingdom|british|english|scottish|welsh|london|england|scotland|wales)\b/],
    ['Ireland', /\b(ireland|irish|dublin)\b/],
    ['United States', /\b(united states|american|hollywood|new york|los angeles)\b/],
    ['South Africa', /\b(south africa|south african|cape town|johannesburg)\b/],
    ['Canada', /\b(canada|canadian|toronto|vancouver|montreal)\b/],
    ['Singapore', /\b(singapore|singaporean)\b/],
  ];
  const match = checks.find(([, pattern]) => pattern.test(value));
  return match ? match[0] : 'United States';
}

module.exports = {
  COUNTRY_ALIASES,
  registerFamousBirthdayRoutes,
  normalizeCountry,
  inferMainPublicCountry,
  queryApprovedFamousBirthdays,
};
