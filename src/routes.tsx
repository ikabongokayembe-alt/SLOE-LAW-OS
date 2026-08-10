import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from './components/shell/AppShell';
import { DashboardScreen } from './components/dashboard/DashboardScreen';
import { MattersScreen } from './components/matters/MattersScreen';
import { DeadlinesScreen } from './components/deadlines/DeadlinesScreen';
import { PartiesScreen } from './components/parties/PartiesScreen';
import { StrategicScreen } from './components/strategic/StrategicScreen';
import { OperatorScreen } from './components/operator/OperatorScreen';
import { AgentLibraryScreen } from './components/agents/AgentLibraryScreen';
import { IntegrationsScreen } from './components/integrations/IntegrationsScreen';
import { TeamScreen } from './components/team/TeamScreen';
import { LoginScreen } from './components/auth/LoginScreen';
import { SignupScreen } from './components/auth/SignupScreen';
import { AcceptInviteScreen } from './components/auth/AcceptInviteScreen';
import { RequireAuth, RequireRole } from './components/auth/RequireAuth';

export const router = createBrowserRouter([
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
          { path: 'analyst', element: <StrategicScreen /> },
          { path: 'operator', element: <OperatorScreen /> },
          { path: 'agents', element: <AgentLibraryScreen /> },
          {
            element: <RequireRole roles={['principal', 'manager']} />,
            children: [
              { path: 'team', element: <TeamScreen /> },
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
]);
