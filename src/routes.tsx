import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from './components/shell/AppShell';
import { StaffProviders, PortalProviders } from './components/shell/RouteProviders';
import { DashboardScreen } from './components/dashboard/DashboardScreen';
import { MattersScreen } from './components/matters/MattersScreen';
import { DeadlinesScreen } from './components/deadlines/DeadlinesScreen';
import { PartiesScreen } from './components/parties/PartiesScreen';
import { DocumentsScreen } from './components/documents/DocumentsScreen';
import { TimeEntriesScreen } from './components/time/TimeEntriesScreen';
import { CommunicationsScreen } from './components/communications/CommunicationsScreen';
import { HistoryScreen } from './components/history/HistoryScreen';
import { StrategicScreen } from './components/strategic/StrategicScreen';
import { OperatorScreen } from './components/operator/OperatorScreen';
import { AgentLibraryScreen } from './components/agents/AgentLibraryScreen';
import { SpecialistAgentScreen } from './components/agents/SpecialistAgentScreen';
import { IntegrationsScreen } from './components/integrations/IntegrationsScreen';
import { TeamScreen } from './components/team/TeamScreen';
import { SettingsScreen } from './components/settings/SettingsScreen';
import { ImportScreen } from './components/settings/ImportScreen';
import { LoginScreen } from './components/auth/LoginScreen';
import { SignupScreen } from './components/auth/SignupScreen';
import { AcceptInviteScreen } from './components/auth/AcceptInviteScreen';
import { RequireAuth, RequireRole } from './components/auth/RequireAuth';
import { PortalLoginScreen } from './components/portal/PortalLoginScreen';
import { PortalAcceptInviteScreen } from './components/portal/PortalAcceptInviteScreen';
import { PortalDashboard } from './components/portal/PortalDashboard';
import { RequireClientAuth } from './components/portal/RequireClientAuth';
import { IntakeFormScreen } from './components/intake/IntakeFormScreen';

export const router = createBrowserRouter([
  // Public client intake -- reachable by anyone with a firm's shareable
  // link, no session of any kind. Deliberately outside every provider
  // tree (StaffProviders/PortalProviders): it needs neither StoreProvider
  // (no firm-scoped staff data) nor ClientAuthProvider (no client login --
  // a prospective client isn't an account, see migration 0026).
  { path: '/intake', element: <IntakeFormScreen /> },
  {
    element: <StaffProviders />,
    children: [
      { path: '/login', element: <LoginScreen /> },
      { path: '/signup', element: <SignupScreen /> },
      { path: '/accept-invite', element: <AcceptInviteScreen /> },
      {
        element: <RequireAuth />,
        children: [
          {
            path: '/',
            element: <AppShell />,
            children: [
              { index: true, element: <DashboardScreen /> },
              { path: 'matters', element: <MattersScreen /> },
              { path: 'deadlines', element: <DeadlinesScreen /> },
              { path: 'parties', element: <PartiesScreen /> },
              { path: 'documents', element: <DocumentsScreen /> },
              { path: 'time', element: <TimeEntriesScreen /> },
              { path: 'communications', element: <CommunicationsScreen /> },
              { path: 'history', element: <HistoryScreen /> },
              { path: 'analyst', element: <StrategicScreen /> },
              { path: 'operator', element: <OperatorScreen /> },
              { path: 'agents', element: <AgentLibraryScreen /> },
              { path: 'agents/:agentKey', element: <SpecialistAgentScreen /> },
              {
                element: <RequireRole roles={['principal', 'manager']} />,
                children: [
                  { path: 'team', element: <TeamScreen /> },
                  { path: 'settings', element: <SettingsScreen /> },
                  { path: 'settings/import', element: <ImportScreen /> },
                ],
              },
              {
                element: <RequireRole roles={['principal', 'manager', 'paralegal']} />,
                children: [
                  { path: 'integrations', element: <IntegrationsScreen /> },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  // Client portal — a completely separate branch, own providers (see
  // PortalProviders), never touches StoreProvider/AuthProvider at all.
  {
    element: <PortalProviders />,
    children: [
      { path: '/portal/login', element: <PortalLoginScreen /> },
      { path: '/portal/accept-invite', element: <PortalAcceptInviteScreen /> },
      {
        element: <RequireClientAuth />,
        children: [
          { path: '/portal', element: <PortalDashboard /> },
        ],
      },
    ],
  },
]);
