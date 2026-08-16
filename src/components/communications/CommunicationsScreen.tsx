import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../../lib/store';
import { Mail, Plus } from 'lucide-react';
import { SendEmailModal } from './SendEmailModal';
import { findStaleContacts, draftFollowUp } from '../../lib/riskSignals';

// Foundation of "client communication isn't captured anywhere" from the
// original audit: sending and logging only in this pass — no inbox
// reading, no thread matching. Same top-level-screen-with-matter-filter
// convention as Documents/Time (there's no per-matter detail page in this
// codebase to nest a tab into).
export function CommunicationsScreen() {
  const { communications, matters, integrationConnections, parties } = useStore();
  const [matterFilter, setMatterFilter] = useState('all');
  const [showSend, setShowSend] = useState(false);
  const [draftFor, setDraftFor] = useState<{ matterId: string; subject: string; body: string } | null>(null);

  const matterTitle = (id: string) => matters.find(m => m.id === id)?.title ?? '—';
  const gmailConnected = integrationConnections?.some(c => c.toolkit_slug === 'gmail' && c.status === 'ACTIVE') ?? null;

  const filtered = useMemo(() => {
    return communications
      .filter(c => matterFilter === 'all' || c.matter_id === matterFilter)
      .sort((a, b) => b.sent_at.localeCompare(a.sent_at));
  }, [communications, matterFilter]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl font-medium">Communications</h2>
          <p className="text-sm text-[var(--text-secondary)]">Email sent to clients through your connected Gmail, logged against the matter.</p>
        </div>
        <button
          onClick={() => setShowSend(true)}
          className="h-9 px-4 flex items-center gap-1.5 text-sm font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded hover:opacity-90 transition-opacity shrink-0"
        >
          <Plus className="w-4 h-4" /> Send Email
        </button>
      </div>

      {gmailConnected === false && (
        <div className="mb-4 p-3 rounded-lg border border-[var(--signal-warning)]/40 bg-[var(--signal-warning)]/5 text-sm text-[var(--text-secondary)]">
          Gmail isn't connected for this firm — <Link to="/integrations" className="text-[var(--accent-secondary)] hover:underline">connect it from Integrations</Link> to send and log email from a matter.
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="text-[10px] uppercase font-mono tracking-wider text-[var(--text-tertiary)] block mb-1">Matter</label>
          <select value={matterFilter} onChange={e => setMatterFilter(e.target.value)} className="h-9 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none w-full sm:w-56">
            <option value="all">All matters</option>
            {matters.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-sm text-[var(--text-tertiary)] py-8 text-center">No email logged yet.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => (
            <div key={c.id} className="flex items-start gap-3 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
              <Mail className="w-4 h-4 text-[var(--text-tertiary)] shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{c.subject}</span>
                </div>
                <div className="text-xs text-[var(--text-tertiary)] truncate">
                  {matterTitle(c.matter_id)} · to {c.sent_to} · {new Date(c.sent_at).toLocaleString()}
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-1.5 line-clamp-2">{c.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {(() => {
        // Absence detection: an active matter with no logged contact for
        // three weeks. The draft is deterministic, not model-written --
        // see draftFollowUp for why a generated check-in is the one place
        // a model could quietly assert something about the matter.
        const stale = findStaleContacts(matters, communications).slice(0, 3);
        if (stale.length === 0) return null;
        return (
          <div className="mb-4 space-y-2">
            {stale.map(s2 => {
              const m2 = s2.matter;
              const client = parties.find(p => p.id === m2.client_party_id)?.name ?? null;
              return (
                <div key={m2.id} className="flex flex-col sm:flex-row sm:items-center gap-2 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{m2.title}</div>
                    <div className="text-xs text-[var(--text-tertiary)]">{s2.detail}</div>
                  </div>
                  <button
                    onClick={() => setDraftFor({ matterId: m2.id, ...draftFollowUp(m2.title, client, s2.daysSilent) })}
                    className="h-8 px-3 text-xs font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded shrink-0"
                  >
                    Draft follow-up
                  </button>
                </div>
              );
            })}
          </div>
        );
      })()}
      {showSend && <SendEmailModal onClose={() => setShowSend(false)} defaultMatterId={matterFilter !== 'all' ? matterFilter : undefined} />}
      {draftFor && <SendEmailModal onClose={() => setDraftFor(null)} defaultMatterId={draftFor.matterId} defaultSubject={draftFor.subject} defaultBody={draftFor.body} />}
    </div>
  );
}
