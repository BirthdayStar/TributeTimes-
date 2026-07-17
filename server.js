require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const multer = require('multer');
const { registerAdminFulfilmentRoutes, authAdmin } = require('./src/phase2/admin-fulfilment');
const { registerPublicCheckoutRoutes } = require('./src/phase2/public-checkout');
const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');

const app = express();
const PORT = process.env.PORT || 3000;
const {
  sendEmail,
  buildStationWelcomeEmail,
  buildFloristLowCreditEmail
} = require('./src/phase2/email-service');

// ── CLIENTS ──
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const PUBLIC_DIR = path.join(__dirname, 'public');
const STATIC_ASSET_PATTERN = /\.(?:avif|css|gif|ico|jpe?g|js|json|map|png|svg|txt|webmanifest|webp|woff2?|ttf|otf|eot|xml)$/i;
const CSP_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "img-src 'self' data: blob: https:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://api.anthropic.com https://*.supabase.co https://en.wikipedia.org https://upload.wikimedia.org",
  "script-src 'self' 'unsafe-inline'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "media-src 'self' data: https:"
].join('; ');

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

app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(cors());
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', CSP_POLICY);
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
});
app.use((req, res, next) => {
  if (req.originalUrl === '/api/webhooks/stripe') return next();
  return express.json({ limit: '10mb' })(req, res, next);
});
app.use(express.static(PUBLIC_DIR, { index: false }));

require('./tribute-times-server-update')(app, { supabase, sendEmail, buildFloristLowCreditEmail });
registerAdminFulfilmentRoutes(app, { supabase, sendEmail });
registerPublicCheckoutRoutes(app, { stripe, supabase, sendEmail });

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
        'Accept-Encoding': 'identity',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-4-5',
        max_tokens: Math.min(Number(max_tokens) || 1000, 5000),
        ...(safeTools?.length ? { tools: safeTools } : {}),
        messages: [{ role: 'user', content: prompt }]
      }),
      compress: false
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = {
        error: {
          message: `Anthropic returned a non-JSON response (${response.status})`,
          detail: text.slice(0, 500)
        }
      };
    }
    res.status(response.status).json(data);
  } catch (err) {
    console.error('Anthropic proxy error:', err);
    res.status(500).json({ error: { message: `Anthropic request failed: ${err.message}` } });
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

    // Restrict florist accounts logging in here unless florist portal directly requests
    const isFloristReq = req.body.portal === 'florist' || req.headers.referer?.includes('/florist');
    if (!isFloristReq && station.account_type === 'florist') {
      return res.status(403).json({ error: 'Florist partners must log in via the florist portal.' });
    }
    if (isFloristReq && station.account_type !== 'florist') {
      return res.status(403).json({ error: 'Station managers must log in via the station portal.' });
    }

    const valid = await bcrypt.compare(password, station.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    await supabase.from('stations').update({ last_login: new Date().toISOString() }).eq('id', station.id);

    const token = jwt.sign(
      { id: station.id, type: 'station', name: station.name, email: station.email, tier: station.tier, role: station.account_type },
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
  if (!s) return null;
  const { password_hash, stripe_customer_id, stripe_subscription_id, ...safe } = s;
  return safe;
}

function isStaticAssetRequest(requestPath) {
  return requestPath.startsWith('/icons/')
    || requestPath.startsWith('/fonts/')
    || requestPath.startsWith('/screenshots/')
    || STATIC_ASSET_PATTERN.test(requestPath);
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

// 3-edition front-end form (radio / florist / public)
function sendEditionTemplate(res, edition) {
  const template = fs.readFileSync(path.join(__dirname, 'public/form-template.html'), 'utf8');
  res.send(template.replace('{{EDITION}}', edition));
}

app.get(['/', '/radio', '/florist', '/public'], (req, res) => {
  const edition = req.path === '/' ? 'public' : req.path.replace('/', '');
  sendEditionTemplate(res, edition);
});

app.get(['/station', '/dashboard'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public/station.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/admin.html'));
});

app.use((req, res, next) => {
  if ((req.method === 'GET' || req.method === 'HEAD') && isStaticAssetRequest(req.path)) {
    return res.status(404).type('text/plain').send('Not found');
  }
  return next();
});

// Catch-all
app.get('*', (req, res) => sendEditionTemplate(res, 'public'));

app.listen(PORT, () => {
  console.log(`🗞️  The Tribute Times running on port ${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) console.warn('⚠  ANTHROPIC_API_KEY not set');
  if (!process.env.SUPABASE_URL) console.warn('⚠  SUPABASE_URL not set');
  if (!process.env.STRIPE_SECRET_KEY) console.warn('⚠  STRIPE_SECRET_KEY not set');
});
