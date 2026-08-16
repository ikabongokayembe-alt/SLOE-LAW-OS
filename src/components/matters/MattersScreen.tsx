import { useMemo, useState } from 'react';
import { useStore } from '../../lib/store';
import { findBottlenecks } from '../../lib/riskSignals';
import { useMemo as useMemoRS } from 'react';
import { NewMatterModal } from './NewMatterModal';
import { InviteClientModal } from './InviteClientModal';
import { AlertTriangle, Plus, ShieldCheck, UserPlus, CheckCircle2, Clock } from 'lucide-react';

export function MattersScreen() {
  const { matters, matterStages, attorneys, parties, runConflictCheck, linkMatterConflictCheck, clientInvites, clientUsers, auditLog } = useStore();
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [invitingPartyId, setInvitingPartyId] = useState<string | null>(null);

  // Portal status per party — 'active' (client_users row exists), 'pending'
  // (an unaccepted, unexpired client_invites row exists), or null (never
  // invited). Matches the same three-state pattern the rest of this app
  // uses for invite flows (see TeamScreen).
  const portalStatus = (partyId: string): 'active' | 'pending' | null => {
    if (clientUsers.some(cu => cu.party_id === partyId)) return 'active';
    const pending = clientInvites.find(ci => ci.party_id === partyId && !ci.accepted_at && new Date(ci.expires_at) > new Date());
    return pending ? 'pending' : null;
  };

  const stages = [...matterStages].sort((a, b) => a.sort_order - b.sort_order);
  const attorneyName = (id: string | null) => attorneys.find(a => a.id === id)?.name ?? 'Unassigned';

  // Baseline is the firm's own median time-in-stage, derived from
  // audit_log stage transitions. Returns empty when the firm has fewer
  // than three comparable transitions for a stage -- no baseline, no
  // claim. See riskSignals.ts for why this isn't a constants table.
  const bottleneckById = useMemoRS(() => {
    const m = new Map<string, ReturnType<typeof findBottlenecks>[number]>();
    for (const b of findBottlenecks(matters, matterStages, auditLog)) m.set(b.matter.id, b);
    return m;
  }, [matters, matterStages, auditLog]);
  const clientName = (id: string | null) => parties.find(p => p.id === id)?.name ?? '—';

  // Bulk-eligible = sitting in an initial (pre-engagement) stage with no
  // conflict check on record yet — exactly the "No conflict check"
  // warning badge below, just aggregated. CSV-imported matters all land
  // here with conflict_check_id: null (see importEngine.ts's comment on
  // why that's deliberate) — at real volume (60+) that's a real bulk
  // workflow gap, not a one-off.
  const isEligible = (m: (typeof matters)[number]) => {
    const stage = matterStages.find(s => s.id === m.stage_id);
    return !!stage?.is_initial && !m.conflict_check_id;
  };
  const eligibleIds = useMemo(() => matters.filter(isEligible).map(m => m.id), [matters, matterStages]);

  const toggleSelected = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const selectAllEligible = () => setSelected(new Set(eligibleIds));
  const clearSelection = () => setSelected(new Set());

  const runBulkConflictChecks = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setRunning(true);
    setProgress({ done: 0, total: ids.length });
    let cleared = 0, flagged = 0, skipped = 0;
    for (const id of ids) {
      const matter = matters.find(m => m.id === id);
      const name = matter ? clientName(matter.client_party_id) : null;
      if (!matter || !name || name === '—') {
        skipped++;
      } else {
        const result = await runConflictCheck(name, matter.id);
        if (result) {
          await linkMatterConflictCheck(matter.id, result.id);
          if (result.status === 'flagged') flagged++; else cleared++;
        } else {
          skipped++;
        }
      }
      setProgress(p => p ? { ...p, done: p.done + 1 } : p);
    }
    setRunning(false);
    setProgress(null);
    clearSelection();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3">
        <div>
          <h2 className="text-xl font-medium">Matters</h2>
          <p className="text-sm text-[var(--text-secondary)]">Your firm's active caseload, by stage.</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="h-9 px-4 flex items-center gap-1.5 text-sm font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded hover:opacity-90 transition-opacity shrink-0"
        >
          <Plus className="w-4 h-4" /> New Matter
        </button>
      </div>

      {eligibleIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-xs">
          <ShieldCheck className="w-3.5 h-3.5 text-[var(--text-tertiary)] shrink-0" />
          <span className="text-[var(--text-secondary)]">
            {selected.size > 0 ? `${selected.size} selected` : `${eligibleIds.length} matter${eligibleIds.length === 1 ? '' : 's'} without a conflict check`}
          </span>
          {selected.size === 0 ? (
            <button onClick={selectAllEligible} className="text-[var(--accent-secondary)] hover:underline ml-auto">Select all {eligibleIds.length}</button>
          ) : (
            <div className="flex items-center gap-2 ml-auto">
              <button onClick={clearSelection} disabled={running} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-40">Clear</button>
              <button
                onClick={runBulkConflictChecks}
                disabled={running}
                className="h-7 px-3 flex items-center gap-1.5 font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {running && progress ? `Running ${progress.done}/${progress.total}…` : `Run conflict check${selected.size === 1 ? '' : 's'}`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Mobile hint only — columns already scroll horizontally on any
          width, but side-by-side stages aren't discoverable on a narrow
          screen without a nudge. Desktop doesn't need it (all/most
          columns are usually visible already). */}
      <div className="md:hidden text-[11px] text-[var(--text-tertiary)] mb-2">← Swipe to see all stages →</div>

      <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory md:snap-none -mx-4 px-4 md:mx-0 md:px-0">
        {stages.map(stage => {
          const stageMatters = matters.filter(m => m.stage_id === stage.id);
          return (
            <div key={stage.id} className="flex-shrink-0 w-[85vw] max-w-72 snap-start md:snap-align-none">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-xs font-mono uppercase tracking-wider text-[var(--text-tertiary)]">{stage.label}</span>
                <span className="text-xs text-[var(--text-tertiary)]">{stageMatters.length}</span>
              </div>
              <div className="space-y-2">
                {stageMatters.length === 0 ? (
                  <div className="text-xs text-[var(--text-tertiary)] italic px-1 py-3">No matters here.</div>
                ) : (
                  stageMatters.map(m => {
                    const eligible = stage.is_initial && !m.conflict_check_id;
                    return (
                      <div key={m.id} className={`bg-[var(--bg-secondary)] border rounded-lg p-3 transition-colors ${selected.has(m.id) ? 'border-[var(--accent-secondary)]' : 'border-[var(--border-subtle)]'}`}>
                        <div className="flex items-start gap-2 mb-1">
                          {eligible && (
                            <input
                              type="checkbox"
                              checked={selected.has(m.id)}
                              onChange={() => toggleSelected(m.id)}
                              disabled={running}
                              className="mt-0.5 shrink-0"
                              aria-label={`Select ${m.title} for bulk conflict check`}
                            />
                          )}
                          <div className="text-sm font-medium flex-1 min-w-0">{m.title}</div>
                        </div>
                        <div className="text-xs text-[var(--text-tertiary)] mb-2">{clientName(m.client_party_id)}</div>
                        {(() => {
                          const b = bottleneckById.get(m.id);
                          if (!b) return null;
                          return (
                            <div className="mb-2 text-[11px] text-[var(--signal-warning)]">
                              <span className="uppercase tracking-wider font-mono mr-1.5">Stalled</span>
                              <span className="text-[var(--text-tertiary)]">{b.detail}</span>
                            </div>
                          );
                        })()}
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-[var(--text-secondary)] truncate">{attorneyName(m.assigned_attorney_id)}</span>
                          {eligible && (
                            <span className="flex items-center gap-1 text-[10px] text-[var(--signal-warning)] shrink-0">
                              <AlertTriangle className="w-3 h-3" /> No conflict check
                            </span>
                          )}
                        </div>
                        {m.client_party_id && (
                          <div className="mt-2 pt-2 border-t border-[var(--border-subtle)]">
                            {portalStatus(m.client_party_id) === 'active' ? (
                              <span className="flex items-center gap-1 text-[10px] text-[var(--signal-positive)]">
                                <CheckCircle2 className="w-3 h-3" /> Portal access active
                              </span>
                            ) : portalStatus(m.client_party_id) === 'pending' ? (
                              <span className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)]">
                                <Clock className="w-3 h-3" /> Portal invite pending
                              </span>
                            ) : (
                              <button
                                onClick={() => setInvitingPartyId(m.client_party_id)}
                                className="flex items-center gap-1 text-[10px] text-[var(--accent-secondary)] hover:underline"
                              >
                                <UserPlus className="w-3 h-3" /> Invite to Portal
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showNew && <NewMatterModal onClose={() => setShowNew(false)} />}
      {invitingPartyId && (
        <InviteClientModal
          partyId={invitingPartyId}
          partyName={clientName(invitingPartyId)}
          defaultEmail=""
          onClose={() => setInvitingPartyId(null)}
        />
      )}
    </div>
  );
}
