import { supabase } from './supabase';

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export type PlanKey = 'trial' | 'starter' | 'pro' | 'business';
export type BillingStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid';

export interface FirmBillingRecord {
  id: string;
  firm_id: string;
  plan: PlanKey;
  billing_status: BillingStatus;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PricingPlan {
  id: string;
  name: string;
  planKey: 'starter' | 'pro' | 'business';
  monthlyCents: number;
  currency: string;
  priceId: string | null;
  features: string[];
}

async function getAuthHeader(): Promise<string> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) return `Bearer ${token}`;
  } catch {
    // ignore
  }
  return `Bearer ${ANON}`;
}

export async function fetchPricingPlans(): Promise<PricingPlan[]> {
  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/billing-pricing`, {
      headers: { apikey: ANON },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.plans || [];
  } catch (err) {
    console.warn('[billing] Failed to fetch live pricing from Edge Function, returning defaults:', err);
    return [
      {
        id: 'starter',
        name: 'Starter',
        planKey: 'starter',
        monthlyCents: 4900,
        currency: 'usd',
        priceId: null,
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
        priceId: null,
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
        priceId: null,
        features: [
          'All Pro Features Included',
          'Dedicated Operator Network Routing',
          'Custom Multi-Branch Firm Workspaces',
          'SLA Guarantee & Dedicated Support',
          'Custom API & Webhook Integrations',
        ],
      },
    ];
  }
}

export async function fetchFirmBillingStatus(firmId: string): Promise<FirmBillingRecord | null> {
  if (!firmId) return null;
  const { data, error } = await supabase
    .from('firm_billing')
    .select('*')
    .eq('firm_id', firmId)
    .maybeSingle();

  if (error) {
    console.warn('[billing] Error fetching firm_billing row:', error.message);
    return null;
  }

  return (data as FirmBillingRecord) || null;
}

export async function createCheckoutSession(plan: 'starter' | 'pro' | 'business'): Promise<string> {
  const authHeader = await getAuthHeader();
  const res = await fetch(`${SUPA_URL}/functions/v1/billing-checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
      apikey: ANON,
    },
    body: JSON.stringify({
      plan,
      callback_origin: window.location.origin,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to initiate checkout session');
  }

  return data.url;
}

export async function createPortalSession(): Promise<string> {
  const authHeader = await getAuthHeader();
  const res = await fetch(`${SUPA_URL}/functions/v1/billing-portal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
      apikey: ANON,
    },
    body: JSON.stringify({
      callback_origin: window.location.origin,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to open billing portal');
  }

  return data.url;
}
