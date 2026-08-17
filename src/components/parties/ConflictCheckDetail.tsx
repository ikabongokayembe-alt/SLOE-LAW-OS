import { AlertTriangle, CheckCircle2, Clock, ShieldOff, GitBranch, Link2 } from 'lucide-react';
import { ConflictCheck, Party } from '../../types';
import { DetailPanel, DetailSection } from '../shared/DetailPanel';

const STATUS_STYLE: Record<ConflictCheck['status'], { icon: typeof CheckCircle2; className: string; label: string }> = {
  flagged: { icon: AlertTriangle, className: 'text-[var(--signal-warning)] bg-[var(--signal-warning)]/10 border-[var(--signal-warning)]/30', label: 'Flagged' },
  cleared: { icon: CheckCircle2, className: 'text-[var(--signal-positive)] bg-[var(--signal-positive)]/10 border-[var(--signal-positive)]/30', label: 'Cleared' },
  waived: { icon: ShieldOff, className: 'text-[var(--signal-positive)] bg-[var(--signal-positive)]/10 border-[var(--signal-positive)]/30', label: 'Waived' },
  pending: { icon: Clock, className: 'text-[var(--text-tertiary)] bg-[var(--bg-tertiary)] border-[var(--border-subtle)]', label: 'Pending' },
};

// The rich result itself, content-only -- reused unmodified whether it is
// rendered seconds after a live search (PartiesScreen) or reopened later
// from Recent Checks / a matter's conflict-check section. Renders from the
// check's own stored `signals` (analyseConflict()'s output, frozen at
// check time -- see migration 0023), never recomputed against current
// data, so a past check always shows the finding as it actually was.
export function ConflictCheckDetailContent({ check, parties }: { check: ConflictCheck; parties: Party[] }) {
  const style = STATUS_STYLE[check.status];
  const StatusIcon = style.icon;
  const hasSignals = !!check.signals && check.signals.length > 0;
  // Legacy fallback for checks run before migration 0023 (signals wasn't
  // captured yet) -- falls back to a plain name lookup so an old record
  // still shows something real instead of nothing.
  const legacyNames = !hasSignals ? check.matched_party_ids.map(id => parties.find(p => p.id === id)?.name ?? 'Unknown party') : [];

  return (
    <>
      <div className={`flex items-center gap-2 text-sm rounded-lg border px-3 py-2 ${style.className}`}>
        <StatusIcon className="w-4 h-4 shrink-0" /> {style.label}
      </div>

      <DetailSection title="Searched name">
        <div className="text-sm">{check.searched_name}</div>
        <div className="text-xs text-[var(--text-tertiary)] mt-1">
          Run {new Date(check.created_at).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </div>
      </DetailSection>

      {hasSignals ? (
        <DetailSection title={`Findings (${check.signals!.length})`}>
          <div className="space-y-1.5">
            {check.signals!.map((sig, i) => (
              <div key={i} className="bg-[var(--bg-tertiary)] rounded px-3 py-2 border-l-2" style={{ borderLeftColor: sig.adverse ? 'var(--signal-negative)' : 'var(--border-default)' }}>
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  {sig.kind === 'related' ? <Link2 className="w-3 h-3 shrink-0" /> : <GitBranch className="w-3 h-3 shrink-0" />}
                  <span className="truncate">{sig.path}</span>
                  {sig.adverse && (
                    <span className="text-[10px] uppercase tracking-wider text-[var(--signal-negative)] shrink-0 ml-1">Adverse role</span>
                  )}
                </div>
                <ul className="mt-1 space-y-0.5">
                  {sig.facts.map((f, j) => (
                    <li key={j} className="text-[11px] text-[var(--text-tertiary)]">{f}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="text-[11px] text-[var(--text-tertiary)] mt-2">
            These are connections found in your own records, not a determination that a conflict exists.
          </div>
        </DetailSection>
      ) : legacyNames.length > 0 ? (
        <DetailSection title={`Matched parties (${legacyNames.length})`}>
          <div className="space-y-1">
            {legacyNames.map((n, i) => (
              <div key={i} className="text-xs text-[var(--text-secondary)] bg-[var(--bg-tertiary)] rounded px-2 py-1.5">{n}</div>
            ))}
          </div>
        </DetailSection>
      ) : null}

      {(check.status === 'cleared' || check.status === 'waived') && (check.cleared_at || check.notes) && (
        <DetailSection title={check.status === 'waived' ? 'Waiver' : 'Cleared'}>
          {check.cleared_at && (
            <div className="text-xs text-[var(--text-tertiary)] mb-1">
              {new Date(check.cleared_at).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </div>
          )}
          {check.notes && <p className="text-sm text-[var(--text-secondary)]">{check.notes}</p>}
        </DetailSection>
      )}
    </>
  );
}

export function ConflictCheckDetailPanel({ check, parties, onClose }: { check: ConflictCheck; parties: Party[]; onClose: () => void }) {
  return (
    <DetailPanel title={check.searched_name} subtitle="Conflict check" onClose={onClose}>
      <ConflictCheckDetailContent check={check} parties={parties} />
    </DetailPanel>
  );
}
