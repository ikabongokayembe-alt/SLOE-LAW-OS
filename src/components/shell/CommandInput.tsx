import { useState, useEffect, useRef } from 'react';

// These rotate in the global ⌘K field, so they sit at the top of every
// screen in the product — which made the previous set the single most
// visible thing wrong with the app: real-estate copy inherited from a
// sibling Sloe product ("Marassi leads", "Which properties match the
// Saudi family looking in Amwaj?", "conversion rate on Russian investor
// leads"). A prospective firm read "leads" and "properties" above their
// own caseload. Replaced with questions this product can actually
// answer, phrased the way a practising attorney would ask them.
const placeholders = [
  "Which matters have a filing deadline in the next 14 days?",
  "Has anyone at this firm ever acted against Marcus Chen?",
  "Draft a client update for the Chen custody matter",
  "What should I prioritise before Friday's hearing?"
];

export function CommandInput() {
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % placeholders.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleCmdK = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleCmdK);
    return () => window.removeEventListener('keydown', handleCmdK);
  }, []);

  return (
    <div className="relative w-full max-w-[640px]">
      <input
        ref={inputRef}
        type="text"
        className="w-full h-9 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-md px-3 text-sm text-[var(--text-primary)] placeholder:text-transparent focus:outline-none focus:border-[var(--border-strong)] transition-colors"
      />
      
      {/* Ghost text overlay to allow styling the placeholder */}
      <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none w-[calc(100%-80px)] overflow-hidden">
        <span className="italic text-[var(--text-tertiary)] text-sm truncate opacity-60">
          {!inputRef.current?.value ? placeholders[index] : ''}
        </span>
      </div>

      <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none">
        <kbd className="px-1.5 py-0.5 text-[10px] uppercase font-mono bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded text-[var(--text-tertiary)]">
          ⌘K
        </kbd>
      </div>
    </div>
  );
}
