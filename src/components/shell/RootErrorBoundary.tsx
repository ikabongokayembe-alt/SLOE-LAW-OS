import { Component, ReactNode } from 'react';
import * as Sentry from '@sentry/react';

interface Props { children: ReactNode; }
interface State { error: Error | null; }

// Permanent safety net, not throwaway diagnostic code — carried over from
// a real production incident on Realty OS where a blank screen with no
// error boundary took multiple rounds to diagnose. Included here from
// day one instead of learning the same lesson twice.
export class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[RootErrorBoundary] caught:', error, info.componentStack);
    // Sentry.captureException is a documented no-op when Sentry.init was
    // never called (no VITE_SENTRY_DSN) — this line is safe in local dev
    // and doesn't need its own env-var check.
    Sentry.captureException(error, { contexts: { react: { componentStack: info.componentStack } } });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="fixed inset-0 bg-[#0a0a0a] text-[#f5f5f5] flex items-center justify-center p-8">
          <div className="max-w-2xl w-full">
            <h1 className="text-lg font-semibold mb-3 text-red-400">Something went wrong</h1>
            <p className="text-sm text-white/70 mb-4">
              This has been logged. Try reloading — if it keeps happening, this error text is what to share.
            </p>
            <pre className="text-xs bg-black/40 border border-white/10 rounded p-4 overflow-auto max-h-64 whitespace-pre-wrap">
              {this.state.error.toString()}
              {'\n\n'}
              {this.state.error.stack}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 h-9 px-4 text-sm bg-white text-black rounded hover:opacity-90 transition-opacity"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
