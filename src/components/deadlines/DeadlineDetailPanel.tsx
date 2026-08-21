import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../../lib/store';
import { useToast } from '../../lib/toast';
import { DetailPanel } from '../shared/DetailPanel';
import { assessDeadlineRisk } from '../../lib/riskSignals';
import { formatDateOnly, parseDateOnly } from '../../lib/dates';
import { Deadline } from '../../types';
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  CalendarPlus,
  CalendarCheck2,
  FileText,
  Wrench,
  ExternalLink,
  Timer,
} from 'lucide-react';
import { LogTimeModal } from '../time/LogTimeModal';

const TYPE_LABELS: Record<string, string> = {
  statute_of_limitations: 'Statute of Limitations',
  filing: 'Filing',
  court_date: 'Court Date',
  other: 'Other',
};

function daysUntil(dateOnlyString: string): number {
  const diff = parseDateOnly(dateOnlyString).getTime() - new Date().setHours(0, 0, 0, 0);
  return Math.round(diff / 86400000);
}

interface DeadlineDetailPanelProps {
  deadline: Deadline;
  onClose: () => void;
}

export function DeadlineDetailPanel({ deadline, onClose }: DeadlineDetailPanelProps) {
  const {
    matters,
    deadlines,
    documents,
    timeEntries,
    firm,
    integrationConnections,
    pushDeadlineToCalendar,
    updateDeadline,
  } = useStore();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const locale = firm?.locale || 'en-US';

  const [pushing, setPushing] = useState(false);
  const [logTimeModalOpen, setLogTimeModalOpen] = useState(false);

  const matter = matters.find((m) => m.id === deadline.matter_id);
  const days = daysUntil(deadline.due_date);
  const isOverdue = days < 0 && deadline.status === 'upcoming';
  const isCompleted = deadline.status === 'completed';

  const risk = assessDeadlineRisk(deadline, deadlines, timeEntries, documents);

  const linkedDocs = documents.filter((doc) => doc.matter_id === deadline.matter_id);
  const calendarConnected = integrationConnections?.some(
    (c) => c.toolkit_slug === 'googlecalendar' && c.status === 'ACTIVE'
  );

  const handlePush = async () => {
    setPushing(true);
    await pushDeadlineToCalendar(deadline.id);
    setPushing(false);
  };

  const handleMarkComplete = async () => {
    await updateDeadline(deadline.id, { status: 'completed' });
    showToast('success', `"${deadline.title}" marked done — removed from at-risk tracking.`);
  };

  const handleOperatorHandoff = () => {
    const statusStr = isCompleted
      ? 'completed'
      : isOverdue
      ? `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`
      : `${days} day${days === 1 ? '' : 's'} remaining`;

    const matterTitleStr = matter?.title || 'Unlinked Matter';
    const prompt = `Help me prepare for "${deadline.title}" on matter "${matterTitleStr}" — due ${deadline.due_date}, currently ${statusStr}.`;

    navigate(`/operator?q=${encodeURIComponent(prompt)}`);
  };

  return (
    <>
      <DetailPanel
        title={deadline.title}
        subtitle={`${TYPE_LABELS[deadline.deadline_type] || 'Deadline'} · Due ${formatDateOnly(deadline.due_date, locale, { day: 'numeric', month: 'short', year: 'numeric' })}`}
        onClose={onClose}
      >
        <div className="space-y-6">
          {/* Operator Action Banner */}
          <div className="bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <div className="p-2 bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] border border-[var(--accent-primary)]/20 rounded-lg shrink-0 mt-0.5">
                  <Wrench className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-[var(--text-primary)]">Need assistance with this deadline?</h3>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    Start a grounded Operator session with pre-filled matter details &amp; prep context.
                  </p>
                </div>
              </div>
            </div>
            <button
              onClick={handleOperatorHandoff}
              className="w-full h-8 bg-[var(--text-primary)] text-[var(--bg-primary)] hover:opacity-90 transition-opacity rounded text-xs font-medium flex items-center justify-center gap-1.5"
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>Get help from Operator</span>
            </button>
          </div>

          {/* Status & Urgency */}
          <div className="border border-[var(--border-subtle)] bg-[var(--bg-primary)] rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--text-tertiary)] uppercase font-mono tracking-wider">Status &amp; Schedule</span>
              <span
                className={`px-2 py-0.5 rounded-full font-medium text-[11px] border ${
                  isCompleted
                    ? 'bg-[var(--signal-positive)]/10 text-[var(--signal-positive)] border-[var(--signal-positive)]/30'
                    : isOverdue
                    ? 'bg-[var(--signal-negative)]/10 text-[var(--signal-negative)] border-[var(--signal-negative)]/30'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                }`}
              >
                {isCompleted ? 'COMPLETED' : isOverdue ? `${Math.abs(days)}d OVERDUE` : `${days}d AWAY`}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs pt-1">
              <div>
                <span className="text-[var(--text-tertiary)] block">Due Date</span>
                <span className="font-mono text-[var(--text-primary)] font-medium">
                  {formatDateOnly(deadline.due_date, locale, { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
              <div>
                <span className="text-[var(--text-tertiary)] block">Category</span>
                <span className="text-[var(--text-primary)] font-medium">
                  {TYPE_LABELS[deadline.deadline_type] || deadline.deadline_type}
                </span>
              </div>
            </div>

            {/* Risk / Watch reasoning */}
            {risk.level !== 'none' && (
              <div
                className={`p-3 rounded border text-xs ${
                  risk.level === 'at_risk'
                    ? 'bg-[var(--signal-negative)]/5 border-[var(--signal-negative)]/30 text-[var(--signal-negative)]'
                    : 'bg-[var(--signal-warning)]/5 border-[var(--signal-warning)]/30 text-[var(--signal-warning)]'
                }`}
              >
                <div className="flex items-center gap-1.5 font-medium mb-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span className="uppercase font-mono tracking-wider">
                    {risk.level === 'at_risk' ? 'At Risk Signal' : 'Watch Signal'}
                  </span>
                </div>
                <p className="text-[var(--text-secondary)] leading-relaxed">{risk.reasons.join(' ')}</p>
              </div>
            )}
          </div>

          {/* Linked Matter Info */}
          <div className="border border-[var(--border-subtle)] bg-[var(--bg-primary)] rounded-lg p-4 space-y-2">
            <div className="text-xs text-[var(--text-tertiary)] uppercase font-mono tracking-wider">Linked Matter</div>
            {matter ? (
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-[var(--text-primary)] block">{matter.title}</span>
                  <span className="text-xs text-[var(--text-tertiary)]">Billing: {matter.billing_type}</span>
                </div>
                <Link
                  to="/matters"
                  className="flex items-center gap-1 text-xs text-[var(--accent-secondary)] hover:underline"
                >
                  <span>View Matter</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            ) : (
              <p className="text-xs text-[var(--text-tertiary)] italic">No matter linked to this deadline.</p>
            )}
          </div>

          {/* Linked Documents for Matter */}
          <div className="border border-[var(--border-subtle)] bg-[var(--bg-primary)] rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--text-tertiary)] uppercase font-mono tracking-wider">
                Matter Documents ({linkedDocs.length})
              </span>
              <Link to="/documents" className="text-[11px] text-[var(--accent-secondary)] hover:underline">
                All Documents →
              </Link>
            </div>
            {linkedDocs.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {linkedDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-2.5 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <FileText className="w-3.5 h-3.5 text-[var(--text-tertiary)] shrink-0" />
                      <span className="font-medium text-[var(--text-primary)] truncate">{doc.file_name}</span>
                    </div>
                    <span className="text-[10px] text-[var(--text-tertiary)] font-mono shrink-0">
                      {new Date(doc.created_at).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--text-tertiary)] italic">
                No documents uploaded for this matter yet.
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="border border-[var(--border-subtle)] bg-[var(--bg-primary)] rounded-lg p-4 space-y-3">
            <div className="text-xs text-[var(--text-tertiary)] uppercase font-mono tracking-wider">Quick Actions</div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {deadline.calendar_event_id ? (
                <span className="flex items-center gap-1.5 text-xs text-[var(--signal-positive)] px-3 py-1.5 bg-[var(--signal-positive)]/10 border border-[var(--signal-positive)]/30 rounded font-medium">
                  <CalendarCheck2 className="w-3.5 h-3.5" /> Pushed to Google Calendar
                </span>
              ) : calendarConnected ? (
                <button
                  onClick={handlePush}
                  disabled={pushing}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] rounded text-[var(--text-primary)] font-medium transition-colors disabled:opacity-40"
                >
                  <CalendarPlus className="w-3.5 h-3.5" />
                  <span>{pushing ? 'Adding to Calendar…' : 'Push to Google Calendar'}</span>
                </button>
              ) : (
                <Link
                  to="/integrations"
                  className="flex items-center gap-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--accent-secondary)] underline decoration-dotted"
                >
                  Connect Google Calendar to sync
                </Link>
              )}

              {!isCompleted && (
                <button
                  onClick={handleMarkComplete}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] rounded text-[var(--text-primary)] font-medium transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-[var(--signal-positive)]" />
                  <span>Mark Done</span>
                </button>
              )}

              {deadline.matter_id && (
                <button
                  onClick={() => setLogTimeModalOpen(true)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] rounded text-[var(--text-primary)] font-medium transition-colors"
                >
                  <Timer className="w-3.5 h-3.5 text-[var(--accent-secondary)]" />
                  <span>Log Time</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </DetailPanel>

      {logTimeModalOpen && (
        <LogTimeModal
          onClose={() => setLogTimeModalOpen(false)}
          defaultMatterId={deadline.matter_id ?? undefined}
        />
      )}
    </>
  );
}
