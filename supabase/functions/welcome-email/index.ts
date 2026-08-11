// Supabase Edge Function: welcome-email
// Fires a welcome email via Resend the moment someone joins a firm
// workspace — either as the founding Partner (on signup) or as an
// invited team member (on accept-invite). Fire-and-forget from the
// frontend: a failure here should never block someone from actually
// using their new account.
//
// Deploy:  supabase functions deploy welcome-email
// Secret:  supabase secrets set RESEND_API_KEY=...
//          supabase secrets set RESEND_FROM="Law OS <law@sloelabs.com>"

// @ts-ignore Deno global is available in the Supabase Edge Function runtime
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
// @ts-ignore Deno global is available in the Supabase Edge Function runtime
const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? 'Law OS <onboarding@resend.dev>';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function emailShell(bodyHtml: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f4f4f5; padding: 32px 16px;">
      <div style="max-width: 480px; margin: 0 auto; background: #0a0a0a; border-radius: 12px; overflow: hidden;">
        <div style="padding: 24px 28px; border-bottom: 1px solid rgba(255,255,255,0.08);">
          <span style="font-size: 13px; font-weight: 600; letter-spacing: 0.05em; color: #d4af37; text-transform: uppercase;">LAW OS</span>
        </div>
        <div style="padding: 28px;">
          ${bodyHtml}
        </div>
        <div style="padding: 20px 28px; border-top: 1px solid rgba(255,255,255,0.08);">
          <a href="https://law.sloelabs.com" style="display: inline-block; background: #f5f5f5; color: #0a0a0a; font-size: 13px; font-weight: 600; padding: 10px 18px; border-radius: 6px; text-decoration: none;">
            Open your workspace →
          </a>
        </div>
      </div>
      <p style="text-align: center; font-size: 11px; color: #a1a1aa; margin-top: 16px;">Law OS by Sloe Labs</p>
    </div>
  `;
}

function partnerEmailHtml(name: string, firmName: string): string {
  return emailShell(`
    <h1 style="font-size: 19px; font-weight: 600; color: #f5f5f5; margin: 0 0 12px;">Welcome to Law OS, ${name}.</h1>
    <p style="font-size: 14px; line-height: 1.6; color: #d4d4d8; margin: 0 0 12px;">
      ${firmName}'s workspace is live. You're set up as Partner, which
      means you can see your whole firm's caseload, run conflict checks,
      track deadlines, and invite your team whenever you're ready.
    </p>
    <p style="font-size: 14px; line-height: 1.6; color: #d4d4d8; margin: 0;">
      Head to the Team screen to invite your first Associate — everything
      else is ready to go.
    </p>
  `);
}

function memberEmailHtml(name: string, firmName: string, roleLabel: string): string {
  return emailShell(`
    <h1 style="font-size: 19px; font-weight: 600; color: #f5f5f5; margin: 0 0 12px;">You're in, ${name}.</h1>
    <p style="font-size: 14px; line-height: 1.6; color: #d4d4d8; margin: 0;">
      You've joined ${firmName}'s Law OS workspace as ${roleLabel}.
      Your access is scoped to what's relevant to your role — log in
      whenever you're ready to get started.
    </p>
  `);
}

// @ts-ignore Deno.serve is available in the Supabase Edge Function runtime
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');

    const { email, name, brokerageName: firmName, role } = await req.json();
    if (!email || !name || !firmName) {
      return new Response(JSON.stringify({ error: 'email, name, and brokerageName (firm name) are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const isPartner = role === 'principal';
    const roleLabels: Record<string, string> = {
      agent: 'an Associate', manager: 'a Practice Manager', paralegal: 'a Paralegal',
      billing: 'Billing', reception: 'Reception',
    };

    const subject = isPartner
      ? `${firmName}'s Law OS workspace is ready`
      : `You've joined ${firmName} on Law OS`;
    const html = isPartner
      ? partnerEmailHtml(name, firmName)
      : memberEmailHtml(name, firmName, roleLabels[role] ?? 'a team member');

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
