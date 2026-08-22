import { useMemo, useState } from 'react';
import { useStore } from '../../lib/store';
import { useAuth } from '../../lib/auth';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { generateInvoicePdf } from '../../lib/invoice';
import { useToast } from '../../lib/toast';
import {
  Clock, Plus, Download, Pencil, Trash2, Banknote, FileText,
  ExternalLink, UserPlus, User, CheckCircle2, AlertTriangle,
  Layers, List, Eye, Send
} from 'lucide-react';
import { formatDateOnly } from '../../lib/dates';
import { computeAmount, formatAmount, formatHours } from '../../lib/timeEntries';
import { findUnbilledMatters } from '../../lib/riskSignals';
import { toCsv, downloadCsv } from '../../lib/csv';
import { LogTimeModal } from './LogTimeModal';
import { MatterDetailPanel } from '../matters/MatterDetailPanel';
import { TimeEntry, Matter, Invoice } from '../../types';

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
  onOpenInvoice,
}: {
  t: TimeEntry;
  locale: string;
  currency: string;
  attorneyName: string | null;
  matterTitle?: string;
  showMatterTitle?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSelectMatter?: () => void;
  onOpenInvoice?: () => void;
}) {
  const amount = computeAmount(t.duration_minutes, t.rate);
  const entryCurrency = t.currency ?? currency;
  const name = attorneyName;

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
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onOpenInvoice) onOpenInvoice();
                }}
                className="text-[10px] uppercase font-medium px-2 py-0.5 bg-[var(--signal-positive)]/15 text-[var(--signal-positive)] hover:bg-[var(--signal-positive)]/25 border border-[var(--signal-positive)]/30 rounded-full shrink-0 flex items-center gap-1 transition-colors cursor-pointer"
                title="Click to view/download generated invoice PDF"
              >
                <CheckCircle2 className="w-2.5 h-2.5" />
                <span>Invoiced</span>
                <Download className="w-2.5 h-2.5 opacity-70 ml-0.5" />
              </button>
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

        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="text-sm font-mono font-medium text-[var(--text-primary)]">
            {amount !== null ? formatAmount(amount, entryCurrency, locale) : '—'}
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={e => {
                e.stopPropagation();
                onEdit();
              }}
              className="p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] rounded hover:bg-[var(--bg-tertiary)] transition-colors"
              title="Edit entry"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={e => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1 text-[var(--text-tertiary)] hover:text-[var(--signal-negative)] rounded hover:bg-[var(--bg-tertiary)] transition-colors"
              title="Delete entry"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TimeEntriesScreen() {
  const {
    timeEntries, matters, attorneys, practiceAreas, deleteTimeEntry, firm, invoices, parties, generateInvoice, sendMatterCommunication, clientInvites, communications
  } = useStore();
  const { isDevMode } = useAuth();
  const { showToast } = useToast();
  const locale = firm?.locale || 'en-US';

  const [matterFilter, setMatterFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grouped');
  const [showLog, setShowLog] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [invoicingMatterId, setInvoicingMatterId] = useState<string | null>(null);
  const [issuingInvoiceId, setIssuingInvoiceId] = useState<string | null>(null);
  const [selectedMatterForDetail, setSelectedMatterForDetail] = useState<Matter | null>(null);

  const matterTitle = (id: string) => matters.find(m => m.id === id)?.title ?? 'Unlinked / Standalone';
  const attorneyName = (id: string | null) => attorneys.find(a => a.id === id)?.name ?? null;

  const unbilledTimeEntries = useMemo(() => timeEntries.filter(t => !t.invoice_id), [timeEntries]);
  const unbilled = useMemo(() => findUnbilledMatters(matters, unbilledTimeEntries), [matters, unbilledTimeEntries]);

  const getInvoicePdfBlob = (inv: Invoice): Blob => {
    const m = matters.find(x => x.id === inv.matter_id);
    const entries = timeEntries.filter(t => t.invoice_id === inv.id);
    const clientName = parties.find(p => p.id === m?.client_party_id)?.name ?? 'Client';

    const { blob } = generateInvoicePdf({
      invoiceNumber: inv.invoice_number,
      issuedDate: inv.issued_date,
      dueDate: 'Due upon receipt',
      firmName: firm?.name ?? 'Law Firm',
      firmRegion: firm?.region ?? null,
      firmCountry: firm?.country ?? null,
      firmPhone: firm?.phone_answering_number ?? null,
      lawpayUrl: firm?.lawpay_payment_page_url ?? null,
      clientName,
      matterTitle: m?.title ?? 'Matter',
      currency: inv.currency,
      locale: firm?.locale ?? 'en-US',
      entries: entries.map(e => ({ id: e.id, date: e.date, description: e.description, duration_minutes: e.duration_minutes, rate: e.rate })),
    });
    return blob;
  };

  const handleViewInvoice = async (inv: Invoice) => {
    if (isSupabaseConfigured && !inv.storage_path.startsWith('local/')) {
      const { data } = await supabase.storage.from('matter-documents').createSignedUrl(inv.storage_path, 60);
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
        return;
      }
    }
    const blob = getInvoicePdfBlob(inv);
    window.open(URL.createObjectURL(blob), '_blank');
  };

  const handleDownloadInvoice = async (inv: Invoice) => {
    let blobToDownload: Blob | null = null;
    if (isSupabaseConfigured && !inv.storage_path.startsWith('local/')) {
      const { data } = await supabase.storage.from('matter-documents').download(inv.storage_path);
      if (data) blobToDownload = data;
    }
    if (!blobToDownload) {
      blobToDownload = getInvoicePdfBlob(inv);
    }
    const url = URL.createObjectURL(blobToDownload);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${inv.invoice_number}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleIssueInvoice = async (inv: Invoice) => {
    const matter = matters.find(m => m.id === inv.matter_id);
    if (!matter) return;
    const clientParty = parties.find(p => p.id === matter.client_party_id);
    
    // Extract client email from party notes, portal invites, or previous communications
    let clientEmail: string | null = null;

    // 1. Check client invites for this party
    if (clientParty) {
      const invite = clientInvites
        .filter(i => i.party_id === clientParty.id)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
      if (invite?.email?.trim()) clientEmail = invite.email.trim();
    }

    // 2. Parse out of party.notes (written by submit_intake as "Email: ..." or general text)
    if (!clientEmail && clientParty?.notes) {
      const match = /Email:\s*([^\s;,\n\r]+@[^\s;,\n\r]+)/i.exec(clientParty.notes) ||
                    /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i.exec(clientParty.notes);
      if (match?.[1]) clientEmail = match[1].trim();
    }

    // 3. Fall back to past communications logged for this matter
    if (!clientEmail) {
      const sentTo = Array.from(
        new Set(communications.filter(c => c.matter_id === matter.id).map(c => c.sent_to.trim().toLowerCase()))
      );
      if (sentTo.length === 1 && sentTo[0]) clientEmail = sentTo[0];
    }

    if (!clientEmail) {
      showToast('error', `Cannot issue invoice: No email address on file for client ${clientParty?.name || 'Party'}.`);
      return;
    }

    setIssuingInvoiceId(inv.id);

    let pdfUrl = '';
    if (isSupabaseConfigured && !inv.storage_path.startsWith('local/')) {
      const { data } = await supabase.storage.from('matter-documents').createSignedUrl(inv.storage_path, 86400 * 7);
      if (data?.signedUrl) pdfUrl = data.signedUrl;
    }

    const subject = `Invoice ${inv.invoice_number} - ${matter.title}`;
    const body = `Dear ${clientParty?.name || 'Client'},\n\nPlease find attached Invoice ${inv.invoice_number} for ${matter.title}.\n\nTotal Amount: ${formatAmount(inv.total_amount, inv.currency, locale)}\nIssued Date: ${inv.issued_date}\n${pdfUrl ? `\nInvoice PDF Link:\n${pdfUrl}\n` : ''}\nThank you,\n${firm?.name || 'Law Firm'}`;

    const res = await sendMatterCommunication({
      matter_id: matter.id,
      sent_to: clientEmail,
      subject,
      body,
    });

    setIssuingInvoiceId(null);
    if (!res?.error) {
      showToast('success', `Invoice ${inv.invoice_number} issued to ${clientEmail}.`);
    }
  };

  const handleOpenInvoiceById = (invoiceId: string | null | undefined) => {
    if (!invoiceId) return;
    const inv = invoices.find(i => i.id === invoiceId);
    if (inv) handleViewInvoice(inv);
  };

  const handleGenerateInvoice = async (matterId: string) => {
    const entriesToInvoice = unbilledTimeEntries.filter(t => t.matter_id === matterId && t.billable);
    const totalMins = entriesToInvoice.reduce((sum, t) => sum + (t.duration_minutes || 0), 0);
    if (totalMins < 120) return;
    const entryIds = entriesToInvoice.map(t => t.id);
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

    return Array.from(groupsMap.entries()).map(([key, data]) => ({
      mId: key,
      matter: data.matter,
      entries: data.entries,
    }));
  }, [filtered, matters]);

  const grandTotals = useMemo(() => {
    let totalMins = 0;
    let unbilledMins = 0;
    const unbilledByCurrency = new Map<string, number>();

    for (const t of filtered) {
      const mins = t.duration_minutes || 0;
      totalMins += mins;
      if (!t.invoice_id && t.billable) {
        unbilledMins += mins;
        const amt = computeAmount(mins, t.rate);
        if (amt !== null) {
          const code = t.currency ?? currency;
          unbilledByCurrency.set(code, (unbilledByCurrency.get(code) ?? 0) + amt);
        }
      }
    }

    return { totalMins, unbilledMins, unbilledByCurrency };
  }, [filtered, currency]);

  const handleExportCsv = () => {
    const rows = filtered.map(t => ({
      Date: t.date,
      Matter: matterTitle(t.matter_id),
      Attorney: attorneyName(t.assigned_attorney_id) ?? '',
      'Duration (hours)': formatHours(t.duration_minutes),
      'Rate/hr': t.rate ?? '',
      Currency: t.currency ?? currency,
      Amount: computeAmount(t.duration_minutes, t.rate) ?? '',
      Billable: t.billable ? 'Yes' : 'No',
      Invoiced: t.invoice_id ? 'Yes' : 'No',
      Description: t.description || '',
    }));
    downloadCsv(`time-entries-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-medium mb-1">Time &amp; Billing</h2>
          <p className="text-sm text-[var(--text-secondary)]">Log time, track unbilled balances, and generate matter invoices.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={handleExportCsv}
            className="h-9 px-3 flex items-center gap-1.5 text-xs font-medium border border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          <button
            onClick={() => setShowLog(true)}
            className="h-9 px-4 flex items-center gap-1.5 text-sm font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded-lg hover:opacity-90 transition-opacity shadow-sm"
          >
            <Plus className="w-4 h-4" /> Log Time
          </button>
        </div>
      </div>

      {unbilled.length > 0 && (
        <div className="mb-6 space-y-2">
          {unbilled.map(u => (
            <div key={u.matter.id} className="flex items-center justify-between bg-[var(--bg-secondary)] border border-[var(--signal-warning)]/30 rounded-lg p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                <AlertTriangle className="w-4 h-4 text-[var(--signal-warning)] shrink-0" />
                <span>{u.matter.title}</span>
                <span className="text-xs text-[var(--text-secondary)]">({formatHours(u.minutes)}h unbilled, oldest {u.ageDays}d old)</span>
              </div>
              <button
                onClick={() => handleGenerateInvoice(u.matter.id)}
                disabled={invoicingMatterId === u.matter.id}
                className="h-8 px-3 flex items-center gap-1 text-xs font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded hover:opacity-90 transition-opacity disabled:opacity-40 shrink-0"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{invoicingMatterId === u.matter.id ? 'Generating…' : 'Generate Invoice'}</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Summary Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-4 shadow-sm">
          <div className="text-xs font-mono uppercase tracking-wider text-[var(--text-tertiary)] mb-1">Total Logged Time</div>
          <div className="text-xl font-bold text-[var(--text-primary)]">{formatHours(grandTotals.totalMins)} hrs</div>
          <div className="text-xs text-[var(--text-tertiary)] mt-1">{filtered.length} total time entries</div>
        </div>

        <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-4 shadow-sm">
          <div className="text-xs font-mono uppercase tracking-wider text-[var(--text-tertiary)] mb-1">Unbilled Time</div>
          <div className="text-xl font-bold text-[var(--accent-primary)]">{formatHours(grandTotals.unbilledMins)} hrs</div>
          <div className="text-xs text-[var(--text-tertiary)] mt-1">Ready for invoicing cycle</div>
        </div>

        <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-4 shadow-sm">
          <div className="text-xs font-mono uppercase tracking-wider text-[var(--text-tertiary)] mb-1">Unbilled Revenue</div>
          <div className="text-xl font-bold text-[var(--signal-positive)]">
            {grandTotals.unbilledByCurrency.size > 0
              ? Array.from(grandTotals.unbilledByCurrency.entries()).map(([c, a]) => formatAmount(a, c, locale)).join(' + ')
              : '$0.00'}
          </div>
          <div className="text-xs text-[var(--text-tertiary)] mt-1">Pending client billing</div>
        </div>
      </div>

      {/* Filter & View Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          <select
            value={matterFilter}
            onChange={e => setMatterFilter(e.target.value)}
            className="h-9 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg text-xs font-medium focus:outline-none w-full sm:w-56"
          >
            <option value="all">All matters</option>
            {matters.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>

          <div className="flex items-center gap-1">
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="h-9 px-2 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg text-xs font-mono focus:outline-none"
              title="From date"
            />
            <span className="text-xs text-[var(--text-tertiary)]">to</span>
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="h-9 px-2 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg text-xs font-mono focus:outline-none"
              title="To date"
            />
          </div>

          {(matterFilter !== 'all' || fromDate || toDate) && (
            <button
              onClick={() => { setMatterFilter('all'); setFromDate(''); setToDate(''); }}
              className="h-9 px-2.5 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Reset filters
            </button>
          )}
        </div>

        <div className="flex items-center bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] p-0.5 rounded-lg">
          <button
            onClick={() => setViewMode('grouped')}
            className={`h-8 px-3 text-xs font-medium rounded flex items-center gap-1.5 transition-colors ${
              viewMode === 'grouped'
                ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" /> Group by Matter
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

      {/* Main Entries Section */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl">
          <Clock className="w-8 h-8 text-[var(--text-tertiary)] mx-auto mb-3" />
          <div className="text-sm font-medium mb-1">No time entries found</div>
          <p className="text-xs text-[var(--text-tertiary)] max-w-sm mx-auto mb-4">
            Try adjusting your filters or click below to log new billable time for your firm.
          </p>
          <button
            onClick={() => setShowLog(true)}
            className="h-8 px-3 text-xs font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded hover:opacity-90 transition-opacity"
          >
            Log Time
          </button>
        </div>
      ) : viewMode === 'grouped' ? (
        <div className="space-y-6">
          {groupedByMatter.map(({ mId, matter, entries }) => {
            const pArea = matter ? practiceAreas.find(p => p.id === matter.practice_area_id) : null;
            const groupTotalMinutes = entries.reduce((s, t) => s + (t.duration_minutes || 0), 0);
            const groupUnbilledEntries = entries.filter(t => !t.invoice_id && t.billable);
            const groupUnbilledMinutes = groupUnbilledEntries.reduce((s, t) => s + (t.duration_minutes || 0), 0);

            const unbilledAmountsByCurrency = new Map<string, number>();
            for (const t of groupUnbilledEntries) {
              const amount = computeAmount(t.duration_minutes, t.rate);
              if (amount !== null) {
                const code = t.currency ?? currency;
                unbilledAmountsByCurrency.set(code, (unbilledAmountsByCurrency.get(code) ?? 0) + amount);
              }
            }

            const isUnbilledFlagged = matter ? unbilled.some(u => u.matter.id === matter.id) : false;
            const allInvoiced = entries.length > 0 && entries.every(t => !!t.invoice_id);
            const matterInvoicesList = matter ? invoices.filter(i => i.matter_id === matter.id).sort((a, b) => b.issued_date.localeCompare(a.issued_date)) : [];
            const latestInvoice = matterInvoicesList[0] ?? null;

            return (
              <div key={mId || 'unlinked'} className="bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl overflow-hidden shadow-sm">
                {/* Matter Group Header */}
                <div className="bg-[var(--bg-tertiary)]/70 border-b border-[var(--border-subtle)] p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {matter ? (
                        <span className="text-base font-semibold text-[var(--text-primary)]">{matter.title}</span>
                      ) : (
                        <span className="text-base font-semibold text-[var(--text-primary)]">Unlinked / Standalone Entries</span>
                      )}

                      {isUnbilledFlagged ? (
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-[var(--signal-warning)] bg-[var(--signal-warning)]/15 border border-[var(--signal-warning)]/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <AlertTriangle className="w-2.5 h-2.5" /> Ready to Invoice
                        </span>
                      ) : allInvoiced ? (
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-[var(--signal-positive)] bg-[var(--signal-positive)]/15 border border-[var(--signal-positive)]/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5" /> All Invoiced
                        </span>
                      ) : groupUnbilledMinutes > 0 ? (
                        <span className="text-[10px] uppercase tracking-wider font-medium text-[var(--text-secondary)] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5 text-[var(--accent-primary)]" /> {formatHours(groupUnbilledMinutes)}h unbilled
                        </span>
                      ) : null}
                    </div>

                    <div className="text-xs text-[var(--text-tertiary)] flex flex-wrap items-center gap-2">
                      {pArea && <span>{pArea.label}</span>}
                      {pArea && <span>·</span>}
                      <span>{entries.length} {entries.length === 1 ? 'entry' : 'entries'} ({formatHours(groupTotalMinutes)}h total)</span>
                      {unbilledAmountsByCurrency.size > 0 && (
                        <>
                          <span>·</span>
                          <span className="font-medium text-[var(--text-secondary)]">
                            {Array.from(unbilledAmountsByCurrency.entries()).map(([c, a]) => formatAmount(a, c, locale)).join(' + ')} unbilled
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Group Action Buttons — Billing-First */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {matter && groupUnbilledMinutes >= 120 && (
                      <button
                        onClick={() => handleGenerateInvoice(matter.id)}
                        disabled={invoicingMatterId === matter.id}
                        className="h-8 px-3 flex items-center gap-1.5 text-xs font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] hover:opacity-90 rounded transition-all shrink-0 shadow-sm disabled:opacity-50"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>{invoicingMatterId === matter.id ? 'Generating…' : 'Generate Invoice'}</span>
                      </button>
                    )}

                    {matter && latestInvoice && (
                      <div className="flex items-center gap-1 shrink-0">
                        {/* View PDF */}
                        <button
                          onClick={() => handleViewInvoice(latestInvoice)}
                          className="h-8 px-2.5 flex items-center gap-1 text-xs font-medium border border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] rounded transition-colors shrink-0"
                          title="View invoice PDF in browser"
                        >
                          <Eye className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                          <span>View</span>
                        </button>

                        {/* Download PDF */}
                        <button
                          onClick={() => handleDownloadInvoice(latestInvoice)}
                          className="h-8 px-2.5 flex items-center gap-1 text-xs font-medium border border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] rounded transition-colors shrink-0"
                          title="Download raw PDF file to disk"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download</span>
                        </button>

                        {/* Issue Invoice via Email */}
                        <button
                          onClick={() => handleIssueInvoice(latestInvoice)}
                          disabled={issuingInvoiceId === latestInvoice.id}
                          className="h-8 px-2.5 flex items-center gap-1 text-xs font-medium bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] border border-[var(--accent-primary)]/20 hover:bg-[var(--accent-primary)]/20 rounded transition-colors shrink-0 disabled:opacity-50"
                          title="Issue invoice by emailing to client"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>{issuingInvoiceId === latestInvoice.id ? 'Issuing…' : 'Issue'}</span>
                        </button>
                      </div>
                    )}

                    {matter && (
                      <button
                        onClick={() => setSelectedMatterForDetail(matter)}
                        className="p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded transition-colors shrink-0 ml-1"
                        title="View full matter details panel"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
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
                      attorneyName={attorneyName(t.assigned_attorney_id)}
                      matterTitle={matterTitle(t.matter_id)}
                      showMatterTitle={false}
                      onEdit={() => setEditingEntry(t)}
                      onDelete={() => deleteTimeEntry(t.id)}
                      onOpenInvoice={() => handleOpenInvoiceById(t.invoice_id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(t => (
            <TimeEntryRow
              key={t.id}
              t={t}
              locale={locale}
              currency={currency}
              attorneyName={attorneyName(t.assigned_attorney_id)}
              matterTitle={matterTitle(t.matter_id)}
              showMatterTitle={true}
              onEdit={() => setEditingEntry(t)}
              onDelete={() => deleteTimeEntry(t.id)}
              onSelectMatter={() => {
                const m = matters.find(x => x.id === t.matter_id);
                if (m) setSelectedMatterForDetail(m);
              }}
              onOpenInvoice={() => handleOpenInvoiceById(t.invoice_id)}
            />
          ))}
        </div>
      )}

      {showLog && (
        <LogTimeModal
          initialMatterId={matterFilter !== 'all' ? matterFilter : undefined}
          onClose={() => setShowLog(false)}
        />
      )}

      {editingEntry && (
        <LogTimeModal
          entryToEdit={editingEntry}
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
