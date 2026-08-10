import { useStore } from '../../lib/store';

export function ContextPanel({ activeTab, hasInteracted }: { activeTab: string, hasInteracted: boolean }) {
  const { matters, deadlines, parties } = useStore();
  const activeMatters = matters.filter(m => m.status === 'active').length;
  const closedMatters = matters.filter(m => m.status === 'closed').length;

  return (
    <div className="w-[35%] bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-6 overflow-y-auto">
      <h3 className="text-xs uppercase font-mono tracking-widest text-[var(--text-tertiary)] mb-6">Context in use</h3>

      <div className="space-y-4">
        <div className="bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded px-4 py-3">
           <div className="text-[10px] font-mono text-[var(--text-tertiary)] mb-1">DATA SOURCE</div>
           <div className="text-sm">Analyzing {activeMatters} active matter{activeMatters === 1 ? '' : 's'}, {closedMatters} closed, {deadlines.length} tracked deadline{deadlines.length === 1 ? '' : 's'}, {parties.length} part{parties.length === 1 ? 'y' : 'ies'} on file</div>
        </div>

        <div className="bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded px-4 py-3">
           <div className="text-[10px] font-mono text-[var(--text-tertiary)] mb-1">FILTER</div>
           <div className="flex flex-wrap gap-2 mt-2">
             <span className="px-2 py-0.5 bg-[var(--bg-elevated)] rounded border border-[var(--border-subtle)] text-xs font-mono">Scope: {activeTab}</span>
           </div>
        </div>

        {!hasInteracted && (
          <div className="text-xs text-[var(--text-tertiary)] italic">
            Ask the Analyst something — references it cites will show up here.
          </div>
        )}
      </div>
   </div>
  );
}
