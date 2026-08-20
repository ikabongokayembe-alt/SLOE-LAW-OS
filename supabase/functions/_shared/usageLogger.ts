// Helper for writing usage_events asynchronously from Supabase Edge Functions
// using the service-role REST client.

// @ts-ignore Deno global is available in the Supabase Edge Function runtime
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
// @ts-ignore Deno global is available in the Supabase Edge Function runtime
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

export type UsageEventPayload = {
  firmId?: string | null;
  userId?: string | null;
  eventType: string;
  eventData: Record<string, any>;
};

export async function logUsageEvent(payload: UsageEventPayload): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.warn('[usageLogger] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not available, skipping event write');
    return;
  }

  try {
    const body = {
      firm_id: payload.firmId || null,
      user_id: payload.userId || null,
      event_type: payload.eventType,
      event_data: payload.eventData || {},
    };

    const res = await fetch(`${SUPABASE_URL}/rest/v1/usage_events`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error(`[usageLogger] Failed to write usage_events row (${res.status}): ${await res.text()}`);
    }
  } catch (err) {
    console.error('[usageLogger] Exception while writing usage_events row:', String((err as Error)?.message ?? err));
  }
}
