import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../../lib/store';
import { Sparkles, ChevronRight } from 'lucide-react';
import { SPECIALISTS } from '../../data/specialists';

export function AgentLibraryTeaserCard() {
  const { matters, deadlines, agentRequests } = useStore();
  const [expanded, setExpanded] = useState(false);

  const recommended = useMemo(() => {
    const hourlyCount = matters.filter(m => m.billing_type === 'hourly').length;
    const activeCount = matters.filter(m => m.status === 'active').length;
    const criticalCount = deadlines.filter(d => d.is_critical && d.status === 'upcoming').length;
    return SPECIALISTS
      .filter(s => !agentRequests.some(r => r.agent_key === s.key))
      .filter(s => s.relevantIf(hourlyCount, activeCount, criticalCount))
      .slice(0, 3);
  }, [matters, deadlines, agentRequests]);

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[var(--accent-secondary)]" />
          <h3 className="text-sm font-medium">Agent Library</h3>
        </div>
        <span className="text-xs text-[var(--text-tertiary)]">{2 + agentRequests.length} active now · {recommended.length} recommended next</span>
      </div>
      <p className="text-xs text-[var(--text-secondary)] mb-3">
        Operator and Analyst are already working for you. Activating a specialist is instant — add one only once a specific job repeats enough to justify it.
      </p>

      {recommended.length > 0 && (
        <button onClick={() => setExpanded(v => !v)} className="text-xs font-medium text-[var(--accent-secondary)] hover:underline mb-3 flex items-center gap-1">
          {expanded ? 'Hide' : `Show recommendations (${recommended.length})`}
          <ChevronRight className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </button>
      )}

      {expanded && (
        <div className="space-y-1.5 mb-4">
          {recommended.map(s => (
            <div key={s.key} className="text-xs text-[var(--text-secondary)] px-2 py-1.5 bg-[var(--bg-tertiary)] rounded">{s.name}</div>
          ))}
        </div>
      )}

      <Link to="/agents" className="block w-full h-9 flex items-center justify-center text-xs font-medium border border-[var(--border-subtle)] rounded hover:bg-[var(--bg-tertiary)] transition-colors">
        View full agent library
      </Link>
    </div>
  );
}
