'use strict';

require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');
const { logAnthropicUsage } = require('../src/phase2/anthropic-usage');
const { sendEmail } = require('../src/phase2/email-service');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

async function main() {
  const inputTokens = Number(process.argv[2] || 1_000_000);
  const outputTokens = Number(process.argv[3] || 200_000);
  const result = await logAnthropicUsage({
    supabase,
    sendEmail,
    sourcePortal: 'public',
    modelName: 'claude-sonnet-4-6',
    usage: { inputTokens, outputTokens },
    requestIp: '127.0.0.1',
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
