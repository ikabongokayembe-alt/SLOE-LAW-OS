import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../../lib/store';
import { Wrench, Sparkles, Search, UserCheck, Clock as ClockIcon, FileSearch, FileText, ShieldAlert, Clock, ChevronRight } from 'lucide-react';

type Category = 'all' | 'research' | 'intake' | 'billing' | 'compliance';

interface SpecialistAgent {
  key: string;
  name: string;
  category: Exclude<Category, 'all'>;
  icon: any;
  description: string;
  match: string;
}

const SPECIALISTS: SpecialistAgent[] = [
  {
    key: 'legal_research', name: 'Legal Research Agent', category: 'research', icon: FileSearch,
    description: 'Pulls relevant case law, statutes, and precedent for a specific matter on request.',
    match: 'Useful the moment any matter needs case-law support.',
  },
  {
    key: 'client_intake', name: 'Client Intake Agent', category: 'intake', icon: UserCheck,
    description: 'Structured intake questionnaire and initial fact-gathering before a consultation.',
    match: 'Matches firms with a dedicated Reception role or high intake volume.',
  },
  {
    key: 'billing_time_entry', name: 'Billing & Time Entry Agent', category: 'billing', icon: ClockIcon,
    description: 'Drafts time entry descriptions from raw notes and flags unbilled work nearing month-end.',
    match: 'Matches firms with hourly-billed matters.',
  },
  {
    key: 'discovery_assistant', name: 'Discovery Assistant', category: 'research', icon: Search,
    description: 'Organizes and summarizes discovery documents for a matter.',
    match: 'Useful once a caseload is large enough that manual review gets slow.',
  },
  {
    key: 'contract_review', name: 'Contract Review Agent', category: 'research', icon: FileText,
    description: 'Flags unusual clauses and deviations from standard templates in a draft contract.',
    match: 'Matches corporate/transactional practice areas.',
  },
  {
    key: 'deadline_compliance', name: 'Deadline Compliance Agent', category: 'compliance', icon: ShieldAlert,
    description: 'Cross-checks every open matter against jurisdiction-specific filing rules and flags at-risk deadlines.',
    match: 'Matches firms tracking statute-of-limitations-sensitive matters.',
  },
];

const CATEGORY_LABELS: Record<Category, string> = {
  all: 'All', research: 'Research', intake: 'Intake', billing: 'Billing', compliance: 'Compliance',
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

function SpecialistCard({ agent, isRequested, onRequest }: { agent: SpecialistAgent; isRequested: boolean; onRequest: () => void }) {
  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-4">
      <div className="flex items-center gap-3 mb-2">
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
  const { agentRequests, requestAgent } = useStore();
  const [category, setCategory] = useState<Category>('all');

  const isRequested = (key: string) => agentRequests.some(r => r.agent_key === key);
  const filtered = category === 'all' ? SPECIALISTS : SPECIALISTS.filter(s => s.category === category);

  return (
    <div className="max-w-4xl">
      <h2 className="text-xl font-medium mb-1">Agent Library</h2>
      <p className="text-sm text-[var(--text-secondary)] mb-8">
        Your active AI agents, and specialists you can request when the work in front of you needs one.
      </p>

      <div className="mb-8">
        <div className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] mb-3">Active — 2</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ActiveAgentCard to="/operator" icon={Wrench} name="Operator" description="Your day-to-day right hand — drafts, triages, and tells you what's next." />
          <ActiveAgentCard to="/analyst" icon={Sparkles} name="Analyst" description="Your numbers-first advisor — reads your data and projects where things are heading." />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase tracking-wider text-[var(--text-tertiary)]">Specialists — request when needed</div>
          <div className="flex gap-1.5">
            {(Object.keys(CATEGORY_LABELS) as Category[]).map(c => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`px-2.5 py-1 text-[11px] rounded-full transition-colors ${category === c ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'}`}
              >
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map(agent => (
            <SpecialistCard key={agent.key} agent={agent} isRequested={isRequested(agent.key)} onRequest={() => requestAgent(agent.key)} />
          ))}
        </div>
      </div>
    </div>
  );
}
