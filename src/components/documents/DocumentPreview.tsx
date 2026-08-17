import { useEffect, useState } from 'react';
import { FileText, Download, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { LawDocument } from '../../types';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { DetailPanel, DetailSection } from '../shared/DetailPanel';

function formatBytes(bytes?: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isPreviewableInline(fileType?: string): 'image' | 'pdf' | null {
  if (!fileType) return null;
  if (fileType.startsWith('image/')) return 'image';
  if (fileType === 'application/pdf') return 'pdf';
  return null;
}

// Real content preview, not just the existing icon row -- a signed URL for
// anything the browser can render inline (image/pdf), and the actual
// extracted text (see migration 0017's extract-document-text pipeline) for
// everything else once indexing has finished. Never a re-run of extraction
// here -- this only reads what is already stored, same "no fabrication"
// posture as the rest of the app. `gapHint`, when passed, surfaces the
// matter-level document-gap finding (findDocumentGaps in riskSignals.ts)
// inline with the specific document it's about, when this document's
// matter has one.
export function DocumentPreviewContent({
  doc, matterTitle, onToggleClientVisible, onDownload, gapHint,
}: {
  doc: LawDocument;
  matterTitle: string;
  onToggleClientVisible?: () => void;
  onDownload: () => void;
  gapHint?: string;
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const inlineKind = isPreviewableInline(doc.file_type);

  useEffect(() => {
    let cancelled = false;
    setSignedUrl(null);
    setExtractedText(null);
    if (!isSupabaseConfigured) { setLoading(false); return; }
    setLoading(true);
    (async () => {
      if (inlineKind) {
        const { data } = await supabase.storage.from('matter-documents').createSignedUrl(doc.storage_path, 300);
        if (!cancelled) setSignedUrl(data?.signedUrl ?? null);
      } else if (doc.extraction_status === 'done') {
        const { data } = await supabase.from('documents').select('extracted_text').eq('id', doc.id).single();
        if (!cancelled) setExtractedText((data?.extracted_text as string | null) ?? null);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [doc.id, doc.storage_path, doc.extraction_status, inlineKind]);

  return (
    <>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-center shrink-0">
          <FileText className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{doc.file_name}</div>
          <div className="text-xs text-[var(--text-tertiary)]">{matterTitle} · {formatBytes(doc.file_size)} · {new Date(doc.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</div>
        </div>
      </div>

      {gapHint && (
        <div className="text-xs text-[var(--signal-warning)] bg-[var(--signal-warning)]/10 border border-[var(--signal-warning)]/30 rounded-lg px-3 py-2">
          {gapHint}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button onClick={onDownload} className="h-8 px-3 flex items-center gap-1.5 text-xs font-medium bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded hover:bg-[var(--bg-elevated)] transition-colors">
          <Download className="w-3.5 h-3.5" /> Download
        </button>
        {onToggleClientVisible && doc.matter_id && (
          <button onClick={onToggleClientVisible} className="h-8 px-3 flex items-center gap-1.5 text-xs font-medium bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded hover:bg-[var(--bg-elevated)] transition-colors">
            {doc.client_visible ? <><Eye className="w-3.5 h-3.5 text-[var(--signal-positive)]" /> Shared with client</> : <><EyeOff className="w-3.5 h-3.5" /> Not shared</>}
          </button>
        )}
      </div>

      <DetailSection title="Preview">
        {!isSupabaseConfigured ? (
          <div className="text-xs text-[var(--text-tertiary)] italic">No file content in preview mode -- nothing is actually uploaded here.</div>
        ) : loading ? (
          <div className="text-xs text-[var(--text-tertiary)]">Loading preview…</div>
        ) : inlineKind === 'image' && signedUrl ? (
          <img src={signedUrl} alt={doc.file_name} className="max-w-full rounded-lg border border-[var(--border-subtle)]" />
        ) : inlineKind === 'pdf' && signedUrl ? (
          <div className="space-y-2">
            <iframe src={signedUrl} title={doc.file_name} className="w-full h-[480px] rounded-lg border border-[var(--border-subtle)] bg-white" />
            <a href={signedUrl} target="_blank" rel="noreferrer" className="text-xs text-[var(--accent-secondary)] hover:underline inline-flex items-center gap-1">
              <ExternalLink className="w-3 h-3" /> Open in new tab
            </a>
          </div>
        ) : doc.extraction_status === 'pending' ? (
          <div className="text-xs text-[var(--text-tertiary)] italic">Still indexing -- text preview isn't available yet.</div>
        ) : doc.extraction_status === 'failed' ? (
          <div className="text-xs text-[var(--signal-warning)] italic">Text extraction failed for this file -- download it to view the content directly.</div>
        ) : doc.extraction_status === 'skipped' ? (
          <div className="text-xs text-[var(--text-tertiary)] italic">This file type isn't indexed -- download it to view the content directly.</div>
        ) : extractedText ? (
          <div className="text-xs text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap bg-[var(--bg-tertiary)] rounded-lg p-3 max-h-[420px] overflow-y-auto">{extractedText}</div>
        ) : (
          <div className="text-xs text-[var(--text-tertiary)] italic">No extracted content on file for this document.</div>
        )}
      </DetailSection>
    </>
  );
}

export function DocumentPreviewPanel({
  doc, matterTitle, onClose, onToggleClientVisible, onDownload, gapHint,
}: {
  doc: LawDocument;
  matterTitle: string;
  onClose: () => void;
  onToggleClientVisible?: () => void;
  onDownload: () => void;
  gapHint?: string;
}) {
  return (
    <DetailPanel title={doc.file_name} subtitle="Document" onClose={onClose}>
      <DocumentPreviewContent doc={doc} matterTitle={matterTitle} onToggleClientVisible={onToggleClientVisible} onDownload={onDownload} gapHint={gapHint} />
    </DetailPanel>
  );
}
