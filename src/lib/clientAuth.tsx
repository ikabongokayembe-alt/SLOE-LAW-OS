import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from './supabase';

// A completely separate auth context from lib/auth.tsx's AuthProvider —
// a portal client is not a firm member (never gets a `profiles` row with
// a staff role), so it can't reuse fetchProfile/Profile. Both providers
// listen to the same underlying Supabase auth session; which one
// actually resolves a usable identity depends on whether client_users or
// profiles has a row for that auth.uid() — a single browser session is
// always exactly one or the other, never both.
export interface ClientProfile {
  id: string; // auth.users.id === client_users.id
  party_id: string;
  party_name: string;
  firm_id: string;
  firm_name: string;
  email: string;
}

interface ClientAuthState {
  loading: boolean;
  session: any | null;
  clientProfile: ClientProfile | null;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  acceptInvite: (token: string, password: string) => Promise<{ error?: string }>;
}

const ClientAuthContext = createContext<ClientAuthState | null>(null);

export function ClientAuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any | null>(null);
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);

  const fetchClientProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('client_users')
      .select('id, party_id, email, parties(name, firm_id, firms(name))')
      .eq('id', userId)
      .maybeSingle();
    // maybeSingle, not single: a staff member's session hitting this
    // provider (or a client mid-signup before accept_client_invite has
    // run) legitimately has zero rows here — that's not an error, it's
    // "this session isn't a portal client," which RequireClientAuth
    // below turns into a redirect, not a crash.
    if (error || !data) { setClientProfile(null); return; }
    const partyRow = (data as any).parties;
    setClientProfile({
      id: data.id, party_id: data.party_id, email: data.email,
      party_name: partyRow?.name ?? 'Client', firm_id: partyRow?.firm_id,
      firm_name: partyRow?.firms?.name ?? 'the firm',
    });
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) fetchClientProfile(data.session.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) fetchClientProfile(newSession.user.id);
      else setClientProfile(null);
    });
    return () => listener.subscription.unsubscribe();
  }, [fetchClientProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return {};
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setClientProfile(null);
  }, []);

  // Mirrors acceptInvite in lib/auth.tsx exactly — token -> look up the
  // invite's email (no auth needed yet) -> sign up that auth.users
  // account -> accept_client_invite() links it to the party.
  const acceptInvite = useCallback(async (token: string, password: string) => {
    const { data: inviteEmail, error: inviteErr } = await supabase.rpc('get_client_invite_email', { p_token: token });
    if (inviteErr || !inviteEmail) return { error: 'Invite not found, already used, or expired.' };

    const { data, error } = await supabase.auth.signUp({ email: inviteEmail, password });
    if (error) return { error: error.message };
    if (!data.session) return { error: 'Check your email to confirm your account, then log in and try the invite link again.' };

    const { error: rpcError } = await supabase.rpc('accept_client_invite', { p_token: token });
    if (rpcError) return { error: rpcError.message };

    await fetchClientProfile(data.session.user.id);
    return {};
  }, [fetchClientProfile]);

  return (
    <ClientAuthContext.Provider value={{ loading, session, clientProfile, signIn, signOut, acceptInvite }}>
      {children}
    </ClientAuthContext.Provider>
  );
}

export function useClientAuth() {
  const ctx = useContext(ClientAuthContext);
  if (!ctx) throw new Error('useClientAuth must be used within ClientAuthProvider');
  return ctx;
}
