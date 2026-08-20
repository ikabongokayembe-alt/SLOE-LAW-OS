import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../../lib/store';
import { callGemini, streamGeminiContent } from '../../lib/gemini';
import { strategicChatPrompt, strategicInsightsPrompt } from '../../lib/prompts';
import { buildFirmContext, ContextBuildResult } from '../../lib/contextBuilder';

import { StrategicChat } from './StrategicChat';
import { ContextPanel } from './ContextPanel';
import { AiDisclaimer } from '../shared/AiDisclaimer';
import { ConversationInbox } from '../agents/ConversationInbox';
import { useConversationThread } from '../../lib/useConversationThread';
import { SendEmailModal } from '../communications/SendEmailModal';
import { tryComposeEmail, ComposedEmail } from '../../lib/emailCompose';

// Same char budgets the old inline `.substring(0, N)` used — unchanged
// here; what changed is what fills them (see contextBuilder.ts).
const CHAT_CONTEXT_BUDGET = 3000;
const INSIGHTS_CONTEXT_BUDGET = 5000;

export function StrategicScreen() {
  const { matters, deadlines, parties, conflictChecks, insights, addInsights, firm, clientInvites, communications } = useStore();
  const [emailDraft, setEmailDraft] = useState<ComposedEmail | null>(null);
  const businessInsights = useMemo(() => insights.filter((i: any) => i.scope !== 'market'), [insights]);

  const [activeTab, setActiveTab] = useState('My Business');
  const [refreshKey, setRefreshKey] = useState(0);
  const bumpRail = useCallback(() => setRefreshKey(k => k + 1), []);
  const { conversation, messages, streaming, busy, open, startNew, send } =
    useConversationThread('analyst', bumpRail);
  // StrategicChat still takes a plain {role, content}[]; mapping here
  // keeps that component untouched rather than rewriting its rendering
  // to know about persisted message rows.
  const chatHistory = useMemo(
    () => messages.map(m => ({ role: m.role, content: m.content })), [messages]);
  const [timeRange, setTimeRange] = useState('30D');
  const [inputValue, setInputValue] = useState('');
  const [dismissedInsights, setDismissedInsights] = useState<Set<string>>(new Set());
  const [regenerating, setRegenerating] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  // What the MOST RECENT request (chat or insights) actually sent to the
  // model — ContextPanel renders this, never the full store state, so it
  // can't claim to have analyzed data that got omitted for length.
  const [lastContextUsage, setLastContextUsage] = useState<ContextBuildResult | null>(null);

  // Arriving from the Command Center's "ask" banner with a real question
  // pre-filled — auto-send it once, then clear the param so a page
  // refresh doesn't keep re-asking the same thing.
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) {
      handleSend(q);
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSend = async (overrideText?: string) => {
    const textToSend = overrideText ?? inputValue;
    if (!textToSend.trim() || busy) return;
    setInputValue('');

    // Checked before the normal strategic reply, same reasoning as
    // OperatorScreen: an email request skips the model-generated prose
    // answer entirely rather than producing both. See emailCompose.ts.
    const composed = await tryComposeEmail(textToSend, { matters, parties, clientInvites, communications });
    if (composed) {
      const ack = composed.recipientResolved
        ? `I've drafted an email to ${composed.partyName ?? 'the recipient'} — review it in the panel that just opened before sending.`
        : `I've drafted the email content, but there's no email address on file for ${composed.partyName ?? 'that person'} — I've opened the draft so you can add one and review before sending.`;
      await send(textToSend, async (_history, onChunk) => { onChunk(ack); return ack; });
      setEmailDraft(composed);
      return;
    }

    send(textToSend, (history, onChunk) => {
      // Firm jurisdiction (country/region) travels with every request so
      // the Analyst can reason about which legal system it's operating in
      // without the user having to mention it — see migration 0007.
      const built = buildFirmContext({
        matters, deadlines, parties, conflictChecks,
        firm_jurisdiction: { country: firm?.country ?? null, region: firm?.region ?? null },
      }, CHAT_CONTEXT_BUDGET);
      setLastContextUsage(built);
      return streamGeminiContent(strategicChatPrompt(textToSend, history, built.text), onChunk, 'analyst_chat');
    });
  };

  const regenerateInsights = async () => {
    setRegenerating(true);
    try {
      const built = buildFirmContext({ matters, deadlines, parties, conflictChecks }, INSIGHTS_CONTEXT_BUDGET);
      setLastContextUsage(built);
      const res = await callGemini(strategicInsightsPrompt(built.text), true, 'analyst_context');
      const arr = Array.isArray(res) ? res : (res?.insights ?? []);
      if (arr.length) {
        await addInsights(arr.map((i: any) => ({
          type: i.type,
          headline: i.headline,
          body: i.body ?? '',
          reasoning: i.reasoning,
          references: i.references ?? [],
          confidence: i.confidence,
          suggested_actions: i.suggested_actions ?? [],
        })));
      }
    } catch (e) { console.error(e); }
    setRegenerating(false);
  };

  const visibleInsights = businessInsights.filter((i: any) => !dismissedInsights.has(i.id));
  const hasInteracted = chatHistory.length > 0 || visibleInsights.length < businessInsights.length;

  return (
    <div className="flex flex-col h-[calc(100dvh-190px)] lg:h-[calc(100vh-140px)]">
      {emailDraft && (
        <SendEmailModal
          onClose={() => setEmailDraft(null)}
          defaultMatterId={emailDraft.matterId ?? undefined}
          defaultTo={emailDraft.to || undefined}
          defaultSubject={emailDraft.subject}
          defaultBody={emailDraft.body}
        />
      )}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-6">
        <div>
           <h2 className="text-xl font-medium mb-1">Analyst</h2>
           <p className="text-sm text-[var(--text-secondary)] font-mono mb-1.5">Patterns and recommendations from your operating data</p>
           <AiDisclaimer />
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <button onClick={regenerateInsights} disabled={regenerating} className="h-8 px-3 text-xs rounded bg-[var(--bg-tertiary)] border border-[var(--border-default)] hover:bg-[var(--bg-elevated)] disabled:opacity-50">
            {regenerating ? 'Regenerating…' : 'Regenerate insights'}
          </button>
          <select className="h-8 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded px-3 text-xs flex-1 min-w-[9rem] sm:flex-none sm:w-48 focus:outline-none" value={activeTab} onChange={(e) => setActiveTab(e.target.value)}>
             <option>My Business</option>
             <option>A Specific Matter</option>
             <option>A Specific Client</option>
             <option>A Specific Attorney</option>
             <option>The Market</option>
          </select>
          <div className="flex bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded p-0.5">
             <button onClick={() => setTimeRange('7D')} className={`px-3 py-0.5 text-xs rounded ${timeRange === '7D' ? 'bg-[var(--bg-elevated)] shadow-sm text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>7D</button>
             <button onClick={() => setTimeRange('30D')} className={`px-3 py-0.5 text-xs rounded ${timeRange === '30D' ? 'bg-[var(--bg-elevated)] shadow-sm text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>30D</button>
             <button onClick={() => setTimeRange('90D')} className={`px-3 py-0.5 text-xs rounded ${timeRange === '90D' ? 'bg-[var(--bg-elevated)] shadow-sm text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>All</button>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden gap-4 lg:gap-6">
         <ConversationInbox
           agent="analyst"
           activeId={conversation?.id ?? null}
           onSelect={open}
           onNew={() => { startNew(); setInputValue(''); }}
           refreshKey={refreshKey}
         />
         <StrategicChat
           chatHistory={chatHistory}
           streamingContent={streaming}
           inputValue={inputValue}
           setInputValue={setInputValue}
           handleSend={handleSend}
           isTyping={busy}
           visibleInsights={visibleInsights}
           onDismissInsight={(id: string) => setDismissedInsights(prev => new Set(prev).add(id))}
         />
         <ContextPanel activeTab={activeTab} hasInteracted={hasInteracted} contextUsage={lastContextUsage} />
      </div>
    </div>
  );
}
