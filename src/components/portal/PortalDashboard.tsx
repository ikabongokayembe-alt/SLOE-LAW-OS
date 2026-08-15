import { useEffect, useState } from 'react';
import { LogOut, FileText, Download } from 'lucide-react';
import { useClientAuth } from '../../lib/clientAuth';
import { supabase } from '../../lib/supabase';

// Plain-language status per matter_stages.stage_key — never shown the
// internal stage_key or the firm's own stage label verbatim (a client
// shouldn't see "Conflict Check" and wonder if they're under suspicion
// of something). Keyed by stage_key rather than stage_id so this works
// across every firm's stage rows without per-firm configuration; a
// custom stage_key a firm added themselves falls through to a generic
// but still plain phrase rather than leaking the raw key.
const STAGE_LABELS: Record<string, string> = {
  intake: "We're getting started on your matter.",
  conflict_check: "We're completing an internal review before beginning work.",
  engaged: 'Your matter is underway.',
  active: 'We are actively working on your matter.',
  resolution: 'Your matter is being finalized.',
  closed: 'Your matter is complete.',
};
function plainStageLabel(stageKey: string | undefined): string {
  return (stageKey && STAGE_LABELS[stageKey]) || 'In progress.';
}

interface PortalMatter { id: string; title: string; stage_id: string; opened_date: string }
interface PortalDocument { id: string; matter_id: string; file_name: string; storage_path: string; created_at: string }

export function PortalDashboard() {
  const { clientProfile, signOut } = useClientAuth();
  const [matters, setMatters] = useState<PortalMatter[]>([]);
  const [stageLabels, setStageLabels] = useState<Record<string, string>>({}); // stage_id -> stage_key
  const [documents, setDocuments] = useState<PortalDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // No explicit party/matter filter on any of these — RLS (migration
      // 0018's "select client" policies) already scopes every one of
      // these queries to exactly this client's own party. A stray bug
      // here that forgot a filter still can't leak another client's
      // data — the database enforces it, not this component.
      const [mattersRes, docsRes] = await Promise.all([
        supabase.from('matters').select('id, title, stage_id, opened_date').order('opened_date', { ascending: false }),
        supabase.from('documents').select('id, matter_id, file_name, storage_path, created_at').order('created_at', { ascending: false }),
      ]);
      if (cancelled) return;
      const mattersList = (mattersRes.data ?? []) as PortalMatter[];
      setMatters(mattersList);
      setDocuments((docsRes.data ?? []) as PortalDocument[]);

      const stageIds = [...new Set(mattersList.map(m => m.stage_id))];
      if (stageIds.length > 0) {
        const { data: stages } = await supabase.from('matter_stages').select('id, stage_key').in('id', stageIds);
        if (!cancelled && stages) {
          setStageLabels(Object.fromEntries(stages.map((s: any) => [s.id, s.stage_key])));
        }
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleDownload = async (storagePath: string) => {
    const { data, error } = await supabase.storage.from('matter-documents').createSignedUrl(storagePath, 60);
    if (error || !data) return;
    window.open(data.signedUrl, '_blank');
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <div className="border-b border-[var(--border-subtle)] px-6 h-16 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">{clientProfile?.firm_name}</div>
          <div className="text-xs text-[var(--text-tertiary)]">Client Portal · {clientProfile?.party_name}</div>
        </div>
        <button onClick={() => signOut()} className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
          <LogOut className="w-3.5 h-3.5" /> Sign out
        </button>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {loading ? (
          <div className="text-sm text-[var(--text-tertiary)] text-center py-12">Loading…</div>
        ) : matters.length === 0 ? (
          <div className="text-sm text-[var(--text-tertiary)] text-center py-12">No matters are linked to your account yet.</div>
        ) : (
          <div className="space-y-6">
            {matters.map(m => {
              const matterDocs = documents.filter(d => d.matter_id === m.id);
              return (
                <div key={m.id} className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-5">
                  <h2 className="text-base font-medium mb-1">{m.title}</h2>
                  <p className="text-sm text-[var(--text-secondary)] mb-4">{plainStageLabel(stageLabels[m.stage_id])}</p>

                  <div className="text-[10px] uppercase font-mono tracking-wider text-[var(--text-tertiary)] mb-2">Shared documents</div>
                  {matterDocs.length === 0 ? (
                    <div className="text-xs text-[var(--text-tertiary)] italic">Nothing has been shared with you on this matter yet.</div>
                  ) : (
                    <div className="space-y-1.5">
                      {matterDocs.map(d => (
                        <div key={d.id} className="flex items-center gap-2 text-sm bg-[var(--bg-tertiary)] rounded px-3 py-2">
                          <FileText className="w-3.5 h-3.5 text-[var(--text-tertiary)] shrink-0" />
                          <span className="flex-1 min-w-0 truncate">{d.file_name}</span>
                          <button onClick={() => handleDownload(d.storage_path)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors shrink-0">
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
