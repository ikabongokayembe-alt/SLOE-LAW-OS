import { useState } from 'react';
import { useStore } from '../../lib/store';
import { useAuth } from '../../lib/auth';
import { supabase, DEMO_TENANT_ID } from '../../lib/supabase';

export function DemoBanner() {
  const { refresh } = useStore();
  const { profile, isDevMode } = useAuth();
  const [resetting, setResetting] = useState(false);

  // Only the actual seeded demo tenant should ever see this banner and
  // the reset button — a real firm's data must never look resettable
  // or "shared" to the person using it. isDevMode (local dev-data preview,
  // no backend) also always counts as the demo tenant.
  const isDemoTenant = isDevMode || profile?.firm_id === DEMO_TENANT_ID;
  if (!isDemoTenant) return null;

  const handleReset = async () => {
    const ok = confirm('Reset demo data to its seeded state? This will undo any edits, stage changes, or messages.');
    if (!ok) return;
    setResetting(true);
    try {
      // Call the reset Edge Function (admin-only in future; demo-open now).
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reset-demo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ tenant_id: DEMO_TENANT_ID }),
      });
      if (!res.ok) throw new Error(`reset failed ${res.status}`);
      await refresh();
    } catch (e: any) {
      alert(`Reset failed: ${e?.message ?? 'unknown'}`);
    } finally {
      setResetting(false);
    }
  };

  // Reference supabase to silence TS; we may expand the banner later.
  void supabase;

  return (
    <div className="flex items-center justify-between px-4 h-8 bg-[var(--accent-primary)]/10 border-b border-[var(--accent-primary)]/30 text-[11px] font-mono tracking-wider text-[var(--accent-primary)]">
      <div className="flex items-center gap-3">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-pulse"></span>
        <span>DEMO ENVIRONMENT · Data is shared and resets daily 03:00 UTC · Not your production data</span>
      </div>
      <button
        onClick={handleReset}
        disabled={resetting}
        className="px-2 py-0.5 rounded border border-[var(--accent-primary)]/40 hover:bg-[var(--accent-primary)]/20 disabled:opacity-50"
      >
        {resetting ? 'Resetting…' : 'Reset now'}
      </button>
    </div>
  );
}
