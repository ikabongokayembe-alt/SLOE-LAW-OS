import { useState, useMemo } from 'react';
import { Bell, Menu } from 'lucide-react';
import { CommandInput } from './CommandInput';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../../lib/store';
import { daysUntilDateOnly } from '../../lib/dates';

// Every route in routes.tsx needs an entry. The previous if-chain covered
// seven of them and fell through to 'Law OS' for the rest, so Documents,
// Time, Communications, History, Team, Firm Settings and the Agent
// Library all showed the product name where their own name belongs. That
// read as a Communications-only bug because that is where it was noticed,
// but every screen added after the chain was written inherited it — which
// is exactly the failure mode a fall-through default produces: silent,
// and worse the more the product grows.
//
// Map explicitly. Anything unmapped falls through to 'Law OS'.
const SCREEN_NAMES: Record<string, string> = {
  '/': 'Command Center',
  '/matters': 'Matters',
  '/deadlines': 'Deadlines',
  '/documents': 'Documents',
  '/time': 'Time Entries',
  '/parties': 'Parties & Conflicts',
  '/communications': 'Communications Log',
  '/strategic': 'Strategic Intelligence',
  '/history': 'Audit Log',
  '/team': 'Team Directory',
  '/settings': 'Firm Settings',
  '/agent-library': 'Specialist Agent Library',
  '/operator': 'Operator',
};

const getScreenName = (pathname: string): string => {
  const exact = SCREEN_NAMES[pathname];
  if (exact) return exact;
  // /agents/:agentKey — the specialist chat screens.
  if (pathname.startsWith('/agents/')) return 'Agent Library';
  return 'Law OS';
};

function daysUntil(dateStr: string): number {
  return daysUntilDateOnly(dateStr);
}

export function TopBar({ onMenuClick }: { onMenuClick?: () => void } = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { deadlines, conflictChecks } = useStore();
  const [showNotifications, setShowNotifications] = useState(false);

  const notifications = useMemo(() => {
    const overdueCount = deadlines.filter(d => d.status === 'upcoming' && daysUntil(d.due_date) < 0).length;
    const pendingConflicts = conflictChecks.filter(c => c.status === 'pending' || c.status === 'flagged').length;
    const items: { label: string; onClick: () => void }[] = [];
    if (overdueCount > 0) items.push({ label: `${overdueCount} deadline${overdueCount === 1 ? '' : 's'} overdue`, onClick: () => navigate('/deadlines') });
    if (pendingConflicts > 0) items.push({ label: `${pendingConflicts} conflict check${pendingConflicts === 1 ? '' : 's'} unresolved`, onClick: () => navigate('/parties') });
    return items;
  }, [deadlines, conflictChecks, navigate]);

  return (
    <div className="h-14 bg-[var(--bg-primary)] border-b border-[var(--border-subtle)] flex items-center justify-between px-3 md:px-6 flex-shrink-0 relative gap-2">
      <div className="flex items-center gap-2 md:w-[200px] shrink-0">
        <button onClick={onMenuClick} className="md:hidden w-8 h-8 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] -ml-1">
          <Menu className="w-5 h-5" />
        </button>
        <div className="font-mono text-xs text-[var(--text-secondary)] hidden md:block">{getScreenName(location.pathname)}</div>
      </div>

      <div className="flex-1 flex justify-center min-w-0">
        <CommandInput />
      </div>

      <div className="md:w-[200px] flex items-center justify-end space-x-2 md:space-x-4 shrink-0">
        <div className="relative">
          <button
            onClick={() => setShowNotifications(v => !v)}
            className="relative text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <Bell className="w-[18px] h-[18px] stroke-[1.5]" />
            {notifications.length > 0 && (
              <span className="absolute top-0 right-0 w-2 h-2 bg-[var(--signal-negative)] rounded-full border border-[var(--bg-primary)]"></span>
            )}
          </button>
          {showNotifications && (
            <div className="absolute right-0 top-9 w-64 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg shadow-xl z-30 p-2">
              {notifications.length === 0 ? (
                <div className="text-xs text-[var(--text-tertiary)] p-3 text-center">No notifications.</div>
              ) : notifications.map((n, i) => (
                <button
                  key={i}
                  onClick={() => { n.onClick(); setShowNotifications(false); }}
                  className="w-full text-left text-xs text-[var(--text-primary)] px-3 py-2 rounded hover:bg-[var(--bg-tertiary)] transition-colors"
                >
                  {n.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <img src="https://ui-avatars.com/api/?name=Law+OS&background=random" className="w-8 h-8 rounded-full" alt="Profile" />
      </div>
    </div>
  );
}
