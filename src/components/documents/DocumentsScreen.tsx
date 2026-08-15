import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../lib/store';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { FileText, Upload, Trash2, Download, History, Search, X, Eye, EyeOff } from 'lucide-react';
import { LawDocument, DocumentSearchResult } from '../../types';

// search_documents' snippet uses plain-text §§B§§/§§E§§ markers, not
// HTML tags (see migration 0017's comment on why: extracted_text is
// arbitrary uploaded-file content, never safe to render as raw HTML).
// Splits on those markers and renders each piece as plain React text —
// the matched terms end up in <strong>, everything else stays inert
// text, so nothing in the source document can ever be interpreted as
// markup.
function renderSnippet(snippet: string) {
  const parts = snippet.split(/§§B§§|§§E§§/);
  // Odd indices are always the highlighted (matched) segments, since the
  // string alternates plain/highlighted/plain/... after splitting on
  // paired start/stop markers.
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>));
}

function formatBytes(bytes?: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// A version chain's root id is either the document's own parent_document_id
// (if it's a version of something) or its own id (if it's the root/only
// copy) — see migration 0008. Grouping by this key never requires walking
// a chain: every version already points straight at the root.
function rootKey(d: LawDocument): string {
  return d.parent_document_id ?? d.id;
}

interface DocGroup {
  key: string;
  all: LawDocument[]; // sorted most-recent-first
}

export function DocumentsScreen() {
  const { documents, matters, uploadDocument, deleteDocument, setDocumentClientVisible, firm } = useStore();
  const locale = firm?.locale || 'en-US';
  const { isDevMode } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [matterFilter, setMatterFilter] = useState<string>('all');
  const [uploadTarget, setUploadTarget] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<{ file: File; matterId: string | null; existing: LawDocument } | null>(null);

  // Content search — filenames AND extracted text, via the
  // search_documents Postgres function (migration 0017), not client-side
  // filtering: extracted_text can be long and isn't otherwise loaded
  // per-row in the list view. Debounced so every keystroke doesn't fire
  // a query. A non-empty query switches the whole screen into "search
  // results" mode instead of the normal matter-filtered/grouped view —
  // the two don't compose (searching already spans all matters).
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
  const matterTitle = (id: string | null) => matters.find(m => m.id === id)?.title ?? 'Unfiled';

  // Group by version chain, most-recent-first within a group, groups
  // themselves ordered by their most recent member's upload time.
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
    const matterId = uploadTarget || null;

    // Same file name already on file for this matter? Offer to link as a
    // new version instead of silently creating a second, unrelated
    // document — never forced, always a clear choice.
    const existing = documents.find(d => d.matter_id === matterId && d.file_name === file.name);
    if (existing) {
      setPendingUpload({ file, matterId, existing });
      return;
    }
    await doUpload(file, matterId, null);
  };

  const resolvePendingChoice = async (linkAsVersion: boolean) => {
    if (!pendingUpload) return;
    const { file, matterId, existing } = pendingUpload;
    setPendingUpload(null);
    await doUpload(file, matterId, linkAsVersion ? rootKey(existing) : null);
  };

  const handleDownload = async (storagePath: string, fileName: string) => {
    if (!isDevMode) {
      const { data, error } = await supabase.storage.from('matter-documents').createSignedUrl(storagePath, 60);
      if (error || !data) return;
      window.open(data.signedUrl, '_blank');
    }
  };

  const renderRow = (d: LawDocument, isSecondary: boolean) => (
    <div key={d.id} className={`flex items-center gap-3 ${isSecondary ? 'py-2 pl-8 pr-3 opacity-60' : 'p-3'}`}>
      <div className={`rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-center shrink-0 ${isSecondary ? 'w-7 h-7' : 'w-9 h-9'}`}>
        <FileText className={isSecondary ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
      </div>
      <div className="flex-1 min-w-0">
        <div className={`font-medium truncate ${isSecondary ? 'text-xs' : 'text-sm'}`}>{d.file_name}</div>
        <div className="text-xs text-[var(--text-tertiary)]">
          {!isSecondary && `${matterTitle(d.matter_id)} · `}{formatBytes(d.file_size)} · {new Date(d.created_at).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}
          {d.extraction_status === 'pending' && <> · Indexing…</>}
          {d.extraction_status === 'failed' && <> · <span className="text-[var(--signal-warning)]">Not indexed</span></>}
          {d.client_visible && <> · <span className="text-[var(--signal-positive)]">Shared with client</span></>}
        </div>
      </div>
      {d.matter_id && (
        <button
          onClick={() => setDocumentClientVisible(d.id, !d.client_visible)}
          title={d.client_visible ? 'Shared with the client — click to stop sharing' : 'Not shared with the client — click to share on their portal'}
          className={`w-8 h-8 flex items-center justify-center transition-colors ${d.client_visible ? 'text-[var(--signal-positive)] hover:text-[var(--signal-negative)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
        >
          {d.client_visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>
      )}
      <button onClick={() => handleDownload(d.storage_path, d.file_name)} className="w-8 h-8 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
        <Download className="w-4 h-4" />
      </button>
      <button onClick={() => deleteDocument(d.id, d.storage_path)} className="w-8 h-8 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--signal-negative)] transition-colors">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );

  return (
    <div>
      <h2 className="text-xl font-medium mb-1">Documents</h2>
      <p className="text-sm text-[var(--text-secondary)] mb-6">Every file attached to a matter, in one place.</p>

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

      {pendingUpload && (
        <div className="flex items-start gap-3 bg-[var(--bg-secondary)] border border-[var(--accent-secondary)]/40 rounded-lg p-4 mb-6">
          <History className="w-4 h-4 text-[var(--accent-secondary)] shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium mb-1">"{pendingUpload.file.name}" already exists in {matterTitle(pendingUpload.matterId)}</div>
            <p className="text-xs text-[var(--text-secondary)] mb-3">Link this upload as a new version of that document, or keep them as two separate files?</p>
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

      {/* Content search — filenames + extracted document text (see
          migration 0017). Spans every matter at once, so it's a separate
          mode rather than another filter alongside the matter dropdown. */}
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
              <div key={r.id} className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{r.file_name}</div>
                    <div className="text-xs text-[var(--text-tertiary)]">{matterTitle(r.matter_id)}</div>
                  </div>
                  <button onClick={() => handleDownload(r.storage_path, r.file_name)} className="w-8 h-8 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors shrink-0">
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
          {/* Matter filter — a <select>, same pattern as TimeEntriesScreen's
              matter filter. This used to be one pill button per matter, which
              was fine at a handful of matters but genuinely unusable at real
              volume (62+ individual pills wrapping across many lines). */}
          <div className="mb-4">
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

          {groups.length === 0 ? (
            <div className="text-sm text-[var(--text-tertiary)] py-8 text-center">No documents yet.</div>
          ) : (
            <div className="space-y-2">
              {groups.map(g => (
                <div key={g.key} className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg divide-y divide-[var(--border-subtle)]/60">
                  {renderRow(g.all[0], false)}
                  {g.all.length > 1 && (
                    <div className="flex items-center gap-1.5 px-3 pt-2 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
                      <History className="w-3 h-3" /> {g.all.length - 1} earlier version{g.all.length - 1 === 1 ? '' : 's'}
                    </div>
                  )}
                  {g.all.slice(1).map(d => renderRow(d, true))}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
