import { useState } from 'react';
import { useStore } from '../../lib/store';
import { Search, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { ConflictCheck } from '../../types';
import { ConflictCheckDetailPanel } from './ConflictCheckDetail';

export function PartiesScreen() {
  const { parties, matters, matterParties, partyRelationships, conflictChecks, runConflictCheck } = useStore();
  const [query, setQuery] = useState('');
  const [checking, setChecking] = useState(false);
  const [lastCheckId, setLastCheckId] = useState<string | null>(null);
  // Single piece of state drives the shared detail panel whether it opened
  // from the just-run result or from clicking a past Recent Checks row --
  // one pattern, not two. Set to the check's own id right after a search
  // completes, so "the result" IS a Recent Checks row from the start, not
  // a separate thing that gets thrown away on the next search.
  const [openCheckId, setOpenCheckId] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setChecking(true);
    const cc = await runConflictCheck(query.trim(), null);
    setChecking(false);
    if (cc) { setLastCheckId(cc.id); setOpenCheckId(cc.id); }
  };

  const recentChecks = [...conflictChecks].slice(0, 10);
  const openCheck: ConflictCheck | null = conflictChecks.find(c => c.id === openCheckId) ?? null;
  const lastCheck: ConflictCheck | null = conflictChecks.find(c => c.id === lastCheckId) ?? null;

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-medium mb-1">Conflict Check</h2>
      <p className="text-sm text-[var(--text-secondary)] mb-6">
        Search every party ever entered at this firm — clients, opposing parties, witnesses — before taking on new work.
      </p>

      <div className="flex gap-2 mb-6">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="Full name or organization"
          className="flex-1 h-10 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none"
        />
        <button
          onClick={handleSearch}
          disabled={!query.trim() || checking}
          className="h-10 px-4 flex items-center gap-1.5 text-sm font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          <Search className="w-4 h-4" /> {checking ? 'Checking…' : 'Search'}
        </button>
      </div>

      {lastCheck && (
        <button
          onClick={() => setOpenCheckId(lastCheck.id)}
          className={`w-full text-left mb-6 p-4 rounded-lg border transition-colors hover:border-[var(--border-strong)] ${lastCheck.status === 'flagged' ? 'border-[var(--signal-warning)]/40 bg-[var(--signal-warning)]/5' : 'border-[var(--signal-positive)]/40 bg-[var(--signal-positive)]/5'}`}
        >
          {lastCheck.status === 'flagged' ? (
            <div className="flex items-center gap-2 text-sm text-[var(--signal-warning)]">
              <AlertTriangle className="w-4 h-4" /> {lastCheck.signals?.length ?? lastCheck.matched_party_ids.length} potential match{(lastCheck.signals?.length ?? lastCheck.matched_party_ids.length) === 1 ? '' : 'es'} found — click for the full result
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-[var(--signal-positive)]">
              <CheckCircle2 className="w-4 h-4" /> No conflicts found.
            </div>
          )}
        </button>
      )}

      <div className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] mb-3">Recent checks</div>
      {recentChecks.length === 0 ? (
        <div className="text-xs text-[var(--text-tertiary)]">No conflict checks run yet.</div>
      ) : (
        <div className="space-y-1.5">
          {recentChecks.map(c => (
            <button
              key={c.id}
              onClick={() => setOpenCheckId(c.id)}
              className="w-full flex items-center justify-between text-sm bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-left hover:border-[var(--border-strong)] transition-colors"
            >
              <span className="truncate">{c.searched_name}</span>
              <span className={`text-xs capitalize shrink-0 ml-2 ${c.status === 'flagged' ? 'text-[var(--signal-warning)]' : c.status === 'cleared' || c.status === 'waived' ? 'text-[var(--signal-positive)]' : 'text-[var(--text-tertiary)]'}`}>{c.status}</span>
            </button>
          ))}
        </div>
      )}

      {openCheck && (
        <ConflictCheckDetailPanel
          check={openCheck}
          parties={parties}
          matters={matters}
          matterParties={matterParties}
          partyRelationships={partyRelationships}
          onClose={() => setOpenCheckId(null)}
        />
      )}
    </div>
  );
}
