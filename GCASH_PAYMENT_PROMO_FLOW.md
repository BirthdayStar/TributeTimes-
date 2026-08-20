# GCash Payment And One-Time Promo Code Flow

## Decision Summary

Use a personal GCash account manual-verification approach across every purchasable Stripe checkout.

1. **Customer pays to the client's personal GCash account.**
   The site shows the selected product, exact payable amount, personal GCash QR/mobile number, and clear payment instructions.

2. **Customer submits payment proof details.**
   After payment, the customer enters email, customer name, GCash sender name, and transaction/reference ID.

3. **Admin manually approves or rejects.**
   Approval creates a one-use promo code, valid for 30 days, locked to the product/delivery option the customer paid for, and emails it to the customer.

4. **Authenticated account purchases apply directly.**
   Public keepsakes still use a one-time promo-code redemption flow. Florist credit packs, station subscriptions, and station frame orders are tied to authenticated accounts, so admin approval applies those purchases directly.

The current app uses Stripe Checkout with `payment_method_types: ['card']`. Stripe can stay for card payments while personal-account GCash is added as a separate manual payment route.

## Answer: What Is Needed From The Client

For the personal GCash manual flow, request:

- Personal GCash account holder name.
- Personal GCash QR image.
- GCash receiving mobile number.
- Exact payee display name customers will see in GCash.
- Currency decision:
  - keep product price in NZD internally because the app already uses NZD, and
  - show a PHP payable amount for GCash customers if the personal GCash account receives PHP.
- Confirm they are happy to use live NZD to PHP exchange rates for displayed GCash amounts.
- Fallback NZD to PHP rate, used only if the live exchange-rate API is unavailable.
- Admin email used for payment alerts.
- Sender email/domain used by Resend for promo code delivery.
- Legal/refund wording: when a payment is rejected, how the customer is contacted and refunded.

Do not request third-party payment gateway accounts, API keys, or webhook credentials for this version because the client wants to use a personal GCash account.

Important limitation:

- A personal GCash account does not give this app a trusted webhook/API confirmation.
- The website can show the correct amount, but the customer still manually enters or confirms the amount in GCash.
- Admin verification is required before the promo code is issued.

## Environment Variables Used By Implementation

Add these to production/local environment when the client provides details:

```env
GCASH_ACCOUNT_NAME="Client GCash account holder name"
GCASH_MOBILE_NUMBER="09XXXXXXXXX"
GCASH_QR_IMAGE_URL="/gcash-qr.png"
GCASH_LIVE_RATE_ENABLED="true"
GCASH_RATE_API_URL="https://api.frankfurter.dev/v2/rate/NZD/PHP"
GCASH_RATE_CACHE_TTL_MS="21600000"
GCASH_RATE_TIMEOUT_MS="3500"
GCASH_PHP_PER_NZD="34.50"
GCASH_PAYMENT_INSTRUCTIONS="Pay the exact amount shown, then submit your GCash sender name and reference ID."
```

Notes:

- `GCASH_QR_IMAGE_URL` can be a public HTTPS image URL or a local image placed inside `public/`.
- `GCASH_LIVE_RATE_ENABLED` defaults to `true`. Set it to `false` only if the client wants a manual fixed rate.
- `GCASH_RATE_API_URL` defaults to Frankfurter's no-key `NZD/PHP` endpoint.
- `GCASH_RATE_CACHE_TTL_MS` defaults to 6 hours. This avoids calling the exchange-rate API for every visitor.
- `GCASH_RATE_TIMEOUT_MS` defaults to 3500ms so checkout does not hang for long if the exchange-rate API is down.
- `GCASH_PHP_PER_NZD` is now the fallback rate. If the live API fails, the app uses this value.
- If both live rate and fallback rate are unavailable, the app shows only NZD.
- The backend always recalculates the amount from `PRODUCT_TIERS` and `DELIVERY_OPTIONS`; frontend amounts are display-only.
- Each GCash request stores the exact PHP amount, NZD amount, exchange rate, and whether the rate was live or fallback. Admin verifies against that locked amount.

## Current Project Analysis

Relevant files:

- `src/phase2/public-checkout.js`
  Public paid keepsake checkout. It creates pending `orders`, builds product/delivery totals from `PRODUCT_TIERS` and `DELIVERY_OPTIONS`, and redirects to Stripe Checkout.

- `src/phase2/constants.js`
  Product prices live in `PRODUCT_TIERS`: `digital`, `standard`, `premium`. Delivery surcharges live in `DELIVERY_OPTIONS`.

- `src/phase2/attribution.js`
  Current promo codes are consultant attribution/free-demo codes. They are not true one-time paid access codes.

- `src/phase2/admin-fulfilment.js`
  Existing admin APIs for consultants, promo codes, fulfilment queue, florists, stations, and famous birthdays.

- `src/phase2/email-service.js`
  Existing Resend email helper. New promo-code email should be added here.

- `public/form-template.html`
  Public purchase UI and florist portal UI. Public checkout supports card or GCash. Florist credit packs support card or GCash.

- `public/admin.html`
  Existing admin UI has separate Consultants and Promo Codes nav tabs. These should be replaced by one "GCash Payments" or "Payment Requests" tab for the new workflow.

- `server.js`
  Station subscription, frame purchase, florist credit Stripe checkout, Stripe webhook, and GCash route registration are here. Public checkout route is registered from `src/phase2/public-checkout.js`.

Previous gap fixed:

- `public/form-template.html` called `/api/florist/credits/checkout-session`; that backend route now exists and keeps florist card payments on Stripe.

## Why Personal GCash Cannot Be Fully Automatic

A personal GCash QR can let the customer pay, but the site does not receive a trusted server-to-server payment confirmation. The customer may enter the amount manually in the GCash app, and the website cannot know with certainty that:

- the correct amount was paid,
- the correct account received it,
- the payer entered the right reference,
- the payment was not duplicated or later disputed.

So personal GCash must use manual admin verification.

The app can still calculate the exact payable amount from the same product/delivery rate used by Stripe. What is not possible with a personal GCash account is automatic server-side confirmation that the payment arrived.

## Recommended MVP Flow

### Customer Flow

1. New user arrives on `/public`.
2. User generates the sample keepsake.
3. User selects product:
   - Digital
   - Standard print
   - Premium print
   - Delivery speed if printed
4. User chooses payment method:
   - Card via Stripe
   - GCash manual
5. If card, keep the current Stripe flow.
6. If GCash:
   - Create a pending GCash payment request in Supabase.
   - Show a popup/modal with:
     - product selected,
     - total amount from the same product/delivery pricing logic,
     - payable amount and currency,
   - personal GCash QR image,
   - GCash mobile number,
   - payee name,
   - instructions,
   - warning to pay the exact amount.
7. After paying in GCash, customer submits:
   - customer email,
   - customer full name,
   - GCash account name/payment sender name,
   - GCash reference number/transaction ID,
   - optional screenshot upload if added later,
   - confirmation checkbox that exact amount was paid.
8. Customer sees success message:
   "Payment proof received. After admin verification, your one-time promo code will be sent to your email. The code is valid for 30 days and works only for the selected product."

### Other Payment Flows

The same GCash proof/admin approval pattern is also used for:

- Florist credit packs.
  - Card keeps using `/api/florist/credits/checkout-session`.
  - GCash uses `/api/gcash/florist/credits/payment-request`.
  - Admin approval adds credits directly to the florist account.

- Station subscriptions.
  - Card keeps using `/api/billing/subscribe`.
  - GCash uses `/api/gcash/station/subscription/payment-request`.
  - Admin approval activates the station plan and stores the selected interval.
  - A personal GCash account cannot run automatic recurring billing, so renewal/expiry policy must be handled manually unless the client later moves to a real payment gateway.

- Station frame orders.
  - Card keeps using `/api/billing/frames`.
  - GCash uses `/api/gcash/station/frames/payment-request`.
  - Admin approval creates the frame order and adds the quantity to station frame stock.

Stripe Billing Portal remains Stripe-only because it manages Stripe customer billing details and Stripe subscriptions, not a standalone app purchase.

### Admin Flow

1. Admin opens one new tab: "GCash Payments".
2. Table shows:
   - created date,
   - request number,
   - customer name,
   - customer email,
   - payment context,
   - product/item,
   - expected amount,
   - GCash sender name,
   - transaction/reference ID,
   - status: pending, approved, rejected,
   - admin note,
   - actions.
3. Admin checks the client's GCash app manually.
4. Admin clicks:
   - **Approve**
   - **Reject**
5. On approve for a public keepsake payment:
   - backend validates request is still pending,
   - creates a new one-time promo code,
   - code is internally attached to the paid product tier and delivery option,
   - expiry is set to 30 days from approval,
   - usage limit is exactly 1,
   - request status becomes `approved`,
   - approval timestamp and admin ID are saved,
   - email is sent to the customer.
6. On approve for a florist or station account payment:
   - backend validates request is still pending,
   - request status becomes `approved`,
   - florist credits, station subscription, or station frame stock/order is applied directly,
   - approval timestamp and admin ID are saved,
   - email is sent to the submitted payer email.
7. On reject:
   - request status becomes `rejected`,
   - admin note/reason is saved,
   - optional rejection email is sent.

### Redemption Flow

1. Customer receives email with promo code.
2. Customer returns to `/public`, generates/restores keepsake, selects the same product they paid for, and enters code.
3. Backend validates:
   - code exists,
   - code is active,
   - code source is `gcash_payment`,
   - not expired,
   - not already used,
   - selected product tier matches,
   - selected delivery option matches when applicable,
   - optional email lock matches the original submitted email.
4. If valid:
   - order is created/marked paid internally without Stripe,
   - payment provider is `gcash_manual_promo`,
   - promo usage is marked consumed,
   - keepsake watermark is removed,
   - digital user receives clean PDF access,
   - printed order goes into fulfilment queue.

## Database Changes

Add a new table instead of forcing this into the existing consultant promo tables.

```sql
create table if not exists gcash_payment_requests (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  request_number text not null unique,
  payment_context text not null default 'public_order',
  keepsake_id uuid references keepsakes(id) on delete set null,
  station_id uuid references stations(id) on delete set null,
  customer_name text not null,
  customer_email text not null,
  recipient_name text,
  product_tier text check (product_tier in ('digital', 'standard', 'premium')),
  delivery_option text check (delivery_option in ('standard', '2day', 'overnight')),
  item_label text,
  item_code text,
  quantity int,
  action_payload jsonb,
  currency_code text not null default 'NZD',
  expected_amount_nzd numeric(10,2) not null,
  expected_amount_php numeric(10,2),
  exchange_rate_php_per_nzd numeric(12,6),
  exchange_rate_source text,
  exchange_rate_date text,
  exchange_rate_is_live boolean default false,
  gcash_payee_name text,
  gcash_mobile_number text,
  gcash_sender_name text not null,
  gcash_reference_id text not null,
  proof_image_path text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  admin_note text,
  reviewed_by_admin_id uuid references admins(id) on delete set null,
  reviewed_at timestamptz,
  generated_promo_code_id uuid references promo_codes(id) on delete set null,
  applied_at timestamptz,
  applied_result jsonb
);

create unique index if not exists idx_gcash_payment_requests_reference
  on gcash_payment_requests (lower(gcash_reference_id));

create index if not exists idx_gcash_payment_requests_status_created
  on gcash_payment_requests (status, created_at desc);
```

Extend `promo_codes` for paid one-time codes:

```sql
alter table promo_codes
  add column if not exists code_type text not null default 'consultant_demo',
  add column if not exists product_tier text,
  add column if not exists delivery_option text,
  add column if not exists valid_until timestamptz,
  add column if not exists max_uses int not null default 0,
  add column if not exists used_count int not null default 0,
  add column if not exists locked_customer_email text,
  add column if not exists source_payment_request_id uuid references gcash_payment_requests(id) on delete set null;

alter table promo_codes
  add constraint promo_codes_code_type_check
  check (code_type in ('consultant_demo', 'gcash_paid_access'));
```

Recommended meaning:

- `consultant_demo`: old behavior, used for free demos/attribution.
- `gcash_paid_access`: new paid access code.
- `max_uses = 1`, `used_count = 0`.
- `valid_until = approved_at + interval '30 days'`.
- `product_tier` and `delivery_option` bind the code to the product the customer paid for.

## Backend Implementation Steps

### 1. Add Payment Request Module

Create `src/phase2/gcash-payment-requests.js`.

Responsibilities:

- `normalizeGcashPaymentPayload`
- calculate expected amount using `PRODUCT_TIERS` and `DELIVERY_OPTIONS`
- create pending payment request
- list admin requests
- approve request
- reject request
- generate/redeem one-time promo code for public keepsakes
- apply authenticated account payments directly for florist/station contexts

### 2. Add GCash APIs

Register routes in `server.js`.

```text
GET  /api/public/gcash/settings
POST /api/public/gcash/payment-request
POST /api/gcash/florist/credits/payment-request
POST /api/gcash/station/subscription/payment-request
POST /api/gcash/station/frames/payment-request
```

Each request accepts the same core purchase payload as the matching Stripe checkout plus:

- `gcashSenderName`
- `gcashReferenceId`
- optional `expectedAmountConfirmed`

The backend must calculate the amount. Do not trust frontend amount values. Public keepsake payment approval creates a promo code; florist and station payment approval applies the paid item directly.

### 3. Add Admin APIs

Use existing `authAdmin`.

```text
GET   /api/admin/gcash-payments
PATCH /api/admin/gcash-payments/:id/approve
PATCH /api/admin/gcash-payments/:id/reject
```

Approval rules:

- If a public request is already approved, return the existing generated promo code.
- If rejected, do not approve unless a separate reopen action exists.
- If duplicate `gcash_reference_id`, block the second pending request.
- For florist/station requests, reserve approval before applying the action so the same request cannot be double-applied by two admin clicks.

### 4. Add Promo Validation For Paid Codes

Update `src/phase2/attribution.js` or add a separate `promo-access.js`.

Do not reuse `resolvePaidOrderAttribution` as-is because it only validates old promo codes and attribution. Add a separate validator for `gcash_paid_access`:

- code active
- `code_type = 'gcash_paid_access'`
- `used_count < max_uses`
- `valid_until > now()`
- selected tier matches
- selected delivery matches
- email matches if locked

### 5. Mark Code Consumed Atomically

Use a guarded update:

```sql
update promo_codes
set used_count = used_count + 1,
    active = case when used_count + 1 >= max_uses then false else active end
where id = :promo_code_id
  and code_type = 'gcash_paid_access'
  and active = true
  and used_count < max_uses
  and valid_until > now()
returning *;
```

This prevents double-use if the customer clicks twice.

### 6. Create Internal Paid Order

For a valid redeemed code:

- create or reuse keepsake record,
- create `orders` row,
- set `payment_status = 'paid'`,
- set `payment_provider = 'gcash_manual_promo'`,
- set `paid_at = now()`,
- set `total_amount_nzd` to the expected product/delivery amount,
- set `promo_code_id` to the generated promo code,
- set fulfilment fields for printed products,
- remove watermark on the keepsake.

### 7. Add Emails

Add to `src/phase2/email-service.js`:

- `buildGcashPromoApprovedEmail`
- optional `buildGcashPaymentRejectedEmail`

Approval email must mention:

- promo code,
- product tier,
- delivery option if applicable,
- one-time use,
- expiry date,
- exact instruction to return to the site, select the same product, and enter code.

### 8. Replace Admin Tabs

In `public/admin.html`:

- Remove or hide separate "Consultants" and "Promo Codes" nav items.
- Add one nav item: "GCash Payments".
- Add one view: `view-gcash-payments`.
- Table columns should match the admin flow above.
- Add approve/reject buttons.
- Keep old backend routes temporarily until data migration is complete, but remove them from the visible UI.

### 9. Add Public UI

In `public/form-template.html`:

- Add payment method selector in purchase panel:
  - Card
  - GCash
- Keep current Stripe button behavior for Card.
- For GCash, show modal with QR/instructions and proof form.
- Add success state after proof submission.
- Disable submit while saving.
- Show the product amount from the same calculation map used by the UI, but backend remains source of truth.

### 10. Apply To Every Stripe Place

Current Stripe places:

- Public keepsake purchase: `src/phase2/public-checkout.js`
- Station subscription: `/api/billing/subscribe` in `server.js`
- Frame orders: `/api/billing/frames` in `server.js`
- Florist credit packs: frontend call exists, backend route missing

Recommended rollout:

1. Implement public keepsake GCash first.
2. Fix florist credit pack checkout backend.
3. Add GCash manual request type for florist credit packs.
4. Add GCash manual request type for frame orders.
5. Keep station subscriptions on Stripe unless the client accepts manual subscription activation, because recurring GCash subscription automation is a different problem.

## Personal GCash Only Scope

This implementation does not require any third-party payment gateway.

Because the client is using a personal GCash account, the production-safe scope is:

1. Show exact payment amount from the app's product/delivery prices.
2. Show the client's personal GCash QR and mobile number.
3. Collect customer proof details after payment.
4. Let admin manually verify the payment in the GCash app.
5. Issue the one-time promo code only after admin approval.

Do not build auto-approval, auto-paid orders, or automatic webhook reconciliation for personal GCash. Those features require a provider/API that can send trusted payment events to the server.

## Error Prevention Checklist

- Backend calculates amount; frontend never decides final payable amount.
- Store an immutable snapshot of product tier, delivery option, amount, exchange rate, and currency on the payment request.
- Unique index on GCash transaction/reference ID.
- Admin approval is idempotent.
- Promo code is random, high entropy, uppercase, and not user-chosen.
- Promo code has `max_uses = 1`.
- Promo code has `valid_until = approved_at + 30 days`.
- Promo code is product-locked.
- Printed orders require shipping fields before request creation.
- Redemption consumes the code with a guarded database update.
- Emails are sent only after successful database changes.
- Admin can see email status/failure if Resend fails.
- Rejected requests do not create promo codes.
- Old consultant demo promo codes are not accepted as paid access codes.
- Keep Stripe webhook behavior unchanged for card payments.
- Do not add payment provider credentials for personal GCash.

## Suggested Test Cases

Manual GCash request:

- Digital request creates pending row with NZ$14.95.
- Standard request creates pending row with NZ$24.95.
- Premium overnight request creates pending row with NZ$46.95.
- Missing customer email returns 400.
- Missing printed shipping address returns 400.
- Duplicate GCash reference ID returns 409.

Admin:

- Pending request appears in table.
- Approve creates exactly one promo code.
- Approving same request twice returns existing code, not a new code.
- Reject sets status and no code.
- Rejected request cannot be approved without explicit reopen logic.

Promo code:

- Correct product redeems successfully.
- Wrong product fails.
- Expired code fails.
- Used code fails.
- Customer email mismatch fails if email lock is enabled.
- Double-click redemption consumes only once.

Order creation:

- Digital paid redemption removes watermark and gives PDF access.
- Standard/premium redemption creates fulfilment queue order.
- Delivery priority matches existing `DELIVERY_OPTIONS`.
- Admin fulfilment queue still works for paid GCash orders.

Email:

- Approval email includes code, expiry, one-use warning, product name.
- Rejection email, if enabled, includes admin note.
- Email failure does not create duplicate promo code on retry.

## External References

- Stripe payment methods and Checkout payment method settings: https://docs.stripe.com/payments/checkout/payment-methods
- Stripe payment method support table: https://docs.stripe.com/payments/payment-methods/payment-method-support
- GCash QR send-money flow: https://help.gcash.com/hc/en-us/articles/900005327223-How-to-send-money-via-QR-Code
- GCash online payment flow: https://help.gcash.com/hc/en-us/articles/900006144666-How-to-pay-online-with-GCash
