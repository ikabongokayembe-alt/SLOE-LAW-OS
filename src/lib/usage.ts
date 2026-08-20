import { supabase } from './supabase';
import { summarizeUsageEvents, UsageCostSummary, UsageSummaryEvent, monthStartIso } from '../../supabase/functions/_shared/cost';

export async function fetchFirmUsageEvents(firmId: string, sinceIso?: string): Promise<UsageSummaryEvent[]> {
  const since = sinceIso || monthStartIso();
  const { data, error } = await supabase
    .from('usage_events')
    .select('event_type, event_data, created_at')
    .eq('firm_id', firmId)
    .gte('created_at', since)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[usage] Failed to fetch firm usage events:', error.message);
    return [];
  }

  return (data || []) as UsageSummaryEvent[];
}

export async function getFirmUsageSummary(firmId: string, sinceIso?: string): Promise<UsageCostSummary> {
  const since = sinceIso || monthStartIso();
  const events = await fetchFirmUsageEvents(firmId, since);
  return summarizeUsageEvents(events, since);
}
