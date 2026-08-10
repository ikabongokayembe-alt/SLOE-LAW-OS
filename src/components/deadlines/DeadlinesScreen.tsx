import { useMemo, useState } from 'react';
import { useStore } from '../../lib/store';
import { AlertTriangle, Clock, CheckCircle2, Plus } from 'lucide-react';

const TYPE_LABELS: Record<string, string> = {
  statute_of_limitations: 'Statute of Limitations', filing: 'Filing', court_date: 'Court Date', other: 'Other',
};

function daysUntil(dateStr: string): number {
  const diff = new Date(dateStr).getTime() - new Date().setHours(0, 0, 0, 0);
  return Math.round(diff / 86400000);
}

export function DeadlinesScreen() {
  const { deadlines, matters, updateDeadline } = useStore();

  const sorted = useMemo(() => [...deadlines].sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()), [deadlines]);
  const matterTitle = (id: string | null) => matters.find(m => m.id === id)?.title ?? '—';

  const markComplete = (id: string) => updateDeadline(id, { status: 'completed' });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-medium">Deadlines</h2>
          <p className="text-sm text-[var(--text-secondary)]">Every filing deadline, court date, and statute of limitations across your matters.</p>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="text-sm text-[var(--text-tertiary)] py-8 text-center">No deadlines tracked yet.</div>
      ) : (
        <div className="space-y-2">
          {sorted.map(d => {
            const days = daysUntil(d.due_date);
            const isOverdue = days < 0 && d.status === 'upcoming';
            const isUrgent = days >= 0 && days <= d.reminder_days_before && d.status === 'upcoming';
            return (
              <div
                key={d.id}
                className={`flex items-center gap-3 p-3 rounded-lg border ${
                  d.status === 'completed' ? 'border-[var(--border-subtle)] opacity-50' :
                  isOverdue ? 'border-[var(--signal-negative)] bg-[var(--signal-negative)]/5' :
                  isUrgent && d.is_critical ? 'border-[var(--signal-negative)]/60 bg-[var(--signal-negative)]/5' :
                  isUrgent ? 'border-[var(--signal-warning)]/60 bg-[var(--signal-warning)]/5' :
                  'border-[var(--border-subtle)] bg-[var(--bg-secondary)]'
                }`}
              >
                <div className="shrink-0">
                  {d.status === 'completed' ? <CheckCircle2 className="w-4 h-4 text-[var(--signal-positive)]" /> :
                   isOverdue || (isUrgent && d.is_critical) ? <AlertTriangle className="w-4 h-4 text-[var(--signal-negative)]" /> :
                   <Clock className="w-4 h-4 text-[var(--text-tertiary)]" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{d.title}</span>
                    {d.is_critical && <span className="text-[10px] uppercase px-1.5 py-0.5 bg-[var(--signal-negative)]/15 text-[var(--signal-negative)] rounded-full">Critical</span>}
                  </div>
                  <div className="text-xs text-[var(--text-tertiary)]">{TYPE_LABELS[d.deadline_type]} · {matterTitle(d.matter_id)}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-mono">{new Date(d.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                  <div className={`text-xs ${isOverdue ? 'text-[var(--signal-negative)]' : 'text-[var(--text-tertiary)]'}`}>
                    {d.status === 'completed' ? 'Done' : isOverdue ? `${Math.abs(days)}d overdue` : `${days}d away`}
                  </div>
                </div>
                {d.status !== 'completed' && (
                  <button onClick={() => markComplete(d.id)} className="shrink-0 text-xs px-2.5 py-1.5 border border-[var(--border-subtle)] rounded hover:bg-[var(--bg-tertiary)] transition-colors">
                    Mark done
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
