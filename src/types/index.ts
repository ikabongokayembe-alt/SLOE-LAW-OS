export interface Attorney {
  id: string;
  name: string;
  bar_number?: string;
  specialization?: string;
  matters_active: number;
  matters_closed_ytd: number;
}

export interface PracticeArea {
  id: string;
  key: string;
  label: string;
  is_active: boolean;
}

export interface MatterStage {
  id: string;
  practice_area_id: string | null;
  stage_key: string;
  label: string;
  sort_order: number;
  is_initial: boolean;
  is_terminal: boolean;
}

export interface Party {
  id: string;
  name: string;
  party_type: 'individual' | 'organization';
  aliases: string[];
  notes?: string;
}

export type ConflictCheckStatus = 'pending' | 'cleared' | 'flagged' | 'waived';

export interface ConflictCheck {
  id: string;
  matter_id: string | null;
  searched_name: string;
  matched_party_ids: string[];
  status: ConflictCheckStatus;
  cleared_by?: string;
  cleared_at?: string;
  notes?: string;
  created_at: string;
}

export type BillingType = 'hourly' | 'contingency' | 'flat_fee' | 'retainer';
export type MatterStatus = 'active' | 'on_hold' | 'closed';

export interface Matter {
  id: string;
  title: string;
  practice_area_id: string | null;
  stage_id: string;
  client_party_id: string | null;
  assigned_attorney_id: string | null;
  status: MatterStatus;
  billing_type: BillingType;
  conflict_check_id: string | null;
  opened_date: string;
  closed_date?: string | null;
  description?: string;
}

export type DeadlineType = 'statute_of_limitations' | 'filing' | 'court_date' | 'other';
export type DeadlineStatus = 'upcoming' | 'completed' | 'missed';

export interface Deadline {
  id: string;
  matter_id: string | null;
  title: string;
  deadline_type: DeadlineType;
  due_date: string;
  status: DeadlineStatus;
  assigned_to: string | null;
  is_critical: boolean;
  reminder_days_before: number;
}

export interface Insight {
  id: string;
  type: string;
  headline: string;
  body: string;
  reasoning?: string;
  references?: string[];
  confidence?: number;
  suggested_actions?: { label: string; action_type: string }[];
  scope?: string;
}
