// Supabase Edge Function: composio
// Real integration with Composio's connected-accounts API (v3), verified
// directly against the live Composio API before this was written — not
// built from memory/assumption. Handles three actions:
//   connect    (toolkit_slug)         -> { redirect_url }
//   status     ()                     -> { connections: [...] }
//   disconnect (connected_account_id) -> { ok: true }
//
// Every brokerage is isolated via a distinct Composio user_id
// (`realty-{brokerage_id}`), even though all of Realty OS shares one
// Composio project/API key — Composio's own user_id scoping is the
// isolation boundary here, verified against their docs before relying on
// it. The caller's brokerage_id is never trusted from the request body —
// it's resolved server-side from their auth JWT, so one brokerage can
// never query or disconnect another's integrations.
//
// Deploy:  supabase functions deploy composio
// Secrets: supabase secrets set COMPOSIO_API_KEY=...
//          (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are usually
//          auto-injected for edge functions on the same project)

// @ts-ignore Deno global is available in the Supabase Edge Function runtime
const COMPOSIO_API_KEY = Deno.env.get('COMPOSIO_API_KEY');
// @ts-ignore Deno global is available in the Supabase Edge Function runtime
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
// @ts-ignore Deno global is available in the Supabase Edge Function runtime
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const COMPOSIO_BASE = 'https://backend.composio.dev/api/v3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// Resolves the real brokerage_id for whoever is calling, from their auth
// token — never from anything the client claims in the request body.
async function resolveBrokerageId(authHeader: string): Promise<string> {
  const token = authHeader.replace('Bearer ', '');
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SERVICE_ROLE_KEY! },
  });
  if (!userRes.ok) throw new Error('Unauthenticated');
  const user = await userRes.json();
  if (!user?.id) throw new Error('Unauthenticated');

  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=brokerage_id`,
    { headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY! } }
  );
  const profiles = await profileRes.json();
  if (!profiles?.[0]?.brokerage_id) throw new Error('No profile found for this user');
  return profiles[0].brokerage_id;
}

// Reuses a cached auth_config_id for a toolkit if one already exists;
// otherwise creates it once via Composio and caches it, so repeat connects
// (by any brokerage, for the same toolkit) don't create duplicate configs.
async function getOrCreateAuthConfig(toolkitSlug: string): Promise<string> {
  const existingRes = await fetch(
    `${SUPABASE_URL}/rest/v1/composio_auth_configs?toolkit_slug=eq.${toolkitSlug}&select=auth_config_id`,
    { headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY! } }
  );
  const existing = await existingRes.json();
  if (existing?.[0]?.auth_config_id) return existing[0].auth_config_id;

  const createRes = await fetch(`${COMPOSIO_BASE}/auth_configs`, {
    method: 'POST',
    headers: { 'x-api-key': COMPOSIO_API_KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ toolkit: { slug: toolkitSlug }, auth_config: { type: 'use_composio_managed_auth' } }),
  });
  const created = await createRes.json();
  if (!created?.auth_config?.id) {
    throw new Error(`Failed to create auth config for ${toolkitSlug}: ${JSON.stringify(created)}`);
  }
  const authConfigId = created.auth_config.id;

  await fetch(`${SUPABASE_URL}/rest/v1/composio_auth_configs`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY!,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify({ toolkit_slug: toolkitSlug, auth_config_id: authConfigId }),
  });

  return authConfigId;
}

// @ts-ignore Deno.serve is available in the Supabase Edge Function runtime
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!COMPOSIO_API_KEY) throw new Error('COMPOSIO_API_KEY not configured');

    const authHeader = req.headers.get('Authorization') || '';
    const brokerageId = await resolveBrokerageId(authHeader);
    const composioUserId = `realty-${brokerageId}`;

    const { action, toolkit_slug, connected_account_id, query } = await req.json();

    if (action === 'search') {
      // Public catalog search — no toolkit-specific side effects, safe to
      // run for any authenticated Realty OS user regardless of brokerage.
      const q = (query ?? '').trim();
      const searchRes = await fetch(
        `${COMPOSIO_BASE}/toolkits${q ? `?search=${encodeURIComponent(q)}` : ''}`,
        { headers: { 'x-api-key': COMPOSIO_API_KEY } }
      );
      const data = await searchRes.json();
      const items = (data.items || []).slice(0, 24).map((t: any) => ({
        slug: t.slug,
        name: t.name,
        description: t.meta?.description ?? '',
        logo: t.meta?.logo ?? `https://logos.composio.dev/api/${t.slug}`,
        category: t.meta?.categories?.[0]?.name ?? 'other',
      }));
      return json({ items });
    }

    if (action === 'connect') {
      if (!toolkit_slug) return json({ error: 'toolkit_slug is required' }, 400);
      const authConfigId = await getOrCreateAuthConfig(toolkit_slug);
      const linkRes = await fetch(`${COMPOSIO_BASE}/connected_accounts/link`, {
        method: 'POST',
        headers: { 'x-api-key': COMPOSIO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ auth_config_id: authConfigId, user_id: composioUserId }),
      });
      const link = await linkRes.json();
      if (!link?.redirect_url) throw new Error(`Composio link failed: ${JSON.stringify(link)}`);
      return json({ redirect_url: link.redirect_url });
    }

    if (action === 'status') {
      const statusRes = await fetch(
        `${COMPOSIO_BASE}/connected_accounts?user_ids=${encodeURIComponent(composioUserId)}`,
        { headers: { 'x-api-key': COMPOSIO_API_KEY } }
      );
      const data = await statusRes.json();
      const connections = (data.items || []).map((c: any) => ({
        toolkit_slug: c.toolkit?.slug, status: c.status, connected_account_id: c.id,
      }));
      return json({ connections });
    }

    if (action === 'disconnect') {
      if (!connected_account_id) return json({ error: 'connected_account_id is required' }, 400);
      // Verify ownership before deleting — never trust the client-supplied
      // ID belongs to this brokerage without checking.
      const getRes = await fetch(`${COMPOSIO_BASE}/connected_accounts/${connected_account_id}`, {
        headers: { 'x-api-key': COMPOSIO_API_KEY },
      });
      const account = await getRes.json();
      if (account?.user_id !== composioUserId) {
        return json({ error: 'Not authorized to disconnect this account' }, 403);
      }
      await fetch(`${COMPOSIO_BASE}/connected_accounts/${connected_account_id}`, {
        method: 'DELETE',
        headers: { 'x-api-key': COMPOSIO_API_KEY },
      });
      return json({ ok: true });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    return json({ error: String((err as any)?.message ?? err) }, 500);
  }
});
