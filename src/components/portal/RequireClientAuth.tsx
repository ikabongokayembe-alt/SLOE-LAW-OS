import { Navigate, Outlet } from 'react-router-dom';
import { useClientAuth } from '../../lib/clientAuth';

// Mirrors RequireAuth (src/components/auth/RequireAuth.tsx) exactly,
// against ClientAuthProvider instead of AuthProvider — a portal client
// and firm staff are different identities entirely, so this can't reuse
// the staff guard (that one checks `profile`, which a client never has).
export function RequireClientAuth() {
  const { loading, clientProfile } = useClientAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="text-sm text-[var(--text-tertiary)]">Loading…</div>
      </div>
    );
  }

  if (!clientProfile) return <Navigate to="/portal/login" replace />;

  return <Outlet />;
}
