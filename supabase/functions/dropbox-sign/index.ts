// Supabase Edge Function: dropbox-sign
//
// Wraps Dropbox Sign (formerly HelloSign) for single-document e-signature
// from a matter's Documents view. Three actions:
//
//   send    — download an existing uploaded document from matter-documents
//             storage, push it to Dropbox Sign as a signature request for
//             one recipient, record the request row.
//   status  — poll Dropbox Sign for a request's current state and, the
//             first time it comes back signed, pull the signed copy back
//             into matter-documents as a VERSION of the original.
//   cancel  — cancel a still-open request at the vendor.
//
// Deploy:  supabase functions deploy dropbox-sign
// Secret:  supabase secrets set DROPBOX_SIGN_API_KEY=...
//          supabase secrets set DROPBOX_SIGN_TEST_MODE=1   (optional; 1 =
//            non-legally-binding test signatures that don't consume quota.
//            MUST be unset/0 for real client signatures.)
//          supabase secrets set SENTRY_DSN=...  (optional, no-ops if unset)
//
// Auth model matches composio/index.ts exactly: the caller's firm is
// resolved from their JWT, never from anything the request body claims.
// Every document and signature_requests row this function touches is
// re-checked against that firm_id before it is read or written, so a
// caller cannot reach another firm's document by guessing an id — the
// service role used for the writes below bypasses RLS, which means these
// explicit checks ARE the tenancy boundary here, not a redundant belt.

import { reportError } from '../_shared/sentry.ts';

// @ts-ignore Deno global is available in the Supabase Edge Function runtime
const DROPBOX_SIGN_API_KEY = Deno.env.get('DROPBOX_SIGN_API_KEY');
// @ts-ignore Deno global is available in the Supabase Edge Function runtime
const TEST_MODE = Deno.env.get('DROPBOX_SIGN_TEST_MODE') === '1';
// @ts-ignore Deno global is available in the Supabase Edge Function runtime
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
// @ts-ignore Deno global is available in the Supabase Edge Function runtime
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const SIGN_BASE = 'https://api.hellosign.com/v3';
const BUCKET = 'matter-documents';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// Dropbox Sign authenticates with the API key as HTTP Basic username and
// an empty password — not a Bearer token. Getting this wrong returns a
// generic 401 that looks like a bad key, so it is worth being explicit.
function signAuthHeader(): string {
  return 'Basic ' + btoa(`${DROPBOX_SIGN_API_KEY}:`);
}

const restHeaders = {
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  apikey: SERVICE_ROLE_KEY!,
  'Content-Type': 'application/json',
};

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
    { headers: restHeaders }
  );
  const profiles = await profileRes.json();
  if (!profiles?.[0]?.firm_id) throw new Error('No profile found for this user');
  return { firmId: profiles[0].firm_id, userId: user.id };
}

// Both lookups below filter on firm_id in the query itself rather than
// fetching by id and comparing afterwards — a not-found row and a
// wrong-firm row then return identically (empty), so this cannot be used
// to probe whether some document id exists at another firm.
async function getOwnedDocument(documentId: string, firmId: string) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/documents?id=eq.${documentId}&firm_id=eq.${firmId}&select=id,matter_id,file_name,storage_path,parent_document_id`,
    { headers: restHeaders }
  );
  const rows = await res.json();
  if (!rows?.[0]) throw new Error('Document not found');
  return rows[0];
}

async function getOwnedRequest(requestId: string, firmId: string) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/signature_requests?id=eq.${requestId}&firm_id=eq.${firmId}&select=*`,
    { headers: restHeaders }
  );
  const rows = await res.json();
  if (!rows?.[0]) throw new Error('Signature request not found');
  return rows[0];
}

async function patchRequest(id: string, patch: Record<string, unknown>) {
  await fetch(`${SUPABASE_URL}/rest/v1/signature_requests?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...restHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
}

async function downloadFromStorage(storagePath: string): Promise<Blob> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`, {
    headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY! },
  });
  if (!res.ok) throw new Error(`Could not read document from storage (${res.status})`);
  return await res.blob();
}

// ── send ────────────────────────────────────────────────────────────
async function actionSend(body: any, firmId: string, userId: string) {
  const { document_id, recipient_email, recipient_name, subject, message } = body;
  if (!document_id || !recipient_email) {
    return json({ error: 'document_id and recipient_email are required' }, 400);
  }

  const doc = await getOwnedDocument(document_id, firmId);

  // Insert BEFORE calling the vendor, so a crash or timeout during the
  // call leaves a visible 'sent' row to reconcile rather than a
  // signature request that exists at Dropbox Sign with no local trace.
  // dropbox_sign_request_id is filled in on success below.
  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/signature_requests`, {
    method: 'POST',
    headers: { ...restHeaders, Prefer: 'return=representation' },
    body: JSON.stringify({
      firm_id: firmId,
      matter_id: doc.matter_id,
      document_id: doc.id,
      recipient_email,
      status: 'sent',
      created_by: userId,
    }),
  });
  const inserted = (await insertRes.json())?.[0];
  if (!inserted?.id) throw new Error('Could not record the signature request');

  try {
    const file = await downloadFromStorage(doc.storage_path);

    // multipart/form-data with file[0] — Dropbox Sign's documented shape
    // for sending raw file bytes. Not JSON: the JSON variant of this
    // endpoint only accepts remote file URLs or previously-uploaded
    // template ids, and our storage objects are not publicly reachable.
    const form = new FormData();
    form.append('title', doc.file_name);
    form.append('subject', subject || `Signature requested: ${doc.file_name}`);
    if (message) form.append('message', message);
    form.append('signers[0][email_address]', recipient_email);
    form.append('signers[0][name]', recipient_name || recipient_email);
    form.append('file[0]', file, doc.file_name);
    if (TEST_MODE) form.append('test_mode', '1');

    const res = await fetch(`${SIGN_BASE}/signature_request/send`, {
      method: 'POST',
      headers: { Authorization: signAuthHeader() },
      body: form,
    });
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(`Dropbox Sign ${res.status}: ${payload?.error?.error_msg ?? JSON.stringify(payload)}`);
    }

    const vendorId = payload?.signature_request?.signature_request_id;
    if (!vendorId) throw new Error('Dropbox Sign returned no signature_request_id');
    await patchRequest(inserted.id, { dropbox_sign_request_id: vendorId });

    return json({ ok: true, id: inserted.id, dropbox_sign_request_id: vendorId, test_mode: TEST_MODE });
  } catch (err) {
    // The vendor call failed, so the row we optimistically inserted
    // describes a request that does not exist. Remove it rather than
    // leaving a permanently-'sent' row that will never resolve.
    await fetch(`${SUPABASE_URL}/rest/v1/signature_requests?id=eq.${inserted.id}`, {
      method: 'DELETE',
      headers: restHeaders,
    });
    throw err;
  }
}

// ── status ──────────────────────────────────────────────────────────
async function actionStatus(body: any, firmId: string) {
  const { id } = body;
  if (!id) return json({ error: 'id is required' }, 400);

  const row = await getOwnedRequest(id, firmId);
  if (!row.dropbox_sign_request_id) return json({ ok: true, status: row.status });
  // Already terminal — no vendor call, and critically no second attempt
  // to store the signed copy (which would create a duplicate version).
  if (row.status !== 'sent') return json({ ok: true, status: row.status });

  const res = await fetch(`${SIGN_BASE}/signature_request/${row.dropbox_sign_request_id}`, {
    headers: { Authorization: signAuthHeader() },
  });
  const payload = await res.json();
  if (!res.ok) {
    throw new Error(`Dropbox Sign ${res.status}: ${payload?.error?.error_msg ?? JSON.stringify(payload)}`);
  }

  const sr = payload?.signature_request;
  const signatures: any[] = sr?.signatures ?? [];
  const declined = signatures.some(s => s.status_code === 'declined');
  const complete = sr?.is_complete === true;

  if (declined) {
    await patchRequest(row.id, { status: 'declined', completed_at: new Date().toISOString() });
    return json({ ok: true, status: 'declined' });
  }
  if (!complete) return json({ ok: true, status: 'sent' });

  // Signed. Pull the executed PDF and store it as a VERSION of the
  // original via parent_document_id (migration 0008), so the signed copy
  // sits alongside the original in the same version chain rather than
  // appearing as an unrelated document.
  const original = await getOwnedDocument(row.document_id, firmId);
  const fileRes = await fetch(`${SIGN_BASE}/signature_request/files/${row.dropbox_sign_request_id}?file_type=pdf`, {
    headers: { Authorization: signAuthHeader() },
  });
  if (!fileRes.ok) throw new Error(`Could not download signed copy (${fileRes.status})`);
  const signedBytes = await fileRes.arrayBuffer();

  const baseName = original.file_name.replace(/\.[^.]+$/, '');
  const signedName = `${baseName} (signed).pdf`;
  const storagePath = `${firmId}/${crypto.randomUUID()}-${signedName.replace(/[^\w.\- ()]/g, '_')}`;

  const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY!,
      'Content-Type': 'application/pdf',
    },
    body: signedBytes,
  });
  if (!upRes.ok) throw new Error(`Could not store signed copy (${upRes.status})`);

  // Root of the version chain, never the immediately-preceding version —
  // see 0008. If the original is itself already a version, its root is
  // the parent we attach to.
  const rootId = original.parent_document_id ?? original.id;
  const docRes = await fetch(`${SUPABASE_URL}/rest/v1/documents`, {
    method: 'POST',
    headers: { ...restHeaders, Prefer: 'return=representation' },
    body: JSON.stringify({
      firm_id: firmId,
      matter_id: original.matter_id,
      file_name: signedName,
      storage_path: storagePath,
      file_type: 'application/pdf',
      file_size: signedBytes.byteLength,
      parent_document_id: rootId,
      uploaded_by: row.created_by,
    }),
  });
  const signedDoc = (await docRes.json())?.[0];
  if (!signedDoc?.id) {
    // Storage object is already written; without a documents row it would
    // be unreachable from the UI. Remove it rather than leaving an orphan.
    await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY! },
    });
    throw new Error('Could not record the signed copy');
  }

  await patchRequest(row.id, {
    status: 'signed',
    signed_document_id: signedDoc.id,
    completed_at: new Date().toISOString(),
  });

  return json({ ok: true, status: 'signed', signed_document_id: signedDoc.id });
}

// ── cancel ──────────────────────────────────────────────────────────
async function actionCancel(body: any, firmId: string) {
  const { id } = body;
  if (!id) return json({ error: 'id is required' }, 400);
  const row = await getOwnedRequest(id, firmId);
  if (row.dropbox_sign_request_id && row.status === 'sent') {
    await fetch(`${SIGN_BASE}/signature_request/cancel/${row.dropbox_sign_request_id}`, {
      method: 'POST',
      headers: { Authorization: signAuthHeader() },
    });
  }
  await fetch(`${SUPABASE_URL}/rest/v1/signature_requests?id=eq.${row.id}`, {
    method: 'DELETE',
    headers: restHeaders,
  });
  return json({ ok: true });
}

// @ts-ignore Deno.serve is available in the Supabase Edge Function runtime
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!DROPBOX_SIGN_API_KEY) throw new Error('DROPBOX_SIGN_API_KEY not configured');
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthenticated' }, 401);
    const { firmId, userId } = await resolveCaller(authHeader);

    const body = await req.json();
    switch (body?.action) {
      case 'send':   return await actionSend(body, firmId, userId);
      case 'status': return await actionStatus(body, firmId);
      case 'cancel': return await actionCancel(body, firmId);
      default:       return json({ error: `Unknown action: ${body?.action}` }, 400);
    }
  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    console.error('[dropbox-sign] failed:', msg);
    await reportError(err, { functionName: 'dropbox-sign' });
    const status = msg === 'Unauthenticated' ? 401 : msg.endsWith('not found') ? 404 : 500;
    return json({ error: msg }, status);
  }
});
