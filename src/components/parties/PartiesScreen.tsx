import { useState } from 'react';
import { useStore } from '../../lib/store';
import { Search, AlertTriangle, CheckCircle2 } from 'lucide-react';

export function PartiesScreen() {
  const { parties, conflictChecks, runConflictCheck } = useStore();
  const [query, setQuery] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ status: string; matches: string[] } | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setChecking(true);
    setResult(null);
    const cc = await runConflictCheck(query.trim(), null);
    setChecking(false);
    if (cc) {
      setResult({
        status: cc.status,
        matches: cc.matched_party_ids.map(id => parties.find(p => p.id === id)?.name ?? 'Unknown'),
      });
    }
  };

  const recentChecks = [...conflictChecks].slice(0, 10);

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

      {result && (
        <div className={`mb-6 p-4 rounded-lg border ${result.status === 'flagged' ? 'border-[var(--signal-warning)]/40 bg-[var(--signal-warning)]/5' : 'border-[var(--signal-positive)]/40 bg-[var(--signal-positive)]/5'}`}>
          {result.status === 'flagged' ? (
            <>
              <div className="flex items-center gap-2 text-sm text-[var(--signal-warning)] mb-2">
                <AlertTriangle className="w-4 h-4" /> {result.matches.length} potential match{result.matches.length === 1 ? '' : 'es'} found
              </div>
              {result.matches.map((m, i) => (
                <div key={i} className="text-xs text-[var(--text-secondary)] bg-[var(--bg-tertiary)] rounded px-2 py-1.5 mt-1">{m}</div>
              ))}
            </>
          ) : (
            <div className="flex items-center gap-2 text-sm text-[var(--signal-positive)]">
              <CheckCircle2 className="w-4 h-4" /> No conflicts found.
            </div>
          )}
        </div>
      )}

      <div className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] mb-3">Recent checks</div>
      {recentChecks.length === 0 ? (
        <div className="text-xs text-[var(--text-tertiary)]">No conflict checks run yet.</div>
      ) : (
        <div className="space-y-1.5">
          {recentChecks.map(c => (
            <div key={c.id} className="flex items-center justify-between text-sm bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg px-3 py-2">
              <span>{c.searched_name}</span>
              <span className={`text-xs capitalize ${c.status === 'flagged' ? 'text-[var(--signal-warning)]' : c.status === 'cleared' || c.status === 'waived' ? 'text-[var(--signal-positive)]' : 'text-[var(--text-tertiary)]'}`}>{c.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
