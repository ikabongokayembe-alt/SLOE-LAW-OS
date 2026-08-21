import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../../lib/store';
import { Bot, ChevronDown, ChevronUp, ArrowRight, Sparkles, Plus, CheckCircle2 } from 'lucide-react';
import { SPECIALISTS, SpecialistAgent } from '../../data/specialists';
import { useToast } from '../../lib/toast';

export function AgentLibraryTeaserCard() {
  const { matters, deadlines, agentRequests, requestAgent } = useStore();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [provisioningKey, setProvisioningKey] = useState<string | null>(null);

  const activeAgentCount = 2 + agentRequests.length; // Operator + Analyst + provisioned specialists

  const recommendedSpecialists = useMemo(() => {
    const hourlyCount = matters.filter(m => m.billing_type === 'hourly').length;
    const activeCount = matters.filter(m => m.status === 'active').length;
    const criticalCount = deadlines.filter(d => d.is_critical && d.status === 'upcoming').length;
    return SPECIALISTS
      .filter(s => !agentRequests.some(r => r.agent_key === s.key))
      .filter(s => s.relevantIf(hourlyCount, activeCount, criticalCount));
  }, [matters, deadlines, agentRequests]);

  const topRecommendation = recommendedSpecialists[0] || null;

  const handleHire = async (spec: SpecialistAgent) => {
    setProvisioningKey(spec.key);
    try {
      await requestAgent(spec.key);
      showToast('success', `Provisioned ${spec.name}. Added to AI Agents menu.`);
      navigate(`/agents/${spec.key}`);
    } catch (err: any) {
      showToast('error', err.message || 'Could not provision AI Agent.');
      setProvisioningKey(null);
    }
  };

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-4">
      {/* Header zone */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] border border-[var(--accent-primary)]/20 rounded-lg shrink-0 mt-0.5">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Add a specialist AI Agent</h3>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              {activeAgentCount} active now{recommendedSpecialists.length > 0 ? ` · ${recommendedSpecialists.length} recommended for this firm` : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Context & Top Recommendation */}
      <div className="bg-[var(--bg-tertiary)]/60 border border-[var(--border-subtle)] rounded-md p-3 text-xs space-y-1.5">
        <p className="text-[var(--text-secondary)]">
          AI Agents activate only on explicit approval, never automatically.
        </p>
        {topRecommendation && (
          <p className="text-[var(--text-tertiary)]">
            <span className="font-medium text-[var(--text-primary)]">Top recommendation:</span> {topRecommendation.name} — {topRecommendation.match}
          </p>
        )}
      </div>

      {/* Inline expanded recommendations */}
      {expanded && recommendedSpecialists.length > 0 && (
        <div className="space-y-2 pt-1 border-t border-[var(--border-subtle)]">
          <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-tertiary)] block mb-2">
            RECOMMENDED AI AGENTS ({recommendedSpecialists.length})
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {recommendedSpecialists.map(spec => (
              <div
                key={spec.key}
                className="bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg p-3 flex flex-col justify-between space-y-2"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <spec.icon className="w-4 h-4 text-[var(--accent-secondary)] shrink-0" />
                    <span className="text-xs font-semibold text-[var(--text-primary)]">{spec.name}</span>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2">{spec.description}</p>
                </div>
                <button
                  onClick={() => handleHire(spec)}
                  disabled={provisioningKey === spec.key}
                  className="h-7 px-3 bg-[var(--text-primary)] text-[var(--bg-primary)] rounded text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-1 w-full"
                >
                  <Plus className="w-3 h-3" />
                  {provisioningKey === spec.key ? 'Provisioning…' : 'Add to Workspace'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Distinct Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--border-subtle)]">
        {recommendedSpecialists.length > 0 ? (
          <button
            onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-primary)] hover:text-[var(--accent-secondary)] transition-colors"
          >
            {expanded ? (
              <>
                <span>Hide recommendations</span>
                <ChevronUp className="w-3.5 h-3.5" />
              </>
            ) : (
              <>
                <span>Show recommendations ({recommendedSpecialists.length})</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        ) : (
          <span className="text-xs text-[var(--text-tertiary)]">All recommended AI Agents active</span>
        )}

        <Link
          to="/agents"
          className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors ml-auto"
        >
          <span>View full AI Agent library</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
