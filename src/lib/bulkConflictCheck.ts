import { Matter, Party, ConflictCheck } from '../types';

interface BulkConflictCheckDeps {
  matters: Matter[];
  parties: Party[];
  runConflictCheck: (searchedName: string, matterId: string | null) => Promise<ConflictCheck | null>;
  linkMatterConflictCheck: (matterId: string, conflictCheckId: string) => Promise<void>;
  onProgress?: (done: number, total: number) => void;
}

export interface BulkConflictCheckResult {
  cleared: number;
  flagged: number;
  skipped: number;
}

// The bulk "run conflict check on every selected matter" action --
// originally built inline in MattersScreen for its kanban multi-select,
// pulled out here so Command Center's bundled "N matters need a conflict
// check" card can trigger the exact same action, not a re-implementation
// of it. Behavior is unchanged from the original inline version: skip a
// matter with no resolvable client name, otherwise run the check and
// link it to the matter, one at a time (each runConflictCheck call reads
// current store state, so running them concurrently would race).
export async function runBulkConflictChecks(matterIds: string[], deps: BulkConflictCheckDeps): Promise<BulkConflictCheckResult> {
  const { matters, parties, runConflictCheck, linkMatterConflictCheck, onProgress } = deps;
  const clientName = (id: string | null) => parties.find(p => p.id === id)?.name ?? '—';

  let cleared = 0, flagged = 0, skipped = 0, done = 0;
  for (const id of matterIds) {
    const matter = matters.find(m => m.id === id);
    const name = matter ? clientName(matter.client_party_id) : null;
    if (!matter || !name || name === '—') {
      skipped++;
    } else {
      const result = await runConflictCheck(name, matter.id);
      if (result) {
        await linkMatterConflictCheck(matter.id, result.id);
        if (result.status === 'flagged') flagged++; else cleared++;
      } else {
        skipped++;
      }
    }
    done++;
    onProgress?.(done, matterIds.length);
  }
  return { cleared, flagged, skipped };
}
