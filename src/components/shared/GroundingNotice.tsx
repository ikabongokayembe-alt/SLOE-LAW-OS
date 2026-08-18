import { Database } from 'lucide-react';

// Persistent, non-dismissible answer to "how do I know this isn't just
// making things up" -- the #1 reason solo/small-firm attorneys (this
// product's actual target) avoid AI tools per sourced research, and the
// lowest-scoring gap in a full product audit before this: the product
// already computes every flag from real stored data (see
// lib/urgentActions.ts, lib/riskSignals.ts, lib/conflictSignals.ts --
// none of them call a model), but nothing ever told a skeptical
// first-time user that. Placed on Command Center, the landing screen, as
// a quiet persistent line rather than a one-time modal someone dismisses
// on visit #1 and never sees again -- it needs to still be findable on
// visit #50.
//
// The wording is deliberately narrow, matching the per-card "General
// guidance — not jurisdiction-verified" label already used on individual
// findings (see DashboardScreen's ActionCard): some cards add general
// legal framing on top of a real fact, and that framing is honestly
// unverified. This notice says exactly that, not more -- it would be its
// own violation of the "don't invent trust claims" instruction to imply
// every word on every card is a verified legal rule when it isn't.
export function GroundingNotice() {
  return (
    <div className="flex items-start gap-1.5 text-[11px] text-[var(--text-tertiary)]">
      <Database className="w-3 h-3 shrink-0 mt-0.5" />
      <span>
        Every flag and finding below is computed from your firm's own stored records — a due date, an unresolved conflict check, logged time — never invented.
        Where a card adds general legal framing (marked "General guidance"), that commentary isn't a verified rule for your jurisdiction, but the fact that triggered it always is real.
      </span>
    </div>
  );
}
