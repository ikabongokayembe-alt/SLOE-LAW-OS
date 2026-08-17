// Supabase Edge Function: ai-call
// Gemini is the sole provider (the currently funded one). Keeps the wire
// format the frontend (src/lib/gemini.ts) already expects:
//   - non-stream: { text: string }
//   - stream: SSE lines "data: {\"choices\":[{\"delta\":{\"content\":...}}]}\n\n"
// On total failure the caller gets a clean, generic error — never a raw
// provider error string.
// Deploy: supabase functions deploy ai-call
// Secrets: supabase secrets set GEMINI_API_KEY=...
//          supabase secrets set GEMINI_API_KEY_2=...  (optional — see rotation
//          block below; set as many of _2/_3/_4 as you provision)
//          supabase secrets set SENTRY_DSN=...  (error monitoring — see _shared/sentry.ts; optional, no-ops if unset)

import { reportError } from '../_shared/sentry.ts';

// @ts-ignore Deno global is available in the Supabase Edge Function runtime
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// ═══════════════════════════════════════════════════════════════════════
// KEY ROTATION ON QUOTA — matches Sloe Laboratory's own resilience shape,
// with one discrepancy called out rather than silently resolved.
//
// Sloe Laboratory's actual `collectGeminiKeys()` — read directly from
// working code in TWO places (api/llm-gateway.ts:17 and
// apps/tenant/server.ts:705) — returns ONLY `process.env.GEMINI_API_KEY`
// in both. The tenant server's own comment says "Collect the SINGLE
// Gemini key used by the tenant runtime." `.env.example` lists
// GEMINI_API_KEY_2/_3/_4, but neither collectGeminiKeys() implementation
// reads them — they are unconsumed anywhere I could find in that repo.
//
// So "match collectGeminiKeys() exactly" and "rotate across _2/_3/_4" are
// in tension in the reference itself. This deliberately builds the
// SECOND one, because it is the version that solves the actual problem
// (the 5-req/min ceiling hit during live testing) — a rotation loop fed
// a single key cannot rotate. What IS matched exactly is the loop
// STRUCTURE around collectGeminiKeys()'s return value: per-key attempt,
// rotate to the next key on a quota error if one remains, a single
// same-key retry on any other error, throw once both are exhausted. The
// env var naming (_2/_3/_4) is the one Sloe Laboratory's own
// .env.example already established, reused rather than invented.
//
// One further divergence, and why it's safe: the reference's loop
// carries a `written` guard because it streams FROM Gemini and can't
// safely retry after real bytes have gone out (a retry would duplicate
// text). ai-call has never called Gemini's streaming API — it always
// does one buffered generateContent call and fakes SSE chunking for the
// client afterward (see sseChunk usage below, unchanged). There is no
// partial-Gemini-response case here to guard against, so no `written`
// equivalent is needed.
// ═══════════════════════════════════════════════════════════════════════

function collectGeminiKeys(): string[] {
  // @ts-ignore Deno global is available in the Supabase Edge Function runtime
  const raw = [
    Deno.env.get('GEMINI_API_KEY'),
    // @ts-ignore Deno global is available in the Supabase Edge Function runtime
    Deno.env.get('GEMINI_API_KEY_2'),
    // @ts-ignore Deno global is available in the Supabase Edge Function runtime
    Deno.env.get('GEMINI_API_KEY_3'),
    // @ts-ignore Deno global is available in the Supabase Edge Function runtime
    Deno.env.get('GEMINI_API_KEY_4'),
  ];
  return raw
    .map((k) => (k ?? '').replace(/^['"]/, '').replace(/['"]$/, '').trim())
    .filter((k) => k.length > 0 && k !== 'stub' && k !== 'undefined' && k !== 'null');
}

// Same detection the reference's isQuotaError() uses, adapted from an SDK
// error object to a raw fetch Response + body text (this file has never
// used the @google/genai SDK — it calls the REST endpoint directly, same
// as before this change).
function isQuotaResponse(status: number, bodyText: string): boolean {
  if (status === 429) return true;
  return /\b429\b|RESOURCE_EXHAUSTED|quota.*exceeded|rate[ _-]?limit/i.test(bodyText);
}

async function postToGemini(body: unknown, apiKey: string): Promise<{ ok: boolean; status: number; text: string }> {
  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

// The shared primitive both call sites below go through: callGeminiOnce
// (plain prompt -> text) and runWithTools' per-round call (contents +
// function_declarations). Agnostic to what's in `body` — only the key
// used to reach Gemini rotates, never the request shape.
//
// Loop shape, matching the reference's inner resilience layer exactly:
//   for each key: attempt; on success return; on a QUOTA error with a
//   key still unused, rotate and continue (no retry spent); on any other
//   error, spend the ONE retry on the same key before moving on; once a
//   key's retry is spent and it still fails, that failure propagates —
//   the outer generateText() retry (unchanged, below) is what catches a
//   total failure across every key and turns it into the clean
//   AI_PROVIDER_UNAVAILABLE error the frontend already expects.
async function requestGeminiWithRotation(body: unknown): Promise<any> {
  const keys = collectGeminiKeys();
  if (keys.length === 0) throw new Error('GEMINI_API_KEY not configured');

  let retriedOnce = false;
  for (let i = 0; i < keys.length; i++) {
    const r = await postToGemini(body, keys[i]);
    if (r.ok) {
      try {
        return JSON.parse(r.text);
      } catch {
        throw new Error(`Gemini returned non-JSON on a 2xx response: ${r.text.slice(0, 200)}`);
      }
    }
    if (isQuotaResponse(r.status, r.text) && i + 1 < keys.length) {
      console.warn(`[ai-call] key ${i} quota, rotating to ${i + 1}`);
      continue;
    }
    if (!retriedOnce) {
      retriedOnce = true;
      console.warn(`[ai-call] transient error on key ${i} (${r.status}), retrying once`);
      i--;
      continue;
    }
    throw new Error(`Gemini ${r.status}: ${r.text}`);
  }
  // Unreachable: the loop above always returns or throws before falling
  // through — every iteration either succeeds, rotates, retries, or
  // throws. Kept only so TypeScript sees every path return.
  throw new Error('Gemini request failed after exhausting all configured keys');
}

// ═══════════════════════════════════════════════════════════════════════
// TWO-PASS TOOL USE
//
// Declaring every discovered tool on every turn would put a large schema
// payload on the wire for the majority of messages that need no tool at
// all -- paid in latency and tokens on every single message, forever. So
// pass 1 is a deliberately tiny yes/no classification, and tools are
// fetched and declared ONLY when it says yes. One extra round-trip on
// the minority of turns that need live data; nothing on the rest.
//
// The boundary itself is NOT enforced here. composio/execute_tool
// re-checks every call server-side against _shared/composioTools.ts.
// This function forwards the caller's own Authorization header on every
// hop, so firm resolution stays exactly where it already was -- derived
// from the JWT inside composio, never passed around as a claim.
// ═══════════════════════════════════════════════════════════════════════
const MAX_TOOL_ROUNDS = 4;

async function needsTools(prompt: string): Promise<boolean> {
  // Cheap and strict: anything ambiguous answers NO, so an ordinary
  // question never pays for a tool round-trip.
  const probe = `A user asked an assistant the following. Does answering it REQUIRE reading live data from their connected email or calendar account? Answer with exactly one word: YES or NO.\n\nUser message: ${prompt.slice(0, 1500)}`;
  try {
    const out = await callGeminiOnce(probe, false);
    return /^\s*yes\b/i.test(out);
  } catch {
    return false; // classification failure must not block a normal answer
  }
}

async function composioCall(authHeader: string, body: unknown): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/composio`, {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return await res.json();
}

// Runs Gemini with tool declarations, executing any function calls it
// makes through composio and feeding results back until it produces
// text. Capped rounds so a model that keeps calling tools cannot loop.
async function runWithTools(prompt: string, authHeader: string): Promise<string> {
  const listed = await composioCall(authHeader, { action: 'list_tools' });
  const tools = listed?.tools ?? [];
  if (!Array.isArray(tools) || tools.length === 0) {
    // Nothing connected, or nothing readable -- answer normally rather
    // than claiming a capability that isn't there.
    return await callGeminiOnce(prompt, false);
  }

  const declarations = tools.map((t: any) => ({
    name: t.name, description: t.description, parameters: t.parameters,
  }));
  const contents: any[] = [{ role: 'user', parts: [{ text: prompt }] }];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const data = await requestGeminiWithRotation({
      contents, tools: [{ function_declarations: declarations }],
    });
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const calls = parts.filter((p: any) => p.functionCall);

    if (calls.length === 0) {
      const text = parts.map((p: any) => p.text ?? '').join('');
      if (text) return text;
      throw new Error('Empty Gemini response');
    }

    contents.push({ role: 'model', parts });
    const responses: any[] = [];
    for (const c of calls) {
      const name = c.functionCall?.name;
      const args = c.functionCall?.args ?? {};
      const result = await composioCall(authHeader, {
        action: 'execute_tool', tool_slug: name, tool_arguments: args,
      });
      // A refusal is handed back to the model as a RESULT, not thrown.
      // The model then explains the limit to the user in its own words,
      // instead of the turn dying with a generic failure.
      responses.push({
        functionResponse: {
          name,
          response: result?.error
            ? { error: result.error, refused: !!result.refused }
            : { data: result?.data ?? null },
        },
      });
    }
    contents.push({ role: 'user', parts: responses });
  }
  // Out of rounds: ask once more, without tools, so the user still gets
  // an answer rather than silence.
  return await callGeminiOnce(prompt, false);
}


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGeminiOnce(prompt: string, expectJson: boolean): Promise<string> {
  const data = await requestGeminiWithRotation({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: expectJson ? { responseMimeType: 'application/json' } : {},
  });
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
  let enableTools: unknown;
  try {
    ({ prompt, expectJson, stream, enable_tools: enableTools } = await req.json());
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
    // Two-pass tool use. Opt-in per request, so nothing that does not ask
    // for it pays anything at all. The caller's own Authorization header
    // is forwarded to composio, which resolves the firm from that JWT --
    // this function never learns or handles a firm_id, so tool access
    // cannot be widened by anything sent in this body.
    if (enableTools) {
      const authHeader = req.headers.get('Authorization') || '';
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Authorization required for tool use' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      let text: string;
      if (await needsTools(prompt)) {
        text = await runWithTools(prompt, authHeader);
      } else {
        text = await generateText(prompt, false);
      }
      if (stream) {
        const encoder = new TextEncoder();
        const body = new ReadableStream({
          start(controller) {
            const CHUNK = 24;
            for (let i = 0; i < text.length; i += CHUNK) {
              controller.enqueue(encoder.encode(sseChunk(text.slice(i, i + CHUNK))));
            }
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          },
        });
        return new Response(body, { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' } });
      }
      return new Response(JSON.stringify({ text }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
