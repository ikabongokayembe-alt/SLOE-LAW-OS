// Supabase Edge Function: agent-request-notify
// REPURPOSED from its original review-queue design (a row used to sit
// waiting for someone at ops to act on it). That model is gone — agents
// now activate instantly on request, no human gate on whether one exists
// (see src/lib/store.tsx's requestAgent + AgentLibraryScreen). This
// function is no longer part of that flow in any blocking sense: it
// fires AFTER the row is already inserted and the agent is already live,
// purely as a passive ops log ("a firm just turned on X"), same
// fire-and-forget pattern as welcome-email. It is never awaited in a way
// that could delay or gate activation, and its failure has zero effect
// on whether the agent is usable — it already is, before this even runs.
//
// Deploy: supabase functions deploy agent-request-notify
// Secrets: supabase secrets set RESEND_API_KEY=...           (already live)
//          supabase secrets set RESEND_FROM="Law OS <...>"   (already live)
//          supabase secrets set AGENT_REQUEST_NOTIFY_EMAIL=... (NOT SET YET —
//            the address ops actually monitors; this function refuses to
//            send without it rather than guessing or defaulting to a
//            placeholder address)
//
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are auto-injected into every
// edge function by the platform — same pattern as reset-demo — used here
// only to independently verify the request row exists (never trust an
// unauthenticated body blindly) and to stamp notified_at after a
// successful send, since the requesting user's own session may not have
// UPDATE rights on agent_requests.
//
//          supabase secrets set SENTRY_DSN=...  (error monitoring — see _shared/sentry.ts; optional, no-ops if unset)

// @ts-ignore Deno global is available in the Supabase Edge Function runtime
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { reportError } from '../_shared/sentry.ts';

// @ts-ignore Deno global is available in the Supabase Edge Function runtime
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
// @ts-ignore Deno global is available in the Supabase Edge Function runtime
const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? 'Law OS <onboarding@resend.dev>';
// @ts-ignore Deno global is available in the Supabase Edge Function runtime
const NOTIFY_EMAIL = Deno.env.get('AGENT_REQUEST_NOTIFY_EMAIL');

// @ts-ignore Deno global is available in the Supabase Edge Function runtime
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
// @ts-ignore Deno global is available in the Supabase Edge Function runtime
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 'contract_review' -> 'Contract Review' — good enough for an internal
// ops notification; the user-facing catalog labels live in
// AgentLibraryScreen.tsx and aren't duplicated here for one word of polish.
function titleCase(key: string): string {
  return key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function emailHtml(opts: { firmName: string; agentLabel: string; requesterName: string; requesterRole: string }): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f4f4f5; padding: 32px 16px;">
      <div style="max-width: 480px; margin: 0 auto; background: #0a0a0a; border-radius: 12px; overflow: hidden;">
        <div style="padding: 24px 28px; border-bottom: 1px solid rgba(255,255,255,0.08);">
          <span style="font-size: 13px; font-weight: 600; letter-spacing: 0.05em; color: #d4af37; text-transform: uppercase;">LAW OS — AGENT ACTIVATED</span>
        </div>
        <div style="padding: 28px;">
          <h1 style="font-size: 19px; font-weight: 600; color: #f5f5f5; margin: 0 0 12px;">${opts.agentLabel} is now active</h1>
          <p style="font-size: 14px; line-height: 1.6; color: #d4d4d8; margin: 0 0 12px;">
            <strong>${opts.requesterName}</strong> (${opts.requesterRole}) at <strong>${opts.firmName}</strong> just self-activated the ${opts.agentLabel}. It's already live in their sidebar — no action needed from you.
          </p>
          <p style="font-size: 14px; line-height: 1.6; color: #d4d4d8; margin: 0;">
            This is a passive activity log, not a task queue.
          </p>
        </div>
      </div>
    </div>
  `;
}

// @ts-ignore Deno.serve is available in the Supabase Edge Function runtime
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');
    if (!NOTIFY_EMAIL) throw new Error('AGENT_REQUEST_NOTIFY_EMAIL not configured — set the real ops address before this can send');
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured');

    const { requestId, firmName, requesterName, requesterRole } = await req.json();
    if (!requestId || !firmName || !requesterName) {
      return new Response(JSON.stringify({ error: 'requestId, firmName, and requesterName are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Verify the row actually exists and pull the canonical agent_key —
    // never trust the request body alone for what gets emailed.
    const { data: row, error: fetchError } = await admin
      .from('agent_requests')
      .select('id, agent_key, notified_at')
      .eq('id', requestId)
      .single();
    if (fetchError || !row) {
      return new Response(JSON.stringify({ error: 'agent_requests row not found for that id' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const agentLabel = titleCase(row.agent_key);
    const html = emailHtml({ firmName, agentLabel, requesterName, requesterRole: requesterRole || 'team member' });

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: RESEND_FROM, to: NOTIFY_EMAIL, subject: `Agent activated: ${agentLabel} — ${firmName}`, html }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Resend ${res.status}: ${errText}`);
    }

    // Stamp notified_at only after Resend actually confirmed acceptance —
    // a stamp here means "we're confident this went out," not "we tried."
    const { error: updateError } = await admin
      .from('agent_requests')
      .update({ notified_at: new Date().toISOString() })
      .eq('id', requestId);
    if (updateError) {
      // The email genuinely sent; failing to stamp is a lesser problem
      // than double-reporting a failure. Log and still return success.
      console.error('[agent-request-notify] email sent but notified_at stamp failed:', updateError);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    // Non-fatal by design from the caller's side (see store.tsx) — this
    // response body is for logs/debugging, not shown to the requester.
    console.error('[agent-request-notify] failed:', String((err as Error)?.message ?? err));
    await reportError(err, { functionName: 'agent-request-notify' });
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
