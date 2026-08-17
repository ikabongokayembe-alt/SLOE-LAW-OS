import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured, DEMO_TENANT_ID } from './supabase';
import { useAuth } from './auth';
import { useToast } from './toast';
import { attorneys as mockAttorneys } from '../data/attorneys';
import { deadlineRules as mockDeadlineRules } from '../data/deadlineRules';
import { Attorney, PracticeArea, MatterStage, Party, ConflictCheck, Matter, Deadline, Insight, LawDocument, Firm, DeadlineRule, ImportBatch, TimeEntry, MatterCommunication, AuditLogEntry, ClientInvite, ClientUser, SignatureRequest, MatterParty, MatterPartyRole, PartyRelationship } from '../types';
import { analyseConflict } from './conflictSignals';

interface StoreState {
  loading: boolean;
  error: string | null;
  hasLoadedOnce: boolean;
  firm: Firm | null;
  attorneys: Attorney[];
  practiceAreas: PracticeArea[];
  matterStages: MatterStage[];
  parties: Party[];
  conflictChecks: ConflictCheck[];
  matters: Matter[];
  deadlines: Deadline[];
  insights: Insight[];
  documents: LawDocument[];
  signatureRequests: SignatureRequest[];
  matterParties: MatterParty[];
  partyRelationships: PartyRelationship[];
  agentRequests: { id: string; agent_key: string; status: string }[];
  deadlineRules: DeadlineRule[];
  importBatches: ImportBatch[];
  timeEntries: TimeEntry[];
  communications: MatterCommunication[];
  // Who-changed-what-when across the 6 audited tables (see migration
  // 0016) — written only by database triggers, this is purely a read
  // slice. Capped at the 500 most recent rows (see loadAll) so a firm
  // with a long history doesn't pull an ever-growing payload on every
  // load; older entries are still in the database, just not preloaded.
  auditLog: AuditLogEntry[];
  // Client Portal MVP (see migration 0018) — who's already been invited
  // and who already has working portal access, so Matters can show the
  // right state per party instead of blindly offering "Invite" always.
  clientInvites: ClientInvite[];
  clientUsers: ClientUser[];
  // Live Composio connection status (Calendar + Gmail integration, pass
  // 1) — one shared source so Deadlines/Communications don't each run
  // their own status check and risk disagreeing about what's connected.
  // Same shape /integrations already uses. Null until the first
  // successful check completes.
  integrationConnections: { toolkit_slug: string; status: string; connected_account_id: string }[] | null;
}

interface StoreActions {
  refresh: () => Promise<void>;
  updateFirm: (patch: Partial<Pick<Firm, 'country' | 'region' | 'currency' | 'locale'>>) => Promise<{ error?: string }>;
  addPracticeArea: (pa: { key: string; label: string }) => Promise<{ error?: string }>;
  updatePracticeArea: (id: string, patch: Partial<Pick<PracticeArea, 'is_active' | 'label'>>) => Promise<{ error?: string }>;
  addParty: (party: Omit<Party, 'id'>) => Promise<Party | null>;
  runConflictCheck: (searchedName: string, matterId: string | null) => Promise<ConflictCheck | null>;
  clearConflictCheck: (id: string, waived: boolean, notes?: string) => Promise<void>;
  addMatter: (matter: Omit<Matter, 'id'>) => Promise<Matter | null>;
  addMatterParty: (matterId: string, partyId: string, role: MatterPartyRole) => Promise<{ error?: string }>;
  removeMatterParty: (matterId: string, partyId: string, role: MatterPartyRole) => Promise<void>;
  updateMatterStage: (matterId: string, stageId: string) => Promise<{ error?: string }>;
  updateMatterAttorney: (matterId: string, attorneyId: string) => Promise<void>;
  linkMatterConflictCheck: (matterId: string, conflictCheckId: string) => Promise<void>;
  addDeadline: (deadline: Omit<Deadline, 'id'>) => Promise<void>;
  updateDeadline: (id: string, patch: Partial<Deadline>) => Promise<void>;
  addInsights: (insights: Omit<Insight, 'id'>[]) => Promise<void>;
  uploadDocument: (file: File, matterId: string | null, parentDocumentId?: string | null) => Promise<{ error?: string }>;
  deleteDocument: (id: string, storagePath: string) => Promise<void>;
  requestAgent: (agentKey: string) => Promise<void>;
  removeAgentRequest: (id: string) => Promise<void>;
  commitImportBatch: (entityType: 'parties' | 'matters' | 'deadlines', rows: Record<string, any>[]) => Promise<{ batch: ImportBatch | null; created: any[] }>;
  removeImportBatch: (batchId: string, entityType: 'parties' | 'matters' | 'deadlines') => Promise<void>;
  addTimeEntry: (entry: Omit<TimeEntry, 'id' | 'created_at' | 'created_by' | 'currency'>) => Promise<{ error?: string }>;
  updateTimeEntry: (id: string, patch: Partial<Pick<TimeEntry, 'matter_id' | 'attorney_id' | 'date' | 'duration_minutes' | 'rate' | 'description' | 'billable'>>) => Promise<{ error?: string }>;
  deleteTimeEntry: (id: string) => Promise<void>;
  refreshIntegrations: () => Promise<void>;
  pushDeadlineToCalendar: (deadlineId: string) => Promise<{ error?: string }>;
  sendMatterCommunication: (input: { matter_id: string; sent_to: string; subject: string; body: string }) => Promise<{ error?: string }>;
  inviteClientToPortal: (partyId: string, email: string) => Promise<{ invite?: ClientInvite; error?: string }>;
  setDocumentClientVisible: (documentId: string, visible: boolean) => Promise<void>;
  sendForSignature: (documentId: string, recipientEmail: string, recipientName?: string) => Promise<{ error?: string }>;
  refreshSignatureStatus: (signatureRequestId: string) => Promise<{ error?: string }>;
  cancelSignatureRequest: (signatureRequestId: string) => Promise<{ error?: string }>;
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
    // region: 'TX' so the statute-of-limitations engine (migration 0011)
    // has something real to match against in dev/mock mode — matches the
    // jurisdiction the four seeded deadline_rules rows are actually for.
    firm: { id: DEMO_TENANT_ID, name: 'Demo Firm', country: 'US', region: 'TX', currency: 'USD', locale: 'en-US' },
    attorneys: mockAttorneys,
    // Same 5 presets a real firm gets seeded with (migration 0003), all
    // active here (vs. only 'general' active on a real fresh signup) so
    // the demo actually shows what a firm using more than one practice
    // area looks like.
    practiceAreas: [
      { id: 'pa_general', key: 'general', label: 'General Practice', is_active: true },
      { id: 'pa_personal_injury', key: 'personal_injury', label: 'Personal Injury', is_active: true },
      { id: 'pa_corporate', key: 'corporate', label: 'Corporate / Transactional', is_active: true },
      { id: 'pa_family', key: 'family', label: 'Family Law', is_active: true },
      { id: 'pa_immigration', key: 'immigration', label: 'Immigration', is_active: true },
    ],
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
    signatureRequests: [],
    matterParties: [],
    partyRelationships: [],
    agentRequests: [],
    deadlineRules: mockDeadlineRules,
    importBatches: [],
    timeEntries: [],
    communications: [],
    auditLog: [],
    clientInvites: [],
    clientUsers: [],
    integrationConnections: [],
  };
}

async function loadAll(firmId: string): Promise<Omit<StoreState, 'loading' | 'error' | 'hasLoadedOnce' | 'integrationConnections'>> {
  const [firmR, attorneysR, practiceAreasR, matterStagesR, partiesR, conflictChecksR, mattersR, deadlinesR, insightsR, documentsR, agentRequestsR, deadlineRulesR, importBatchesR, timeEntriesR, communicationsR, auditLogR, clientInvitesR, clientUsersR, signatureRequestsR, matterPartiesR, partyRelationshipsR] = await Promise.all([
    supabase.from('firms').select('id,name,country,region,currency,locale').eq('id', firmId).single(),
    supabase.from('attorneys').select('*').eq('firm_id', firmId).order('name'),
    supabase.from('practice_areas').select('*').eq('firm_id', firmId),
    supabase.from('matter_stages').select('*').eq('firm_id', firmId).order('sort_order'),
    supabase.from('parties').select('*').eq('firm_id', firmId).order('name'),
    supabase.from('conflict_checks').select('*').eq('firm_id', firmId).order('created_at', { ascending: false }),
    supabase.from('matters').select('*').eq('firm_id', firmId).order('opened_date', { ascending: false }),
    supabase.from('deadlines').select('*').eq('firm_id', firmId).order('due_date'),
    supabase.from('insights').select('*').eq('firm_id', firmId).is('dismissed_at', null).order('generated_at', { ascending: false }),
    supabase.from('documents').select('*').eq('firm_id', firmId).order('created_at', { ascending: false }),
    supabase.from('agent_requests').select('id,agent_key,status').eq('tenant_id', firmId),
    // Global reference data — no firm scoping at all, same rules for every tenant in a given jurisdiction. See migration 0011.
    supabase.from('deadline_rules').select('*'),
    // principal/manager-gated at the RLS level (see migration 0012) — a
    // non-gated role's query here just comes back empty, not an error.
    supabase.from('import_batches').select('*').eq('firm_id', firmId).order('created_at', { ascending: false }),
    // Firm-wide visibility (see migration 0013) — same tenancy-not-role
    // shape as matters/deadlines post-0006.
    supabase.from('time_entries').select('*').eq('firm_id', firmId).order('date', { ascending: false }),
    // Calendar + Gmail integration, pass 1 (see migration 0015) — degrade
    // gracefully like documents/time_entries if not yet migrated.
    supabase.from('matter_communications').select('*').eq('firm_id', firmId).order('sent_at', { ascending: false }),
    // Audit log (see migration 0016) — most recent first, capped at 500
    // rows. Embeds the actor's name via the changed_by FK so the History
    // screen doesn't need a separate profiles query (and inherits
    // profiles' own RLS — see AuditLogEntry.profiles in types/index.ts).
    // Same graceful-degrade-if-not-migrated convention as above.
    supabase.from('audit_log').select('*, profiles:changed_by(name)').eq('firm_id', firmId).order('changed_at', { ascending: false }).limit(500),
    // Client Portal MVP (see migration 0018) — same graceful degrade.
    supabase.from('client_invites').select('*').eq('firm_id', firmId).order('created_at', { ascending: false }),
    // No firm_id column on client_users (see migration 0018's comment on
    // why — party_id is the only scoping key that exists) — no explicit
    // filter needed here, "client_users select staff" RLS already scopes
    // this to the caller's own firm via a parties subquery.
    supabase.from('client_users').select('party_id'),
    // E-signature via Dropbox Sign (see migration 0020) — same graceful
    // degrade as documents/time_entries/client_invites. This one matters
    // more than most: the frontend ships ahead of the migration being
    // applied, so until 0020 lands this must come back empty rather than
    // erroring the whole dashboard load.
    supabase.from('signature_requests').select('*').eq('firm_id', firmId).order('created_at', { ascending: false }),
    // Conflict screening inputs. matter_parties has existed since 0002
    // but was never loaded, so role-based conflicts were undetectable.
    // party_relationships is 0022. Both degrade to empty if unmigrated.
    supabase.from('matter_parties').select('*'),
    supabase.from('party_relationships').select('*').eq('firm_id', firmId),
  ]);

  const firm = firmR.error ? null : (firmR.data as Firm ?? null); // degrade gracefully if not yet migrated / row missing
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
  // Degrade to empty (not a hard failure) if 0011 hasn't been applied yet
  // to whatever environment is running this — same pattern as insights/
  // documents above for their own migrations.
  const deadlineRulesRaw = deadlineRulesR.error ? [] : (deadlineRulesR.data ?? []);
  const importBatchesRaw = importBatchesR.error ? [] : (importBatchesR.data ?? []);
  const timeEntriesRaw = timeEntriesR.error ? [] : (timeEntriesR.data ?? []);
  const communicationsRaw = communicationsR.error ? [] : (communicationsR.data ?? []);
  const auditLogRaw = auditLogR.error ? [] : (auditLogR.data ?? []);
  const clientInvitesRaw = clientInvitesR.error ? [] : (clientInvitesR.data ?? []);
  const clientUsersRaw = clientUsersR.error ? [] : (clientUsersR.data ?? []);
  const signatureRequestsRaw = signatureRequestsR.error ? [] : (signatureRequestsR.data ?? []);
  const matterPartiesRaw = matterPartiesR.error ? [] : (matterPartiesR.data ?? []);
  const partyRelationshipsRaw = partyRelationshipsR.error ? [] : (partyRelationshipsR.data ?? []);

  return {
    firm,
    attorneys: attorneys as Attorney[],
    practiceAreas: practiceAreas as PracticeArea[],
    matterStages: matterStages as MatterStage[],
    parties: parties as Party[],
    conflictChecks: conflictChecks as ConflictCheck[],
    matters: matters as Matter[],
    deadlines: deadlines as Deadline[],
    insights: insightsRaw as Insight[],
    documents: documentsRaw as LawDocument[],
    signatureRequests: signatureRequestsRaw as SignatureRequest[],
    matterParties: matterPartiesRaw as MatterParty[],
    partyRelationships: partyRelationshipsRaw as PartyRelationship[],
    agentRequests: agentRequests.map((r: any) => ({ id: r.id, agent_key: r.agent_key, status: r.status })),
    deadlineRules: deadlineRulesRaw as DeadlineRule[],
    importBatches: importBatchesRaw as ImportBatch[],
    timeEntries: timeEntriesRaw as TimeEntry[],
    communications: communicationsRaw as MatterCommunication[],
    auditLog: auditLogRaw as AuditLogEntry[],
    clientInvites: clientInvitesRaw as ClientInvite[],
    clientUsers: clientUsersRaw as ClientUser[],
  };
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const firmId = profile?.firm_id ?? DEMO_TENANT_ID;

  const [state, setState] = useState<StoreState>({
    loading: true, error: null, hasLoadedOnce: false,
    firm: null, attorneys: [], practiceAreas: [], matterStages: [], parties: [], conflictChecks: [], matters: [], deadlines: [], insights: [], documents: [], signatureRequests: [], matterParties: [], partyRelationships: [], agentRequests: [], deadlineRules: [], importBatches: [], timeEntries: [], communications: [], auditLog: [], clientInvites: [], clientUsers: [], integrationConnections: null,
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

  // Firm-level jurisdiction/locale settings (country/region/currency/locale).
  // Schema-only fields added in migration 0007 — this is the one place that
  // writes them (see the firm settings screen).
  const updateFirm = useCallback(async (patch: Partial<Pick<Firm, 'country' | 'region' | 'currency' | 'locale'>>) => {
    if (!isSupabaseConfigured) {
      setState(s => ({ ...s, firm: s.firm ? { ...s.firm, ...patch } : s.firm }));
      showToast('success', 'Saved (preview mode — nothing persists here).');
      return {};
    }
    const { data, error } = await supabase.from('firms').update(patch).eq('id', firmId).select('id,name,country,region,currency,locale').single();
    if (error || !data) { showToast('error', "Couldn't save firm settings."); return { error: error?.message }; }
    setState(s => ({ ...s, firm: data as Firm }));
    showToast('success', 'Firm settings saved.');
    return {};
  }, [firmId]);

  // Practice areas: firm-scoped, seeded on firm creation (see migration
  // 0003's create_firm RPC), principal/manager-only insert+update per the
  // RLS policies in migration 0002 ("practice_areas manage" /
  // "practice_areas manage update"). Unlike `firms` (which has SELECT+INSERT
  // but no UPDATE policy at all — a live-confirmed gap), practice_areas
  // already has both insert and update policies defined in SQL. Live
  // confirmation that they actually work end-to-end (not just exist) is
  // tracked separately — see the deploy/verification notes for this change.
  const addPracticeArea = useCallback(async (pa: { key: string; label: string }) => {
    if (!isSupabaseConfigured) {
      const newPa: PracticeArea = { id: `local-pa-${Date.now()}`, key: pa.key, label: pa.label, is_active: true };
      setState(s => ({ ...s, practiceAreas: [...s.practiceAreas, newPa] }));
      showToast('success', 'Practice area added (preview mode — nothing persists here).');
      return {};
    }
    const { data, error } = await supabase.from('practice_areas').insert({ firm_id: firmId, ...pa, is_active: true }).select().single();
    if (error || !data) {
      showToast('error', error?.code === '23505' ? 'A practice area with that key already exists.' : "Couldn't add that practice area.");
      return { error: error?.message };
    }
    setState(s => ({ ...s, practiceAreas: [...s.practiceAreas, data as PracticeArea] }));
    showToast('success', 'Practice area added.');
    return {};
  }, [firmId]);

  const updatePracticeArea = useCallback(async (id: string, patch: Partial<Pick<PracticeArea, 'is_active' | 'label'>>) => {
    setState(s => ({ ...s, practiceAreas: s.practiceAreas.map(pa => pa.id === id ? { ...pa, ...patch } : pa) }));
    if (!isSupabaseConfigured) return {};
    const { error } = await supabase.from('practice_areas').update(patch).eq('id', id);
    if (error) {
      console.error('[store] updatePracticeArea failed:', error);
      showToast('error', "Couldn't save — try again.");
      await refresh(); // re-pull real server state so the optimistic update above doesn't lie about what's actually saved
      return { error: error.message };
    }
    return {};
  }, [refresh]);

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
    // Computed once, here, and frozen onto the row (see migration 0023) --
    // never recomputed when a past check is reopened from Recent Checks.
    // analyseConflict also walks matter_parties roles and
    // party_relationships edges, both of which can change after the fact,
    // so recomputing later would silently answer a different question
    // than "what did this check find at the time".
    const signals = analyseConflict(searchedName, state.parties, state.matters, state.matterParties, state.partyRelationships);
    if (!isSupabaseConfigured) {
      const cc: ConflictCheck = {
        id: `local-cc-${Date.now()}`, matter_id: matterId, searched_name: searchedName,
        matched_party_ids: matches.map(m => m.id), status: matches.length > 0 ? 'flagged' : 'cleared',
        created_at: new Date().toISOString(), signals,
      };
      setState(s => ({ ...s, conflictChecks: [cc, ...s.conflictChecks] }));
      return cc;
    }
    const status = matches.length > 0 ? 'flagged' : 'cleared';
    const { data, error } = await supabase.from('conflict_checks').insert({
      firm_id: firmId, matter_id: matterId, searched_name: searchedName,
      matched_party_ids: matches.map(m => m.id), status, signals,
    }).select().single();
    if (error || !data) { showToast('error', "Couldn't run the conflict check."); return null; }
    setState(s => ({ ...s, conflictChecks: [data as ConflictCheck, ...s.conflictChecks] }));
    if (matches.length > 0) showToast('error', `${matches.length} potential match${matches.length === 1 ? '' : 'es'} found — review before proceeding.`);
    else showToast('success', 'No conflicts found.');
    return data as ConflictCheck;
  }, [firmId, state.parties, state.matters, state.matterParties, state.partyRelationships]);

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

  // Attaches an additional party (opposing, witness, co-counsel, etc.) to
  // a matter beyond its primary client -- writes into matter_parties (see
  // migration 0002), a table the store has read since conflictSignals.ts
  // started walking it but that had no writer anywhere in the app until
  // the matter detail view.
  const addMatterParty = useCallback(async (matterId: string, partyId: string, role: MatterPartyRole) => {
    const mp: MatterParty = { matter_id: matterId, party_id: partyId, role_in_matter: role };
    if (!isSupabaseConfigured) {
      setState(s => (s.matterParties.some(x => x.matter_id === matterId && x.party_id === partyId && x.role_in_matter === role) ? s : { ...s, matterParties: [...s.matterParties, mp] }));
      return {};
    }
    const { error } = await supabase.from('matter_parties').insert(mp);
    if (error) {
      if (error.code === '23505') return {}; // already linked with this exact role -- not an error
      console.error('[store] addMatterParty failed:', error);
      showToast('error', "Couldn't add that party — try again.");
      return { error: error.message };
    }
    setState(s => ({ ...s, matterParties: [...s.matterParties, mp] }));
    return {};
  }, []);

  const removeMatterParty = useCallback(async (matterId: string, partyId: string, role: MatterPartyRole) => {
    setState(s => ({ ...s, matterParties: s.matterParties.filter(x => !(x.matter_id === matterId && x.party_id === partyId && x.role_in_matter === role)) }));
    if (!isSupabaseConfigured) return;
    const { error } = await supabase.from('matter_parties').delete().eq('matter_id', matterId).eq('party_id', partyId).eq('role_in_matter', role);
    if (error) { console.error('[store] removeMatterParty failed:', error); showToast('error', "Couldn't remove that party — try again."); }
  }, []);

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

  // Attaches an already-run conflict check to a matter — the same
  // attachment NewMatterModal does inline at creation time, split out so
  // matters that never went through that flow (CSV-imported ones, which
  // toMatterInsert deliberately leaves with conflict_check_id: null — see
  // importEngine.ts) can be checked afterward, one at a time or in bulk.
  const linkMatterConflictCheck = useCallback(async (matterId: string, conflictCheckId: string) => {
    setState(s => ({ ...s, matters: s.matters.map(m => m.id === matterId ? { ...m, conflict_check_id: conflictCheckId } : m) }));
    if (!isSupabaseConfigured) return;
    const { error } = await supabase.from('matters').update({ conflict_check_id: conflictCheckId }).eq('id', matterId);
    if (error) { console.error('[store] linkMatterConflictCheck failed:', error); showToast('error', "Couldn't record that conflict check — try again."); }
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
  // segment matching the caller's own firm_id). Storage path convention
  // is unchanged by versioning (migration 0008) — a version is tracked
  // via parent_document_id in the database, not via the storage path.
  // `parentDocumentId`, when passed, must be the ROOT document id of an
  // existing version chain (see DocumentsScreen's same-file-name prompt) —
  // never inferred automatically here.
  const uploadDocument = useCallback(async (file: File, matterId: string | null, parentDocumentId?: string | null) => {
    if (!isSupabaseConfigured) {
      const newDoc: LawDocument = {
        id: `local-doc-${Date.now()}`, matter_id: matterId, file_name: file.name,
        storage_path: `local/${file.name}`, file_type: file.type, file_size: file.size,
        created_at: new Date().toISOString(), parent_document_id: parentDocumentId ?? null,
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
      file_type: file.type, file_size: file.size, parent_document_id: parentDocumentId ?? null,
    }).select().single();
    if (error || !data) {
      // Clean up the orphaned storage object if the metadata row failed
      await supabase.storage.from('matter-documents').remove([path]);
      showToast('error', "Couldn't save that document — try again.");
      return { error: error?.message };
    }
    setState(s => ({ ...s, documents: [data as LawDocument, ...s.documents] }));
    showToast('success', parentDocumentId ? 'New version uploaded.' : 'Document uploaded.');
    // Fire-and-forget: text extraction (see migration 0017 / the
    // extract-document-text edge function) is never awaited here — a
    // slow OCR fallback on a scanned PDF must not make the upload itself
    // feel slow. Failure here doesn't fail the upload; the document just
    // stays 'pending'/'failed' and isn't content-searchable yet.
    supabase.functions.invoke('extract-document-text', { body: { document_id: data.id } }).catch((err) => {
      console.warn('[store] extract-document-text invoke failed:', err);
    });
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

  // Instant self-provisioning (replaces the earlier review-queue model):
  // requesting a specialist activates it immediately — no waiting state,
  // no human gate on whether it exists. "Human in the loop" in this
  // product applies to what an agent produces (drafts/suggestions, still
  // reviewed before anyone relies on them — see AiDisclaimer), not to
  // whether the agent gets turned on. The insert IS the activation; it's
  // written with status:'active' explicitly rather than trusting a DB
  // default, since a stray 'pending' default would resurrect the old
  // waiting-state bug. The notify call after it is fire-and-forget,
  // informational only (see agent-request-notify's updated framing) —
  // it must never block or delay activation, and a failure there must
  // never make the person think the agent isn't live when it already is.
  const requestAgent = useCallback(async (agentKey: string) => {
    if (!isSupabaseConfigured) {
      const localId = `local-agent-request-${Date.now()}`;
      setState(s => ({ ...s, agentRequests: [...s.agentRequests, { id: localId, agent_key: agentKey, status: 'active' }] }));
      showToast('success', 'Activated (preview mode — nothing persists here).');
      return;
    }
    const { data, error } = await supabase.from('agent_requests').insert({ tenant_id: firmId, agent_key: agentKey, status: 'active' }).select('id,agent_key,status').single();
    if (error) {
      if (error.code === '23505') { showToast('error', "You've already activated this agent."); return; }
      console.error('[store] requestAgent failed:', error);
      showToast('error', "Couldn't activate that agent — try again.");
      return;
    }
    setState(s => ({ ...s, agentRequests: [...s.agentRequests, { id: data.id, agent_key: data.agent_key, status: data.status }] }));
    showToast('success', 'Activated — available in your sidebar now.');

    if (data?.id && profile) {
      // Informational log only, never in the critical path — activation
      // above has already happened and is already reflected in state
      // regardless of whether this succeeds.
      supabase.functions.invoke('agent-request-notify', {
        body: {
          requestId: data.id,
          firmName: profile.firm_name,
          requesterName: profile.name,
          requesterRole: profile.role,
        },
      }).catch(err => console.error('[store] agent-request-notify failed (non-fatal, informational only):', err));
    }
  }, [firmId, profile]);

  const removeAgentRequest = useCallback(async (id: string) => {
    setState(s => ({ ...s, agentRequests: s.agentRequests.filter(r => r.id !== id) }));
    if (!isSupabaseConfigured) {
      showToast('success', 'Removed (preview mode — nothing persists here).');
      return;
    }
    const { error } = await supabase.from('agent_requests').delete().eq('id', id);
    if (error) {
      console.error('[store] removeAgentRequest failed:', error);
      showToast('error', "Couldn't remove that agent — try again.");
      await refresh(); // resync — the optimistic removal above may now be wrong
      return;
    }
    showToast('success', 'Agent removed.');
  }, [refresh]);

  // CSV import tooling (migration 0012). `rows` are already validated and
  // resolved (party/matter/attorney lookups done) by the import engine
  // before this is ever called — this action's only job is the actual
  // writes: create the batch record, bulk-insert the rows tagged with
  // it, and keep local state in sync. Never called with unvalidated rows.
  const commitImportBatch = useCallback(async (entityType: 'parties' | 'matters' | 'deadlines', rows: Record<string, any>[]) => {
    if (rows.length === 0) return { batch: null, created: [] };

    if (!isSupabaseConfigured) {
      const localBatch: ImportBatch = {
        id: `local-import-batch-${Date.now()}`, entity_type: entityType, row_count: rows.length,
        created_by: profile?.id ?? null, created_at: new Date().toISOString(),
      };
      const created = rows.map((r, i) => ({ ...r, id: `local-${entityType}-import-${Date.now()}-${i}`, import_batch_id: localBatch.id }));
      setState(s => ({
        ...s,
        importBatches: [localBatch, ...s.importBatches],
        [entityType]: [...(s[entityType] as any[]), ...created],
      } as StoreState));
      showToast('success', `${created.length} ${entityType} imported (preview mode — nothing persists here).`);
      return { batch: localBatch, created };
    }

    const { data: batchRow, error: batchError } = await supabase
      .from('import_batches')
      .insert({ firm_id: firmId, entity_type: entityType, row_count: rows.length, created_by: profile?.id ?? null })
      .select()
      .single();
    if (batchError || !batchRow) {
      console.error('[store] commitImportBatch failed creating batch record:', batchError);
      showToast('error', "Couldn't start that import — try again.");
      return { batch: null, created: [] };
    }

    const rowsToInsert = rows.map(r => ({ ...r, firm_id: firmId, import_batch_id: batchRow.id }));
    const { data: createdRows, error: insertError } = await supabase.from(entityType).insert(rowsToInsert).select();
    if (insertError || !createdRows) {
      console.error('[store] commitImportBatch failed inserting rows:', insertError);
      // Nothing was actually created — don't leave an orphan batch record
      // claiming row_count rows exist when zero do.
      await supabase.from('import_batches').delete().eq('id', batchRow.id);
      showToast('error', `Couldn't import ${entityType} — ${insertError?.message ?? 'try again'}.`);
      return { batch: null, created: [] };
    }

    setState(s => ({
      ...s,
      importBatches: [batchRow as ImportBatch, ...s.importBatches],
      [entityType]: [...(s[entityType] as any[]), ...createdRows],
    } as StoreState));
    showToast('success', `${createdRows.length} ${entityType} imported.`);
    return { batch: batchRow as ImportBatch, created: createdRows };
  }, [firmId, profile]);

  const removeImportBatch = useCallback(async (batchId: string, entityType: 'parties' | 'matters' | 'deadlines') => {
    if (!isSupabaseConfigured) {
      setState(s => ({
        ...s,
        importBatches: s.importBatches.filter(b => b.id !== batchId),
        [entityType]: (s[entityType] as any[]).filter((r: any) => r.import_batch_id !== batchId),
      } as StoreState));
      showToast('success', 'Import removed (preview mode — nothing persists here).');
      return;
    }
    // Delete the actual imported rows first — this IS the rollback. The
    // batch record's ON DELETE SET NULL alone would just strip the tag
    // and leave the bad data in place, which defeats the point.
    const { error: deleteRowsError } = await supabase.from(entityType).delete().eq('import_batch_id', batchId).eq('firm_id', firmId);
    if (deleteRowsError) {
      console.error('[store] removeImportBatch failed deleting rows:', deleteRowsError);
      showToast('error', "Couldn't remove that import — try again.");
      return;
    }
    const { error: deleteBatchError } = await supabase.from('import_batches').delete().eq('id', batchId);
    if (deleteBatchError) console.error('[store] removeImportBatch: rows removed but batch record cleanup failed (non-fatal):', deleteBatchError);
    setState(s => ({
      ...s,
      importBatches: s.importBatches.filter(b => b.id !== batchId),
      [entityType]: (s[entityType] as any[]).filter((r: any) => r.import_batch_id !== batchId),
    } as StoreState));
    showToast('success', 'Import removed.');
  }, [firmId]);

  // Billing Phase 1 — time capture only (see migration 0013). currency is
  // always taken from firm.currency here, never accepted from the
  // caller — the whole point of pulling it from firm settings is that
  // nobody gets asked to re-enter it per entry, so there's no path that
  // lets a form silently pass something else through.
  const addTimeEntry = useCallback(async (entry: Omit<TimeEntry, 'id' | 'created_at' | 'created_by' | 'currency'>) => {
    const currency = state.firm?.currency ?? null;
    if (!isSupabaseConfigured) {
      const newEntry: TimeEntry = {
        ...entry, id: `local-time-entry-${Date.now()}`, created_by: profile?.id ?? null, currency, created_at: new Date().toISOString(),
      };
      setState(s => ({ ...s, timeEntries: [newEntry, ...s.timeEntries] }));
      showToast('success', 'Time logged (preview mode — nothing persists here).');
      return {};
    }
    const { data, error } = await supabase.from('time_entries').insert({
      ...entry, firm_id: firmId, created_by: profile?.id ?? null, currency,
    }).select().single();
    if (error || !data) {
      console.error('[store] addTimeEntry failed:', error);
      showToast('error', "Couldn't log that time — try again.");
      return { error: error?.message };
    }
    setState(s => ({ ...s, timeEntries: [data as TimeEntry, ...s.timeEntries] }));
    showToast('success', 'Time logged.');
    return {};
  }, [firmId, profile, state.firm]);

  const updateTimeEntry = useCallback(async (id: string, patch: Partial<Pick<TimeEntry, 'matter_id' | 'attorney_id' | 'date' | 'duration_minutes' | 'rate' | 'description' | 'billable'>>) => {
    setState(s => ({ ...s, timeEntries: s.timeEntries.map(t => t.id === id ? { ...t, ...patch } : t) }));
    if (!isSupabaseConfigured) {
      showToast('success', 'Time entry updated (preview mode — nothing persists here).');
      return {};
    }
    const { error } = await supabase.from('time_entries').update(patch).eq('id', id);
    if (error) {
      console.error('[store] updateTimeEntry failed:', error);
      showToast('error', "Couldn't save that change — try again.");
      await refresh(); // resync — the optimistic update above may now be wrong (e.g. RLS silently scoped it to 0 rows)
      return { error: error.message };
    }
    showToast('success', 'Time entry updated.');
    return {};
  }, [refresh]);

  const deleteTimeEntry = useCallback(async (id: string) => {
    setState(s => ({ ...s, timeEntries: s.timeEntries.filter(t => t.id !== id) }));
    if (!isSupabaseConfigured) {
      showToast('success', 'Time entry deleted (preview mode — nothing persists here).');
      return;
    }
    const { error } = await supabase.from('time_entries').delete().eq('id', id);
    if (error) {
      console.error('[store] deleteTimeEntry failed:', error);
      showToast('error', "Couldn't delete — try again.");
      await refresh();
      return;
    }
    showToast('success', 'Time entry deleted.');
  }, [refresh]);

  // Calendar + Gmail integration, pass 1 (see migration 0015). One shared
  // status check rather than each screen (Deadlines, matter email compose)
  // running its own — so "is Gmail connected?" never disagrees between
  // two places on the same screen render.
  const refreshIntegrations = useCallback(async () => {
    if (!isSupabaseConfigured) { setState(s => ({ ...s, integrationConnections: [] })); return; }
    try {
      const { data, error } = await supabase.functions.invoke('composio', { body: { action: 'status' } });
      if (!error && data?.connections) setState(s => ({ ...s, integrationConnections: data.connections }));
    } catch (e) {
      console.error('[store] refreshIntegrations failed:', e);
    }
  }, []);

  useEffect(() => { refreshIntegrations(); }, [refreshIntegrations]);

  // Explicit, one-click push of a single deadline to the firm's connected
  // Google Calendar — never automatic on create/edit. A critical deadline
  // that silently fails to reach someone's actual calendar is worse than
  // requiring this click, so there's no background sync path at all here.
  // One-directional: Law OS -> Calendar only, nothing flows back.
  const pushDeadlineToCalendar = useCallback(async (deadlineId: string) => {
    const deadline = state.deadlines.find(d => d.id === deadlineId);
    if (!deadline) return { error: 'Deadline not found' };
    if (!isSupabaseConfigured) {
      setState(s => ({ ...s, deadlines: s.deadlines.map(d => d.id === deadlineId ? { ...d, calendar_event_id: `local-event-${Date.now()}` } : d) }));
      showToast('success', 'Added to calendar (preview mode — nothing persists here).');
      return {};
    }
    const matter = mattersRef.current.find(m => m.id === deadline.matter_id);
    try {
      const { data, error } = await supabase.functions.invoke('composio', {
        body: {
          action: 'push_deadline_to_calendar',
          title: deadline.title,
          due_date: deadline.due_date,
          matter_title: matter?.title ?? null,
        },
      });
      if (error || !data?.event_id) throw new Error(data?.error ?? error?.message ?? 'Unknown error');
      await updateDeadline(deadlineId, { calendar_event_id: data.event_id });
      showToast('success', 'Added to calendar.');
      return {};
    } catch (e: any) {
      console.error('[store] pushDeadlineToCalendar failed:', e);
      showToast('error', e?.message || "Couldn't add that to the calendar — try again.");
      return { error: e?.message };
    }
  }, [state.deadlines, updateDeadline]);

  // Sends a real email through the firm's connected Gmail and logs it
  // against the matter, in one request (see the composio edge function's
  // send_matter_email action) — the log is written server-side in the
  // same call that sends, so a successful send is never left unrecorded.
  const sendMatterCommunication = useCallback(async (input: { matter_id: string; sent_to: string; subject: string; body: string }) => {
    if (!isSupabaseConfigured) {
      const newComm: MatterCommunication = { id: `local-comm-${Date.now()}`, sent_by: profile?.id ?? null, sent_at: new Date().toISOString(), ...input };
      setState(s => ({ ...s, communications: [newComm, ...s.communications] }));
      showToast('success', 'Email sent (preview mode — nothing persists here).');
      return {};
    }
    try {
      const { data, error } = await supabase.functions.invoke('composio', { body: { action: 'send_matter_email', ...input } });
      if (error || !data?.ok) throw new Error(data?.error ?? error?.message ?? 'Unknown error');
      if (data.communication) setState(s => ({ ...s, communications: [data.communication, ...s.communications] }));
      showToast(data.warning ? 'error' : 'success', data.warning ?? 'Email sent.');
      return {};
    } catch (e: any) {
      console.error('[store] sendMatterCommunication failed:', e);
      showToast('error', e?.message || "Couldn't send that email — try again.");
      return { error: e?.message };
    }
  }, [profile]);

  // Client Portal MVP (see migration 0018) — creates the invite row;
  // sending it is a copy-to-clipboard link, same convention as
  // TeamScreen's staff invites (no outbound-email infra change here).
  const inviteClientToPortal = useCallback(async (partyId: string, email: string) => {
    if (!isSupabaseConfigured) {
      showToast('success', 'Invite link copied (preview mode — nothing persists here).');
      return {};
    }
    const { data, error } = await supabase.from('client_invites').insert({
      firm_id: firmId, party_id: partyId, email, invited_by: profile?.id ?? null,
    }).select().single();
    if (error || !data) { showToast('error', "Couldn't create that invite — try again."); return { error: error?.message }; }
    setState(s => ({ ...s, clientInvites: [data as ClientInvite, ...s.clientInvites] }));
    return { invite: data as ClientInvite };
  }, [firmId, profile]);

  // Sharing a document with the client portal is an explicit, per-document
  // toggle — never a bulk/default action (see migration 0018's comment on
  // why client_visible defaults false). Requires the "documents update"
  // RLS policy added in migration 0019 — documents had NO update policy
  // at all before that (only select/insert/delete, since migration
  // 0005), which meant this write used to silently match zero rows: no
  // error, nothing persisted, while the optimistic setState below made
  // the toggle look like it worked. Confirmed live before the fix:
  // client_visible stayed false in the database after a "successful"
  // toggle in the UI.
  //
  // .select().single() below is deliberate, not decorative — it's what
  // actually catches that failure mode. A bare .update() with no .select()
  // returns { error: null } even when RLS silently filtered the write to
  // zero affected rows, since PostgREST doesn't treat "matched nothing"
  // as an error on its own. Asking for the row back means "no row came
  // back" is something this code can see and react to, instead of
  // trusting a 200 that didn't actually mean success.
  const setDocumentClientVisible = useCallback(async (documentId: string, visible: boolean) => {
    setState(s => ({ ...s, documents: s.documents.map(d => d.id === documentId ? { ...d, client_visible: visible } : d) }));
    if (!isSupabaseConfigured) return;
    const { data, error } = await supabase.from('documents').update({ client_visible: visible }).eq('id', documentId).select('id, client_visible').single();
    if (error || !data || data.client_visible !== visible) {
      console.error('[store] setDocumentClientVisible failed:', error ?? 'update affected no rows');
      showToast('error', "Couldn't update sharing for that document — try again.");
      setState(s => ({ ...s, documents: s.documents.map(d => d.id === documentId ? { ...d, client_visible: !visible } : d) }));
    }
  }, []);

  // All three of these go through the dropbox-sign edge function rather
  // than writing signature_requests directly: the vendor API key must
  // never reach the browser, and the status transitions are only
  // trustworthy if they come from the vendor via the service role (a
  // client-side write of status='signed' would be forgeable).
  const sendForSignature = useCallback(async (documentId: string, recipientEmail: string, recipientName?: string) => {
    if (!isSupabaseConfigured) {
      showToast('error', 'E-signature needs a real backend — not available in local dev-data mode.');
      return { error: 'dev mode' };
    }
    const { data, error } = await supabase.functions.invoke('dropbox-sign', {
      body: { action: 'send', document_id: documentId, recipient_email: recipientEmail, recipient_name: recipientName },
    });
    const msg = error ? (data?.error ?? error.message) : data?.error;
    if (msg) {
      console.error('[store] sendForSignature failed:', msg);
      showToast('error', `Couldn't send for signature: ${msg}`);
      return { error: String(msg) };
    }
    // Re-read rather than optimistically constructing the row locally —
    // the function fills in fields (vendor id, created_at) the client
    // doesn't know, and getting them wrong would show a row that doesn't
    // match what's actually stored.
    const { data: rows } = await supabase.from('signature_requests').select('*').eq('document_id', documentId).order('created_at', { ascending: false });
    if (rows) setState(s => ({ ...s, signatureRequests: [...(rows as SignatureRequest[]), ...s.signatureRequests.filter(r => r.document_id !== documentId)] }));
    showToast('success', `Sent to ${recipientEmail} for signature.`);
    return {};
  }, []);

  const refreshSignatureStatus = useCallback(async (signatureRequestId: string) => {
    if (!isSupabaseConfigured) return { error: 'dev mode' };
    const { data, error } = await supabase.functions.invoke('dropbox-sign', { body: { action: 'status', id: signatureRequestId } });
    const msg = error ? (data?.error ?? error.message) : data?.error;
    if (msg) {
      console.error('[store] refreshSignatureStatus failed:', msg);
      showToast('error', `Couldn't check signature status: ${msg}`);
      return { error: String(msg) };
    }
    // A completed signature creates a new documents row (the signed
    // version), so documents have to be re-read too, not just the request.
    await refresh();
    return {};
  }, []);

  const cancelSignatureRequest = useCallback(async (signatureRequestId: string) => {
    if (!isSupabaseConfigured) return { error: 'dev mode' };
    const prev = signatureRequestId;
    const { data, error } = await supabase.functions.invoke('dropbox-sign', { body: { action: 'cancel', id: signatureRequestId } });
    const msg = error ? (data?.error ?? error.message) : data?.error;
    if (msg) {
      console.error('[store] cancelSignatureRequest failed:', msg);
      showToast('error', `Couldn't cancel that signature request: ${msg}`);
      return { error: String(msg) };
    }
    setState(s => ({ ...s, signatureRequests: s.signatureRequests.filter(r => r.id !== prev) }));
    showToast('success', 'Signature request cancelled.');
    return {};
  }, []);

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
      refresh, updateFirm, addPracticeArea, updatePracticeArea, addParty, runConflictCheck, clearConflictCheck, addMatter, addMatterParty, removeMatterParty, updateMatterStage, updateMatterAttorney, linkMatterConflictCheck, addDeadline, updateDeadline, addInsights, uploadDocument, deleteDocument, requestAgent, removeAgentRequest, commitImportBatch, removeImportBatch, addTimeEntry, updateTimeEntry, deleteTimeEntry, refreshIntegrations, pushDeadlineToCalendar, sendMatterCommunication, inviteClientToPortal, setDocumentClientVisible, sendForSignature, refreshSignatureStatus, cancelSignatureRequest,
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
