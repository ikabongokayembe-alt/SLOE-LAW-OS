// Supabase Edge Function: billing-pricing
// Returns active plan pricing pulled live from Stripe Price objects
// so the UI always reflects what gets charged.

import { reportError } from '../_shared/sentry.ts';
// @ts-ignore npm specifier resolved by the Supabase Edge Function (Deno) runtime
import Stripe from 'npm:stripe@^14.0.0';

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

export type PlanPrice = {
  id: string;
  name: string;
  planKey: 'starter' | 'pro' | 'business';
  monthlyCents: number;
  currency: string;
  priceId: string | null;
  features: string[];
};

const DEFAULT_PLANS: PlanPrice[] = [
  {
    id: 'starter',
    name: 'Starter',
    planKey: 'starter',
    monthlyCents: 4900,
    currency: 'usd',
    priceId: PRICE_STARTER || null,
    features: [
      'Up to 3 Active Matters',
      'Deterministic Conflict Checking',
      'AI Operator & Chat Turn Assistance',
      'Standard Document Extraction & Search',
      'Standard Email & Calendar Actions',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    planKey: 'pro',
    monthlyCents: 14900,
    currency: 'usd',
    priceId: PRICE_PRO || null,
    features: [
      'Unlimited Active Matters',
      'Advanced Multi-Party Conflict Graphs',
      'Full Specialist AI Agents & Context Assembly',
      'High-Priority Document OCR & Storage',
      'Unlimited Composio Tool Executions',
      'Firm Usage & Margin Cost Tracking',
    ],
  },
  {
    id: 'business',
    name: 'Business',
    planKey: 'business',
    monthlyCents: 39900,
    currency: 'usd',
    priceId: PRICE_BUSINESS || null,
    features: [
      'All Pro Features Included',
      'Dedicated Operator Network Routing',
      'Custom Multi-Branch Firm Workspaces',
      'SLA Guarantee & Dedicated Support',
      'Custom API & Webhook Integrations',
    ],
  },
];

// @ts-ignore Deno.serve is available in the Supabase Edge Function runtime
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const plans = [...DEFAULT_PLANS];

    if (STRIPE_SECRET_KEY) {
      const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
      for (const p of plans) {
        if (p.priceId) {
          try {
            const stripePrice = await stripe.prices.retrieve(p.priceId);
            if (stripePrice && typeof stripePrice.unit_amount === 'number') {
              p.monthlyCents = stripePrice.unit_amount;
              p.currency = stripePrice.currency || 'usd';
            }
          } catch (err) {
            console.warn(`[billing-pricing] Failed to retrieve live price ${p.priceId} from Stripe:`, (err as Error).message);
          }
        }
      }
    }

    return json({ plans });
  } catch (err) {
    console.error('[billing-pricing] Failed to fetch pricing:', String((err as Error)?.message ?? err));
    await reportError(err, { functionName: 'billing-pricing' });
    return json({ error: 'Failed to fetch pricing' }, 500);
  }
});
