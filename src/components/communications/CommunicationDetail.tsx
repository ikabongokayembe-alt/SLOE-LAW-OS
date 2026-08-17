import { Mail } from 'lucide-react';
import { MatterCommunication } from '../../types';
import { DetailPanel, DetailSection } from '../shared/DetailPanel';

// Communications' log rows truncate the body to two lines
// (line-clamp-2) so the list stays scannable -- this is where the rest
// of it actually lives. Read-only: the send action already has its own
// entry point (SendEmailModal), this just shows what was actually sent.
export function CommunicationDetailPanel({
  comm, matterTitle, onReply, onClose,
}: {
  comm: MatterCommunication;
  matterTitle: string;
  onReply: () => void;
  onClose: () => void;
}) {
  return (
    <DetailPanel title={comm.subject} subtitle={matterTitle} onClose={onClose}>
      <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <Mail className="w-4 h-4 text-[var(--text-tertiary)] shrink-0" />
        <span className="truncate">to {comm.sent_to}</span>
      </div>

      <DetailSection title="Sent">
        <div className="text-sm">{new Date(comm.sent_at).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
      </DetailSection>

      <DetailSection title="Message">
        <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">{comm.body}</p>
      </DetailSection>

      <button
        onClick={onReply}
        className="h-9 px-4 text-sm font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded hover:opacity-90 transition-opacity"
      >
        Reply
      </button>
    </DetailPanel>
  );
}
