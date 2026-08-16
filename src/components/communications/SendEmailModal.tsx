import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../../lib/store';
import { X, Mail } from 'lucide-react';

const labelClass = 'text-[10px] uppercase font-mono tracking-wider text-[var(--text-tertiary)] block mb-1';
const inputClass = 'w-full h-10 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none';

// Same modal shell as LogTimeModal/NewMatterModal — a single form, one
// container/header/token style, no reinvented visual language.
export function SendEmailModal({ onClose, defaultMatterId, defaultSubject, defaultBody }: { onClose: () => void; defaultMatterId?: string; defaultSubject?: string; defaultBody?: string }) {
  const { matters, integrationConnections, sendMatterCommunication } = useStore();

  const [matterId, setMatterId] = useState(defaultMatterId ?? matters[0]?.id ?? '');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState(defaultSubject ?? '');
  const [body, setBody] = useState(defaultBody ?? '');
  const [submitting, setSubmitting] = useState(false);

  const gmailConnected = integrationConnections?.some(c => c.toolkit_slug === 'gmail' && c.status === 'ACTIVE') ?? null;
  const emailValid = /\S+@\S+\.\S+/.test(to.trim());
  const canSubmit = !!matterId && emailValid && subject.trim() !== '' && body.trim() !== '' && gmailConnected === true;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const result = await sendMatterCommunication({ matter_id: matterId, sent_to: to.trim(), subject: subject.trim(), body: body.trim() });
    setSubmitting(false);
    if (!result.error) onClose();
  };

  if (matters.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl shadow-xl w-full max-w-md overflow-hidden p-5" onClick={e => e.stopPropagation()}>
          <p className="text-sm text-[var(--text-secondary)]">Open a matter first — email gets logged against one.</p>
          <button onClick={onClose} className="mt-4 h-9 px-4 text-sm font-medium border border-[var(--border-subtle)] rounded hover:bg-[var(--bg-tertiary)] transition-colors">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl shadow-xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <h2 className="text-sm font-medium flex items-center gap-2"><Mail className="w-4 h-4" /> Send Email</h2>
          <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"><X className="w-4 h-4" /></button>
        </div>

        {gmailConnected === false ? (
          <div className="p-5">
            <p className="text-sm text-[var(--text-secondary)]">
              Gmail isn't connected for this firm yet — connect it from Integrations to send email from a matter.
            </p>
            <Link
              to="/integrations"
              onClick={onClose}
              className="mt-3 inline-block h-9 px-4 flex items-center text-sm font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded hover:opacity-90 transition-opacity w-fit"
            >
              Go to Integrations →
            </Link>
          </div>
        ) : (
          <div className="p-5 space-y-3">
            <div>
              <label className={labelClass}>Matter</label>
              <select value={matterId} onChange={e => setMatterId(e.target.value)} className={inputClass}>
                {matters.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
              </select>
            </div>

            <div>
              <label className={labelClass}>To</label>
              <input type="email" value={to} onChange={e => setTo(e.target.value)} placeholder="client@example.com" className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>Subject</label>
              <input type="text" value={subject} onChange={e => setSubject(e.target.value)} className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>Body</label>
              <textarea
                value={body} onChange={e => setBody(e.target.value)} rows={6}
                className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none resize-none"
              />
            </div>

            <p className="text-xs text-[var(--text-tertiary)]">
              Sends through your firm's connected Gmail and logs a record against this matter.
            </p>

            <button
              onClick={handleSubmit}
              disabled={submitting || !canSubmit || gmailConnected === null}
              className="w-full h-10 text-sm font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {submitting ? 'Sending…' : gmailConnected === null ? 'Checking connection…' : 'Send email'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
