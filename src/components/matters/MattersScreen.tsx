import { useState } from 'react';
import { useStore } from '../../lib/store';
import { NewMatterModal } from './NewMatterModal';
import { AlertTriangle, Plus } from 'lucide-react';

export function MattersScreen() {
  const { matters, matterStages, attorneys, parties } = useStore();
  const [showNew, setShowNew] = useState(false);

  const stages = [...matterStages].sort((a, b) => a.sort_order - b.sort_order);
  const attorneyName = (id: string | null) => attorneys.find(a => a.id === id)?.name ?? 'Unassigned';
  const clientName = (id: string | null) => parties.find(p => p.id === id)?.name ?? '—';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-medium">Matters</h2>
          <p className="text-sm text-[var(--text-secondary)]">Your firm's active caseload, by stage.</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="h-9 px-4 flex items-center gap-1.5 text-sm font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" /> New Matter
        </button>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map(stage => {
          const stageMatters = matters.filter(m => m.stage_id === stage.id);
          return (
            <div key={stage.id} className="flex-shrink-0 w-72">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-xs font-mono uppercase tracking-wider text-[var(--text-tertiary)]">{stage.label}</span>
                <span className="text-xs text-[var(--text-tertiary)]">{stageMatters.length}</span>
              </div>
              <div className="space-y-2">
                {stageMatters.length === 0 ? (
                  <div className="text-xs text-[var(--text-tertiary)] italic px-1 py-3">No matters here.</div>
                ) : (
                  stageMatters.map(m => (
                    <div key={m.id} className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-3">
                      <div className="text-sm font-medium mb-1">{m.title}</div>
                      <div className="text-xs text-[var(--text-tertiary)] mb-2">{clientName(m.client_party_id)}</div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--text-secondary)]">{attorneyName(m.assigned_attorney_id)}</span>
                        {stage.is_initial && !m.conflict_check_id && (
                          <span className="flex items-center gap-1 text-[10px] text-[var(--signal-warning)]">
                            <AlertTriangle className="w-3 h-3" /> No conflict check
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showNew && <NewMatterModal onClose={() => setShowNew(false)} />}
    </div>
  );
}
