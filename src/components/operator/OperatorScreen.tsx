import { useRef, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, Wrench } from 'lucide-react';
import { useStore } from '../../lib/store';
import { streamGeminiContent } from '../../lib/gemini';
import { operatorChatPrompt } from '../../lib/prompts';

const SUGGESTIONS = [
  'Draft a client update for a matter with no activity in 5 days',
  "What should I prioritize today?",
  'Summarize my deadlines due this week',
];

export function OperatorScreen() {
  const { matters, deadlines, parties, conflictChecks } = useStore();
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [chatHistory, streamingContent]);

  const handleSend = async (overrideText?: string) => {
    const text = overrideText ?? inputValue;
    if (!text.trim() || isTyping) return;
    setInputValue('');
    setChatHistory(prev => [...prev, { role: 'user', content: text }]);
    setIsTyping(true);
    setStreamingContent('');
    try {
      const full = await streamGeminiContent(
        operatorChatPrompt(text, chatHistory, { matters, deadlines, parties, conflictChecks }),
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

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] -mx-4 md:-mx-8 -mt-6">
      <div className="h-16 bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)] px-4 md:px-8 flex items-center gap-2 shrink-0">
        <Wrench className="w-4 h-4 text-[var(--text-secondary)]" />
        <h2 className="text-sm font-medium">Operator</h2>
        <span className="text-xs text-[var(--text-tertiary)]">— hands-on help getting things done today</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 md:px-8 py-6 max-w-3xl mx-auto w-full">
        {chatHistory.length === 0 && !isTyping && (
          <div className="space-y-2">
            <p className="text-xs text-[var(--text-tertiary)] mb-3">Try asking:</p>
            {SUGGESTIONS.map(s => (
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
            placeholder="Ask the Operator to draft, summarize, or figure out what's next…"
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
