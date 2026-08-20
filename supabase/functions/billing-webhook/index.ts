// Supabase Edge Function: billing-webhook
// Unauthenticated endpoint for processing live Stripe webhooks.
// Reads raw unparsed body for signature verification.
// Syncs `firm_billing` table state on checkout completion, subscription update, and cancellation.

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
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function upsertFirmBilling(data: {
  firm_id: string;
  plan?: string;
  billing_status: string;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
}) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return;

  const payload: Record<string, any> = {
    firm_id: data.firm_id,
    billing_status: data.billing_status,
    updated_at: new Date().toISOString(),
  };

  if (data.plan) payload.plan = data.plan;
  if (data.stripe_customer_id) payload.stripe_customer_id = data.stripe_customer_id;
  if (data.stripe_subscription_id) payload.stripe_subscription_id = data.stripe_subscription_id;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/firm_billing`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[billing-webhook] Failed to upsert firm_billing row (${res.status}): ${text}`);
    throw new Error(`DB upsert failed: ${text}`);
  }
}

async function findFirmIdByCustomerId(customerId: string): Promise<string | null> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !customerId) return null;

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/firm_billing?stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=firm_id`,
    { headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY } }
  );
  const data = await res.json();
  return data?.[0]?.firm_id || null;
}

// @ts-ignore Deno.serve is available in the Supabase Edge Function runtime
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
      console.error('[billing-webhook] Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET');
      return json({ error: 'Webhook secret not configured' }, 500);
    }

    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      return json({ error: 'Missing stripe-signature header' }, 400);
    }

    // Must read unparsed raw text body for Stripe signature verification
    const rawBody = await req.text();
    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(rawBody, signature, STRIPE_WEBHOOK_SECRET);
    } catch (err: any) {
      console.error('[billing-webhook] Signature verification failed:', err.message);
      return json({ error: `Webhook signature verification failed: ${err.message}` }, 400);
    }

    console.log(`[billing-webhook] Processing event: ${event.type} (ID: ${event.id})`);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const firmId = session.metadata?.firm_id;
        const plan = session.metadata?.plan || 'starter';
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;

        if (!firmId) {
          console.error(`[billing-webhook] LOUD WARNING: checkout.session.completed event missing metadata.firm_id! Session ID: ${session.id}`);
          break;
        }

        console.log(`[billing-webhook] Checkout completed for firm ${firmId}: plan=${plan}, customer=${customerId}, sub=${subscriptionId}`);
        await upsertFirmBilling({
          firm_id: firmId,
          plan,
          billing_status: 'active',
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
        });
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
        const firmId = sub.metadata?.firm_id || (customerId ? await findFirmIdByCustomerId(customerId) : null);

        if (!firmId) {
          console.warn(`[billing-webhook] Could not resolve firm_id for subscription update. Sub ID: ${sub.id}, customer: ${customerId}`);
          break;
        }

        const rawStatus = sub.status;
        let billing_status = 'active';
        if (rawStatus === 'trialing') billing_status = 'trialing';
        else if (rawStatus === 'past_due') billing_status = 'past_due';
        else if (rawStatus === 'canceled' || rawStatus === 'unpaid') billing_status = 'canceled';

        console.log(`[billing-webhook] Subscription updated for firm ${firmId}: status=${billing_status}`);
        await upsertFirmBilling({
          firm_id: firmId,
          billing_status,
          stripe_customer_id: customerId,
          stripe_subscription_id: sub.id,
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
        const firmId = sub.metadata?.firm_id || (customerId ? await findFirmIdByCustomerId(customerId) : null);

        if (!firmId) {
          console.warn(`[billing-webhook] Could not resolve firm_id for deleted subscription. Sub ID: ${sub.id}`);
          break;
        }

        console.log(`[billing-webhook] Subscription deleted for firm ${firmId}. Reverting plan to trial, status to canceled.`);
        // Revert plan to trial and status to canceled so firm is never left in a stale paid state
        await upsertFirmBilling({
          firm_id: firmId,
          plan: 'trial',
          billing_status: 'canceled',
          stripe_customer_id: customerId,
          stripe_subscription_id: sub.id,
        });
        break;
      }

      default:
        console.log(`[billing-webhook] Ignored unhandled event type: ${event.type}`);
        break;
    }

    return json({ received: true });
  } catch (err) {
    console.error('[billing-webhook] Exception:', String((err as Error)?.message ?? err));
    await reportError(err, { functionName: 'billing-webhook' });
    return json({ error: String((err as any)?.message ?? err) }, 500);
  }
});
