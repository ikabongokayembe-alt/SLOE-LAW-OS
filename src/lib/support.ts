import { supabase } from './supabase';

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export interface SupportRequestRecord {
  id: string;
  firm_id: string | null;
  user_id: string | null;
  subject: string;
  message: string;
  status: 'open' | 'resolved' | 'in_progress';
  created_at: string;
}

async function getAuthHeader(): Promise<string> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) return `Bearer ${token}`;
  } catch {
    // ignore
  }
  return `Bearer ${ANON}`;
}

export async function submitSupportRequest(subject: string, message: string): Promise<{ success: boolean; requestId: string }> {
  const { data: authData } = await supabase.auth.getSession();
  const userId = authData?.session?.user?.id || null;

  let firmId: string | null = null;
  if (userId) {
    const { data: profile } = await supabase.from('profiles').select('firm_id').eq('id', userId).single();
    firmId = profile?.firm_id || null;
  }

  // 1. Insert row into support_requests table
  const { data: inserted, error: dbErr } = await supabase
    .from('support_requests')
    .insert({
      firm_id: firmId,
      user_id: userId,
      subject: subject.trim(),
      message: message.trim(),
      status: 'open',
    })
    .select('id')
    .single();

  if (dbErr) {
    console.error('[support] Failed to insert support_requests row:', dbErr.message);
    throw new Error(`Database error: ${dbErr.message}`);
  }

  const requestId = inserted.id;

  // 2. Fire-and-forget email notification via Edge Function support-request-notify
  try {
    const authHeader = await getAuthHeader();
    await fetch(`${SUPA_URL}/functions/v1/support-request-notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
        apikey: ANON,
      },
      body: JSON.stringify({
        request_id: requestId,
        subject: subject.trim(),
        message: message.trim(),
      }),
    });
  } catch (err) {
    console.warn('[support] support-request-notify Edge Function call failed (DB row saved successfully):', err);
  }

  return { success: true, requestId };
}

export async function fetchFirmSupportRequests(): Promise<SupportRequestRecord[]> {
  const { data, error } = await supabase
    .from('support_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[support] Failed to fetch support_requests:', error.message);
    return [];
  }

  return (data || []) as SupportRequestRecord[];
}
