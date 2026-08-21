import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Clock, ShieldOff, GitBranch, Link2, Info, Wrench, Mail } from 'lucide-react';
import { ConflictCheck, Party, Matter, MatterParty, PartyRelationship } from '../../types';
import { ConflictSignal, analyseConflict } from '../../lib/conflictSignals';
import { DetailPanel, DetailSection } from '../shared/DetailPanel';
import { useStore } from '../../lib/store';
import { SendEmailModal } from '../communications/SendEmailModal';

const STATUS_STYLE: Record<ConflictCheck['status'], { icon: typeof CheckCircle2; className: string; label: string }> = {
  flagged: { icon: AlertTriangle, className: 'text-[var(--signal-warning)] bg-[var(--signal-warning)]/10 border-[var(--signal-warning)]/30', label: 'Flagged' },
  pending_review: { icon: Clock, className: 'text-[var(--signal-info)] bg-[var(--signal-info)]/10 border-[var(--signal-info)]/30', label: 'Pending Operator Review' },
  cleared: { icon: CheckCircle2, className: 'text-[var(--signal-positive)] bg-[var(--signal-positive)]/10 border-[var(--signal-positive)]/30', label: 'Cleared' },
  waived: { icon: ShieldOff, className: 'text-[var(--signal-positive)] bg-[var(--signal-positive)]/10 border-[var(--signal-positive)]/30', label: 'Waived' },
  pending: { icon: Clock, className: 'text-[var(--text-tertiary)] bg-[var(--bg-tertiary)] border-[var(--border-subtle)]', label: 'Pending' },
};

function FindingsList({ signals }: { signals: ConflictSignal[] }) {
  return (
    <div className="space-y-1.5">
      {signals.map((sig, i) => (
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
  );
}

function ReviewFlaggedCheck({ check }: { check: ConflictCheck }) {
  const { clearConflictCheck, flagConflictForOperator } = useStore();
  const navigate = useNavigate();
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState<'clear' | 'waive' | 'operator' | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);

  const findingsText = check.signals && check.signals.length > 0
    ? check.signals.map(s => `${s.path} (${s.facts.join('; ')})`).join(' | ')
    : `Potential match on searched name "${check.searched_name}"`;

  const act = async (waive: boolean) => {
    const trimmed = notes.trim();
    if (!trimmed) return;
    const confirmed = confirm(
      waive
        ? "Waive this conflict and let the matter proceed? This records that a real conflict exists and the firm is choosing to proceed anyway -- it does not remove the finding."
        : "Clear this flag and let the matter proceed? This records your professional judgment that there's no real conflict here -- the system isn't determining that for you."
    );
    if (!confirmed) return;
    setSubmitting(waive ? 'waive' : 'clear');
    await clearConflictCheck(check.id, waive, trimmed);
    setSubmitting(null);
  };

  const handleAskOperator = async () => {
    setSubmitting('operator');
    await flagConflictForOperator(check.id, notes);
    setSubmitting(null);
    const prompt = `I need help evaluating a flagged conflict check for "${check.searched_name}". Finding details: ${findingsText}. ${notes.trim() ? 'Reviewer notes: ' + notes.trim() : 'No initial notes provided.'} How should our firm evaluate or manage this conflict?`;
    navigate(`/operator?q=${encodeURIComponent(prompt)}`);
  };

  const emailSubject = `Conflict Check Review: ${check.searched_name}`;
  const emailBody = `Conflict Check Finding Summary:
- Searched Name: ${check.searched_name}
- Findings: ${findingsText}
${notes.trim() ? '- Reviewer Notes: ' + notes.trim() : ''}

Please review the conflict finding above and confirm whether formal clearance or a conflict waiver is required.`;

  return (
    <DetailSection title="Review this flag">
      <p className="text-[11px] text-[var(--text-tertiary)] mb-2">
        This is your call to make, not the system's -- clearing or waiving records your professional judgment. Required before this matter can leave Intake.
      </p>
      <label className="text-[10px] uppercase font-mono tracking-wider text-[var(--text-tertiary)] block mb-1">
        Reasoning / Notes (required for Clear/Waive; optional for Operator/Email)
      </label>
      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Why this isn't a real conflict, or how it's being managed…"
        rows={2}
        className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none resize-none mb-3"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
        <button
          onClick={() => act(false)}
          disabled={!notes.trim() || submitting !== null}
          className="h-9 px-3 text-xs font-medium bg-[var(--signal-positive)]/10 text-[var(--signal-positive)] border border-[var(--signal-positive)]/30 rounded hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {submitting === 'clear' ? 'Clearing…' : 'Clear — no real conflict'}
        </button>
        <button
          onClick={() => act(true)}
          disabled={!notes.trim() || submitting !== null}
          className="h-9 px-3 text-xs font-medium bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {submitting === 'waive' ? 'Waiving…' : 'Waive — proceed anyway'}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-[var(--border-subtle)]">
        <button
          onClick={handleAskOperator}
          disabled={submitting !== null}
          className="h-9 px-3 text-xs font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5"
        >
          <Wrench className="w-3.5 h-3.5" />
          <span>{submitting === 'operator' ? 'Routing…' : 'Ask Operator for help'}</span>
        </button>
        <button
          onClick={() => {
            const prompt = `Draft an email regarding the flagged conflict check for "${check.searched_name}". Finding details: ${findingsText}. ${notes.trim() ? 'Reviewer notes: ' + notes.trim() : ''}`;
            navigate(`/operator?q=${encodeURIComponent(prompt)}`);
          }}
          disabled={submitting !== null}
          className="h-9 px-3 text-xs font-medium bg-[var(--bg-elevated)] border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors rounded flex items-center justify-center gap-1.5"
        >
          <Mail className="w-3.5 h-3.5" />
          <span>Draft email with Operator</span>
        </button>
      </div>
    </DetailSection>
  );
}

// check time -- see migration 0023), never recomputed against current
// data for records that actually HAVE frozen signals, so a past check
// with real reasoning always shows the finding as it actually was.
//
// Legacy exception: a check run before migration 0023 has `signals: []`
// by construction (the column defaulted to an empty array for every
// pre-existing row) -- runConflictCheck is the only writer and has always
// populated `signals` since that migration, so an empty array here can
// only mean "written before this feature existed", never "a bug in the
// current write path". Presenting that as a complete, reasoning-free
// finding is exactly the "Flagged, no explanation" gap this fixes: rather
// than show nothing (or worse, a bare unexplained flag), this recomputes
// analyseConflict() live against CURRENT data and labels it clearly as a
// recheck, not the preserved original. If even that recheck finds nothing
// (the matched party was since deleted, e.g.), it says so honestly instead
// of inventing reasoning that was never actually recorded.
export function ConflictCheckDetailContent({
  check, parties, matters, matterParties, partyRelationships,
}: {
  check: ConflictCheck;
  parties: Party[];
  matters: Matter[];
  matterParties: MatterParty[];
  partyRelationships: PartyRelationship[];
}) {
  const style = STATUS_STYLE[check.status];
  const StatusIcon = style.icon;
  const hasSignals = !!check.signals && check.signals.length > 0;
  const recomputed = hasSignals ? [] : analyseConflict(check.searched_name, parties, matters, matterParties, partyRelationships);
  const hasRecomputed = recomputed.length > 0;
  // Last-resort fallback: even a live recheck found nothing (the matched
  // party record no longer exists, its aliases changed, etc.) -- fall
  // back to the bare matched names so the record isn't completely blank,
  // but say plainly that the reasoning behind them isn't available rather
  // than presenting the names as though that were the whole story.
  const legacyNames = (!hasSignals && !hasRecomputed) ? check.matched_party_ids.map(id => parties.find(p => p.id === id)?.name ?? 'Unknown party') : [];

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
          <FindingsList signals={check.signals!} />
          <div className="text-[11px] text-[var(--text-tertiary)] mt-2">
            These are connections found in your own records, not a determination that a conflict exists.
          </div>
        </DetailSection>
      ) : hasRecomputed ? (
        <DetailSection title={`Findings (${recomputed.length})`}>
          <div className="flex items-start gap-1.5 text-[11px] text-[var(--text-secondary)] bg-[var(--bg-tertiary)] rounded px-2.5 py-2 mb-2">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>Recorded before detailed reasoning was saved. Showing a live recheck against your current data below — not the original result, which was never captured.</span>
          </div>
          <FindingsList signals={recomputed} />
          <div className="text-[11px] text-[var(--text-tertiary)] mt-2">
            These are connections found in your own records, not a determination that a conflict exists.
          </div>
        </DetailSection>
      ) : legacyNames.length > 0 ? (
        <DetailSection title={`Matched parties (${legacyNames.length})`}>
          <div className="flex items-start gap-1.5 text-[11px] text-[var(--signal-warning)] bg-[var(--signal-warning)]/10 rounded px-2.5 py-2 mb-2">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>Detailed reasoning isn't available for this record — it was saved before this feature existed, and a live recheck against current data no longer reproduces a match (the matched party's record may have changed or been removed). The names below are shown for reference only, with no explanation behind them.</span>
          </div>
          <div className="space-y-1">
            {legacyNames.map((n, i) => (
              <div key={i} className="text-xs text-[var(--text-secondary)] bg-[var(--bg-tertiary)] rounded px-2 py-1.5">{n}</div>
            ))}
          </div>
        </DetailSection>
      ) : null}

      {check.status === 'flagged' && <ReviewFlaggedCheck check={check} />}

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

export function ConflictCheckDetailPanel({
  check, parties, matters, matterParties, partyRelationships, onClose,
}: {
  check: ConflictCheck;
  parties: Party[];
  matters: Matter[];
  matterParties: MatterParty[];
  partyRelationships: PartyRelationship[];
  onClose: () => void;
}) {
  return (
    <DetailPanel title={check.searched_name} subtitle="Conflict check" onClose={onClose}>
      <ConflictCheckDetailContent check={check} parties={parties} matters={matters} matterParties={matterParties} partyRelationships={partyRelationships} />
    </DetailPanel>
  );
}
