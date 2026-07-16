'use strict';

const {
  SOURCE_PORTALS,
  SUPPORTED_COUNTRIES,
  WATERMARK_STATUS,
} = require('./constants');
const { getDefaultWatermarkStatus } = require('./portal-rules');

function normalizePortal(value) {
  if (value === SOURCE_PORTALS.radio || value === SOURCE_PORTALS.florist || value === SOURCE_PORTALS.public) {
    return value;
  }
  return SOURCE_PORTALS.public;
}

function validateCountry(country) {
  if (!SUPPORTED_COUNTRIES.includes(country)) {
    throw new Error(`Unsupported country: ${country}`);
  }
}

function stripUnsupportedColumns(record, errorMessage) {
  const nextRecord = { ...record };
  const missingColumnRegex = /Could not find the '([^']+)' column of 'keepsakes' in the schema cache/i;
  const match = missingColumnRegex.exec(errorMessage || '');
  if (!match) {
    return null;
  }

  const columnName = match[1];
  if (!Object.prototype.hasOwnProperty.call(nextRecord, columnName)) {
    return null;
  }

  delete nextRecord[columnName];
  return nextRecord;
}

async function insertKeepsakeRecord(supabase, record) {
  let insertRecord = { ...record };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await supabase
      .from('keepsakes')
      .insert(insertRecord)
      .select('*')
      .single();

    if (!error) {
      return data;
    }

    const strippedRecord = stripUnsupportedColumns(insertRecord, error.message);
    if (!strippedRecord) {
      throw new Error(`Unable to save keepsake: ${error.message}`);
    }

    insertRecord = strippedRecord;
  }

  throw new Error('Unable to save keepsake: keepsake insert kept failing because expected columns are missing.');
}

function buildKeepsakeRecord(input) {
  const {
    stationId = null,
    djId = null,
    sourcePortal,
    edition,
    occasion = 'Birthday',
    recipientName,
    dateOfBirth,
    country,
    senderName = null,
    stationName = null,
    customerName = null,
    customerEmail = null,
    personalMessage = null,
    content = null,
    renderedHtml = null,
    pdfPath = null,
    watermarkStatus,
    promoCodeId = null,
    salesConsultantId = null,
    isFreeDemo = false,
    requestIp = null,
    anthropicInputTokens = 0,
    anthropicOutputTokens = 0,
    anthropicEstimatedCostUsd = 0,
  } = input;

  if (!recipientName || !dateOfBirth || !country) {
    throw new Error('recipientName, dateOfBirth, and country are required to save a keepsake.');
  }

  validateCountry(country);

  const portal = normalizePortal(sourcePortal || edition);
  const resolvedWatermarkStatus = watermarkStatus || getDefaultWatermarkStatus(portal, false);
  if (!Object.values(WATERMARK_STATUS).includes(resolvedWatermarkStatus)) {
    throw new Error(`Invalid watermark status: ${resolvedWatermarkStatus}`);
  }

  return {
    station_id: stationId,
    dj_id: djId,
    dj_name: senderName,
    occasion: String(occasion).toLowerCase(),
    listener_name: recipientName,
    listener_dob: dateOfBirth,
    country,
    dj_message: personalMessage,
    content,
    source_portal: portal,
    edition: edition || portal,
    sender_name: senderName,
    station_name: stationName,
    customer_name: customerName,
    customer_email: customerEmail,
    rendered_html: renderedHtml,
    pdf_path: pdfPath,
    watermark_status: resolvedWatermarkStatus,
    promo_code_id: promoCodeId,
    sales_consultant_id: salesConsultantId,
    is_free_demo: Boolean(isFreeDemo),
    request_ip: requestIp,
    anthropic_input_tokens: Number(anthropicInputTokens) || 0,
    anthropic_output_tokens: Number(anthropicOutputTokens) || 0,
    anthropic_estimated_cost_usd: Number(anthropicEstimatedCostUsd) || 0,
  };
}

async function saveKeepsakeRecord(supabase, input) {
  if (!supabase) {
    throw new Error('Supabase client is required to save keepsakes.');
  }

  const record = buildKeepsakeRecord(input);
  return insertKeepsakeRecord(supabase, record);
}

async function updateKeepsakeRecord(supabase, keepsakeId, updates) {
  if (!supabase) {
    throw new Error('Supabase client is required to update keepsakes.');
  }
  if (!keepsakeId) {
    throw new Error('keepsakeId is required.');
  }

  const patch = {};

  if (updates.renderedHtml !== undefined) patch.rendered_html = updates.renderedHtml;
  if (updates.pdfPath !== undefined) patch.pdf_path = updates.pdfPath;
  if (updates.watermarkStatus !== undefined) patch.watermark_status = updates.watermarkStatus;
  if (updates.customerEmail !== undefined) patch.customer_email = updates.customerEmail;
  if (updates.customerName !== undefined) patch.customer_name = updates.customerName;
  if (updates.content !== undefined) patch.content = updates.content;
  if (updates.stationName !== undefined) patch.station_name = updates.stationName;
  if (updates.senderName !== undefined) patch.sender_name = updates.senderName;
  if (updates.promoCodeId !== undefined) patch.promo_code_id = updates.promoCodeId;
  if (updates.salesConsultantId !== undefined) patch.sales_consultant_id = updates.salesConsultantId;
  if (updates.isFreeDemo !== undefined) patch.is_free_demo = Boolean(updates.isFreeDemo);

  const { data, error } = await supabase
    .from('keepsakes')
    .update(patch)
    .eq('id', keepsakeId)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Unable to update keepsake: ${error.message}`);
  }

  return data;
}

module.exports = {
  buildKeepsakeRecord,
  saveKeepsakeRecord,
  updateKeepsakeRecord,
};
