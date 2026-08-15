import { useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send } from 'lucide-react';
import { ProactiveInsightCard } from './ProactiveInsightCard';
import { Insight } from '../../types';

export function StrategicChat({ 
  chatHistory, 
  streamingContent, 
  inputValue, 
  setInputValue, 
  handleSend, 
  isTyping, 
  visibleInsights, 
  onDismissInsight 
}: any) {
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasInteracted = chatHistory.length > 0 || visibleInsights.length < 3; // roughly

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory, streamingContent]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="w-[65%] flex flex-col relative bg-[var(--bg-primary)]">
      <div className="flex-1 overflow-y-auto pr-4 pb-20 space-y-6" ref={scrollRef}>
         {!hasInteracted && visibleInsights.map((ins: Insight) => (
            <ProactiveInsightCard key={ins.id} insight={ins} onDismiss={() => onDismissInsight(ins.id)} />
         ))}

         {chatHistory.map((msg: any, idx: number) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
               <div className={`max-w-[85%] text-sm leading-relaxed p-5 ${msg.role === 'user' ? 'bg-[var(--accent-secondary)]/20 rounded-[12px_12px_4px_12px]' : 'bg-[var(--bg-tertiary)] rounded-[4px_12px_12px_12px] border border-[var(--border-subtle)]'}`}>
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-[var(--bg-elevated)]">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                     msg.content
                  )}
               </div>
            </div>
         ))}

         {streamingContent && (
            <div className="flex justify-start">
               <div className="max-w-[85%] text-sm leading-relaxed p-5 bg-[var(--bg-tertiary)] rounded-[4px_12px_12px_12px] border border-[var(--border-subtle)]">
                  <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed">
                    <ReactMarkdown>{streamingContent}</ReactMarkdown>
                  </div>
               </div>
            </div>
         )}
      </div>

      <div className={`absolute bottom-0 left-0 right-4 transition-all duration-300`}>
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-xl shadow-[var(--shadow-elevated)] relative flex items-end">
          <textarea 
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a strategic question about your business..."
            className="w-full min-h-[64px] max-h-[160px] bg-transparent resize-none p-5 text-sm focus:outline-none placeholder:text-[var(--text-tertiary)] scrollbar-none"
          />
          <button
            onClick={() => handleSend()}
            disabled={!inputValue.trim() || isTyping}
            className="absolute right-4 bottom-4 w-8 h-8 rounded-md bg-[var(--text-primary)] text-[var(--bg-primary)] flex items-center justify-center disabled:opacity-50 hover:bg-white transition-colors"
          >
            <Send className="w-4 h-4 ml-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
