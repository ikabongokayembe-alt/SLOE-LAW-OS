import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from './supabase';
import { attorneys as mockAttorneys } from '../data/attorneys';

export type UserRole = 'principal' | 'agent' | 'manager' | 'paralegal' | 'billing' | 'reception';

export interface Profile {
  id: string;
  firm_id: string;
  firm_name: string;
  attorney_id: string | null;
  role: UserRole;
  name: string;
  email: string;
  // Command Center category mute/dismiss (see migration 0024) -- which of
  // this USER's own consequence-class sections (ConsequenceClass values:
  // 'professional' | 'revenue' | 'relationship') are hidden on their
  // Command Center. Per-user by design: never affects what fires or what
  // anyone else at the firm sees.
  muted_dashboard_categories: string[];
}

interface AuthState {
  loading: boolean;
  session: any | null;
  profile: Profile | null;
  isDevMode: boolean;
  signUp: (email: string, password: string, firmName: string, principalName: string, isSolo?: boolean) => Promise<{ error?: string }>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  acceptInvite: (token: string, password: string, name: string) => Promise<{ error?: string }>;
  setDevProfile: (profile: Profile) => void;
  toggleMutedDashboardCategory: (category: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const DEMO_FIRM_ID = 'e47f9c12-8b3a-4d21-9f5e-1a2b3c4d5e6f';

const DEV_PROFILES: Profile[] = [
  { id: 'dev-principal', firm_id: DEMO_FIRM_ID, firm_name: 'Demo Firm', attorney_id: null, role: 'principal', name: 'Demo Partner (Principal)', email: 'principal@demo.local', muted_dashboard_categories: [] },
  ...mockAttorneys.map((a): Profile => ({
    id: `dev-${a.id}`, firm_id: DEMO_FIRM_ID, firm_name: 'Demo Firm', attorney_id: a.id, role: 'agent', name: `${a.name} (Associate)`, email: `${a.name.toLowerCase().replace(/\s+/g, '.')}@demo.local`, muted_dashboard_categories: [],
  })),
];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any | null>(null);
  const [profile, setProfile] = useState<Profile | null>(
    isSupabaseConfigured ? null : DEV_PROFILES[0]
  );

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase.from('profiles').select('*, firms(name)').eq('id', userId).single();
    if (error) { console.error('[auth] fetchProfile failed:', error); setProfile(null); return; }
    const { firms, ...rest } = data as any;
    // muted_dashboard_categories predates any row written before migration
    // 0024 -- the column default ('{}') covers that at the DB level, but
    // `rest.muted_dashboard_categories ?? []` is a second, harmless guard
    // in case a stale schema cache ever omits it from `data`.
    setProfile({ ...rest, firm_name: firms?.name ?? 'Law OS', muted_dashboard_categories: rest.muted_dashboard_categories ?? [] } as Profile);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) fetchProfile(data.session.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) fetchProfile(newSession.user.id);
      else setProfile(null);
    });
    return () => listener.subscription.unsubscribe();
  }, [fetchProfile]);

  const sendWelcomeEmail = (email: string, name: string, firmName: string, role: string) => {
    supabase.functions.invoke('welcome-email', { body: { email, name, brokerageName: firmName, role } })
      .catch(err => console.error('[auth] welcome-email failed (non-fatal):', err));
  };

  const signUp = useCallback(async (email: string, password: string, firmName: string, principalName: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };
    if (!data.session) return { error: 'Check your email to confirm your account, then log in.' };
    const { error: rpcError } = await supabase.rpc('create_firm', { p_firm_name: firmName, p_principal_name: principalName });
    if (rpcError) return { error: rpcError.message };
    sendWelcomeEmail(email, principalName, firmName, 'principal');
    await fetchProfile(data.session.user.id);
    return {};
  }, [fetchProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return {};
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(isSupabaseConfigured ? null : DEV_PROFILES[0]);
  }, []);

  const acceptInvite = useCallback(async (token: string, password: string, name: string) => {
    const { data: inviteEmail, error: inviteErr } = await supabase.rpc('get_invite_email', { p_token: token });
    if (inviteErr || !inviteEmail) return { error: 'Invite not found, already used, or expired.' };

    const { data, error } = await supabase.auth.signUp({ email: inviteEmail, password });
    if (error) return { error: error.message };
    if (!data.session) return { error: 'Check your email to confirm your account, then log in and try the invite link again.' };

    const { data: firmId, error: rpcError } = await supabase.rpc('accept_invite', { p_token: token, p_name: name });
    if (rpcError) return { error: rpcError.message };

    try {
      const [{ data: firm }, { data: newProfile }] = await Promise.all([
        supabase.from('firms').select('name').eq('id', firmId).single(),
        supabase.from('profiles').select('role').eq('id', data.session.user.id).single(),
      ]);
      if (firm && newProfile) sendWelcomeEmail(inviteEmail, name, firm.name, newProfile.role);
    } catch (e) {
      console.error('[auth] welcome-email lookup failed (non-fatal):', e);
    }

    await fetchProfile(data.session.user.id);
    return {};
  }, [fetchProfile]);

  const setDevProfile = useCallback((p: Profile) => { setProfile(p); }, []);

  // Command Center category mute/dismiss (see migration 0024). Optimistic
  // local update first (the section should disappear/reappear instantly,
  // not wait on a round trip), then persisted to this user's own profile
  // row -- reverted if the write fails, so the UI never claims a
  // preference is saved when it wasn't.
  const toggleMutedDashboardCategory = useCallback(async (category: string) => {
    if (!profile) return;
    const previous = profile;
    const next = profile.muted_dashboard_categories.includes(category)
      ? profile.muted_dashboard_categories.filter(c => c !== category)
      : [...profile.muted_dashboard_categories, category];
    setProfile({ ...profile, muted_dashboard_categories: next });
    if (!isSupabaseConfigured) return; // preview mode -- nothing persists here, matches every other mutation in this app
    const { error } = await supabase.from('profiles').update({ muted_dashboard_categories: next }).eq('id', profile.id);
    if (error) {
      console.error('[auth] toggleMutedDashboardCategory failed:', error);
      setProfile(previous);
    }
  }, [profile]);

  return (
    <AuthContext.Provider value={{
      loading, session, profile, isDevMode: !isSupabaseConfigured,
      signUp, signIn, signOut, acceptInvite, setDevProfile, toggleMutedDashboardCategory,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { DEV_PROFILES, DEMO_FIRM_ID };
