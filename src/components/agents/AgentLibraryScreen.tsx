import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../../lib/store';
import { Wrench, Sparkles, Search, ChevronRight, Lock, Briefcase, X, Zap } from 'lucide-react';
import { SPECIALISTS, CATEGORY_LABELS as BASE_CATEGORY_LABELS, SpecialistAgent } from '../../data/specialists';

type Category = 'recommended' | 'all' | 'research' | 'intake' | 'billing' | 'compliance';

const CATEGORY_LABELS: Record<Category, string> = {
  recommended: 'Recommended', all: 'All', ...BASE_CATEGORY_LABELS,
};

// Instant self-provisioning: requesting a specialist activates it right
// away — it's usable in the sidebar immediately, no review queue, no
// waiting state. "Human in the loop" here applies to what the agent
// PRODUCES (drafts, suggestions — still reviewed before anyone relies on
// them, see AiDisclaimer on every specialist screen), not to whether the
// agent exists. Previously this said requesting "creates a real, tracked
// request for review... nothing activates automatically" — that was true
// under the old review-queue model and is no longer accurate, so it's
// been rewritten rather than left stale.
const DEPLOYMENT_PATH = "Activating this is instant — it appears in your sidebar right away and is immediately usable, no review queue and no waiting period. What it produces (drafts, flags, suggestions) still needs your review before you rely on it, same as Operator and Analyst — activation isn't the same as trusting its output unchecked.";

function ActiveAgentCard({ to, icon: Icon, name, description }: { to: string; icon: any; name: string; description: string }) {
  return (
    <Link to={to} className="flex items-start gap-3 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-4 hover:border-[var(--border-strong)] transition-colors group">
      <div className="w-9 h-9 rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{name}</span>
          <span className="text-[10px] px-1.5 py-0.5 bg-[var(--signal-positive)]/10 text-[var(--signal-positive)] rounded-full">Active</span>
        </div>
        <div className="text-xs text-[var(--text-tertiary)] mt-1">{description}</div>
      </div>
      <ChevronRight className="w-4 h-4 text-[var(--text-tertiary)] group-hover:text-[var(--text-primary)] transition-colors shrink-0 mt-1" />
    </Link>
  );
}

function BestNextPickCard({ agent, onActivate }: { agent: SpecialistAgent; onActivate: () => void }) {
  return (
    <div className="border border-[var(--accent-secondary)]/30 bg-[var(--accent-secondary)]/5 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] rounded-full">{CATEGORY_LABELS[agent.category]}</span>
        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 bg-[var(--accent-secondary)]/15 text-[var(--accent-secondary)] rounded-full">Best next hire</span>
      </div>
      <div className="text-sm font-medium mb-1">{agent.name}</div>
      <p className="text-xs text-[var(--text-secondary)] mb-3">{agent.match}</p>
      <button onClick={onActivate} className="h-7 px-3 text-xs font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded hover:opacity-90 transition-opacity flex items-center gap-1">
        <Zap className="w-3 h-3" /> Activate agent
      </button>
    </div>
  );
}

function SpecialistCard({ agent, isActive, isRecommended, onActivate, onRemove }: { agent: SpecialistAgent; isActive: boolean; isRecommended: boolean; onActivate: () => void; onRemove: () => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`bg-[var(--bg-secondary)] border rounded-lg p-4 transition-colors ${expanded ? 'border-[var(--accent-secondary)]' : 'border-[var(--border-subtle)]'}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-center shrink-0">
            <agent.icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{agent.name}</span>
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] rounded-full">{CATEGORY_LABELS[agent.category]}</span>
            </div>
          </div>
        </div>
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] shrink-0">
          <Lock className="w-3 h-3" /> {isActive ? 'Active' : isRecommended ? 'Recommended' : 'Decision'}
        </span>
      </div>
      <p className="text-xs text-[var(--text-secondary)] mb-2">{agent.description}</p>
      <p className="text-xs text-[var(--text-tertiary)] italic mb-3">{agent.match}</p>

      {expanded && (
        <div className="mb-3 space-y-2">
          <div className="bg-[var(--bg-tertiary)] rounded-md p-3">
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1">Deployment Path</div>
            <p className="text-xs text-[var(--text-secondary)]">{DEPLOYMENT_PATH}</p>
          </div>
          <p className="text-xs text-[var(--text-tertiary)]">
            <span className="text-[var(--text-secondary)] font-medium">Access:</span> {agent.access}
          </p>
        </div>
      )}

      <div className="flex gap-2">
        {isActive ? (
          <>
            <Link to={`/agents/${agent.key}`} className="flex-1 h-8 text-xs font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded hover:opacity-90 transition-opacity flex items-center justify-center">
              Open agent
            </Link>
            <button
              onClick={onRemove}
              title="Remove this agent"
              className="h-8 px-3 text-xs font-medium border border-[var(--border-subtle)] rounded hover:bg-[var(--bg-tertiary)] hover:text-[var(--signal-negative)] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <button onClick={onActivate} className="flex-1 h-8 text-xs font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded hover:opacity-90 transition-opacity flex items-center justify-center gap-1">
            <Zap className="w-3 h-3" /> Activate agent
          </button>
        )}
        <button
          onClick={() => setExpanded(v => !v)}
          className="h-8 px-3 text-xs font-medium border border-[var(--border-subtle)] rounded hover:bg-[var(--bg-tertiary)] transition-colors whitespace-nowrap"
        >
          {expanded ? 'Hide details' : 'View details'}
        </button>
      </div>
    </div>
  );
}

export function AgentLibraryScreen() {
  const { matters, deadlines, agentRequests, requestAgent, removeAgentRequest } = useStore();
  const [category, setCategory] = useState<Category>('recommended');
  const [query, setQuery] = useState('');

  const isActive = (key: string) => agentRequests.some(r => r.agent_key === key);
  const requestIdOf = (key: string): string | null => agentRequests.find(r => r.agent_key === key)?.id ?? null;

  const recommendedKeys = useMemo(() => {
    const hourlyCount = matters.filter(m => m.billing_type === 'hourly').length;
    const activeCount = matters.filter(m => m.status === 'active').length;
    const criticalCount = deadlines.filter(d => d.is_critical && d.status === 'upcoming').length;
    return SPECIALISTS
      .filter(s => !isActive(s.key))
      .filter(s => s.relevantIf(hourlyCount, activeCount, criticalCount))
      .map(s => s.key);
  }, [matters, deadlines, agentRequests]);

  const bestPicks = SPECIALISTS.filter(s => recommendedKeys.includes(s.key)).slice(0, 3);
  const activeSpecialists = SPECIALISTS.filter(s => isActive(s.key));
  const totalActiveCount = 2 + activeSpecialists.length; // Operator + Analyst are always on, plus any activated specialists

  const filtered = SPECIALISTS
    .filter(s => category === 'all' ? true : category === 'recommended' ? recommendedKeys.includes(s.key) : s.category === category)
    .filter(s => query.trim() === '' || s.name.toLowerCase().includes(query.toLowerCase()) || CATEGORY_LABELS[s.category].toLowerCase().includes(query.toLowerCase()));

  const handleRemove = (key: string) => {
    const id = requestIdOf(key);
    if (id) removeAgentRequest(id);
  };

  return (
    <div className="max-w-5xl">
      <div className="flex items-start justify-between mb-1">
        <h2 className="text-xl font-medium">Agent Library</h2>
        <div className="flex items-center gap-2 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg px-3 py-1.5">
          <Briefcase className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
          <span className="text-xs text-[var(--text-secondary)]">{totalActiveCount} active staff</span>
        </div>
      </div>
      <p className="text-sm text-[var(--text-secondary)] mb-8">
        Your active AI agents, and specialists you can activate the moment the work in front of you needs one — no waiting period.
        Start with Operator for day-to-day work — add a specialist only once a specific job repeats enough to justify it.
      </p>

      {/* Best next picks + Your specialists (activate/remove at a glance) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="sm:col-span-2 border border-[var(--border-subtle)] rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-[var(--accent-secondary)]" />
            <h3 className="text-sm font-medium">Best next picks</h3>
          </div>
          <p className="text-xs text-[var(--text-tertiary)] mb-3">The shortest path to the right specialist, without browsing the full catalog first.</p>
          {bestPicks.length === 0 ? (
            <div className="text-xs text-[var(--text-tertiary)] py-4">Nothing stands out yet — your current setup doesn't clearly need a specialist right now.</div>
          ) : (
            <div className="space-y-2">
              {bestPicks.map(s => <BestNextPickCard key={s.key} agent={s} onActivate={() => requestAgent(s.key)} />)}
            </div>
          )}
        </div>

        <div className="border border-[var(--border-subtle)] rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-4 h-4 text-[var(--text-tertiary)]" />
            <h3 className="text-sm font-medium">Your specialists</h3>
          </div>
          <p className="text-xs text-[var(--text-tertiary)] mb-3">Active the moment you request one — remove any of these just as fast.</p>
          {activeSpecialists.length === 0 ? (
            <div className="text-xs text-[var(--text-tertiary)]">
              <div className="font-medium text-[var(--text-secondary)] mb-1">Nothing activated yet</div>
              Once you activate a specialist, it shows up here with one-click access and removal.
            </div>
          ) : (
            <div className="space-y-1.5">
              {activeSpecialists.map(s => (
                <div key={s.key} className="flex items-center gap-2 text-xs bg-[var(--bg-tertiary)] rounded px-2 py-1.5">
                  <Link to={`/agents/${s.key}`} className="flex items-center gap-2 flex-1 min-w-0 hover:text-[var(--text-primary)]">
                    <s.icon className="w-3 h-3 text-[var(--text-tertiary)] shrink-0" />
                    <span className="truncate">{s.name}</span>
                  </Link>
                  <button onClick={() => handleRemove(s.key)} title="Remove this agent" className="text-[var(--text-tertiary)] hover:text-[var(--signal-negative)] shrink-0">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mb-8">
        <div className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] mb-3">Active — {totalActiveCount}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ActiveAgentCard to="/operator" icon={Wrench} name="Operator" description="Your day-to-day right hand — drafts, triages, and tells you what's next." />
          <ActiveAgentCard to="/analyst" icon={Sparkles} name="Analyst" description="Your numbers-first advisor — reads your data and projects where things are heading." />
          {activeSpecialists.map(s => (
            <ActiveAgentCard key={s.key} to={`/agents/${s.key}`} icon={s.icon} name={s.name} description={s.description} />
          ))}
        </div>
      </div>

      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div className="text-xs uppercase tracking-wider text-[var(--text-tertiary)]">Specialists</div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[var(--text-tertiary)] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Filter by department"
                className="h-7 pl-8 pr-3 text-xs bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-full focus:outline-none w-40"
              />
            </div>
            <div className="flex gap-1.5">
              {(Object.keys(CATEGORY_LABELS) as Category[]).map(c => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`px-2.5 py-1 text-[11px] rounded-full transition-colors whitespace-nowrap ${category === c ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'}`}
                >
                  {CATEGORY_LABELS[c]}
                </button>
              ))}
            </div>
          </div>
        </div>
        {filtered.length === 0 ? (
          <div className="text-xs text-[var(--text-tertiary)] py-4">No specialists match that filter.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filtered.map(agent => (
              <SpecialistCard
                key={agent.key}
                agent={agent}
                isActive={isActive(agent.key)}
                isRecommended={recommendedKeys.includes(agent.key)}
                onActivate={() => requestAgent(agent.key)}
                onRemove={() => handleRemove(agent.key)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
