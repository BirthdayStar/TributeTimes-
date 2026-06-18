# The Tribute Times
## Radio Keepsake Newspaper Platform
### tributetimes.co.nz

---

## Deploy in 10 Minutes

### Step 1 — Run the database schema in Supabase

1. Go to **supabase.com** → your project
2. Click **SQL Editor** in the left menu
3. Click **New Query**
4. Open the file `src/db.sql` from this package
5. Copy the entire contents and paste into the editor
6. Click **Run**
7. You should see "Success" — your database tables are created

### Step 2 — Push to GitHub

```bash
git init
git add .
git commit -m "The Tribute Times — initial deploy"
```
Go to github.com → New Repository → name it `tribute-times` → push

### Step 3 — Deploy on Render

1. Go to **render.com** → New → Web Service
2. Connect your GitHub repo
3. Render detects Node.js automatically
4. Add these Environment Variables one by one:

| Key | Value |
|-----|-------|
| ANTHROPIC_API_KEY | Your Anthropic API key |
| SUPABASE_URL | Your Supabase project URL |
| SUPABASE_SECRET_KEY | Your Supabase secret/service key |
| SUPABASE_PUBLISHABLE_KEY | Your Supabase publishable key |
| STRIPE_SECRET_KEY | Your Stripe secret key |
| STRIPE_WEBHOOK_SECRET | (get this after deploy — see Step 4) |
| RESEND_API_KEY | Your Resend API key |
| APP_URL | https://tributetimes.co.nz |
| JWT_SECRET | TributeTimesJWT2024SecureKeyChangeThis |

5. Click **Create Web Service**
6. Wait 2 minutes — you get a URL like `https://tribute-times-xxxx.onrender.com`

### Step 4 — Set up Stripe Webhook

1. Go to **dashboard.stripe.com** → Developers → Webhooks
2. Click **Add endpoint**
3. URL: `https://tribute-times-xxxx.onrender.com/api/webhooks/stripe`
4. Select events:
   - `checkout.session.completed`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
5. Copy the **Signing Secret** (starts with `whsec_`)
6. Go back to Render → Environment Variables → add `STRIPE_WEBHOOK_SECRET`
7. Redeploy

### Step 5 — Connect your domain

1. In Render → your service → Settings → Custom Domains
2. Add `tributetimes.co.nz`
3. Render gives you DNS records to add at your domain registrar
4. Add them and wait up to 24 hours for DNS to propagate

### Step 6 — Test it

1. Visit `https://tributetimes.co.nz`
2. Click "I'm a Radio Station" → sign up
3. Add a DJ
4. Log in as the DJ
5. Generate a keepsake
6. Print both pages

---

## What Each File Does

- `server.js` — The entire backend: auth, keepsake generation, billing, emails
- `public/index.html` — The entire frontend: landing page, dashboard, DJ tool
- `src/db.sql` — Database schema — run this in Supabase SQL editor
- `.env.example` — All environment variables needed
- `render.yaml` — Render.com deployment configuration
- `package.json` — Node.js dependencies

---

*The Tribute Times — Col McCabe, Founding Publisher — tributetimes.co.nz*
