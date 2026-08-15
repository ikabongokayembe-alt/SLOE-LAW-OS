import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useClientAuth } from '../../lib/clientAuth';

// Mirrors AcceptInviteScreen (src/components/auth/AcceptInviteScreen.tsx)
// — same token+password shape — except there's no "your name" field: a
// client's display name comes from the party record the firm already
// created (parties.name), not from what the invitee types in.
export function PortalAcceptInviteScreen() {
  const { acceptInvite } = useClientAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) { setError('This invite link is missing its token.'); return; }
    setError(null);
    setLoading(true);
    const res = await acceptInvite(token, password);
    setLoading(false);
    if (res.error) { setError(res.error); return; }
    navigate('/portal');
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-display font-semibold text-2xl tracking-tight mb-1">Set up your account</h1>
        <p className="text-sm text-[var(--text-secondary)] mb-8">Create a password to access your client portal.</p>

        {!token && (
          <div className="text-xs text-[var(--signal-negative)] mb-4">
            No invite token found in this link. Ask your attorney to resend it.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[10px] uppercase font-mono tracking-wider text-[var(--text-tertiary)] block mb-1">Choose a password</label>
            <input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} className="w-full h-10 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none" />
          </div>
          {error && <div className="text-xs text-[var(--signal-negative)]">{error}</div>}
          <button type="submit" disabled={loading || !token} className="w-full h-10 bg-[var(--text-primary)] text-[var(--bg-primary)] rounded text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40">
            {loading ? 'Setting up…' : 'Access my portal'}
          </button>
        </form>
      </div>
    </div>
  );
}
