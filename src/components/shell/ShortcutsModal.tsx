export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div 
        className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl shadow-[var(--shadow-elevated)] w-full max-w-md overflow-hidden" 
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <h2 className="font-medium">Keyboard Shortcuts</h2>
          <button className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]" onClick={onClose}>esc</button>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            <ShortcutRow label="Focus command input" keys={['⌘', 'K']} />
            <ShortcutRow label="Command Center" keys={['⌘', '1']} />
            <ShortcutRow label="Matters" keys={['⌘', '2']} />
            <ShortcutRow label="Leads" keys={['⌘', '3']} />
            <ShortcutRow label="Conversations" keys={['⌘', '4']} />
            <ShortcutRow label="Viewings" keys={['⌘', '5']} />
            <ShortcutRow label="Campaigns" keys={['⌘', '6']} />
            <ShortcutRow label="Market Intelligence" keys={['⌘', '7']} />
            <ShortcutRow label="Analyst" keys={['⌘', '8']} />
            <ShortcutRow label="Operator" keys={['⌘', '9']} />
            <ShortcutRow label="Keyboard Shortcuts" keys={['⌘', '/']} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ShortcutRow({ label, keys }: { label: string, keys: string[] }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-[var(--text-secondary)]">{label}</span>
      <div className="flex items-center space-x-1">
        {keys.map((k, i) => (
          <kbd key={i} className="px-2 py-1 text-[11px] font-mono bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded text-[var(--text-primary)] min-w-[24px] text-center">
            {k}
          </kbd>
        ))}
      </div>
    </div>
  );
}
