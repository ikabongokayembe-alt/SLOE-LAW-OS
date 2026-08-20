// Supabase Edge Function: ai-call
// Gemini is the sole provider (the currently funded one). Keeps the wire
// format the frontend (src/lib/gemini.ts) already expects:
//   - non-stream: { text: string }
//   - stream: SSE lines "data: {\"choices\":[{\"delta\":{\"content\":...}}]}\n\n"
// On total failure the caller gets a clean, generic error — never a raw
// provider error string.
// Instrumentation: Logs real LLM turns and quota failures to `usage_events`.

import { reportError } from '../_shared/sentry.ts';
import { buildLlmUsageLedger, estimateTokensFromText } from '../_shared/cost.ts';
import { logUsageEvent } from '../_shared/usageLogger.ts';

// @ts-ignore Deno global is available in the Supabase Edge Function runtime
// @ts-ignore Deno global is available in the Supabase Edge Function runtime
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
// @ts-ignore Deno global is available in the Supabase Edge Function runtime
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

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

function isQuotaResponse(status: number, bodyText: string): boolean {
  if (status === 429) return true;
  return /\b429\b|RESOURCE_EXHAUSTED|quota.*exceeded|rate[ _-]?limit/i.test(bodyText);
}

async function resolveCaller(authHeader: string | null): Promise<{ firmId: string | null; userId: string | null }> {
  if (!authHeader || !SUPABASE_URL || !SERVICE_ROLE_KEY) return { firmId: null, userId: null };
  try {
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return { firmId: null, userId: null };
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SERVICE_ROLE_KEY },
    });
    if (!userRes.ok) return { firmId: null, userId: null };
    const user = await userRes.json();
    if (!user?.id) return { firmId: null, userId: null };

    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=firm_id`,
      { headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY } }
    );
    const profiles = await profileRes.json();
    const firmId = profiles?.[0]?.firm_id || null;
    return { firmId, userId: user.id };
  } catch {
    return { firmId: null, userId: null };
  }
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

async function requestGeminiWithRotation(
  body: unknown,
  caller: { firmId: string | null; userId: string | null },
  feature: string = 'generic',
  promptTextForFallback: string = ''
): Promise<any> {
  const keys = collectGeminiKeys();
  if (keys.length === 0) throw new Error('GEMINI_API_KEY not configured');

  let retriedOnce = false;
  let lastQuotaError = false;

  for (let i = 0; i < keys.length; i++) {
    const r = await postToGemini(body, keys[i]);

    if (r.ok) {
      try {
        const jsonRes = JSON.parse(r.text);
        
        // Extract real token usage if provided by Gemini usageMetadata
        const usage = jsonRes?.usageMetadata;
        const outText = jsonRes?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';

        const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
        const fallbackInput = (bodyString.length > promptTextForFallback.length) ? bodyString : (promptTextForFallback || bodyString);

        const inEst = estimateTokensFromText(fallbackInput);
        const outEst = estimateTokensFromText(outText);

        const inputTokens = usage?.promptTokenCount ?? inEst.tokens;
        const outputTokens = usage?.candidatesTokenCount ?? outEst.tokens;
        const tokenSource = (usage?.promptTokenCount !== undefined) ? 'provider' : 'estimated';
        const estimateSuspect = tokenSource === 'estimated' && (inEst.suspect || outEst.suspect);

        const ledger = buildLlmUsageLedger({
          provider: 'gemini',
          model: GEMINI_MODEL,
          feature,
          ok: true,
          inputTokens,
          outputTokens,
          tokenSource,
          estimateSuspect,
          inputChars: fallbackInput.length,
          outputChars: outText.length,
        });

        // Fire-and-forget usage_event log
        logUsageEvent({
          firmId: caller.firmId,
          userId: caller.userId,
          eventType: 'llm_call',
          eventData: ledger,
        });

        return jsonRes;
      } catch (err) {
        throw new Error(`Gemini returned non-JSON on a 2xx response: ${r.text.slice(0, 200)}`);
      }
    }

    const isQuota = isQuotaResponse(r.status, r.text);
    const errorClass = isQuota ? 'quota_exceeded' : `http_${r.status}`;
    const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
    const fallbackInput = (bodyString.length > promptTextForFallback.length) ? bodyString : (promptTextForFallback || bodyString);

    if (isQuota) {
      lastQuotaError = true;
      // Log quota error turn to usage_events
      const inEst = estimateTokensFromText(fallbackInput);
      const ledger = buildLlmUsageLedger({
        provider: 'gemini',
        model: GEMINI_MODEL,
        feature,
        ok: false,
        errorClass: 'quota_exceeded',
        inputTokens: inEst.tokens,
        outputTokens: 0,
        tokenSource: 'estimated',
        estimateSuspect: inEst.suspect,
        inputChars: fallbackInput.length,
        outputChars: 0,
      });
      logUsageEvent({
        firmId: caller.firmId,
        userId: caller.userId,
        eventType: 'llm_call',
        eventData: ledger,
      });
    }

    if (isQuota && i + 1 < keys.length) {
      console.warn(`[ai-call] key ${i} quota, rotating to ${i + 1}`);
      continue;
    }
    if (!retriedOnce) {
      retriedOnce = true;
      console.warn(`[ai-call] transient error on key ${i} (${r.status}), retrying once`);
      i--;
      continue;
    }

    // Log final failed turn before throwing
    if (!isQuota) {
      const inEst = estimateTokensFromText(fallbackInput);
      const ledger = buildLlmUsageLedger({
        provider: 'gemini',
        model: GEMINI_MODEL,
        feature,
        ok: false,
        errorClass,
        inputTokens: inEst.tokens,
        outputTokens: 0,
        tokenSource: 'estimated',
        estimateSuspect: inEst.suspect,
        inputChars: fallbackInput.length,
        outputChars: 0,
      });
      logUsageEvent({
        firmId: caller.firmId,
        userId: caller.userId,
        eventType: 'llm_call',
        eventData: ledger,
      });
    }

    throw new Error(`Gemini ${r.status}: ${r.text}`);
  }

  throw new Error('Gemini request failed after exhausting all configured keys');
}

const MAX_TOOL_ROUNDS = 4;

async function needsTools(prompt: string, caller: { firmId: string | null; userId: string | null }, feature: string): Promise<boolean> {
  const probe = `A user asked an assistant the following. Does answering it REQUIRE reading live data from their connected email or calendar account? Answer with exactly one word: YES or NO.\n\nUser message: ${prompt.slice(0, 1500)}`;
  try {
    const out = await callGeminiOnce(probe, false, caller, `${feature}_needs_tools_probe`);
    return /^\s*yes\b/i.test(out);
  } catch {
    return false;
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

async function runWithTools(
  prompt: string,
  authHeader: string,
  caller: { firmId: string | null; userId: string | null },
  feature: string
): Promise<string> {
  const listed = await composioCall(authHeader, { action: 'list_tools' });
  const tools = listed?.tools ?? [];
  if (!Array.isArray(tools) || tools.length === 0) {
    return await callGeminiOnce(prompt, false, caller, feature);
  }

  const declarations = tools.map((t: any) => ({
    name: t.name, description: t.description, parameters: t.parameters,
  }));
  const contents: any[] = [{ role: 'user', parts: [{ text: prompt }] }];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const data = await requestGeminiWithRotation({
      contents, tools: [{ function_declarations: declarations }],
    }, caller, `${feature}_tool_round_${round}`, prompt);

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

  return await callGeminiOnce(prompt, false, caller, feature);
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGeminiOnce(
  prompt: string,
  expectJson: boolean,
  caller: { firmId: string | null; userId: string | null },
  feature: string
): Promise<string> {
  const data = await requestGeminiWithRotation({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: expectJson ? { responseMimeType: 'application/json' } : {},
  }, caller, feature, prompt);

  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '';
  if (!text) throw new Error('Empty Gemini response');
  return text;
}

async function generateText(
  prompt: string,
  expectJson: boolean,
  caller: { firmId: string | null; userId: string | null },
  feature: string
): Promise<string> {
  try {
    return await callGeminiOnce(prompt, expectJson, caller, feature);
  } catch (primaryErr) {
    console.error('[ai-call] Gemini primary failed:', String((primaryErr as Error)?.message ?? primaryErr));

    try {
      await sleep(500);
      return await callGeminiOnce(prompt, expectJson, caller, feature);
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
  let featureReq: unknown;

  try {
    const body = await req.json();
    prompt = body.prompt;
    expectJson = body.expectJson;
    stream = body.stream;
    enableTools = body.enable_tools;
    featureReq = body.feature;
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

  const authHeader = req.headers.get('Authorization');
  const caller = await resolveCaller(authHeader);
  const feature = typeof featureReq === 'string' && featureReq ? featureReq : 'generic';

  try {
    if (enableTools) {
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Authorization required for tool use' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      let text: string;
      if (await needsTools(prompt, caller, feature)) {
        text = await runWithTools(prompt, authHeader, caller, feature);
      } else {
        text = await generateText(prompt, false, caller, feature);
      }
      if (stream) {
        const encoder = new TextEncoder();
        const bodyStream = new ReadableStream({
          start(controller) {
            const CHUNK = 24;
            for (let i = 0; i < text.length; i += CHUNK) {
              controller.enqueue(encoder.encode(sseChunk(text.slice(i, i + CHUNK))));
            }
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          },
        });
        return new Response(bodyStream, { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' } });
      }
      return new Response(JSON.stringify({ text }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (stream) {
      const fullText = await generateText(prompt, false, caller, feature);
      const encoder = new TextEncoder();
      const bodyStream = new ReadableStream({
        start(controller) {
          const CHUNK_SIZE = 24;
          for (let i = 0; i < fullText.length; i += CHUNK_SIZE) {
            controller.enqueue(encoder.encode(sseChunk(fullText.slice(i, i + CHUNK_SIZE))));
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });
      return new Response(bodyStream, {
        headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
      });
    }

    const text = await generateText(prompt, !!expectJson, caller, feature);
    return new Response(JSON.stringify({ text }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
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
