import { Outlet } from 'react-router-dom';
import { AuthProvider } from '../../lib/auth';
import { StoreProvider } from '../../lib/store';
import { ClientAuthProvider } from '../../lib/clientAuth';

// Split out of App.tsx so the client portal branch (see routes.tsx) never
// mounts StoreProvider — that provider loads a whole firm's worth of
// data keyed off a STAFF profile's firm_id (see lib/store.tsx), which is
// both wasted work and conceptually wrong for a portal client, who has
// no firm_id of their own and must never trigger firm-wide queries.
export function StaffProviders() {
  return (
    <AuthProvider>
      <StoreProvider>
        <Outlet />
      </StoreProvider>
    </AuthProvider>
  );
}

// The client portal's entire provider stack — deliberately just
// ClientAuthProvider, nothing else. Portal screens talk to Supabase
// directly (see PortalDashboard.tsx) and rely on RLS to scope every
// query, rather than a shared client-side data store.
export function PortalProviders() {
  return (
    <ClientAuthProvider>
      <Outlet />
    </ClientAuthProvider>
  );
}
