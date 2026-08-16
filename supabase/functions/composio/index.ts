// Supabase Edge Function: composio
// Real integration with Composio's connected-accounts API (v3), verified
// directly against the live Composio API before this was written — not
// built from memory/assumption. Handles:
//   connect              (toolkit_slug)                             -> { redirect_url }
//   status                ()                                        -> { connections: [...] }
//   disconnect            (connected_account_id)                    -> { ok: true }
//   search                (query)                                   -> { items: [...] }
//   push_deadline_to_calendar (title, due_date, matter_title)       -> { event_id }
//   send_matter_email     (matter_id, sent_to, subject, body)       -> { ok: true, communication }
//
// The last two actually USE a connected Gmail/Calendar account (Calendar
// + email integration, pass 1 — see migration 0015). Both are deliberately
// narrow, fixed-tool actions rather than a generic "execute any tool with
// any arguments" passthrough: letting the client pick which Composio tool
// runs against the firm's connected account would let a compromised
// client session do far more than "push this deadline" or "send this
// email" through the same connection. Each pushes/sends through Composio's
// tools/execute endpoint against a specific, verified-ACTIVE connected
// account for that firm — never a client-supplied connected_account_id.
//
// Every firm is isolated via a distinct Composio user_id
// (`law-{firm_id}`), even though all of Law OS shares one Composio
// project/API key — Composio's own user_id scoping is the isolation
// boundary here, verified against their docs before relying on it. The
// caller's firm_id is never trusted from the request body — it's
// resolved server-side from their auth JWT, so one firm can never query,
// disconnect, or send/push through another's integrations.
//
// Deploy:  supabase functions deploy composio
// Secrets: supabase secrets set COMPOSIO_API_KEY=...
//          (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are usually
//          auto-injected for edge functions on the same project)
//          supabase secrets set SENTRY_DSN=...  (error monitoring — see _shared/sentry.ts; optional, no-ops if unset)

import { reportError } from '../_shared/sentry.ts';

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

// Resolves the real firm_id (and user id, for attribution — e.g.
// matter_communications.sent_by) for whoever is calling, from their auth
// token — never from anything the client claims in the request body.
async function resolveCaller(authHeader: string): Promise<{ firmId: string; userId: string }> {
  const token = authHeader.replace('Bearer ', '');
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SERVICE_ROLE_KEY! },
  });
  if (!userRes.ok) throw new Error('Unauthenticated');
  const user = await userRes.json();
  if (!user?.id) throw new Error('Unauthenticated');

  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=firm_id`,
    { headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY! } }
  );
  const profiles = await profileRes.json();
  if (!profiles?.[0]?.firm_id) throw new Error('No profile found for this user');
  return { firmId: profiles[0].firm_id, userId: user.id };
}

// Looks up the firm's own ACTIVE connected account for a toolkit —
// scoped to composioUserId, so this can never return another firm's
// connection. Returns null (not an error) if not connected, so callers
// can surface a clear "not connected" message rather than a generic
// failure.
async function getActiveConnectedAccountId(composioUserId: string, toolkitSlug: string): Promise<string | null> {
  const statusRes = await fetch(
    `${COMPOSIO_BASE}/connected_accounts?user_ids=${encodeURIComponent(composioUserId)}`,
    { headers: { 'x-api-key': COMPOSIO_API_KEY! } }
  );
  const data = await statusRes.json();
  const match = (data.items || []).find((c: any) => c.toolkit?.slug === toolkitSlug && c.status === 'ACTIVE');
  return match?.id ?? null;
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
    const { firmId, userId } = await resolveCaller(authHeader);
    const composioUserId = `law-${firmId}`;

    const {
      action, toolkit_slug, connected_account_id, query, callback_origin,
      title, due_date, matter_title,
      matter_id, sent_to, subject, body: emailBody,
    } = await req.json();

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
      // Without a callback_url, Composio's hosted page ends at "you can
      // close this window" and the user has to find their way back by
      // hand. The origin comes from the caller, but is checked against an
      // allowlist before use: this value is handed to the provider as a
      // post-OAuth redirect target, so accepting whatever the client
      // sends would make it an open redirect.
      const ALLOWED_ORIGINS = ['https://law.sloelabs.com', 'http://localhost:3000'];
      const requested = typeof callback_origin === 'string' ? callback_origin : '';
      const origin = ALLOWED_ORIGINS.includes(requested) ? requested : ALLOWED_ORIGINS[0];
      const callbackUrl = `${origin}/integrations?connected=${encodeURIComponent(toolkit_slug)}`;
      const linkRes = await fetch(`${COMPOSIO_BASE}/connected_accounts/link`, {
        method: 'POST',
        headers: { 'x-api-key': COMPOSIO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auth_config_id: authConfigId,
          user_id: composioUserId,
          callback_url: callbackUrl,
        }),
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

      // Composio returns EVERY connection attempt ever made for this
      // user, not the current one per toolkit. A Gmail that was
      // connected, expired, and then reconnected comes back as two or
      // three rows with the same toolkit slug. This previously mapped
      // them straight through, and the caller did
      // `connections.find(c => c.toolkit_slug === slug)` — first match in
      // whatever order Composio happened to return. When a stale EXPIRED
      // row sorted ahead of the live ACTIVE one, a genuinely working
      // integration displayed as "Access expired — reconnect", which is
      // exactly the bug this fixes. Reported live on a real Gmail
      // account whose OAuth had just succeeded.
      //
      // Collapse to ONE row per toolkit: an ACTIVE connection always
      // wins, and among rows of equal standing the most recent wins.
      // Deliberately not a full status ranking — inventing an ordering
      // over vendor statuses we do not control would be guessing. The
      // only claim made here is that a live connection beats a dead one
      // and newer beats older.
      const timeOf = (c: any): number => {
        const t = c.updated_at ?? c.updatedAt ?? c.created_at ?? c.createdAt;
        const n = t ? new Date(t).getTime() : NaN;
        return Number.isFinite(n) ? n : 0;
      };
      const best = new Map<string, any>();
      for (const c of (data.items || [])) {
        const slug = c.toolkit?.slug;
        if (!slug) continue;
        const prev = best.get(slug);
        if (!prev) { best.set(slug, c); continue; }
        const cActive = c.status === 'ACTIVE';
        const pActive = prev.status === 'ACTIVE';
        if (cActive !== pActive) { if (cActive) best.set(slug, c); continue; }
        if (timeOf(c) > timeOf(prev)) best.set(slug, c);
      }

      const connections = [...best.values()].map((c: any) => ({
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

    if (action === 'push_deadline_to_calendar') {
      if (!title || !due_date) return json({ error: 'title and due_date are required' }, 400);
      const connectedAccountId = await getActiveConnectedAccountId(composioUserId, 'googlecalendar');
      if (!connectedAccountId) {
        return json({ error: 'Google Calendar is not connected for this firm. Connect it from Integrations first.' }, 400);
      }
      // Deadlines only carry a due DATE, not a time — a fixed 9:00-9:30am
      // slot on that date is a deliberate, simple default (not an
      // all-day event) rather than guessing at a meaningful time.
      const description = matter_title
        ? `Pushed from Law OS — matter: ${matter_title}`
        : 'Pushed from Law OS.';
      // firms has no timezone column (only locale/country, see migration
      // 0007 — locale like 'en-US' doesn't reliably map to an IANA zone),
      // so there's nothing per-firm to pull yet. Without an explicit zone,
      // Google interpreted the naive datetime as UTC and displayed the
      // event 5 hours off from the intended 9am — confirmed via a live
      // push (debug_raw showed the correct event, just shifted). Hardcoding
      // a single default zone until real per-firm timezone data exists.
      const CALENDAR_TIMEZONE = 'America/Chicago';
      const execRes = await fetch(`${COMPOSIO_BASE}/tools/execute/GOOGLECALENDAR_CREATE_EVENT`, {
        method: 'POST',
        headers: { 'x-api-key': COMPOSIO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: composioUserId,
          connected_account_id: connectedAccountId,
          arguments: {
            summary: title,
            description,
            start_datetime: `${due_date}T09:00:00`,
            end_datetime: `${due_date}T09:30:00`,
            timezone: CALENDAR_TIMEZONE,
          },
        }),
      });
      const exec = await execRes.json();
      if (!exec?.successful) {
        return json({ error: exec?.error || 'Google Calendar rejected the event.' }, 400);
      }
      // Confirmed via a live push (debug_raw) — the actual event resource
      // Composio returns for GOOGLECALENDAR_CREATE_EVENT is nested under
      // data.response_data, not directly on data. data.id/data.event_id
      // were never populated, which is why every prior push silently fell
      // through to the 'pushed' fallback marker instead of a real id.
      const eventId = exec?.data?.response_data?.id ?? exec?.data?.id ?? exec?.data?.event_id ?? exec?.data?.eventId ?? 'pushed';
      return json({ event_id: eventId });
    }

    if (action === 'send_matter_email') {
      if (!matter_id || !sent_to || !subject || !emailBody) {
        return json({ error: 'matter_id, sent_to, subject, and body are required' }, 400);
      }
      const connectedAccountId = await getActiveConnectedAccountId(composioUserId, 'gmail');
      if (!connectedAccountId) {
        return json({ error: 'Gmail is not connected for this firm. Connect it from Integrations first.' }, 400);
      }
      const execRes = await fetch(`${COMPOSIO_BASE}/tools/execute/GMAIL_SEND_EMAIL`, {
        method: 'POST',
        headers: { 'x-api-key': COMPOSIO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: composioUserId,
          connected_account_id: connectedAccountId,
          arguments: { recipient_email: sent_to, subject, body: emailBody, is_html: false },
        }),
      });
      const exec = await execRes.json();
      if (!exec?.successful) {
        return json({ error: exec?.error || 'Gmail rejected the message.' }, 400);
      }

      // Log the send in the same request as the send itself — never as a
      // separate client-side write — so there's no window where an email
      // actually went out through Gmail but the retrievable record of it
      // doesn't exist because a later step (e.g. a dropped connection)
      // failed.
      const logRes = await fetch(`${SUPABASE_URL}/rest/v1/matter_communications`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY!,
          'Content-Type': 'application/json', Prefer: 'return=representation',
        },
        body: JSON.stringify({ firm_id: firmId, matter_id, sent_to, subject, body: emailBody, sent_by: userId }),
      });
      const logged = await logRes.json();
      if (!logRes.ok) {
        console.error('[composio] email sent but logging the record failed:', logged);
        await reportError(new Error(`matter_communications log failed: ${JSON.stringify(logged)}`), { functionName: 'composio', extra: { action: 'send_matter_email' } });
        return json({ ok: true, communication: null, warning: 'Email sent, but saving the record failed — it may not show up on the matter.' });
      }
      return json({ ok: true, communication: logged[0] });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error('[composio] failed:', String((err as Error)?.message ?? err));
    await reportError(err, { functionName: 'composio' });
    return json({ error: String((err as any)?.message ?? err) }, 500);
  }
});
