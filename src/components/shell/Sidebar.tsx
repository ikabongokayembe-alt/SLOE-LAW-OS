import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Home, Briefcase, Clock, Users, ChevronDown, ChevronRight, UsersRound, LogOut, Wrench, Sparkles, Plug, Search, FileText, Settings, Timer, Mail, History } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import { useStore } from '../../lib/store';
import { getSpecialist } from '../../data/specialists';

const cn = (...inputs: (string | undefined | null | false)[]) => twMerge(clsx(inputs));

const ROLE_LABELS: Record<string, string> = {
  principal: 'Partner', agent: 'Associate', manager: 'Practice Manager',
  paralegal: 'Paralegal', billing: 'Billing', reception: 'Reception',
};

const OPERATIONS_PATHS = ['/matters', '/deadlines', '/parties', '/documents', '/time', '/communications', '/history'];

export function Sidebar({ onNavigate }: { onNavigate?: () => void } = {}) {
  const { profile, isDevMode, signOut } = useAuth();
  const { agentRequests } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [operationsOpen, setOperationsOpen] = useState(true);

  const navItemClass = ({ isActive }: { isActive: boolean }) => cn(
    "flex items-center space-x-2.5 h-8 px-2.5 mx-2 rounded-md text-[13px] transition-colors duration-150 ease-out",
    isActive ? "bg-[var(--bg-tertiary)] text-[var(--text-primary)] font-medium"
             : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
  );
  const iconClass = "w-[15px] h-[15px] stroke-[1.5] shrink-0";

  const canSeeTeam = profile?.role === 'principal' || profile?.role === 'manager';
  const canSeeIntegrations = profile?.role === 'principal' || profile?.role === 'manager' || profile?.role === 'paralegal';
  const isOperationsActive = OPERATIONS_PATHS.includes(location.pathname);

  const handleSignOut = async () => {
    await signOut();
    setMenuOpen(false);
    if (!isDevMode) navigate('/login');
  };

  const sectionHeaderClass = "px-4 mb-1.5 text-[10px] font-mono tracking-wider text-[var(--text-tertiary)]";

  return (
    <div className="w-[240px] flex-shrink-0 bg-[var(--bg-secondary)] border-r border-[var(--border-subtle)] flex flex-col">
      <div className="h-14 pt-4 pl-4">
        <h1 className="font-display font-semibold text-[15px] tracking-tight truncate">{profile?.firm_name ?? 'Law OS'}</h1>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 space-y-4">
        <div className="space-y-0.5">
          <NavLink to="/" end className={navItemClass} onClick={onNavigate}><Home className={iconClass} /><span>Command Center</span></NavLink>
        </div>

        <div>
          <button
            onClick={() => setOperationsOpen(v => !v)}
            className={cn(
              "w-full flex items-center gap-1 px-4 mb-1.5 text-[10px] font-mono tracking-wider transition-colors",
              isOperationsActive ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            )}
          >
            {operationsOpen ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
            <span>OPERATIONS</span>
          </button>
          {operationsOpen && (
            <div className="space-y-0.5">
              <NavLink to="/matters" className={navItemClass} onClick={onNavigate}><Briefcase className={iconClass} /><span>Matters</span></NavLink>
              <NavLink to="/deadlines" className={navItemClass} onClick={onNavigate}><Clock className={iconClass} /><span>Deadlines</span></NavLink>
              <NavLink to="/parties" className={navItemClass} onClick={onNavigate}><Search className={iconClass} /><span>Conflict Check</span></NavLink>
              <NavLink to="/documents" className={navItemClass} onClick={onNavigate}><FileText className={iconClass} /><span>Documents</span></NavLink>
              <NavLink to="/time" className={navItemClass} onClick={onNavigate}><Timer className={iconClass} /><span>Time</span></NavLink>
              <NavLink to="/communications" className={navItemClass} onClick={onNavigate}><Mail className={iconClass} /><span>Communications</span></NavLink>
              <NavLink to="/history" className={navItemClass} onClick={onNavigate}><History className={iconClass} /><span>History</span></NavLink>
            </div>
          )}
        </div>

        <div>
          <div className={sectionHeaderClass}>AI AGENTS</div>
          <div className="space-y-0.5">
            <NavLink to="/operator" className={navItemClass} onClick={onNavigate}><Wrench className={iconClass} /><span>Operator</span></NavLink>
            <NavLink to="/analyst" className={navItemClass} onClick={onNavigate}><Sparkles className={iconClass} /><span>Analyst</span></NavLink>
            {/* Instant self-provisioning: a specialist appears here the moment
                its agent_requests row exists — no reload needed, since this
                just reflects live store state. */}
            {agentRequests.map(r => {
              const specialist = getSpecialist(r.agent_key);
              if (!specialist) return null;
              return (
                <NavLink key={r.id} to={`/agents/${specialist.key}`} className={navItemClass} onClick={onNavigate}>
                  <specialist.icon className={iconClass} /><span className="truncate">{specialist.name}</span>
                </NavLink>
              );
            })}
          </div>
        </div>

        {(canSeeTeam || canSeeIntegrations) && (
          <div>
            <div className={sectionHeaderClass}>SYSTEMS</div>
            <div className="space-y-0.5">
              {canSeeTeam && (
                <NavLink to="/team" className={navItemClass} onClick={onNavigate}><UsersRound className={iconClass} /><span>Team</span></NavLink>
              )}
              {canSeeIntegrations && (
                <NavLink to="/integrations" className={navItemClass} onClick={onNavigate}><Plug className={iconClass} /><span>Integrations</span></NavLink>
              )}
              {canSeeTeam && (
                <NavLink to="/settings" className={navItemClass} onClick={onNavigate}><Settings className={iconClass} /><span>Firm Settings</span></NavLink>
              )}
            </div>
          </div>
        )}
      </nav>

      <div className="relative p-3 border-t border-[var(--border-subtle)]">
        <button onClick={() => setMenuOpen(v => !v)} className="w-full flex items-center space-x-2.5 hover:bg-[var(--bg-tertiary)] rounded-md p-1 -m-1 transition-colors">
          <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(profile?.name ?? 'Guest')}&background=random`} className="w-7 h-7 rounded-full" alt={profile?.name ?? 'Guest'} />
          <div className="flex-1 min-w-0 text-left">
            <div className="text-[13px] font-medium text-[var(--text-primary)] truncate">{profile?.name ?? 'Guest'}</div>
            <div className="text-[11px] text-[var(--text-tertiary)] truncate">{profile ? ROLE_LABELS[profile.role] : ''}</div>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
        </button>
        {menuOpen && (
          <div className="absolute bottom-14 left-3 right-3 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg shadow-xl overflow-hidden">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
