import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../../lib/store';
import { Wrench, Sparkles, Search, UserCheck, Clock as ClockIcon, FileSearch, FileText, ShieldAlert, Clock, ChevronRight, Lock, Briefcase, UserPlus } from 'lucide-react';

type Category = 'recommended' | 'all' | 'research' | 'intake' | 'billing' | 'compliance';

interface SpecialistAgent {
  key: string;
  name: string;
  category: Exclude<Category, 'all' | 'recommended'>;
  icon: any;
  description: string;
  match: string;
  relevantIf: (hourlyCount: number, activeCount: number, criticalCount: number) => boolean;
}

const SPECIALISTS: SpecialistAgent[] = [
  {
    key: 'legal_research', name: 'Legal Research Agent', category: 'research', icon: FileSearch,
    description: 'Pulls relevant case law, statutes, and precedent for a specific matter on request.',
    match: 'Every matter benefits from case-law support — always a reasonable next hire.',
    relevantIf: () => true,
  },
  {
    key: 'client_intake', name: 'Client Intake Agent', category: 'intake', icon: UserCheck,
    description: 'Structured intake questionnaire and initial fact-gathering before a consultation.',
    match: 'Matches firms with a dedicated Reception role or high intake volume.',
    relevantIf: () => true,
  },
  {
    key: 'billing_time_entry', name: 'Billing & Time Entry Agent', category: 'billing', icon: ClockIcon,
    description: 'Drafts time entry descriptions from raw notes and flags unbilled work nearing month-end.',
    match: 'Matches this firm: hourly-billed matters need consistent time entries.',
    relevantIf: (hourlyCount) => hourlyCount > 0,
  },
  {
    key: 'discovery_assistant', name: 'Discovery Assistant', category: 'research', icon: Search,
    description: 'Organizes and summarizes discovery documents for a matter.',
    match: 'Matches this firm: caseload is large enough that manual review is starting to slow things down.',
    relevantIf: (_, activeCount) => activeCount > 3,
  },
  {
    key: 'contract_review', name: 'Contract Review Agent', category: 'research', icon: FileText,
    description: 'Flags unusual clauses and deviations from standard templates in a draft contract.',
    match: 'Matches corporate/transactional practice areas.',
    relevantIf: () => true,
  },
  {
    key: 'deadline_compliance', name: 'Deadline Compliance Agent', category: 'compliance', icon: ShieldAlert,
    description: 'Cross-checks every open matter against jurisdiction-specific filing rules and flags at-risk deadlines.',
    match: 'Matches this firm: critical, statute-of-limitations-sensitive deadlines are on file right now.',
    relevantIf: (_, __, criticalCount) => criticalCount > 0,
  },
];

const CATEGORY_LABELS: Record<Category, string> = {
  recommended: 'Recommended', all: 'All', research: 'Research', intake: 'Intake', billing: 'Billing', compliance: 'Compliance',
};

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

function BestNextPickCard({ agent, onRequest }: { agent: SpecialistAgent; onRequest: () => void }) {
  return (
    <div className="border border-[var(--accent-secondary)]/30 bg-[var(--accent-secondary)]/5 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] rounded-full">{CATEGORY_LABELS[agent.category]}</span>
        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 bg-[var(--accent-secondary)]/15 text-[var(--accent-secondary)] rounded-full">Best next hire</span>
      </div>
      <div className="text-sm font-medium mb-1">{agent.name}</div>
      <p className="text-xs text-[var(--text-secondary)] mb-3">{agent.match}</p>
      <button onClick={onRequest} className="h-7 px-3 text-xs font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded hover:opacity-90 transition-opacity">
        Request agent
      </button>
    </div>
  );
}

function SpecialistCard({ agent, isRequested, isRecommended, onRequest }: { agent: SpecialistAgent; isRequested: boolean; isRecommended: boolean; onRequest: () => void }) {
  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-4">
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
          <Lock className="w-3 h-3" /> {isRequested ? 'Requested' : isRecommended ? 'Recommended' : 'Decision'}
        </span>
      </div>
      <p className="text-xs text-[var(--text-secondary)] mb-2">{agent.description}</p>
      <p className="text-xs text-[var(--text-tertiary)] italic mb-3">{agent.match}</p>
      {isRequested ? (
        <div className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] h-8">
          <Clock className="w-3.5 h-3.5" /> Requested — pending review
        </div>
      ) : (
        <button onClick={onRequest} className="w-full h-8 text-xs font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded hover:opacity-90 transition-opacity">
          Request agent
        </button>
      )}
    </div>
  );
}

export function AgentLibraryScreen() {
  const { attorneys, matters, deadlines, agentRequests, requestAgent } = useStore();
  const [category, setCategory] = useState<Category>('recommended');
  const [query, setQuery] = useState('');

  const isRequested = (key: string) => agentRequests.some(r => r.agent_key === key);

  const recommendedKeys = useMemo(() => {
    const hourlyCount = matters.filter(m => m.billing_type === 'hourly').length;
    const activeCount = matters.filter(m => m.status === 'active').length;
    const criticalCount = deadlines.filter(d => d.is_critical && d.status === 'upcoming').length;
    return SPECIALISTS
      .filter(s => !isRequested(s.key))
      .filter(s => s.relevantIf(hourlyCount, activeCount, criticalCount))
      .map(s => s.key);
  }, [matters, deadlines, agentRequests]);

  const bestPicks = SPECIALISTS.filter(s => recommendedKeys.includes(s.key)).slice(0, 3);
  const requestedAgents = SPECIALISTS.filter(s => isRequested(s.key));

  const filtered = SPECIALISTS
    .filter(s => category === 'all' ? true : category === 'recommended' ? recommendedKeys.includes(s.key) : s.category === category)
    .filter(s => query.trim() === '' || s.name.toLowerCase().includes(query.toLowerCase()) || CATEGORY_LABELS[s.category].toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="max-w-5xl">
      <div className="flex items-start justify-between mb-1">
        <h2 className="text-xl font-medium">Agent Library</h2>
        <div className="flex items-center gap-2 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg px-3 py-1.5">
          <Briefcase className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
          <span className="text-xs text-[var(--text-secondary)]">2 active staff</span>
        </div>
      </div>
      <p className="text-sm text-[var(--text-secondary)] mb-8">
        Your active AI agents, and specialists you can request when the work in front of you needs one.
        Start with Operator for day-to-day work — add a specialist only once a specific job repeats enough to justify it.
      </p>

      {/* Best next picks + Requested now */}
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
              {bestPicks.map(s => <BestNextPickCard key={s.key} agent={s} onRequest={() => requestAgent(s.key)} />)}
            </div>
          )}
        </div>

        <div className="border border-[var(--border-subtle)] rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <UserPlus className="w-4 h-4 text-[var(--text-tertiary)]" />
            <h3 className="text-sm font-medium">Requested now</h3>
          </div>
          <p className="text-xs text-[var(--text-tertiary)] mb-3">Anything staged for review stays one click away here.</p>
          {requestedAgents.length === 0 ? (
            <div className="text-xs text-[var(--text-tertiary)]">
              <div className="font-medium text-[var(--text-secondary)] mb-1">Nothing queued</div>
              Once you request an agent, it will show up here with a direct path back to the exact card.
            </div>
          ) : (
            <div className="space-y-1.5">
              {requestedAgents.map(s => (
                <div key={s.key} className="flex items-center gap-2 text-xs bg-[var(--bg-tertiary)] rounded px-2 py-1.5">
                  <Clock className="w-3 h-3 text-[var(--text-tertiary)] shrink-0" />
                  <span>{s.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mb-8">
        <div className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] mb-3">Active — 2</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ActiveAgentCard to="/operator" icon={Wrench} name="Operator" description="Your day-to-day right hand — drafts, triages, and tells you what's next." />
          <ActiveAgentCard to="/analyst" icon={Sparkles} name="Analyst" description="Your numbers-first advisor — reads your data and projects where things are heading." />
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
              <SpecialistCard key={agent.key} agent={agent} isRequested={isRequested(agent.key)} isRecommended={recommendedKeys.includes(agent.key)} onRequest={() => requestAgent(agent.key)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
