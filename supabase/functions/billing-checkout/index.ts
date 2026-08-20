// Supabase Edge Function: billing-checkout
// Principal-gated POST endpoint to initiate a Stripe Checkout Session
// for self-serve subscription upgrade/downgrade.

import { reportError } from '../_shared/sentry.ts';
// @ts-ignore npm specifier resolved by the Supabase Edge Function (Deno) runtime
import Stripe from 'npm:stripe@^14.0.0';

// @ts-ignore Deno global is available in the Supabase Edge Function runtime
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
// @ts-ignore Deno global is available in the Supabase Edge Function runtime
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
// @ts-ignore Deno global is available in the Supabase Edge Function runtime
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');

// @ts-ignore Deno global is available in the Supabase Edge Function runtime
const PRICE_STARTER = Deno.env.get('STRIPE_PRICE_STARTER');
// @ts-ignore Deno global is available in the Supabase Edge Function runtime
const PRICE_PRO = Deno.env.get('STRIPE_PRICE_PRO');
// @ts-ignore Deno global is available in the Supabase Edge Function runtime
const PRICE_BUSINESS = Deno.env.get('STRIPE_PRICE_BUSINESS');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function resolveCaller(authHeader: string | null): Promise<{ firmId: string; userId: string; role: string; email: string; firmName: string }> {
  if (!authHeader || !SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error('Unauthenticated');
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) throw new Error('Unauthenticated');

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SERVICE_ROLE_KEY },
  });
  if (!userRes.ok) throw new Error('Unauthenticated');
  const user = await userRes.json();
  if (!user?.id) throw new Error('Unauthenticated');

  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=firm_id,role,email,firms(name)`,
    { headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY } }
  );
  const profiles = await profileRes.json();
  const profile = profiles?.[0];
  if (!profile?.firm_id) throw new Error('Profile or firm not found');

  const firmName = profile?.firms?.name || 'Law OS Firm';
  return { firmId: profile.firm_id, userId: user.id, role: profile.role, email: profile.email || user.email, firmName };
}

function getPriceIdForPlan(plan: string): string {
  if (plan === 'starter') return PRICE_STARTER || '';
  if (plan === 'pro') return PRICE_PRO || '';
  if (plan === 'business') return PRICE_BUSINESS || '';
  throw new Error(`Invalid plan: ${plan}`);
}

// @ts-ignore Deno.serve is available in the Supabase Edge Function runtime
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!STRIPE_SECRET_KEY) {
      return json({ error: 'Stripe secret key not configured on backend' }, 500);
    }

    const authHeader = req.headers.get('Authorization');
    const caller = await resolveCaller(authHeader);

    // Principal / Manager gating check
    if (caller.role !== 'principal' && caller.role !== 'manager') {
      return json({ error: 'Only firm partners or practice managers can manage billing.' }, 403);
    }

    const { plan, callback_origin } = await req.json();
    if (!plan || !['starter', 'pro', 'business'].includes(plan)) {
      return json({ error: 'Valid plan (starter, pro, business) is required' }, 400);
    }

    const priceId = getPriceIdForPlan(plan);
    if (!priceId) {
      return json({ error: `Stripe Price ID for ${plan} plan is not configured` }, 400);
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

    // Fetch firm_billing row
    const billingRes = await fetch(
      `${SUPABASE_URL}/rest/v1/firm_billing?firm_id=eq.${caller.firmId}&select=*`,
      { headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY } }
    );
    const billings = await billingRes.json();
    let currentBilling = billings?.[0];

    let customerId = currentBilling?.stripe_customer_id || null;

    // Verify existing customer ID is still valid in Stripe (handles stale customer IDs)
    if (customerId) {
      try {
        const existingCust = await stripe.customers.retrieve(customerId);
        if (existingCust.deleted) {
          customerId = null;
        }
      } catch (err: any) {
        console.warn(`[billing-checkout] Stale customer ID ${customerId} for firm ${caller.firmId}:`, err.message);
        customerId = null;
      }
    }

    // Create new Stripe Customer if missing or stale
    if (!customerId) {
      const newCustomer = await stripe.customers.create({
        email: caller.email,
        name: caller.firmName,
        metadata: { firm_id: caller.firmId, user_id: caller.userId },
      });
      customerId = newCustomer.id;

      // Upsert firm_billing
      await fetch(`${SUPABASE_URL}/rest/v1/firm_billing`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          apikey: SERVICE_ROLE_KEY,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          firm_id: caller.firmId,
          stripe_customer_id: customerId,
          updated_at: new Date().toISOString(),
        }),
      });
    }

    const ALLOWED_ORIGINS = ['https://law.sloelabs.com', 'http://localhost:3000'];
    const requested = typeof callback_origin === 'string' ? callback_origin : '';
    const origin = ALLOWED_ORIGINS.includes(requested) ? requested : ALLOWED_ORIGINS[0];

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/settings?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/settings?billing=canceled`,
      metadata: {
        firm_id: caller.firmId,
        user_id: caller.userId,
        plan,
      },
    });

    return json({ url: session.url });
  } catch (err) {
    console.error('[billing-checkout] Error:', String((err as Error)?.message ?? err));
    await reportError(err, { functionName: 'billing-checkout' });
    return json({ error: String((err as any)?.message ?? err) }, 500);
  }
});
