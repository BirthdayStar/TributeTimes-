// ============================================================
// THE TRIBUTE TIMES — UPDATED SERVER ROUTES
// Drop these routes into the existing server.js
// Replaces the old generate endpoint
// Version 1.0 — July 2026
// ============================================================

const Anthropic = require('@anthropic-ai/sdk');
const { buildPrompt, getStarSign, getChineseZodiac, getMoonPhase } = require('./tribute-times-ai-prompt');
const { renderNewspaper, titleCase } = require('./tribute-times-renderer');
const { buildMemorialPrompt } = require('./tribute-times-memorial-prompt');
const { renderMemorialNewspaper } = require('./tribute-times-memorial-renderer');
const { buildAnniversaryPrompt } = require('./tribute-times-anniversary-prompt');
const { renderAnniversaryNewspaper } = require('./tribute-times-anniversary-renderer');
const { resolveLocalMarketIndexLabel } = require('./src/phase2/market-index-data');
const { yearsElapsedToNzToday } = require('./src/phase2/nz-time');

// Couple-based occasions get their own genuinely separate template path
// (second name field, wedding framing, "years married" counter) rather
// than the birthday template with a name swapped in — see
// new_changes.md Step 13.
const COUPLE_OCCASIONS = new Set([
  'Anniversary', 'Golden Anniversary', 'Silver Anniversary', 'Diamond Anniversary', 'Wedding Day',
]);
const { saveKeepsakeRecord } = require('./src/phase2/save-keepsake');
const { getNextOrderNumber } = require('./src/phase2/order-number');
const { resolveFreeDemoAttribution } = require('./src/phase2/attribution');
const { createGenerateRateLimiter } = require('./src/phase2/rate-limit');
const { extractAnthropicUsage, estimateAnthropicCostUsd, logAnthropicUsage } = require('./src/phase2/anthropic-usage');
const { SOURCE_PORTALS, PAYMENT_STATUS, QUEUE_STATUS, ATTRIBUTION_SOURCE, WATERMARK_STATUS } = require('./src/phase2/constants');
const { queryApprovedFamousBirthdays, normalizeCountry } = require('./src/phase2/famous-birthdays');
const { fetchHistoricalWeather } = require('./src/phase2/historical-weather');
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
  // Client decision (7 Aug 2026 QA session, "Spec Decisions Confirmed"):
  // display headline changed from "I Love You" to "Happy Valentine's" —
  // the occasion key stays "Valentine's Day" throughout the backend
  // (form-template.html, OCCASIONS map key, etc. all unchanged), only
  // this displayed banner text changes.
  "Valentine's Day":    { banner: "Happy Valentine's",           deck: 'News from the day the one I love was born' },
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
        residenceCountry,    // optional metadata only — never drives content sourcing
        occasion,
        senderName,
        stationName,
        edition,            // "radio" | "florist" | "public"
        personalMessage,    // optional override for the closing message
        stationId,
        djId,
        listenerPostalAddress,
        promoCode,
        dateOfPassing,       // "In Loving Memory" only — "2024-02-03"
        relationship,        // "In Loving Memory" only, optional — "Beloved Mother"
        partnerName,         // couple occasions only — second name
        customEditionType,   // "Custom" occasion only — e.g. "Get Well Soon" (new_changes.md Spec Decision: dynamic headline instead of generic "A Special Edition")
      } = req.body;
      const normalizedEdition = String(edition || '').trim().toLowerCase();
      const isMemorial = occasion === 'In Loving Memory';
      const isCouple = COUPLE_OCCASIONS.has(occasion);
      if (isCouple && !String(partnerName || '').trim()) {
        return res.status(400).json({ error: 'Partner\'s name is required for this occasion.' });
      }
      if (occasion === 'Custom' && !String(customEditionType || '').trim()) {
        return res.status(400).json({ error: 'Please describe the occasion for a Custom Edition.' });
      }
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

      // ── IN LOVING MEMORY: DATE OF PASSING (required, own validation) ──
      // Kept as its own explicit block rather than folded into the DOB
      // validation above, since a memorial keepsake requires two dates in
      // the right order, not one.
      let datePassing = null;
      let datePassingFormatted = null;
      let yearsLived = null;
      if (isMemorial) {
        if (!dateOfPassing) {
          return res.status(400).json({ error: 'Date of passing is required for an In Loving Memory keepsake.' });
        }
        datePassing = new Date(dateOfPassing);
        if (Number.isNaN(datePassing.getTime()) || datePassing > maxDate) {
          return res.status(400).json({ error: 'Date of passing must be a valid date no later than 7 days ago.' });
        }
        if (datePassing < dob) {
          return res.status(400).json({ error: 'Date of passing cannot be before the date of birth.' });
        }
        const passingDay = datePassing.getDate();
        const passingMonth = datePassing.getMonth() + 1;
        const passingYear = datePassing.getFullYear();
        datePassingFormatted = `${ordinals(passingDay)} ${months[passingMonth - 1]} ${passingYear}`;
        yearsLived = passingYear - year - ((passingMonth < month || (passingMonth === month && passingDay < day)) ? 1 : 0);
      }

      // ── CURRENCY ──
      const currencyData = CURRENCIES[country] || { symbol: '$', name: 'Dollars' };
      // Pre-euro Ireland
      const currency = (country === 'Ireland' && year >= 2002) ? { symbol: '€', name: 'Euros' } : currencyData;

      // ── OCCASION ──
      const occasionData = OCCASIONS[occasion] || OCCASIONS['Custom'];
      // Spec decision (new_changes.md, Custom Edition): the generic "A
      // Special Edition" banner is replaced by whatever the customer
      // typed (e.g. "Get Well Soon"), title-cased for the same look as
      // every other occasion's banner text. Capped at 40 chars — the
      // banner already shrinks its font for longer text (see
      // bannerFontSize in tribute-times-renderer.js), but a genuinely
      // excessive value would still crowd out the recipient's name.
      const customEditionTypeTrimmed = String(customEditionType || '').trim().slice(0, 40);
      const bannerText = (occasion === 'Custom' && customEditionTypeTrimmed)
        ? titleCase(customEditionTypeTrimmed)
        : occasionData.banner;
      const dateContext = getOccasionDateContext(occasion);

      // ── AGE ── (see src/phase2/nz-time.js — this must never be computed
      // against the server process's own timezone, which is what caused
      // the client-reported "years married" off-by-one bug)
      const age = yearsElapsedToNzToday(year, month, day);

      // ── BUILD DATA OBJECT ──
      const data = {
        recipientName, day, month, year, dayName,
        dateFormatted, dateLong, country,
        residenceCountry: String(residenceCountry || '').trim() || null,
        countryCode: getCountryCode(country),
        // Computed once here (not re-derived independently inside each
        // prompt file) so the renderer can enforce this exact label on the
        // ticker's second slot regardless of whether the AI actually
        // followed the prompt's instruction to use it — see
        // enforceLocalIndexLabel in tribute-times-renderer.js.
        localIndexLabel: resolveLocalMarketIndexLabel(country, new Date(year, month - 1, day)),
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
        personalMessage: personalMessage || '',
      };

      if (occasion === 'Custom') {
        data.customEditionType = titleCase(customEditionTypeTrimmed);
      }

      if (isMemorial) {
        data.relationship = (relationship || '').trim();
        data.dateOfPassing = dateOfPassing;
        data.datePassingFormatted = datePassingFormatted;
        data.yearsLived = yearsLived;
      }

      if (isCouple) {
        data.partnerName = String(partnerName || '').trim();
        // "years married" counts wedding date -> today, which is exactly
        // what an anniversary measures (unlike the birthday "days old"
        // counter, counting to today here would be a bug). This is the
        // same wedding-date-to-today math already computed above as `age`.
        data.yearsMarried = age;
      }

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

      // ── GENERATED CONTENT CACHE ──
      // The bulk of the AI output (on-this-day news, prices, chart,
      // weather, ticker, horoscope, birthdays) depends only on the
      // date/country/occasion/edition, not on who the recipient is — so a
      // repeat request for the same combination can reuse prior output
      // instead of spending a fresh Anthropic call. See src/db.phase3.sql.
      const contentCacheKey = buildContentCacheKey({ day, month, year, country, occasion, edition: normalizedEdition });
      let content = supabase ? await loadCachedContent(supabase, contentCacheKey, data) : null;
      let anthropicUsage = { inputTokens: 0, outputTokens: 0 };
      let anthropicEstimatedCostUsd = 0;

      if (!content) {
        // ── CURATED FAMOUS BIRTHDAYS (real Wikipedia data, admin-approved) ──
        // Falls back to the AI-invents behavior in buildPrompt() if fewer
        // than 3 approved rows exist for this exact date/country.
        if (supabase) {
          data.curatedBirthdays = await loadCuratedBirthdays(supabase, day, month, country);
        }

        // ── BUILD PROMPT ── (In Loving Memory and couple occasions each
        // use their own dedicated prompt builder — see new_changes.md
        // Steps 12-13 — rather than the birthday prompt with occasion
        // conditionals bolted on)
        const prompt = isMemorial ? buildMemorialPrompt(data)
          : isCouple ? buildAnniversaryPrompt(data)
          : buildPrompt(data);

        // Client-reported bug (7 Aug 2026 QA session, bug #7): an
        // intermittent malformed-JSON response from Claude (e.g. a stray
        // `":="` where `":"` was meant) crashed the whole generation with
        // no retry, forcing the customer to manually click "Try Again."
        // A JSON syntax error is not a connection failure — it never
        // matched isAnthropicFallbackError below, so it was always
        // re-thrown straight to the customer as a hard failure. Now
        // retried automatically (up to 2 total attempts) before giving up,
        // with a cheap, targeted sanitization pass first for the exact
        // class of typo actually observed.
        //
        // `contentIsFreshAiJson` tracks specifically "did this content come
        // from a real, successfully-parsed AI response this request" —
        // deliberately separate from `content` itself being truthy, since
        // fallback content (from either a connection error or two
        // consecutive JSON errors) is also truthy but must never be cached
        // (same as the original behaviour before this retry loop existed).
        let contentIsFreshAiJson = false;
        for (let attempt = 0; attempt < 2 && !content; attempt += 1) {
          try {
            const aiResponse = await client.messages.create({
              model: ANTHROPIC_GENERATE_MODEL,
              max_tokens: 4000,
              messages: [{ role: 'user', content: prompt }],
            });

            const usage = extractAnthropicUsage(aiResponse);
            anthropicUsage = usage;
            anthropicEstimatedCostUsd = estimateAnthropicCostUsd({
              modelName: ANTHROPIC_GENERATE_MODEL,
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
            });
            const rawText = aiResponse.content[0].text.trim();
            const jsonStr = sanitizeAiJson(rawText.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim());
            content = JSON.parse(jsonStr);
            contentIsFreshAiJson = true;
          } catch (aiError) {
            if (!isAnthropicFallbackError(aiError) && !(aiError instanceof SyntaxError)) {
              throw aiError;
            }
            if (aiError instanceof SyntaxError) {
              console.warn(`Anthropic returned malformed JSON (attempt ${attempt + 1}/2):`, aiError.message);
              continue;
            }
            console.warn('Anthropic unavailable, using local fallback content for keepsake generation.');
            content = buildFallbackContent(data);
          }
        }

        if (!content) {
          // Both attempts produced malformed JSON — genuinely rare, but
          // fall back to local content rather than a hard failure, same
          // as the connection-error path above.
          console.warn('Anthropic returned malformed JSON twice in a row, using local fallback content.');
          content = buildFallbackContent(data);
        }

        if (supabase && contentIsFreshAiJson) {
          await saveCachedContent(supabase, contentCacheKey, { day, month, year, country, occasion, edition: normalizedEdition }, content);
        }
      }

      // ── REAL HISTORICAL WEATHER (replaces AI-invented weather) ──
      // Client-reported bug (10 Aug 2026 punch list): same category as the
      // famous-birthdays fix — the weather panel must come from a verified
      // data source, not AI-composed seasonal text. Applied after content
      // is resolved (cache/AI/fallback all share the same {icon, temp,
      // condition, season} shape used by every renderer) so it overrides
      // stale AI weather even on a cache hit, without needing to
      // invalidate or re-save the cached entry. If the lookup fails or the
      // date has no archive coverage, content.weather is left untouched —
      // isolated and non-breaking.
      try {
        const realWeather = await fetchHistoricalWeather({ day, month, year, country });
        if (realWeather) {
          content.weather = realWeather;
        }
      } catch (weatherError) {
        console.warn('Historical weather lookup failed, keeping existing weather content:', weatherError.message);
      }

      // ── RENDER HTML ── (In Loving Memory and couple occasions each use
      // their own dedicated renderer — see new_changes.md Steps 12-13)
      const html = isMemorial ? renderMemorialNewspaper(data, content, FONTS)
        : isCouple ? renderAnniversaryNewspaper(data, content, FONTS)
        : renderNewspaper(data, content, FONTS);

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
          residenceCountry: data.residenceCountry,
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
          residenceCountry: data.residenceCountry,
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
          residenceCountry: data.residenceCountry,
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

function buildContentCacheKey({ day, month, year, country, occasion, edition }) {
  const normalizedCountry = String(country || '').trim().toLowerCase();
  const normalizedOccasion = String(occasion || '').trim().toLowerCase();
  return `${day}-${month}-${year}-${normalizedCountry}-${normalizedOccasion}-${edition}`;
}

async function loadCachedContent(supabase, cacheKey, data) {
  try {
    const { data: row, error } = await supabase
      .from('generated_content_cache')
      .select('id, content, hits')
      .eq('cache_key', cacheKey)
      .maybeSingle();
    if (error || !row) return null;

    await supabase
      .from('generated_content_cache')
      .update({ hits: (row.hits || 0) + 1, last_used_at: new Date().toISOString() })
      .eq('id', row.id);

    // Everything except the personal message is date/country/occasion
    // invariant and safe to share across recipients. The message names a
    // specific sender, so it's always recomputed fresh per request.
    return { ...row.content, message: buildFallbackMessage(data) };
  } catch (error) {
    console.warn('Content cache lookup skipped:', error.message);
    return null;
  }
}

async function saveCachedContent(supabase, cacheKey, meta, content) {
  try {
    const { error } = await supabase
      .from('generated_content_cache')
      .upsert({
        cache_key: cacheKey,
        birth_day: meta.day,
        birth_month: meta.month,
        birth_year: meta.year,
        country: meta.country,
        occasion: meta.occasion,
        edition: meta.edition,
        content,
        updated_at: new Date().toISOString(),
        last_used_at: new Date().toISOString(),
      }, { onConflict: 'cache_key' });
    if (error) {
      console.warn('Content cache save skipped:', error.message);
    }
  } catch (error) {
    console.warn('Content cache save skipped:', error.message);
  }
}

async function loadCuratedBirthdays(supabase, day, month, country) {
  try {
    const normalizedCountry = normalizeCountry(country);
    const rows = await queryApprovedFamousBirthdays({ supabase, day, month, country: normalizedCountry, limit: 6 });
    if (rows.length < 3) return [];
    return rows.map(row => ({
      fullName: row.full_name,
      birthYear: row.birth_year || null,
      occupation: row.occupation || '',
      shortBio: row.short_bio || '',
    }));
  } catch (error) {
    console.warn('Curated famous birthdays lookup skipped:', error.message);
    return [];
  }
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
  // Was defaulting Graduation and Retirement to "date of birth" / "born on"
  // like every other occasion — factually wrong, since their date field is
  // labelled "Graduation Date" / "Last Day of Work" in the form, not a
  // birth date. This sent an incorrect framing straight into the AI
  // prompt (see tribute-times-occasion-prompt.js Step 14), which is
  // exactly the kind of birth-announcement-flavoured copy this occasion
  // shouldn't have.
  if (occasion === 'Graduation') {
    return {
      label: 'Graduation Date',
      meaning: 'graduation date',
      intro: 'graduated on',
    };
  }
  if (occasion === 'Retirement') {
    return {
      label: 'Last Day of Work',
      meaning: 'last day of work / retirement date',
      intro: 'retired on',
    };
  }
  return {
    label: 'Date of Birth',
    meaning: 'date of birth',
    intro: 'born on',
  };
}

// Targeted, low-risk fixes for the exact class of malformed JSON actually
// observed from Claude (new_changes.md bug #7: a stray `":="` where `":"`
// was meant, e.g. `"byline":="Eden Park"`). Each pattern here is not valid
// JSON syntax under any legitimate interpretation, so correcting it can't
// accidentally corrupt otherwise-valid content — this is a narrow repair
// pass, not a general "fix any broken JSON" attempt.
function sanitizeAiJson(jsonStr) {
  return jsonStr
    .replace(/":=/g, '":')      // "key":="value"  ->  "key":"value"
    .replace(/,\s*([}\]])/g, '$1'); // trailing comma before } or ]
}

// Found during "100% perfect" sweep (8 Aug 2026, not client-reported):
// this only ever recognised raw network-level connection failures
// (APIConnectionError, ECONNRESET, etc.) — any actual response FROM
// Anthropic's API that represents a failure (rate limited, an expired/
// invalid API key, the account's credit balance running out — exactly
// what surfaced during this session's own testing) is a real HTTP error
// response the SDK throws as an `Anthropic.APIError` subclass, not a
// connection error, so it fell through the `if (!isAnthropicFallbackError
// && !SyntaxError) throw` guard below and 500'd the whole /api/generate
// endpoint for every occasion, not just the one being tested — a
// customer mid-checkout would see a hard failure with no fallback
// newspaper at all, on a failure mode the fallback system exists
// specifically to absorb. `error instanceof Anthropic.APIError` catches
// every SDK error class (connection, rate limit, auth, billing, and
// Anthropic-side 5xxs) in one check; the original message/code checks are
// kept as a safety net for anything thrown before the SDK wraps it.
function isAnthropicFallbackError(error) {
  if (error instanceof Anthropic.APIError) return true;
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
    message: buildFallbackMessage(data),
  };
}

// A simple, non-AI, per-recipient message. Used both for the offline
// fallback content above, and to override a shared cached content
// object's `message` field (see loadCachedContent) — the rest of a
// cached entry is date/country-invariant, but the personal message
// names a specific sender and must never be reused across recipients.
function buildFallbackMessage(data) {
  const { recipientName, partnerName, senderName, occasion, edition } = data;
  const coupleNames = partnerName ? `${recipientName} & ${partnerName}` : recipientName;
  return edition === 'radio'
    ? `From ${senderName || 'your DJ'} with love.`
    : occasion === 'Golden Anniversary'
      ? `Fifty Golden Years Together, ${coupleNames}!`
      : occasion === 'In Loving Memory'
        ? `Remembering ${recipientName} with love.`
        : COUPLE_OCCASIONS.has(occasion)
          ? `Happy ${occasion.toLowerCase()}, ${coupleNames}!`
          : `Happy ${occasion.toLowerCase()}, ${recipientName}!`;
}
