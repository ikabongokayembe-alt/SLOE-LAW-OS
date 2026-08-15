import { useMemo, useState } from 'react';
import { useStore } from '../../lib/store';
import { Clock, Plus, Download, Pencil, Trash2 } from 'lucide-react';
import { formatDateOnly } from '../../lib/dates';
import { computeAmount, formatAmount, formatHours } from '../../lib/timeEntries';
import { toCsv, downloadCsv } from '../../lib/csv';
import { LogTimeModal } from './LogTimeModal';
import { TimeEntry } from '../../types';

// Billing Phase 1: time capture and CSV export only — no payment
// collection, no invoicing that touches money, no trust accounting. The
// export below IS the entire "invoicing" story for this phase; a firm
// takes it to whatever they already use to actually bill a client.
export function TimeEntriesScreen() {
  const { timeEntries, matters, attorneys, firm, deleteTimeEntry } = useStore();
  const locale = firm?.locale || 'en-US';

  const [matterFilter, setMatterFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showLog, setShowLog] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);

  const matterTitle = (id: string) => matters.find(m => m.id === id)?.title ?? '—';
  const attorneyName = (id: string | null) => attorneys.find(a => a.id === id)?.name ?? 'Unassigned';

  const filtered = useMemo(() => {
    return timeEntries
      .filter(t => matterFilter === 'all' || t.matter_id === matterFilter)
      .filter(t => !fromDate || t.date >= fromDate)
      .filter(t => !toDate || t.date <= toDate)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [timeEntries, matterFilter, fromDate, toDate]);

  const currency = firm?.currency ?? null;

  // Billable amounts are summed PER CURRENCY, not blindly added together —
  // each entry stores the firm's currency as of when it was logged (see
  // migration 0013), so if a firm ever changes currency, old and new
  // entries could genuinely be in different units. Silently summing them
  // as one number would be a real billing-correctness bug, not a display
  // nit, so mixed-currency totals render as separate lines instead of
  // one (wrong) combined figure.
  const totals = useMemo(() => {
    let totalMinutes = 0, billableMinutes = 0;
    const billableByCurrency = new Map<string, number>();
    for (const t of filtered) {
      totalMinutes += t.duration_minutes;
      if (t.billable) {
        billableMinutes += t.duration_minutes;
        const amount = computeAmount(t.duration_minutes, t.rate);
        if (amount !== null) {
          const key = t.currency ?? currency ?? 'USD';
          billableByCurrency.set(key, (billableByCurrency.get(key) ?? 0) + amount);
        }
      }
    }
    return { totalMinutes, billableMinutes, billableByCurrency };
  }, [filtered, currency]);

  const handleExport = () => {
    const headers = ['Date', 'Attorney', 'Duration (hrs)', 'Rate', 'Amount', 'Billable', 'Description'];
    const rows = filtered.map(t => {
      const amount = computeAmount(t.duration_minutes, t.rate);
      return [
        t.date,
        attorneyName(t.attorney_id),
        formatHours(t.duration_minutes),
        t.rate != null ? t.rate.toFixed(2) : '',
        amount != null ? amount.toFixed(2) : '',
        t.billable ? 'Yes' : 'No',
        t.description ?? '',
      ];
    });
    const csv = toCsv(headers, rows);
    const scope = matterFilter === 'all' ? 'all-matters' : matterTitle(matterFilter).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    downloadCsv(`time-entries_${scope}_${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl font-medium">Time</h2>
          <p className="text-sm text-[var(--text-secondary)]">Log and export billable time — this is a record, not an invoice.</p>
        </div>
        <button
          onClick={() => setShowLog(true)}
          className="h-9 px-4 flex items-center gap-1.5 text-sm font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded hover:opacity-90 transition-opacity shrink-0"
        >
          <Plus className="w-4 h-4" /> Log Time
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="text-[10px] uppercase font-mono tracking-wider text-[var(--text-tertiary)] block mb-1">Matter</label>
          <select value={matterFilter} onChange={e => setMatterFilter(e.target.value)} className="h-9 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none w-56">
            <option value="all">All matters</option>
            {matters.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase font-mono tracking-wider text-[var(--text-tertiary)] block mb-1">From</label>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-9 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none" />
        </div>
        <div>
          <label className="text-[10px] uppercase font-mono tracking-wider text-[var(--text-tertiary)] block mb-1">To</label>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-9 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none" />
        </div>
        <button
          onClick={handleExport}
          disabled={filtered.length === 0}
          className="h-9 px-3 flex items-center gap-1.5 text-xs font-medium border border-[var(--border-subtle)] rounded hover:bg-[var(--bg-tertiary)] transition-colors disabled:opacity-40"
        >
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
      </div>

      <div className="flex items-center gap-4 mb-4 text-sm">
        <span className="text-[var(--text-secondary)]">{formatHours(totals.totalMinutes)} hrs total</span>
        <span className="text-[var(--text-secondary)]">·</span>
        <span className="text-[var(--text-secondary)]">{formatHours(totals.billableMinutes)} hrs billable</span>
        {Array.from(totals.billableByCurrency.entries()).map(([cur, amount]) => (
          <span key={cur} className="contents">
            <span className="text-[var(--text-secondary)]">·</span>
            <span className="font-medium">{formatAmount(amount, cur, locale)} billable</span>
          </span>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-sm text-[var(--text-tertiary)] py-8 text-center">No time entries match this filter.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(t => {
            const amount = computeAmount(t.duration_minutes, t.rate);
            return (
              <div key={t.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <Clock className="w-4 h-4 text-[var(--text-tertiary)] shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{matterTitle(t.matter_id)}</span>
                      {!t.billable && <span className="text-[10px] uppercase px-1.5 py-0.5 bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] rounded-full shrink-0">Non-billable</span>}
                    </div>
                    <div className="text-xs text-[var(--text-tertiary)] truncate">
                      {attorneyName(t.attorney_id)} · {t.description || 'No description'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                  <div className="text-right shrink-0">
                    <div className="text-sm font-mono">{formatDateOnly(t.date, locale, { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                    <div className="text-xs text-[var(--text-tertiary)]">
                      {formatHours(t.duration_minutes)} hrs{amount != null ? ` · ${formatAmount(amount, t.currency ?? currency, locale)}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setEditingEntry(t)} className="w-8 h-8 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => deleteTimeEntry(t.id)} className="w-8 h-8 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--signal-negative)] transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showLog && <LogTimeModal onClose={() => setShowLog(false)} defaultMatterId={matterFilter !== 'all' ? matterFilter : undefined} />}
      {editingEntry && <LogTimeModal entry={editingEntry} onClose={() => setEditingEntry(null)} />}
    </div>
  );
}
