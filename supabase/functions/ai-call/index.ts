// Supabase Edge Function: ai-call
// Gemini is the sole provider (the currently funded one). One short-delay
// retry on transient failure before giving up — no second-provider
// fallback, since the only other provider option isn't funded right now
// and attempting it on Gemini failure would just add latency for a call
// that's also going to fail. Keeps the wire format the frontend
// (src/lib/gemini.ts) already expects:
//   - non-stream: { text: string }
//   - stream: SSE lines "data: {\"choices\":[{\"delta\":{\"content\":...}}]}\n\n"
// On total failure the caller gets a clean, generic error — never a raw
// provider error string.
// Deploy: supabase functions deploy ai-call
// Secrets: supabase secrets set GEMINI_API_KEY=...
//          supabase secrets set SENTRY_DSN=...  (error monitoring — see _shared/sentry.ts; optional, no-ops if unset)

import { reportError } from '../_shared/sentry.ts';

// @ts-ignore Deno global is available in the Supabase Edge Function runtime
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGeminiOnce(prompt: string, expectJson: boolean): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');

  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: expectJson ? { responseMimeType: 'application/json' } : {},
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '';
  if (!text) throw new Error('Empty Gemini response');
  return text;
}

// Gemini-only, with one short-delay retry (a single transient blip
// shouldn't be treated the same as a real outage). Every failure here is
// caught and logged — nothing thrown out of this function's own attempts
// leaks upstream; only the final AI_PROVIDER_UNAVAILABLE marker propagates,
// and the caller in Deno.serve turns that into a clean, generic error
// response.
async function generateText(prompt: string, expectJson: boolean): Promise<string> {
  try {
    return await callGeminiOnce(prompt, expectJson);
  } catch (primaryErr) {
    console.error('[ai-call] Gemini primary failed:', String((primaryErr as Error)?.message ?? primaryErr));

    try {
      await sleep(500);
      return await callGeminiOnce(prompt, expectJson);
    } catch (retryErr) {
      console.error('[ai-call] Gemini retry failed:', String((retryErr as Error)?.message ?? retryErr));
      throw new Error('AI_PROVIDER_UNAVAILABLE');
    }
  }
}

function sseChunk(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}

// @ts-ignore Deno.serve is available in the Supabase Edge Function runtime
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let prompt: unknown;
  let expectJson: unknown;
  let stream: unknown;
  try {
    ({ prompt, expectJson, stream } = await req.json());
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!prompt || typeof prompt !== 'string') {
    return new Response(JSON.stringify({ error: 'prompt is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    if (stream) {
      const fullText = await generateText(prompt, false);
      const encoder = new TextEncoder();
      const body = new ReadableStream({
        start(controller) {
          const CHUNK_SIZE = 24;
          for (let i = 0; i < fullText.length; i += CHUNK_SIZE) {
            controller.enqueue(encoder.encode(sseChunk(fullText.slice(i, i + CHUNK_SIZE))));
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });
      return new Response(body, {
        headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
      });
    }

    const text = await generateText(prompt, !!expectJson);
    return new Response(JSON.stringify({ text }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    // generateText already logged the real Gemini failures above. Never
    // surface a raw provider error string (e.g. "Gemini 503: {...}") to the
    // frontend/end user — return a clean, generic message instead.
    console.error('[ai-call] request failed after exhausting all retries:', String((err as Error)?.message ?? err));
    await reportError(err, { functionName: 'ai-call' });
    return new Response(
      JSON.stringify({ error: 'AI assistant is temporarily unavailable, please try again in a moment.' }),
      {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
