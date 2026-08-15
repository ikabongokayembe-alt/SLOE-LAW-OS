import { useMemo, useState } from 'react';
import { useStore } from '../../lib/store';
import { useAuth } from '../../lib/auth';
import { X, Search, AlertTriangle, CheckCircle2, Scale } from 'lucide-react';
import {
  findMatchingRules, computeRuleDate, triggerEventLabel, ruleFramingLabel, ruleFramingSentence, deadlineTitleFromRule, ruleDisclaimer,
} from '../../lib/deadlineRules';

type Step = 'client' | 'conflict' | 'details';

export function NewMatterModal({ onClose }: { onClose: () => void }) {
  const { parties, addParty, runConflictCheck, clearConflictCheck, addMatter, addDeadline, matterStages, practiceAreas, attorneys, firm, deadlineRules } = useStore();
  const { profile } = useAuth();
  const [step, setStep] = useState<Step>('client');
  const [clientName, setClientName] = useState('');
  const [clientPartyId, setClientPartyId] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [conflictCheckId, setConflictCheckId] = useState<string | null>(null);
  const [conflictStatus, setConflictStatus] = useState<'cleared' | 'flagged' | null>(null);
  const [matches, setMatches] = useState<string[]>([]);
  const [waiveNotes, setWaiveNotes] = useState('');

  const [title, setTitle] = useState('');
  const [practiceAreaId, setPracticeAreaId] = useState(practiceAreas[0]?.id ?? '');
  const [attorneyId, setAttorneyId] = useState(profile?.attorney_id ?? '');
  const [billingType, setBillingType] = useState<'hourly' | 'contingency' | 'flat_fee' | 'retainer'>('hourly');
  const [submitting, setSubmitting] = useState(false);

  // Statute-of-limitations engine: a suggestion, never automatic. Matches
  // by the practice area's `key` (deadline_rules.practice_area convention)
  // against the firm's own jurisdiction — see migration 0011 / src/lib/deadlineRules.ts.
  const selectedPracticeArea = practiceAreas.find(p => p.id === practiceAreaId);
  const matchingRules = useMemo(
    () => findMatchingRules(deadlineRules, firm?.country, firm?.region, selectedPracticeArea?.key),
    [deadlineRules, firm?.country, firm?.region, selectedPracticeArea?.key]
  );
  const [selectedRuleId, setSelectedRuleId] = useState<string>('');
  const selectedRule = matchingRules.find(r => r.id === selectedRuleId) ?? matchingRules[0] ?? null;
  const [triggerDate, setTriggerDate] = useState('');
  const [createDeadline, setCreateDeadline] = useState(false);
  const computedDate = selectedRule && triggerDate ? computeRuleDate(selectedRule, triggerDate) : null;

  const initialStage = [...matterStages].sort((a, b) => a.sort_order - b.sort_order).find(s => s.is_initial);

  const handleRunCheck = async () => {
    if (!clientName.trim()) return;
    setChecking(true);
    // Real party record first — a conflict check needs something to link to.
    let party = parties.find(p => p.name.toLowerCase() === clientName.trim().toLowerCase());
    if (!party) {
      party = await addParty({ name: clientName.trim(), party_type: 'individual', aliases: [] }) ?? undefined;
    }
    if (party) setClientPartyId(party.id);

    const result = await runConflictCheck(clientName.trim(), null);
    setChecking(false);
    if (!result) return;
    setConflictCheckId(result.id);
    setConflictStatus(result.status === 'flagged' ? 'flagged' : 'cleared');
    setMatches(result.matched_party_ids.map(id => parties.find(p => p.id === id)?.name ?? 'Unknown match'));
    setStep('conflict');
  };

  const handleProceedAfterConflict = async (waive: boolean) => {
    if (!conflictCheckId) return;
    if (conflictStatus === 'flagged') {
      await clearConflictCheck(conflictCheckId, waive, waive ? waiveNotes : undefined);
    }
    setStep('details');
  };

  const handleCreateMatter = async () => {
    if (!title.trim() || !initialStage) return;
    setSubmitting(true);
    const matter = await addMatter({
      title: title.trim(),
      practice_area_id: practiceAreaId || null,
      stage_id: initialStage.id,
      client_party_id: clientPartyId,
      assigned_attorney_id: attorneyId || null,
      status: 'active',
      billing_type: billingType,
      conflict_check_id: conflictCheckId,
      opened_date: new Date().toISOString().slice(0, 10),
    });
    // Opt-in only — a matching rule and a filled-in trigger date are not
    // enough on their own; "create this deadline" has to be explicitly
    // checked. Matter creation itself never fails or blocks on this.
    if (matter && createDeadline && selectedRule && computedDate) {
      await addDeadline({
        matter_id: matter.id,
        title: deadlineTitleFromRule(selectedRule),
        deadline_type: 'statute_of_limitations',
        due_date: computedDate,
        status: 'upcoming',
        assigned_to: attorneyId || null,
        is_critical: true,
        reminder_days_before: 90,
      });
    }
    setSubmitting(false);
    if (matter) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl shadow-xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <h2 className="text-sm font-medium">New Matter</h2>
          <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5">
          {step === 'client' && (
            <div className="space-y-3">
              <p className="text-xs text-[var(--text-secondary)]">Every new matter starts with a conflict check — this searches every party ever entered at this firm.</p>
              <label className="text-[10px] uppercase font-mono tracking-wider text-[var(--text-tertiary)] block">Prospective client name</label>
              <input
                value={clientName}
                onChange={e => setClientName(e.target.value)}
                placeholder="Full name or organization"
                className="w-full h-10 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none"
                autoFocus
              />
              <button
                onClick={handleRunCheck}
                disabled={!clientName.trim() || checking}
                className="w-full h-10 flex items-center justify-center gap-2 text-sm font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                <Search className="w-4 h-4" /> {checking ? 'Checking…' : 'Run conflict check'}
              </button>
            </div>
          )}

          {step === 'conflict' && (
            <div className="space-y-3">
              {conflictStatus === 'cleared' ? (
                <div className="flex items-center gap-2 text-sm text-[var(--signal-positive)] bg-[var(--signal-positive)]/10 border border-[var(--signal-positive)]/30 rounded-lg p-3">
                  <CheckCircle2 className="w-4 h-4 shrink-0" /> No conflicts found. Clear to proceed.
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-[var(--signal-warning)] bg-[var(--signal-warning)]/10 border border-[var(--signal-warning)]/30 rounded-lg p-3">
                    <AlertTriangle className="w-4 h-4 shrink-0" /> {matches.length} potential match{matches.length === 1 ? '' : 'es'} found.
                  </div>
                  <div className="space-y-1">
                    {matches.map((m, i) => (
                      <div key={i} className="text-xs text-[var(--text-secondary)] bg-[var(--bg-tertiary)] rounded px-2 py-1.5">{m}</div>
                    ))}
                  </div>
                  <label className="text-[10px] uppercase font-mono tracking-wider text-[var(--text-tertiary)] block mt-3">Waiver notes (required to proceed)</label>
                  <textarea
                    value={waiveNotes}
                    onChange={e => setWaiveNotes(e.target.value)}
                    placeholder="Why this isn't a real conflict, or how it's being managed…"
                    rows={2}
                    className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none resize-none"
                  />
                </div>
              )}
              <button
                onClick={() => handleProceedAfterConflict(conflictStatus === 'flagged')}
                disabled={conflictStatus === 'flagged' && !waiveNotes.trim()}
                className="w-full h-10 text-sm font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {conflictStatus === 'flagged' ? 'Waive and proceed' : 'Continue'}
              </button>
            </div>
          )}

          {step === 'details' && (
            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase font-mono tracking-wider text-[var(--text-tertiary)] block mb-1">Matter title</label>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Smith v. Jones — Contract Dispute" className="w-full h-10 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none" autoFocus />
              </div>
              <div>
                <label className="text-[10px] uppercase font-mono tracking-wider text-[var(--text-tertiary)] block mb-1">Practice area</label>
                <select value={practiceAreaId} onChange={e => setPracticeAreaId(e.target.value)} className="w-full h-10 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none">
                  {practiceAreas.filter(p => p.is_active).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>

              {/* Statute-of-limitations engine: deterministic lookup only,
                  never AI-generated — see migration 0011. A suggestion the
                  person has to explicitly opt into, never automatic. */}
              {firm?.country && (
                matchingRules.length > 0 ? (
                  <div className="border border-[var(--accent-secondary)]/30 bg-[var(--accent-secondary)]/5 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase font-mono tracking-wider text-[var(--accent-secondary)]">
                      <Scale className="w-3 h-3" /> Suggested deadline
                    </div>

                    {matchingRules.length > 1 && (
                      <select
                        value={selectedRule?.id ?? ''}
                        onChange={e => { setSelectedRuleId(e.target.value); setTriggerDate(''); setCreateDeadline(false); }}
                        className="w-full h-9 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-xs focus:outline-none"
                      >
                        {matchingRules.map(r => (
                          <option key={r.id} value={r.id}>{ruleFramingLabel(r)} — {triggerEventLabel(r.trigger_event)} ({r.citation})</option>
                        ))}
                      </select>
                    )}

                    {selectedRule && (
                      <>
                        <div>
                          <label className="text-[10px] uppercase font-mono tracking-wider text-[var(--text-tertiary)] block mb-1">{triggerEventLabel(selectedRule.trigger_event)}</label>
                          <input
                            type="date"
                            value={triggerDate}
                            onChange={e => setTriggerDate(e.target.value)}
                            className="w-full h-9 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none"
                          />
                        </div>

                        {computedDate && (
                          <div className="text-xs space-y-1.5">
                            <div className="font-medium text-[var(--text-primary)]">
                              {ruleFramingLabel(selectedRule)}: {computedDate}
                            </div>
                            <div className="text-[var(--text-secondary)]">{ruleFramingSentence(selectedRule, computedDate)}</div>
                            {selectedRule.notes && <div className="text-[var(--text-tertiary)] italic">{selectedRule.notes}</div>}
                            {selectedRule.exceptions && (
                              <div className="text-[var(--text-tertiary)]"><span className="font-medium">Exceptions:</span> {selectedRule.exceptions}</div>
                            )}
                            <div className="text-[var(--text-tertiary)] pt-1 border-t border-[var(--border-subtle)]">
                              <span className="font-medium">{selectedRule.citation}</span> — {ruleDisclaimer(selectedRule)}
                            </div>
                            <label className="flex items-center gap-2 pt-1 cursor-pointer">
                              <input type="checkbox" checked={createDeadline} onChange={e => setCreateDeadline(e.target.checked)} className="rounded" />
                              <span>Also create this deadline when I open the matter</span>
                            </label>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-[var(--text-tertiary)] italic">
                    No automated rule yet for this jurisdiction/practice area — set the deadline manually.
                  </div>
                )
              )}

              <div>
                <label className="text-[10px] uppercase font-mono tracking-wider text-[var(--text-tertiary)] block mb-1">Assigned attorney</label>
                <select value={attorneyId} onChange={e => setAttorneyId(e.target.value)} className="w-full h-10 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none">
                  <option value="">Unassigned</option>
                  {attorneys.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase font-mono tracking-wider text-[var(--text-tertiary)] block mb-1">Billing type</label>
                <select value={billingType} onChange={e => setBillingType(e.target.value as any)} className="w-full h-10 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none">
                  <option value="hourly">Hourly</option>
                  <option value="contingency">Contingency</option>
                  <option value="flat_fee">Flat fee</option>
                  <option value="retainer">Retainer</option>
                </select>
              </div>
              <button
                onClick={handleCreateMatter}
                disabled={!title.trim() || submitting}
                className="w-full h-10 text-sm font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {submitting ? 'Opening…' : 'Open matter'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
