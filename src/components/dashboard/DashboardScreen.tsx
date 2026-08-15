import { useMemo, useState } from 'react';
import { useStore } from '../../lib/store';
import { AgentLibraryTeaserCard } from './AgentLibraryTeaserCard';
import { Sparkline } from './Sparkline';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, Sparkles } from 'lucide-react';
import { formatDateOnly } from '../../lib/dates';

function daysUntil(dateStr: string): number {
  return Math.round((new Date(dateStr).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000);
}

// Real day-by-day bucketing — no fabricated trend data. Returns 7 counts,
// oldest to newest, of how many items in `dates` fall on each of the
// last 7 days (or next 7, if `forward` is true).
function bucketByDay(dates: string[], forward = false): number[] {
  const buckets: number[] = new Array(7).fill(0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (const d of dates) {
    const day = new Date(d); day.setHours(0, 0, 0, 0);
    const diff = Math.round((day.getTime() - today.getTime()) / 86400000);
    const idx = forward ? diff : diff + 6;
    if (idx >= 0 && idx < 7) buckets[idx]++;
  }
  return buckets;
}

function StatCard({ label, value, negative, sparklineData, sparklineColor }: { label: string; value: number; negative?: boolean; sparklineData?: number[]; sparklineColor?: string }) {
  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-4 flex items-center justify-between">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1">{label}</div>
        <div className={`text-2xl font-mono ${negative && value > 0 ? 'text-[var(--signal-negative)]' : ''}`}>{value}</div>
      </div>
      {sparklineData && sparklineData.some(v => v > 0) && (
        <Sparkline data={sparklineData} color={sparklineColor} />
      )}
    </div>
  );
}

export function DashboardScreen() {
  const { matters, deadlines, conflictChecks, parties, firm } = useStore();
  const locale = firm?.locale || 'en-US';
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const stats = useMemo(() => {
    const activeMatters = matters.filter(m => m.status === 'active');
    const upcomingCritical = deadlines.filter(d => d.status === 'upcoming' && d.is_critical && daysUntil(d.due_date) <= 14);
    const overdue = deadlines.filter(d => d.status === 'upcoming' && daysUntil(d.due_date) < 0);
    const pendingConflicts = conflictChecks.filter(c => c.status === 'pending' || c.status === 'flagged');

    // All genuinely computed from real timestamps already stored — no
    // invented data. Matters opened per day (last 7d), critical deadlines
    // due per day (next 7d), conflict checks run per day (last 7d).
    const mattersOpenedTrend = bucketByDay(matters.map(m => m.opened_date));
    const criticalDeadlineTrend = bucketByDay(deadlines.filter(d => d.is_critical).map(d => d.due_date), true);
    const conflictCheckTrend = bucketByDay(conflictChecks.map(c => c.created_at));

    return { activeMatters: activeMatters.length, upcomingCritical, overdue, pendingConflicts, mattersOpenedTrend, criticalDeadlineTrend, conflictCheckTrend };
  }, [matters, deadlines, conflictChecks]);

  const recentMatters = useMemo(() => [...matters].sort((a, b) => new Date(b.opened_date).getTime() - new Date(a.opened_date).getTime()).slice(0, 5), [matters]);
  const clientName = (id: string | null) => parties.find(p => p.id === id)?.name ?? '—';

  const handleAsk = () => {
    if (!query.trim()) return;
    navigate(`/analyst?q=${encodeURIComponent(query)}`);
  };

  return (
    <div className="flex flex-col space-y-6">
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
          placeholder="Which matters need attention before Friday's hearing?"
          className="flex-1 bg-transparent text-sm focus:outline-none placeholder:italic"
        />
      </button>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Active Matters" value={stats.activeMatters} sparklineData={stats.mattersOpenedTrend} sparklineColor="var(--signal-positive)" />
        <StatCard label="Critical Deadlines (14d)" value={stats.upcomingCritical.length} sparklineData={stats.criticalDeadlineTrend} sparklineColor="var(--signal-warning)" />
        <StatCard label="Overdue" value={stats.overdue.length} negative />
        <StatCard label="Pending Conflict Checks" value={stats.pendingConflicts.length} sparklineData={stats.conflictCheckTrend} sparklineColor="var(--accent-secondary)" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium">Urgent</h3>
            <Link to="/deadlines" className="text-xs text-[var(--accent-secondary)] hover:underline">View all deadlines</Link>
          </div>
          {stats.overdue.length === 0 && stats.upcomingCritical.length === 0 ? (
            <div className="text-xs text-[var(--text-tertiary)]">Nothing urgent right now.</div>
          ) : (
            <div className="space-y-2">
              {[...stats.overdue, ...stats.upcomingCritical].slice(0, 5).map(d => (
                <div key={d.id} className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="w-3.5 h-3.5 text-[var(--signal-negative)] shrink-0" />
                  <span className="flex-1 truncate">{d.title}</span>
                  <span className="text-xs text-[var(--text-tertiary)] shrink-0">{formatDateOnly(d.due_date, locale, { day: 'numeric', month: 'short' })}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium">Recent Matters</h3>
            <Link to="/matters" className="text-xs text-[var(--accent-secondary)] hover:underline">View all</Link>
          </div>
          {recentMatters.length === 0 ? (
            <div className="text-xs text-[var(--text-tertiary)]">No matters opened yet.</div>
          ) : (
            <div className="space-y-2">
              {recentMatters.map(m => (
                <div key={m.id} className="flex items-center justify-between text-sm">
                  <div className="min-w-0">
                    <div className="truncate">{m.title}</div>
                    <div className="text-xs text-[var(--text-tertiary)] truncate">{clientName(m.client_party_id)}</div>
                  </div>
                  <span className="text-xs text-[var(--text-tertiary)] shrink-0 ml-2">{formatDateOnly(m.opened_date, locale, { day: 'numeric', month: 'short' })}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <AgentLibraryTeaserCard />
    </div>
  );
}
