// Supabase Edge Function: extract-document-text
// Populates documents.extracted_text (see migration 0017) so the
// Documents screen's search box can search file CONTENT, not just file names.
// Instrumentation: Logs Gemini OCR calls to `usage_events`.

import { reportError } from '../_shared/sentry.ts';
import { buildLlmUsageLedger, estimateTokensFromText } from '../_shared/cost.ts';
import { logUsageEvent } from '../_shared/usageLogger.ts';
// @ts-ignore npm specifier resolved by the Supabase Edge Function (Deno) runtime
import { getDocumentProxy, extractText } from 'npm:unpdf@0.12.1';
// @ts-ignore npm specifier resolved by the Supabase Edge Function (Deno) runtime
import JSZip from 'npm:jszip@3.10.1';

// @ts-ignore Deno global is available in the Supabase Edge Function runtime
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
// @ts-ignore Deno global is available in the Supabase Edge Function runtime
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
// @ts-ignore Deno global is available in the Supabase Edge Function runtime
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const STORAGE_BUCKET = 'matter-documents';
const MAX_BYTES = 20 * 1024 * 1024;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

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

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function updateDocument(id: string, patch: Record<string, unknown>) {
  await fetch(`${SUPABASE_URL}/rest/v1/documents?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY!,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify(patch),
  });
}

async function ocrViaGemini(pdfBytes: Uint8Array, caller: { firmId: string; userId: string }): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');
  const b64 = toBase64(pdfBytes);
  
  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { inline_data: { mime_type: 'application/pdf', data: b64 } },
          { text: 'Transcribe all visible text in this document verbatim, in reading order. Output plain text only — no commentary, no markdown formatting, no summary.' },
        ],
      }],
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    const isQuota = res.status === 429 || /quota|RESOURCE_EXHAUSTED/i.test(errorText);
    
    // Log failure to usage_events
    const ledger = buildLlmUsageLedger({
      provider: 'gemini',
      model: GEMINI_MODEL,
      feature: 'document_ocr',
      ok: false,
      errorClass: isQuota ? 'quota_exceeded' : `http_${res.status}`,
      inputTokens: 0,
      outputTokens: 0,
      tokenSource: 'estimated',
      estimateSuspect: false,
    });
    logUsageEvent({
      firmId: caller.firmId,
      userId: caller.userId,
      eventType: 'llm_call',
      eventData: ledger,
    });

    throw new Error(`Gemini OCR ${res.status}: ${errorText}`);
  }

  const data = await res.json();
  const text = (data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '').trim();
  const usage = data?.usageMetadata;

  const inEst = estimateTokensFromText(b64);
  const outEst = estimateTokensFromText(text);

  const inputTokens = usage?.promptTokenCount ?? inEst.tokens;
  const outputTokens = usage?.candidatesTokenCount ?? outEst.tokens;
  const tokenSource = (usage?.promptTokenCount !== undefined) ? 'provider' : 'estimated';

  const ledger = buildLlmUsageLedger({
    provider: 'gemini',
    model: GEMINI_MODEL,
    feature: 'document_ocr',
    ok: true,
    inputTokens,
    outputTokens,
    tokenSource,
    // Legitimate document OCR input — character-based estimate is valid and included in cost summaries
    estimateSuspect: false,
    inputChars: b64.length,
    outputChars: text.length,
  });

  logUsageEvent({
    firmId: caller.firmId,
    userId: caller.userId,
    eventType: 'llm_call',
    eventData: ledger,
  });

  return text;
}

async function extractPdfTextLayer(bytes: Uint8Array): Promise<{ text: string; pageCount: number }> {
  try {
    const pdf = await getDocumentProxy(bytes);
    const { text, totalPages } = await extractText(pdf, { mergePages: true });
    return { text: (text ?? '').trim(), pageCount: totalPages ?? 1 };
  } catch (err) {
    console.warn('[extract-document-text] pdf.js text-layer extraction failed:', String((err as Error)?.message ?? err));
    return { text: '', pageCount: 1 };
  }
}

async function extractDocxText(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const docXml = await zip.file('word/document.xml')?.async('string');
  if (!docXml) return '';
  return docXml
    .replace(/<w:p\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\n\s*\n/g, '\n')
    .trim();
}

// @ts-ignore Deno.serve is available in the Supabase Edge Function runtime
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let documentId: string | undefined;
  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error('Edge function not configured');

    const authHeader = req.headers.get('Authorization') || '';
    const caller = await resolveCaller(authHeader);

    ({ document_id: documentId } = await req.json());
    if (!documentId) return json({ error: 'document_id is required' }, 400);

    const docRes = await fetch(
      `${SUPABASE_URL}/rest/v1/documents?id=eq.${documentId}&select=*`,
      { headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY! } }
    );
    const docs = await docRes.json();
    const doc = docs?.[0];
    if (!doc) return json({ error: 'Document not found' }, 404);
    if (doc.firm_id !== caller.firmId) return json({ error: 'Not authorized for this document' }, 403);

    const ext = (doc.file_name.match(/\.[a-z0-9]+$/i)?.[0] ?? '').toLowerCase();
    if (ext !== '.pdf' && ext !== '.docx') {
      await updateDocument(documentId, { extraction_status: 'skipped' });
      return json({ status: 'skipped', reason: 'unsupported file type' });
    }
    if (doc.file_size && doc.file_size > MAX_BYTES) {
      await updateDocument(documentId, { extraction_status: 'skipped' });
      return json({ status: 'skipped', reason: 'file too large' });
    }

    const fileRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${doc.storage_path}`, {
      headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY! },
    });
    if (!fileRes.ok) throw new Error(`Couldn't download file from storage: ${fileRes.status}`);
    const bytes = new Uint8Array(await fileRes.arrayBuffer());

    let extractedText = '';
    if (ext === '.docx') {
      extractedText = await extractDocxText(bytes);
    } else {
      const layer = await extractPdfTextLayer(bytes);
      const looksScanned = layer.text.length < 20 * layer.pageCount;
      extractedText = looksScanned ? await ocrViaGemini(bytes, caller) : layer.text;
    }

    await updateDocument(documentId, { extracted_text: extractedText, extraction_status: 'done' });
    return json({ status: 'done', extracted_length: extractedText.length });
  } catch (err) {
    console.error('[extract-document-text] failed:', String((err as Error)?.message ?? err));
    await reportError(err, { functionName: 'extract-document-text' });
    if (documentId) await updateDocument(documentId, { extraction_status: 'failed' }).catch(() => {});
    return json({ error: String((err as any)?.message ?? err) }, 500);
  }
});
