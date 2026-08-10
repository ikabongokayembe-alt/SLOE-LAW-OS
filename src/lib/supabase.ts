import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// True once real Supabase credentials are set (see .env.example / RUNBOOK.md).
// Until then, the app runs in local dev-data mode (see lib/store.tsx).
export const isSupabaseConfigured = !!url && !!anonKey;

if (!isSupabaseConfigured) {
  // eslint-disable-next-line no-console
  console.info('[supabase] Not configured — running in local dev-data mode. See RUNBOOK.md to wire a real backend.');
}

// Falls back to harmless placeholder values so createClient doesn't throw
// when unconfigured; nothing calls this client unless isSupabaseConfigured.
export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder-anon-key');

// Single demo tenant for now. When we add auth, read this from session.
export const DEMO_TENANT_ID = 'd38d8ca3-720b-4a9c-b4b1-095cca0f43b3';
