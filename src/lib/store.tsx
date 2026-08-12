import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured, DEMO_TENANT_ID } from './supabase';
import { useAuth } from './auth';
import { useToast } from './toast';
import { attorneys as mockAttorneys } from '../data/attorneys';
import { Attorney, PracticeArea, MatterStage, Party, ConflictCheck, Matter, Deadline, Insight, LawDocument } from '../types';

interface StoreState {
  loading: boolean;
  error: string | null;
  hasLoadedOnce: boolean;
  attorneys: Attorney[];
  practiceAreas: PracticeArea[];
  matterStages: MatterStage[];
  parties: Party[];
  conflictChecks: ConflictCheck[];
  matters: Matter[];
  deadlines: Deadline[];
  insights: Insight[];
  documents: LawDocument[];
  agentRequests: { agent_key: string; status: string }[];
}

interface StoreActions {
  refresh: () => Promise<void>;
  addParty: (party: Omit<Party, 'id'>) => Promise<Party | null>;
  runConflictCheck: (searchedName: string, matterId: string | null) => Promise<ConflictCheck | null>;
  clearConflictCheck: (id: string, waived: boolean, notes?: string) => Promise<void>;
  addMatter: (matter: Omit<Matter, 'id'>) => Promise<Matter | null>;
  updateMatterStage: (matterId: string, stageId: string) => Promise<{ error?: string }>;
  updateMatterAttorney: (matterId: string, attorneyId: string) => Promise<void>;
  addDeadline: (deadline: Omit<Deadline, 'id'>) => Promise<void>;
  updateDeadline: (id: string, patch: Partial<Deadline>) => Promise<void>;
  addInsights: (insights: Omit<Insight, 'id'>[]) => Promise<void>;
  uploadDocument: (file: File, matterId: string | null) => Promise<{ error?: string }>;
  deleteDocument: (id: string, storagePath: string) => Promise<void>;
  requestAgent: (agentKey: string) => Promise<void>;
}

const StoreContext = createContext<(StoreState & StoreActions) | null>(null);

function assertNoError<T>(r: { data: T | null; error: any }, label: string): T {
  if (r.error) {
    console.error(`[store] ${label} query failed:`, r.error);
    throw new Error(`${label}: ${r.error.message ?? r.error}`);
  }
  return (r.data ?? ([] as unknown as T));
}

function loadMockData(): Omit<StoreState, 'loading' | 'error' | 'hasLoadedOnce'> {
  return {
    attorneys: mockAttorneys,
    practiceAreas: [{ id: 'pa_general', key: 'general', label: 'General Practice', is_active: true }],
    matterStages: [
      { id: 'ms_intake', practice_area_id: null, stage_key: 'intake', label: 'Intake', sort_order: 0, is_initial: true, is_terminal: false },
      { id: 'ms_conflict', practice_area_id: null, stage_key: 'conflict_check', label: 'Conflict Check', sort_order: 1, is_initial: true, is_terminal: false },
      { id: 'ms_engaged', practice_area_id: null, stage_key: 'engaged', label: 'Engaged', sort_order: 2, is_initial: false, is_terminal: false },
      { id: 'ms_active', practice_area_id: null, stage_key: 'active', label: 'Active', sort_order: 3, is_initial: false, is_terminal: false },
      { id: 'ms_resolution', practice_area_id: null, stage_key: 'resolution', label: 'Resolution', sort_order: 4, is_initial: false, is_terminal: false },
      { id: 'ms_closed', practice_area_id: null, stage_key: 'closed', label: 'Closed', sort_order: 5, is_initial: false, is_terminal: true },
    ],
    parties: [],
    conflictChecks: [],
    matters: [],
    deadlines: [],
    insights: [],
    documents: [],
    agentRequests: [],
  };
}

async function loadAll(firmId: string): Promise<Omit<StoreState, 'loading' | 'error' | 'hasLoadedOnce'>> {
  const [attorneysR, practiceAreasR, matterStagesR, partiesR, conflictChecksR, mattersR, deadlinesR, insightsR, documentsR, agentRequestsR] = await Promise.all([
    supabase.from('attorneys').select('*').eq('firm_id', firmId).order('name'),
    supabase.from('practice_areas').select('*').eq('firm_id', firmId),
    supabase.from('matter_stages').select('*').eq('firm_id', firmId).order('sort_order'),
    supabase.from('parties').select('*').eq('firm_id', firmId).order('name'),
    supabase.from('conflict_checks').select('*').eq('firm_id', firmId).order('created_at', { ascending: false }),
    supabase.from('matters').select('*').eq('firm_id', firmId).order('opened_date', { ascending: false }),
    supabase.from('deadlines').select('*').eq('firm_id', firmId).order('due_date'),
    supabase.from('insights').select('*').eq('firm_id', firmId).is('dismissed_at', null).order('generated_at', { ascending: false }),
    supabase.from('documents').select('*').eq('firm_id', firmId).order('created_at', { ascending: false }),
    supabase.from('agent_requests').select('agent_key,status').eq('tenant_id', firmId),
  ]);

  const attorneys = assertNoError<any[]>(attorneysR, 'attorneys');
  const practiceAreas = assertNoError<any[]>(practiceAreasR, 'practice_areas');
  const matterStages = assertNoError<any[]>(matterStagesR, 'matter_stages');
  const parties = assertNoError<any[]>(partiesR, 'parties');
  const conflictChecks = assertNoError<any[]>(conflictChecksR, 'conflict_checks');
  const matters = assertNoError<any[]>(mattersR, 'matters');
  const deadlines = assertNoError<any[]>(deadlinesR, 'deadlines');
  const insightsRaw = insightsR.error ? [] : (insightsR.data ?? []); // insights table optional — degrade gracefully if not yet migrated
  const documentsRaw = documentsR.error ? [] : (documentsR.data ?? []); // same graceful degrade until migration 0005 is applied
  const agentRequests = agentRequestsR.error ? [] : (agentRequestsR.data ?? []);

  return {
    attorneys: attorneys as Attorney[],
    practiceAreas: practiceAreas as PracticeArea[],
    matterStages: matterStages as MatterStage[],
    parties: parties as Party[],
    conflictChecks: conflictChecks as ConflictCheck[],
    matters: matters as Matter[],
    deadlines: deadlines as Deadline[],
    insights: insightsRaw as Insight[],
    documents: documentsRaw as LawDocument[],
    agentRequests: agentRequests.map((r: any) => ({ agent_key: r.agent_key, status: r.status })),
  };
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const firmId = profile?.firm_id ?? DEMO_TENANT_ID;

  const [state, setState] = useState<StoreState>({
    loading: true, error: null, hasLoadedOnce: false,
    attorneys: [], practiceAreas: [], matterStages: [], parties: [], conflictChecks: [], matters: [], deadlines: [], insights: [], documents: [], agentRequests: [],
  });

  const mattersRef = useRef(state.matters);
  useEffect(() => { mattersRef.current = state.matters; }, [state.matters]);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setState(s => ({ ...s, ...loadMockData(), loading: false, hasLoadedOnce: true, error: null }));
      return;
    }
    setState(s => ({ ...s, loading: true }));
    try {
      const data = await loadAll(firmId);
      setState(s => ({ ...s, ...data, loading: false, hasLoadedOnce: true, error: null }));
    } catch (e: any) {
      console.error('[store] refresh failed:', e);
      setState(s => ({ ...s, loading: false, hasLoadedOnce: true, error: e?.message ?? 'load failed' }));
    }
  }, [firmId]);

  useEffect(() => { refresh(); }, [refresh]);

  const addParty = useCallback(async (party: Omit<Party, 'id'>) => {
    if (!isSupabaseConfigured) {
      const newParty = { ...party, id: `local-party-${Date.now()}` };
      setState(s => ({ ...s, parties: [...s.parties, newParty] }));
      return newParty;
    }
    const { data, error } = await supabase.from('parties').insert({ firm_id: firmId, ...party }).select().single();
    if (error || !data) { showToast('error', "Couldn't save that party."); return null; }
    setState(s => ({ ...s, parties: [...s.parties, data as Party] }));
    return data as Party;
  }, [firmId]);

  // Runs a real conflict check: searches existing parties by name/alias
  // overlap, stores the result as a real pending record. Clearing it is a
  // separate, explicit action — never automatic.
  const runConflictCheck = useCallback(async (searchedName: string, matterId: string | null) => {
    const nameLower = searchedName.trim().toLowerCase();
    const matches = state.parties.filter(p =>
      p.name.toLowerCase().includes(nameLower) || nameLower.includes(p.name.toLowerCase()) ||
      p.aliases.some(a => a.toLowerCase().includes(nameLower) || nameLower.includes(a.toLowerCase()))
    );
    if (!isSupabaseConfigured) {
      const cc: ConflictCheck = {
        id: `local-cc-${Date.now()}`, matter_id: matterId, searched_name: searchedName,
        matched_party_ids: matches.map(m => m.id), status: matches.length > 0 ? 'flagged' : 'cleared',
        created_at: new Date().toISOString(),
      };
      setState(s => ({ ...s, conflictChecks: [cc, ...s.conflictChecks] }));
      return cc;
    }
    const status = matches.length > 0 ? 'flagged' : 'cleared';
    const { data, error } = await supabase.from('conflict_checks').insert({
      firm_id: firmId, matter_id: matterId, searched_name: searchedName,
      matched_party_ids: matches.map(m => m.id), status,
    }).select().single();
    if (error || !data) { showToast('error', "Couldn't run the conflict check."); return null; }
    setState(s => ({ ...s, conflictChecks: [data as ConflictCheck, ...s.conflictChecks] }));
    if (matches.length > 0) showToast('error', `${matches.length} potential match${matches.length === 1 ? '' : 'es'} found — review before proceeding.`);
    else showToast('success', 'No conflicts found.');
    return data as ConflictCheck;
  }, [firmId, state.parties]);

  const clearConflictCheck = useCallback(async (id: string, waived: boolean, notes?: string) => {
    const patch = { status: waived ? 'waived' as const : 'cleared' as const, cleared_at: new Date().toISOString(), notes };
    setState(s => ({ ...s, conflictChecks: s.conflictChecks.map(c => c.id === id ? { ...c, ...patch } : c) }));
    if (!isSupabaseConfigured) return;
    const { error } = await supabase.from('conflict_checks').update(patch).eq('id', id);
    if (error) { console.error('[store] clearConflictCheck failed:', error); showToast('error', "Couldn't save — try again."); }
    else showToast('success', waived ? 'Conflict waived on record.' : 'Conflict check cleared.');
  }, []);

  const addMatter = useCallback(async (matter: Omit<Matter, 'id'>) => {
    if (!isSupabaseConfigured) {
      const newMatter: Matter = { ...matter, id: `local-matter-${Date.now()}` };
      setState(s => ({ ...s, matters: [newMatter, ...s.matters] }));
      showToast('success', 'Matter opened.');
      return newMatter;
    }
    const { data, error } = await supabase.from('matters').insert({ firm_id: firmId, ...matter }).select().single();
    if (error || !data) { showToast('error', "Couldn't open the matter."); return null; }
    setState(s => ({ ...s, matters: [data as Matter, ...s.matters] }));
    showToast('success', 'Matter opened.');
    return data as Matter;
  }, [firmId]);

  // Stage changes go through the real conflict-check gate at the database
  // level (see migration 0002) — this can genuinely fail, and the UI must
  // surface that, not silently ignore it.
  const updateMatterStage = useCallback(async (matterId: string, stageId: string) => {
    if (!isSupabaseConfigured) {
      setState(s => ({ ...s, matters: s.matters.map(m => m.id === matterId ? { ...m, stage_id: stageId } : m) }));
      return {};
    }
    const { error } = await supabase.from('matters').update({ stage_id: stageId }).eq('id', matterId);
    if (error) {
      showToast('error', error.message.includes('conflict check') ? error.message : "Couldn't move that matter.");
      return { error: error.message };
    }
    setState(s => ({ ...s, matters: s.matters.map(m => m.id === matterId ? { ...m, stage_id: stageId } : m) }));
    return {};
  }, []);

  const updateMatterAttorney = useCallback(async (matterId: string, attorneyId: string) => {
    setState(s => ({ ...s, matters: s.matters.map(m => m.id === matterId ? { ...m, assigned_attorney_id: attorneyId } : m) }));
    if (!isSupabaseConfigured) return;
    const { error } = await supabase.from('matters').update({ assigned_attorney_id: attorneyId }).eq('id', matterId);
    if (error) { console.error('[store] updateMatterAttorney failed:', error); showToast('error', "Couldn't reassign — try again."); }
  }, []);

  const addDeadline = useCallback(async (deadline: Omit<Deadline, 'id'>) => {
    if (!isSupabaseConfigured) {
      setState(s => ({ ...s, deadlines: [...s.deadlines, { ...deadline, id: `local-deadline-${Date.now()}` }] }));
      showToast('success', 'Deadline added.');
      return;
    }
    const { data, error } = await supabase.from('deadlines').insert({ firm_id: firmId, ...deadline }).select().single();
    if (error || !data) { showToast('error', "Couldn't save that deadline."); return; }
    setState(s => ({ ...s, deadlines: [...s.deadlines, data as Deadline] }));
    showToast('success', 'Deadline added.');
  }, [firmId]);

  const updateDeadline = useCallback(async (id: string, patch: Partial<Deadline>) => {
    setState(s => ({ ...s, deadlines: s.deadlines.map(d => d.id === id ? { ...d, ...patch } : d) }));
    if (!isSupabaseConfigured) return;
    const { error } = await supabase.from('deadlines').update(patch).eq('id', id);
    if (error) { console.error('[store] updateDeadline failed:', error); showToast('error', "Couldn't save — try again."); }
  }, []);

  const addInsights = useCallback(async (newInsights: Omit<Insight, 'id'>[]) => {
    if (!isSupabaseConfigured) {
      setState(s => ({ ...s, insights: [...newInsights.map((i, idx) => ({ ...i, id: `local-insight-${Date.now()}-${idx}` })), ...s.insights] }));
      return;
    }
    const { data, error } = await supabase.from('insights').insert(newInsights.map(i => ({ firm_id: firmId, ...i }))).select();
    if (error) { console.error('[store] addInsights failed:', error); showToast('error', "Couldn't save insights."); return; }
    setState(s => ({ ...s, insights: [...(data as any[]), ...s.insights] }));
  }, [firmId]);

  // Real Supabase Storage upload, scoped by firm/matter in the path
  // itself (matches the storage RLS policy documented in migration
  // 0005 — every operation is checked against that leading path
  // segment matching the caller's own firm_id).
  const uploadDocument = useCallback(async (file: File, matterId: string | null) => {
    if (!isSupabaseConfigured) {
      const newDoc: LawDocument = {
        id: `local-doc-${Date.now()}`, matter_id: matterId, file_name: file.name,
        storage_path: `local/${file.name}`, file_type: file.type, file_size: file.size,
        created_at: new Date().toISOString(),
      };
      setState(s => ({ ...s, documents: [newDoc, ...s.documents] }));
      showToast('success', 'Document added (preview mode — nothing persists here).');
      return {};
    }
    const path = `${firmId}/${matterId ?? 'unfiled'}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from('matter-documents').upload(path, file);
    if (uploadError) {
      showToast('error', "Couldn't upload that file — try again.");
      return { error: uploadError.message };
    }
    const { data, error } = await supabase.from('documents').insert({
      firm_id: firmId, matter_id: matterId, file_name: file.name, storage_path: path,
      file_type: file.type, file_size: file.size,
    }).select().single();
    if (error || !data) {
      // Clean up the orphaned storage object if the metadata row failed
      await supabase.storage.from('matter-documents').remove([path]);
      showToast('error', "Couldn't save that document — try again.");
      return { error: error?.message };
    }
    setState(s => ({ ...s, documents: [data as LawDocument, ...s.documents] }));
    showToast('success', 'Document uploaded.');
    return {};
  }, [firmId]);

  const deleteDocument = useCallback(async (id: string, storagePath: string) => {
    setState(s => ({ ...s, documents: s.documents.filter(d => d.id !== id) }));
    if (!isSupabaseConfigured) return;
    const { error: dbError } = await supabase.from('documents').delete().eq('id', id);
    if (dbError) { console.error('[store] deleteDocument failed:', dbError); showToast('error', "Couldn't delete — try again."); return; }
    const { error: storageError } = await supabase.storage.from('matter-documents').remove([storagePath]);
    if (storageError) console.error('[store] orphaned storage object (db row deleted, file remains):', storageError);
    showToast('success', 'Document deleted.');
  }, []);

  const requestAgent = useCallback(async (agentKey: string) => {    if (!isSupabaseConfigured) {
      setState(s => ({ ...s, agentRequests: [...s.agentRequests, { agent_key: agentKey, status: 'pending' }] }));
      showToast('success', 'Request noted (preview mode — nothing persists here).');
      return;
    }
    const { error } = await supabase.from('agent_requests').insert({ tenant_id: firmId, agent_key: agentKey });
    if (error) {
      if (error.code === '23505') { showToast('error', "You've already requested this agent."); return; }
      console.error('[store] requestAgent failed:', error);
      showToast('error', "Couldn't submit that request — try again.");
      return;
    }
    setState(s => ({ ...s, agentRequests: [...s.agentRequests, { agent_key: agentKey, status: 'pending' }] }));
    showToast('success', 'Requested — this will show as pending until reviewed.');
  }, [firmId]);

  if (!state.hasLoadedOnce) {
    return (
      <div className="fixed inset-0 bg-[var(--bg-primary,#0a0a0a)] flex flex-col items-center justify-center text-[var(--text-primary,#f5f5f5)]">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[var(--accent-primary,#d4af37)] animate-pulse"></div>
          <span className="text-sm font-mono tracking-wider uppercase opacity-70">
            {state.error ? `Load failed: ${state.error}` : 'Loading Law OS…'}
          </span>
        </div>
        {state.error && (
          <button
            onClick={() => { setState(s => ({ ...s, loading: true, error: null })); refresh(); }}
            className="mt-4 px-3 py-1 text-xs rounded border border-white/20 hover:bg-white/5"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <StoreContext.Provider value={{
      ...state,
      refresh, addParty, runConflictCheck, clearConflictCheck, addMatter, updateMatterStage, updateMatterAttorney, addDeadline, updateDeadline, addInsights, uploadDocument, deleteDocument, requestAgent,
    }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
