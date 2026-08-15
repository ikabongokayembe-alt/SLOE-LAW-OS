import { ShieldAlert } from 'lucide-react';

// Persistent, non-dismissible reminder that AI output (Operator drafts,
// Analyst chat, generated insights) needs attorney review before anyone
// relies on it as legal advice. The Operator/Analyst system prompts
// already say this internally (see lib/prompts.ts) — this makes that
// instruction visible to the person actually reading the output, not
// just to the model.
export function AiDisclaimer({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-1.5 text-[11px] text-[var(--text-tertiary)] ${className}`}>
      <ShieldAlert className="w-3 h-3 shrink-0" />
      <span>AI-assisted — review before relying on this for legal advice.</span>
    </div>
  );
}
