// Client-side AI helper. All calls go through the Supabase Edge Function
// `ai-call` which holds the OpenAI key server-side. No LLM keys live in
// the frontend.

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const AI_ENDPOINT = `${SUPA_URL}/functions/v1/ai-call`;

const cache = new Map<string, string>();

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callEdge(body: { prompt: string; expectJson?: boolean; stream?: boolean }) {
  return fetch(AI_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ANON}`,
      apikey: ANON,
    },
    body: JSON.stringify(body),
  });
}

// Note: OpenAI JSON mode requires the word "json" somewhere in the prompt.
// Prompts we send already ask for JSON shapes explicitly, so this usually works.
// If a prompt fails, wrap it or append "Respond with JSON." when expectJson=true.
function ensureJsonHint(prompt: string) {
  return prompt.toLowerCase().includes('json') ? prompt : `${prompt}\n\nRespond with JSON.`;
}

export async function callGemini(prompt: string, expectJson: boolean = true): Promise<any> {
  const key = prompt.slice(0, 200) + String(expectJson);
  if (cache.has(key)) {
    const cached = cache.get(key)!;
    return expectJson ? JSON.parse(cached) : cached;
  }

  const actualPrompt = expectJson ? ensureJsonHint(prompt) : prompt;
  const retries = [300, 900, 2700];
  let lastError: any;

  for (let i = 0; i <= retries.length; i++) {
    try {
      const res = await callEdge({ prompt: actualPrompt, expectJson });
      if (!res.ok) throw new Error(`ai-call ${res.status}`);
      const { text } = await res.json();
      if (!text) throw new Error('Empty response');

      if (expectJson) {
        let clean = text.trim();
        if (clean.startsWith('```json')) clean = clean.substring(7);
        if (clean.startsWith('```')) clean = clean.substring(3);
        if (clean.endsWith('```')) clean = clean.substring(0, clean.length - 3);
        const json = JSON.parse(clean);
        cache.set(key, clean);
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

export async function streamGeminiContent(prompt: string, onChunk: (text: string) => void): Promise<string> {
  const res = await callEdge({ prompt, stream: true });
  if (!res.ok || !res.body) throw new Error(`ai-call stream ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullResponse = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE lines: "data: {...}\n\n" or "data: [DONE]"
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
