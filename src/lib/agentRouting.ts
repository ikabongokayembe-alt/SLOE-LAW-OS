/**
 * AGENT ROUTING CONVENTION (App-Wide Rule for SLOE LAW OS):
 *
 * In SLOE LAW OS, any "hand this to an agent" action or quick-action button
 * anywhere in the app MUST route by TASK TYPE rather than ad-hoc destinations:
 *
 * 1. DRAFTING / ACTION / EXECUTING -> Operator (/operator)
 *    - Examples: drafting emails, drafting responses, drafting client updates, taking action.
 *
 * 2. UNDERSTANDING / SUMMARIZING / INTERNAL DATA -> Analyst (/analyst)
 *    - Examples: summarizing documents, analyzing matter bottlenecks, extracting insights, risk signals.
 *
 * 3. EXTERNAL LEGAL RESEARCH / CASE LAW -> Specialist Agent (e.g. /agents/case-law-researcher)
 *    - Examples: researching relevant case law, statutory authority, legal precedents.
 *
 * ACTIVATION MODEL:
 * Agent activation is PER-FIRM (tenant-wide). A specialist agent is active if its `agent_key`
 * is present with `status: 'active'` in `agentRequests` for the firm (`tenant_id`). Core agents
 * (`operator`, `analyst`) are built-in and always active for all firms.
 */

export type AgentTaskType = 'drafting' | 'analysis' | 'research';

export interface HandoffTarget {
  agentKey: string;
  agentName: string;
  route: string;
  isCore: boolean;
}

export function getHandoffTarget(taskType: AgentTaskType): HandoffTarget {
  switch (taskType) {
    case 'drafting':
      return { agentKey: 'operator', agentName: 'Operator', route: '/operator', isCore: true };
    case 'analysis':
      return { agentKey: 'analyst', agentName: 'Analyst', route: '/analyst', isCore: true };
    case 'research':
      return { agentKey: 'case-law-researcher', agentName: 'Legal Research Agent', route: '/agents/case-law-researcher', isCore: false };
  }
}

export function buildAgentHandoffUrl(target: HandoffTarget, prompt: string): string {
  return `${target.route}?q=${encodeURIComponent(prompt)}`;
}

export function isDocumentResearchRelevant(fileName: string, fileType?: string): boolean {
  const lower = (fileName + ' ' + (fileType ?? '')).toLowerCase();
  return /(motion|pleading|complaint|brief|discovery|subpoena|opinion|order|ruling|statute|petition|affidavit|court|law)/i.test(lower);
}
