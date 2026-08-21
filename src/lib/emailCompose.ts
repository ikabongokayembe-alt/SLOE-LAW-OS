// Draft-and-send email from any agent's chat — Operator, Analyst, and
// every specialist (SpecialistAgentScreen is one shared component for
// all six, so wiring it once covers all of them).
//
// ═════════════════════════════════════════════════════════════════════
// THE BOUNDARY, STATED EXPLICITLY (same discipline as
// _shared/composioTools.ts on the server side)
//
//   The MODEL never learns or invents a recipient email address. It
//   only picks a party_id from a closed list of this firm's real
//   parties (see emailComposePrompt) — the caller then re-validates
//   that id is actually in the list before trusting it, and resolves
//   the real address in CODE, from client_invites or a matter's own
//   past matter_communications. If neither exists, the recipient field
//   is left BLANK, never guessed at (no firstname.lastname@ pattern, no
//   invented domain). SendEmailModal's own canSubmit already requires
//   a plausible email string before Send is enabled, so a blank
//   recipient means Send is disabled until a human fills one in.
//
//   Nothing here sends anything. This module only produces a draft;
//   SendEmailModal → sendMatterCommunication → composio's
//   send_matter_email action (unchanged) is the only path an email can
//   actually leave through, and that path still requires the explicit
//   Send click.
// ═════════════════════════════════════════════════════════════════════

import { callGemini } from './gemini';
import { emailIntentClassifyPrompt, emailComposePrompt } from './prompts';
import { Matter, Party, ClientInvite, MatterCommunication } from '../types';

export interface ComposedEmail {
  matterId: string | null;
  partyId: string | null;
  partyName: string | null;
  to: string;
  subject: string;
  body: string;
  recipientResolved: boolean;
}

export interface EmailComposeContext {
  matters: Matter[];
  parties: Party[];
  clientInvites: ClientInvite[];
  communications: MatterCommunication[];
}

// Caps mirror composioTools.ts's MAX_TOTAL_TOOLS reasoning: an unbounded
// list handed to the model both costs tokens on every compose call and,
// past a point, is not something the model reliably attends to in full
// anyway. A firm large enough to hit this needs the compose feature
// scoped by an already-open matter, not solved by raising a constant.
const MAX_CANDIDATES = 300;

// Looked up in code, never asked of the model. client_invites is
// checked first — an email a human explicitly entered to invite this
// exact party to the portal is the strongest signal available. The
// fallback only fires when that is absent AND the matter's past sends
// all went to exactly one address: with two or more distinct addresses
// there is no way to know which one belongs to which party without
// guessing, so it resolves to nothing rather than picking one.
export function resolveRecipientEmail(
  partyId: string | null,
  matterId: string | null,
  ctx: Pick<EmailComposeContext, 'clientInvites' | 'communications'>,
): string {
  if (!partyId) return '';

  const invites = ctx.clientInvites
    .filter(i => i.party_id === partyId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  if (invites[0]?.email) return invites[0].email;

  if (matterId) {
    const sentTo = new Set(
      ctx.communications.filter(c => c.matter_id === matterId).map(c => c.sent_to.trim().toLowerCase()),
    );
    if (sentTo.size === 1) return [...sentTo][0];
  }

  return '';
}

async function classifyIsEmailRequest(message: string): Promise<boolean> {
  // Fast regex pre-filter — if message clearly doesn't ask to draft/write an email, save 3-4s latency overhead
  if (!/\b(email|draft an email|write an email|compose an email|send an email|outreach|client update)\b/i.test(message)) {
    return false;
  }
  try {
    const out = await callGemini(emailIntentClassifyPrompt(message), false, 'email_draft_classify');
    return /^\s*yes\b/i.test(String(out));
  } catch {
    return false; // a classification failure must fall through to normal chat, never block it
  }
}

// Returns null when the message isn't an email request, or when the
// classify/compose calls themselves fail — in both cases the caller
// should proceed with its normal chat reply instead. This is a
// deliberate fail-open-to-normal-chat, not a fail-open-to-sending:
// nothing in this module can cause an email to go out.
export async function tryComposeEmail(message: string, ctx: EmailComposeContext): Promise<ComposedEmail | null> {
  if (!(await classifyIsEmailRequest(message))) return null;

  const matterCandidates = ctx.matters.slice(0, MAX_CANDIDATES).map(m => ({ id: m.id, label: m.title }));
  const partyCandidates = ctx.parties.slice(0, MAX_CANDIDATES).map(p => ({ id: p.id, label: p.name }));

  let raw: any;
  try {
    raw = await callGemini(emailComposePrompt(message, matterCandidates, partyCandidates), true, 'email_draft');
  } catch {
    return null;
  }

  // Re-validate membership even though the prompt already constrained
  // the choices to a closed list — a model can still return an id
  // shaped like the others that was never actually offered. Same
  // defense-in-depth reasoning as execute_tool re-checking a tool's
  // classification server-side rather than trusting discovery-time
  // filtering.
  const matter = ctx.matters.find(m => m.id === raw?.matter_id) ?? null;
  const party = ctx.parties.find(p => p.id === raw?.party_id) ?? null;

  const subject = typeof raw?.subject === 'string' && raw.subject.trim() ? raw.subject.trim() : 'Following up';
  const body = typeof raw?.body === 'string' ? raw.body.trim() : '';

  const to = resolveRecipientEmail(party?.id ?? null, matter?.id ?? null, ctx);

  return {
    matterId: matter?.id ?? null,
    partyId: party?.id ?? null,
    partyName: party?.name ?? null,
    to,
    subject,
    body,
    recipientResolved: !!to,
  };
}
