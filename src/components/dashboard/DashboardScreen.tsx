import { useMemo, useState } from 'react';
import { useStore } from '../../lib/store';
import { useAuth } from '../../lib/auth';
import { AgentLibraryTeaserCard } from './AgentLibraryTeaserCard';
import { GroundingNotice } from '../shared/GroundingNotice';
import { Link, useNavigate } from 'react-router-dom';
import { Sparkles, ShieldAlert, Banknote, MessageCircle, Info, ArrowRight, ShieldCheck, EyeOff, Eye, AlertTriangle } from 'lucide-react';
import { buildUrgentActions, UrgentAction, ConsequenceClass } from '../../lib/urgentActions';
import { runBulkConflictChecks } from '../../lib/bulkConflictCheck';
import { daysUntilDateOnly } from '../../lib/dates';

function daysUntil(dateStr: string): number {
  return daysUntilDateOnly(dateStr);
}

interface StatCardProps {
  label: string;
  value: number;
  to: string;
  colorClass?: string;
}

function StatCard({ label, value, to, colorClass }: StatCardProps) {
  return (
    <Link
      to={to}
      className="group block bg-[var(--bg-secondary)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] rounded-lg p-3.5 transition-colors"
    >
      <div className="text-[11px] text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)] transition-colors truncate mb-1">
        {label}
      </div>
      <div className={`text-2xl font-medium tracking-tight tabular-nums ${colorClass || 'text-[var(--text-primary)]'}`}>
        {value}
      </div>
    </Link>
  );
}

const CONSEQUENCE_META: Record<ConsequenceClass, { label: string; icon: any; color: string }> = {
  professional: { label: 'Professional risk', icon: ShieldAlert, color: 'var(--signal-negative)' },
  revenue:      { label: 'Revenue',           icon: Banknote,   color: 'var(--accent-primary)' },
  relationship: { label: 'Client',            icon: MessageCircle, color: 'var(--accent-secondary)' },
};

interface ActionBundle {
  kind: string;
  consequence: ConsequenceClass;
  score: number;
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

const BUNDLE_TITLE: Record<string, (n: number) => string> = {
  overdue: n => `${n} deadlines are overdue`,
  unprepped: n => `${n} deadlines have no recorded prep`,
  noconflict: n => `${n} matters need a conflict check`,
  stale: n => `${n} matters have gone quiet with the client`,
  unbilled: n => `${n} matters have unbilled time sitting`,
};

function entityIdOf(action: UrgentAction): string {
  return action.id.slice(action.id.indexOf('-') + 1);
}

function ActionCard({ action }: { action: UrgentAction }) {
  const meta = CONSEQUENCE_META[action.consequence];
  return (
    <Link
      to={action.href}
      className="group block bg-[var(--bg-secondary)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] rounded-lg p-4 transition-colors"
      style={{ borderLeftColor: meta.color, borderLeftWidth: 3 }}
    >
      <div className="text-sm font-medium mb-1">{action.title}</div>
      <div className="text-xs text-[var(--text-secondary)] mb-2">{action.detail}</div>

      <div className="flex items-start gap-1.5 text-xs text-[var(--text-tertiary)]">
        {action.grounding === 'general' && <Info className="w-3 h-3 shrink-0 mt-0.5" />}
        <span>
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
  const { profile, toggleMutedDashboardCategory } = useAuth();
  const mutedCategories = profile?.muted_dashboard_categories ?? [];
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  const actions = useMemo(
    () => buildUrgentActions({ matters, deadlines, documents, timeEntries, communications, conflictChecks, parties }),
    [matters, deadlines, documents, timeEntries, communications, conflictChecks, parties],
  );

  const bundles = useMemo(() => bundleActions(actions), [actions]);

  const sections = useMemo(() => {
    const order: ConsequenceClass[] = ['professional', 'revenue', 'relationship'];
    return order
      .map(consequence => ({ consequence, bundles: bundles.filter(b => b.consequence === consequence) }))
      .filter(s => s.bundles.length > 0 && !mutedCategories.includes(s.consequence));
  }, [bundles, mutedCategories]);

  const mutedWithFindings = useMemo(() => {
    const order: ConsequenceClass[] = ['professional', 'revenue', 'relationship'];
    return order
      .map(consequence => ({ consequence, count: bundles.filter(b => b.consequence === consequence).reduce((s, b) => s + b.items.length, 0) }))
      .filter(s => s.count > 0 && mutedCategories.includes(s.consequence));
  }, [bundles, mutedCategories]);

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
    return { active, critical, overdue, pending };
  }, [matters, deadlines, conflictChecks]);

  const handleAsk = () => {
    if (!query.trim()) return;
    navigate(`/analyst?q=${encodeURIComponent(query)}`);
  };

  return (
    <div className="flex flex-col space-y-6 max-w-4xl">
      {/* 1. Stat cards grid at top */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Active Matters" value={stats.active} to="/matters" />
        <StatCard
          label="Critical in 14d"
          value={stats.critical}
          to="/deadlines"
          colorClass={stats.critical > 0 ? 'text-[var(--signal-warning)]' : undefined}
        />
        <StatCard
          label="Overdue Deadlines"
          value={stats.overdue}
          to="/deadlines"
          colorClass={stats.overdue > 0 ? 'text-[var(--signal-negative)]' : undefined}
        />
        <StatCard
          label="Open Conflict Checks"
          value={stats.pending}
          to="/parties"
          colorClass={stats.pending > 0 ? 'text-[var(--signal-negative)]' : undefined}
        />
      </div>

      {/* 2. Heading & Condensed Grounding Notice */}
      <div>
        <h2 className="text-xl font-semibold mb-1.5">What needs a decision</h2>
        <GroundingNotice />
      </div>

      {mutedWithFindings.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-tertiary)]">
          <span>Muted:</span>
          {mutedWithFindings.map(({ consequence, count }) => (
            <button
              key={consequence}
              onClick={() => toggleMutedDashboardCategory(consequence)}
              title={`${count} finding${count === 1 ? '' : 's'} hidden — click to unmute`}
              className="flex items-center gap-1 px-2 py-1 rounded-full border border-[var(--border-subtle)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] transition-colors"
            >
              <Eye className="w-3 h-3" /> {CONSEQUENCE_META[consequence].label} ({count})
            </button>
          ))}
        </div>
      )}

      {/* 3. Section lists with icon & color treatment */}
      {sections.length === 0 ? (
        bundles.length === 0 && (
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-6 text-sm text-[var(--text-secondary)]">
            <div className="flex items-center gap-2 text-[var(--signal-positive)] mb-1">
              <ShieldCheck className="w-4 h-4 shrink-0" /> Nothing needs a decision right now.
            </div>
            <span className="block text-xs text-[var(--text-tertiary)]">
              This checks deadlines, conflict screening, client contact and unbilled time across your active matters.
            </span>
          </div>
        )
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
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
                    {count}
                  </span>
                  <div className="flex-1 h-px bg-[var(--border-subtle)]" />
                  <button
                    onClick={() => toggleMutedDashboardCategory(consequence)}
                    title={`Hide the ${meta.label} category — you can unmute it any time`}
                    className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors shrink-0"
                  >
                    <EyeOff className="w-3 h-3" /> Mute
                  </button>
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

      {/* 4. Redesigned Agent Library Card & Relocated Ask the Analyst Input */}
      <div className="pt-6 border-t border-[var(--border-subtle)] space-y-4">
        {/* Redesigned Agent Library Card */}
        <AgentLibraryTeaserCard />

        {/* Ask the Analyst Input at bottom */}
        <button
          onClick={handleAsk}
          className="w-full flex items-center gap-2.5 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] rounded-full h-10 px-4 text-left transition-colors"
        >
          <Sparkles className="w-4 h-4 text-[var(--accent-secondary)] shrink-0" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => e.key === 'Enter' && handleAsk()}
            placeholder="Ask the Analyst something about your caseload…"
            className="flex-1 bg-transparent text-xs text-[var(--text-primary)] focus:outline-none placeholder:italic"
          />
        </button>
      </div>
    </div>
  );
}
