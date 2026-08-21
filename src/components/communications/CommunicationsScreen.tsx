import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../../lib/store';
import { Mail, Plus, Wrench } from 'lucide-react';
import { SendEmailModal } from './SendEmailModal';
import { CommunicationDetailPanel } from './CommunicationDetail';
import { findStaleContacts } from '../../lib/riskSignals';
import { MatterCommunication } from '../../types';

// Foundation of "client communication isn't captured anywhere" from the
// original audit: sending and logging only in this pass — no inbox
// reading, no thread matching. Same top-level-screen-with-matter-filter
// convention as Documents/Time (there's no per-matter detail page in this
// codebase to nest a tab into).
export function CommunicationsScreen() {
  const { communications, matters, integrationConnections, parties } = useStore();
  const navigate = useNavigate();
  const [matterFilter, setMatterFilter] = useState('all');
  const [showSend, setShowSend] = useState(false);
  const [draftFor, setDraftFor] = useState<{ matterId: string; subject: string; body: string } | null>(null);
  const [selectedComm, setSelectedComm] = useState<MatterCommunication | null>(null);
  const [replyFor, setReplyFor] = useState<{ matterId: string; to: string; subject: string } | null>(null);

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

      {(() => {
        // Absence detection: an active matter with no logged contact for
        // three weeks. Routed through the Operator agent with pre-filled context.
        const stale = findStaleContacts(matters, communications).slice(0, 3);
        if (stale.length === 0) return null;
        return (
          <div className="mb-4 space-y-2">
            {stale.map(s2 => {
              const m2 = s2.matter;
              const client = parties.find(p => p.id === m2.client_party_id)?.name ?? null;
              const prompt = `Draft a follow-up email for matter "${m2.title}" to ${client ?? 'the client'}. No client contact has been logged for ${s2.daysSilent} days.`;
              return (
                <div key={m2.id} className="flex flex-col sm:flex-row sm:items-center gap-2 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{m2.title}</div>
                    <div className="text-xs text-[var(--text-tertiary)]">{s2.detail}</div>
                  </div>
                  <button
                    onClick={() => navigate(`/operator?q=${encodeURIComponent(prompt)}`)}
                    className="h-8 px-3 text-xs font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded shrink-0 flex items-center gap-1.5 hover:opacity-90 transition-opacity"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    <span>Draft follow-up with Operator</span>
                  </button>
                </div>
              );
            })}
          </div>
        );
      })()}

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
            <div
              key={c.id}
              onClick={() => setSelectedComm(c)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && setSelectedComm(c)}
              className="flex items-start gap-3 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] cursor-pointer hover:border-[var(--border-strong)] transition-colors"
            >
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

      {showSend && <SendEmailModal onClose={() => setShowSend(false)} defaultMatterId={matterFilter !== 'all' ? matterFilter : undefined} />}
      {draftFor && <SendEmailModal onClose={() => setDraftFor(null)} defaultMatterId={draftFor.matterId} defaultSubject={draftFor.subject} defaultBody={draftFor.body} />}
      {replyFor && (
        <SendEmailModal
          onClose={() => setReplyFor(null)}
          defaultMatterId={replyFor.matterId}
          defaultTo={replyFor.to}
          defaultSubject={replyFor.subject}
        />
      )}
      {selectedComm && (
        <CommunicationDetailPanel
          comm={selectedComm}
          matterTitle={matterTitle(selectedComm.matter_id)}
          onReply={() => {
            setReplyFor({ matterId: selectedComm.matter_id, to: selectedComm.sent_to, subject: selectedComm.subject.startsWith('Re: ') ? selectedComm.subject : `Re: ${selectedComm.subject}` });
            setSelectedComm(null);
          }}
          onClose={() => setSelectedComm(null)}
        />
      )}
    </div>
  );
}
