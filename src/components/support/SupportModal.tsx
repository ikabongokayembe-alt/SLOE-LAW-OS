import { useState } from 'react';
import { X, Send, CheckCircle2, LifeBuoy, AlertCircle } from 'lucide-react';
import { submitSupportRequest } from '../../lib/support';
import { useToast } from '../../lib/toast';

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SupportModal({ isOpen, onClose }: SupportModalProps) {
  const { showToast } = useToast();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await submitSupportRequest(subject, message);
      setSubmittedId(res.requestId);
      showToast('success', 'Support request submitted.');
    } catch (err: any) {
      console.error('[SupportModal] Submission error:', err);
      setErrorMsg(err.message || 'Could not submit support request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetAndClose = () => {
    setSubject('');
    setMessage('');
    setSubmittedId(null);
    setErrorMsg(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="relative w-full max-w-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg text-[var(--accent-secondary)]">
              <LifeBuoy className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-[var(--text-primary)]">Contact Support</h3>
              <p className="text-xs text-[var(--text-secondary)]">Direct assistance from the Law OS team</p>
            </div>
          </div>
          <button
            onClick={handleResetAndClose}
            className="p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {submittedId ? (
            <div className="space-y-4 text-center py-4">
              <div className="mx-auto w-12 h-12 flex items-center justify-center rounded-full bg-[var(--signal-positive)]/10 text-[var(--signal-positive)] border border-[var(--signal-positive)]/30">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <h4 className="text-base font-semibold text-[var(--text-primary)]">Request Submitted</h4>
                <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto leading-relaxed">
                  We've received your message and will respond soon.
                </p>
              </div>
              <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-3 inline-block font-mono text-xs text-[var(--text-tertiary)]">
                Ticket ID: <span className="text-[var(--text-primary)] font-semibold">{submittedId}</span>
              </div>
              <div className="pt-2">
                <button
                  onClick={handleResetAndClose}
                  className="w-full h-9 bg-[var(--text-primary)] text-[var(--bg-primary)] rounded font-medium text-xs hover:opacity-90 transition-opacity"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMsg && (
                <div className="flex items-center gap-2 p-3 bg-[var(--signal-negative)]/10 border border-[var(--signal-negative)]/30 rounded-lg text-xs text-[var(--signal-negative)]">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Subject <span className="text-[var(--signal-negative)]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Issue with calendar sync or document OCR..."
                  className="w-full h-9 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none focus:border-[var(--border-strong)]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Message <span className="text-[var(--signal-negative)]">*</span>
                </label>
                <textarea
                  required
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Please describe what you experienced, including matter titles or error messages if applicable..."
                  className="w-full p-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none focus:border-[var(--border-strong)] resize-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleResetAndClose}
                  className="h-9 px-4 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !subject.trim() || !message.trim()}
                  className="h-9 px-4 bg-[var(--text-primary)] text-[var(--bg-primary)] rounded font-medium text-xs hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  {submitting ? 'Submitting...' : 'Send Message'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
