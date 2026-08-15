import { useState } from 'react';
import { X } from 'lucide-react';
import { useStore } from '../../lib/store';
import { useToast } from '../../lib/toast';

// Client Portal MVP (see migration 0018) — tied to a specific party, per
// the task's own framing ("a firm staff member can send a client a
// portal invite ... tied to a specific matter/party"). Triggered from a
// matter card since that's the only place in this app a client's name is
// already visible in context — there's no standalone party-directory
// screen to hang this off of instead.
export function InviteClientModal({ partyId, partyName, defaultEmail, onClose }: {
  partyId: string; partyName: string; defaultEmail: string; onClose: () => void;
}) {
  const { inviteClientToPortal } = useStore();
  const { showToast } = useToast();
  const [email, setEmail] = useState(defaultEmail);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    if (!email.trim()) return;
    setSending(true);
    setError(null);
    const { invite, error: err } = await inviteClientToPortal(partyId, email.trim());
    setSending(false);
    if (err || !invite) { setError(err ?? 'Something went wrong — try again.'); return; }
    const link = `${window.location.origin}/portal/accept-invite?token=${invite.token}`;
    try {
      await navigator.clipboard.writeText(link);
      showToast('success', `Portal invite link copied — send it to ${email.trim()}.`);
    } catch {
      showToast('success', `Portal invite created: ${link}`);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-sm bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-medium">Invite {partyName} to the client portal</h3>
          <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-[var(--text-secondary)] mb-4">
          They'll be able to see this and any other matter they're the client on, plus any documents you explicitly share — nothing else.
        </p>
        <label className="text-[10px] uppercase font-mono tracking-wider text-[var(--text-tertiary)] block mb-1">Client email</label>
        <input
          type="email" required autoFocus value={email} onChange={e => setEmail(e.target.value)}
          className="w-full h-9 px-3 mb-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none"
        />
        {error && <div className="text-xs text-[var(--signal-negative)] mb-3">{error}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="h-8 px-3 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">Cancel</button>
          <button
            onClick={handleSend}
            disabled={sending || !email.trim()}
            className="h-8 px-3 text-xs font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {sending ? 'Sending…' : 'Send invite'}
          </button>
        </div>
      </div>
    </div>
  );
}
