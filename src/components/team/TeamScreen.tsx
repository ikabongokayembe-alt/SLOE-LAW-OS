import { useEffect, useState, useCallback } from 'react';
import { useAuth, UserRole, DEV_PROFILES } from '../../lib/auth';
import { useToast } from '../../lib/toast';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { UserPlus, Check, Clock, X, RotateCw } from 'lucide-react';

const ROLE_LABELS: Record<UserRole, string> = {
  principal: 'Partner',
  agent: 'Associate',
  manager: 'Practice Manager',
  paralegal: 'Paralegal',
  billing: 'Billing',
  reception: 'Reception',
};

interface RosterRow { id: string; name: string; email: string; role: UserRole; }
interface InviteRow { id: string; email: string; role: UserRole; token: string; accepted_at: string | null; created_at: string; }

export function TeamScreen() {
  const { profile, isDevMode, setDevProfile } = useAuth();
  const { showToast } = useToast();
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('agent');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busyRowId, setBusyRowId] = useState<string | null>(null);

  const loadTeam = useCallback(async () => {
    if (!isSupabaseConfigured) return; // dev mode: roster comes from DEV_PROFILES below
    const { data: profiles } = await supabase.from('profiles').select('id,name,email,role');
    if (profiles) setRoster(profiles as RosterRow[]);
    const { data: inv } = await supabase.from('invites').select('id,email,role,token,accepted_at,created_at').order('created_at', { ascending: false });
    if (inv) setInvites(inv as InviteRow[]);
  }, []);

  useEffect(() => { loadTeam(); }, [loadTeam]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (!isSupabaseConfigured) {
      setMessage('Invites require a connected Supabase backend — this is a preview of the flow using local dev data.');
      return;
    }
    setSending(true);
    const { data, error } = await supabase.from('invites').insert({
      firm_id: profile?.firm_id, email, role,
    }).select().single();
    setSending(false);
    if (error) { setMessage(`Couldn't create invite: ${error.message}`); return; }
    const link = `${window.location.origin}/accept-invite?token=${data.token}`;
    try { await navigator.clipboard.writeText(link); } catch { /* clipboard may be unavailable */ }
    setMessage(`Invite link copied to clipboard — send it to ${email}.`);
    setEmail('');
    loadTeam();
  };

  const handleRoleChange = async (row: RosterRow, newRole: UserRole) => {
    if (!isSupabaseConfigured) { showToast('error', 'Editing roles requires a connected backend.'); return; }
    setBusyRowId(row.id);
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', row.id);
    setBusyRowId(null);
    if (error) { showToast('error', `Couldn't update ${row.name}'s role.`); return; }
    showToast('success', `${row.name} is now ${ROLE_LABELS[newRole]}.`);
    loadTeam();
  };

  const handleRemove = async (row: RosterRow) => {
    if (!isSupabaseConfigured) { showToast('error', 'Removing team members requires a connected backend.'); return; }
    if (!confirm(`Remove ${row.name} from this firm? They'll immediately lose access to the workspace.`)) return;
    setBusyRowId(row.id);
    const { error } = await supabase.from('profiles').delete().eq('id', row.id);
    setBusyRowId(null);
    if (error) { showToast('error', `Couldn't remove ${row.name}.`); return; }
    showToast('success', `${row.name} removed from the firm.`);
    loadTeam();
  };

  const handleResend = async (inv: InviteRow) => {
    const link = `${window.location.origin}/accept-invite?token=${inv.token}`;
    try { await navigator.clipboard.writeText(link); showToast('success', `Invite link for ${inv.email} copied — send it again.`); }
    catch { showToast('error', "Couldn't copy the link — clipboard unavailable."); }
  };

  const handleRevoke = async (inv: InviteRow) => {
    if (!confirm(`Revoke the invite sent to ${inv.email}? The link will stop working.`)) return;
    setBusyRowId(inv.id);
    const { error } = await supabase.from('invites').delete().eq('id', inv.id);
    setBusyRowId(null);
    if (error) { showToast('error', "Couldn't revoke that invite."); return; }
    showToast('success', `Invite to ${inv.email} revoked.`);
    loadTeam();
  };

  const displayRoster: RosterRow[] = isDevMode
    ? DEV_PROFILES.map(p => ({ id: p.id, name: p.name, email: p.email, role: p.role }))
    : roster;

  const canEditSelf = false; // never let someone demote/remove themselves from this screen

  return (
    <div className="max-w-3xl">
      <h2 className="text-xl font-medium mb-1">Team</h2>
      <p className="text-sm text-[var(--text-secondary)] mb-8">Manage who has access to your firm's workspace and what they can see.</p>

      {isDevMode && (
        <div className="mb-8 p-4 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg">
          <div className="text-xs font-medium mb-2">Preview as…</div>
          <div className="flex flex-wrap gap-2">
            {DEV_PROFILES.map(p => (
              <button
                key={p.id}
                onClick={() => setDevProfile(p)}
                className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${profile?.id === p.id
                  ? 'bg-[var(--text-primary)] text-[var(--bg-primary)] border-[var(--text-primary)]'
                  : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'}`}
              >
                {p.name}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-[var(--text-tertiary)] mt-2">
            No real backend connected — switch roles here to preview what each one sees across the app. Role editing, removal, and invite management below become active once Supabase is wired.
          </p>
        </div>
      )}

      <div className="mb-8">
        <h3 className="text-sm font-medium mb-3">Roster</h3>
        <div className="border border-[var(--border-subtle)] rounded-lg divide-y divide-[var(--border-subtle)]">
          {displayRoster.map(r => {
            const isSelf = r.id === profile?.id;
            return (
              <div key={r.id} className="flex items-center justify-between px-4 py-3 gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{r.name}{isSelf && <span className="text-[var(--text-tertiary)] font-normal"> (you)</span>}</div>
                  <div className="text-xs text-[var(--text-tertiary)] truncate">{r.email}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {r.role === 'principal' || isSelf || !isSupabaseConfigured ? (
                    <div className="text-xs px-2 py-1 bg-[var(--bg-tertiary)] rounded-full text-[var(--text-secondary)]">{ROLE_LABELS[r.role]}</div>
                  ) : (
                    <select
                      value={r.role}
                      disabled={busyRowId === r.id}
                      onChange={e => handleRoleChange(r, e.target.value as UserRole)}
                      className="h-7 px-2 text-xs bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-full text-[var(--text-secondary)] focus:outline-none disabled:opacity-40"
                    >
                      {Object.entries(ROLE_LABELS).filter(([k]) => k !== 'principal').map(([k, label]) => (
                        <option key={k} value={k}>{label}</option>
                      ))}
                    </select>
                  )}
                  {r.role !== 'principal' && !isSelf && (
                    <button
                      onClick={() => handleRemove(r)}
                      disabled={busyRowId === r.id}
                      title="Remove from firm"
                      className="h-7 w-7 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--signal-negative)] hover:bg-[var(--bg-tertiary)] rounded-full transition-colors disabled:opacity-40"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {displayRoster.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-[var(--text-tertiary)]">No team members yet.</div>
          )}
        </div>
      </div>

      <div className="mb-8">
        <h3 className="text-sm font-medium mb-3">Invite someone</h3>
        <form onSubmit={handleInvite} className="flex gap-2">
          <input
            type="email" required placeholder="colleague@firm.com" value={email}
            onChange={e => setEmail(e.target.value)}
            className="flex-1 h-9 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none"
          />
          <select
            value={role} onChange={e => setRole(e.target.value as UserRole)}
            className="h-9 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none"
          >
            {Object.entries(ROLE_LABELS).filter(([k]) => k !== 'principal').map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
          <button
            type="submit" disabled={sending}
            className="h-9 px-4 flex items-center gap-1.5 bg-[var(--text-primary)] text-[var(--bg-primary)] rounded text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            <UserPlus className="w-3.5 h-3.5" /> Invite
          </button>
        </form>
        {message && <p className="text-xs text-[var(--text-secondary)] mt-2">{message}</p>}
      </div>

      {!isDevMode && (
        <div>
          <h3 className="text-sm font-medium mb-3">Pending invites</h3>
          <div className="border border-[var(--border-subtle)] rounded-lg divide-y divide-[var(--border-subtle)]">
            {invites.map(inv => (
              <div key={inv.id} className="flex items-center justify-between px-4 py-3 gap-3">
                <div className="min-w-0">
                  <div className="text-sm truncate">{inv.email}</div>
                  <div className="text-xs text-[var(--text-tertiary)]">{ROLE_LABELS[inv.role]}</div>
                </div>
                {inv.accepted_at ? (
                  <div className="flex items-center gap-1 text-xs text-[var(--signal-positive)] shrink-0"><Check className="w-3.5 h-3.5" /> Joined</div>
                ) : (
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1 text-xs text-[var(--text-tertiary)]"><Clock className="w-3.5 h-3.5" /> Pending</div>
                    <button
                      onClick={() => handleResend(inv)}
                      title="Copy invite link again"
                      className="h-7 w-7 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded-full transition-colors"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleRevoke(inv)}
                      disabled={busyRowId === inv.id}
                      title="Revoke invite"
                      className="h-7 w-7 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--signal-negative)] hover:bg-[var(--bg-tertiary)] rounded-full transition-colors disabled:opacity-40"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
            {invites.length === 0 && (
              <div className="px-4 py-6 text-center text-xs text-[var(--text-tertiary)]">No invites sent yet.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
