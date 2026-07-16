// ============================================================
// THE TRIBUTE TIMES — UPDATED SERVER ROUTES
// Drop these routes into the existing server.js
// Replaces the old generate endpoint
// Version 1.0 — July 2026
// ============================================================

const Anthropic = require('@anthropic-ai/sdk');
const { buildPrompt, getStarSign, getChineseZodiac, getMoonPhase } = require('./tribute-times-ai-prompt');
const { renderNewspaper } = require('./tribute-times-renderer');
const { saveKeepsakeRecord } = require('./src/phase2/save-keepsake');
const { getNextOrderNumber } = require('./src/phase2/order-number');
const { resolveFreeDemoAttribution } = require('./src/phase2/attribution');
const { createGenerateRateLimiter } = require('./src/phase2/rate-limit');
const { extractAnthropicUsage, estimateAnthropicCostUsd, logAnthropicUsage } = require('./src/phase2/anthropic-usage');
const { SOURCE_PORTALS, PAYMENT_STATUS, QUEUE_STATUS, ATTRIBUTION_SOURCE, WATERMARK_STATUS } = require('./src/phase2/constants');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const ANTHROPIC_GENERATE_MODEL = 'claude-sonnet-4-6';
const generateRateLimiter = createGenerateRateLimiter();

// Pre-load fonts once at startup
const FONTS = {
  chomsky:  fs.readFileSync(path.join(__dirname, 'public/fonts/Chomsky.otf')).toString('base64'),
  poppinsB: fs.readFileSync(path.join(__dirname, 'public/fonts/Poppins-Bold.ttf')).toString('base64'),
  poppinsR: fs.readFileSync(path.join(__dirname, 'public/fonts/Poppins-Regular.ttf')).toString('base64'),
  dejaVu:   fs.readFileSync(path.join(__dirname, 'public/fonts/DejaVuSerif.ttf')).toString('base64'),
  dejaVuB:  fs.readFileSync(path.join(__dirname, 'public/fonts/DejaVuSerif-Bold.ttf')).toString('base64'),
  dejaVuI:  fs.readFileSync(path.join(__dirname, 'public/fonts/DejaVuSerif-Italic.ttf')).toString('base64'),
};

// ── CURRENCY MAP ──
const CURRENCIES = {
  'New Zealand':    { symbol: 'NZ$', name: 'New Zealand Dollars' },
  'Australia':      { symbol: 'A$',  name: 'Australian Dollars' },
  'United Kingdom': { symbol: '£',   name: 'British Pounds' },
  'Ireland':        { symbol: '£',   name: 'Irish Pounds' },  // pre-2002
  'United States':  { symbol: '$',   name: 'US Dollars' },
  'Philippines':    { symbol: '₱',   name: 'Philippine Pesos' },
  'South Africa':   { symbol: 'R',   name: 'South African Rand' },
  'Canada':         { symbol: 'C$',  name: 'Canadian Dollars' },
  'Singapore':      { symbol: 'S$',  name: 'Singapore Dollars' },
};

// ── OCCASION MAP ──
const OCCASIONS = {
  'Birthday':           { banner: 'Happy Birthday',              deck: 'News from the day you were born' },
  '21st Birthday':      { banner: 'Coming of Age',               deck: 'News from the day you came of age' },
  '30th Birthday':      { banner: 'Special 30th Edition',        deck: 'Three decades of a remarkable life' },
  '40th Birthday':      { banner: 'Special 40th Edition',        deck: 'Forty years of a life well lived' },
  '50th Birthday':      { banner: 'Special 50th Edition',        deck: 'Half a century of you' },
  'Milestone Birthday': { banner: 'Special Edition',             deck: 'A truly remarkable milestone' },
  'Anniversary':        { banner: 'Happy Anniversary',           deck: 'News from the day you chose each other' },
  'Golden Anniversary': { banner: 'Fifty Golden Years Together.', deck: 'News from the day they got married' },
  'Silver Anniversary': { banner: 'Silver Wedding Anniversary',  deck: 'Twenty-five years of us' },
  'Diamond Anniversary':{ banner: 'Diamond Anniversary',         deck: 'Sixty years of forever' },
  "Valentine's Day":    { banner: 'I Love You',                  deck: 'News from the day the one I love was born' },
  'New Baby':           { banner: 'Welcome to the World',        deck: 'News from the day the world got better' },
  'Adoption':           { banner: 'Welcome to the Family',       deck: 'News from the day you became ours' },
  "Mother's Day":       { banner: "Happy Mother's Day",          deck: 'News from the day the world got its mum' },
  "Father's Day":       { banner: "Happy Father's Day",          deck: 'News from the day the world got its dad' },
  'Wedding Day':        { banner: 'Wedding Day Special Edition', deck: 'News from the day it all began' },
  'Graduation':         { banner: 'Congratulations Graduate',    deck: 'News from the day you earned it' },
  'Retirement':         { banner: 'Happy Retirement',            deck: 'News from the day you finally clocked off' },
  'In Loving Memory':   { banner: 'In Loving Memory',            deck: 'A life worth remembering' },
  'Citizenship':        { banner: 'Welcome to Your New Home',    deck: 'News from the day you chose a new life' },
  'Custom':             { banner: 'A Special Edition',           deck: 'Your special day, your special story' },
};

// ── MAIN GENERATE ROUTE ──
module.exports = function(app, { supabase, sendEmail, buildFloristLowCreditEmail } = {}) {

  app.post('/api/generate', generateRateLimiter, async (req, res) => {
    try {
      const {
        recipientName,
        dateOfBirth,        // "1963-04-11"
        country,
        occasion,
        senderName,
        stationName,
        edition,            // "radio" | "florist" | "public"
        personalMessage,    // optional override for the closing message
        stationId,
        djId,
        listenerPostalAddress,
        promoCode,
      } = req.body;
      const normalizedEdition = String(edition || '').trim().toLowerCase();
      let floristAccount = null;
      let freeDemoAttribution = null;

      // ── PARSE DATE ──
      const dob = new Date(dateOfBirth);
      const day = dob.getDate();
      const month = dob.getMonth() + 1;
      const year = dob.getFullYear();
      const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const dayName = days[dob.getDay()];
      const monthStr = months[month-1];
      const ordinals = (n) => { const s=['th','st','nd','rd'],v=n%100; return n+(s[(v-20)%10]||s[v]||s[0]); };
      const dateFormatted = `${ordinals(day)} ${monthStr} ${year}`;
      const dateLong = `${dayName}, ${ordinals(day)} ${monthStr} ${year}`;

      // ── VALIDATE DATE RANGE ──
      const minDate = new Date('1920-01-01');
      const maxDate = new Date();
      maxDate.setDate(maxDate.getDate() - 7);
      if (dob < minDate || dob > maxDate) {
        return res.status(400).json({ error: 'Date must be between 1st January 1920 and 7 days ago.' });
      }

      // ── CURRENCY ──
      const currencyData = CURRENCIES[country] || { symbol: '$', name: 'Dollars' };
      // Pre-euro Ireland
      const currency = (country === 'Ireland' && year >= 2002) ? { symbol: '€', name: 'Euros' } : currencyData;

      // ── OCCASION ──
      const occasionData = OCCASIONS[occasion] || OCCASIONS['Custom'];
      const bannerText = occasionData.banner;
      const dateContext = getOccasionDateContext(occasion);

      // ── AGE ──
      const now = new Date();
      const age = now.getFullYear() - year - (now < new Date(now.getFullYear(), month-1, day) ? 1 : 0);

      // ── BUILD DATA OBJECT ──
      const data = {
        recipientName, day, month, year, dayName,
        dateFormatted, dateLong, country,
        countryCode: getCountryCode(country),
        occasion, bannerText,
        dateLabel: dateContext.label,
        dateMeaning: dateContext.meaning,
        dateIntro: dateContext.intro,
        senderName: senderName || 'The Tribute Times',
        stationName: stationName || '',
        edition: normalizedEdition || 'public',
        currency: currency.symbol,
        currencyName: currency.name,
        age,
      };

      if (normalizedEdition === SOURCE_PORTALS.florist && supabase) {
        const florist = await loadAuthenticatedFlorist(req, supabase);
        if (florist.error) {
          return res.status(florist.statusCode).json({ error: florist.error });
        }
        if (Number(florist.station.florist_credit_balance || 0) <= 0) {
          return res.status(402).json({ error: 'No florist credits remaining. Buy another pack to continue.' });
        }
        floristAccount = florist.station;
        data.senderName = floristAccount.name || data.senderName;
        data.stationName = '';
      }

      if (normalizedEdition === SOURCE_PORTALS.public && supabase) {
        freeDemoAttribution = await resolveFreeDemoAttribution({ supabase, promoCode });
      }

      // ── BUILD PROMPT ──
      const prompt = buildPrompt(data);

      let content;
      let anthropicUsage = { inputTokens: 0, outputTokens: 0 };
      let anthropicEstimatedCostUsd = 0;

      try {
        const aiResponse = await client.messages.create({
          model: ANTHROPIC_GENERATE_MODEL,
          max_tokens: 4000,
          messages: [{ role: 'user', content: prompt }],
        });

        anthropicUsage = extractAnthropicUsage(aiResponse);
        anthropicEstimatedCostUsd = estimateAnthropicCostUsd({
          modelName: ANTHROPIC_GENERATE_MODEL,
          inputTokens: anthropicUsage.inputTokens,
          outputTokens: anthropicUsage.outputTokens,
        });
        const rawText = aiResponse.content[0].text.trim();
        const jsonStr = rawText.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
        content = JSON.parse(jsonStr);
      } catch (aiError) {
        if (!isAnthropicFallbackError(aiError)) {
          throw aiError;
        }

        console.warn('Anthropic unavailable, using local fallback content for keepsake generation.');
        content = buildFallbackContent(data);
      }

      // ── RENDER HTML ──
      const html = renderNewspaper(data, content, FONTS);

      // ── RETURN ──
      const generatedResponse = { html, data, content };

      if (normalizedEdition === SOURCE_PORTALS.radio) {
        console.error('Radio generate check:', { hasSupabase: Boolean(supabase), hasPostalAddress: Boolean(listenerPostalAddress && String(listenerPostalAddress).trim()) });
      }

      if (normalizedEdition === SOURCE_PORTALS.radio && supabase) {
        if (!listenerPostalAddress || !String(listenerPostalAddress).trim()) {
          return res.status(400).json({ error: 'Listener postal address is required for radio orders.' });
        }

        const savedKeepsake = await saveKeepsakeRecord(supabase, {
          stationId: stationId || null,
          djId: djId || null,
          sourcePortal: SOURCE_PORTALS.radio,
          edition: SOURCE_PORTALS.radio,
          occasion,
          recipientName,
          dateOfBirth,
          country,
          senderName: senderName || null,
          stationName: stationName || null,
          customerName: recipientName,
          customerEmail: null,
          personalMessage,
          content,
          renderedHtml: html,
          watermarkStatus: WATERMARK_STATUS.none,
          anthropicInputTokens: anthropicUsage.inputTokens,
          anthropicOutputTokens: anthropicUsage.outputTokens,
          anthropicEstimatedCostUsd,
          requestIp: req.ip || null,
        });
        await logGenerateUsage({
          supabase,
          sendEmail,
          sourcePortal: SOURCE_PORTALS.radio,
          keepsakeId: savedKeepsake.id,
          requestIp: req.ip || null,
          usage: anthropicUsage,
        });

        const orderNumber = await getNextOrderNumber(supabase);
        const { data: radioOrder, error: orderError } = await supabase
          .from('orders')
          .insert({
            keepsake_id: savedKeepsake.id,
            station_id: stationId || null,
            dj_id: djId || null,
            order_number: orderNumber,
            source_portal: SOURCE_PORTALS.radio,
            customer_name: recipientName,
            customer_email: null,
            recipient_name: recipientName,
            product_tier: 'standard',
            delivery_option: 'standard',
            queue_status: QUEUE_STATUS.pending,
            payment_status: PAYMENT_STATUS.notRequired,
            attribution_source: ATTRIBUTION_SOURCE.none,
            needs_fulfilment: true,
            delivery_priority: 3,
            currency_code: 'NZD',
            base_amount_nzd: 0,
            delivery_surcharge_nzd: 0,
            total_amount_nzd: 0,
            packaging_notes: 'Radio physical fulfilment only',
            shipping_name: recipientName,
            shipping_address_line1: String(listenerPostalAddress).trim(),
            shipping_country: country,
            notes: 'Generated from the radio portal.',
          })
          .select('*')
          .single();

        if (orderError) {
          throw orderError;
        }

        await supabase.from('fulfilment_events').insert({
          order_id: radioOrder.id,
          previous_status: null,
          new_status: QUEUE_STATUS.pending,
          triggered_email: false,
          note: 'Radio keepsake generated and added to Col\'s fulfilment queue.',
        });

        generatedResponse.radioOrder = {
          id: radioOrder.id,
          orderNumber: radioOrder.order_number,
          queueStatus: radioOrder.queue_status,
          shippingAddress: radioOrder.shipping_address_line1,
        };
      }

      if (normalizedEdition === SOURCE_PORTALS.florist && supabase) {
        const savedKeepsake = await saveKeepsakeRecord(supabase, {
          stationId: floristAccount.id,
          djId: null,
          sourcePortal: SOURCE_PORTALS.florist,
          edition: SOURCE_PORTALS.florist,
          occasion,
          recipientName,
          dateOfBirth,
          country,
          senderName: floristAccount.name || senderName || null,
          stationName: null,
          customerName: recipientName,
          customerEmail: null,
          personalMessage,
          content,
          renderedHtml: html,
          watermarkStatus: WATERMARK_STATUS.none,
          anthropicInputTokens: anthropicUsage.inputTokens,
          anthropicOutputTokens: anthropicUsage.outputTokens,
          anthropicEstimatedCostUsd,
          requestIp: req.ip || null,
        });
        await logGenerateUsage({
          supabase,
          sendEmail,
          sourcePortal: SOURCE_PORTALS.florist,
          keepsakeId: savedKeepsake.id,
          requestIp: req.ip || null,
          usage: anthropicUsage,
        });

        const nextBalance = Number(floristAccount.florist_credit_balance || 0) - 1;
        const threshold = Number(floristAccount.florist_low_credit_threshold || 10);
        await supabase
          .from('stations')
          .update({
            florist_credit_balance: nextBalance,
            florist_credit_updated_at: new Date().toISOString(),
          })
          .eq('id', floristAccount.id);

        if (nextBalance <= threshold && sendEmail && buildFloristLowCreditEmail) {
          try {
            await sendEmail({
              to: floristAccount.email,
              subject: 'Florist credits running low',
              html: buildFloristLowCreditEmail({
                ...floristAccount,
                florist_credit_balance: nextBalance,
              }),
            });
          } catch (emailError) {
            console.error('Florist low-credit email failed:', emailError);
          }
        }

        generatedResponse.floristKeepsake = {
          id: savedKeepsake.id,
          creditBalance: nextBalance,
          lowCredit: nextBalance <= threshold,
          lowCreditThreshold: threshold,
        };
      }

      if (normalizedEdition === SOURCE_PORTALS.public && supabase && freeDemoAttribution?.isFreeDemo) {
        const savedKeepsake = await saveKeepsakeRecord(supabase, {
          sourcePortal: SOURCE_PORTALS.public,
          edition: SOURCE_PORTALS.public,
          occasion,
          recipientName,
          dateOfBirth,
          country,
          senderName: senderName || null,
          stationName: stationName || null,
          customerName: recipientName,
          customerEmail: null,
          personalMessage,
          content,
          renderedHtml: html,
          watermarkStatus: WATERMARK_STATUS.samplePreview,
          promoCodeId: freeDemoAttribution.promoCodeId,
          salesConsultantId: freeDemoAttribution.salesConsultantId,
          isFreeDemo: true,
          anthropicInputTokens: anthropicUsage.inputTokens,
          anthropicOutputTokens: anthropicUsage.outputTokens,
          anthropicEstimatedCostUsd,
          requestIp: req.ip || null,
        });
        await logGenerateUsage({
          supabase,
          sendEmail,
          sourcePortal: SOURCE_PORTALS.public,
          keepsakeId: savedKeepsake.id,
          requestIp: req.ip || null,
          usage: anthropicUsage,
        });

        generatedResponse.publicKeepsake = {
          id: savedKeepsake.id,
          promoCode: freeDemoAttribution.promoCode,
          freeDemosUsedThisMonth: freeDemoAttribution.freeDemosUsedThisMonth,
          freeDemoLimit: freeDemoAttribution.freeDemoLimit,
          consultantName: freeDemoAttribution.consultantName,
        };
      }

      if (normalizedEdition === SOURCE_PORTALS.public && supabase && !freeDemoAttribution?.isFreeDemo) {
        await logGenerateUsage({
          supabase,
          sendEmail,
          sourcePortal: SOURCE_PORTALS.public,
          keepsakeId: null,
          requestIp: req.ip || null,
          usage: anthropicUsage,
        });
      }

      res.json(generatedResponse);

    } catch (error) {
      console.error('Generate error:', error);
      res.status(500).json({ error: error.message || 'Generation failed' });
    }
  });

  // ── HEALTH CHECK ──
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', version: '2.0', timestamp: new Date().toISOString() });
  });

};

async function logGenerateUsage({ supabase, sendEmail, sourcePortal, keepsakeId, requestIp, usage }) {
  if (!supabase || !usage || (!usage.inputTokens && !usage.outputTokens)) {
    return null;
  }

  try {
    return await logAnthropicUsage({
      supabase,
      sendEmail,
      sourcePortal,
      modelName: ANTHROPIC_GENERATE_MODEL,
      usage,
      keepsakeId,
      requestIp,
    });
  } catch (error) {
    console.error('Anthropic usage logging failed:', error);
    return null;
  }
}

async function loadAuthenticatedFlorist(req, supabase) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return { statusCode: 401, error: 'Please sign in with the florist account before generating a florist keepsake.' };
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return { statusCode: 401, error: 'Florist session expired. Please sign in again.' };
  }

  if (!payload?.id || payload.type !== 'station') {
    return { statusCode: 403, error: 'Florist account required.' };
  }

  const { data: station, error } = await supabase
    .from('stations')
    .select('id, name, email, active, account_type, florist_credit_balance, florist_low_credit_threshold')
    .eq('id', payload.id)
    .single();

  if (error || !station) {
    return { statusCode: 404, error: 'Florist account not found.' };
  }
  if (!station.active) {
    return { statusCode: 403, error: 'Florist account is inactive.' };
  }
  if (station.account_type !== SOURCE_PORTALS.florist) {
    return { statusCode: 403, error: 'Please use a florist account for the florist portal.' };
  }

  return { station };
}

function getCountryCode(country) {
  const codes = {
    'New Zealand':'NZ','Australia':'AU','United Kingdom':'GB',
    'Ireland':'IE','United States':'US','Philippines':'PH',
    'South Africa':'ZA','Canada':'CA','Singapore':'SG',
  };
  return codes[country] || 'NZ';
}

function getOccasionDateContext(occasion) {
  if (occasion === 'Golden Anniversary') {
    return {
      label: 'Wedding Date',
      meaning: 'wedding date',
      intro: 'married on',
    };
  }
  if (occasion === 'Anniversary' || occasion === 'Silver Anniversary' || occasion === 'Diamond Anniversary' || occasion === 'Wedding Day') {
    return {
      label: 'Wedding Date',
      meaning: 'wedding date',
      intro: 'married on',
    };
  }
  if (occasion === 'In Loving Memory') {
    return {
      label: 'Date of Birth',
      meaning: 'date of birth, not date of death',
      intro: 'born on',
    };
  }
  return {
    label: 'Date of Birth',
    meaning: 'date of birth',
    intro: 'born on',
  };
}

function isAnthropicFallbackError(error) {
  const message = String(error?.message || '');
  const causeMessage = String(error?.cause?.message || '');
  const code = String(error?.cause?.code || error?.code || '');
  return /APIConnectionError|fetch failed|Connection error/i.test(message)
    || /fetch failed|connect EACCES|ECONN|EAI_AGAIN/i.test(causeMessage)
    || /EACCES|ECONN|EAI_AGAIN/i.test(code);
}

function buildFallbackContent(data) {
  const { recipientName, day, month, year, country, occasion, senderName, edition, age, dateMeaning } = data;
  const starSign = getStarSign(day, month);
  const chineseZodiac = getChineseZodiac(year);
  const moonPhase = getMoonPhase(day, month, year);
  const yearLabel = year < 1952 ? `Popular Music of ${year}` : `${country} Top 5 Singles`;

  return {
    worldNews: [
      { year: 'N/A', headline: `${country} remembers a milestone day`, body: `A local colour piece for ${recipientName}'s keepsake. This fallback content is used when live AI generation is unavailable.`, byline: `The Tribute Times · ${country}` },
      { year: String(year), headline: `A year to celebrate`, body: `This edition is generated locally so the keepsake can still be created during offline testing.`, byline: `Fallback service` },
      { year: String(year - 1), headline: `Community moment`, body: `A small placeholder story keeps the newspaper layout intact for the radio workflow.`, byline: `Archive desk` },
    ],
    localNews: [
      { year: String(year), headline: `${country} local update`, body: `Fallback local news item for ${recipientName}'s keepsake.` },
      { year: String(year), headline: `${recipientName} on the day`, body: `The radio edition keeps the physical fulfilment flow moving even when the AI service is unavailable.` },
      { year: String(year), headline: `Another local note`, body: `This placeholder is intentionally simple but keeps all newspaper sections present.` },
    ],
    sport: [
      { year: String(year), headline: `Sporting highlight makes the back page`, byline: 'Fallback scoreboard', body: '' },
      { year: String(year - 2), headline: `Local fixture settled by a late score`, byline: 'Fallback scoreboard', body: '' },
      { year: String(year - 3), headline: `International result dominates the terraces`, byline: 'Fallback scoreboard', body: '' },
    ],
    business: [
      { year: String(year), headline: `${country} economy snapshot`, body: `Fallback business copy keeps the newspaper structure intact.` },
      { year: String(year - 5), headline: `Science and technology`, body: `This edition still renders cleanly while the remote AI service is offline.` },
    ],
    chart: {
      label: yearLabel,
      entries: [
        { position: 1, title: `${recipientName} Tribute Song`, artist: senderName || 'The Tribute Times' },
        { position: 2, title: 'Golden Memories', artist: 'The Pressmen' },
        { position: 3, title: 'Midnight Headlines', artist: 'Paper Trail' },
        { position: 4, title: 'Front Page Feeling', artist: 'Newsprint' },
        { position: 5, title: 'A Day Like This', artist: 'The Keepsakes' },
      ],
    },
    prices: {
      items: [
        { label: 'Average car price', value: '$2,000' },
        { label: 'Average house price', value: '$18,000' },
        { label: 'Loaf of bread', value: '8c' },
        { label: '330ml bottle of beer', value: '15c' },
        { label: 'Daily newspaper', value: '2c' },
      ],
    },
    weather: {
      icon: '☁️',
      temp: `${20 + (day % 5)}`,
      condition: 'Fine with a few clouds',
      season: 'Seasonal average',
    },
    ticker: [
      { label: 'Dow', value: '1,234', direction: 'up' },
      { label: 'FT', value: '512', direction: 'up' },
      { label: 'Gold', value: '$35', direction: 'up' },
      { label: 'Oil', value: '$14', direction: 'down' },
      { label: 'FX', value: 'Stable', direction: 'flat' },
    ],
    worldInNumbers: [
      { label: 'Population', value: 'N/A' },
      { label: 'Life expectancy', value: 'N/A' },
      { label: 'Cars registered', value: 'N/A' },
    ],
    books: [
      { title: 'A Keepsake Story', author: 'Fallback Desk', note: 'Placeholder title' },
      { title: 'Newspaper Memories', author: 'Tribute Times', note: 'Placeholder title' },
      { title: 'The Day in Print', author: 'Archive Desk', note: 'Placeholder title' },
    ],
    cinema: [
      { title: 'The Newspaper Picture', credit: 'Fallback Film', note: 'Placeholder release' },
      { title: 'Front Page Hero', credit: 'Fallback Film', note: 'Placeholder release' },
      { title: 'City Lights Again', credit: 'Fallback Film', note: 'Placeholder release' },
    ],
    birthdays: [
      { name: recipientName, note: `${dateMeaning === 'wedding date' ? 'Married' : 'Born'} on ${data.dateLong}` },
      { name: `${country} icon`, note: `Same day, same year vibe` },
      { name: 'Archive friend', note: `Fallback curation entry` },
    ],
    astro: {
      starSign,
      chineseZodiac: { animal: chineseZodiac },
      moonPhase: { name: moonPhase },
    },
    message: edition === 'radio'
      ? `From ${senderName || 'your DJ'} with love.`
      : occasion === 'Golden Anniversary'
        ? `Fifty Golden Years Together, ${recipientName}!`
        : occasion === 'In Loving Memory'
          ? `Remembering ${recipientName} with love.`
          : `Happy ${occasion.toLowerCase()}, ${recipientName}!`,
  };
}
