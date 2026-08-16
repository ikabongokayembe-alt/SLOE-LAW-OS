// Conflict screening beyond exact-name matching.
//
// ─────────────────────────────────────────────────────────────────────
// WHAT THIS RETURNS, AND WHAT IT REFUSES TO SAY
//
// Every finding is a PATH — an observed chain of stored rows connecting
// the searched name to something already in the firm's data. It is never
// a verdict. Whether a path disqualifies depends on jurisdiction, the
// representation, consent and screening, none of which this code knows.
// The UI must render these as "here is what connects, decide", in the
// same discipline as the SOL engine citing only what it can verify.
//
// Three signal classes, in descending strength of evidence:
//
//   1. DIRECT   — the name matches a party by name or alias. This is
//                 what the existing search already did; what is new is
//                 reporting WHICH alias matched and WHAT ROLES that
//                 party holds across matters, rather than just "found".
//   2. ROLE     — that party is on another matter in an opposing or
//                 adverse role. matter_parties has existed since 0002
//                 and nothing ever queried it, so the classic conflict
//                 its own schema comment describes has been invisible.
//   3. RELATED  — one hop across party_relationships (0022) to a party
//                 who holds a role somewhere. Weakest of the three and
//                 labelled as such: an employment link is a reason to
//                 look, not a finding.
//
// Only ONE hop is walked. Two hops through a firm's party graph reaches
// almost everything and would bury the real signal in noise — and a
// chain that long is not something an attorney can evaluate at a glance,
// which is the whole point of surfacing it here.
// ─────────────────────────────────────────────────────────────────────

import { Party, Matter, MatterParty, PartyRelationship } from '../types';

export type ConflictSignalKind = 'direct' | 'role' | 'related';

export interface ConflictSignal {
  kind: ConflictSignalKind;
  party: Party;
  // Human-readable chain, e.g. "Acme Corp — employer of Jane Doe".
  path: string;
  // The concrete facts behind it, each one a stored row.
  facts: string[];
  // True when the path reaches an adverse role on a live matter, which
  // is the subset most worth reading first. Not a legal conclusion.
  adverse: boolean;
}

// Mirrors relationship_inverse() in migration 0022. Duplicated here
// rather than round-tripping to the database for a label: the migration
// is the source of truth and this must be updated with it.
const INVERSE: Record<string, string> = {
  employee_of: 'employer of',
  officer_of: 'has officer',
  owner_of: 'is owned by',
  subsidiary_of: 'parent of',
  affiliate_of: 'affiliate of',
  family_of: 'family of',
  business_partner_of: 'business partner of',
  counsel_for: 'represented by',
};
const readable = (rel: string) => rel.replace(/_/g, ' ');

// Roles that put a party on the other side. 'witness' and 'co_counsel'
// are deliberately excluded from `adverse` — they are worth surfacing
// but calling them adverse would overstate what the row says.
const ADVERSE_ROLES = new Set(['opposing']);

function normalise(s: string): string {
  return s.toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
}

// Bidirectional substring, matching what runConflictCheck already does,
// but reporting WHICH string matched so the result can explain itself.
function matchReason(query: string, p: Party): string | null {
  const q = normalise(query);
  if (!q) return null;
  const name = normalise(p.name);
  if (name.includes(q) || q.includes(name)) return `name "${p.name}"`;
  for (const a of p.aliases ?? []) {
    const al = normalise(a);
    if (al && (al.includes(q) || q.includes(al))) return `alias "${a}"`;
  }
  return null;
}

export function analyseConflict(
  query: string,
  parties: Party[],
  matters: Matter[],
  matterParties: MatterParty[],
  relationships: PartyRelationship[],
): ConflictSignal[] {
  const q = normalise(query);
  if (!q) return [];

  const partyById = new Map(parties.map(p => [p.id, p]));
  const matterById = new Map(matters.map(m => [m.id, m]));

  // Every role a party holds, described in full, so a finding can say
  // "opposing party on Lopez — Divorce (active)" rather than "on 1 matter".
  const rolesOf = (partyId: string) => {
    const out: { text: string; adverse: boolean }[] = [];
    for (const mp of matterParties) {
      if (mp.party_id !== partyId) continue;
      const m = matterById.get(mp.matter_id);
      if (!m || m.deleted_at) continue;
      out.push({
        text: `${mp.role_in_matter.replace('_', '-')} on ${m.title} (${m.status})`,
        adverse: ADVERSE_ROLES.has(mp.role_in_matter) && m.status === 'active',
      });
    }
    // The primary client link lives on matters, not matter_parties.
    for (const m of matters) {
      if (m.client_party_id !== partyId || m.deleted_at) continue;
      out.push({ text: `client on ${m.title} (${m.status})`, adverse: false });
    }
    return out;
  };

  const signals: ConflictSignal[] = [];
  const seen = new Set<string>();

  // ── 1 & 2: direct name/alias matches, and the roles they hold ──────
  const directMatches: Party[] = [];
  for (const p of parties) {
    const why = matchReason(query, p);
    if (!why) continue;
    directMatches.push(p);
    const roles = rolesOf(p.id);
    const adverse = roles.some(r => r.adverse);
    signals.push({
      kind: adverse ? 'role' : 'direct',
      party: p,
      path: p.name,
      facts: [
        `Matched on ${why}.`,
        ...(roles.length
          ? roles.map(r => `Appears as ${r.text}.`)
          : ['Not currently linked to any matter.']),
      ],
      adverse,
    });
    seen.add(p.id);
  }

  // ── 3: one hop across the relationship graph ───────────────────────
  // Edges are walked from BOTH columns, because the graph stores one
  // direction only (see 0022) and a connection is a connection whichever
  // end the matched party sits on.
  for (const dm of directMatches) {
    for (const rel of relationships) {
      let otherId: string | null = null;
      let label = '';
      if (rel.party_id === dm.id) {
        otherId = rel.related_party_id;
        label = `${dm.name} — ${readable(rel.relationship)} ${partyById.get(rel.related_party_id)?.name ?? 'a party'}`;
      } else if (rel.related_party_id === dm.id) {
        otherId = rel.party_id;
        label = `${partyById.get(rel.party_id)?.name ?? 'A party'} — ${readable(rel.relationship)} ${dm.name}`;
      }
      if (!otherId || seen.has(otherId)) continue;
      const other = partyById.get(otherId);
      if (!other) continue;
      const roles = rolesOf(other.id);
      // A related party with no role anywhere connects to nothing worth
      // reporting — the edge alone is not a conflict signal.
      if (roles.length === 0) continue;
      seen.add(other.id);
      signals.push({
        kind: 'related',
        party: other,
        path: INVERSE[rel.relationship]
          ? `${other.name} — ${INVERSE[rel.relationship]} ${dm.name}`
          : label,
        facts: [
          `Connected to the searched name via a recorded ${readable(rel.relationship)} relationship.`,
          ...roles.map(r => `${other.name} appears as ${r.text}.`),
          ...(rel.notes ? [`Note on the relationship: ${rel.notes}`] : []),
          'Relationship links are recorded by your firm — this is a reason to look, not a finding.',
        ],
        adverse: roles.some(r => r.adverse),
      });
    }
  }

  // Adverse first, then direct matches, then the weaker related hops.
  const rank = (s: ConflictSignal) => (s.adverse ? 0 : s.kind === 'related' ? 2 : 1);
  return signals.sort((a, b) => rank(a) - rank(b));
}
