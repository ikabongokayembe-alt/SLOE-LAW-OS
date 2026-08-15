import { useEffect, useMemo, useState } from 'react';
import { MessageSquarePlus, Search, X, Trash2, Pencil, Check } from 'lucide-react';
import { OperatorConversation } from '../../types';
import {
  AgentKey, ConversationSearchHit, listConversations, searchConversations,
  renameConversation, softDeleteConversation,
} from '../../lib/conversations';

// The conversation rail shared by Operator and Analyst.
//
// Shape borrowed from the Sloe Laboratory reference (unread/read split,
// search, per-thread unread state) but the unit is a THREAD PER
// QUESTION OR MATTER, not a daily briefing. A daily-briefing inbox
// assumes the useful grouping is "what happened today", which is true
// for a feed of alerts and false for legal work: an attorney comes back
// to the Chen custody deadline question three days later and wants that
// thread, not Tuesday. So threads are titled from their first message
// and sorted by recency of activity rather than bucketed by day.

interface Props {
  agent: AgentKey;
  activeId: string | null;
  onSelect: (c: OperatorConversation) => void;
  onNew: () => void;
  // Bumped by the parent whenever it writes a message, so the rail
  // refetches instead of holding a list that no longer matches the
  // database. Cheaper and less error-prone than threading a callback
  // through every write path.
  refreshKey: number;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function ConversationInbox({ agent, activeId, onSelect, onNew, refreshKey }: Props) {
  const [conversations, setConversations] = useState<OperatorConversation[]>([]);
  const [tab, setTab] = useState<'unread' | 'all'>('all');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ConversationSearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');

  useEffect(() => {
    let cancelled = false;
    listConversations(agent)
      .then(rows => { if (!cancelled) { setConversations(rows); setLoadError(null); } })
      .catch(() => {
        // Deliberately not the raw exception: this surfaced as
        // "TypeError: Failed to fetch" in the rail, which tells a
        // practising attorney nothing and looks like a crash.
        if (!cancelled) setLoadError("Couldn't load your conversations.");
      });
    return () => { cancelled = true; };
  }, [agent, refreshKey]);

  // Debounced so typing doesn't fire a query per keystroke against two
  // indexes. `cancelled` guards the late-response case where a slow
  // early query would otherwise overwrite the results of a later one.
  useEffect(() => {
    const q = query.trim();
    if (!q) { setHits(null); setSearching(false); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      searchConversations(agent, q)
        .then(r => { if (!cancelled) setHits(r); })
        .catch(() => { if (!cancelled) setHits([]); })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, agent, refreshKey]);

  const unreadCount = useMemo(() => conversations.filter(c => c.unread).length, [conversations]);

  const visible: ConversationSearchHit[] = useMemo(() => {
    // Search overrides the tab filter rather than intersecting with it.
    // Searching inside "unread only" and getting nothing back, when the
    // thread plainly exists, reads as broken search.
    if (hits) return hits;
    const list = tab === 'unread' ? conversations.filter(c => c.unread) : conversations;
    return list.map(c => ({ conversation: c }));
  }, [hits, conversations, tab]);

  const commitRename = async (id: string) => {
    const text = renameText;
    setRenamingId(null);
    if (!text.trim()) return;
    setConversations(prev => prev.map(c => (c.id === id ? { ...c, title: text.trim() } : c)));
    try { await renameConversation(id, text); } catch { /* refetch below corrects it */ }
    listConversations(agent).then(setConversations).catch(() => {});
  };

  const remove = async (id: string) => {
    setConversations(prev => prev.filter(c => c.id !== id));
    try { await softDeleteConversation(id); } catch { /* refetch corrects it */ }
    listConversations(agent).then(setConversations).catch(() => {});
  };

  return (
    <div className="w-full lg:w-72 shrink-0 flex flex-col border-b lg:border-b-0 lg:border-r border-[var(--border-subtle)] bg-[var(--bg-secondary)] min-h-0">
      <div className="p-3 space-y-3 shrink-0">
        <button
          onClick={onNew}
          className="w-full h-9 flex items-center justify-center gap-2 text-xs font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded-lg hover:opacity-90 transition-opacity"
        >
          <MessageSquarePlus className="w-4 h-4" /> New conversation
        </button>

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search conversations"
            aria-label="Search conversations"
            className="w-full h-8 pl-8 pr-7 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-xs focus:outline-none focus:border-[var(--border-strong)]"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1" role="tablist">
          {(['all', 'unread'] as const).map(t => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              disabled={!!hits}
              className={`flex-1 h-7 text-[11px] uppercase tracking-wider font-mono rounded transition-colors disabled:opacity-40 ${
                tab === t
                  ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {t === 'all' ? 'All' : 'Unread'}
              {t === 'unread' && unreadCount > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-[var(--accent-primary)] text-[var(--bg-primary)] text-[10px] font-semibold">
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
        {loadError && (
          <div className="text-xs text-[var(--signal-warning)] px-2 py-3">{loadError}</div>
        )}
        {searching && <div className="text-xs text-[var(--text-tertiary)] px-2 py-3">Searching…</div>}

        {!searching && !loadError && visible.length === 0 && (
          <div className="text-xs text-[var(--text-tertiary)] px-2 py-3">
            {hits
              ? 'Nothing matches that.'
              : tab === 'unread'
                ? 'Nothing unread.'
                : 'No conversations yet — start one above.'}
          </div>
        )}

        {visible.map(({ conversation: c, snippet }) => {
          const isActive = c.id === activeId;
          return (
            <div
              key={c.id}
              className={`group rounded-lg mb-1 transition-colors ${
                isActive ? 'bg-[var(--bg-elevated)]' : 'hover:bg-[var(--bg-tertiary)]'
              }`}
            >
              {renamingId === c.id ? (
                <div className="flex items-center gap-1 p-2">
                  <input
                    autoFocus
                    value={renameText}
                    onChange={e => setRenameText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitRename(c.id);
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    aria-label="Conversation title"
                    className="flex-1 min-w-0 h-7 px-2 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded text-xs focus:outline-none"
                  />
                  <button onClick={() => commitRename(c.id)} aria-label="Save title" className="text-[var(--signal-positive)] shrink-0">
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button onClick={() => onSelect(c)} className="w-full text-left p-2">
                  <span className="flex items-start gap-2">
                    {/* Unread is carried by a dot AND by weight, not colour
                        alone — the dot is the only always-visible cue for
                        anyone who can't distinguish it by hue. */}
                    <span
                      aria-hidden
                      className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                        c.unread ? 'bg-[var(--accent-primary)]' : 'bg-transparent'
                      }`}
                    />
                    <span className="flex-1 min-w-0">
                      <span
                        className={`block text-xs truncate ${
                          c.unread ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                        }`}
                      >
                        {c.title}
                        {c.unread && <span className="sr-only"> (unread)</span>}
                      </span>
                      {snippet && (
                        <span className="block text-[11px] text-[var(--text-tertiary)] truncate mt-0.5">{snippet}</span>
                      )}
                      <span className="block text-[10px] text-[var(--text-tertiary)] mt-0.5">
                        {relativeTime(c.last_message_at)}
                      </span>
                    </span>
                  </span>
                </button>
              )}

              {renamingId !== c.id && (
                <div className="hidden group-hover:flex items-center gap-1 px-2 pb-2">
                  <button
                    onClick={() => { setRenamingId(c.id); setRenameText(c.title); }}
                    className="text-[10px] flex items-center gap-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                  >
                    <Pencil className="w-3 h-3" /> Rename
                  </button>
                  <button
                    onClick={() => remove(c.id)}
                    className="text-[10px] flex items-center gap-1 text-[var(--text-tertiary)] hover:text-[var(--signal-negative)]"
                  >
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
