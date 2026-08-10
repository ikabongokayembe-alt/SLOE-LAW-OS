import { RouterProvider } from 'react-router-dom';
import { router } from './routes';
import { StoreProvider } from './lib/store';
import { AuthProvider } from './lib/auth';
import { ToastProvider } from './lib/toast';
import { RootErrorBoundary } from './components/shell/RootErrorBoundary';

export default function App() {
  return (
    <ToastProvider>
      <RootErrorBoundary>
        <AuthProvider>
          <StoreProvider>
            <RouterProvider router={router} />
          </StoreProvider>
        </AuthProvider>
      </RootErrorBoundary>
    </ToastProvider>
  );
}
