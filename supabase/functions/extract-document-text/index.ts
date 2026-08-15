// Supabase Edge Function: extract-document-text
// Populates documents.extracted_text (see migration 0017) so the
// Documents screen's search box can actually search file CONTENT, not
// just file names. Called client-side, fire-and-forget, right after a
// successful upload (see uploadDocument in src/lib/store.tsx) — never
// awaited by the upload flow, so a slow or failing extraction never
// blocks or breaks the upload itself.
//
// Scope, confirmed against this firm's real documents before writing
// this (78 PDFs, 49 DOCX, zero image files): only .pdf and .docx are
// handled. Anything else is marked 'skipped', not attempted.
//
// Two-tier extraction, cheapest-first:
//   1. PDF with a real text layer (already-digital PDFs, the common
//      case) -> extracted directly via unpdf. No external API call, no
//      cost beyond the edge function's own compute.
//   2. PDF where step 1 comes back with next to no text (a scanned/
//      image-based page has no text layer to extract) -> falls back to
//      real OCR via Gemini's multimodal input (send the PDF bytes
//      directly, ask for a verbatim transcription). This is the only
//      path that costs real per-document money, and it only runs for
//      the subset of PDFs that actually need it — reuses the existing
//      GEMINI_API_KEY secret (same provider/model already funded for
//      ai-call) rather than adding a new OCR vendor.
//   DOCX has no "scanned" case (it's already a digital text document,
//   never OCR territory) — extracted directly by unzipping
//   word/document.xml and stripping markup. Free, no external call.
//
// Deploy:  supabase functions deploy extract-document-text
// Secrets: reuses existing GEMINI_API_KEY, SUPABASE_URL,
//          SUPABASE_SERVICE_ROLE_KEY, SENTRY_DSN — nothing new to set.

import { reportError } from '../_shared/sentry.ts';
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

// Above this, we don't even try — a request this large risks the edge
// function's own memory/time limits and (for the OCR path) Gemini's
// inline-request size limit. Rare for the kind of filed correspondence/
// contracts this app stores; a firm hitting this can still search by
// filename, just not content, for that one file.
const MAX_BYTES = 20 * 1024 * 1024;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// Same pattern as composio/index.ts's resolveFirmId — never trust a
// firm_id the client claims; resolve it server-side from the caller's
// own auth token.
async function resolveFirmId(authHeader: string): Promise<string> {
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
  return profiles[0].firm_id;
}

function toBase64(bytes: Uint8Array): string {
  // btoa(String.fromCharCode(...bytes)) blows the call stack on anything
  // but tiny files — chunked conversion avoids that.
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

// Real OCR fallback for scanned/image-based PDFs — Gemini reads the PDF
// bytes directly (multimodal input), no separate OCR vendor needed.
async function ocrViaGemini(pdfBytes: Uint8Array): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');
  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { inline_data: { mime_type: 'application/pdf', data: toBase64(pdfBytes) } },
          { text: 'Transcribe all visible text in this document verbatim, in reading order. Output plain text only — no commentary, no markdown formatting, no summary.' },
        ],
      }],
    }),
  });
  if (!res.ok) throw new Error(`Gemini OCR ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '';
  return text.trim();
}

// A digital PDF's own text layer, via unpdf (pdf.js under the hood,
// packaged for serverless/edge runtimes — no filesystem, no native
// deps). Returns '' rather than throwing on a pdf.js parse hiccup, so
// the caller's "was there real text?" heuristic can decide to fall back
// to OCR instead of hard-failing the whole extraction.
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

// DOCX is a zip of XML parts — word/document.xml holds the visible body
// text. No OCR involved; this is a born-digital format.
async function extractDocxText(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const doc = zip.file('word/document.xml');
  if (!doc) return '';
  const xml: string = await doc.async('string');
  return xml
    .replace(/<\/w:p>/g, '\n')       // paragraph breaks before stripping tags, so text isn't one run-on line
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim();
}

// @ts-ignore Deno.serve is available in the Supabase Edge Function runtime
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let documentId: string | undefined;
  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error('Edge function not configured');

    const authHeader = req.headers.get('Authorization') || '';
    const firmId = await resolveFirmId(authHeader);

    ({ document_id: documentId } = await req.json());
    if (!documentId) return json({ error: 'document_id is required' }, 400);

    const docRes = await fetch(
      `${SUPABASE_URL}/rest/v1/documents?id=eq.${documentId}&select=*`,
      { headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY! } }
    );
    const docs = await docRes.json();
    const doc = docs?.[0];
    if (!doc) return json({ error: 'Document not found' }, 404);
    // Never trust the client's own idea of which document this is —
    // confirm it actually belongs to the caller's own firm before doing
    // any work on it, same isolation discipline as every other function.
    if (doc.firm_id !== firmId) return json({ error: 'Not authorized for this document' }, 403);

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
      // PDF: try the free text-layer path first. Fewer than ~20 usable
      // characters per page is treated as "this page has no real text
      // layer" (a blank page, or — the common real case — a scanned
      // image with no OCR'd layer at all) and triggers the paid OCR
      // fallback instead of returning near-nothing.
      const layer = await extractPdfTextLayer(bytes);
      const looksScanned = layer.text.length < 20 * layer.pageCount;
      extractedText = looksScanned ? await ocrViaGemini(bytes) : layer.text;
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
