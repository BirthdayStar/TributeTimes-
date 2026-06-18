require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');

const app = express();
const PORT = process.env.PORT || 3000;

// ── CLIENTS ──
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ── PRICING ──
const TIERS = {
  community: { label: 'Community', footprint: 'Up to 25,000', monthly: 4900, annual: 49000, djs: 2, keepsakes: 30 },
  regional:  { label: 'Regional',  footprint: '25,001 – 50,000', monthly: 9900, annual: 99000, djs: 4, keepsakes: 75 },
  city:      { label: 'City',      footprint: '50,001 – 150,000', monthly: 19900, annual: 199000, djs: 8, keepsakes: 200 },
  national:  { label: 'National',  footprint: '150,000+', monthly: 29900, annual: 299000, djs: 999, keepsakes: 9999 },
};
const FRAMES_PRICE_NZD = 1.20;
const FRAMES_GST = 0.15;
const FRAMES_MIN_QTY = 100;

app.use(cors());
app.use((req, res, next) => {
  if (req.originalUrl === '/api/webhooks/stripe') return next();
  return express.json({ limit: '10mb' })(req, res, next);
});
app.use(express.static(path.join(__dirname, 'public')));

// ── AUTH MIDDLEWARE ──
function authStation(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.station = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Session expired' }); }
}

function authDJ(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.dj = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Session expired' }); }
}

// ════════════════════════════════════════
//  AUTH ROUTES
// ════════════════════════════════════════

app.post('/api/anthropic/messages', async (req, res) => {
  const { model, max_tokens, messages, tools } = req.body || {};
  const prompt = messages?.[0]?.content;

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: { message: 'ANTHROPIC_API_KEY is not configured' } });
  }
  if (!Array.isArray(messages) || messages.length !== 1 || messages[0].role !== 'user' || typeof prompt !== 'string') {
    return res.status(400).json({ error: { message: 'Invalid Anthropic request payload' } });
  }
  if (prompt.length > 15000) {
    return res.status(400).json({ error: { message: 'Prompt is too large' } });
  }

  const safeTools = Array.isArray(tools)
    ? tools.filter(tool => tool?.type === 'web_search_20250305' && tool?.name === 'web_search')
    : undefined;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-4-5',
        max_tokens: Math.min(Number(max_tokens) || 1000, 5000),
        ...(safeTools?.length ? { tools: safeTools } : {}),
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error('Anthropic proxy error:', err);
    res.status(500).json({ error: { message: 'Anthropic request failed' } });
  }
});

// Station signup
app.post('/api/auth/signup', async (req, res) => {
  const { name, email, password, country, tier, footprint_label } = req.body;
  if (!name || !email || !password || !tier) return res.status(400).json({ error: 'Missing required fields' });
  if (!TIERS[tier]) return res.status(400).json({ error: 'Invalid tier' });

  try {
    const hash = await bcrypt.hash(password, 12);

    // Create Stripe customer
    const customer = await stripe.customers.create({ email, name, metadata: { tier } });

    const { data, error } = await supabase
      .from('stations')
      .insert({
        name, email, password_hash: hash, country: country || 'New Zealand',
        tier, footprint_label, stripe_customer_id: customer.id,
        subscription_status: 'trial',
        trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Email already registered' });
      throw error;
    }

    // Send welcome email
    await sendEmail({
      to: email,
      subject: 'Welcome to The Tribute Times',
      html: welcomeEmail(name, tier)
    });

    const token = jwt.sign({ id: data.id, type: 'station', name, email, tier }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, station: sanitizeStation(data) });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Signup failed. Please try again.' });
  }
});

// Station login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const { data: station } = await supabase.from('stations').select('*').eq('email', email).single();
    if (!station) return res.status(401).json({ error: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, station.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    await supabase.from('stations').update({ last_login: new Date().toISOString() }).eq('id', station.id);

    const token = jwt.sign(
      { id: station.id, type: 'station', name: station.name, email: station.email, tier: station.tier },
      process.env.JWT_SECRET, { expiresIn: '30d' }
    );
    res.json({ token, station: sanitizeStation(station) });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// DJ login
app.post('/api/auth/dj-login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const { data: dj } = await supabase.from('djs').select('*, stations(*)').eq('email', email).single();
    if (!dj) return res.status(401).json({ error: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, dj.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    // Check station is active
    if (!dj.stations?.active) return res.status(403).json({ error: 'Station account is inactive' });

    await supabase.from('djs').update({ last_login: new Date().toISOString() }).eq('id', dj.id);

    const token = jwt.sign(
      { id: dj.id, type: 'dj', station_id: dj.station_id, name: dj.name, email: dj.email,
        station_name: dj.stations?.name, station_tier: dj.stations?.tier,
        station_logo: dj.stations?.station_logo_url, sponsor_logo: dj.stations?.sponsor_logo_url,
        sponsor_name: dj.stations?.sponsor_name },
      process.env.JWT_SECRET, { expiresIn: '30d' }
    );
    res.json({ token, dj: { id: dj.id, name: dj.name, email: dj.email, station: dj.stations } });
  } catch (err) {
    console.error('DJ login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ════════════════════════════════════════
//  STATION ROUTES
// ════════════════════════════════════════

// Get station profile
app.get('/api/station/me', authStation, async (req, res) => {
  const { data } = await supabase.from('stations').select('*').eq('id', req.station.id).single();
  res.json(sanitizeStation(data));
});

// Update station settings
app.put('/api/station/settings', authStation, async (req, res) => {
  const { name, country, sponsor_name } = req.body;
  const { data } = await supabase.from('stations')
    .update({ name, country, sponsor_name })
    .eq('id', req.station.id).select().single();
  res.json(sanitizeStation(data));
});

// Upload logo
app.post('/api/station/logo', authStation, upload.single('logo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const type = req.body.type; // 'station' or 'sponsor'
  if (!['station','sponsor'].includes(type)) return res.status(400).json({ error: 'Invalid type' });

  // Upload to Supabase storage
  const filename = `${req.station.id}-${type}-${Date.now()}.${req.file.originalname.split('.').pop()}`;
  const { data: upload_data, error } = await supabase.storage
    .from('logos')
    .upload(filename, req.file.buffer, { contentType: req.file.mimetype, upsert: true });

  if (error) return res.status(500).json({ error: 'Upload failed' });

  const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(filename);
  const field = type === 'station' ? 'station_logo_url' : 'sponsor_logo_url';
  await supabase.from('stations').update({ [field]: publicUrl }).eq('id', req.station.id);
  res.json({ url: publicUrl });
});

// Station stats
app.get('/api/station/stats', authStation, async (req, res) => {
  const { data: station } = await supabase.from('stations').select('*').eq('id', req.station.id).single();
  const { count: totalKeepsakes } = await supabase.from('keepsakes').select('*', { count: 'exact', head: true }).eq('station_id', req.station.id);
  const { count: thisMonth } = await supabase.from('keepsakes').select('*', { count: 'exact', head: true })
    .eq('station_id', req.station.id)
    .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());
  const { data: recentKeepsakes } = await supabase.from('keepsakes')
    .select('*').eq('station_id', req.station.id)
    .order('created_at', { ascending: false }).limit(10);
  const { data: djList } = await supabase.from('djs').select('*').eq('station_id', req.station.id);
  const { data: frameOrders } = await supabase.from('frame_orders').select('*').eq('station_id', req.station.id).order('created_at', { ascending: false }).limit(5);
  const tier = TIERS[station.tier];
  const trialEnds = new Date(station.trial_ends_at);
  const trialDaysLeft = Math.max(0, Math.ceil((trialEnds - new Date()) / (1000 * 60 * 60 * 24)));

  res.json({
    station: sanitizeStation(station),
    stats: { totalKeepsakes, thisMonth, djCount: djList?.length || 0, framesInStock: station.frames_in_stock },
    tier, trialDaysLeft, recentKeepsakes, djList, frameOrders
  });
});

// ── DJ MANAGEMENT ──
app.get('/api/station/djs', authStation, async (req, res) => {
  const { data } = await supabase.from('djs').select('id,name,email,active,created_at,last_login').eq('station_id', req.station.id);
  res.json(data);
});

app.post('/api/station/djs', authStation, async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password required' });

  // Check DJ limit for tier
  const { count } = await supabase.from('djs').select('*', { count: 'exact', head: true }).eq('station_id', req.station.id).eq('active', true);
  const { data: station } = await supabase.from('stations').select('tier').eq('id', req.station.id).single();
  const limit = TIERS[station.tier]?.djs || 2;
  if (count >= limit) return res.status(403).json({ error: `Your ${station.tier} plan allows ${limit} DJs. Please upgrade.` });

  const hash = await bcrypt.hash(password, 12);
  const { data, error } = await supabase.from('djs').insert({ station_id: req.station.id, name, email, password_hash: hash }).select().single();
  if (error) return res.status(error.code === '23505' ? 409 : 500).json({ error: error.code === '23505' ? 'Email already in use' : 'Failed to add DJ' });

  await sendEmail({ to: email, subject: 'Your Tribute Times DJ account is ready', html: djWelcomeEmail(name, email, password) });
  res.json({ id: data.id, name: data.name, email: data.email, active: data.active });
});

app.delete('/api/station/djs/:id', authStation, async (req, res) => {
  await supabase.from('djs').update({ active: false }).eq('id', req.params.id).eq('station_id', req.station.id);
  res.json({ success: true });
});

// ════════════════════════════════════════
//  KEEPSAKE GENERATION
// ════════════════════════════════════════

app.post('/api/generate', authDJ, async (req, res) => {
  const { occasion, listener_name, listener_dob, country, dj_message } = req.body;
  if (!listener_name || !listener_dob || !country) return res.status(400).json({ error: 'Missing required fields' });

  // Check keepsake limit
  const { data: station } = await supabase.from('stations').select('*').eq('id', req.dj.station_id).single();
  if (!station?.active) return res.status(403).json({ error: 'Station account inactive' });
  if (station.subscription_status === 'trial' && new Date(station.trial_ends_at) < new Date())
    return res.status(403).json({ error: 'Trial expired. Please subscribe to continue.' });

  const tier = TIERS[station.tier];
  if (station.keepsakes_this_month >= tier.keepsakes)
    return res.status(403).json({ error: `Monthly limit of ${tier.keepsakes} keepsakes reached. Please upgrade your plan.` });

  const dob = new Date(listener_dob + 'T12:00:00');
  const year = dob.getFullYear();
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const formattedDate = `${dob.getDate()} ${months[dob.getMonth()]} ${year}`;
  const dayOfWeek = days[dob.getDay()];
  const age = Math.floor((new Date() - dob) / (365.25 * 24 * 60 * 60 * 1000));

  const CURR = {
    'New Zealand': { s: 'NZ$', n: 'New Zealand dollars' },
    'Australia': { s: 'A$', n: 'Australian dollars' },
    'United Kingdom': { s: '£', n: 'British pounds' },
    'Ireland': { s: year >= 2002 ? '€' : '£', n: year >= 2002 ? 'euros' : 'Irish pounds' },
    'Canada': { s: 'C$', n: 'Canadian dollars' },
    'United States': { s: '$', n: 'US dollars' },
    'South Africa': { s: 'R', n: 'South African rand' },
    'Philippines': { s: '₱', n: 'Philippine pesos' },
    'India': { s: '₹', n: 'Indian rupees' },
    'Germany': { s: year >= 2002 ? '€' : 'DM', n: year >= 2002 ? 'euros' : 'Deutschmarks' },
    'France': { s: year >= 2002 ? '€' : '₣', n: year >= 2002 ? 'euros' : 'French francs' },
    'Japan': { s: '¥', n: 'Japanese yen' },
    'Singapore': { s: 'S$', n: 'Singapore dollars' },
    'Malaysia': { s: 'RM', n: 'Malaysian ringgit' },
    'Nigeria': { s: '₦', n: 'Nigerian naira' },
    'Kenya': { s: 'KSh', n: 'Kenyan shillings' },
    'Brazil': { s: 'R$', n: 'Brazilian reais' },
    'Jamaica': { s: 'J$', n: 'Jamaican dollars' },
  };
  const currency = CURR[country] || { s: '$', n: 'local currency' };

  const occasionLabels = {
    birthday: 'Birthday', anniversary: 'Anniversary', wedding: 'Wedding Day',
    retirement: 'Retirement', graduation: 'Graduation', newbaby: 'New Arrival',
    memorial: 'In Memoriam', custom: 'Special Edition'
  };
  const occasionLabel = occasionLabels[occasion] || 'Birthday';

  const prompt = `You are a research journalist for "The Tribute Times" personalised keepsake newspaper.

OCCASION: ${occasionLabel}
LISTENER: ${listener_name}
DATE: ${listener_dob} — ${dayOfWeek}, ${formattedDate}
COUNTRY: ${country}
AGE: ${age}

CRITICAL RULES:
1. ALL content from ${country}'s perspective. Not American unless country IS USA.
2. MUSIC: Real ${country} chart songs from ${listener_dob}. Official chart name for ${country}.
3. NEWS: Real events in ${country} and world on ${listener_dob}.
4. WEATHER: Realistic for ${country} geography and season. Celsius temp as number only.
5. PRICES: ${currency.n} (${currency.s}). Amount = digits/decimal only, NO symbols.
6. HOROSCOPE: Based on birth date ${listener_dob}.
7. DJ SCRIPT: Write a warm, engaging 30-second on-air script the DJ reads verbatim. Use the listener's name naturally. Reference specific facts from the content.
8. Write warmly — this is a treasured keepsake and a great radio moment.

Return ONLY valid JSON, no markdown:
{
  "national_headline": "Main ${country} news headline on ${listener_dob}",
  "national_deck": "Short subheadline",
  "national_story": "3 sentences flowing prose.",
  "world_headline": "Biggest world headline on ${listener_dob}",
  "world_story": "2 sentences.",
  "sport_headline": "Sports story relevant to ${country}",
  "sport_story": "2 sentences.",
  "local_headline": "Human interest story from ${country}",
  "local_story": "2 warm sentences.",
  "chart_title": "Official ${country} singles chart name",
  "number_one": "Song title — Artist (the actual #1 on that date)",
  "music_chart": [
    {"pos":1,"title":"Song","artist":"Artist"},
    {"pos":2,"title":"Song","artist":"Artist"},
    {"pos":3,"title":"Song","artist":"Artist"},
    {"pos":4,"title":"Song","artist":"Artist"},
    {"pos":5,"title":"Song","artist":"Artist"},
    {"pos":6,"title":"Song","artist":"Artist"},
    {"pos":7,"title":"Song","artist":"Artist"},
    {"pos":8,"title":"Song","artist":"Artist"},
    {"pos":9,"title":"Song","artist":"Artist"},
    {"pos":10,"title":"Song","artist":"Artist"}
  ],
  "prices": [
    {"item":"Loaf of bread","amount":"0"},
    {"item":"Pint of milk","amount":"0"},
    {"item":"Dozen eggs","amount":"0"},
    {"item":"Litre of petrol","amount":"0"},
    {"item":"Cinema ticket","amount":"0"},
    {"item":"Daily newspaper","amount":"0"},
    {"item":"Average house price","amount":"0"},
    {"item":"Pint of beer","amount":"0"}
  ],
  "famous_people": [
    {"name":"Full Name","note":"what known for, relevant to ${country} audience"},
    {"name":"Full Name","note":"..."},
    {"name":"Full Name","note":"..."},
    {"name":"Full Name","note":"..."},
    {"name":"Full Name","note":"..."}
  ],
  "weather": {
    "temp_c": "number only",
    "conditions": "e.g. Cold southerly with showers",
    "forecast": "One sentence next-day forecast.",
    "season": "e.g. Mid-winter"
  },
  "cinema": [
    {"title":"Film title","note":"1 sentence why notable or what it's about"},
    {"title":"Film title","note":"..."},
    {"title":"Film title","note":"..."}
  ],
  "number_one_book": {"title":"Bestselling book title","author":"Author","note":"1 sentence about the book"},
  "science_tech": "1-2 sentences about a real science or tech breakthrough from ${year}.",
  "horoscope": {
    "sign": "Star sign for ${listener_dob}",
    "sign_dates": "Date range e.g. 23 Jul – 22 Aug",
    "reading": "2 sentences fun horoscope in 1970s newspaper style"
  },
  "vintage_ad": {
    "product": "Real product or brand from ${country} in ${year}",
    "slogan": "Period advertising slogan",
    "copy": "2 sentences vintage ad copy"
  },
  "fun_fact": "2 warm nostalgic sentences about ${listener_dob}.",
  "cartoon_emoji": "2-3 emojis for the era",
  "now_vs_then": {
    "item": "Average house price",
    "then": "Price in ${year} with currency symbol",
    "now": "Approximate current ${country} price with currency symbol",
    "shock": "One punchy sentence comparing the two for the DJ to read on air"
  },
  "dj_script": "A warm engaging 30-second on-air script (about 75 words) the DJ reads verbatim when presenting this keepsake. Use ${listener_name}'s name. Reference the number one song, one news event, and one price. End with something warm about the keepsake being on its way.",
  "conversation_starters": [
    "Question or topic the DJ can use to have a live chat — references a specific fact",
    "Another conversation starter",
    "Another conversation starter",
    "Another conversation starter",
    "Another conversation starter"
  ],
  "image_search_query": "4-6 words to find a real historical photo of the main news event on ${listener_dob}"
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 5000, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    const text = data.content.map(b => b.text || '').join('');
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in response');
    const info = JSON.parse(match[0]);

    // Save keepsake record
    const { data: keepsake } = await supabase.from('keepsakes').insert({
      station_id: req.dj.station_id, dj_id: req.dj.id, dj_name: req.dj.name,
      occasion, listener_name, listener_dob, country, dj_message, content: info
    }).select().single();

    // Increment monthly counter
    await supabase.from('stations').update({ keepsakes_this_month: (station.keepsakes_this_month || 0) + 1 }).eq('id', station.id);

    res.json({ info, keepsake_id: keepsake.id, currency, formattedDate, dayOfWeek, year, age });
  } catch (err) {
    console.error('Generate error:', err);
    res.status(500).json({ error: 'Generation failed: ' + err.message });
  }
});

// ════════════════════════════════════════
//  BILLING — STRIPE
// ════════════════════════════════════════

// Create checkout session for subscription
app.post('/api/billing/subscribe', authStation, async (req, res) => {
  const { tier, interval } = req.body; // interval = 'monthly' or 'annual'
  if (!TIERS[tier]) return res.status(400).json({ error: 'Invalid tier' });

  const { data: station } = await supabase.from('stations').select('*').eq('id', req.station.id).single();
  const priceAmount = interval === 'annual' ? TIERS[tier].annual : TIERS[tier].monthly;

  // Create or get Stripe price
  const price = await stripe.prices.create({
    currency: 'nzd',
    unit_amount: priceAmount,
    recurring: { interval: interval === 'annual' ? 'year' : 'month' },
    product_data: { name: `The Tribute Times — ${TIERS[tier].label} Plan (${interval})` },
  });

  const session = await stripe.checkout.sessions.create({
    customer: station.stripe_customer_id,
    payment_method_types: ['card'],
    line_items: [{ price: price.id, quantity: 1 }],
    mode: 'subscription',
    success_url: `${process.env.APP_URL}/dashboard?subscribed=true`,
    cancel_url: `${process.env.APP_URL}/dashboard?cancelled=true`,
    metadata: { station_id: station.id, tier, interval }
  });

  res.json({ url: session.url });
});

// Frame order
app.post('/api/billing/frames', authStation, async (req, res) => {
  const { quantity, delivery_name, delivery_address, delivery_city, delivery_postcode, delivery_country } = req.body;
  const qty = parseInt(quantity) || FRAMES_MIN_QTY;
  if (qty < FRAMES_MIN_QTY) return res.status(400).json({ error: `Minimum order is ${FRAMES_MIN_QTY} frames` });

  const { data: station } = await supabase.from('stations').select('*').eq('id', req.station.id).single();
  const subtotal = qty * FRAMES_PRICE_NZD;
  const gst = subtotal * FRAMES_GST;
  const total = subtotal + gst;

  const session = await stripe.checkout.sessions.create({
    customer: station.stripe_customer_id,
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'nzd',
        unit_amount: Math.round(FRAMES_PRICE_NZD * 100 * (1 + FRAMES_GST)),
        product_data: { name: 'Tribute Times Clip Frames (inc GST)' }
      },
      quantity: qty
    }],
    mode: 'payment',
    success_url: `${process.env.APP_URL}/dashboard?frames=ordered`,
    cancel_url: `${process.env.APP_URL}/dashboard`,
    metadata: { station_id: station.id, type: 'frames', quantity: qty, delivery_name, delivery_address, delivery_city, delivery_postcode, delivery_country: delivery_country || 'New Zealand' }
  });

  res.json({ url: session.url });
});

// Stripe webhook
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: 'Webhook signature failed' });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      if (session.metadata?.type === 'frames') {
        // Frame order paid
        const { station_id, quantity, delivery_name, delivery_address, delivery_city, delivery_postcode, delivery_country } = session.metadata;
        const qty = parseInt(quantity);
        const subtotal = qty * FRAMES_PRICE_NZD;
        const gst = subtotal * FRAMES_GST;
        await supabase.from('frame_orders').insert({
          station_id, quantity: qty, unit_price_nzd: FRAMES_PRICE_NZD,
          gst_nzd: gst, total_nzd: subtotal + gst,
          stripe_payment_intent_id: session.payment_intent,
          status: 'paid', delivery_name, delivery_address, delivery_city, delivery_postcode, delivery_country
        });
        // Update station frame stock
        const { data: st } = await supabase.from('stations').select('frames_in_stock').eq('id', station_id).single();
        await supabase.from('stations').update({ frames_in_stock: (st?.frames_in_stock || 0) + qty }).eq('id', station_id);
        // Notify you
        await sendEmail({ to: 'admin@tributetimes.co.nz', subject: `Frame order: ${qty} frames for station ${station_id}`,
          html: `<p>Station ${station_id} ordered ${qty} frames. Deliver to: ${delivery_name}, ${delivery_address}, ${delivery_city}, ${delivery_postcode}, ${delivery_country}</p>` });
      } else if (session.metadata?.station_id) {
        // Subscription activated
        const { station_id, tier } = session.metadata;
        await supabase.from('stations').update({ subscription_status: 'active', tier }).eq('id', station_id);
        const { data: st } = await supabase.from('stations').select('name,email').eq('id', station_id).single();
        await sendEmail({ to: st.email, subject: 'Your Tribute Times subscription is active!', html: subscriptionActiveEmail(st.name, tier) });
      }
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      await supabase.from('stations').update({ subscription_status: 'cancelled' }).eq('stripe_customer_id', sub.customer);
      break;
    }
    case 'invoice.payment_failed': {
      const inv = event.data.object;
      await supabase.from('stations').update({ subscription_status: 'past_due' }).eq('stripe_customer_id', inv.customer);
      break;
    }
  }

  res.json({ received: true });
});

// Billing portal
app.post('/api/billing/portal', authStation, async (req, res) => {
  const { data: station } = await supabase.from('stations').select('stripe_customer_id').eq('id', req.station.id).single();
  const session = await stripe.billingPortal.sessions.create({
    customer: station.stripe_customer_id,
    return_url: `${process.env.APP_URL}/dashboard`
  });
  res.json({ url: session.url });
});

// ════════════════════════════════════════
//  HELPER FUNCTIONS
// ════════════════════════════════════════

function sanitizeStation(s) {
  const { password_hash, stripe_customer_id, stripe_subscription_id, ...safe } = s;
  return safe;
}

async function sendEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` },
      body: JSON.stringify({ from: 'The Tribute Times <hello@tributetimes.co.nz>', to, subject, html })
    });
  } catch (e) { console.error('Email failed:', e.message); }
}

function welcomeEmail(name, tier) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
    <h1 style="color:#8b1010;">Welcome to The Tribute Times</h1>
    <p>Hi ${name},</p>
    <p>Your <strong>${TIERS[tier]?.label}</strong> station account is ready. You have a 14-day free trial — no card required.</p>
    <p>Log in at <a href="https://tributetimes.co.nz/login">tributetimes.co.nz</a> to set up your station branding, add your DJs, and start creating your first birthday keepsakes.</p>
    <p>Questions? Reply to this email — we're here to help.</p>
    <p style="color:#8b1010;font-weight:bold;">The Tribute Times Team</p>
  </div>`;
}

function djWelcomeEmail(name, email, password) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
    <h1 style="color:#8b1010;">Your Tribute Times DJ Account</h1>
    <p>Hi ${name},</p>
    <p>Your station manager has set up your DJ account on The Tribute Times.</p>
    <p><strong>Login:</strong> <a href="https://tributetimes.co.nz/dj">tributetimes.co.nz/dj</a><br/>
    <strong>Email:</strong> ${email}<br/>
    <strong>Password:</strong> ${password}</p>
    <p>Please change your password after first login.</p>
    <p style="color:#8b1010;font-weight:bold;">The Tribute Times Team</p>
  </div>`;
}

function subscriptionActiveEmail(name, tier) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
    <h1 style="color:#8b1010;">Subscription Active</h1>
    <p>Hi ${name},</p>
    <p>Your <strong>${TIERS[tier]?.label}</strong> plan is now active. You can generate up to ${TIERS[tier]?.keepsakes} keepsakes per month.</p>
    <p>Log in at <a href="https://tributetimes.co.nz/dashboard">tributetimes.co.nz/dashboard</a></p>
    <p style="color:#8b1010;font-weight:bold;">The Tribute Times Team</p>
  </div>`;
}

// Catch-all
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`🗞️  The Tribute Times running on port ${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) console.warn('⚠  ANTHROPIC_API_KEY not set');
  if (!process.env.SUPABASE_URL) console.warn('⚠  SUPABASE_URL not set');
  if (!process.env.STRIPE_SECRET_KEY) console.warn('⚠  STRIPE_SECRET_KEY not set');
});
