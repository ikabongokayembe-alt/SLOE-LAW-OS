import { useMemo, useState } from 'react';
import { useStore } from '../../lib/store';
import { AgentLibraryTeaserCard } from './AgentLibraryTeaserCard';
import { Link, useNavigate } from 'react-router-dom';
import { Sparkles, ShieldAlert, Banknote, MessageCircle, Info, ArrowRight, ShieldCheck } from 'lucide-react';
import { buildUrgentActions, UrgentAction, ConsequenceClass } from '../../lib/urgentActions';
import { runBulkConflictChecks } from '../../lib/bulkConflictCheck';

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

// buildUrgentActions() ids follow a stable "<kind>-<entityId>" convention
// (overdue-<deadlineId>, unprepped-<deadlineId>, noconflict-<matterId>,
// stale-<matterId>, unbilled-<matterId>) -- the kind prefix is what a
// "same finding, different matter" bundle groups on. No new detection:
// this is a pure display-layer regrouping of exactly what
// buildUrgentActions already returned, so four matters missing a
// conflict check read as one card instead of four near-identical ones.
interface ActionBundle {
  kind: string;
  consequence: ConsequenceClass;
  score: number; // highest-priority item's score, for ranking the bundle
  items: UrgentAction[];
}

function bundleActions(actions: UrgentAction[]): ActionBundle[] {
  const byKind = new Map<string, UrgentAction[]>();
  for (const a of actions) {
    const kind = a.id.split('-')[0];
    const arr = byKind.get(kind) ?? [];
    arr.push(a);
    byKind.set(kind, arr);
  }
  const bundles: ActionBundle[] = [];
  for (const items of byKind.values()) {
    items.sort((a, b) => b.score - a.score);
    bundles.push({ kind: items[0].id.split('-')[0], consequence: items[0].consequence, score: items[0].score, items });
  }
  return bundles.sort((a, b) => b.score - a.score);
}

// Plural framing per detector kind, used only when a bundle has 2+ items
// -- a single-item bundle renders as a normal ActionCard using the
// detector's own singular title instead.
const BUNDLE_TITLE: Record<string, (n: number) => string> = {
  overdue: n => `${n} deadlines are overdue`,
  unprepped: n => `${n} deadlines have no recorded prep`,
  noconflict: n => `${n} matters need a conflict check`,
  stale: n => `${n} matters have gone quiet with the client`,
  unbilled: n => `${n} matters have unbilled time sitting`,
};

// "<kind>-<entityId>" -> entityId, matching buildUrgentActions' own id
// convention exactly (see urgentActions.ts) rather than re-parsing title
// strings, which are prose and not meant to be machine-readable.
function entityIdOf(action: UrgentAction): string {
  return action.id.slice(action.id.indexOf('-') + 1);
}

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

// Multiple matters/deadlines hitting the same detector -- one card, a
// named list of what's affected, and (for the one kind that has a real
// bulk action already built -- conflict checks) a "run all" button that
// calls the exact same runBulkConflictChecks MattersScreen's kanban
// multi-select uses, not a re-implementation of it.
function BundledActionCard({
  bundle, names, onRunAll, running, progress,
}: {
  bundle: ActionBundle;
  names: string[];
  onRunAll?: () => void;
  running?: boolean;
  progress?: { done: number; total: number } | null;
}) {
  const meta = CONSEQUENCE_META[bundle.consequence];
  const first = bundle.items[0];
  const titleFn = BUNDLE_TITLE[bundle.kind];
  const title = titleFn ? titleFn(bundle.items.length) : `${bundle.items.length} findings`;
  const shown = names.slice(0, 3);
  const rest = names.length - shown.length;

  return (
    <div
      className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-4"
      style={{ borderLeftColor: meta.color, borderLeftWidth: 3 }}
    >
      <div className="flex items-center gap-2 mb-1">
        <div className="text-sm font-medium">{title}</div>
        <span className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] bg-[var(--bg-tertiary)] rounded-full px-1.5 py-0.5 shrink-0">
          {bundle.items.length}
        </span>
      </div>
      <div className="text-xs text-[var(--text-secondary)] mb-2 truncate">
        {shown.join(', ')}{rest > 0 ? `, +${rest} more` : ''}
      </div>

      <div className="flex items-start gap-1.5 text-xs text-[var(--text-tertiary)] mb-3">
        {first.grounding === 'general' && <Info className="w-3 h-3 shrink-0 mt-0.5" />}
        <span>
          {first.grounding === 'general' && (
            <span className="text-[var(--text-secondary)] font-medium">General guidance — not jurisdiction-verified. </span>
          )}
          {first.reasoning}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <Link to={first.href} className="group inline-flex items-center gap-1 text-xs font-medium text-[var(--text-primary)]">
          View all
          <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
        </Link>
        {onRunAll && (
          <button
            onClick={onRunAll}
            disabled={running}
            className="h-7 px-3 text-xs font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {running && progress ? `Running ${progress.done}/${progress.total}…` : `Run all ${bundle.items.length} checks`}
          </button>
        )}
      </div>
    </div>
  );
}

export function DashboardScreen() {
  const { matters, deadlines, conflictChecks, documents, timeEntries, communications, parties, runConflictCheck, linkMatterConflictCheck } = useStore();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  const actions = useMemo(
    () => buildUrgentActions({ matters, deadlines, documents, timeEntries, communications, conflictChecks, parties }),
    [matters, deadlines, documents, timeEntries, communications, conflictChecks, parties],
  );

  const bundles = useMemo(() => bundleActions(actions), [actions]);

  // Grouped by consequence class -- same ranking order as before
  // (professional, then revenue, then relationship), but now rendered as
  // three visually distinct sections instead of one flat stack of
  // same-styled cards.
  const sections = useMemo(() => {
    const order: ConsequenceClass[] = ['professional', 'revenue', 'relationship'];
    return order
      .map(consequence => ({ consequence, bundles: bundles.filter(b => b.consequence === consequence) }))
      .filter(s => s.bundles.length > 0);
  }, [bundles]);

  // Deadline-kind bundles (overdue/unprepped) key off a deadline id;
  // matter-kind bundles (noconflict/stale/unbilled) key off a matter id.
  // Resolving names here (not inside bundleActions) keeps the bundling
  // function a pure regrouping step with no store lookups of its own.
  const namesFor = (bundle: ActionBundle): string[] => {
    const isDeadlineKind = bundle.kind === 'overdue' || bundle.kind === 'unprepped';
    return bundle.items.map(item => {
      const id = entityIdOf(item);
      if (isDeadlineKind) return deadlines.find(d => d.id === id)?.title ?? 'Untitled deadline';
      return matters.find(m => m.id === id)?.title ?? 'Untitled matter';
    });
  };

  const runAllConflictChecks = async (bundle: ActionBundle) => {
    const matterIds = bundle.items.map(entityIdOf);
    setBulkRunning(true);
    setBulkProgress({ done: 0, total: matterIds.length });
    await runBulkConflictChecks(matterIds, {
      matters, parties, runConflictCheck, linkMatterConflictCheck,
      onProgress: (done, total) => setBulkProgress({ done, total }),
    });
    setBulkRunning(false);
    setBulkProgress(null);
  };

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
          Grouped by consequence — professional risk first, then revenue, then client relationships.
        </p>
      </div>

      {sections.length === 0 ? (
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-6 text-sm text-[var(--text-secondary)]">
          <div className="flex items-center gap-2 text-[var(--signal-positive)] mb-1">
            <ShieldCheck className="w-4 h-4 shrink-0" /> Nothing needs a decision right now.
          </div>
          <span className="block text-xs text-[var(--text-tertiary)]">
            This checks deadlines, conflict screening, client contact and unbilled time across your active matters.
          </span>
        </div>
      ) : (
        <div className="space-y-6">
          {sections.map(({ consequence, bundles: sectionBundles }) => {
            const meta = CONSEQUENCE_META[consequence];
            const Icon = meta.icon;
            const count = sectionBundles.reduce((s, b) => s + b.items.length, 0);
            return (
              <div key={consequence}>
                <div className="flex items-center gap-2 mb-3">
                  <Icon className="w-4 h-4 shrink-0" style={{ color: meta.color }} />
                  <h3 className="text-sm font-semibold" style={{ color: meta.color }}>{meta.label}</h3>
                  <span className="text-xs text-[var(--text-tertiary)] bg-[var(--bg-tertiary)] rounded-full px-2 py-0.5">{count}</span>
                  <div className="flex-1 h-px bg-[var(--border-subtle)]" />
                </div>
                <div className="space-y-3">
                  {sectionBundles.map(bundle => bundle.items.length === 1 ? (
                    <ActionCard key={bundle.kind} action={bundle.items[0]} />
                  ) : (
                    <BundledActionCard
                      key={bundle.kind}
                      bundle={bundle}
                      names={namesFor(bundle)}
                      onRunAll={bundle.kind === 'noconflict' ? () => runAllConflictChecks(bundle) : undefined}
                      running={bulkRunning}
                      progress={bulkProgress}
                    />
                  ))}
                </div>
              </div>
            );
          })}
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
