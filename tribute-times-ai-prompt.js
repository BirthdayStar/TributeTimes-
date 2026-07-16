// ============================================================
// THE TRIBUTE TIMES — MASTER AI PROMPT
// Version 1.0 — July 2026
// This file is the core content generation engine.
// Pass the variables at the top into the prompt template below.
// The output is parsed and slotted into the HTML template.
// ============================================================

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

WORLD NEWS — On This Day (any year):
- 3 stories from different years, all on ${day}th ${monthName(month)}
- Stories must be REAL verified historical events on this exact date
- Each story: year, headline (max 10 words), byline, body (60-80 words)
- LEAD story gets 2 paragraphs (80-100 words total) — this is the dominant story
- Second story: 50-60 words
- Third story: 30-40 words (short footnote style)
- Headlines must vary in size — lead is biggest, third is smallest
- Vary the years dramatically — e.g. 1945, 1969, 1815

${country.toUpperCase()} NEWS — On This Day (any year):
- 3-4 short items from different years, all on ${day}th ${monthName(month)}
- Must be genuinely relevant to ${country} — local events, not international
- Each item: year, short headline, 25-40 words
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
- London FT index
- Sydney/local stock index if relevant
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

FAMOUS BIRTHDAYS — Born on ${day}th ${monthName(month)}:
3-4 real people born on this date (any year):
- Prefer people famous in or relevant to ${country}
- Format: Full name, nationality, profession, what known for
- NEVER use character names — always real person's name
- Include birth year in description

ASTRO PANEL:
- Star sign: ${starSign.name} (${starSign.symbol}) — element, dates
- Chinese zodiac: ${chineseZodiac} — brief description
- Moon phase on ${dateFormatted}: ${moonPhase} — brief description
- These are pre-calculated — just format them for display

DJ/SENDER MESSAGE:
Write a warm personal message from ${senderName}${stationName ? ` at ${stationName}` : ''} to ${recipientName}.
- Reference 2-3 specific things from the On This Day content
- Warm, personal, radio-ready tone (for radio edition) or warm gift tone (florist/public)
- 40-60 words maximum
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
    {"label": "LONDON FT", "value": "string", "direction": "up|down|flat"},
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
    {"name": "string", "note": "string — nationality, profession, what known for, birth year"},
    {"name": "string", "note": "string"},
    {"name": "string", "note": "string"}
  ],
  "astro": {
    "starSign": {"symbol": "${starSign.symbol}", "name": "${starSign.name}", "element": "${starSign.element}", "dates": "${starSign.dates}"},
    "chineseZodiac": {"animal": "${chineseZodiac}", "year": ${year}},
    "moonPhase": {"name": "${moonPhase}", "description": "string — one line about this moon phase"}
  },
  "message": "string — personal message from sender to recipient, 40-60 words"
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
