'use strict';

// ============================================================
// AUTOMATIC MAILING LIST CAPTURE (new_changes.md Step 8)
// Every completed direct-consumer purchase is added to a marketing
// contacts table automatically, with zero manual export step. No
// external platform (Mailchimp/Klaviyo) has been named by the client
// yet, so this captures into a dedicated `marketing_contacts` table —
// useful regardless of which platform is chosen later — keyed by a
// unique lowercased email so a repeat customer updates their existing
// row instead of creating a duplicate.
//
// Requires src/db.phase5.sql to have been run. If it hasn't been run
// yet, this fails silently (logged, not thrown) rather than blocking
// the checkout/order-completion flow it's called from — the same
// non-critical-side-effect pattern already used for admin emails.
//
// `consented` reflects the real opt-in checkbox at checkout (see
// public-checkout.js), gated by the Privacy Policy it links to
// (new_changes.md Step 18) — not a hardcoded assumption.
// ============================================================

async function captureMarketingContact(supabase, { email, name, source, consented = true }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || !supabase) return null;

  try {
    const { data, error } = await supabase
      .from('marketing_contacts')
      .upsert({
        email: normalizedEmail,
        name: name || null,
        source: source || 'public_checkout',
        consented: Boolean(consented),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'email' })
      .select('*')
      .single();

    if (error) {
      console.warn('Marketing contact capture skipped:', error.message);
      return null;
    }
    return data;
  } catch (error) {
    console.warn('Marketing contact capture skipped:', error.message);
    return null;
  }
}

module.exports = { captureMarketingContact };
