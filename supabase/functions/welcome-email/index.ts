// Supabase Edge Function: welcome-email
// Fires a welcome email via Resend the moment someone joins a brokerage
// workspace — either as the founding Principal (on signup) or as an
// invited team member (on accept-invite). Same pattern as the Sloe AI
// Network welcome email pipeline (RESEND_API_KEY secret, Resend API).
// Fire-and-forget from the frontend: a failure here should never block
// someone from actually using their new account.
//
// Deploy:  supabase functions deploy welcome-email
// Secret:  supabase secrets set RESEND_API_KEY=...
//          supabase secrets set RESEND_FROM="Realty OS <realty@sloelabs.com>"
//          (RESEND_FROM must be a domain verified in your Resend account —
//          reuse whatever domain Sloe AI Network's welcome pipeline uses if
//          that's already verified, rather than a fresh one.)

// @ts-ignore Deno global is available in the Supabase Edge Function runtime
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
// @ts-ignore Deno global is available in the Supabase Edge Function runtime
const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? 'Realty OS <onboarding@resend.dev>';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function principalEmailHtml(name: string, brokerageName: string): string {
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; color: #0a0a0a;">
      <h1 style="font-size: 20px; font-weight: 600;">Welcome to Realty OS, ${name}.</h1>
      <p style="font-size: 14px; line-height: 1.6; color: #444;">
        ${brokerageName}'s workspace is live. You're set up as Principal, which
        means you can see your whole team's pipeline, manage listings and
        campaigns, and invite your agents whenever you're ready.
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #444;">
        Head to the Team screen to invite your first agent — everything else
        is ready to go.
      </p>
    </div>
  `;
}

function memberEmailHtml(name: string, brokerageName: string, roleLabel: string): string {
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; color: #0a0a0a;">
      <h1 style="font-size: 20px; font-weight: 600;">You're in, ${name}.</h1>
      <p style="font-size: 14px; line-height: 1.6; color: #444;">
        You've joined ${brokerageName}'s Realty OS workspace as ${roleLabel}.
        Your access is scoped to what's relevant to your role — log in
        whenever you're ready to get started.
      </p>
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

    const { email, name, brokerageName, role } = await req.json();
    if (!email || !name || !brokerageName) {
      return new Response(JSON.stringify({ error: 'email, name, and brokerageName are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const isPrincipal = role === 'principal';
    const roleLabels: Record<string, string> = {
      agent: 'an Agent', manager: 'a Manager', listings_coordinator: 'a Listings Coordinator',
      campaign_coordinator: 'a Campaign Coordinator', reception: 'Reception',
    };

    const subject = isPrincipal
      ? `${brokerageName}'s Realty OS workspace is ready`
      : `You've joined ${brokerageName} on Realty OS`;
    const html = isPrincipal
      ? principalEmailHtml(name, brokerageName)
      : memberEmailHtml(name, brokerageName, roleLabels[role] ?? 'a team member');

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: RESEND_FROM, to: email, subject, html }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Resend ${res.status}: ${errText}`);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    // Non-fatal by design — the caller (auth.tsx) fires this without
    // awaiting/blocking navigation, so an email failure never stops
    // someone from using their new account.
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
