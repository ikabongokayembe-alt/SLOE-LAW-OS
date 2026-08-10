import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { Building2, User } from 'lucide-react';

type WorkspaceType = 'firm' | 'solo';

export function SignupScreen() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [workspaceType, setWorkspaceType] = useState<WorkspaceType>('firm');
  const [firmName, setBrokerageName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isSolo = workspaceType === 'solo';
  // Solo agents can skip naming a business — default to "<Name>'s Workspace".
  const effectiveBrokerageName = isSolo ? (firmName.trim() || `${name.trim()}'s Workspace`) : firmName;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    const res = await signUp(email, password, effectiveBrokerageName, name, isSolo);
    setLoading(false);
    if (res.error) {
      if (res.error.toLowerCase().includes('check your email')) { setInfo(res.error); return; }
      setError(res.error);
      return;
    }
    navigate('/');
  };

  const typeButtonClass = (type: WorkspaceType) =>
    `flex-1 flex flex-col items-center gap-2 py-4 rounded-lg border text-sm font-medium transition-colors ${
      workspaceType === type
        ? 'border-[var(--text-primary)] bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
        : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
    }`;

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-display font-semibold text-2xl tracking-tight mb-1">Law OS</h1>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          {isSolo
            ? "Set up your own workspace. You'll be the Partner — invite others later if your team grows."
            : "Set up your firm's workspace. You'll be the Partner — you can invite your team once you're in."}
        </p>

        <div className="flex gap-2 mb-6">
          <button type="button" onClick={() => setWorkspaceType('firm')} className={typeButtonClass('firm')}>
            <Building2 className="w-5 h-5" />
            Firm
          </button>
          <button type="button" onClick={() => setWorkspaceType('solo')} className={typeButtonClass('solo')}>
            <User className="w-5 h-5" />
            Solo Practitioner
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[10px] uppercase font-mono tracking-wider text-[var(--text-tertiary)] block mb-1">
              {isSolo ? 'Practice name (optional)' : 'Firm name'}
            </label>
            <input
              required={!isSolo}
              value={firmName}
              onChange={e => setBrokerageName(e.target.value)}
              placeholder={isSolo ? "Defaults to \"Your Name's Workspace\"" : 'e.g. Al-Khalifa & Associates'}
              className="w-full h-10 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase font-mono tracking-wider text-[var(--text-tertiary)] block mb-1">Your name</label>
            <input required value={name} onChange={e => setName(e.target.value)} className="w-full h-10 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none" />
          </div>
          <div>
            <label className="text-[10px] uppercase font-mono tracking-wider text-[var(--text-tertiary)] block mb-1">Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full h-10 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none" />
          </div>
          <div>
            <label className="text-[10px] uppercase font-mono tracking-wider text-[var(--text-tertiary)] block mb-1">Password</label>
            <input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} className="w-full h-10 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none" />
          </div>
          {error && <div className="text-xs text-[var(--signal-negative)]">{error}</div>}
          {info && <div className="text-xs text-[var(--signal-positive)]">{info}</div>}
          <button type="submit" disabled={loading} className="w-full h-10 bg-[var(--text-primary)] text-[var(--bg-primary)] rounded text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40">
            {loading ? 'Creating workspace…' : 'Create workspace'}
          </button>
        </form>

        <p className="text-xs text-[var(--text-tertiary)] mt-6">
          Already have a workspace? <Link to="/login" className="text-[var(--text-primary)] underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
