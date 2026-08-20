// Cost helpers for usage_events.
// Ported near-verbatim from Sloe Laboratory (apps/tenant/server/usage/cost.ts),
// adapted for Deno Edge Functions and Law OS environment.

type Provider = "gemini" | "anthropic" | "openai" | string;

export type LlmCostInput = {
  provider: Provider;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
};

export type MediaCostInput = {
  provider: Provider;
  model?: string | null;
  lane?: "image" | "video" | string | null;
  assetType?: string | null;
  assetCount?: number | null;
  seconds?: number | null;
  size?: string | null;
  mode?: string | null;
};

type Price = {
  inputPerMillion: number;
  outputPerMillion: number;
};

// Rates verified against Google Gemini pricing (USD per 1M tokens)
const PRICES: Array<{ provider: Provider; model: RegExp; price: Price }> = [
  { provider: "gemini", model: /flash-lite/i, price: { inputPerMillion: 0.1, outputPerMillion: 0.4 } },
  { provider: "gemini", model: /flash/i, price: { inputPerMillion: 0.3, outputPerMillion: 2.5 } },
  { provider: "gemini", model: /pro/i, price: { inputPerMillion: 1.25, outputPerMillion: 10 } },
  { provider: "anthropic", model: /haiku/i, price: { inputPerMillion: 0.8, outputPerMillion: 4 } },
  { provider: "anthropic", model: /sonnet/i, price: { inputPerMillion: 3, outputPerMillion: 15 } },
  { provider: "anthropic", model: /opus/i, price: { inputPerMillion: 15, outputPerMillion: 75 } },
  { provider: "openai", model: /4o-mini/i, price: { inputPerMillion: 0.15, outputPerMillion: 0.6 } },
  { provider: "openai", model: /gpt-4o|gpt-4\.1/i, price: { inputPerMillion: 5, outputPerMillion: 15 } },
];

const DEFAULT_PRICE: Record<string, Price> = {
  gemini: { inputPerMillion: 0.3, outputPerMillion: 2.5 },
  anthropic: { inputPerMillion: 3, outputPerMillion: 15 },
  openai: { inputPerMillion: 5, outputPerMillion: 15 },
};

// Character-based estimation: length / 4.
// Base64-encoded strings run ~33% larger than actual content.
export function isLikelyBase64(text: string): boolean {
  if (!text || text.length < 100) return false;
  return /^data:[a-zA-Z0-9+\/]+;base64,/i.test(text) || Boolean(text.match(/^[A-Za-z0-9+/=]{200,}$/));
}

export function estimateTokensFromText(text: string | null | undefined): { tokens: number; suspect: boolean } {
  const normalized = String(text || "").trim();
  if (!normalized) return { tokens: 0, suspect: false };
  const suspect = isLikelyBase64(normalized);
  const tokens = Math.max(1, Math.ceil(normalized.length / 4));
  return { tokens, suspect };
}

export function priceForModel(provider: Provider, model?: string | null): Price {
  const providerKey = String(provider || "").toLowerCase();
  const modelKey = String(model || "");
  const exact = PRICES.find((row) => row.provider === providerKey && row.model.test(modelKey));
  return exact?.price || DEFAULT_PRICE[providerKey] || { inputPerMillion: 5, outputPerMillion: 15 };
}

export function estimateLlmCostCents(input: LlmCostInput): number {
  const inputTokens = Math.max(0, Number(input.inputTokens || 0));
  const outputTokens = Math.max(0, Number(input.outputTokens || 0));
  const price = priceForModel(input.provider, input.model);
  const dollars =
    (inputTokens / 1_000_000) * price.inputPerMillion +
    (outputTokens / 1_000_000) * price.outputPerMillion;
  return Number((dollars * 100).toFixed(6));
}

export function buildLlmUsageLedger(input: LlmCostInput & {
  inputChars?: number;
  outputChars?: number;
  tokenSource?: "provider" | "estimated";
  estimateSuspect?: boolean;
  feature?: string;
  ok?: boolean;
  errorClass?: string | null;
}): Record<string, any> {
  const inputTokens = Math.max(0, Math.round(Number(input.inputTokens || 0)));
  const outputTokens = Math.max(0, Math.round(Number(input.outputTokens || 0)));
  return {
    provider: input.provider,
    model: input.model ?? null,
    feature: input.feature ?? "generic",
    ok: input.ok ?? true,
    error_class: input.errorClass ?? null,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: inputTokens + outputTokens,
    estimated_cost_cents: estimateLlmCostCents({ ...input, inputTokens, outputTokens }),
    cost_source: input.tokenSource || "estimated",
    estimate_suspect: Boolean(input.estimateSuspect),
    input_chars: Math.max(0, Math.round(Number(input.inputChars || 0))),
    output_chars: Math.max(0, Math.round(Number(input.outputChars || 0))),
  };
}

const NATIVE_TOOL_PROVIDERS = new Set(["resend_email", "reso"]);
const DEFAULT_COMPOSIO_CENTS_PER_CALL = 0.0145; // ≈ $0.000145/call

export function estimateToolCallCostCents(provider: string): number {
  const key = String(provider || "").toLowerCase();
  if (NATIVE_TOOL_PROVIDERS.has(key)) return 0;
  return DEFAULT_COMPOSIO_CENTS_PER_CALL;
}

export function buildToolCallUsageLedger(input: {
  provider: string;
  tool: string;
  access?: "read" | "write" | string;
  ok?: boolean;
  errorClass?: string | null;
}): Record<string, any> {
  return {
    provider: input.provider,
    tool: input.tool,
    access: input.access ?? null,
    ok: input.ok ?? true,
    error_class: input.errorClass ?? null,
    tool_calls: 1,
    estimated_cost_cents: estimateToolCallCostCents(input.provider),
    cost_source: "rate_card",
  };
}

export function monthStartIso(now = new Date()): string {
  const sinceDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  return sinceDate.toISOString();
}

export type UsageSummaryEvent = {
  event_type?: string | null;
  event_data?: Record<string, any> | null;
  created_at?: string | null;
};

export type UsageCostSummary = {
  event_count: number;
  llm_call_count: number;
  media_generation_count: number;
  media_asset_count: number;
  media_video_seconds: number;
  failed_call_count: number;
  quota_error_count: number;
  estimated_cost_cents: number;
  input_tokens: number;
  output_tokens: number;
  provider_counts: Record<string, number>;
  model_counts: Record<string, number>;
  feature_counts: Record<string, number>;
  media_provider_counts: Record<string, number>;
  tool_call_count: number;
  tool_call_cost_cents: number;
  tool_provider_counts: Record<string, number>;
  since: string;
};

export function summarizeUsageEvents(events: UsageSummaryEvent[], since: string): UsageCostSummary {
  const summary: UsageCostSummary = {
    event_count: events.length,
    llm_call_count: 0,
    media_generation_count: 0,
    media_asset_count: 0,
    media_video_seconds: 0,
    failed_call_count: 0,
    quota_error_count: 0,
    estimated_cost_cents: 0,
    input_tokens: 0,
    output_tokens: 0,
    provider_counts: {},
    model_counts: {},
    feature_counts: {},
    media_provider_counts: {},
    tool_call_count: 0,
    tool_call_cost_cents: 0,
    tool_provider_counts: {},
    since,
  };

  for (const event of events) {
    const data = event.event_data || {};
    if (data.estimate_suspect === true) continue;

    if (event.event_type === "llm_call") {
      summary.llm_call_count += 1;
      if (data.ok === false) summary.failed_call_count += 1;
      if (String(data.error_class || "").includes("quota")) summary.quota_error_count += 1;
      summary.estimated_cost_cents += Number(data.estimated_cost_cents || 0);
      summary.input_tokens += Math.max(0, Number(data.input_tokens || 0));
      summary.output_tokens += Math.max(0, Number(data.output_tokens || 0));

      const provider = String(data.provider || "unknown").toLowerCase();
      const model = String(data.model || "unknown");
      const feature = String(data.feature || "generic");
      summary.provider_counts[provider] = (summary.provider_counts[provider] || 0) + 1;
      summary.model_counts[model] = (summary.model_counts[model] || 0) + 1;
      summary.feature_counts[feature] = (summary.feature_counts[feature] || 0) + 1;
      continue;
    }

    if (event.event_type === "media_generate") {
      summary.media_generation_count += 1;
      if (data.status === "failed" || data.ok === false) summary.failed_call_count += 1;
      if (String(data.error_class || "").includes("quota")) summary.quota_error_count += 1;
      summary.estimated_cost_cents += Number(data.estimated_cost_cents || 0);
      if (Number(data.estimated_cost_cents || 0) > 0 || data.status === "completed" || data.status === "processing") {
        summary.media_asset_count += Math.max(0, Number(data.asset_count || 0));
        summary.media_video_seconds += Math.max(0, Number(data.seconds || 0));
      }

      const provider = String(data.provider || "unknown").toLowerCase();
      const model = String(data.model || "unknown");
      summary.provider_counts[provider] = (summary.provider_counts[provider] || 0) + 1;
      summary.model_counts[model] = (summary.model_counts[model] || 0) + 1;
      summary.media_provider_counts[provider] = (summary.media_provider_counts[provider] || 0) + 1;
      continue;
    }

    if (event.event_type === "tool_call") {
      summary.tool_call_count += 1;
      if (data.ok === false) summary.failed_call_count += 1;
      if (String(data.error_class || "").includes("quota")) summary.quota_error_count += 1;
      const cents = Number(data.estimated_cost_cents || 0);
      summary.tool_call_cost_cents += cents;
      summary.estimated_cost_cents += cents;
      const provider = String(data.provider || "unknown").toLowerCase();
      summary.tool_provider_counts[provider] = (summary.tool_provider_counts[provider] || 0) + 1;
      continue;
    }
  }

  summary.tool_call_cost_cents = Number(summary.tool_call_cost_cents.toFixed(6));
  summary.estimated_cost_cents = Number(summary.estimated_cost_cents.toFixed(6));
  summary.input_tokens = Math.round(summary.input_tokens);
  summary.output_tokens = Math.round(summary.output_tokens);
  summary.media_video_seconds = Number(summary.media_video_seconds.toFixed(3));

  return summary;
}
