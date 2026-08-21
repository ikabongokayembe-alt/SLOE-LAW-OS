// Operator/Analyst conversation threads (migration 0021).
//
// Deliberately NOT in store.tsx. Everything there is firm-wide state
// loaded once at boot and held for the session; conversations are
// per-user, per-agent, paginated-by-nature, and only needed on two
// screens. Putting them in the global store would mean every screen
// re-renders when a message arrives in a thread nobody is looking at.
//
// Every query here is creator-scoped by RLS, not by a filter written
// below. The `.eq('created_by', ...)` calls are belt-and-braces for
// clarity — remove them and the policies still return the same rows.
// That ordering matters: the security boundary is the database, and
// nothing in this file should be read as establishing it.

import { supabase } from './supabase';
import { OperatorConversation, OperatorMessage } from '../types';

export type AgentKey = 'operator' | 'analyst';

// A thread's title comes from the first user message. Trimmed to a
// length that fits the list without wrapping, on a word boundary where
// one exists nearby, so "Chen custody — what's the filing deadline for
// the amended petition?" becomes "Chen custody — what's the filing…"
// rather than a hard mid-word cut. Falls back to a fixed string because
// title is NOT NULL and an all-whitespace first message would otherwise
// violate the constraint.
export function titleFromMessage(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return 'Untitled conversation';
  if (clean.length <= 60) return clean;
  const cut = clean.slice(0, 60);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut) + '…';
}

export async function listConversations(agent: AgentKey): Promise<OperatorConversation[]> {
  const { data, error } = await supabase
    .from('operator_conversations')
    .select('*')
    .eq('agent', agent)
    .is('deleted_at', null)
    .order('last_message_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as OperatorConversation[];
}

export async function listMessages(conversationId: string): Promise<OperatorMessage[]> {
  const { data, error } = await supabase
    .from('operator_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as OperatorMessage[];
}

export async function createConversation(
  agent: AgentKey, firmId: string, userId: string, firstMessage: string,
): Promise<OperatorConversation> {
  try {
    const { data, error } = await supabase
      .from('operator_conversations')
      .insert({ agent, firm_id: firmId, created_by: userId, title: titleFromMessage(firstMessage) })
      .select('*')
      .single();
    if (error) throw error;
    return data as OperatorConversation;
  } catch (err) {
    console.warn('[conversations] DB createConversation failed, falling back to local thread:', err);
    return {
      id: `local-conv-${Date.now()}`,
      firm_id: firmId,
      created_by: userId,
      agent,
      title: titleFromMessage(firstMessage),
      created_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
      unread: false,
      deleted_at: null,
    };
  }
}

export async function renameConversation(id: string, title: string): Promise<void> {
  const clean = title.replace(/\s+/g, ' ').trim();
  // title is NOT NULL — refuse to write an empty rename rather than
  // letting the database reject it and surfacing a constraint error.
  if (!clean) return;
  if (id.startsWith('local-')) return;
  const { error } = await supabase.from('operator_conversations').update({ title: clean }).eq('id', id);
  if (error) throw error;
}

// firm_id is omitted on purpose: the before-insert trigger stamps it
// from the parent conversation, and anything sent here would be
// overwritten. Sending it anyway would imply the client is trusted to
// set it, which is exactly what that trigger exists to prevent.
export async function appendMessage(
  conversationId: string, role: 'user' | 'assistant', content: string,
): Promise<OperatorMessage> {
  if (conversationId.startsWith('local-')) {
    return {
      id: `local-msg-${Date.now()}`,
      conversation_id: conversationId,
      role,
      content,
      created_at: new Date().toISOString(),
    };
  }
  try {
    const { data, error } = await supabase
      .from('operator_messages')
      .insert({ conversation_id: conversationId, role, content })
      .select('*')
      .single();
    if (error) throw error;
    return data as OperatorMessage;
  } catch (err) {
    console.warn('[conversations] DB appendMessage failed, falling back to local message:', err);
    return {
      id: `local-msg-${Date.now()}`,
      conversation_id: conversationId,
      role,
      content,
      created_at: new Date().toISOString(),
    };
  }
}

// The trigger sets unread = true on EVERY assistant insert, including
// one that arrives while the author is sitting on the thread reading it.
// That is correct at the database level (it can't know who is looking),
// and wrong at the UI level, so the caller clears it immediately after
// an assistant reply lands in an open thread. Failure here is
// deliberately swallowed by callers: a stale badge is a cosmetic
// problem and must not surface as an error over a reply that arrived
// fine.
export async function markRead(id: string): Promise<void> {
  const { error } = await supabase.from('operator_conversations').update({ unread: false }).eq('id', id);
  if (error) throw error;
}

export async function softDeleteConversation(id: string): Promise<void> {
  const { error } = await supabase
    .from('operator_conversations')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export interface ConversationSearchHit {
  conversation: OperatorConversation;
  // Present only for a content match — the message that matched, so the
  // list can show why a thread came back rather than just its title.
  snippet?: string;
}

// Two indexes exist for two different jobs, so both are used rather
// than picking one: trigram on title catches "chen" in "Chen custody"
// including partial and fuzzy words, and the tsvector on message
// content catches a phrase the user remembers saying but never put in
// a title. Searching only titles would miss most of what people
// actually remember; searching only content would fail to find a thread
// they named and never wrote much in.
//
// Results are merged here rather than in SQL because a single query
// would need a view or an RPC, and adding either means touching the
// migration — which is done and verified, and not to be reopened.
export async function searchConversations(
  agent: AgentKey, query: string,
): Promise<ConversationSearchHit[]> {
  const q = query.trim();
  if (!q) return [];

  const titleQ = supabase
    .from('operator_conversations')
    .select('*')
    .eq('agent', agent)
    .is('deleted_at', null)
    .ilike('title', `%${q}%`)
    .order('last_message_at', { ascending: false })
    .limit(25);

  // websearch_to_tsquery rather than plainto_tsquery: it tolerates
  // quotes and OR from someone typing a search the way they'd type one
  // into a search engine, instead of erroring on punctuation.
  const contentQ = supabase
    .from('operator_messages')
    .select('conversation_id, content, created_at, operator_conversations!inner(*)')
    .textSearch('content_tsv', q, { type: 'websearch', config: 'english' })
    .eq('operator_conversations.agent', agent)
    .is('operator_conversations.deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);

  const [titleRes, contentRes] = await Promise.all([titleQ, contentQ]);
  if (titleRes.error) throw titleRes.error;
  if (contentRes.error) throw contentRes.error;

  const byId = new Map<string, ConversationSearchHit>();
  for (const c of (titleRes.data ?? []) as OperatorConversation[]) {
    byId.set(c.id, { conversation: c });
  }
  for (const row of (contentRes.data ?? []) as any[]) {
    const conv = row.operator_conversations as OperatorConversation;
    if (!conv) continue;
    const existing = byId.get(conv.id);
    // A title hit already in the map keeps its place but gains the
    // snippet, so a thread matching both ways isn't listed twice.
    if (existing) { existing.snippet ??= excerpt(row.content, q); continue; }
    byId.set(conv.id, { conversation: conv, snippet: excerpt(row.content, q) });
  }

  return [...byId.values()].sort(
    (a, b) => +new Date(b.conversation.last_message_at) - +new Date(a.conversation.last_message_at),
  );
}

// Plain-text excerpt centred on the match. Returns a string, never
// markup — this is rendered as React text, so nothing a user or the
// model typed into a message can become HTML.
function excerpt(content: string, query: string, radius = 60): string {
  const flat = content.replace(/\s+/g, ' ').trim();
  const term = query.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  const at = term ? flat.toLowerCase().indexOf(term) : -1;
  if (at < 0) return flat.slice(0, radius * 2) + (flat.length > radius * 2 ? '…' : '');
  const start = Math.max(0, at - radius);
  const end = Math.min(flat.length, at + term.length + radius);
  return (start > 0 ? '…' : '') + flat.slice(start, end) + (end < flat.length ? '…' : '');
}
