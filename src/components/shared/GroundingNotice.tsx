import { useState } from 'react';
import { Database, Info } from 'lucide-react';

export function GroundingNotice() {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)]">
      <Database className="w-3.5 h-3.5 shrink-0 text-[var(--text-tertiary)]" />
      <span>
        Every flag is computed from your firm's own stored records — never invented.
      </span>
      <div className="relative inline-flex items-center">
        <button
          type="button"
          onClick={() => setShowTooltip(v => !v)}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors p-0.5"
          title="Jurisdiction guidance note"
        >
          <Info className="w-3.5 h-3.5" />
        </button>

        {showTooltip && (
          <div className="absolute left-0 top-6 z-20 w-72 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg p-2.5 shadow-xl text-[11px] text-[var(--text-secondary)] leading-relaxed">
            Where a card adds commentary (marked <span className="font-medium text-[var(--text-primary)]">"General guidance"</span>), that framing isn't a verified rule for your jurisdiction, but the underlying trigger is always real.
          </div>
        )}
      </div>
    </div>
  );
}
