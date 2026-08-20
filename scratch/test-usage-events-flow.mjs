import { priceForModel, estimateLlmCostCents, buildLlmUsageLedger, summarizeUsageEvents, estimateTokensFromText } from '../supabase/functions/_shared/cost.ts';

console.log('=== Step 1: Testing Price & Cost Ledger Logic ===');

const flashPrice = priceForModel('gemini', 'gemini-2.5-flash');
console.log('Gemini 2.5 Flash Price:', flashPrice);

const costCents = estimateLlmCostCents({
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  inputTokens: 1000,
  outputTokens: 500,
});
console.log('Cost for 1000 in / 500 out (cents):', costCents);

const sampleText = 'Hello world, checking basic token estimation.';
const base64Text = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const normalEst = estimateTokensFromText(sampleText);
const base64Est = estimateTokensFromText(base64Text);

console.log('Normal text estimation:', normalEst);
console.log('Base64 text estimation:', base64Est);

if (!base64Est.suspect) {
  console.error('FAIL: Base64 string was not marked suspect for raw text estimation!');
  process.exit(1);
}

console.log('=== Step 2: Testing Rollup, OCR Inclusion & Quota Error Separation ===');

const events = [
  {
    event_type: 'llm_call',
    event_data: buildLlmUsageLedger({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      feature: 'operator_chat',
      ok: true,
      inputTokens: 500,
      outputTokens: 250,
      tokenSource: 'provider',
    }),
    created_at: new Date().toISOString(),
  },
  {
    event_type: 'llm_call',
    event_data: buildLlmUsageLedger({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      feature: 'analyst_context',
      ok: false,
      errorClass: 'quota_exceeded',
      inputTokens: 100,
      outputTokens: 0,
      tokenSource: 'estimated',
    }),
    created_at: new Date().toISOString(),
  },
  {
    event_type: 'llm_call',
    event_data: buildLlmUsageLedger({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      feature: 'email_draft',
      ok: false,
      errorClass: 'http_500',
      inputTokens: 100,
      outputTokens: 0,
      tokenSource: 'estimated',
    }),
    created_at: new Date().toISOString(),
  },
  {
    event_type: 'llm_call',
    event_data: buildLlmUsageLedger({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      feature: 'document_ocr',
      ok: true,
      inputTokens: 10000,
      outputTokens: 2000,
      tokenSource: 'estimated',
      estimateSuspect: false, // OCR calls are legitimate multimodal input and must be included in cost rollups
    }),
    created_at: new Date().toISOString(),
  },
];

const summary = summarizeUsageEvents(events, new Date().toISOString());
console.log('Rollup Summary:', JSON.stringify(summary, null, 2));

if (summary.event_count !== 4) throw new Error('Expected 4 total events');
if (summary.llm_call_count !== 4) throw new Error('Expected 4 valid llm_call count (including OCR)');
if (summary.failed_call_count !== 2) throw new Error('Expected 2 failed calls');
if (summary.quota_error_count !== 1) throw new Error('Expected 1 quota error distinct from general failures');
if (summary.feature_counts.operator_chat !== 1) throw new Error('Expected operator_chat feature count');
if (summary.feature_counts.analyst_context !== 1) throw new Error('Expected analyst_context feature count');
if (summary.feature_counts.document_ocr !== 1) throw new Error('Expected document_ocr feature count');

console.log('✅ ALL UNIT & ROLLUP VERIFICATION TESTS PASSED!');
