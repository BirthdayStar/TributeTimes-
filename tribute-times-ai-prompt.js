// ============================================================
// THE TRIBUTE TIMES — MASTER AI PROMPT
// Version 1.0 — July 2026
// This file is the core content generation engine.
// Pass the variables at the top into the prompt template below.
// The output is parsed and slotted into the HTML template.
// ============================================================

const { resolveLocalMarketIndexLabel } = require('./src/phase2/market-index-data');

function buildPrompt(data) {
  const {
    recipientName,     // e.g. "Colin McCabe"
    day,               // e.g. 11
    month,             // e.g. 4
    year,              // e.g. 1963
    dayName,           // e.g. "Thursday"
    dateFormatted,     // e.g. "11th April 1963"
    dateLong,          // e.g. "Thursday, 11th April 1963"
    country,           // e.g. "New Zealand"
    countryCode,       // e.g. "NZ"
    occasion,          // e.g. "Birthday"
    bannerText,        // e.g. "Happy Birthday"
    dateLabel,         // e.g. "Date of Birth" or "Wedding Date"
    dateMeaning,       // e.g. "date of birth" or "wedding date"
    dateIntro,         // e.g. "born on" or "married on"
    senderName,        // e.g. "Big Dave" (DJ name or florist name or personal sender)
    stationName,       // e.g. "Classic Hits Radio 97.4 FM" (radio only)
    edition,           // "radio" | "florist" | "public"
    currency,          // e.g. "NZ$" or "₱" or "£"
    currencyName,      // e.g. "New Zealand Dollars"
    age,               // calculated age e.g. 63 (for birthdays)
  } = data;

  // Calculate star sign
  const starSign = getStarSign(day, month);
  
  // Calculate Chinese zodiac
  const chineseZodiac = getChineseZodiac(year);
  
  // Calculate moon phase
  const moonPhase = getMoonPhase(day, month, year);
  
  // Pre-1952 chart handling
  const chartLabel = year < 1952
    ? `Popular Music of ${year}`
    : `${country} Top 5 Singles`;

  // Correct historical index name for the recipient's country/era (e.g.
  // "FTSE 100" did not exist before Jan 1984 — pre-1984 UK dates must show
  // "London FT" instead). See src/phase2/market-index-data.js.
  const localIndexLabel = resolveLocalMarketIndexLabel(country, new Date(year, month - 1, day));

  const prompt = `You are generating content for The Tribute Times — a personalised vintage newspaper keepsake for ${recipientName}, ${dateIntro || 'born on'} ${dateLong} in ${country}.

OCCASION: ${occasion}
EDITION: ${edition}
DATE FIELD: ${dateLabel || 'Date of Birth'}
DATE MEANING: ${dateMeaning || 'date of birth'}
BANNER TEXT: ${bannerText}

You must return a single valid JSON object. No preamble, no explanation, no markdown. Just the JSON.

The newspaper shows events that happened on ${day}th ${monthName(month)} across ALL years of history — not just ${year}. This is "On This Day" content spanning centuries.

The year ${year} is used ONLY for: music chart, prices, weather, market data, world in numbers, books and cinema.
${occasion === 'In Loving Memory' ? 'For In Loving Memory, the entered date is the person\'s date of birth, not date of death.' : ''}
${occasion === 'Golden Anniversary' ? 'For Golden Anniversary, the entered date is the couple\'s wedding date. Content must reflect the day they got married. The banner text must be exactly "Fifty Golden Years Together."' : ''}

════════════════════════════════════════
STRICT CONTENT RULES
════════════════════════════════════════

WORLD NEWS — On This Day:
- Return exactly 3 stories, in this exact order, each with its own rule:
  1. THE LEAD STORY (index 0 — this becomes the keepsake's main front-page headline, presented as "what happened on the day you were born"): its "year" field MUST be exactly ${year} — no other year is acceptable here under any circumstances. It must be a REAL, verified historical event that genuinely happened on ${day}th ${monthName(month)} ${year}. If you cannot find a major globally-famous event on that exact date, use the most notable REAL event you can verify happened somewhere in the world on that exact date in ${year} — a smaller but real and verifiable story is correct; a famous story from the wrong year is NOT acceptable and is a critical error. Do NOT guess or approximate the exact day if unsure — if you are not fully confident an event happened on this precise day AND year, choose a different, well-documented event you ARE confident about, rather than fabricating a plausible-sounding date for a real event.
  2 & 3. TWO "ON THIS DAY IN HISTORY" STORIES (index 1 and 2 — these are explicitly a different, secondary trivia feature, clearly not claimed to be from the birth year): real verified historical events from ${day}th ${monthName(month)} in any OTHER years, vary the years dramatically (e.g. 1945, 1969, 1815) — this is intentional and desired for these two only, NOT for the lead story above.
- Each story: year, headline (max 10 words), byline
- LEAD story: body (no more than 220 characters total, ending on a complete sentence). Do NOT exceed 220 characters.
- Second story: body (no more than 145 characters, ending on a complete sentence). Do NOT exceed 145 characters.
- Third story: body (no more than 105 characters, ending on a complete sentence). Do NOT exceed 105 characters.
- These limits are hard maximums, not suggestions to undershoot — aim to use at least 80-90% of each character limit (write 2-3 complete sentences where the limit allows it, not one short one), while still always ending on a complete sentence rather than being cut off mid-word. Text that comes in far short of the limit leaves visible empty space in the printed layout — write substantively, not minimally.
- Headlines must vary in size — lead is biggest, third is smallest

${country.toUpperCase()} NEWS — On This Day:
- Return 3-4 items. The FIRST item's "year" field MUST be exactly ${year} (same hard rule as the world news lead story above — this is displayed directly under the main headline as more of "the day you were born" reporting, not trivia). If nothing globally notable happened in ${country} on that exact date, use a smaller but REAL, verifiable local event from that exact date instead — never substitute a different year.
- The remaining items (index 1 onward) are "on this day in history" trivia from different years, all on ${day}th ${monthName(month)} — this varied-year trivia format is intentional for these only.
- Must be genuinely relevant to ${country} — local events, not international
- Each item: year, short headline, body (no more than 220 characters, ending on a complete sentence)
- If ${country} is a smaller nation, include regional/Commonwealth events that affected it

SPORT — On This Day (any year):
- 3-5 sport headline lines from different years, all on ${day}th ${monthName(month)}
- Headlines only — no story text beneath them
- Each headline should be one concise vintage newspaper-style line, ideally with scoreline or result detail
- No vague descriptions — real results only
- Prefer ${country} sport but include international if no local results found

BUSINESS — On This Day (any year):
- 2-3 business/science/technology stories from different years, on ${day}th ${monthName(month)} or very close
- Include at least one story relevant to ${country} economy if possible

════════════════════════════════════════
YEAR-SPECIFIC CONTENT (use ${year} only)
════════════════════════════════════════

MUSIC CHART — ${chartLabel}:
${year < 1952 
  ? `List 5 popular songs from ${year}. Label as "Popular Music of ${year}" not a chart. Songs must be real and from that year.`
  : `The actual ${country} Top 5 singles chart for ${monthName(month)} ${year}. Songs must be real and charting in ${country} at that time. Include artist name.`
}

PRICES — Cost of living in ${year} in ${country}:
- Average car price
- Average house price  
- Loaf of bread
- 330ml bottle of beer
- Daily newspaper
Use ${currency} (${currencyName}). Be accurate for ${country} in ${year}.

WEATHER — ${country} in ${monthName(month)}:
- Single weather icon (emoji)
- Temperature in °C
- One short condition description (e.g. "Cold southerly showers")
- Season name
- This is an estimate based on typical ${country} climate for ${monthName(month)}

MARKET TICKER — ${year}:
- Dow Jones closing price
- ${localIndexLabel} closing/index value — this is the correct historical index name for ${country} on this exact date. Use this exact label, do not invent or guess a different index name (in particular, never label it "FTSE" or "FTSE 100" unless the label given here is exactly that).
- Gold price per oz in USD
- Oil price per barrel in USD
- One locally relevant commodity price (e.g. NZ wool, Philippine peso/USD, etc.)
All figures must be historically plausible for ${year}.

WORLD IN NUMBERS — ${year}:
7 fascinating statistics about the world in ${year}:
- World population
- ${country} population
- Average wage in ${country}
- Cost of a stamp in ${country}
- Something technology-related (TVs, phones, internet users etc.)
- Something transport-related (cars, planes etc.)
- Something surprising and era-specific

WHAT WERE THEY READING — ${year}:
3 bestselling or notable books from ${year}:
- Title, Author, one-line description
- Mix of genres — at least one that would have been popular in ${country}

AT THE CINEMA — ${year}:
3 films showing in cinemas in ${monthName(month)} ${year}:
- Title, Director or lead actor, one-line description
- Must be real films released around that time

${buildFamousBirthdaysSection(data, day, month, country)}

ASTRO PANEL:
- Star sign: ${starSign.name} (${starSign.symbol}) — element, dates
- Chinese zodiac: ${chineseZodiac} — brief description
- Moon phase on ${dateFormatted}: ${moonPhase} — brief description
- These are pre-calculated — just format them for display

DJ/SENDER MESSAGE:
Write a warm personal message from ${senderName}${stationName ? ` at ${stationName}` : ''} to ${recipientName}.
- Reference 2-3 specific things from the On This Day content
- Warm, personal, radio-ready tone (for radio edition) or warm gift tone (florist/public)
- Maximum 240 characters, ending on a complete sentence. Aim to use most of that space (200-240 characters) rather than a short message that leaves visible empty space in the printed layout — but never let it run over 240 or get cut off mid-sentence.
- End with ${occasion === 'Golden Anniversary' ? '"Fifty Golden Years Together."' : occasion === 'In Loving Memory' ? 'an appropriate memorial closing' : `"Happy ${occasion}" or appropriate closing`}

════════════════════════════════════════
RETURN THIS EXACT JSON STRUCTURE
════════════════════════════════════════

{
  "worldNews": [
    {
      "year": 1945,
      "headline": "string — max 10 words",
      "deck": "string — italic subtitle max 15 words",
      "byline": "string — e.g. By Our War Correspondent",
      "body": "string — lead story 80-100 words",
      "body2": "string — second paragraph for lead only, null for others",
      "size": "xl|lg|md|sm|xs",
      "boxed": true|false
    }
  ],
  "localNews": [
    {
      "year": 1931,
      "headline": "string",
      "body": "string — 25-40 words",
      "size": "lg|md|sm|xs"
    }
  ],
  "sport": [
    {
      "year": 1981,
      "headline": "string — include scoreline e.g. All Blacks 23 · Springboks 22",
      "byline": "string — venue and location",
      "body": "",
      "boxed": true|false
    }
  ],
  "business": [
    {
      "year": 1955,
      "headline": "string",
      "byline": "string",
      "body": "string — 40-60 words",
      "size": "md|sm|xs"
    }
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
  "weather": {
    "icon": "string — single weather emoji",
    "temp": "number — celsius",
    "condition": "string — short e.g. Cold southerly showers",
    "season": "string — e.g. Autumn"
  },
  "ticker": [
    {"label": "DOW JONES", "value": "string", "direction": "up|down|flat"},
    {"label": "${localIndexLabel.toUpperCase()}", "value": "string", "direction": "up|down|flat"},
    {"label": "GOLD", "value": "string", "direction": "up|down|flat"},
    {"label": "OIL", "value": "string", "direction": "up|down|flat"},
    {"label": "string — local commodity", "value": "string", "direction": "up|down|flat"}
  ],
  "worldInNumbers": [
    {"label": "string", "value": "string"},
    {"label": "string", "value": "string"},
    {"label": "string", "value": "string"},
    {"label": "string", "value": "string"},
    {"label": "string", "value": "string"},
    {"label": "string", "value": "string"},
    {"label": "string", "value": "string"}
  ],
  "books": [
    {"title": "string", "author": "string", "note": "string — one line"},
    {"title": "string", "author": "string", "note": "string — one line"},
    {"title": "string", "author": "string", "note": "string — one line"}
  ],
  "cinema": [
    {"title": "string", "credit": "string — director or lead actor", "note": "string — one line"},
    {"title": "string", "credit": "string", "note": "string — one line"},
    {"title": "string", "credit": "string", "note": "string — one line"}
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
  "message": "string — personal message from sender to recipient, max 280 characters, ending on a complete sentence"
}`;

  return prompt;
}

// ════════════════════════════════════════
// HELPER FUNCTIONS
// ════════════════════════════════════════

function monthName(month) {
  return ['January','February','March','April','May','June',
          'July','August','September','October','November','December'][month-1];
}

// When 3+ admin-approved, Wikipedia-sourced entries exist for this exact
// date/country (data.curatedBirthdays, attached by the caller before
// buildPrompt() — see tribute-times-server-update.js), the AI must use
// those real people instead of inventing names. Otherwise falls back to
// the original AI-invents behavior.
function buildFamousBirthdaysSection(data, day, month, country) {
  const curated = Array.isArray(data.curatedBirthdays) ? data.curatedBirthdays : [];

  if (curated.length >= 3) {
    const list = curated.map(b => {
      const year = b.birthYear ? ` (born ${b.birthYear})` : '';
      const detail = b.occupation || b.shortBio || 'notable figure';
      return `- ${b.fullName}${year} — ${detail}`;
    }).join('\n');

    return `FAMOUS BIRTHDAYS — Born on ${day}th ${monthName(month)}:
Use EXACTLY these verified real people, sourced from Wikipedia. Do NOT invent, substitute, or add anyone else:
${list}
For each person, write a "note" description under 80 characters, ending on a complete sentence, based on the information given above.`;
  }

  return `FAMOUS BIRTHDAYS — Born on ${day}th ${monthName(month)}:
3-4 real people born on this date (any year):
- Prefer people famous in or relevant to ${country}
- Format: Full name, nationality, profession, what known for. Keep description short and under 80 characters, ending on a complete sentence.
- NEVER use character names — always real person's name
- Include birth year in description`;
}

function getStarSign(day, month) {
  const signs = [
    {name:'Capricorn', symbol:'♑', element:'Earth', dates:'22 Dec – 19 Jan'},
    {name:'Aquarius',  symbol:'♒', element:'Air',   dates:'20 Jan – 18 Feb'},
    {name:'Pisces',    symbol:'♓', element:'Water',  dates:'19 Feb – 20 Mar'},
    {name:'Aries',     symbol:'♈', element:'Fire',   dates:'21 Mar – 19 Apr'},
    {name:'Taurus',    symbol:'♉', element:'Earth',  dates:'20 Apr – 20 May'},
    {name:'Gemini',    symbol:'♊', element:'Air',    dates:'21 May – 20 Jun'},
    {name:'Cancer',    symbol:'♋', element:'Water',  dates:'21 Jun – 22 Jul'},
    {name:'Leo',       symbol:'♌', element:'Fire',   dates:'23 Jul – 22 Aug'},
    {name:'Virgo',     symbol:'♍', element:'Earth',  dates:'23 Aug – 22 Sep'},
    {name:'Libra',     symbol:'♎', element:'Air',    dates:'23 Sep – 22 Oct'},
    {name:'Scorpio',   symbol:'♏', element:'Water',  dates:'23 Oct – 21 Nov'},
    {name:'Sagittarius',symbol:'♐',element:'Fire',   dates:'22 Nov – 21 Dec'},
    {name:'Capricorn', symbol:'♑', element:'Earth',  dates:'22 Dec – 19 Jan'},
  ];
  const cutoffs = [19,18,20,19,20,20,22,22,22,22,21,21,31];
  const idx = day <= cutoffs[month-1] ? month-1 : month;
  return signs[idx];
}

function getChineseZodiac(year) {
  const animals = ['Monkey','Rooster','Dog','Pig','Rat','Ox','Tiger','Rabbit','Dragon','Snake','Horse','Goat'];
  return animals[year % 12];
}

function getMoonPhase(day, month, year) {
  // Simplified moon phase calculation
  const knownNewMoon = new Date(2000, 0, 6);
  const date = new Date(year, month-1, day);
  const diff = (date - knownNewMoon) / (1000 * 60 * 60 * 24);
  const cycle = ((diff % 29.53) + 29.53) % 29.53;
  if (cycle < 1.85) return 'New Moon';
  if (cycle < 7.38) return 'Waxing Crescent';
  if (cycle < 9.22) return 'First Quarter';
  if (cycle < 14.77) return 'Waxing Gibbous';
  if (cycle < 16.61) return 'Full Moon';
  if (cycle < 22.15) return 'Waning Gibbous';
  if (cycle < 23.99) return 'Last Quarter';
  if (cycle < 29.53) return 'Waning Crescent';
  return 'New Moon';
}

module.exports = { buildPrompt, getStarSign, getChineseZodiac, getMoonPhase };
