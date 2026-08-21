import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../../lib/store';
import { useToast } from '../../lib/toast';
import { assessDeadlineRisk } from '../../lib/riskSignals';
import { AlertTriangle, Clock, CheckCircle2, CalendarPlus, CalendarCheck2, ChevronLeft, ChevronRight, X, Eye } from 'lucide-react';
import { formatDateOnly, parseDateOnly } from '../../lib/dates';
import { LogTimeModal } from '../time/LogTimeModal';
import { DeadlineDetailPanel } from './DeadlineDetailPanel';
import { Deadline } from '../../types';

const TYPE_LABELS: Record<string, string> = {
  statute_of_limitations: 'Statute of Limitations', filing: 'Filing', court_date: 'Court Date', other: 'Other',
};

const PAGE_SIZE = 25;

function daysUntil(dateOnlyString: string): number {
  const diff = parseDateOnly(dateOnlyString).getTime() - new Date().setHours(0, 0, 0, 0);
  return Math.round(diff / 86400000);
}

export function DeadlinesScreen() {
  const { deadlines, matters, updateDeadline, firm, integrationConnections, pushDeadlineToCalendar, timeEntries, documents } = useStore();
  const { showToast } = useToast();
  const locale = firm?.locale || 'en-US';
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [justCompletedId, setJustCompletedId] = useState<string | null>(null);
  const [logTimeFor, setLogTimeFor] = useState<Deadline | null>(null);
  const [selectedDeadlineId, setSelectedDeadlineId] = useState<string | null>(null);

  // Filters — same shape/pattern as TimeEntriesScreen's matter+date-range
  // filter bar. Real volume (151 rows, one long list, sort-by-due-date
  // the only structure) made these load-bearing, not decorative.
  const [matterFilter, setMatterFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'overdue' | 'upcoming' | 'completed'>('all');
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [page, setPage] = useState(1);

  const matterTitle = (id: string | null) => matters.find(m => m.id === id)?.title ?? '—';

  // "Done" here means: status flips to 'completed', which is the exact
  // condition assessDeadlineRisk and buildUrgentActions both gate on --
  // a completed deadline stops producing "at risk"/"watch" lines on this
  // screen and drops out of Command Center's overdue/no-prep cards on its
  // own, with no separate cleanup step. That's real, not implied, so the
  // toast says it plainly instead of leaving it to be inferred from a
  // checkmark.
  const markComplete = async (d: Deadline) => {
    await updateDeadline(d.id, { status: 'completed' });
    showToast('success', `"${d.title}" marked done — removed from at-risk tracking and Command Center.`);
    setJustCompletedId(d.id);
  };

  const calendarConnected = integrationConnections?.some(c => c.toolkit_slug === 'googlecalendar' && c.status === 'ACTIVE') ?? null;

  const handlePush = async (id: string) => {
    setPushingId(id);
    await pushDeadlineToCalendar(id);
    setPushingId(null);
  };

  const filtered = useMemo(() => {
    return deadlines
      .filter(d => matterFilter === 'all' || d.matter_id === matterFilter)
      .filter(d => !fromDate || d.due_date >= fromDate)
      .filter(d => !toDate || d.due_date <= toDate)
      .filter(d => !criticalOnly || d.is_critical)
      .filter(d => {
        if (statusFilter === 'all') return true;
        if (statusFilter === 'completed') return d.status === 'completed';
        if (statusFilter === 'overdue') return d.status === 'upcoming' && daysUntil(d.due_date) < 0;
        return d.status === 'upcoming' && daysUntil(d.due_date) >= 0; // upcoming (not overdue)
      })
      .sort((a, b) => parseDateOnly(a.due_date).getTime() - parseDateOnly(b.due_date).getTime());
  }, [deadlines, matterFilter, fromDate, toDate, statusFilter, criticalOnly]);

  // Any filter change invalidates the current page — never leave the
  // user stranded on a page number that no longer has rows.
  useEffect(() => { setPage(1); }, [matterFilter, fromDate, toDate, statusFilter, criticalOnly]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, pageCount);
  const paged = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  const hasActiveFilters = matterFilter !== 'all' || fromDate || toDate || statusFilter !== 'all' || criticalOnly;
  const clearFilters = () => { setMatterFilter('all'); setFromDate(''); setToDate(''); setStatusFilter('all'); setCriticalOnly(false); };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-medium">Deadlines</h2>
          <p className="text-sm text-[var(--text-secondary)]">Every filing deadline, court date, and statute of limitations across your matters.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="text-[10px] uppercase font-mono tracking-wider text-[var(--text-tertiary)] block mb-1">Matter</label>
          <select value={matterFilter} onChange={e => setMatterFilter(e.target.value)} className="h-9 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none w-full sm:w-56">
            <option value="all">All matters</option>
            {matters.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase font-mono tracking-wider text-[var(--text-tertiary)] block mb-1">Status</label>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)} className="h-9 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none w-full sm:w-40">
            <option value="all">All</option>
            <option value="overdue">Overdue</option>
            <option value="upcoming">Upcoming</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase font-mono tracking-wider text-[var(--text-tertiary)] block mb-1">From</label>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-9 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none w-full sm:w-auto" />
        </div>
        <div>
          <label className="text-[10px] uppercase font-mono tracking-wider text-[var(--text-tertiary)] block mb-1">To</label>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-9 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none w-full sm:w-auto" />
        </div>
        <label className="h-9 flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
          <input type="checkbox" checked={criticalOnly} onChange={e => setCriticalOnly(e.target.checked)} /> Critical only
        </label>
        {hasActiveFilters && (
          <button onClick={clearFilters} className="h-9 px-3 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
            Clear filters
          </button>
        )}
      </div>

      <div className="text-xs text-[var(--text-tertiary)] mb-3">
        {filtered.length} deadline{filtered.length === 1 ? '' : 's'}{hasActiveFilters ? ' match these filters' : ' total'}
      </div>

      {filtered.length === 0 ? (
        <div className="text-sm text-[var(--text-tertiary)] py-8 text-center">
          {deadlines.length === 0 ? 'No deadlines tracked yet.' : 'No deadlines match these filters.'}
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {paged.map(d => {
              const days = daysUntil(d.due_date);
              const isOverdue = days < 0 && d.status === 'upcoming';
              const isUrgent = days >= 0 && days <= d.reminder_days_before && d.status === 'upcoming';
              return (
                <div
                  key={d.id}
                  onClick={() => setSelectedDeadlineId(d.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && setSelectedDeadlineId(d.id)}
                  className={`flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg border cursor-pointer hover:border-[var(--border-strong)] transition-colors ${
                    d.status === 'completed' ? 'border-[var(--border-subtle)] opacity-50' :
                    isOverdue ? 'border-[var(--signal-negative)] bg-[var(--signal-negative)]/5' :
                    isUrgent && d.is_critical ? 'border-[var(--signal-negative)]/60 bg-[var(--signal-negative)]/5' :
                    isUrgent ? 'border-[var(--signal-warning)]/60 bg-[var(--signal-warning)]/5' :
                    'border-[var(--border-subtle)] bg-[var(--bg-secondary)]'
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="shrink-0">
                      {d.status === 'completed' ? <CheckCircle2 className="w-4 h-4 text-[var(--signal-positive)]" /> :
                       isOverdue || (isUrgent && d.is_critical) ? <AlertTriangle className="w-4 h-4 text-[var(--signal-negative)]" /> :
                       <Clock className="w-4 h-4 text-[var(--text-tertiary)]" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{d.title}</span>
                        {d.is_critical && <span className="text-[10px] uppercase px-1.5 py-0.5 bg-[var(--signal-negative)]/15 text-[var(--signal-negative)] rounded-full shrink-0">Critical</span>}
                      </div>
                      <div className="text-xs text-[var(--text-tertiary)] truncate">{TYPE_LABELS[d.deadline_type]} · {matterTitle(d.matter_id)}</div>
                      {(() => {
                        // Date order alone can't tell you which of two
                        // deadlines is actually in trouble. This adds the
                        // observed signals -- prep activity, ownership,
                        // what follows it -- without asserting any legal
                        // consequence.
                        const risk = assessDeadlineRisk(d, deadlines, timeEntries, documents);
                        if (risk.level === 'none') return null;
                        const strong = risk.level === 'at_risk';
                        return (
                          <div className={`mt-1 text-[11px] ${strong ? 'text-[var(--signal-negative)]' : 'text-[var(--signal-warning)]'}`}>
                            <span className="uppercase tracking-wider font-mono mr-1.5">
                              {strong ? 'At risk' : 'Watch'}
                            </span>
                            <span className="text-[var(--text-tertiary)]">{risk.reasons.join(' ')}</span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                    <div className="text-right shrink-0">
                      <div className="text-sm font-mono">{formatDateOnly(d.due_date, locale, { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                      <div className={`text-xs ${isOverdue ? 'text-[var(--signal-negative)]' : 'text-[var(--text-tertiary)]'}`}>
                        {d.status === 'completed' ? 'Done' : isOverdue ? `${Math.abs(days)}d overdue` : `${days}d away`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {d.calendar_event_id ? (
                        <span className="flex items-center gap-1 text-xs text-[var(--signal-positive)] px-2.5 py-1.5" title="Pushed to Google Calendar">
                          <CalendarCheck2 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">On calendar</span>
                        </span>
                      ) : calendarConnected === false ? (
                        <Link
                          to="/integrations"
                          className="text-xs text-[var(--text-tertiary)] hover:text-[var(--accent-secondary)] underline decoration-dotted whitespace-nowrap"
                          title="Connect Google Calendar from Integrations to push deadlines"
                        >
                          Connect Calendar
                        </Link>
                      ) : calendarConnected === true ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); handlePush(d.id); }}
                          disabled={pushingId === d.id}
                          className="flex items-center gap-1 text-xs px-2.5 py-1.5 border border-[var(--border-subtle)] rounded hover:bg-[var(--bg-tertiary)] transition-colors disabled:opacity-40 whitespace-nowrap"
                        >
                          <CalendarPlus className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{pushingId === d.id ? 'Adding…' : 'Add to Calendar'}</span>
                        </button>
                      ) : null}
                      {d.status !== 'completed' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); markComplete(d); }}
                          className="text-xs px-2.5 py-1.5 border border-[var(--border-subtle)] rounded hover:bg-[var(--bg-tertiary)] transition-colors whitespace-nowrap"
                        >
                          Mark done
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Optional, one-click next step -- never mandatory.
                      Only appears right after this specific deadline was
                      marked done, and only when there's a matter to log
                      time against; dismissible with no consequence. */}
                  {justCompletedId === d.id && d.matter_id && (
                    <div className="flex items-center gap-2 pt-2 mt-1 border-t border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[var(--signal-positive)] shrink-0" />
                      <span className="flex-1">Log time against {matterTitle(d.matter_id)}?</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setLogTimeFor(d); }}
                        className="px-2 py-1 text-xs font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded hover:opacity-90 transition-opacity"
                      >
                        Log time
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setJustCompletedId(null); }}
                        className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                        aria-label="Dismiss"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {pageCount > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm">
              <span className="text-xs text-[var(--text-tertiary)]">
                Page {pageSafe} of {pageCount} · {filtered.length} total
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={pageSafe <= 1}
                  className="h-8 px-2.5 flex items-center gap-1 text-xs border border-[var(--border-subtle)] rounded hover:bg-[var(--bg-tertiary)] transition-colors disabled:opacity-40"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Prev
                </button>
                <button
                  onClick={() => setPage(p => Math.min(pageCount, p + 1))}
                  disabled={pageSafe >= pageCount}
                  className="h-8 px-2.5 flex items-center gap-1 text-xs border border-[var(--border-subtle)] rounded hover:bg-[var(--bg-tertiary)] transition-colors disabled:opacity-40"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {logTimeFor && (
        <LogTimeModal
          onClose={() => { setLogTimeFor(null); setJustCompletedId(null); }}
          defaultMatterId={logTimeFor.matter_id ?? undefined}
        />
      )}

      {selectedDeadlineId && deadlines.find(d => d.id === selectedDeadlineId) && (
        <DeadlineDetailPanel
          deadline={deadlines.find(d => d.id === selectedDeadlineId)!}
          onClose={() => setSelectedDeadlineId(null)}
        />
      )}
    </div>
  );
}
