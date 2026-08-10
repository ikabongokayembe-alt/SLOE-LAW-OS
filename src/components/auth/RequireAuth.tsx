import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../lib/auth';

export function RequireAuth() {
  const { loading, profile, isDevMode } = useAuth();

  if (isDevMode) return <Outlet />; // local dev-data mode: no real auth required

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="text-sm text-[var(--text-tertiary)]">Loading…</div>
      </div>
    );
  }

  if (!profile) return <Navigate to="/login" replace />;

  return <Outlet />;
}

export function RequireRole({ roles }: { roles: string[] }) {
  const { profile, isDevMode } = useAuth();
  // In dev mode, DEV_PROFILES[0] (Principal) is the default active profile,
  // so role gating still behaves sensibly when previewing as an agent.
  if (!isDevMode && !profile) return <Navigate to="/login" replace />;
  if (profile && !roles.includes(profile.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}
