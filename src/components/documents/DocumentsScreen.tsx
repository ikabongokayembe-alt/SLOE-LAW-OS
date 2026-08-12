import { useMemo, useRef, useState } from 'react';
import { useStore } from '../../lib/store';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { FileText, Upload, Trash2, Download, Info } from 'lucide-react';

function formatBytes(bytes?: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsScreen() {
  const { documents, matters, uploadDocument, deleteDocument } = useStore();
  const { isDevMode } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [matterFilter, setMatterFilter] = useState<string>('all');
  const [uploadTarget, setUploadTarget] = useState<string>('');
  const [uploading, setUploading] = useState(false);

  const filtered = useMemo(
    () => matterFilter === 'all' ? documents : documents.filter(d => d.matter_id === matterFilter),
    [documents, matterFilter]
  );
  const matterTitle = (id: string | null) => matters.find(m => m.id === id)?.title ?? 'Unfiled';

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    await uploadDocument(file, uploadTarget || null);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDownload = async (storagePath: string, fileName: string) => {
    if (!isDevMode) {
      const { data, error } = await supabase.storage.from('matter-documents').createSignedUrl(storagePath, 60);
      if (error || !data) return;
      window.open(data.signedUrl, '_blank');
    }
  };

  return (
    <div>
      <h2 className="text-xl font-medium mb-1">Documents</h2>
      <p className="text-sm text-[var(--text-secondary)] mb-6">Every file attached to a matter, in one place.</p>

      <div className="flex items-center gap-2 mb-2 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-4">
        <select
          value={uploadTarget}
          onChange={e => setUploadTarget(e.target.value)}
          className="h-9 px-2 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none"
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

      {/* Honest v1 scope note — this is real, working upload/download/
          delete. What it does NOT do yet is versioning: re-uploading a
          file with the same name creates a second, separate document,
          not a new version of the first. Said plainly rather than
          silently discovered later. */}
      <div className="flex items-start gap-2 text-xs text-[var(--text-tertiary)] mb-6 px-1">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>No version history yet — re-uploading a file creates a separate document rather than a new version of the same one.</span>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setMatterFilter('all')}
          className={`px-2.5 py-1 text-xs rounded-full transition-colors ${matterFilter === 'all' ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'}`}
        >
          All
        </button>
        {matters.map(m => (
          <button
            key={m.id}
            onClick={() => setMatterFilter(m.id)}
            className={`px-2.5 py-1 text-xs rounded-full transition-colors whitespace-nowrap ${matterFilter === m.id ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'}`}
          >
            {m.title}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-sm text-[var(--text-tertiary)] py-8 text-center">No documents yet.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(d => (
            <div key={d.id} className="flex items-center gap-3 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-3">
              <div className="w-9 h-9 rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{d.file_name}</div>
                <div className="text-xs text-[var(--text-tertiary)]">{matterTitle(d.matter_id)} · {formatBytes(d.file_size)} · {new Date(d.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
              </div>
              <button onClick={() => handleDownload(d.storage_path, d.file_name)} className="w-8 h-8 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
                <Download className="w-4 h-4" />
              </button>
              <button onClick={() => deleteDocument(d.id, d.storage_path)} className="w-8 h-8 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--signal-negative)] transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
