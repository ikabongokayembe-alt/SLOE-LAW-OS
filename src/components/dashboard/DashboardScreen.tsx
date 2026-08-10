import { useMemo } from 'react';
import { useStore } from '../../lib/store';
import { AgentLibraryTeaserCard } from './AgentLibraryTeaserCard';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';

function daysUntil(dateStr: string): number {
  return Math.round((new Date(dateStr).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000);
}

export function DashboardScreen() {
  const { matters, deadlines, conflictChecks, attorneys } = useStore();

  const stats = useMemo(() => {
    const activeMatters = matters.filter(m => m.status === 'active');
    const upcomingCritical = deadlines.filter(d => d.status === 'upcoming' && d.is_critical && daysUntil(d.due_date) <= 14);
    const overdue = deadlines.filter(d => d.status === 'upcoming' && daysUntil(d.due_date) < 0);
    const pendingConflicts = conflictChecks.filter(c => c.status === 'pending' || c.status === 'flagged');
    return { activeMatters: activeMatters.length, upcomingCritical, overdue, pendingConflicts };
  }, [matters, deadlines, conflictChecks]);

  return (
    <div className="flex flex-col space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1">Active Matters</div>
          <div className="text-2xl font-mono">{stats.activeMatters}</div>
        </div>
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1">Critical Deadlines (14d)</div>
          <div className="text-2xl font-mono">{stats.upcomingCritical.length}</div>
        </div>
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1">Overdue</div>
          <div className={`text-2xl font-mono ${stats.overdue.length > 0 ? 'text-[var(--signal-negative)]' : ''}`}>{stats.overdue.length}</div>
        </div>
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1">Pending Conflict Checks</div>
          <div className="text-2xl font-mono">{stats.pendingConflicts.length}</div>
        </div>
      </div>

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
                <span className="flex-1">{d.title}</span>
                <span className="text-xs text-[var(--text-tertiary)]">{new Date(d.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <AgentLibraryTeaserCard />
    </div>
  );
}
