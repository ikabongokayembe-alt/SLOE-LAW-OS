import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../lib/store';
import { findDocumentGaps } from '../../lib/riskSignals';
import { useAuth } from '../../lib/auth';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { generateInvoicePdf } from '../../lib/invoice';
import { formatDateOnly } from '../../lib/dates';
import { formatAmount } from '../../lib/timeEntries';
import { FileText, Upload, Trash2, Download, History, Search, X, Eye, EyeOff, PenLine, RefreshCw, AlertTriangle, Receipt, CheckCircle2 } from 'lucide-react';
import { LawDocument, DocumentSearchResult, SignatureRequest, Invoice } from '../../types';
import { DocumentPreviewPanel } from './DocumentPreview';

function renderSnippet(snippet: string) {
  const parts = snippet.split(/§§B§§|§§E§§/);
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>));
}

function formatBytes(bytes?: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function rootKey(d: LawDocument): string {
  return d.parent_document_id ?? d.id;
}

interface DocGroup {
  key: string;
  all: LawDocument[];
}

export function DocumentsScreen() {
  const { documents, matters, uploadDocument, deleteDocument, setDocumentClientVisible, signatureRequests, sendForSignature, refreshSignatureStatus, firm, invoices, timeEntries, parties } = useStore();
  const locale = firm?.locale || 'en-US';
  const { isDevMode } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [matterFilter, setMatterFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'documents' | 'invoices'>('documents');
  const [uploadTarget, setUploadTarget] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<{ file: File; matterId: string | null; existing: LawDocument } | null>(null);
  const [previewDoc, setPreviewDoc] = useState<LawDocument | null>(null);

  const [signTarget, setSignTarget] = useState<LawDocument | null>(null);
  const [signEmail, setSignEmail] = useState('');
  const [signName, setSignName] = useState('');
  const [signSending, setSignSending] = useState(false);
  const [refreshingSig, setRefreshingSig] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DocumentSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) { setSearchResults(null); setSearching(false); return; }
    setSearching(true);
    const timer = setTimeout(() => {
      supabase.rpc('search_documents', { p_query: q }).then(({ data, error }) => {
        setSearching(false);
        if (error) { console.error('[documents] search failed:', error); setSearchResults([]); return; }
        setSearchResults((data ?? []) as DocumentSearchResult[]);
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const filtered = useMemo(
    () => matterFilter === 'all' ? documents : documents.filter(d => d.matter_id === matterFilter),
    [documents, matterFilter]
  );

  const filteredInvoices = useMemo(
    () => matterFilter === 'all' ? invoices : invoices.filter(i => i.matter_id === matterFilter),
    [invoices, matterFilter]
  );

  const matterTitle = (id: string | null) => matters.find(m => m.id === id)?.title ?? 'Unfiled';
  const documentGaps = useMemo(() => findDocumentGaps(matters, documents), [matters, documents]);
  const gapHintFor = (matterId: string | null) => matterId ? documentGaps.find(g => g.matter.id === matterId)?.detail : undefined;

  const groups = useMemo<DocGroup[]>(() => {
    const byKey = new Map<string, LawDocument[]>();
    for (const d of filtered) {
      const k = rootKey(d);
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k)!.push(d);
    }
    const list: DocGroup[] = Array.from(byKey.entries()).map(([key, docs]) => ({
      key,
      all: [...docs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    }));
    list.sort((a, b) => new Date(b.all[0].created_at).getTime() - new Date(a.all[0].created_at).getTime());
    return list;
  }, [filtered]);

  const doUpload = async (file: File, matterId: string | null, parentDocumentId: string | null) => {
    setUploading(true);
    await uploadDocument(file, matterId, parentDocumentId);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const targetId = uploadTarget || null;
    const sameName = documents.find(d => (d.matter_id === targetId || (!d.matter_id && !targetId)) && d.file_name.toLowerCase() === file.name.toLowerCase());
    if (sameName) {
      setPendingUpload({ file, matterId: targetId, existing: sameName });
      return;
    }
    await doUpload(file, targetId, null);
  };

  const resolvePendingChoice = async (asNewVersion: boolean) => {
    if (!pendingUpload) return;
    const { file, matterId, existing } = pendingUpload;
    setPendingUpload(null);
    await doUpload(file, matterId, asNewVersion ? rootKey(existing) : null);
  };

  const handleDownload = async (storagePath: string, fileName: string) => {
    if (!isDevMode) {
      const { data, error } = await supabase.storage.from('matter-documents').createSignedUrl(storagePath, 60);
      if (error || !data) return;
      window.open(data.signedUrl, '_blank');
    }
  };

  const handleOpenInvoice = async (inv: Invoice) => {
    if (isSupabaseConfigured && !inv.storage_path.startsWith('local/')) {
      const { data } = await supabase.storage.from('matter-documents').createSignedUrl(inv.storage_path, 60);
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
        return;
      }
    }

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

    window.open(URL.createObjectURL(blob), '_blank');
  };

  const latestSignature = (documentId: string): SignatureRequest | undefined => {
    return signatureRequests
      .filter(s => s.document_id === documentId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  };

  const handleSendForSignature = async () => {
    if (!signTarget || !signEmail.trim()) return;
    setSignSending(true);
    await sendForSignature(signTarget.id, signEmail.trim(), signName.trim() || undefined);
    setSignSending(false);
    setSignTarget(null);
  };

  const handleRefreshSignature = async (requestId: string) => {
    setRefreshingSig(requestId);
    await refreshSignatureStatus(requestId);
    setRefreshingSig(null);
  };

  const SIGNATURE_LABEL: Record<SignatureRequest['status'], { text: string; color: string }> = {
    pending: { text: 'Preparing signature request…', color: 'var(--text-tertiary)' },
    sent: { text: 'Out for signature', color: 'var(--signal-warning)' },
    signed: { text: 'Signed', color: 'var(--signal-positive)' },
    declined: { text: 'Declined by recipient', color: 'var(--signal-negative)' },
    canceled: { text: 'Signature request canceled', color: 'var(--text-tertiary)' },
  };

  const renderRow = (d: LawDocument, isSubVersion = false) => (
    <div
      key={d.id}
      onClick={() => setPreviewDoc(d)}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter') setPreviewDoc(d); }}
      className={`flex items-center gap-3 p-3 transition-colors cursor-pointer hover:bg-[var(--bg-tertiary)] ${
        isSubVersion ? 'pl-8 bg-[var(--bg-secondary)]/50 text-xs' : ''
      }`}
    >
      <div className={`rounded-lg flex items-center justify-center shrink-0 ${isSubVersion ? 'w-7 h-7 bg-[var(--bg-tertiary)]' : 'w-9 h-9 bg-[var(--bg-tertiary)]'}`}>
        <FileText className={isSubVersion ? 'w-3.5 h-3.5 text-[var(--text-tertiary)]' : 'w-4 h-4 text-[var(--text-primary)]'} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`font-medium truncate ${isSubVersion ? 'text-xs' : 'text-sm'}`}>{d.file_name}</span>
          {d.version > 1 && (
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] rounded shrink-0">
              v{d.version}
            </span>
          )}
        </div>
        <div className="text-xs text-[var(--text-tertiary)] truncate">
          {matterTitle(d.matter_id)} · {formatBytes(d.file_size)}
          {(() => {
            const sig = latestSignature(d.id);
            if (!sig) return null;
            const l = SIGNATURE_LABEL[sig.status];
            return <> · <span style={{ color: l.color }}>{l.text}</span></>;
          })()}
        </div>
      </div>
      {d.matter_id && (
        <button
          onClick={e => { e.stopPropagation(); setDocumentClientVisible(d.id, !d.client_visible); }}
          className={`w-8 h-8 flex items-center justify-center transition-colors ${d.client_visible ? 'text-[var(--signal-positive)] hover:text-[var(--signal-negative)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
        >
          {d.client_visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>
      )}
      {d.matter_id && (() => {
        const sig = latestSignature(d.id);
        if (sig && sig.status === 'sent') {
          return (
            <button
              onClick={e => { e.stopPropagation(); handleRefreshSignature(sig.id); }}
              disabled={refreshingSig === sig.id}
              className="w-8 h-8 flex items-center justify-center text-[var(--signal-warning)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`w-4 h-4 ${refreshingSig === sig.id ? 'animate-spin' : ''}`} />
            </button>
          );
        }
        return (
          <button
            onClick={e => { e.stopPropagation(); setSignTarget(d); setSignEmail(''); setSignName(''); }}
            className="w-8 h-8 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <PenLine className="w-4 h-4" />
          </button>
        );
      })()}
      <button onClick={e => { e.stopPropagation(); handleDownload(d.storage_path, d.file_name); }} className="w-8 h-8 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
        <Download className="w-4 h-4" />
      </button>
      <button onClick={e => { e.stopPropagation(); deleteDocument(d.id, d.storage_path); }} className="w-8 h-8 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--signal-negative)] transition-colors">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );

  return (
    <div>
      <h2 className="text-xl font-medium mb-1">Documents &amp; Files</h2>
      <p className="text-sm text-[var(--text-secondary)] mb-6">Manage matter files, client uploads, and generated billing invoices.</p>

      {(() => {
        const gaps = documentGaps.slice(0, 3);
        if (gaps.length === 0) return null;
        return (
          <div className="mb-6 space-y-2">
            {gaps.map(g => (
              <button
                key={g.matter.id}
                onClick={() => { setSearchQuery(''); setMatterFilter(g.matter.id); }}
                className="w-full text-left bg-[var(--bg-secondary)] border border-[var(--signal-warning)]/30 rounded-lg px-4 py-3 hover:border-[var(--signal-warning)]/60 transition-colors"
              >
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <AlertTriangle className="w-3.5 h-3.5 text-[var(--signal-warning)] shrink-0" /> {g.matter.title}
                </div>
                <div className="text-xs text-[var(--text-tertiary)] mt-0.5">{g.detail}</div>
              </button>
            ))}
          </div>
        );
      })()}

      <div className="flex flex-wrap items-center gap-2 mb-6 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-4">
        <select
          value={uploadTarget}
          onChange={e => setUploadTarget(e.target.value)}
          className="h-9 px-2 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none w-full sm:w-64"
        >
          <option value="">No matter (unfiled)</option>
          {matters.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
        </select>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="h-9 px-4 flex items-center gap-1.5 text-sm font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          <Upload className="w-4 h-4" /> {uploading ? 'Uploading…' : 'Upload document'}
        </button>
        <input ref={fileInputRef} type="file" onChange={handleFileSelected} className="hidden" />
      </div>

      {signTarget && (
        <div className="flex items-start gap-3 bg-[var(--bg-secondary)] border border-[var(--accent-secondary)]/40 rounded-lg p-4 mb-6">
          <PenLine className="w-4 h-4 text-[var(--accent-secondary)] shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium mb-1">Send "{signTarget.file_name}" for signature</div>
            <div className="flex flex-col sm:flex-row gap-2 mb-3">
              <input
                type="email"
                value={signEmail}
                onChange={e => setSignEmail(e.target.value)}
                placeholder="Recipient email"
                className="h-9 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none flex-1 min-w-0"
              />
              <input
                type="text"
                value={signName}
                onChange={e => setSignName(e.target.value)}
                placeholder="Recipient name (optional)"
                className="h-9 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none flex-1 min-w-0"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSendForSignature}
                disabled={signSending || !signEmail.trim()}
                className="h-8 px-3 text-xs font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {signSending ? 'Sending…' : 'Send for signature'}
              </button>
              <button
                onClick={() => setSignTarget(null)}
                className="h-8 px-3 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingUpload && (
        <div className="flex items-start gap-3 bg-[var(--bg-secondary)] border border-[var(--accent-secondary)]/40 rounded-lg p-4 mb-6">
          <History className="w-4 h-4 text-[var(--accent-secondary)] shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium mb-1">"{pendingUpload.file.name}" already exists</div>
            <p className="text-xs text-[var(--text-secondary)] mb-3">Link this upload as a new version, or keep as a separate file?</p>
            <div className="flex gap-2">
              <button
                onClick={() => resolvePendingChoice(true)}
                className="h-8 px-3 text-xs font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded hover:opacity-90 transition-opacity"
              >
                Link as new version
              </button>
              <button
                onClick={() => resolvePendingChoice(false)}
                className="h-8 px-3 text-xs font-medium bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded hover:bg-[var(--bg-elevated)] transition-colors"
              >
                Keep separate
              </button>
              <button
                onClick={() => { setPendingUpload(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                className="h-8 px-3 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="relative mb-4">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search filenames and document content…"
          className="h-9 w-full pl-9 pr-9 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {searchQuery.trim() ? (
        searching ? (
          <div className="text-sm text-[var(--text-tertiary)] py-8 text-center">Searching…</div>
        ) : !searchResults || searchResults.length === 0 ? (
          <div className="text-sm text-[var(--text-tertiary)] py-8 text-center">No documents match "{searchQuery.trim()}".</div>
        ) : (
          <div className="space-y-2">
            {searchResults.map(r => (
              <div
                key={r.id}
                onClick={() => { const full = documents.find(d => d.id === r.id); if (full) setPreviewDoc(full); }}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter') { const full = documents.find(d => d.id === r.id); if (full) setPreviewDoc(full); } }}
                className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] cursor-pointer hover:border-[var(--border-strong)] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{r.file_name}</div>
                    <div className="text-xs text-[var(--text-tertiary)]">{matterTitle(r.matter_id)}</div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); handleDownload(r.storage_path, r.file_name); }} className="w-8 h-8 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors shrink-0">
                    <Download className="w-4 h-4" />
                  </button>
                </div>
                {r.snippet && (
                  <p className="text-xs text-[var(--text-secondary)] mt-2 pl-12 [&_strong]:text-[var(--text-primary)] [&_strong]:bg-[var(--accent-secondary)]/20 [&_strong]:font-medium">
                    {renderSnippet(r.snippet)}
                  </p>
                )}
              </div>
            ))}
          </div>
        )
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
            <div>
              <label className="text-[10px] uppercase font-mono tracking-wider text-[var(--text-tertiary)] block mb-1">Matter</label>
              <select
                value={matterFilter}
                onChange={e => setMatterFilter(e.target.value)}
                className="h-9 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none w-full sm:w-72"
              >
                <option value="all">All matters</option>
                {matters.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
              </select>
            </div>

            <div className="flex items-center bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] p-0.5 rounded-lg">
              <button
                onClick={() => setActiveTab('documents')}
                className={`h-8 px-3 text-xs font-medium rounded flex items-center gap-1.5 transition-colors ${
                  activeTab === 'documents'
                    ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <FileText className="w-3.5 h-3.5" /> Matter Documents ({filtered.length})
              </button>
              <button
                onClick={() => setActiveTab('invoices')}
                className={`h-8 px-3 text-xs font-medium rounded flex items-center gap-1.5 transition-colors ${
                  activeTab === 'invoices'
                    ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Receipt className="w-3.5 h-3.5 text-[var(--accent-primary)]" /> Generated Invoices ({filteredInvoices.length})
              </button>
            </div>
          </div>

          {activeTab === 'invoices' ? (
            filteredInvoices.length === 0 ? (
              <div className="text-sm text-[var(--text-tertiary)] py-12 text-center border border-dashed border-[var(--border-subtle)] rounded-lg bg-[var(--bg-secondary)]">
                No generated invoices match this filter.
              </div>
            ) : (
              <div className="space-y-2">
                {filteredInvoices.map(inv => (
                  <div key={inv.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] shadow-sm hover:border-[var(--border-strong)] transition-all">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="p-2 bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] rounded-md shrink-0 mt-0.5">
                        <Receipt className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-[var(--text-primary)]">{inv.invoice_number}</span>
                          <span className="text-xs text-[var(--text-tertiary)]">·</span>
                          <span className="text-xs text-[var(--text-secondary)] font-medium truncate">{matterTitle(inv.matter_id)}</span>
                          {inv.status === 'paid' ? (
                            <span className="text-[10px] uppercase font-medium px-2 py-0.5 bg-[var(--signal-positive)]/15 text-[var(--signal-positive)] border border-[var(--signal-positive)]/30 rounded-full shrink-0 flex items-center gap-1">
                              <CheckCircle2 className="w-2.5 h-2.5" /> Paid
                            </span>
                          ) : (
                            <span className="text-[10px] uppercase font-medium px-2 py-0.5 bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] border border-[var(--accent-primary)]/20 rounded-full shrink-0">
                              Unpaid
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[var(--text-tertiary)]">
                          Issued {formatDateOnly(inv.issued_date, locale, { day: 'numeric', month: 'short', year: 'numeric' })}
                          {inv.total_amount !== null && <> · <span className="font-mono font-medium text-[var(--text-primary)]">{formatAmount(inv.total_amount, inv.currency, locale)}</span></>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-end shrink-0">
                      <button
                        onClick={() => handleOpenInvoice(inv)}
                        className="h-8 px-3 flex items-center gap-1.5 text-xs font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded hover:opacity-90 transition-opacity"
                        title="Open or download invoice PDF"
                      >
                        <Download className="w-3.5 h-3.5" /> View PDF
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            groups.length === 0 ? (
              <div className="text-sm text-[var(--text-tertiary)] py-8 text-center">No documents yet.</div>
            ) : (
              <div className="space-y-2">
                {(() => {
                  const flaggedMatters = new Set<string>();
                  return groups.map(g => {
                    const matterId = g.all[0].matter_id;
                    const gap = matterId && !flaggedMatters.has(matterId) ? documentGaps.find(dg => dg.matter.id === matterId) : undefined;
                    if (gap) flaggedMatters.add(matterId!);
                    return (
                      <div key={g.key} className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg divide-y divide-[var(--border-subtle)]/60">
                        {gap && (
                          <div className="flex items-center gap-1.5 px-3 py-2 text-[11px] text-[var(--signal-warning)] bg-[var(--signal-warning)]/5">
                            <AlertTriangle className="w-3 h-3 shrink-0" /> {gap.detail}
                          </div>
                        )}
                        {renderRow(g.all[0], false)}
                        {g.all.length > 1 && (
                          <div className="flex items-center gap-1.5 px-3 pt-2 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
                            <History className="w-3 h-3" /> {g.all.length - 1} earlier version{g.all.length - 1 === 1 ? '' : 's'}
                          </div>
                        )}
                        {g.all.slice(1).map(d => renderRow(d, true))}
                      </div>
                    );
                  });
                })()}
              </div>
            )
          )}
        </>
      )}

      {previewDoc && (
        <DocumentPreviewPanel
          doc={previewDoc}
          matterTitle={matterTitle(previewDoc.matter_id)}
          onClose={() => setPreviewDoc(null)}
          onToggleClientVisible={() => setDocumentClientVisible(previewDoc.id, !previewDoc.client_visible)}
          onDownload={() => handleDownload(previewDoc.storage_path, previewDoc.file_name)}
          gapHint={gapHintFor(previewDoc.matter_id)}
        />
      )}
    </div>
  );
}
