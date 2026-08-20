// Supabase Edge Function: support-request-notify
// Dispatches an email notification to the Law OS support team when a customer
// submits a support request. Logs clearly if Resend API key / support email is missing.

import { reportError } from '../_shared/sentry.ts';

// @ts-ignore Deno global is available in the Supabase Edge Function runtime
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
// @ts-ignore Deno global is available in the Supabase Edge Function runtime
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
// @ts-ignore Deno global is available in the Supabase Edge Function runtime
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
// @ts-ignore Deno global is available in the Supabase Edge Function runtime
const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? 'Law OS Support <law@sloelabs.com>';
// @ts-ignore Deno global is available in the Supabase Edge Function runtime
const SUPPORT_EMAIL = Deno.env.get('SUPPORT_EMAIL') ?? 'reports@sloelabs.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function resolveCaller(authHeader: string | null): Promise<{ firmId: string | null; userId: string; email: string; name: string; firmName: string; role: string }> {
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
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=firm_id,role,name,email,firms(name)`,
    { headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY } }
  );
  const profiles = await profileRes.json();
  const profile = profiles?.[0];

  const firmName = profile?.firms?.name || 'Unknown Firm';
  const name = profile?.name || user.email || 'Workspace User';
  const email = profile?.email || user.email || 'unknown@sloelaw.com';
  const firmId = profile?.firm_id || null;
  const role = profile?.role || 'staff';

  return { firmId, userId: user.id, email, name, firmName, role };
}

function supportEmailHtml(caller: { name: string; email: string; firmName: string; role: string }, requestId: string, subject: string, message: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f4f4f5; padding: 32px 16px;">
      <div style="max-width: 520px; margin: 0 auto; background: #0a0a0a; border-radius: 12px; overflow: hidden; border: 1px solid #27272a;">
        <div style="padding: 20px 24px; border-bottom: 1px solid rgba(255,255,255,0.08); background: #121212;">
          <span style="font-size: 11px; font-weight: 700; letter-spacing: 0.08em; color: #d4af37; text-transform: uppercase;">LAW OS SUPPORT REQUEST</span>
        </div>
        <div style="padding: 24px;">
          <h2 style="font-size: 17px; font-weight: 600; color: #f4f4f5; margin: 0 0 16px;">${subject}</h2>
          <div style="background: #18181b; border-radius: 8px; padding: 14px 16px; margin-bottom: 20px; border: 1px solid #27272a;">
            <p style="font-size: 13px; line-height: 1.6; color: #e4e4e7; white-space: pre-wrap; margin: 0;">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
          </div>
          <div style="font-size: 12px; color: #a1a1aa; space-y: 4px;">
            <p style="margin: 3px 0;"><strong>Submitted by:</strong> ${caller.name} (${caller.email})</p>
            <p style="margin: 3px 0;"><strong>Firm:</strong> ${caller.firmName}</p>
            <p style="margin: 3px 0;"><strong>Role:</strong> ${caller.role}</p>
            <p style="margin: 3px 0;"><strong>Request ID:</strong> <code style="color: #d4af37;">${requestId}</code></p>
          </div>
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
    const authHeader = req.headers.get('Authorization');
    const caller = await resolveCaller(authHeader);

    const { request_id, subject, message } = await req.json();
    if (!subject || !message) {
      return json({ error: 'subject and message are required' }, 400);
    }

    if (!RESEND_API_KEY) {
      console.warn(`[support-request-notify] LOUD WARNING: RESEND_API_KEY not configured. Support request ${request_id || 'new'} saved to DB, but email notification to ${SUPPORT_EMAIL} was skipped.`);
      return json({ ok: true, emailSent: false, warning: 'RESEND_API_KEY not configured on backend' });
    }

    const emailHtml = supportEmailHtml(caller, request_id || 'pending', subject, message);

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [SUPPORT_EMAIL],
        reply_to: caller.email,
        subject: `[Law OS Support] ${subject} - ${caller.firmName}`,
        html: emailHtml,
      }),
    });

    if (!resendRes.ok) {
      const errorText = await resendRes.text();
      console.error(`[support-request-notify] Resend API error (${resendRes.status}): ${errorText}`);
      return json({ ok: true, emailSent: false, warning: `Resend error: ${errorText}` });
    }

    console.log(`[support-request-notify] Successfully sent support email notification for firm ${caller.firmName} to ${SUPPORT_EMAIL}`);
    return json({ ok: true, emailSent: true });
  } catch (err) {
    console.error('[support-request-notify] Error:', String((err as Error)?.message ?? err));
    await reportError(err, { functionName: 'support-request-notify' });
    return json({ error: String((err as any)?.message ?? err) }, 500);
  }
});
