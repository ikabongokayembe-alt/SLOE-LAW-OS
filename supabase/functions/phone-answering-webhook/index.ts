// Supabase Edge Function: phone-answering-webhook
//
// Receiver for post-call transcripts/analysis webhooks sent by ElevenLabs
// Conversational AI (or direct Twilio call events).
//
// Deployed with JWT verification disabled:
//   supabase functions deploy phone-answering-webhook --no-verify-jwt
//
// Dynamic Triage Flow:
// 1. Logs raw call payload into `phone_call_logs`.
// 2. Extracts caller phone number, caller name, transcript, and summary.
// 3. Searches `parties` for matching phone number.
// 4. If matching client party found -> Attaches call note/document to party's active matter.
// 5. If prospective client (no party match & inquiry intent) -> Auto-triggers `submit_intake` RPC.
// 6. If unclear or explicitly requires human follow-up -> Marks call log as `callback_flagged`.

import { reportError } from '../_shared/sentry.ts';

// @ts-ignore Deno global is available in the Supabase Edge Function runtime
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
// @ts-ignore Deno global is available in the Supabase Edge Function runtime
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const restHeaders = {
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  apikey: SERVICE_ROLE_KEY!,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function pluck(obj: any, path: string): unknown {
  return path.split('.').reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), obj);
}

function firstDefined(obj: any, paths: string[]): unknown {
  for (const p of paths) {
    const v = pluck(obj, p);
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

// Clean phone numbers to standard digit format for robust matching
function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '').slice(-10); // last 10 digits
}

// @ts-ignore Deno global is available in the Supabase Edge Function runtime
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let rawBody: any;
  try {
    rawBody = await req.json();
  } catch {
    rawBody = { _unparseable_body: await req.text().catch(() => '<unreadable>') };
  }

  try {
    // ElevenLabs post-call payload structure vs generic Twilio payload fallback
    const dataObj = rawBody?.data ?? rawBody;
    
    const calledPhone = String(firstDefined(dataObj, [
      'called_phone', 'to', 'phone_answering_number', 'metadata.called_phone', 'metadata.to', 'metadata.phone_number'
    ]) ?? '');

    const callerPhone = String(firstDefined(dataObj, [
      'caller_phone', 'caller_id', 'from', 'user_phone_number', 'metadata.caller_phone', 'metadata.from'
    ]) ?? '');

    const callerName = String(firstDefined(dataObj, [
      'caller_name', 'user_name', 'metadata.caller_name', 'analysis.caller_name'
    ]) ?? '');

    const summary = String(firstDefined(dataObj, [
      'summary', 'analysis.transcript_summary', 'analysis.call_summary', 'transcript_summary'
    ]) ?? 'AI Voice Call completed.');

    const durationSeconds = Number(firstDefined(dataObj, [
      'call_duration_seconds', 'duration_secs', 'metadata.call_duration'
    ]) ?? 0);

    const transcript = dataObj?.transcript ?? rawBody?.transcript ?? [];
    const formattedTranscript = Array.isArray(transcript)
      ? transcript.map((t: any) => `${t.speaker || t.role || 'user'}: ${t.message || t.text}`).join('\n')
      : String(transcript);

    // Look up firm matching the recipient Twilio number (firms.phone_answering_number)
    const normCalledPhone = normalizePhone(calledPhone);
    let firm: { id: string; intake_token: string | null } | null = null;

    const firmsRes = await fetch(`${SUPABASE_URL}/rest/v1/firms?select=id,intake_token,phone_answering_number`, { headers: restHeaders });
    const firms: any[] = (await firmsRes.json()) ?? [];

    if (normCalledPhone.length >= 7) {
      firm = firms.find(f => normalizePhone(f.phone_answering_number) === normCalledPhone) ?? null;
    }

    // Fallback: if only one firm exists (single tenant deployment), fallback gracefully
    if (!firm && firms.length === 1) {
      firm = firms[0];
    }

    if (!firm) {
      console.warn('[phone-answering-webhook] No firm matched called phone number:', calledPhone);
      return json({ error: `No firm matched called phone number ${calledPhone}` }, 404);
    }

    const normCallerPhone = normalizePhone(callerPhone);
    let matchedMatterId: string | null = null;
    let outcomeAction: 'intake_created' | 'matter_noted' | 'callback_flagged' = 'callback_flagged';

    if (normCallerPhone.length >= 7) {
      // 1. Check if caller matches an existing party with an active matter
      const partiesRes = await fetch(`${SUPABASE_URL}/rest/v1/parties?firm_id=eq.${firm.id}&select=id,name,notes`, { headers: restHeaders });
      const parties: any[] = (await partiesRes.json()) ?? [];
      const matchedParty = parties.find(p => normalizePhone(p.notes).includes(normCallerPhone) || normalizePhone(p.name).includes(normCallerPhone));

      if (matchedParty) {
        // Find active matter for party
        const matterRes = await fetch(`${SUPABASE_URL}/rest/v1/matters?client_party_id=eq.${matchedParty.id}&status=eq.active&order=opened_date.desc&limit=1`, { headers: restHeaders });
        const matters = await matterRes.json();
        if (matters?.[0]?.id) {
          matchedMatterId = matters[0].id;
          outcomeAction = 'matter_noted';

          // Attach document / note on matter
          await fetch(`${SUPABASE_URL}/rest/v1/documents`, {
            method: 'POST',
            headers: restHeaders,
            body: JSON.stringify({
              firm_id: firm.id,
              matter_id: matchedMatterId,
              file_name: `AI Call Note - ${new Date().toLocaleDateString()}.txt`,
              storage_path: `calls/${Date.now()}.txt`,
              extracted_text: `CALL SUMMARY:\n${summary}\n\nTRANSCRIPT:\n${formattedTranscript}`,
              client_visible: false,
            }),
          });
        }
      }
    }

    // 2. Prospective Client Intake Heuristic:
    // Requires an EXPLICIT positive intent keyword in summary or analysis.
    // Does NOT trigger auto-intake creation merely on callerName presence to prevent spurious records.
    if (!matchedMatterId && firm.intake_token) {
      const summaryLower = summary.toLowerCase();
      const explicitIntakeKeywords = ['intake', 'inquiry', 'new client', 'consultation', 'retainer', 'hire attorney', 'legal representation', 'case inquiry'];
      const hasExplicitIntakeIntent = explicitIntakeKeywords.some(kw => summaryLower.includes(kw));

      if (hasExplicitIntakeIntent) {
        // Trigger public submit_intake RPC
        const intakeRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_intake`, {
          method: 'POST',
          headers: restHeaders,
          body: JSON.stringify({
            p_token: firm.intake_token,
            p_name: callerName.trim() || `Phone Caller (${callerPhone || 'Unknown'})`,
            p_email: '',
            p_phone: callerPhone,
            p_practice_area_key: null,
            p_description: `[AI Phone Call Intake]\nSummary: ${summary}\n\nTranscript:\n${formattedTranscript}`
          }),
        });
        if (intakeRes.ok) {
          matchedMatterId = await intakeRes.json();
          outcomeAction = 'intake_created';
        }
      }
    }


    // 3. Log call record into `phone_call_logs`
    await fetch(`${SUPABASE_URL}/rest/v1/phone_call_logs`, {
      method: 'POST',
      headers: restHeaders,
      body: JSON.stringify({
        firm_id: firm.id,
        caller_phone: callerPhone || null,
        caller_name: callerName || null,
        call_duration_seconds: durationSeconds || null,
        summary,
        transcript: Array.isArray(transcript) ? transcript : { text: formattedTranscript },
        outcome_action: outcomeAction,
        matched_matter_id: matchedMatterId,
        raw_payload: rawBody,
      }),
    });

    return json({ received: true, outcome: outcomeAction, matter_id: matchedMatterId });
  } catch (e: any) {
    console.error('[phone-answering-webhook] error:', e);
    reportError(e, { functionName: 'phone-answering-webhook' });
    return json({ received: true, error: e?.message });
  }
});
