import { RouterProvider } from 'react-router-dom';
import { router } from './routes';
import { ToastProvider } from './lib/toast';
import { RootErrorBoundary } from './components/shell/RootErrorBoundary';

// AuthProvider/StoreProvider (staff) and ClientAuthProvider (portal) are
// no longer mounted here — they're scoped per-branch inside routes.tsx
// (see StaffProviders/PortalProviders in components/shell/RouteProviders)
// so the client portal never mounts the staff data store.
export default function App() {
  return (
    <ToastProvider>
      <RootErrorBoundary>
        <RouterProvider router={router} />
      </RootErrorBoundary>
    </ToastProvider>
  );
}
