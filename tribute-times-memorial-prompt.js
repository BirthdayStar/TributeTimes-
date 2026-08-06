// ============================================================
// THE TRIBUTE TIMES — IN LOVING MEMORY PROMPT
// Version 1.0 — August 2026
// A genuinely separate content-generation path for memorial keepsakes,
// built per the client's explicit instruction (new_changes.md Step 12):
// NOT the birthday prompt with occasion conditionals bolted on. Shares
// the same verified-fact engine (Wikipedia "on this day," moon phase,
// cost of living, music charts — all keyed off the date of birth, same
// as every other occasion) but every piece of written copy here is
// composed in past/reflective tense from the outset, so there is no
// present-tense birthday phrasing to strip out after the fact.
// ============================================================

const { getStarSign, getChineseZodiac, getMoonPhase } = require('./tribute-times-ai-prompt');
const { resolveLocalMarketIndexLabel } = require('./src/phase2/market-index-data');

function monthName(month) {
  return ['January','February','March','April','May','June',
          'July','August','September','October','November','December'][month-1];
}

function buildMemorialPrompt(data) {
  const {
    recipientName,     // person being remembered
    day, month, year,  // date of birth (used for "on this day" facts, same as every other occasion)
    dateLong,           // date of birth, long form
    datePassingFormatted, // date of passing, formatted
    yearsLived,         // computed birth -> passing
    relationship,       // optional, e.g. "beloved mother"
    country,
    countryCode,
    senderName,
    currency,
    currencyName,
  } = data;

  const starSign = getStarSign(day, month);
  const chineseZodiac = getChineseZodiac(year);
  const moonPhase = getMoonPhase(day, month, year);

  const chartLabel = year < 1952
    ? `Popular Music of ${year}`
    : `${country} Top 5 Singles`;

  const localIndexLabel = resolveLocalMarketIndexLabel(country, new Date(year, month - 1, day));
  const relationshipPhrase = relationship ? `, ${relationship},` : '';

  const prompt = `You are generating content for The Tribute Times — a personalised memorial keepsake remembering ${recipientName}${relationshipPhrase} who was born on ${dateLong} in ${country} and passed away on ${datePassingFormatted}.

OCCASION: In Loving Memory
EDITION: memorial
DATE OF BIRTH: ${dateLong}
DATE OF PASSING: ${datePassingFormatted}
YEARS LIVED: ${yearsLived}

CRITICAL TONE REQUIREMENT — READ BEFORE WRITING ANYTHING:
This keepsake is for a bereaved family. Every field you write — the personal message, and any narrative copy — must be composed in past or reflective tense. Never write present-tense language implying ${recipientName} is still alive (no "is", "are", "you have always", "the world welcomes"). The factual "on this day in history" news items are a neutral historical record and are written normally (they are not about ${recipientName}); only content that speaks TO or ABOUT ${recipientName} directly must carry the past-tense memorial tone.

You must return a single valid JSON object. No preamble, no explanation, no markdown. Just the JSON.

The newspaper shows real historical events that happened on ${day}th ${monthName(month)} across ALL years of history — not just ${year}. This is "On This Day" content spanning centuries, exactly as it would for any other occasion. ${year} is used ONLY for the year-specific sections below (music chart, prices, weather, market data), anchored to the date of birth as the reference year, the same convention used for every other occasion type.

════════════════════════════════════════
STRICT CONTENT RULES (historical record — neutral tone, same as any occasion)
════════════════════════════════════════

WORLD NEWS — On This Day:
- Return exactly 3 stories, in this exact order, each with its own rule:
  1. THE LEAD STORY (index 0 — this becomes the "News of the Day" headline, presented as what happened on the actual date of birth): its "year" field MUST be exactly ${year} — no other year is acceptable. It must be a REAL, verified historical event that genuinely happened on ${day}th ${monthName(month)} ${year}. If nothing globally famous happened on that exact date, use the most notable REAL, verifiable event from that exact date instead — a smaller but real story is correct; a famous story from the wrong year is a critical error. Do NOT guess or approximate the exact day if unsure — if you are not fully confident an event happened on this precise day AND year, choose a different, well-documented event you ARE confident about, rather than fabricating a plausible-sounding date for a real event.
  2 & 3. TWO "ON THIS DAY IN HISTORY" STORIES (index 1 and 2 — an explicitly separate, secondary trivia feature): real verified historical events from ${day}th ${monthName(month)} in any OTHER years, vary the years dramatically (e.g. 1945, 1969, 1815) — intentional and desired for these two only, NOT for the lead story above.
- Each story: year, headline (max 10 words), byline
- LEAD story: body (no more than 220 characters total, ending on a complete sentence). Do NOT exceed 220 characters.
- Second story: body (no more than 145 characters, ending on a complete sentence). Do NOT exceed 145 characters.
- Third story: body (no more than 105 characters, ending on a complete sentence). Do NOT exceed 105 characters.
- Headlines must vary in size — lead is biggest, third is smallest

${country.toUpperCase()} NEWS — On This Day:
- Return 3-4 items. The FIRST item's "year" field MUST be exactly ${year} (same hard rule as the world news lead story above). If nothing globally notable happened in ${country} on that exact date, use a smaller but REAL, verifiable local event from that exact date instead — never substitute a different year.
- The remaining items (index 1 onward) are "on this day in history" trivia from different years — intentional for these only.
- Must be genuinely relevant to ${country} — local events, not international
- Each item: year, short headline, body (no more than 220 characters, ending on a complete sentence)

SPORT — On This Day (any year):
- 3-5 sport headline lines from different years, all on ${day}th ${monthName(month)}
- Headlines only — no story text beneath them
- Prefer ${country} sport but include international if no local results found

BUSINESS — On This Day (any year):
- 2-3 business/science/technology stories from different years, on ${day}th ${monthName(month)} or very close
- Include at least one story relevant to ${country} economy if possible

════════════════════════════════════════
YEAR-SPECIFIC CONTENT (anchored to birth year ${year})
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
- ${localIndexLabel} closing/index value — this is the correct historical index name for ${country} on this exact date. Use this exact label, never invent or guess a different index name.
- Gold price per oz in USD, oil price per barrel in USD, one locally relevant commodity price
All figures must be historically plausible for ${year}.

WORLD IN NUMBERS — ${year}:
7 fascinating statistics about the world in ${year} (world population, ${country} population, average wage, cost of a stamp, a technology stat, a transport stat, one surprising era-specific stat).

WHAT WERE THEY READING — ${year}:
3 bestselling or notable books from ${year}: title, author, one-line description.

AT THE CINEMA — ${year}:
3 films showing in cinemas in ${monthName(month)} ${year}: title, director or lead actor, one-line description. Must be real films released around that time.

${buildFamousBirthdaysSection(data, day, month, country)}

ASTRO PANEL:
- Star sign: ${starSign.name} (${starSign.symbol}) — element, dates
- Chinese zodiac: ${chineseZodiac} — brief description
- Moon phase on the date of birth: ${moonPhase} — brief description
- These are pre-calculated — just format them for display

════════════════════════════════════════
MEMORIAL MESSAGE (past-tense, reflective — this is the one section directly about ${recipientName})
════════════════════════════════════════
Write a warm memorial tribute message from ${senderName} in memory of ${recipientName}${relationshipPhrase ? relationshipPhrase.replace(/^,\s*/, ', a ') : ''}.
- Past/reflective tense throughout — no present-tense language about ${recipientName} being alive today.
- Reference 1-2 specific things from the On This Day content as a gentle "the world you knew" touch (e.g. "in the same year that...").
- May reference both the date of birth and the date of passing if it reads naturally.
- Maximum 240 characters, ending on a complete sentence. Aim to use most of that space (200-240 characters) rather than a short tribute that leaves visible empty space in the printed layout — but never let it run over 240 or get cut off mid-sentence.
- End with an appropriate memorial closing (e.g. "Forever in our hearts.", "Loved always, never forgotten.") — never "Happy [occasion]" or any birthday-style closing.

════════════════════════════════════════
RETURN THIS EXACT JSON STRUCTURE
════════════════════════════════════════

{
  "worldNews": [
    {"year": 1945, "headline": "string — max 10 words", "byline": "string", "body": "string"}
  ],
  "localNews": [
    {"year": 1931, "headline": "string", "body": "string"}
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
  "message": "string — past-tense memorial tribute message from sender, max 280 characters, ending on a complete sentence"
}`;

  return prompt;
}

function buildFamousBirthdaysSection(data, day, month, country) {
  const curated = Array.isArray(data.curatedBirthdays) ? data.curatedBirthdays : [];

  if (curated.length >= 3) {
    const list = curated.map(b => {
      const year = b.birthYear ? ` (born ${b.birthYear})` : '';
      const detail = b.occupation || b.shortBio || 'notable figure';
      return `- ${b.fullName}${year} — ${detail}`;
    }).join('\n');

    return `ALSO BORN ON ${day}th ${monthName(month)} (any year):
Use EXACTLY these verified real people, sourced from Wikipedia. Do NOT invent, substitute, or add anyone else:
${list}
For each person, write a "note" description under 80 characters, ending on a complete sentence, based on the information given above.`;
  }

  return `ALSO BORN ON ${day}th ${monthName(month)} (any year):
3-4 real people born on this date (any year):
- Prefer people famous in or relevant to ${country}
- Format: Full name, nationality, profession, what known for. Keep description short and under 80 characters, ending on a complete sentence.
- NEVER use character names — always real person's name
- Include birth year in description`;
}

module.exports = { buildMemorialPrompt };
