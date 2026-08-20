// Supabase Edge Function: billing-portal
// Principal-gated POST endpoint to generate a Stripe Billing Portal Session URL
// so firm principals can self-manage invoices, payment methods, and cancellations.

import { reportError } from '../_shared/sentry.ts';
// @ts-ignore npm specifier resolved by the Supabase Edge Function (Deno) runtime
import Stripe from 'npm:stripe@^14.0.0';

// @ts-ignore Deno global is available in the Supabase Edge Function runtime
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
// @ts-ignore Deno global is available in the Supabase Edge Function runtime
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
// @ts-ignore Deno global is available in the Supabase Edge Function runtime
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function resolveCaller(authHeader: string | null): Promise<{ firmId: string; userId: string; role: string }> {
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
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=firm_id,role`,
    { headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY } }
  );
  const profiles = await profileRes.json();
  const profile = profiles?.[0];
  if (!profile?.firm_id) throw new Error('Profile or firm not found');

  return { firmId: profile.firm_id, userId: user.id, role: profile.role };
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

    if (caller.role !== 'principal' && caller.role !== 'manager') {
      return json({ error: 'Only firm partners or practice managers can manage billing.' }, 403);
    }

    const { callback_origin } = await req.json().catch(() => ({}));

    // Retrieve firm_billing
    const billingRes = await fetch(
      `${SUPABASE_URL}/rest/v1/firm_billing?firm_id=eq.${caller.firmId}&select=stripe_customer_id`,
      { headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY } }
    );
    const billings = await billingRes.json();
    const customerId = billings?.[0]?.stripe_customer_id;

    if (!customerId) {
      return json({ error: 'No active subscription or payment account found for this firm.' }, 400);
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

    const ALLOWED_ORIGINS = ['https://law.sloelabs.com', 'http://localhost:3000'];
    const requested = typeof callback_origin === 'string' ? callback_origin : '';
    const origin = ALLOWED_ORIGINS.includes(requested) ? requested : ALLOWED_ORIGINS[0];

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/settings`,
    });

    return json({ url: session.url });
  } catch (err) {
    console.error('[billing-portal] Error:', String((err as Error)?.message ?? err));
    await reportError(err, { functionName: 'billing-portal' });
    return json({ error: String((err as any)?.message ?? err) }, 500);
  }
});
