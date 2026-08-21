// Client-side AI helper. All calls go through the Supabase Edge Function
// `ai-call` which holds the OpenAI key server-side. No LLM keys live in
// the frontend.

import { supabase } from './supabase';

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const AI_ENDPOINT = `${SUPA_URL}/functions/v1/ai-call`;

const cache = new Map<string, string>();

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getAuthHeader(): Promise<string> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) return `Bearer ${token}`;
  } catch {
    // ignore
  }
  return `Bearer ${ANON}`;
}

async function callEdge(body: { prompt: string; expectJson?: boolean; stream?: boolean; feature?: string }) {
  const authHeader = await getAuthHeader();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);
  try {
    return await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
        apikey: ANON,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function safeParseJson(text: string): any {
  let clean = text.trim();
  // Strip markdown code block wrappers
  clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  // Extract JSON object if wrapped in explanatory text
  const match = clean.match(/\{[\s\S]*\}/);
  if (match) {
    clean = match[0];
  }

  try {
    return JSON.parse(clean);
  } catch {
    // Escape unescaped control characters inside JSON string fields as fallback
    const sanitized = clean.replace(/[\u0000-\u001F]+/g, (m) => {
      if (m === '\n') return '\\n';
      if (m === '\r') return '\\r';
      if (m === '\t') return '\\t';
      return '';
    });
    return JSON.parse(sanitized);
  }
}

export async function callGemini(prompt: string, expectJson: boolean = true, feature: string = 'generic'): Promise<any> {
  const key = prompt.slice(0, 200) + String(expectJson) + feature;
  if (cache.has(key)) {
    const cached = cache.get(key)!;
    return expectJson ? safeParseJson(cached) : cached;
  }

  const actualPrompt = expectJson ? ensureJsonHint(prompt) : prompt;
  const retries = [300, 900, 2700];
  let lastError: any;

  for (let i = 0; i <= retries.length; i++) {
    try {
      const res = await callEdge({ prompt: actualPrompt, expectJson, feature });
      if (!res.ok) throw new Error(`ai-call ${res.status}`);
      const { text } = await res.json();
      if (!text) throw new Error('Empty response');

      if (expectJson) {
        const json = safeParseJson(text);
        cache.set(key, text);
        return json;
      }

      cache.set(key, text);
      return text;
    } catch (err) {
      lastError = err;
      if (i < retries.length) await sleep(retries[i]);
    }
  }

  throw lastError;
}

export async function streamGeminiContent(prompt: string, onChunk: (text: string) => void, feature: string = 'generic'): Promise<string> {
  const res = await callEdge({ prompt, stream: true, feature });
  if (!res.ok || !res.body) throw new Error(`ai-call stream ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullResponse = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') continue;
      try {
        const json = JSON.parse(payload);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
          fullResponse += delta;
          onChunk(fullResponse);
        }
      } catch {
        // ignore malformed chunks
      }
    }
  }

  return fullResponse;
}
