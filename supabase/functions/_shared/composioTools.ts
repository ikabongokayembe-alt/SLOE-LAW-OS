// Boundary for dynamically-discovered Composio tools.
//
// ═════════════════════════════════════════════════════════════════════
// THE BOUNDARY, STATED EXPLICITLY
//
//   Dynamically-discovered tools are READ-ONLY. Full stop.
//
//   The model may call any tool that classifies as a read against the
//   firm's own connected account. It may NOT call a dynamically-named
//   write tool — not send, not create, not draft, not modify, not
//   delete — regardless of what the model asks for.
//
//   Writes remain exactly where they are: the two narrow, fixed-argument,
//   logged actions in composio/index.ts (send_matter_email,
//   push_deadline_to_calendar). Those are unchanged by this file and
//   must stay that way. A write goes out only through a path a human
//   reviewed, with arguments the product shaped — never arguments the
//   model improvised against a tool it named itself.
//
// WHY NOT THE REFERENCE'S DESIGN
//
//   Sloe Laboratory's composio-tools.ts does NOT gate writes. Its
//   toolRank() is an ORDERING function that decides which tools survive
//   a per-app cap of 45; rank 0 — the tier most likely to be kept —
//   explicitly includes send, create, draft, reply, update, add, upload.
//   Its "DEFENSIVE" section is about untrusted SCHEMAS, not authority.
//   That is a reasonable posture for a general business OS. It is not
//   the right one here: an improvised email from a law firm's account to
//   a client, or a deleted thread, is a professional-consequence event,
//   not a UX annoyance. The asymmetry is the whole argument — a
//   misclassified read exposes the user's own mailbox to the user; a
//   misclassified write acts on the world in the firm's name.
//
// WHY CLASSIFICATION IS A DENYLIST FIRST, AND FAILS CLOSED
//
//   Tool slugs and descriptions are vendor strings we do not control and
//   that change without notice. So:
//     * destructive/admin patterns are checked FIRST, so "delete draft"
//       is never rescued by the word "draft";
//     * a tool must MATCH a read pattern to be allowed — an unrecognised
//       tool is denied, not permitted;
//     * classification is re-run at EXECUTION time, server-side, not
//       merely at discovery. The model can emit any string it likes as a
//       function name, including one never offered to it, so the check
//       that matters is the one on the way in.
// ═════════════════════════════════════════════════════════════════════

export type ToolClass = 'read' | 'write' | 'denied';

// Checked first. Anything matching is denied outright and never offered.
const DESTRUCTIVE = /\b(delete|remove|trash|discard|purge|archive|revoke|permission|setting|settings|admin|delegate|delegation|forward|vacation|autoreply|auto_reply|filter|watch|stop|batch|import|export|transfer|move|modify|patch|update|insert|create|add|send|reply|draft|upload|write|share|invite|schedule|accept|decline|cancel)\b/;

// A tool must match one of these to be offered at all. Deliberately
// narrow verbs — retrieval only.
const READ = /\b(get|list|search|read|fetch|find|retrieve|count|view|show)\b/;

// Classification runs on the SLUG only, never the description. A
// description is prose the vendor may change freely and can easily
// contain "get" while the tool deletes something; the slug is the
// operation's identity.
// A Composio tool slug is UPPER_SNAKE_CASE and nothing else. Validating
// the SHAPE before classifying the CONTENT closes a hole found in
// testing: "GMAIL_FETCH_EMAILS; DROP" classified as a read, because the
// classifier only ever asked which words appeared, never whether the
// string was a plausible slug at all. Composio would likely 404 such a
// name, but "the vendor will reject it" is precisely the assumption this
// module exists not to make.
const VALID_SLUG = /^[A-Za-z][A-Za-z0-9_]{2,80}$/;

export function classifyTool(slug: string): ToolClass {
  if (!VALID_SLUG.test(String(slug ?? ''))) return 'denied';
  // Separators MUST be normalised to spaces before matching. Composio
  // slugs are UPPER_SNAKE_CASE, and `_` is a word character in JS regex,
  // so `\bsend\b` does NOT match "gmail_send_email". Tested against real
  // slugs: without this line every one of GMAIL_FETCH_EMAILS,
  // GMAIL_SEND_EMAIL, GMAIL_DELETE_MESSAGE and the rest classified as
  // 'denied' — safe, but the denylist was silently matching nothing while
  // appearing to work, and no tool would ever have been offered.
  const s = String(slug ?? '').toLowerCase().replace(/[_\-.]+/g, ' ').trim();
  if (!s) return 'denied';
  if (DESTRUCTIVE.test(s)) return 'write';
  if (READ.test(s)) return 'read';
  return 'denied'; // unrecognised → denied, never permitted by default
}

export function isReadTool(slug: string): boolean {
  return classifyTool(slug) === 'read';
}

// Caps. Untrusted schemas at runtime, so declarations must not balloon.
export const MAX_TOOLS_PER_TOOLKIT = 24;
export const MAX_TOTAL_TOOLS = 64;
const MAX_SCHEMA_DEPTH = 5;
const MAX_DESCRIPTION = 600;

const ALLOWED_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'array', 'object']);

// Reduce an arbitrary JSON Schema to the subset Gemini accepts in a
// function declaration. Unsupported keywords ($ref, oneOf/anyOf/allOf,
// additionalProperties, patternProperties, format, ...) are dropped
// rather than passed through, because an invalid declaration fails the
// WHOLE model turn — one malformed vendor schema must not take down an
// unrelated question. Returns null when nothing salvageable remains, and
// the caller drops that single tool.
export function sanitiseSchema(node: any, depth = 0): any | null {
  if (!node || typeof node !== 'object' || depth > MAX_SCHEMA_DEPTH) return null;

  let type = node.type;
  if (Array.isArray(type)) type = type.find((t: any) => ALLOWED_TYPES.has(t));
  if (typeof type !== 'string' || !ALLOWED_TYPES.has(type)) return null;

  const out: any = { type };
  if (typeof node.description === 'string') out.description = node.description.slice(0, MAX_DESCRIPTION);
  if (Array.isArray(node.enum)) {
    const vals = node.enum.filter((v: any) => typeof v === 'string' || typeof v === 'number');
    if (vals.length) out.enum = vals;
  }

  if (type === 'object') {
    const props = node.properties && typeof node.properties === 'object' ? node.properties : {};
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(props)) {
      const c = sanitiseSchema(v, depth + 1);
      if (c) clean[k] = c;
    }
    out.properties = clean;
    if (Array.isArray(node.required)) {
      // A required key whose schema was dropped would make the
      // declaration unsatisfiable, so required is filtered to what
      // actually survived.
      const req = node.required.filter((r: any) => typeof r === 'string' && clean[r]);
      if (req.length) out.required = req;
    }
  }

  if (type === 'array') {
    const items = sanitiseSchema(node.items, depth + 1);
    if (!items) return null; // an array with no usable item type is unusable
    out.items = items;
  }

  return out;
}

export interface OfferedTool {
  name: string;
  description: string;
  parameters: any;
  toolkit: string;
}

// Turns raw Composio tool schemas into Gemini function declarations,
// dropping anything that is not a read or cannot be sanitised. The
// returned list is what the model is ALLOWED to see — but seeing is not
// permission: execution re-checks independently.
export function buildOfferedTools(rawByToolkit: Record<string, any[]>): OfferedTool[] {
  const out: OfferedTool[] = [];
  for (const [toolkit, raw] of Object.entries(rawByToolkit)) {
    let kept = 0;
    for (const t of raw ?? []) {
      if (out.length >= MAX_TOTAL_TOOLS || kept >= MAX_TOOLS_PER_TOOLKIT) break;
      const slug = t?.slug ?? t?.name;
      if (!slug || !isReadTool(slug)) continue;
      const params = sanitiseSchema(t?.input_parameters ?? t?.parameters ?? { type: 'object', properties: {} });
      if (!params || params.type !== 'object') continue;
      out.push({
        name: String(slug),
        description: String(t?.description ?? '').slice(0, MAX_DESCRIPTION),
        parameters: params,
        toolkit,
      });
      kept++;
    }
  }
  return out;
}
