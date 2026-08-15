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
  const { matters, deadlines, parties, conflictChecks, documents, practiceAreas, firm, agentRequests, removeAgentRequest } = useStore();

  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
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
    try {
      const built = buildFirmContext(context, CHAT_CONTEXT_BUDGET);
      const full = await streamGeminiContent(
        specialistChatPrompt(specialist.key, text, chatHistory, built.text),
        chunk => setStreamingContent(chunk)
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
    <div className="flex flex-col h-[calc(100vh-56px)] -mx-4 md:-mx-8 -mt-6">
      <div className="min-h-[4rem] bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)] px-4 md:px-8 py-2 sm:py-0 flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <specialist.icon className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
          <h2 className="text-sm font-medium truncate">{specialist.name}</h2>
          <span className="text-xs text-[var(--text-tertiary)] truncate hidden sm:inline">— {specialist.description}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <AiDisclaimer />
          <button
            onClick={handleRemove}
            title="Remove this agent"
            className="flex items-center gap-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--signal-negative)] transition-colors"
          >
            <X className="w-3.5 h-3.5" /> Remove
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 md:px-8 py-6 max-w-3xl mx-auto w-full">
        {chatHistory.length === 0 && !isTyping && (
          <div className="text-xs text-[var(--text-tertiary)] mb-3">
            <p className="mb-1">{specialist.description}</p>
            <p>{specialist.access}</p>
          </div>
        )}
        <div className="space-y-4">
          {chatHistory.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm ${m.role === 'user' ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]' : 'bg-[var(--bg-secondary)] border border-[var(--border-subtle)]'}`}>
                <ReactMarkdown>{m.content}</ReactMarkdown>
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-lg px-4 py-2.5 text-sm bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
                <ReactMarkdown>{streamingContent || '…'}</ReactMarkdown>
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
