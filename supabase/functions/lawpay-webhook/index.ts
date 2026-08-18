// Supabase Edge Function: lawpay-webhook
//
// Public, UNAUTHENTICATED receiver for LawPay (AffiniPay/8am) payment
// notifications. The only edge function in this app meant to be called
// BY an external service rather than FROM the app itself -- LawPay has
// no Supabase session to send, so this must be deployed with JWT
// verification disabled:
//
//   supabase functions deploy lawpay-webhook --no-verify-jwt
//   supabase secrets set LAWPAY_SECRET_KEY=...   (LawPay API secret key --
//     not required for this function to run today, wired for a future
//     authenticated reconciliation step; stored as a secret, never in a
//     client-readable table, same pattern as every other vendor key in
//     this app -- see dropbox-sign/index.ts.)
//
// Then register the deployed URL
// (https://<project>.supabase.co/functions/v1/lawpay-webhook) as the
// merchant's Event URL in a REAL LawPay dashboard once that account
// exists (Developers > Authorized Applications) -- this is the real
// prerequisite this whole integration is blocked on, not a code TODO.
//
// ── WHAT THIS DOES NOT (YET) KNOW, STATED PLAINLY ───────────────────
// LawPay's publicly reachable developer docs
// (developers.8am.com/reference/api.html) document webhook DELIVERY
// mechanics -- Event URL config, HTTP POST, must return 200, retried
// every 10 min up to 25 attempts -- for MERCHANT ONBOARDING events
// (merchant.provisioned / merchant_application.declined). The specific
// event name and payload shape for "a payment completed" is not in what
// is publicly reachable without a real, logged-in merchant account (the
// developer portal itself: full detail is "available only to users with
// the Administrator or Developer role and to the merchant owner"). No
// HMAC/signature verification scheme is documented publicly either.
//
// Rather than invent a plausible-looking event shape and pretend it is
// confirmed, this function stores the RAW payload of every call it
// receives, unconditionally, in lawpay_webhook_events (migration 0027) --
// and makes a best-effort defensive attempt to match it to one of our
// invoices and mark it paid. The very first real webhook LawPay sends
// will land in that table exactly as received; read it back and correct
// parseWebhookPayload() below to match it precisely. That is meant to be
// a one-function edit at that point, not a redesign.
//
// Because the payload shape is unconfirmed, this is explicitly NOT the
// only way an invoice gets marked paid -- see markInvoicePaid in
// store.tsx for the staff-facing manual fallback, which depends on
// nothing here and works regardless of whether this function ever
// correctly parses a real event.

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

// Walks a dotted path (e.g. "data.charge.reference") through a plain
// object, returning undefined if any segment is missing -- used to try
// several plausible nesting levels without a wall of optional chaining.
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

interface ParsedWebhook {
  reference: string | null;
  chargeId: string | null;
  isCompleted: boolean;
}

// Best-effort, deliberately over-broad field-name matching -- see the
// file header. `reference` is the one value we fully control (we set it
// to the invoice's own id when building the payment link, see
// lib/lawpay.ts), so it is the most trustworthy thing to look for
// regardless of which exact envelope LawPay wraps it in.
function parseWebhookPayload(payload: any): ParsedWebhook {
  const reference = firstDefined(payload, [
    'reference', 'data.reference', 'charge.reference', 'object.reference', 'data.object.reference',
  ]);
  const chargeId = firstDefined(payload, [
    'id', 'charge_id', 'data.id', 'charge.id', 'object.id', 'data.object.id',
  ]);
  const status = firstDefined(payload, [
    'status', 'data.status', 'charge.status', 'object.status', 'data.object.status', 'event', 'type',
  ]);
  const completedFlag = firstDefined(payload, ['completed', 'data.completed', 'charge.completed']);
  // Charge.status values confirmed from developers.8am.com/reference/api.html:
  // AUTHORIZED, COMPLETED, VOIDED. Matched case-insensitively since the
  // exact casing/wrapping of whatever event LawPay actually sends is
  // unconfirmed.
  const statusStr = typeof status === 'string' ? status.toUpperCase() : '';
  const isCompleted = statusStr.includes('COMPLETED') || statusStr.includes('SUCCEED') || completedFlag === true;
  return {
    reference: typeof reference === 'string' ? reference : reference != null ? String(reference) : null,
    chargeId: typeof chargeId === 'string' ? chargeId : chargeId != null ? String(chargeId) : null,
    isCompleted,
  };
}

async function logWebhookEvent(rawPayload: unknown): Promise<string | null> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/lawpay_webhook_events`, {
    method: 'POST',
    headers: restHeaders,
    body: JSON.stringify({ raw_payload: rawPayload }),
  });
  if (!res.ok) {
    console.error('[lawpay-webhook] failed to log webhook event:', await res.text());
    return null;
  }
  const rows = await res.json();
  return rows?.[0]?.id ?? null;
}

async function updateWebhookEventNote(eventId: string, note: string, matchedInvoiceId: string | null) {
  await fetch(`${SUPABASE_URL}/rest/v1/lawpay_webhook_events?id=eq.${eventId}`, {
    method: 'PATCH',
    headers: restHeaders,
    body: JSON.stringify({ note, matched_invoice_id: matchedInvoiceId }),
  });
}

async function markInvoicePaidIfUnpaid(invoiceId: string, chargeId: string | null): Promise<boolean> {
  // Filtering on status=unpaid in the PATCH itself (not a separate
  // read-then-write) makes a duplicate/retried webhook for an
  // already-paid invoice a safe no-op -- LawPay retries up to 25 times
  // per the documented delivery mechanics, and this must not, say,
  // overwrite an already-recorded paid_at with a later retry's timestamp.
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/invoices?id=eq.${invoiceId}&status=eq.unpaid`,
    {
      method: 'PATCH',
      headers: restHeaders,
      body: JSON.stringify({ status: 'paid', paid_at: new Date().toISOString(), lawpay_charge_id: chargeId }),
    }
  );
  if (!res.ok) { console.error('[lawpay-webhook] failed to mark invoice paid:', await res.text()); return false; }
  const rows = await res.json();
  return rows.length > 0;
}

// @ts-ignore Deno global is available in the Supabase Edge Function runtime
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let rawBody: unknown;
  let parseFailed = false;
  try {
    rawBody = await req.json();
  } catch {
    // Not JSON -- still log it (as text) rather than dropping it, since
    // we do not actually know what shape a real event arrives in yet.
    parseFailed = true;
    rawBody = { _unparseable_body: await req.text().catch(() => '<unreadable>') };
  }

  const eventId = await logWebhookEvent(rawBody);
  // A logging failure is a real infra problem worth LawPay retrying --
  // everything else below is "we don't understand this event", which is
  // not: always 200 for that, so a payload we can't parse doesn't churn
  // through 25 retries for no reason.
  if (!eventId) return json({ error: 'Internal error' }, 500);
  if (parseFailed) { await updateWebhookEventNote(eventId, 'Body was not valid JSON.', null); return json({ received: true }); }

  try {
    const parsed = parseWebhookPayload(rawBody);
    if (!parsed.reference) {
      await updateWebhookEventNote(eventId, 'No recognizable reference field in payload -- see parseWebhookPayload().', null);
      return json({ received: true });
    }
    if (!parsed.isCompleted) {
      await updateWebhookEventNote(eventId, `Reference "${parsed.reference}" found but no recognized completed/succeeded status.`, null);
      return json({ received: true });
    }
    const updated = await markInvoicePaidIfUnpaid(parsed.reference, parsed.chargeId);
    await updateWebhookEventNote(
      eventId,
      updated ? `Matched invoice ${parsed.reference} and marked paid.` : `Reference "${parsed.reference}" did not match an unpaid invoice (already paid, or not an invoice id).`,
      updated ? parsed.reference : null
    );
    return json({ received: true, matched: updated });
  } catch (e: any) {
    console.error('[lawpay-webhook] unexpected error:', e);
    reportError(e, { functionName: 'lawpay-webhook' });
    await updateWebhookEventNote(eventId, `Unexpected error while processing: ${e?.message ?? e}`, null);
    // Still 200: an unexpected error handling an unconfirmed payload
    // shape is exactly the "we don't understand this yet" case, already
    // captured verbatim in raw_payload for follow-up -- not a transient
    // infra failure worth 25 retries.
    return json({ received: true });
  }
});
