'use strict';

const { ATTRIBUTION_SOURCE } = require('./constants');

function normalizePromoCode(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizePostcode(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function monthStartIso(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

async function resolveFreeDemoAttribution({ supabase, promoCode }) {
  const code = normalizePromoCode(promoCode);
  if (!code) {
    return buildNoneAttribution();
  }

  const promo = await loadPromoCode(supabase, code);
  const usedThisMonth = await countMonthlyFreeDemos(supabase, promo.id);
  const limit = Number(promo.monthly_free_demo_limit || 0);

  if (usedThisMonth >= limit) {
    const error = new Error(`Promo code ${promo.code} has used all ${limit} free demos for this month.`);
    error.statusCode = 429;
    throw error;
  }

  return {
    attributionSource: ATTRIBUTION_SOURCE.promoCode,
    promoCodeId: promo.id,
    salesConsultantId: promo.consultant_id || null,
    territoryId: null,
    isFreeDemo: true,
    promoCode: promo.code,
    freeDemosUsedThisMonth: usedThisMonth + 1,
    freeDemoLimit: limit,
    consultantName: promo.sales_consultants?.name || '',
  };
}

async function resolvePaidOrderAttribution({ supabase, promoCode, existingKeepsake, postcode, country }) {
  const code = normalizePromoCode(promoCode);
  if (code) {
    const promo = await loadPromoCode(supabase, code);
    return {
      attributionSource: ATTRIBUTION_SOURCE.promoCode,
      promoCodeId: promo.id,
      salesConsultantId: promo.consultant_id || null,
      territoryId: null,
      promoCode: promo.code,
      consultantName: promo.sales_consultants?.name || '',
    };
  }

  if (existingKeepsake?.promo_code_id || existingKeepsake?.sales_consultant_id) {
    return {
      attributionSource: existingKeepsake.promo_code_id ? ATTRIBUTION_SOURCE.promoCode : ATTRIBUTION_SOURCE.manual,
      promoCodeId: existingKeepsake.promo_code_id || null,
      salesConsultantId: existingKeepsake.sales_consultant_id || null,
      territoryId: null,
      promoCode: '',
      consultantName: '',
    };
  }

  const territory = await matchPostcodeTerritory({ supabase, postcode, country });
  if (territory) {
    return {
      attributionSource: ATTRIBUTION_SOURCE.postcode,
      promoCodeId: null,
      salesConsultantId: territory.consultant_id || null,
      territoryId: territory.id,
      promoCode: '',
      consultantName: territory.sales_consultants?.name || '',
    };
  }

  return buildNoneAttribution();
}

async function loadPromoCode(supabase, code) {
  const normalized = normalizePromoCode(code);
  const { data, error } = await supabase
    .from('promo_codes')
    .select('id, code, active, monthly_free_demo_limit, consultant_id, sales_consultants(id, name, email, active)')
    .ilike('code', normalized)
    .single();

  if (error || !data || !data.active) {
    const notFound = new Error('Promo code is not valid.');
    notFound.statusCode = 400;
    throw notFound;
  }
  if (data.sales_consultants && data.sales_consultants.active === false) {
    const inactive = new Error('Promo code consultant is inactive.');
    inactive.statusCode = 400;
    throw inactive;
  }

  return data;
}

async function countMonthlyFreeDemos(supabase, promoCodeId, now = new Date()) {
  const { count, error } = await supabase
    .from('keepsakes')
    .select('id', { count: 'exact', head: true })
    .eq('promo_code_id', promoCodeId)
    .eq('is_free_demo', true)
    .gte('created_at', monthStartIso(now));

  if (error) {
    throw new Error(`Unable to count free demos: ${error.message}`);
  }

  return count || 0;
}

async function matchPostcodeTerritory({ supabase, postcode, country }) {
  const normalizedPostcode = normalizePostcode(postcode);
  if (!normalizedPostcode) return null;

  const { data, error } = await supabase
    .from('postcode_territories')
    .select('id, consultant_id, territory_name, country, match_type, postcode_start, postcode_end, priority, sales_consultants(id, name, email, active)')
    .eq('active', true)
    .eq('country', country || 'New Zealand')
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Unable to match postcode territory: ${error.message}`);
  }

  return (data || []).find(territory => territoryMatchesPostcode(territory, normalizedPostcode)) || null;
}

function territoryMatchesPostcode(territory, normalizedPostcode) {
  const start = normalizePostcode(territory.postcode_start);
  const end = normalizePostcode(territory.postcode_end);

  if (territory.match_type === 'prefix') {
    return Boolean(start) && normalizedPostcode.startsWith(start);
  }

  if (territory.match_type === 'range') {
    if (!start || !end) return false;
    const postNumber = Number(normalizedPostcode);
    const startNumber = Number(start);
    const endNumber = Number(end);
    if ([postNumber, startNumber, endNumber].every(Number.isFinite)) {
      return postNumber >= startNumber && postNumber <= endNumber;
    }
    return normalizedPostcode >= start && normalizedPostcode <= end;
  }

  return normalizedPostcode === start;
}

function buildNoneAttribution() {
  return {
    attributionSource: ATTRIBUTION_SOURCE.none,
    promoCodeId: null,
    salesConsultantId: null,
    territoryId: null,
    isFreeDemo: false,
    promoCode: '',
    consultantName: '',
  };
}

module.exports = {
  normalizePromoCode,
  resolveFreeDemoAttribution,
  resolvePaidOrderAttribution,
  countMonthlyFreeDemos,
  matchPostcodeTerritory,
};
