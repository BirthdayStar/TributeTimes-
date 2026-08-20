// ============================================================
// THE TRIBUTE TIMES — ANNIVERSARY / WEDDING PROMPT
// Version 1.0 — August 2026
// A genuinely separate content-generation path for couple-based
// occasions (Anniversary, Golden/Silver/Diamond Anniversary, Wedding
// Day), built per the client's explicit instruction (new_changes.md
// Step 13) — not the birthday prompt with occasion conditionals
// bolted on. Shares the same verified-fact engine (Wikipedia "on this
// day," moon phase, cost of living, music charts) keyed off the
// wedding date, same convention as every other occasion, but every
// piece of recipient-facing copy addresses the couple by both names
// and never uses birth-announcement language ("born", "the world
// welcomes").
// ============================================================

const { getStarSign, getChineseZodiac, getMoonPhase } = require('./tribute-times-ai-prompt');
const { resolveLocalMarketIndexLabel } = require('./src/phase2/market-index-data');

function monthName(month) {
  return ['January','February','March','April','May','June',
          'July','August','September','October','November','December'][month-1];
}

function buildAnniversaryPrompt(data) {
  const {
    recipientName, partnerName,
    day, month, year, dateLong,
    country, occasion, bannerText,
    senderName, currency, currencyName,
    yearsMarried,
  } = data;

  const starSign = getStarSign(day, month);
  const chineseZodiac = getChineseZodiac(year);
  const moonPhase = getMoonPhase(day, month, year);

  const chartLabel = year < 1952
    ? `Popular Music of ${year}`
    : `${country} Top 5 Singles`;

  const localIndexLabel = resolveLocalMarketIndexLabel(country, new Date(year, month - 1, day));
  const coupleNames = partnerName ? `${recipientName} & ${partnerName}` : recipientName;
  const yearsMarriedPhrase = Number.isFinite(yearsMarried) ? ` They have been married ${yearsMarried} year${yearsMarried === 1 ? '' : 's'}.` : '';

  const prompt = `You are generating content for The Tribute Times — a personalised keepsake newspaper celebrating ${coupleNames}, married on ${dateLong} in ${country}.${yearsMarriedPhrase}

OCCASION: ${occasion}
EDITION: anniversary
WEDDING DATE: ${dateLong}
BANNER TEXT: ${bannerText}

CRITICAL TONE REQUIREMENT — READ BEFORE WRITING ANYTHING:
This is a wedding/anniversary keepsake, not a birth announcement. Never use birth-announcement language ("born", "the world welcomes", "arrives") about ${coupleNames}. Refer to the wedding date as when they were married, not born. The factual "on this day in history" news items are a neutral historical record and are written normally; only content that speaks TO or ABOUT the couple directly must avoid birth-announcement phrasing.

You must return a single valid JSON object. No preamble, no explanation, no markdown. Just the JSON.

The newspaper shows real historical events that happened on ${day}th ${monthName(month)} across ALL years of history — not just ${year}. This is "On This Day" content spanning centuries, exactly as it would for any other occasion. ${year} is used ONLY for the year-specific sections below, anchored to the wedding year.

════════════════════════════════════════
STRICT CONTENT RULES (historical record — neutral tone, same as any occasion)
════════════════════════════════════════

WORLD NEWS — On This Day:
- Return exactly 3 stories, in this exact order, each with its own rule:
  1. THE LEAD STORY (index 0 — this becomes the "News of the Day" headline, presented as what happened on the actual wedding date): its "year" field MUST be exactly ${year} — no other year is acceptable. It must be a REAL, verified historical event that genuinely happened on ${day}th ${monthName(month)} ${year}. If nothing globally famous happened on that exact date, use the most notable REAL, verifiable event from that exact date instead — a smaller but real story is correct; a famous story from the wrong year is a critical error. Do NOT guess or approximate the exact day if unsure — if you are not fully confident an event happened on this precise day AND year, choose a different, well-documented event you ARE confident about, rather than fabricating a plausible-sounding date for a real event.
  2 & 3. TWO "ON THIS DAY IN HISTORY" STORIES (index 1 and 2 — an explicitly separate, secondary trivia feature): real verified historical events from ${day}th ${monthName(month)} in any OTHER years, vary the years dramatically (e.g. 1945, 1969, 1815) — intentional and desired for these two only, NOT for the lead story above. If a genuinely notable BC/BCE event fits, that's fine, but the "year" field MUST be a NEGATIVE number for any BC/BCE date (e.g. -44 for 44 BC) — never a bare positive number for a BC year.
- Each story: year, headline (max 10 words), byline, AND a non-empty body — every single one of these 3 stories MUST include a real body field. Returning a story with the body field missing, null, or empty is a critical error, even if every other field is correct.
- LEAD story: body (no more than 280 characters total, ending on a complete sentence). Do NOT exceed 280 characters. (Raised from 220, 11 Aug 2026, client request to fill blank space in "News of the Day" — render-side cap raised to match.)
- Second story: body (no more than 145 characters, ending on a complete sentence). Do NOT exceed 145 characters.
- Third story: body (no more than 105 characters, ending on a complete sentence). Do NOT exceed 105 characters.
- CRITICAL: write each body in SHORT, SEPARATE complete sentences rather than one long sentence joined with commas and clauses — count characters as you go and stop after the last complete sentence that fits. A single long sentence with no period in it is a hard failure, even mid-topic.

${country.toUpperCase()} NEWS — On This Day:
- Return 3-4 items. The FIRST item's "year" field MUST be exactly ${year} (same hard rule as the world news lead story above). If nothing globally notable happened in ${country} on that exact date, use a smaller but REAL, verifiable local event from that exact date instead — never substitute a different year. This FIRST item's body specifically: no more than 280 characters, ending on a complete sentence — do NOT exceed 280 characters. (Raised from 220, 11 Aug 2026, same request as the world news lead above — this first item only.)
- The remaining items (index 1 onward) are "on this day in history" trivia from different years — intentional for these only. Each of these items' body: no more than 220 characters, ending on a complete sentence.
- Must be genuinely relevant to ${country} — local events, not international
- Every item, including the first: year, short headline, body, AND a "country" field naming the country the event actually took place in — almost always "${country}", but if you include a regional/Commonwealth/international event, set "country" to where it genuinely happened, not "${country}".

SPORT — On This Day (any year):
- 3-5 sport headline lines from different years, all on ${day}th ${monthName(month)}
- Headlines only — no story text beneath them
- CRITICAL, not optional (client-reported bug, 18 Aug 2026 — see tribute-times-ai-prompt.js for full context): every headline MUST include a real, specific scoreline or result (e.g. "All Blacks 23 · Springboks 22"). A summary sentence describing a result in prose, with no actual score/number in it, is NOT acceptable and will be rejected at render time.
- If you are not confident of the real scoreline for an event, choose a different REAL event from that date where you ARE confident of the actual score — do not invent a plausible-sounding score.
- Prefer ${country} sport but include international if no local results found

BUSINESS — On This Day (any year):
- 2-3 business/science/technology stories from different years, on ${day}th ${monthName(month)} or very close

════════════════════════════════════════
YEAR-SPECIFIC CONTENT (anchored to wedding year ${year})
════════════════════════════════════════

MUSIC CHART — ${chartLabel}:
${year < 1952
  ? `List 5 popular songs from ${year}. Label as "Popular Music of ${year}" not a chart. Songs must be real and from that year.`
  : `The actual ${country} Top 5 singles chart for ${monthName(month)} ${year}. Songs must be real and charting in ${country} at that time. Include artist name.`
}

PRICES — Cost of living in ${year} in ${country}:
- Average car price, average house price, loaf of bread, 330ml bottle of beer, daily newspaper
- Use ${currency} (${currencyName}). Be accurate for ${country} in ${year}.

WEATHER — ${country} in ${monthName(month)}:
- Single weather icon (emoji), temperature in °C, one short condition description, season name

MARKET TICKER — ${year}:
- Dow Jones closing price
- ${localIndexLabel} closing/index value — this is the correct historical index name for ${country} on this exact date. Use this exact label.
- Gold price per oz in USD, oil price per barrel in USD, one locally relevant commodity price
All figures must be historically plausible for ${year}.

WORLD IN NUMBERS — ${year}:
7 fascinating statistics about the world in ${year}.

WHAT WERE THEY READING — ${year}:
3 bestselling or notable books from ${year}: title, author, one-line description.

AT THE CINEMA — ${year}:
3 films showing in cinemas in ${monthName(month)} ${year}: title, director or lead actor, one-line description. Must be real films released around that time.

${buildOnThisDaySection(data, day, month, country)}

ASTRO PANEL:
- Star sign: ${starSign.name} (${starSign.symbol}) — element, dates
- Chinese zodiac: ${chineseZodiac} — brief description
- Moon phase on the wedding date: ${moonPhase} — brief description
- These are pre-calculated — just format them for display

════════════════════════════════════════
SENDER MESSAGE (addressed to the couple, never birth-announcement tone)
════════════════════════════════════════
Write a warm personal message from ${senderName} to ${coupleNames}.
- Reference 1-2 specific things from the On This Day content
- Warm, celebratory, wedding/anniversary-appropriate tone — never "born"/"the world welcomes" phrasing
- Maximum 240 characters, ending on a complete sentence. Aim to use most of that space (200-240 characters) rather than a short message that leaves visible empty space in the printed layout — but never let it run over 240 or get cut off mid-sentence.
- End with "${bannerText}" or another appropriate celebratory closing.

════════════════════════════════════════
RETURN THIS EXACT JSON STRUCTURE
════════════════════════════════════════

{
  "worldNews": [
    {"year": 1945, "headline": "string — max 10 words", "byline": "string", "body": "string"}
  ],
  "localNews": [
    {"year": 1931, "headline": "string", "body": "string", "country": "string — where this event actually happened, usually ${country}"}
  ],
  "sport": [
    {"year": 1981, "headline": "string — include scoreline", "byline": "string", "body": ""}
  ],
  "business": [
    {"year": 1955, "headline": "string", "byline": "string", "body": "string"}
  ],
  "chart": {
    "label": "${chartLabel}",
    "year": ${year},
    "entries": [
      {"position": 1, "title": "string", "artist": "string"},
      {"position": 2, "title": "string", "artist": "string"},
      {"position": 3, "title": "string", "artist": "string"},
      {"position": 4, "title": "string", "artist": "string"},
      {"position": 5, "title": "string", "artist": "string"}
    ]
  },
  "prices": {
    "year": ${year},
    "currency": "${currency}",
    "items": [
      {"label": "Average car", "value": "string"},
      {"label": "Average house", "value": "string"},
      {"label": "Loaf of bread", "value": "string"},
      {"label": "330ml bottle of beer", "value": "string"},
      {"label": "Daily newspaper", "value": "string"}
    ]
  },
  "weather": {"icon": "string", "temp": "number", "condition": "string", "season": "string"},
  "ticker": [
    {"label": "DOW JONES", "value": "string", "direction": "up|down|flat"},
    {"label": "${localIndexLabel.toUpperCase()}", "value": "string", "direction": "up|down|flat"},
    {"label": "GOLD", "value": "string", "direction": "up|down|flat"},
    {"label": "OIL", "value": "string", "direction": "up|down|flat"},
    {"label": "string — local commodity", "value": "string", "direction": "up|down|flat"}
  ],
  "worldInNumbers": [
    {"label": "string", "value": "string"}, {"label": "string", "value": "string"}, {"label": "string", "value": "string"},
    {"label": "string", "value": "string"}, {"label": "string", "value": "string"}, {"label": "string", "value": "string"}, {"label": "string", "value": "string"}
  ],
  "books": [
    {"title": "string", "author": "string", "note": "string"}, {"title": "string", "author": "string", "note": "string"}, {"title": "string", "author": "string", "note": "string"}
  ],
  "cinema": [
    {"title": "string", "credit": "string", "note": "string"}, {"title": "string", "credit": "string", "note": "string"}, {"title": "string", "credit": "string", "note": "string"}
  ],
  "birthdays": [
    {"name": "string", "note": "string — max 120 characters, ending on a complete sentence"},
    {"name": "string", "note": "string — max 120 characters, ending on a complete sentence"},
    {"name": "string", "note": "string — max 120 characters, ending on a complete sentence"}
  ],
  "astro": {
    "starSign": {"symbol": "${starSign.symbol}", "name": "${starSign.name}", "element": "${starSign.element}", "dates": "${starSign.dates}"},
    "chineseZodiac": {"animal": "${chineseZodiac}", "year": ${year}},
    "moonPhase": {"name": "${moonPhase}", "description": "string — one line about this moon phase"}
  },
  "message": "string — personal message from sender to the couple, max 280 characters, ending on a complete sentence"
}`;

  return prompt;
}

// "birthdays" is the field name shared with every other occasion's JSON
// contract (so the renderer can stay generic) but the section heading
// asked for here is neutral historical trivia about this calendar date,
// not a birth-specific framing — see tribute-times-anniversary-renderer.js
// where the heading is displayed as "On This Day, Through History".
function buildOnThisDaySection(data, day, month, country) {
  const curated = Array.isArray(data.curatedBirthdays) ? data.curatedBirthdays : [];

  if (curated.length >= 3) {
    const list = curated.map(b => {
      const year = b.birthYear ? ` (born ${b.birthYear})` : '';
      const detail = b.occupation || b.shortBio || 'notable figure';
      return `- ${b.fullName}${year} — ${detail}`;
    }).join('\n');

    return `NOTABLE PEOPLE BORN ON ${day}th ${monthName(month)} (any year — a neutral historical trivia panel, not about the couple):
Use EXACTLY these verified real people, sourced from Wikipedia. Do NOT invent, substitute, or add anyone else:
${list}
For each person, write a "note" description under 80 characters, ending on a complete sentence, based on the information given above.`;
  }

  return `NOTABLE PEOPLE BORN ON ${day}th ${monthName(month)} (any year — a neutral historical trivia panel, not about the couple):
3-4 real people born on this date (any year):
- Prefer people famous in or relevant to ${country}
- Format: Full name, nationality, profession, what known for. Keep description short and under 80 characters, ending on a complete sentence.
- NEVER use character names — always real person's name
- Include birth year in description`;
}

module.exports = { buildAnniversaryPrompt };
