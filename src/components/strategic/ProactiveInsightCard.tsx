import { Insight } from '../../types';
import { AlertTriangle, Sparkles, BarChart2 } from 'lucide-react';

export function ProactiveInsightCard({ insight, onDismiss }: { insight: Insight, onDismiss: () => void }) {
  const isRisk = insight.type === 'risk';
  const isOpp = insight.type === 'opportunity';
  
  const Icon = isRisk ? AlertTriangle : isOpp ? Sparkles : BarChart2;
  const iColor = isRisk ? 'text-[var(--signal-warning)]' : isOpp ? 'text-[var(--signal-positive)]' : 'text-[var(--accent-secondary)]';

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-6">
       <div className="flex items-center space-x-2 mb-4">
          <Icon className={`w-4 h-4 ${iColor}`} />
          <span className="text-[11px] uppercase tracking-widest font-mono text-[var(--text-secondary)]">Hidden {insight.type}</span>
       </div>
       <h3 className="text-lg font-medium mb-3">{insight.headline}</h3>
       <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-6">{insight.body}</p>
       
       <div className="flex space-x-3">
         {insight.suggested_actions?.map((btn, i) => (
           <button 
             key={i} 
             onClick={btn.action_type === 'DISMISS' ? onDismiss : undefined}
             className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
               i === 0 ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:bg-[var(--border-strong)]' : 
               'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
             }`}
           >
             {btn.label}
           </button>
         ))}
       </div>
    </div>
  );
}
