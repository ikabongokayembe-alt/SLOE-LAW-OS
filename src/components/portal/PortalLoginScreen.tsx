import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClientAuth } from '../../lib/clientAuth';

// Deliberately its own screen, not a mode toggle on the staff LoginScreen
// — a client portal login should never look like (or accidentally be
// confused with) the firm-staff workspace login.
export function PortalLoginScreen() {
  const { signIn } = useClientAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn(email, password);
    setLoading(false);
    if (res.error) { setError(res.error); return; }
    navigate('/portal');
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-display font-semibold text-2xl tracking-tight mb-1">Client Portal</h1>
        <p className="text-sm text-[var(--text-secondary)] mb-8">Sign in to check your matter's status and shared documents.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[10px] uppercase font-mono tracking-wider text-[var(--text-tertiary)] block mb-1">Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full h-10 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none" />
          </div>
          <div>
            <label className="text-[10px] uppercase font-mono tracking-wider text-[var(--text-tertiary)] block mb-1">Password</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full h-10 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none" />
          </div>
          {error && <div className="text-xs text-[var(--signal-negative)]">{error}</div>}
          <button type="submit" disabled={loading} className="w-full h-10 bg-[var(--text-primary)] text-[var(--bg-primary)] rounded text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-xs text-[var(--text-tertiary)] mt-6">
          Received an invite from your attorney? Use the link in that email to set up your account.
        </p>
      </div>
    </div>
  );
}
