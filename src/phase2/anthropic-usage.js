'use strict';

const { PHASE2_CONFIG } = require('./config');
const { ANTHROPIC_MODEL_PRICING_USD_PER_MILLION } = require('./constants');
const { buildAnthropicSpendAlertEmail } = require('./email-service');

function estimateAnthropicCostUsd({ modelName, inputTokens = 0, outputTokens = 0 }) {
  const pricing = ANTHROPIC_MODEL_PRICING_USD_PER_MILLION[modelName]
    || ANTHROPIC_MODEL_PRICING_USD_PER_MILLION.default;
  const inputCost = (Number(inputTokens || 0) / 1_000_000) * pricing.input;
  const outputCost = (Number(outputTokens || 0) / 1_000_000) * pricing.output;
  return Number((inputCost + outputCost).toFixed(6));
}

function extractAnthropicUsage(response) {
  const usage = response?.usage || {};
  return {
    inputTokens: Number(usage.input_tokens || 0),
    outputTokens: Number(usage.output_tokens || 0),
  };
}

async function logAnthropicUsage({
  supabase,
  sendEmail,
  sourcePortal,
  modelName,
  usage,
  keepsakeId = null,
  orderId = null,
  requestIp = null,
}) {
  if (!supabase || !usage) return null;

  const today = new Date().toISOString().slice(0, 10);
  const inputTokens = Number(usage.inputTokens || 0);
  const outputTokens = Number(usage.outputTokens || 0);
  const estimatedCostUsd = estimateAnthropicCostUsd({ modelName, inputTokens, outputTokens });

  const { data: logRow, error } = await supabase
    .from('anthropic_usage_logs')
    .insert({
      usage_date: today,
      keepsake_id: keepsakeId,
      order_id: orderId,
      source_portal: sourcePortal,
      model_name: modelName,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost_usd: estimatedCostUsd,
      request_ip: requestIp,
      admin_alert_sent: false,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Unable to log Anthropic usage: ${error.message}`);
  }

  const alert = await maybeSendDailySpendAlert({
    supabase,
    sendEmail,
    usageDate: today,
    newLogId: logRow.id,
  });

  return {
    logId: logRow.id,
    inputTokens,
    outputTokens,
    estimatedCostUsd,
    alertSent: alert.sent,
    dailyTotalUsd: alert.dailyTotalUsd,
  };
}

async function maybeSendDailySpendAlert({ supabase, sendEmail, usageDate, newLogId }) {
  const dailyTotalUsd = await loadDailySpendTotal(supabase, usageDate);
  const thresholdUsd = Number(PHASE2_CONFIG.anthropicDailyAlertThresholdUsd || 5);

  if (dailyTotalUsd < thresholdUsd) {
    return { sent: false, dailyTotalUsd };
  }

  const alreadyAlerted = await hasDailyAlertBeenSent(supabase, usageDate);
  if (alreadyAlerted) {
    return { sent: false, dailyTotalUsd };
  }

  let emailSent = false;
  if (sendEmail) {
    emailSent = await sendEmail({
      to: PHASE2_CONFIG.adminAlertEmail,
      subject: `Anthropic spend alert - US$${dailyTotalUsd.toFixed(2)} on ${usageDate}`,
      html: buildAnthropicSpendAlertEmail({
        usageDate,
        totalUsd: dailyTotalUsd,
        thresholdUsd,
      }),
    });
  }

  await supabase
    .from('anthropic_usage_logs')
    .update({
      admin_alert_sent: true,
      alert_sent_at: new Date().toISOString(),
      alert_note: emailSent ? 'Daily threshold alert sent.' : 'Daily threshold crossed; email provider unavailable.',
    })
    .eq('id', newLogId);

  return { sent: true, dailyTotalUsd };
}

async function loadDailySpendTotal(supabase, usageDate) {
  const { data, error } = await supabase
    .from('anthropic_usage_logs')
    .select('estimated_cost_usd')
    .eq('usage_date', usageDate);

  if (error) {
    throw new Error(`Unable to calculate daily Anthropic spend: ${error.message}`);
  }

  return Number((data || []).reduce((sum, row) => sum + Number(row.estimated_cost_usd || 0), 0).toFixed(6));
}

async function hasDailyAlertBeenSent(supabase, usageDate) {
  const { count, error } = await supabase
    .from('anthropic_usage_logs')
    .select('id', { count: 'exact', head: true })
    .eq('usage_date', usageDate)
    .eq('admin_alert_sent', true);

  if (error) {
    throw new Error(`Unable to check Anthropic alert status: ${error.message}`);
  }

  return Number(count || 0) > 0;
}

module.exports = {
  estimateAnthropicCostUsd,
  extractAnthropicUsage,
  logAnthropicUsage,
  maybeSendDailySpendAlert,
};
