// ============================================================
// THE TRIBUTE TIMES — UPDATED SERVER ROUTES
// Drop these routes into the existing server.js
// Replaces the old generate endpoint
// Version 1.0 — July 2026
// ============================================================

const Anthropic = require('@anthropic-ai/sdk');
const { buildPrompt, getStarSign, getChineseZodiac, getMoonPhase } = require('./tribute-times-ai-prompt');
const { renderNewspaper } = require('./tribute-times-renderer');
const fs = require('fs');
const path = require('path');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
  'Golden Anniversary': { banner: 'Golden Anniversary',          deck: 'Fifty golden years together' },
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
module.exports = function(app) {

  app.post('/api/generate', async (req, res) => {
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
      } = req.body;

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

      // ── AGE ──
      const now = new Date();
      const age = now.getFullYear() - year - (now < new Date(now.getFullYear(), month-1, day) ? 1 : 0);

      // ── BUILD DATA OBJECT ──
      const data = {
        recipientName, day, month, year, dayName,
        dateFormatted, dateLong, country,
        countryCode: getCountryCode(country),
        occasion, bannerText,
        senderName: senderName || 'The Tribute Times',
        stationName: stationName || '',
        edition: edition || 'public',
        currency: currency.symbol,
        currencyName: currency.name,
        age,
      };

      // ── BUILD PROMPT ──
      const prompt = buildPrompt(data);

      // ── CALL ANTHROPIC ──
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      });

      // ── PARSE JSON RESPONSE ──
      const rawText = response.content[0].text.trim();
      const jsonStr = rawText.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
      const content = JSON.parse(jsonStr);

      // ── RENDER HTML ──
      const html = renderNewspaper(data, content, FONTS);

      // ── RETURN ──
      res.json({ html, data, content });

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

function getCountryCode(country) {
  const codes = {
    'New Zealand':'NZ','Australia':'AU','United Kingdom':'GB',
    'Ireland':'IE','United States':'US','Philippines':'PH',
    'South Africa':'ZA','Canada':'CA','Singapore':'SG',
  };
  return codes[country] || 'NZ';
}
