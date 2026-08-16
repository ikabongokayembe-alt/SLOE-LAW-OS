import { useMemo, useState } from 'react';
import { useStore } from '../../lib/store';
import { AgentLibraryTeaserCard } from './AgentLibraryTeaserCard';
import { Link, useNavigate } from 'react-router-dom';
import { Sparkles, ShieldAlert, Banknote, MessageCircle, Info, ArrowRight } from 'lucide-react';
import { topUrgentActions, UrgentAction, ConsequenceClass } from '../../lib/urgentActions';

function daysUntil(dateStr: string): number {
  return Math.round((new Date(dateStr).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000);
}

// Counts are context, not the point of this screen, so they render as a
// single quiet strip rather than four cards competing with the decisions
// above them. The sparklines that used to sit here are gone deliberately:
// they were drawn from different series than the numbers beside them, so
// "Pending conflict checks 0" appeared above a rising line. A trend that
// contradicts its own figure is worse than no trend.
function StatStrip({ items }: { items: { label: string; value: number; to: string; alarming?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg">
      {items.map(s => (
        <Link key={s.label} to={s.to} className="group flex items-baseline gap-2 min-w-0">
          <span className={`text-sm font-medium tabular-nums ${s.alarming && s.value > 0 ? 'text-[var(--signal-negative)]' : 'text-[var(--text-primary)]'}`}>
            {s.value}
          </span>
          <span className="text-xs text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)] transition-colors truncate">
            {s.label}
          </span>
        </Link>
      ))}
    </div>
  );
}

const CONSEQUENCE_META: Record<ConsequenceClass, { label: string; icon: any; color: string }> = {
  professional: { label: 'Professional risk', icon: ShieldAlert, color: 'var(--signal-negative)' },
  revenue:      { label: 'Revenue',           icon: Banknote,   color: 'var(--accent-primary)' },
  relationship: { label: 'Client',            icon: MessageCircle, color: 'var(--accent-secondary)' },
};

function ActionCard({ action }: { action: UrgentAction }) {
  const meta = CONSEQUENCE_META[action.consequence];
  const Icon = meta.icon;
  return (
    <Link
      to={action.href}
      className="group block bg-[var(--bg-secondary)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] rounded-lg p-4 transition-colors"
      // The whole card is the target. The previous Urgent panel rendered
      // its rows as plain divs styled like list items — they looked
      // actionable and did nothing when clicked.
      style={{ borderLeftColor: meta.color, borderLeftWidth: 3 }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: meta.color }} />
        <span className="text-[10px] uppercase tracking-wider font-mono" style={{ color: meta.color }}>
          {meta.label}
        </span>
      </div>

      <div className="text-sm font-medium mb-1">{action.title}</div>
      <div className="text-xs text-[var(--text-secondary)] mb-2">{action.detail}</div>

      <div className="flex items-start gap-1.5 text-xs text-[var(--text-tertiary)]">
        {action.grounding === 'general' && <Info className="w-3 h-3 shrink-0 mt-0.5" />}
        <span>
          {/* Anything not derived purely from stored values is labelled,
              so a general risk framing is never mistaken for a verified
              jurisdictional rule. Only the SOL engine's checked citations
              are presented as settled. */}
          {action.grounding === 'general' && (
            <span className="text-[var(--text-secondary)] font-medium">General guidance — not jurisdiction-verified. </span>
          )}
          {action.reasoning}
        </span>
      </div>

      <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--text-primary)]">
        {action.ctaLabel}
        <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
      </span>
    </Link>
  );
}

export function DashboardScreen() {
  const { matters, deadlines, conflictChecks, documents, timeEntries, communications, parties } = useStore();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const actions = useMemo(
    () => topUrgentActions({ matters, deadlines, documents, timeEntries, communications, conflictChecks, parties }, 5),
    [matters, deadlines, documents, timeEntries, communications, conflictChecks, parties],
  );

  const stats = useMemo(() => {
    const active = matters.filter(m => m.status === 'active').length;
    const overdue = deadlines.filter(d => d.status === 'upcoming' && daysUntil(d.due_date) < 0).length;
    const critical = deadlines.filter(d => d.status === 'upcoming' && d.is_critical && daysUntil(d.due_date) <= 14).length;
    const pending = conflictChecks.filter(c => c.status === 'pending' || c.status === 'flagged').length;
    return [
      { label: 'active matters', value: active, to: '/matters' },
      { label: 'critical in 14d', value: critical, to: '/deadlines' },
      { label: 'overdue', value: overdue, to: '/deadlines', alarming: true },
      { label: 'conflict checks open', value: pending, to: '/parties', alarming: true },
    ];
  }, [matters, deadlines, conflictChecks]);

  const handleAsk = () => {
    if (!query.trim()) return;
    navigate(`/analyst?q=${encodeURIComponent(query)}`);
  };

  return (
    <div className="flex flex-col space-y-5 max-w-4xl">
      {/* The decisions lead. Counts follow. Recent Matters is gone from
          this screen on purpose: it duplicated the Matters board while
          telling nobody anything they had to act on, and the actions
          below already name the matters that need attention. Removing
          noise, not substance — the full list is one click away. */}
      <div>
        <h2 className="text-xl font-medium mb-1">What needs a decision</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Ranked by consequence — professional risk first, then revenue, then client relationships.
        </p>
      </div>

      {actions.length === 0 ? (
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-6 text-sm text-[var(--text-secondary)]">
          Nothing needs a decision right now — no overdue dates, no unscreened matters, no matter gone quiet.
          <span className="block text-xs text-[var(--text-tertiary)] mt-1">
            This checks deadlines, conflict screening, client contact and unbilled time across your active matters.
          </span>
        </div>
      ) : (
        <div className="space-y-3">
          {actions.map(a => <ActionCard key={a.id} action={a} />)}
        </div>
      )}

      <StatStrip items={stats} />

      <button
        onClick={handleAsk}
        className="w-full flex items-center gap-3 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-4 text-left hover:border-[var(--border-strong)] transition-colors"
      >
        <Sparkles className="w-4 h-4 text-[var(--accent-secondary)] shrink-0" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onClick={e => e.stopPropagation()}
          onKeyDown={e => e.key === 'Enter' && handleAsk()}
          placeholder="Ask the Analyst something about your caseload…"
          className="flex-1 bg-transparent text-sm focus:outline-none placeholder:italic"
        />
      </button>

      <AgentLibraryTeaserCard />
    </div>
  );
}
