import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../../lib/store';
import { Sparkles, ChevronRight } from 'lucide-react';
import { SPECIALISTS } from '../../data/specialists';

// Deliberately demoted, per the Command Center clarity fix: this is
// upsell/marketing content, not a decision, and the full recommendation
// list it used to show inline (name + description + expandable picks)
// duplicated what Agent Library's own "Best next picks" section already
// does at /agents -- one line here, the real detail one click away,
// rather than a second full-weight card competing with real findings for
// attention. Count-only computation (not the actual picks) keeps this
// genuinely cheap.
export function AgentLibraryTeaserCard() {
  const { matters, deadlines, agentRequests } = useStore();

  const recommendedCount = useMemo(() => {
    const hourlyCount = matters.filter(m => m.billing_type === 'hourly').length;
    const activeCount = matters.filter(m => m.status === 'active').length;
    const criticalCount = deadlines.filter(d => d.is_critical && d.status === 'upcoming').length;
    return SPECIALISTS
      .filter(s => !agentRequests.some(r => r.agent_key === s.key))
      .filter(s => s.relevantIf(hourlyCount, activeCount, criticalCount))
      .length;
  }, [matters, deadlines, agentRequests]);

  return (
    <Link
      to="/agents"
      className="group flex items-center justify-between gap-3 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
    >
      <span className="flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5 shrink-0" />
        Agent Library — {2 + agentRequests.length} active{recommendedCount > 0 ? ` · ${recommendedCount} recommended next` : ''}
      </span>
      <ChevronRight className="w-3.5 h-3.5 shrink-0 group-hover:translate-x-0.5 transition-transform" />
    </Link>
  );
}
