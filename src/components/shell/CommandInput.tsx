import { useState, useEffect, useRef } from 'react';

const placeholders = [
  "Show me all Marassi leads I haven't followed up with in 48 hours",
  "Which properties match the Saudi family looking in Amwaj?",
  "What's my conversion rate on Russian investor leads this quarter?",
  "Draft a follow-up in Arabic for my highest-urgency lead"
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
