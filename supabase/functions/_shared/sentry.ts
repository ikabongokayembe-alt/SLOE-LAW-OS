// Lightweight Sentry error reporter for Supabase Edge Functions (Deno).
// Deliberately NOT the full @sentry SDK — these functions are small and
// short-lived, and only need "an error happened, make it searchable
// somewhere" (see the error-monitoring task's explicit scope: errors
// only, no performance/replay). This is a direct POST to Sentry's own
// envelope ingestion API — the same fetch-not-SDK shape every Resend
// call in this codebase already uses — not a new logging pipeline, just
// calling the monitoring service's own API directly.
//
// Secret: supabase secrets set SENTRY_DSN=https://<public_key>@<host>/<project_id>
// If unset or malformed, reportError() logs to console and returns —
// it NEVER throws and never blocks the caller's own error response;
// a monitoring failure must not become the actual incident.

interface ParsedDsn {
  ingestUrl: string;
}

export function parseDsn(dsn: string): ParsedDsn | null {
  try {
    const url = new URL(dsn);
    const publicKey = url.username;
    const projectId = url.pathname.replace(/^\//, '');
    if (!publicKey || !projectId) return null;
    return {
      ingestUrl: `${url.protocol}//${url.host}/api/${projectId}/envelope/?sentry_key=${publicKey}&sentry_version=7`,
    };
  } catch {
    return null;
  }
}

export function buildEnvelope(dsn: string, opts: { functionName: string; message: string; stack?: string; extra?: Record<string, unknown> }): string {
  const eventId = crypto.randomUUID().replace(/-/g, '');
  const event = {
    event_id: eventId,
    timestamp: Math.floor(Date.now() / 1000),
    platform: 'other',
    level: 'error',
    // @ts-ignore Deno global is available in the Supabase Edge Function runtime
    environment: Deno.env.get('SENTRY_ENVIRONMENT') || 'production',
    tags: { function: opts.functionName },
    extra: { ...opts.extra, stack: opts.stack },
    exception: { values: [{ type: 'Error', value: opts.message }] },
  };
  return [
    JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString(), dsn }),
    JSON.stringify({ type: 'event' }),
    JSON.stringify(event),
  ].join('\n');
}

export async function reportError(err: unknown, opts: { functionName: string; extra?: Record<string, unknown> }): Promise<void> {
  const message = String((err as Error)?.message ?? err);
  const stack = (err as Error)?.stack;

  // @ts-ignore Deno global is available in the Supabase Edge Function runtime
  const dsn = Deno.env.get('SENTRY_DSN');
  if (!dsn) {
    console.error(`[sentry:${opts.functionName}] SENTRY_DSN not configured, error not reported:`, message);
    return;
  }
  const parsed = parseDsn(dsn);
  if (!parsed) {
    console.error(`[sentry:${opts.functionName}] SENTRY_DSN is malformed, error not reported:`, message);
    return;
  }

  const envelope = buildEnvelope(dsn, { functionName: opts.functionName, message, stack, extra: opts.extra });

  try {
    const res = await fetch(parsed.ingestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body: envelope,
    });
    if (!res.ok) {
      console.error(`[sentry:${opts.functionName}] ingest returned ${res.status}, error not confirmed reported:`, message);
    }
  } catch (reportErr) {
    console.error(`[sentry:${opts.functionName}] failed to report to Sentry:`, String((reportErr as Error)?.message ?? reportErr), '| original error:', message);
  }
}
