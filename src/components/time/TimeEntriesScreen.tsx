import { useMemo, useState } from 'react';
import { useStore } from '../../lib/store';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import {
  Clock, Plus, Download, Pencil, Trash2, Banknote, FileText,
  ExternalLink, UserPlus, User, CheckCircle2, AlertTriangle,
  Layers, List
} from 'lucide-react';
import { formatDateOnly } from '../../lib/dates';
import { computeAmount, formatAmount, formatHours } from '../../lib/timeEntries';
import { findUnbilledMatters } from '../../lib/riskSignals';
import { toCsv, downloadCsv } from '../../lib/csv';
import { LogTimeModal } from './LogTimeModal';
import { MatterDetailPanel } from '../matters/MatterDetailPanel';
import { TimeEntry, Matter } from '../../types';

type ViewMode = 'grouped' | 'flat';

function TimeEntryRow({
  t,
  locale,
  currency,
  attorneyName,
  matterTitle,
  showMatterTitle,
  onEdit,
  onDelete,
  onSelectMatter,
}: {
  t: TimeEntry;
  locale: string;
  currency: string;
  attorneyName: (id: string | null) => string | null;
  matterTitle?: string;
  showMatterTitle?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSelectMatter?: () => void;
}) {
  const amount = computeAmount(t.duration_minutes, t.rate);
  const name = attorneyName(t.attorney_id);

  return (
    <div
      onClick={onEdit}
      className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-elevated)] hover:border-[var(--border-strong)] transition-all cursor-pointer shadow-sm"
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="p-2 bg-[var(--bg-tertiary)] rounded-md text-[var(--text-tertiary)] group-hover:text-[var(--accent-primary)] group-hover:bg-[var(--accent-primary)]/10 transition-colors shrink-0 mt-0.5">
          <Clock className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {showMatterTitle && matterTitle && (
              <span
                onClick={(e) => {
                  if (onSelectMatter) {
                    e.stopPropagation();
                    onSelectMatter();
                  }
                }}
                className="text-sm font-semibold text-[var(--text-primary)] hover:text-[var(--accent-secondary)] hover:underline truncate"
              >
                {matterTitle}
              </span>
            )}
            <span className="text-xs font-mono font-medium text-[var(--text-secondary)]">
              {formatDateOnly(t.date, locale, { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>

            {!t.billable && (
              <span className="text-[10px] uppercase font-medium px-2 py-0.5 bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] border border-[var(--border-subtle)] rounded-full shrink-0">
                Non-billable
              </span>
            )}
            {t.invoice_id ? (
              <span className="text-[10px] uppercase font-medium px-2 py-0.5 bg-[var(--signal-positive)]/15 text-[var(--signal-positive)] border border-[var(--signal-positive)]/30 rounded-full shrink-0 flex items-center gap-1">
                <CheckCircle2 className="w-2.5 h-2.5" /> Invoiced
              </span>
            ) : t.billable ? (
              <span className="text-[10px] uppercase font-medium px-2 py-0.5 bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] border border-[var(--accent-primary)]/20 rounded-full shrink-0">
                Unbilled
              </span>
            ) : null}
          </div>

          <div className="text-xs text-[var(--text-secondary)] leading-relaxed">
            {t.description || <span className="italic text-[var(--text-tertiary)]">No description provided</span>}
          </div>

          <div className="flex items-center gap-2 pt-0.5">
            {name ? (
              <span className="text-[11px] text-[var(--text-secondary)] font-medium flex items-center gap-1 bg-[var(--bg-tertiary)] px-2 py-0.5 rounded border border-[var(--border-subtle)]">
                <User className="w-3 h-3 text-[var(--text-tertiary)]" /> {name}
              </span>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors"
                title="Click to assign an attorney to this entry"
              >
                <UserPlus className="w-3 h-3 text-[var(--accent-primary)]" />
                <span>Assign attorney</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 border-t sm:border-t-0 border-[var(--border-subtle)] pt-2 sm:pt-0">
        <div className="text-right shrink-0">
          <div className="text-sm font-mono font-semibold text-[var(--text-primary)]">
            {formatHours(t.duration_minutes)} hrs
          </div>
          <div className="text-xs text-[var(--text-tertiary)] font-mono">
            {amount != null ? formatAmount(amount, t.currency ?? currency, locale) : '—'}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="w-8 h-8 flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
            aria-label="Edit time entry"
            title="Edit time entry"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="w-8 h-8 flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-[var(--signal-negative)] hover:bg-[var(--signal-negative)]/10 transition-colors"
            aria-label="Delete time entry"
            title="Delete time entry"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function TimeEntriesScreen() {
  const { timeEntries, matters, attorneys, practiceAreas, firm, deleteTimeEntry, generateInvoice } = useStore();
  const { isDevMode } = useAuth();
  const locale = firm?.locale || 'en-US';

  const [matterFilter, setMatterFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grouped');
  const [showLog, setShowLog] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [invoicingMatterId, setInvoicingMatterId] = useState<string | null>(null);
  const [selectedMatterForDetail, setSelectedMatterForDetail] = useState<Matter | null>(null);

  const matterTitle = (id: string) => matters.find(m => m.id === id)?.title ?? 'Unlinked / Standalone';
  const attorneyName = (id: string | null) => attorneys.find(a => a.id === id)?.name ?? null;

  const unbilledTimeEntries = useMemo(() => timeEntries.filter(t => !t.invoice_id), [timeEntries]);
  const unbilled = useMemo(() => findUnbilledMatters(matters, unbilledTimeEntries), [matters, unbilledTimeEntries]);

  const handleGenerateInvoice = async (matterId: string) => {
    const isEligible = unbilled.some(u => u.matter.id === matterId);
    if (!isEligible) return;
    const entryIds = unbilledTimeEntries.filter(t => t.matter_id === matterId && t.billable).map(t => t.id);
    if (entryIds.length === 0) return;
    setInvoicingMatterId(matterId);
    const result = await generateInvoice(matterId, entryIds);
    setInvoicingMatterId(null);
    if (result.invoice && !isDevMode) {
      const { data } = await supabase.storage.from('matter-documents').createSignedUrl(result.invoice.storage_path, 60);
      if (data) window.open(data.signedUrl, '_blank');
    }
  };

  const filtered = useMemo(() => {
    return timeEntries
      .filter(t => matterFilter === 'all' || t.matter_id === matterFilter)
      .filter(t => !fromDate || t.date >= fromDate)
      .filter(t => !toDate || t.date <= toDate)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [timeEntries, matterFilter, fromDate, toDate]);

  const currency = firm?.currency ?? 'USD';

  const groupedByMatter = useMemo(() => {
    const groupsMap = new Map<string, { matter: Matter | null; entries: TimeEntry[] }>();

    for (const entry of filtered) {
      const key = entry.matter_id || 'unlinked';
      if (!groupsMap.has(key)) {
        const m = matters.find(x => x.id === entry.matter_id) ?? null;
        groupsMap.set(key, { matter: m, entries: [] });
      }
      groupsMap.get(key)!.entries.push(entry);
    }

    return Array.from(groupsMap.values());
  }, [filtered, matters]);

  const totals = useMemo(() => {
    let totalMinutes = 0, billableMinutes = 0;
    const billableByCurrency = new Map<string, number>();
    for (const t of filtered) {
      totalMinutes += t.duration_minutes;
      if (t.billable) {
        billableMinutes += t.duration_minutes;
        const amount = computeAmount(t.duration_minutes, t.rate);
        if (amount !== null) {
          const key = t.currency ?? currency;
          billableByCurrency.set(key, (billableByCurrency.get(key) ?? 0) + amount);
        }
      }
    }
    return { totalMinutes, billableMinutes, billableByCurrency };
  }, [filtered, currency]);

  const handleExport = () => {
    const headers = ['Date', 'Matter', 'Attorney', 'Duration (hrs)', 'Rate', 'Amount', 'Billable', 'Description'];
    const rows = filtered.map(t => {
      const amount = computeAmount(t.duration_minutes, t.rate);
      return [
        t.date,
        matterTitle(t.matter_id),
        attorneyName(t.attorney_id) ?? 'Unassigned',
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
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl font-medium">Time &amp; Billing</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Track billable hours, review unbilled balances per matter, and generate invoices.
          </p>
        </div>
        <button
          onClick={() => setShowLog(true)}
          className="h-9 px-4 flex items-center gap-1.5 text-sm font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded hover:opacity-90 transition-opacity shrink-0"
        >
          <Plus className="w-4 h-4" /> Log Time
        </button>
      </div>

      {/* Unbilled Alert Banner */}
      {unbilled.length > 0 && (
        <div className="mb-6 space-y-2">
          {unbilled.slice(0, 3).map(u => (
            <div
              key={u.matter.id}
              className="flex items-center justify-between gap-3 bg-[var(--bg-secondary)] border border-[var(--accent-primary)]/30 rounded-lg px-4 py-3 shadow-sm"
            >
              <button
                onClick={() => {
                  setMatterFilter(u.matter.id);
                  setViewMode('grouped');
                }}
                className="text-left min-w-0 hover:opacity-80 transition-opacity"
              >
                <div className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]">
                  <Banknote className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
                  <span className="truncate">{u.matter.title}</span>
                </div>
                <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                  {(u.minutes / 60).toFixed(1)} billable hours recorded, oldest entry {u.ageDays} day{u.ageDays === 1 ? '' : 's'} old — ready for invoicing.
                </div>
              </button>
              <button
                onClick={() => handleGenerateInvoice(u.matter.id)}
                disabled={invoicingMatterId === u.matter.id}
                className="h-8 px-3 flex items-center gap-1.5 text-xs font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded hover:opacity-90 transition-opacity disabled:opacity-60 shrink-0"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{invoicingMatterId === u.matter.id ? 'Generating…' : 'Generate invoice'}</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Filters & View Mode Controls */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[10px] uppercase font-mono tracking-wider text-[var(--text-tertiary)] block mb-1">
              Matter
            </label>
            <select
              value={matterFilter}
              onChange={e => setMatterFilter(e.target.value)}
              className="h-9 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none w-56"
            >
              <option value="all">All matters</option>
              {matters.map(m => (
                <option key={m.id} value={m.id}>{m.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase font-mono tracking-wider text-[var(--text-tertiary)] block mb-1">
              From
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="h-9 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase font-mono tracking-wider text-[var(--text-tertiary)] block mb-1">
              To
            </label>
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="h-9 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none"
            />
          </div>
          <button
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="h-9 px-3 flex items-center gap-1.5 text-xs font-medium border border-[var(--border-subtle)] rounded hover:bg-[var(--bg-tertiary)] transition-colors disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] p-0.5 rounded-lg">
          <button
            onClick={() => setViewMode('grouped')}
            className={`h-8 px-3 text-xs font-medium rounded flex items-center gap-1.5 transition-colors ${
              viewMode === 'grouped'
                ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" /> Grouped by Matter
          </button>
          <button
            onClick={() => setViewMode('flat')}
            className={`h-8 px-3 text-xs font-medium rounded flex items-center gap-1.5 transition-colors ${
              viewMode === 'flat'
                ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <List className="w-3.5 h-3.5" /> Flat Timeline
          </button>
        </div>
      </div>

      {/* Totals Bar */}
      <div className="flex flex-wrap items-center gap-4 mb-6 text-sm">
        <span className="text-[var(--text-secondary)]">{formatHours(totals.totalMinutes)} hrs total</span>
        <span className="text-[var(--text-secondary)]">·</span>
        <span className="text-[var(--text-secondary)]">{formatHours(totals.billableMinutes)} hrs billable</span>
        {Array.from(totals.billableByCurrency.entries()).map(([cur, amount]) => (
          <span key={cur} className="contents">
            <span className="text-[var(--text-secondary)]">·</span>
            <span className="font-medium text-[var(--text-primary)]">{formatAmount(amount, cur, locale)} billable</span>
          </span>
        ))}
      </div>

      {/* Main Content Area */}
      {filtered.length === 0 ? (
        <div className="text-sm text-[var(--text-tertiary)] py-12 text-center border border-dashed border-[var(--border-subtle)] rounded-lg bg-[var(--bg-secondary)]">
          No time entries match this filter.
        </div>
      ) : viewMode === 'grouped' ? (
        /* Grouped by Matter View */
        <div className="space-y-6">
          {groupedByMatter.map(({ matter, entries }) => {
            const mId = matter?.id;
            const pArea = matter ? practiceAreas.find(p => p.id === matter.practice_area_id) : null;
            const groupUnbilledEntries = entries.filter(t => !t.invoice_id && t.billable);
            const groupUnbilledMinutes = groupUnbilledEntries.reduce((sum, t) => sum + t.duration_minutes, 0);
            const groupTotalMinutes = entries.reduce((sum, t) => sum + t.duration_minutes, 0);

            const unbilledAmountsByCurrency = new Map<string, number>();
            for (const t of groupUnbilledEntries) {
              const amount = computeAmount(t.duration_minutes, t.rate);
              if (amount !== null) {
                const code = t.currency ?? currency;
                unbilledAmountsByCurrency.set(code, (unbilledAmountsByCurrency.get(code) ?? 0) + amount);
              }
            }

            const isUnbilledFlagged = matter ? unbilled.some(u => u.matter.id === matter.id) : false;
            const unbilledFlagItem = matter ? unbilled.find(u => u.matter.id === matter.id) : null;
            const allInvoiced = entries.length > 0 && entries.every(t => !!t.invoice_id);

            return (
              <div key={mId || 'unlinked'} className="bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl overflow-hidden shadow-sm">
                {/* Matter Group Header */}
                <div className="bg-[var(--bg-tertiary)]/70 border-b border-[var(--border-subtle)] p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {matter ? (
                        <button
                          onClick={() => setSelectedMatterForDetail(matter)}
                          className="text-base font-semibold text-[var(--text-primary)] hover:text-[var(--accent-secondary)] transition-colors flex items-center gap-1.5 group text-left"
                        >
                          <span className="truncate">{matter.title}</span>
                          <ExternalLink className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 transition-opacity text-[var(--accent-secondary)] shrink-0" />
                        </button>
                      ) : (
                        <span className="text-base font-semibold text-[var(--text-primary)]">Unlinked / Standalone Entries</span>
                      )}

                      {isUnbilledFlagged ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--signal-warning)]/15 text-[var(--signal-warning)] border border-[var(--signal-warning)]/30 shrink-0">
                          <AlertTriangle className="w-3 h-3" /> Ready to Invoice
                        </span>
                      ) : allInvoiced ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--signal-positive)]/15 text-[var(--signal-positive)] border border-[var(--signal-positive)]/30 shrink-0">
                          <CheckCircle2 className="w-3 h-3" /> All Invoiced
                        </span>
                      ) : groupUnbilledEntries.length > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] border border-[var(--accent-primary)]/20 shrink-0">
                          <Clock className="w-3 h-3" /> {formatHours(groupUnbilledMinutes)}h unbilled
                        </span>
                      ) : null}
                    </div>

                    <div className="text-xs text-[var(--text-tertiary)] flex flex-wrap items-center gap-2">
                      {pArea && <span>{pArea.label}</span>}
                      {pArea && <span>·</span>}
                      <span>{entries.length} time {entries.length === 1 ? 'entry' : 'entries'} ({formatHours(groupTotalMinutes)}h total)</span>
                      {groupUnbilledEntries.length > 0 && (
                        <>
                          <span>·</span>
                          <span className="font-medium text-[var(--text-secondary)]">
                            {formatHours(groupUnbilledMinutes)}h unbilled
                            {unbilledAmountsByCurrency.size > 0 && (
                              <> ({Array.from(unbilledAmountsByCurrency.entries()).map(([c, a]) => formatAmount(a, c, locale)).join(' + ')})</>
                            )}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Group Action Buttons */}
                  <div className="flex items-center gap-2 shrink-0">
                    {matter && isUnbilledFlagged && (
                      <button
                        onClick={() => handleGenerateInvoice(matter.id)}
                        disabled={invoicingMatterId === matter.id}
                        className="h-8 px-3 flex items-center gap-1.5 text-xs font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] hover:opacity-90 rounded transition-all shrink-0 shadow-sm"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>{invoicingMatterId === matter.id ? 'Generating…' : 'Generate Invoice'}</span>
                      </button>
                    )}

                    {matter && (
                      <button
                        onClick={() => setSelectedMatterForDetail(matter)}
                        className="h-8 px-2.5 flex items-center gap-1 text-xs font-medium border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded transition-colors shrink-0"
                        title="Open matter details panel"
                      >
                        <span>View Matter</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Group Rows List */}
                <div className="p-3 space-y-2">
                  {entries.map(t => (
                    <TimeEntryRow
                      key={t.id}
                      t={t}
                      locale={locale}
                      currency={currency}
                      attorneyName={attorneyName}
                      onEdit={() => setEditingEntry(t)}
                      onDelete={() => deleteTimeEntry(t.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Flat Timeline View */
        <div className="space-y-2">
          {filtered.map(t => {
            const m = matters.find(x => x.id === t.matter_id);
            return (
              <TimeEntryRow
                key={t.id}
                t={t}
                locale={locale}
                currency={currency}
                attorneyName={attorneyName}
                matterTitle={matterTitle(t.matter_id)}
                showMatterTitle={true}
                onEdit={() => setEditingEntry(t)}
                onDelete={() => deleteTimeEntry(t.id)}
                onSelectMatter={m ? () => setSelectedMatterForDetail(m) : undefined}
              />
            );
          })}
        </div>
      )}

      {/* Modals */}
      {showLog && (
        <LogTimeModal
          onClose={() => setShowLog(false)}
          defaultMatterId={matterFilter !== 'all' ? matterFilter : undefined}
        />
      )}

      {editingEntry && (
        <LogTimeModal
          entry={editingEntry}
          onClose={() => setEditingEntry(null)}
        />
      )}

      {selectedMatterForDetail && (
        <MatterDetailPanel
          matter={selectedMatterForDetail}
          onClose={() => setSelectedMatterForDetail(null)}
        />
      )}
    </div>
  );
}

