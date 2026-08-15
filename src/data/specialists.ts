import { UserCheck, Clock as ClockIcon, FileSearch, FileText, ShieldAlert, Search } from 'lucide-react';

// Single source of truth for the specialist agent catalog. Previously
// duplicated (with drift risk called out in comments) between
// AgentLibraryScreen and AgentLibraryTeaserCard; now also consumed by
// Sidebar (to render an active specialist's nav entry) and
// SpecialistAgentScreen (to look up display info + which store slices to
// ground its prompt in) — four consumers made "kept in sync manually" no
// longer viable, especially for the sidebar where a stale/missing icon or
// label would be an immediately visible product bug, not just cosmetic
// drift in a secondary list.

export type SpecialistCategory = 'research' | 'intake' | 'billing' | 'compliance';

// Keys into StoreState that this agent's chat should be grounded in —
// SpecialistAgentScreen picks these out of useStore() to build its
// context object. Kept intentionally narrow per agent (matches each
// agent's stated "Access" scope below) rather than handing every agent
// the entire firm's data by default.
export type ContextKey = 'matters' | 'deadlines' | 'parties' | 'conflictChecks' | 'documents' | 'practiceAreas';

export interface SpecialistAgent {
  key: string;
  name: string;
  category: SpecialistCategory;
  icon: any;
  description: string;
  match: string;
  access: string;
  contextKeys: ContextKey[];
  relevantIf: (hourlyCount: number, activeCount: number, criticalCount: number) => boolean;
}

export const SPECIALISTS: SpecialistAgent[] = [
  {
    key: 'legal_research', name: 'Legal Research Agent', category: 'research', icon: FileSearch,
    description: 'Pulls relevant case law, statutes, and precedent for a specific matter on request.',
    match: 'Every matter benefits from case-law support — always a reasonable next hire.',
    access: 'Case law and statute search only — no client or matter data leaves your workspace.',
    contextKeys: ['matters', 'practiceAreas'],
    relevantIf: () => true,
  },
  {
    key: 'client_intake', name: 'Client Intake Agent', category: 'intake', icon: UserCheck,
    description: 'Structured intake questionnaire and initial fact-gathering before a consultation.',
    match: 'Matches firms with a dedicated Reception role or high intake volume.',
    access: 'New party/lead records created during intake — nothing from existing matters.',
    contextKeys: ['parties', 'practiceAreas', 'conflictChecks'],
    relevantIf: () => true,
  },
  {
    key: 'billing_time_entry', name: 'Billing & Time Entry Agent', category: 'billing', icon: ClockIcon,
    description: 'Drafts time entry descriptions from raw notes and flags unbilled work nearing month-end.',
    match: 'Matches this firm: hourly-billed matters need consistent time entries.',
    access: 'Matter billing type and time entries only — no trust account or invoice data.',
    contextKeys: ['matters'],
    relevantIf: (hourlyCount) => hourlyCount > 0,
  },
  {
    key: 'discovery_assistant', name: 'Discovery Assistant', category: 'research', icon: Search,
    description: 'Organizes and summarizes discovery documents for a matter.',
    match: 'Matches this firm: caseload is large enough that manual review is starting to slow things down.',
    access: 'Only documents explicitly shared with it for one specific matter at a time.',
    contextKeys: ['documents', 'matters', 'parties'],
    relevantIf: (_, activeCount) => activeCount > 3,
  },
  {
    key: 'contract_review', name: 'Contract Review Agent', category: 'research', icon: FileText,
    description: 'Flags unusual clauses and deviations from standard templates in a draft contract.',
    match: 'Matches corporate/transactional practice areas.',
    access: 'The specific document you upload for review — nothing else in your workspace.',
    contextKeys: ['documents', 'matters'],
    relevantIf: () => true,
  },
  {
    key: 'deadline_compliance', name: 'Deadline Compliance Agent', category: 'compliance', icon: ShieldAlert,
    description: 'Cross-checks every open matter against jurisdiction-specific filing rules and flags at-risk deadlines.',
    match: 'Matches this firm: critical, statute-of-limitations-sensitive deadlines are on file right now.',
    access: 'Matter deadlines and applicable jurisdiction rules only.',
    contextKeys: ['deadlines', 'matters'],
    relevantIf: (_, __, criticalCount) => criticalCount > 0,
  },
];

export function getSpecialist(key: string): SpecialistAgent | undefined {
  return SPECIALISTS.find(s => s.key === key);
}

export const CATEGORY_LABELS: Record<SpecialistCategory, string> = {
  research: 'Research', intake: 'Intake', billing: 'Billing', compliance: 'Compliance',
};
