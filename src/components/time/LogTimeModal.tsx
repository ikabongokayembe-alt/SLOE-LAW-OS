import { useState } from 'react';
import { useStore } from '../../lib/store';
import { useAuth } from '../../lib/auth';
import { X } from 'lucide-react';
import { TimeEntry } from '../../types';
import { minutesToHours, hoursToMinutes } from '../../lib/timeEntries';

const labelClass = 'text-[10px] uppercase font-mono tracking-wider text-[var(--text-tertiary)] block mb-1';
const inputClass = 'w-full h-10 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none';

// Same modal shell as NewMatterModal — a single simple form doesn't need
// that component's multi-step machinery, but the container/header/token
// styling matches exactly rather than inventing a new visual language.
// Doubles as both "log new" and "edit existing" (pass `entry`) so there's
// one form to keep correct, not two that can drift apart.
export function LogTimeModal({ onClose, entry, defaultMatterId }: { onClose: () => void; entry?: TimeEntry; defaultMatterId?: string }) {
  const { matters, attorneys, firm, addTimeEntry, updateTimeEntry } = useStore();
  const { profile } = useAuth();
  const isEdit = !!entry;

  const [matterId, setMatterId] = useState(entry?.matter_id ?? defaultMatterId ?? matters[0]?.id ?? '');
  const [attorneyId, setAttorneyId] = useState(entry?.attorney_id ?? profile?.attorney_id ?? '');
  const [date, setDate] = useState(entry?.date ?? new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState(entry ? String(minutesToHours(entry.duration_minutes)) : '');
  const [rate, setRate] = useState(entry?.rate != null ? String(entry.rate) : '');
  const [description, setDescription] = useState(entry?.description ?? '');
  const [billable, setBillable] = useState(entry?.billable ?? true);
  const [submitting, setSubmitting] = useState(false);

  const hoursValid = hours.trim() !== '' && Number(hours) > 0;
  const canSubmit = !!matterId && !!date && hoursValid;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const patch = {
      matter_id: matterId,
      attorney_id: attorneyId || null,
      date,
      duration_minutes: hoursToMinutes(Number(hours)),
      rate: rate.trim() ? Number(rate) : null,
      description: description.trim() || undefined,
      billable,
    };
    const result = isEdit ? await updateTimeEntry(entry!.id, patch) : await addTimeEntry(patch);
    setSubmitting(false);
    if (!result.error) onClose();
  };

  if (matters.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl shadow-xl w-full max-w-md overflow-hidden p-5" onClick={e => e.stopPropagation()}>
          <p className="text-sm text-[var(--text-secondary)]">Open a matter first — time gets logged against one.</p>
          <button onClick={onClose} className="mt-4 h-9 px-4 text-sm font-medium border border-[var(--border-subtle)] rounded hover:bg-[var(--bg-tertiary)] transition-colors">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl shadow-xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <h2 className="text-sm font-medium">{isEdit ? 'Edit Time Entry' : 'Log Time'}</h2>
          <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-3">
          <div>
            <label className={labelClass}>Matter</label>
            <select value={matterId} onChange={e => setMatterId(e.target.value)} className={inputClass}>
              {matters.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Hours</label>
              <input
                type="number" step="0.25" min="0" value={hours} onChange={e => setHours(e.target.value)}
                placeholder="1.5" className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Attorney</label>
            <select value={attorneyId} onChange={e => setAttorneyId(e.target.value)} className={inputClass}>
              <option value="">Unassigned</option>
              {attorneys.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          <div>
            <label className={labelClass}>Rate ({firm?.currency || 'USD'}/hr) <span className="text-[var(--text-tertiary)] font-normal normal-case">— optional</span></label>
            <input
              type="number" step="0.01" min="0" value={rate} onChange={e => setRate(e.target.value)}
              placeholder="Leave blank if not set yet" className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Description</label>
            <textarea
              value={description} onChange={e => setDescription(e.target.value)} rows={2}
              placeholder="What was the work?"
              className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none resize-none"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer pt-1">
            <input type="checkbox" checked={billable} onChange={e => setBillable(e.target.checked)} className="rounded" />
            <span className="text-sm">Billable</span>
          </label>

          <button
            onClick={handleSubmit}
            disabled={submitting || !canSubmit}
            className="w-full h-10 text-sm font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Log time'}
          </button>
        </div>
      </div>
    </div>
  );
}
