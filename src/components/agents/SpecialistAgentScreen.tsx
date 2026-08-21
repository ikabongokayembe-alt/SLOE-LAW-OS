import { useRef, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { Send, X } from 'lucide-react';
import { useStore } from '../../lib/store';
import { streamGeminiContent } from '../../lib/gemini';
import { specialistChatPrompt } from '../../lib/prompts';
import { buildFirmContext } from '../../lib/contextBuilder';
import { AiDisclaimer } from '../shared/AiDisclaimer';
import { getSpecialist, ContextKey } from '../../data/specialists';
import { SendEmailModal } from '../communications/SendEmailModal';
import { tryComposeEmail, ComposedEmail } from '../../lib/emailCompose';

// Same budget the old inline `.substring(0, 3000)` used — see
// contextBuilder.ts for why what fills it changed, not the size.
const CHAT_CONTEXT_BUDGET = 3000;

// Parameterized specialist chat screen — one component for all six
// specialists (and any added later), reusing the exact same chat
// UI/streaming logic as OperatorScreen rather than duplicating it per
// agent. What varies per agent: the system prompt (specialistChatPrompt,
// keyed by agent_key) and which slice of firm data it's grounded in
// (contextKeys, from the shared catalog) — not the screen itself.
export function SpecialistAgentScreen() {
  const { agentKey } = useParams<{ agentKey: string }>();
  const navigate = useNavigate();
  const { matters, deadlines, parties, conflictChecks, documents, practiceAreas, firm, agentRequests, removeAgentRequest, clientInvites, communications } = useStore();

  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [emailDraft, setEmailDraft] = useState<ComposedEmail | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [chatHistory, streamingContent]);

  // Reset the conversation when navigating between specialists (e.g. via
  // the sidebar) — otherwise the Contract Review Agent's chat would carry
  // over into the Discovery Assistant's screen.
  useEffect(() => {
    setChatHistory([]);
    setInputValue('');
    setStreamingContent('');
  }, [agentKey]);

  const specialist = agentKey ? getSpecialist(agentKey) : undefined;
  const requestRow = agentRequests.find(r => r.agent_key === agentKey);

  if (!specialist) {
    return (
      <div className="max-w-2xl">
        <h2 className="text-xl font-medium mb-2">Unknown agent</h2>
        <p className="text-sm text-[var(--text-secondary)] mb-4">"{agentKey}" isn't a specialist in the catalog.</p>
        <Link to="/agents" className="text-sm text-[var(--accent-secondary)] hover:underline">← Back to Agent Library</Link>
      </div>
    );
  }

  const fullData: Record<ContextKey, any> = { matters, deadlines, parties, conflictChecks, documents, practiceAreas };
  const context: any = {
    firm_jurisdiction: { country: firm?.country ?? null, region: firm?.region ?? null },
  };
  for (const key of specialist.contextKeys) context[key] = fullData[key];

  const handleSend = async (overrideText?: string) => {
    const text = overrideText ?? inputValue;
    if (!text.trim() || isTyping) return;
    setInputValue('');
    setChatHistory(prev => [...prev, { role: 'user', content: text }]);
    setIsTyping(true);
    setStreamingContent('');

    // Same email-compose branch as Operator/Analyst, applied once here
    // since SpecialistAgentScreen is the one shared component behind
    // every specialist — wiring it here covers all six, not just this
    // agent. Checked before the specialist's own model call so a
    // detected email request doesn't ALSO get answered as prose.
    try {
      setDraftingStatus('Analyzing request…');
      const composed = await tryComposeEmail(
        text,
        { matters, parties, clientInvites, communications },
        (status) => setDraftingStatus(status)
      );
      if (composed) {
        const ack = composed.recipientResolved
          ? `I've drafted an email to ${composed.partyName ?? 'the recipient'} — review it in the panel that just opened before sending.`
          : `I've drafted the email content, but there's no email address on file for ${composed.partyName ?? 'that person'} — I've opened the draft so you can add one and review before sending.`;
        setChatHistory(prev => [...prev, { role: 'assistant', content: ack }]);
        setEmailDraft(composed);
        setStreamingContent('');
        setIsTyping(false);
        return;
      }
    } finally {
      setDraftingStatus(null);
    }

    try {
      const built = buildFirmContext(context, CHAT_CONTEXT_BUDGET);
      const full = await streamGeminiContent(
        specialistChatPrompt(specialist.key, text, chatHistory, built.text),
        chunk => setStreamingContent(chunk),
        'specialist_agent'
      );
      setChatHistory(prev => [...prev, { role: 'assistant', content: full }]);
    } catch {
      setChatHistory(prev => [...prev, { role: 'assistant', content: "Sorry, I couldn't complete that — try again in a moment." }]);
    }
    setStreamingContent('');
    setIsTyping(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleRemove = async () => {
    if (!requestRow) return;
    await removeAgentRequest(requestRow.id);
    navigate('/agents');
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
      <div className="h-16 bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)] px-4 md:px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-center">
            <specialist.icon className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-medium">{specialist.name}</h2>
            <p className="text-xs text-[var(--text-tertiary)]">{specialist.roleName}</p>
          </div>
        </div>
        <AiDisclaimer />
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 md:px-8 py-6 max-w-3xl mx-auto w-full">
        <div className="space-y-4">
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-lg px-4 py-2.5 text-sm bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
              <ReactMarkdown>{`Hello! I'm your ${specialist.name}. ${specialist.description} How can I assist you with your active matters today?`}</ReactMarkdown>
            </div>
          </div>

          {chatHistory.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm ${m.role === 'user' ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]' : 'bg-[var(--bg-secondary)] border border-[var(--border-subtle)]'}`}>
                <ReactMarkdown>{m.content}</ReactMarkdown>
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-lg px-4 py-2.5 text-sm bg-[var(--bg-secondary)] border border-[var(--border-subtle)] flex items-center gap-2">
                {streamingContent ? (
                  <ReactMarkdown>{streamingContent}</ReactMarkdown>
                ) : (
                  <>
                    <div className="w-2 h-2 rounded-full bg-[var(--accent-primary)] animate-pulse shrink-0" />
                    <span className="text-xs text-[var(--text-secondary)] italic">
                      {draftingStatus || 'Analyzing request & drafting response…'}
                    </span>
                  </>
                )}
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
            placeholder={`Ask the ${specialist.name}…`}
            rows={1}
            className="flex-1 resize-none h-10 px-3 py-2.5 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg text-sm focus:outline-none"
          />
          <button
            onClick={() => handleSend()}
            disabled={isTyping || !inputValue.trim()}
            className="h-10 w-10 flex items-center justify-center bg-[var(--text-primary)] text-[var(--bg-primary)] rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
