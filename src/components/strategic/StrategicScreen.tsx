import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../../lib/store';
import { callGemini, streamGeminiContent } from '../../lib/gemini';
import { strategicChatPrompt, strategicInsightsPrompt } from '../../lib/prompts';

import { StrategicChat } from './StrategicChat';
import { ContextPanel } from './ContextPanel';

export function StrategicScreen() {
  const { matters, deadlines, parties, conflictChecks, insights, addInsights } = useStore();
  const businessInsights = useMemo(() => insights.filter((i: any) => i.scope !== 'market'), [insights]);

  const [activeTab, setActiveTab] = useState('My Business');
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'assistant', content: string }[]>([]);
  const [timeRange, setTimeRange] = useState('30D');
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [dismissedInsights, setDismissedInsights] = useState<Set<string>>(new Set());
  const [regenerating, setRegenerating] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

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
    if (!textToSend.trim() || isTyping) return;

    const userMsg = textToSend;
    setInputValue('');
    setChatHistory(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsTyping(true);
    setStreamingContent('');

    const contextContext = { matters, deadlines, parties, conflictChecks };

    try {
      const fullResponse = await streamGeminiContent(
         strategicChatPrompt(userMsg, chatHistory, contextContext),
         (chunk) => { setStreamingContent(chunk); }
      );
      setChatHistory(prev => [...prev, { role: 'assistant', content: fullResponse }]);
    } catch (e) {
      setChatHistory(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error analyzing your data.' }]);
    }
    setStreamingContent('');
    setIsTyping(false);
  };

  const regenerateInsights = async () => {
    setRegenerating(true);
    try {
      const res = await callGemini(strategicInsightsPrompt({ matters, deadlines, parties, conflictChecks }));
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
    <div className="flex flex-col h-[calc(100vh-140px)]">
      <div className="flex justify-between items-start mb-6">
        <div>
           <h2 className="text-xl font-medium mb-1">Analyst</h2>
           <p className="text-sm text-[var(--text-secondary)] font-mono">Patterns and recommendations from your operating data</p>
        </div>
        <div className="flex space-x-3 items-center">
          <button onClick={regenerateInsights} disabled={regenerating} className="h-8 px-3 text-xs rounded bg-[var(--bg-tertiary)] border border-[var(--border-default)] hover:bg-[var(--bg-elevated)] disabled:opacity-50">
            {regenerating ? 'Regenerating…' : 'Regenerate insights'}
          </button>
          <select className="h-8 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded px-3 text-xs w-48 focus:outline-none" value={activeTab} onChange={(e) => setActiveTab(e.target.value)}>
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

      <div className="flex flex-1 overflow-hidden space-x-6">
         <StrategicChat
           chatHistory={chatHistory}
           streamingContent={streamingContent}
           inputValue={inputValue}
           setInputValue={setInputValue}
           handleSend={handleSend}
           isTyping={isTyping}
           visibleInsights={visibleInsights}
           onDismissInsight={(id: string) => setDismissedInsights(prev => new Set(prev).add(id))}
         />
         <ContextPanel activeTab={activeTab} hasInteracted={hasInteracted} />
      </div>
    </div>
  );
}
