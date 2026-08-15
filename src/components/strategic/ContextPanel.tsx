import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useStore } from '../../lib/store';
import { ContextBuildResult } from '../../lib/contextBuilder';

// Renders what was ACTUALLY sent to the model on the most recent request
// (contextUsage, from StrategicScreen's buildFirmContext call) — never the
// full, untruncated store state. This panel used to compute its own counts
// straight from useStore() regardless of what the prompt actually included,
// which meant it kept claiming "Analyzing 42 active matters, 151 tracked
// deadlines..." even on requests where the model received 5 matters and
// zero deadlines. Confirmed live at volume (62 matters / 151 deadlines):
// the Analyst said outright it had no deadline data while this panel sat
// next to it claiming otherwise — actively misleading, worse than no
// indicator. Before any request has been sent, there's nothing "analyzed"
// yet, so this shows what's available rather than claiming to have looked
// at it.
export function ContextPanel({
  activeTab, hasInteracted, contextUsage,
}: { activeTab: string; hasInteracted: boolean; contextUsage: ContextBuildResult | null }) {
  const { matters, deadlines, parties } = useStore();

  // Below lg this panel is a collapsible disclosure rather than a side
  // column: at 375-414px a 35% column leaves the chat ~240px and wraps
  // this panel's text to one word per line, and the two overlap. Starts
  // collapsed so the chat owns the viewport, but the toggle is always
  // visible so the context stays one tap away — it is never hidden with
  // no way back. At lg+ the toggle is gone and the panel is always open,
  // exactly as before.
  const [open, setOpen] = useState(false);

  return (
    <div className="w-full lg:w-[35%] shrink-0 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-4 lg:p-6 overflow-y-auto">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls="context-panel-body"
        className="lg:hidden w-full flex items-center justify-between gap-2 text-xs uppercase font-mono tracking-widest text-[var(--text-tertiary)]"
      >
        <span>Context in use</span>
        <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <h3 className="hidden lg:block text-xs uppercase font-mono tracking-widest text-[var(--text-tertiary)] mb-6">Context in use</h3>

      <div id="context-panel-body" className={`${open ? 'block' : 'hidden'} lg:block mt-4 lg:mt-0 space-y-4`}>
        <div className="bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded px-4 py-3">
           <div className="text-[10px] font-mono text-[var(--text-tertiary)] mb-1">DATA SOURCE</div>
           {contextUsage ? (
             <>
               <div className="text-sm">
                 {['matters', 'deadlines', 'parties', 'conflictChecks'].filter(k => contextUsage.usage[k]).map((k, i, arr) => {
                   const { included, total } = contextUsage.usage[k];
                   // Always plural — "1 of 62 matters" reads correctly; a
                   // singular/plural-by-count version of this previously
                   // produced "1 of 62 matter" and "1 of 82 partie" (wrong
                   // pluralization of "party"), so plural-always sidesteps
                   // that whole class of bug.
                   const label = k === 'conflictChecks' ? 'conflict checks' : k;
                   const complete = included === total;
                   return (
                     <span key={k}>
                       {i > 0 ? (i === arr.length - 1 ? ', and ' : ', ') : 'Analyzing '}
                       {complete ? `all ${total}` : `${included} of ${total}`} {label}
                     </span>
                   );
                 })}
               </div>
               {contextUsage.truncated && (
                 <div className="text-xs text-[var(--signal-warning)] mt-1.5">
                   Context limit reached — some records were left out (a full summary of totals/urgency was still included; ask about a specific matter, attorney, or date range to see more directly).
                 </div>
               )}
             </>
           ) : (
             <div className="text-sm text-[var(--text-secondary)]">
               Available: {matters.length} matter{matters.length === 1 ? '' : 's'}, {deadlines.length} deadline{deadlines.length === 1 ? '' : 's'}, {parties.length} part{parties.length === 1 ? 'y' : 'ies'} on file — nothing sent to the Analyst yet.
             </div>
           )}
        </div>

        <div className="bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded px-4 py-3">
           <div className="text-[10px] font-mono text-[var(--text-tertiary)] mb-1">FILTER</div>
           <div className="flex flex-wrap gap-2 mt-2">
             <span className="px-2 py-0.5 bg-[var(--bg-elevated)] rounded border border-[var(--border-subtle)] text-xs font-mono">Scope: {activeTab}</span>
           </div>
        </div>

        {!hasInteracted && (
          <div className="text-xs text-[var(--text-tertiary)] italic">
            Ask the Analyst something — references it cites will show up here.
          </div>
        )}
      </div>
   </div>
  );
}
