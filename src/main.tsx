import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App.tsx';
import './index.css';

// Error monitoring only — deliberately no performance tracing, no
// session replay, no browser-tracing integration. If a real customer's
// browser throws, or an edge function fails, this is how anyone at Sloe
// Labs finds out without waiting for the customer to report it.
// VITE_SENTRY_DSN is unset in local dev by default — Sentry.init with an
// empty/missing dsn is a documented no-op (SDK stays inert, nothing sent
// anywhere), so this never breaks local development or preview builds
// that don't have it configured.
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE,
    integrations: [],
    tracesSampleRate: 0,
  });
} else {
  console.warn('[sentry] VITE_SENTRY_DSN not set — error monitoring is inactive.');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
