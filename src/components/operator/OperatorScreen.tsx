import { useRef, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { Send, Wrench } from 'lucide-react';
import { useStore } from '../../lib/store';
import { streamGeminiContent } from '../../lib/gemini';
import { operatorChatPrompt } from '../../lib/prompts';
import { buildFirmContext } from '../../lib/contextBuilder';
import { AiDisclaimer } from '../shared/AiDisclaimer';
import { ConversationInbox } from '../agents/ConversationInbox';
import { useConversationThread } from '../../lib/useConversationThread';
import { SendEmailModal } from '../communications/SendEmailModal';
import { tryComposeEmail, ComposedEmail } from '../../lib/emailCompose';

// Same budget the old inline `.substring(0, 3000)` used — see
// contextBuilder.ts for why what fills it changed, not the size.
const CHAT_CONTEXT_BUDGET = 3000;

const SUGGESTIONS = [
  'Draft a client update for a matter with no activity in 5 days',
  "What should I prioritize today?",
  'Summarize my deadlines due this week',
];

export function OperatorScreen() {
  const { matters, deadlines, parties, conflictChecks, firm, clientInvites, communications } = useStore();
  const [inputValue, setInputValue] = useState('');
  const [emailDraft, setEmailDraft] = useState<ComposedEmail | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Bumped on every write so the rail refetches — see ConversationInbox.
  const [refreshKey, setRefreshKey] = useState(0);
  const bumpRail = useCallback(() => setRefreshKey(k => k + 1), []);
  const { conversation, messages, streaming, busy, open, startNew, send } =
    useConversationThread('operator', bumpRail);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streaming]);

  // Arriving from a handoff (e.g. Deadline detail panel) with a real pre-filled query
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) {
      handleSend(q);
      setSearchParams({}, { replace: true });
    }
  }, []);

  const handleSend = async (overrideText?: string) => {
    const text = overrideText ?? inputValue;
    if (!text.trim() || busy) return;
    setInputValue('');

    // Checked BEFORE the normal reply, not after: if this turns out to
    // be an email request, the Operator doesn't also generate a prose
    // answer to the same message via a second model call. See
    // emailCompose.ts for the two-pass classify (cheap, every message)
    // + compose (only on a real email request) split, and for why the
    // recipient address is resolved in code and never by the model.
    const composed = await tryComposeEmail(text, { matters, parties, clientInvites, communications });
    if (composed) {
      const ack = composed.recipientResolved
        ? `I've drafted an email to ${composed.partyName ?? 'the recipient'} — review it in the panel that just opened before sending.`
        : `I've drafted the email content, but there's no email address on file for ${composed.partyName ?? 'that person'} — I've opened the draft so you can add one and review before sending.`;
      // A static reply, not a second Gemini call: `run` only needs to
      // resolve to text, and reusing send() here keeps this turn on the
      // exact same persistence/unread path as every other message.
      await send(text, async (_history, onChunk) => { onChunk(ack); return ack; });
      setEmailDraft(composed);
      return;
    }

    // The context is rebuilt per message rather than per conversation:
    // matters and deadlines move while a thread is open, and a reply
    // should reflect the caseload as it is now, not as it was when the
    // thread started.
    send(text, (history, onChunk) => {
      const built = buildFirmContext({
        matters, deadlines, parties, conflictChecks,
        firm_jurisdiction: { country: firm?.country ?? null, region: firm?.region ?? null },
      }, CHAT_CONTEXT_BUDGET);
      return streamGeminiContent(operatorChatPrompt(text, history, built.text), onChunk, 'operator_chat');
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-56px)] -mx-4 md:-mx-8 -mt-6">
      {emailDraft && (
        <SendEmailModal
          onClose={() => setEmailDraft(null)}
          defaultMatterId={emailDraft.matterId ?? undefined}
          defaultTo={emailDraft.to || undefined}
          defaultSubject={emailDraft.subject}
          defaultBody={emailDraft.body}
        />
      )}
      <div className="min-h-[4rem] bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)] px-4 md:px-8 py-2 sm:py-0 flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Wrench className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
          <h2 className="text-sm font-medium shrink-0">Operator</h2>
          <span className="text-xs text-[var(--text-tertiary)] truncate">
            {conversation ? `— ${conversation.title}` : '— hands-on help getting things done today'}
          </span>
        </div>
        <AiDisclaimer className="shrink-0 sm:ml-2" />
      </div>

      {/* Rail stacks above the thread below lg, same treatment the
          Analyst context panel got — a 288px rail beside a chat at
          375px leaves neither usable. */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0">
        <ConversationInbox
          agent="operator"
          activeId={conversation?.id ?? null}
          onSelect={open}
          onNew={() => { startNew(); setInputValue(''); }}
          refreshKey={refreshKey}
        />

        <div className="flex flex-col flex-1 min-h-0">
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 md:px-8 py-6 max-w-3xl mx-auto w-full">
            {messages.length === 0 && !busy && (
              <div className="space-y-2">
                <p className="text-xs text-[var(--text-tertiary)] mb-3">
                  {conversation ? 'No messages in this conversation yet.' : 'Try asking:'}
                </p>
                {!conversation && SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => handleSend(s)}
                    className="block w-full text-left px-4 py-2.5 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg text-sm hover:bg-[var(--bg-tertiary)] transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div className="space-y-4">
              {messages.map(m => (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm ${m.role === 'user' ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]' : 'bg-[var(--bg-secondary)] border border-[var(--border-subtle)]'}`}>
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                </div>
              ))}
              {busy && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-lg px-4 py-2.5 text-sm bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
                    <ReactMarkdown>{streaming || '…'}</ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-[var(--border-subtle)] p-4 md:p-6 max-w-3xl mx-auto w-full">
            <div className="flex gap-2">
              <textarea
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={conversation ? 'Reply in this conversation…' : 'Ask the Operator to draft, summarize, or figure out what\'s next…'}
                rows={1}
                aria-label="Message the Operator"
                className="flex-1 resize-none h-10 px-3 py-2.5 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg text-sm focus:outline-none"
              />
              <button
                onClick={() => handleSend()}
                disabled={busy || !inputValue.trim()}
                aria-label="Send"
                className="h-10 w-10 flex items-center justify-center bg-[var(--text-primary)] text-[var(--bg-primary)] rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
