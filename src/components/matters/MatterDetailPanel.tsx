import { useMemo, useState } from 'react';
import { Matter, MatterPartyRole } from '../../types';
import { useStore } from '../../lib/store';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { DetailPanel, DetailSection } from '../shared/DetailPanel';
import { ConflictCheckDetailContent } from '../parties/ConflictCheckDetail';
import { DocumentPreviewPanel } from '../documents/DocumentPreview';
import { findBottlenecks, assessDeadlineRisk, findDocumentGaps } from '../../lib/riskSignals';
import { buildUrgentActions } from '../../lib/urgentActions';
import { formatDateOnly } from '../../lib/dates';
import { computeAmount, formatAmount, formatHours } from '../../lib/timeEntries';
import { AlertTriangle, Clock, FileText, ShieldCheck, ShieldAlert, UserPlus, X } from 'lucide-react';

const ROLE_LABEL: Record<MatterPartyRole, string> = {
  client: 'Client', opposing: 'Opposing', witness: 'Witness', co_counsel: 'Co-counsel', other: 'Other',
};

// The Matter detail view -- opens on a kanban card click. Everything here
// is scoped to this one matter. The "AI's own read" section is not a new
// model call -- it is the same deterministic detectors the Command Center
// and Deadlines/Documents screens already use (riskSignals.ts,
// urgentActions.ts), re-run with every input array pre-filtered to this
// matter. Reusing the detectors rather than re-deriving matter-level logic
// means this view can never disagree with what the rest of the app says
// about the same matter.
export function MatterDetailPanel({ matter, onClose }: { matter: Matter; onClose: () => void }) {
  const {
    matterStages, practiceAreas, attorneys, parties, matters, deadlines, conflictChecks, documents, timeEntries,
    communications, auditLog, matterParties, addMatterParty, removeMatterParty, deleteDocument, setDocumentClientVisible, firm,
  } = useStore();
  const { isDevMode } = useAuth();
  const locale = firm?.locale || 'en-US';

  const [addPartyId, setAddPartyId] = useState('');
  const [addPartyRole, setAddPartyRole] = useState<MatterPartyRole>('opposing');
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);

  const stage = matterStages.find(s => s.id === matter.stage_id);
  const practiceArea = practiceAreas.find(p => p.id === matter.practice_area_id);
  const attorney = attorneys.find(a => a.id === matter.assigned_attorney_id);
  const clientParty = parties.find(p => p.id === matter.client_party_id);
  const conflictCheck = conflictChecks.find(c => c.id === matter.conflict_check_id) ?? null;

  const matterDeadlines = useMemo(() => deadlines.filter(d => d.matter_id === matter.id && !d.deleted_at), [deadlines, matter.id]);
  const matterDocuments = useMemo(() => documents.filter(d => d.matter_id === matter.id), [documents, matter.id]);
  const matterTimeEntries = useMemo(() => timeEntries.filter(t => t.matter_id === matter.id), [timeEntries, matter.id]);
  const matterCommunications = useMemo(() => communications.filter(c => c.matter_id === matter.id), [communications, matter.id]);
  const matterConflictChecks = useMemo(() => conflictChecks.filter(c => c.matter_id === matter.id), [conflictChecks, matter.id]);
  const additionalParties = useMemo(() => matterParties.filter(mp => mp.matter_id === matter.id), [matterParties, matter.id]);

  // Same detectors as Command Center / MattersScreen's bottleneck badge /
  // DeadlinesScreen's risk line / DocumentsScreen's gap banner -- scoped
  // by filtering the inputs to this one matter before calling them.
  const bottleneck = useMemo(
    () => findBottlenecks([matter], matterStages, auditLog).find(b => b.matter.id === matter.id) ?? null,
    [matter, matterStages, auditLog]
  );
  const deadlineRisks = useMemo(
    () => matterDeadlines.map(d => ({ deadline: d, risk: assessDeadlineRisk(d, deadlines, timeEntries, documents) })).filter(x => x.risk.level !== 'none'),
    [matterDeadlines, deadlines, timeEntries, documents]
  );
  const urgentActions = useMemo(
    () => buildUrgentActions({
      matters: [matter], deadlines: matterDeadlines, documents: matterDocuments,
      timeEntries: matterTimeEntries, communications: matterCommunications,
      conflictChecks: matterConflictChecks, parties,
    }),
    [matter, matterDeadlines, matterDocuments, matterTimeEntries, matterCommunications, matterConflictChecks, parties]
  );
  const documentGap = useMemo(() => findDocumentGaps(matters, documents).find(g => g.matter.id === matter.id) ?? null, [matters, documents, matter.id]);

  const totalMinutes = matterTimeEntries.reduce((sum, t) => sum + t.duration_minutes, 0);
  // Amounts summed per-currency (see TimeEntriesScreen's same convention).
  const amountsByCurrency = new Map<string, number>();
  for (const t of matterTimeEntries) {
    const amount = computeAmount(t.duration_minutes, t.rate);
    if (amount === null) continue;
    const code = t.currency ?? firm?.currency ?? 'USD';
    amountsByCurrency.set(code, (amountsByCurrency.get(code) ?? 0) + amount);
  }

  const availablePartiesToAdd = parties.filter(p => p.id !== matter.client_party_id);

  const handleAddParty = async () => {
    if (!addPartyId) return;
    await addMatterParty(matter.id, addPartyId, addPartyRole);
    setAddPartyId('');
  };

  const handleDownload = async (storagePath: string, fileName: string) => {
    if (!isDevMode) {
      const { data, error } = await supabase.storage.from('matter-documents').createSignedUrl(storagePath, 60);
      if (error || !data) return;
      window.open(data.signedUrl, '_blank');
    }
  };

  const previewDoc = previewDocId ? matterDocuments.find(d => d.id === previewDocId) ?? null : null;

  return (
    <>
      <DetailPanel
        title={matter.title}
        subtitle={`${stage?.label ?? 'Unknown stage'} · ${matter.status.replace('_', ' ')}`}
        onClose={onClose}
      >
        <DetailSection title="Overview">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">Client</div><div className="truncate">{clientParty?.name ?? '—'}</div></div>
            <div><div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">Attorney</div><div className="truncate">{attorney?.name ?? 'Unassigned'}</div></div>
            <div><div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">Practice area</div><div className="truncate">{practiceArea?.label ?? '—'}</div></div>
            <div><div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">Billing</div><div className="capitalize truncate">{matter.billing_type.replace('_', ' ')}</div></div>
            <div><div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">Opened</div><div>{formatDateOnly(matter.opened_date, locale, { day: 'numeric', month: 'short', year: 'numeric' })}</div></div>
            <div><div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">Closed</div><div>{matter.closed_date ? formatDateOnly(matter.closed_date, locale, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</div></div>
          </div>
          {matter.description && <p className="text-sm text-[var(--text-secondary)] mt-3">{matter.description}</p>}
        </DetailSection>

        <DetailSection title="Intelligence — this matter">
          {urgentActions.length === 0 && !bottleneck && deadlineRisks.length === 0 && !documentGap ? (
            <div className="flex items-center gap-2 text-sm text-[var(--signal-positive)]">
              <ShieldCheck className="w-4 h-4 shrink-0" /> No risk signals on this matter right now.
            </div>
          ) : (
            <div className="space-y-2">
              {urgentActions.map(a => (
                <div key={a.id} className="text-sm bg-[var(--bg-tertiary)] rounded-lg px-3 py-2">
                  <div className="flex items-center gap-1.5 font-medium">
                    <ShieldAlert className="w-3.5 h-3.5 text-[var(--signal-warning)] shrink-0" /> {a.title}
                  </div>
                  <div className="text-xs text-[var(--text-tertiary)] mt-0.5">{a.detail}</div>
                  <div className="text-[11px] text-[var(--text-tertiary)] mt-1 italic">{a.reasoning}</div>
                </div>
              ))}
              {bottleneck && (
                <div className="flex items-start gap-2 text-sm text-[var(--signal-warning)]">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span><span className="uppercase tracking-wider font-mono text-xs mr-1.5">Stalled</span><span className="text-[var(--text-tertiary)]">{bottleneck.detail}</span></span>
                </div>
              )}
              {deadlineRisks.map(({ deadline, risk }) => (
                <div key={deadline.id} className={`flex items-start gap-2 text-sm ${risk.level === 'at_risk' ? 'text-[var(--signal-negative)]' : 'text-[var(--signal-warning)]'}`}>
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    <span className="uppercase tracking-wider font-mono text-xs mr-1.5">{risk.level === 'at_risk' ? 'At risk' : 'Watch'}</span>
                    {deadline.title}: <span className="text-[var(--text-tertiary)]">{risk.reasons.join(' ')}</span>
                  </span>
                </div>
              ))}
              {documentGap && (
                <div className="flex items-start gap-2 text-sm text-[var(--signal-warning)]">
                  <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span className="text-[var(--text-tertiary)]">{documentGap.detail}</span>
                </div>
              )}
            </div>
          )}
        </DetailSection>

        <DetailSection title="Conflict check">
          {conflictCheck ? (
            <div className="bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg p-3 space-y-3">
              <ConflictCheckDetailContent check={conflictCheck} parties={parties} />
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-[var(--signal-warning)]">
              <AlertTriangle className="w-4 h-4 shrink-0" /> No conflict check on file for this matter.
            </div>
          )}
        </DetailSection>

        <DetailSection title={`Parties (${1 + additionalParties.length})`}>
          <div className="space-y-1.5">
            {clientParty && (
              <div className="flex items-center justify-between text-sm bg-[var(--bg-tertiary)] rounded px-2 py-1.5">
                <span className="truncate">{clientParty.name}</span>
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] shrink-0">Client</span>
              </div>
            )}
            {additionalParties.map((mp, i) => {
              const party = parties.find(p => p.id === mp.party_id);
              return (
                <div key={i} className="flex items-center justify-between text-sm bg-[var(--bg-tertiary)] rounded px-2 py-1.5">
                  <span className="truncate">{party?.name ?? 'Unknown party'}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">{ROLE_LABEL[mp.role_in_matter]}</span>
                    <button onClick={() => removeMatterParty(mp.matter_id, mp.party_id, mp.role_in_matter)} className="text-[var(--text-tertiary)] hover:text-[var(--signal-negative)]" aria-label={`Remove ${party?.name}`}>
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {availablePartiesToAdd.length > 0 && (
            <div className="flex items-center gap-1.5 mt-2">
              <select value={addPartyId} onChange={e => setAddPartyId(e.target.value)} className="flex-1 h-8 px-2 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-xs focus:outline-none min-w-0">
                <option value="">Add a party…</option>
                {availablePartiesToAdd.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select value={addPartyRole} onChange={e => setAddPartyRole(e.target.value as MatterPartyRole)} className="h-8 px-2 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-xs focus:outline-none shrink-0">
                {(Object.keys(ROLE_LABEL) as MatterPartyRole[]).filter(r => r !== 'client').map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
              <button onClick={handleAddParty} disabled={!addPartyId} className="h-8 px-2 flex items-center justify-center bg-[var(--text-primary)] text-[var(--bg-primary)] rounded disabled:opacity-40 shrink-0">
                <UserPlus className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </DetailSection>

        <DetailSection title={`Deadlines (${matterDeadlines.length})`}>
          {matterDeadlines.length === 0 ? (
            <div className="text-xs text-[var(--text-tertiary)]">No deadlines on this matter.</div>
          ) : (
            <div className="space-y-1.5">
              {matterDeadlines.map(d => (
                <div key={d.id} className="flex items-center justify-between text-sm bg-[var(--bg-tertiary)] rounded px-2 py-1.5">
                  <span className="truncate flex-1 min-w-0">{d.title}{d.is_critical && <AlertTriangle className="w-3 h-3 inline-block ml-1.5 text-[var(--signal-warning)]" />}</span>
                  <span className="text-xs text-[var(--text-tertiary)] shrink-0 ml-2">{formatDateOnly(d.due_date, locale, { day: 'numeric', month: 'short' })}</span>
                </div>
              ))}
            </div>
          )}
        </DetailSection>

        <DetailSection title={`Documents (${matterDocuments.length})`}>
          {matterDocuments.length === 0 ? (
            <div className="text-xs text-[var(--text-tertiary)]">No documents on this matter.</div>
          ) : (
            <div className="space-y-1.5">
              {matterDocuments.map(d => (
                <button key={d.id} onClick={() => setPreviewDocId(d.id)} className="w-full flex items-center gap-2 text-sm bg-[var(--bg-tertiary)] rounded px-2 py-1.5 text-left hover:bg-[var(--bg-elevated)] transition-colors">
                  <FileText className="w-3.5 h-3.5 text-[var(--text-tertiary)] shrink-0" />
                  <span className="truncate flex-1 min-w-0">{d.file_name}</span>
                </button>
              ))}
            </div>
          )}
        </DetailSection>

        <DetailSection title={`Logged time (${formatHours(totalMinutes)}h)`}>
          {matterTimeEntries.length === 0 ? (
            <div className="text-xs text-[var(--text-tertiary)]">No time logged on this matter.</div>
          ) : (
            <>
              <div className="space-y-1.5">
                {matterTimeEntries.slice(0, 8).map(t => (
                  <div key={t.id} className="flex items-center justify-between text-sm bg-[var(--bg-tertiary)] rounded px-2 py-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Clock className="w-3 h-3 text-[var(--text-tertiary)] shrink-0" />
                      <span className="truncate">{t.description || attorneys.find(a => a.id === t.attorney_id)?.name || 'Time entry'}</span>
                    </div>
                    <span className="text-xs text-[var(--text-tertiary)] shrink-0 ml-2">{formatHours(t.duration_minutes)}h</span>
                  </div>
                ))}
              </div>
              {amountsByCurrency.size > 0 && (
                <div className="text-xs text-[var(--text-secondary)] mt-2">
                  {Array.from(amountsByCurrency.entries()).map(([code, amount]) => formatAmount(amount, code, locale)).join(' + ')}
                </div>
              )}
            </>
          )}
        </DetailSection>
      </DetailPanel>

      {previewDoc && (
        <DocumentPreviewPanel
          doc={previewDoc}
          matterTitle={matter.title}
          onClose={() => setPreviewDocId(null)}
          onToggleClientVisible={() => setDocumentClientVisible(previewDoc.id, !previewDoc.client_visible)}
          onDownload={() => handleDownload(previewDoc.storage_path, previewDoc.file_name)}
          gapHint={documentGap?.detail}
        />
      )}
    </>
  );
}
