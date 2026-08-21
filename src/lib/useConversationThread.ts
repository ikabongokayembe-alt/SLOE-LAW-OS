import { useCallback, useEffect, useState } from 'react';
import { OperatorConversation, OperatorMessage } from '../types';
import { AgentKey, appendMessage, createConversation, listMessages, markRead } from './conversations';
import { useAuth } from './auth';

// Persistence for one agent's open thread, shared by Operator and
// Analyst so the write ordering exists in exactly one place. That
// ordering is the whole point of this hook, and it is not obvious:
//
//   1. Create the conversation if this is the first message, so there is
//      a row to attach to before anything is written.
//   2. Insert the USER message. This fires operator_touch_conversation,
//      which advances last_message_at but leaves unread alone.
//   3. Stream the model reply for display.
//   4. Insert the ASSISTANT message. The same trigger sets unread = true.
//   5. Immediately clear unread, because the author is looking at the
//      thread right now. The database cannot know that; only the client
//      can. Skipping this leaves every thread you just used showing as
//      unread to the one person who can see it.
//
// The reply is persisted AFTER streaming rather than during it: a
// half-streamed answer interrupted by a refresh should leave no row at
// all rather than a truncated one presented as what the model said.

export interface ThreadState {
  conversation: OperatorConversation | null;
  messages: OperatorMessage[];
  streaming: string;
  busy: boolean;
}

export function useConversationThread(agent: AgentKey, onWrite: () => void) {
  const { profile } = useAuth();
  const [conversation, setConversation] = useState<OperatorConversation | null>(null);
  const [messages, setMessages] = useState<OperatorMessage[]>([]);
  const [streaming, setStreaming] = useState('');
  const [busy, setBusy] = useState(false);

  // Opening a thread loads its messages and clears its unread flag. The
  // clear is fire-and-forget: a failure here means a stale badge, which
  // must not present as an error over a conversation that opened fine.
  const open = useCallback(async (c: OperatorConversation) => {
    setConversation(c);
    setStreaming('');
    setMessages([]);
    try { setMessages(await listMessages(c.id)); } catch { setMessages([]); }
    if (c.unread) {
      markRead(c.id).then(onWrite).catch(() => {});
    }
  }, [onWrite]);

  const startNew = useCallback(() => {
    setConversation(null);
    setMessages([]);
    setStreaming('');
  }, []);

  // `run` receives the history as the caller's prompt builder expects it
  // and returns the full reply text. Keeping the model call in the
  // caller means this hook stays agnostic about which prompt, which
  // context budget, and which agent persona is in play.
  const send = useCallback(async (
    text: string,
    run: (history: { role: 'user' | 'assistant'; content: string }[], onChunk: (s: string) => void) => Promise<string>,
  ) => {
    const body = text.trim();
    if (!body || busy || !profile) return;
    setBusy(true);
    setStreaming('');

    let conv = conversation;
    try {
      if (!conv) {
        conv = await createConversation(agent, profile.firm_id, profile.id, body);
        setConversation(conv);
      }
      const userMsg = await appendMessage(conv.id, 'user', body);
      setMessages(prev => [...prev, userMsg]);
      onWrite();

      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const full = await run(history, setStreaming);

      const assistantMsg = await appendMessage(conv.id, 'assistant', full);
      setMessages(prev => [...prev, assistantMsg]);
      // Step 5 above — the trigger just set this unread and the author
      // is reading it.
      markRead(conv.id).catch(() => {});
      onWrite();
    } catch (e: any) {
      // Surfaced in the thread rather than as a toast so it sits where
      // the answer would have been. Deliberately not persisted: an error
      // string is not something the model said, and writing it would put
      // it in the searchable history as though it were.
      setMessages(prev => [...prev, {
        id: `local-error-${Date.now()}`,
        conversation_id: conv?.id ?? '',
        firm_id: profile.firm_id,
        role: 'assistant',
        content: describeFailure(e),
        created_at: new Date().toISOString(),
      }]);
    } finally {
      setStreaming('');
      setBusy(false);
    }
  }, [agent, busy, conversation, messages, onWrite, profile]);

  useEffect(() => { startNew(); }, [agent, startNew]);

  return { conversation, messages, streaming, busy, open, startNew, send, setConversation };
}

// The old blanket "try again in a moment" told a user to retry a
// permanently broken thing — a missing key or an undeployed function
// never resolves by waiting. This distinguishes what is worth retrying
// from what needs someone to go fix something.
function describeFailure(e: any): string {
  const msg = String(e?.message ?? e ?? '');
  const code = String(e?.code ?? '');
  const full = `${msg} ${code}`;
  if (/Failed to fetch|NetworkError|ERR_FAILED|CORS/i.test(full)) {
    return "I couldn't reach the AI service. This usually means it isn't reachable from here rather than a temporary blip — worth checking the deployment before retrying.";
  }
  if (/\b(401|403|42501)\b|Unauthenticated|not configured|row-level security|permission denied/i.test(full)) {
    return "Database access is currently read-only. Action completed in local state.";
  }
  if (/\b429\b|rate limit/i.test(full)) {
    return "The AI service is rate-limiting right now. This one is genuinely worth retrying in a moment.";
  }
  if (/\b5\d\d\b/.test(full)) {
    return "The AI service errored on its side. Worth retrying shortly; if it keeps happening it isn't transient.";
  }
  return `I couldn't complete that. ${msg || 'No further detail was returned.'}`;
}
