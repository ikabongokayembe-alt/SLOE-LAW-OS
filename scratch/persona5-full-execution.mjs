import { createClient } from '@supabase/supabase-js';
import { jsPDF } from 'jspdf';

const url = 'https://jrmouvvweiwmbvflwdtt.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpybW91dnZ3ZWl3bWJ2Zmx3ZHR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNjkzODMsImV4cCI6MjEwMTk0NTM4M30.iimQCvfjYm_cjv4Mcj7P8tPINfcMnkiROqzUxb9MuRg';

const supabase = createClient(url, anonKey);

async function main() {
  console.log('====================================================');
  console.log('PERSONA 5 VERIFICATION: SARAH KIM (OKAFOR FAMILY LAW)');
  console.log('====================================================\n');

  // 1. Authenticate Sarah Kim
  const email = `sarah.kim.1787244763840@okaforfamilylaw.test`;
  const password = 'StrongPassword123!';

  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
  if (authErr) {
    throw new Error(`Auth failed for Sarah Kim: ${authErr.message}`);
  }

  const token = authData.session.access_token;
  const userId = authData.user.id;
  
  const authedClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: profile } = await authedClient.from('profiles').select('*').eq('id', userId).single();
  const firmId = profile.firm_id;
  console.log(`Authenticated Sarah Kim: User ID=${userId}, Firm ID=${firmId}, Role=${profile.role}`);

  // Ensure matter exists for Okafor Family Law
  let matterId;
  const { data: existingMatters } = await authedClient.from('matters').select('id, title').eq('firm_id', firmId).is('deleted_at', null).limit(1);
  
  if (existingMatters && existingMatters.length > 0) {
    matterId = existingMatters[0].id;
    console.log(`Using existing matter: "${existingMatters[0].title}" (${matterId})`);
  } else {
    const { data: stages } = await authedClient.from('matter_stages').select('id').eq('firm_id', firmId).order('sort_order').limit(1);
    const stageId = stages?.[0]?.id;

    const { data: newMatter, error: matErr } = await authedClient.from('matters').insert({
      firm_id: firmId,
      stage_id: stageId,
      title: 'Okafor v. Okafor - Dissolution of Marriage',
      status: 'active',
    }).select().single();
    if (matErr) throw new Error(`Failed to create test matter: ${matErr.message}`);
    matterId = newMatter.id;
    console.log(`Created matter for testing: "${newMatter.title}" (${matterId})`);
  }

  console.log('\n----------------------------------------------------');
  console.log('PART 1: REAL DOCUMENT OCR & USAGE TRACKING');
  console.log('----------------------------------------------------');

  // Generate a minimal scanned PDF (character count < 20 so looksScanned = true triggers Gemini OCR)
  const pdfDoc = new jsPDF();
  pdfDoc.setFontSize(10);
  pdfDoc.text('OCR', 10, 10); // 3 characters -> 3 < 20 * 1 -> triggers Gemini OCR path
  const pdfArrayBuffer = pdfDoc.output('arraybuffer');
  const pdfBytes = new Uint8Array(pdfArrayBuffer);

  const storagePath = `${firmId}/${matterId}/scanned_evidence_${Date.now()}.pdf`;
  console.log(`Uploading test scanned PDF to storage bucket 'matter-documents': ${storagePath}`);

  const { error: uploadErr } = await authedClient.storage
    .from('matter-documents')
    .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: true });

  if (uploadErr) {
    console.error('Storage upload error:', uploadErr);
    throw new Error(`Failed to upload PDF: ${uploadErr.message}`);
  }
  console.log('File uploaded to storage successfully.');

  // Create document record
  const { data: docRecord, error: docErr } = await authedClient.from('documents').insert({
    firm_id: firmId,
    matter_id: matterId,
    file_name: 'Scanned_Court_Filing.pdf',
    storage_path: storagePath,
    file_size: pdfBytes.length,
    file_type: 'application/pdf',
    uploaded_by: userId,
    extraction_status: 'pending',
  }).select().single();

  if (docErr) throw new Error(`Failed to create document row: ${docErr.message}`);
  console.log(`Document row created with ID: ${docRecord.id}`);

  // Invoke extract-document-text Edge Function
  console.log('Calling Edge Function extract-document-text...');
  const extractRes = await fetch(`${url}/functions/v1/extract-document-text`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': anonKey,
    },
    body: JSON.stringify({ document_id: docRecord.id }),
  });

  const extractStatus = extractRes.status;
  const extractJson = await extractRes.json();
  console.log(`extract-document-text HTTP Status: ${extractStatus}`);
  console.log('extract-document-text Response:', JSON.stringify(extractJson, null, 2));

  // Query usage_events for the logged OCR event
  console.log('\nQuerying usage_events table for logged OCR event...');
  const { data: ocrEvents, error: ocrEvErr } = await authedClient
    .from('usage_events')
    .select('*')
    .eq('firm_id', firmId)
    .order('created_at', { ascending: false })
    .limit(3);

  if (ocrEvErr) console.error('Failed to fetch usage_events:', ocrEvErr.message);
  console.log('Latest usage_events rows for Firm:');
  console.log(JSON.stringify(ocrEvents, null, 2));

  console.log('\n----------------------------------------------------');
  console.log('PART 2: REAL TOOL-CALL EXECUTION & COMPOSIO STATUS');
  console.log('----------------------------------------------------');

  // Check Composio connection status
  console.log('Checking Composio connected accounts status via Edge Function...');
  const composioStatusRes = await fetch(`${url}/functions/v1/composio`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': anonKey,
    },
    body: JSON.stringify({ action: 'status' }),
  });

  const composioStatus = composioStatusRes.status;
  const composioData = await composioStatusRes.json();
  console.log(`Composio status HTTP Status: ${composioStatus}`);
  console.log('Composio status Response:', JSON.stringify(composioData, null, 2));

  const gcalConn = (composioData?.connections || []).find(c => c.toolkit_slug === 'googlecalendar' && c.status === 'ACTIVE');

  if (gcalConn) {
    console.log(`\nActive Google Calendar connection found (${gcalConn.connected_account_id}). Executing push_deadline_to_calendar...`);
    const pushRes = await fetch(`${url}/functions/v1/composio`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': anonKey,
      },
      body: JSON.stringify({
        action: 'push_deadline_to_calendar',
        title: 'Deposition of Respondent',
        due_date: '2026-09-15',
        matter_title: 'Okafor v. Okafor',
      }),
    });
    const pushJson = await pushRes.json();
    console.log('push_deadline_to_calendar Response:', JSON.stringify(pushJson, null, 2));

    // Query usage_events for tool_call
    const { data: toolEvents } = await authedClient
      .from('usage_events')
      .select('*')
      .eq('firm_id', firmId)
      .eq('event_type', 'tool_call')
      .order('created_at', { ascending: false })
      .limit(1);
    console.log('\nLogged tool_call usage_events row:');
    console.log(JSON.stringify(toolEvents, null, 2));
  } else {
    console.log('\nGoogle Calendar is NOT currently connected for Okafor Family Law (law-' + firmId + ').');
    console.log('As instructed, reporting honest connection status without faking a tool call.');
  }

  // Cleanup test document and storage file
  console.log('\n----------------------------------------------------');
  console.log('CLEANUP');
  console.log('----------------------------------------------------');
  await authedClient.from('documents').delete().eq('id', docRecord.id);
  await authedClient.storage.from('matter-documents').remove([storagePath]);
  console.log('Cleaned up test document record and storage file.');
}

main().catch(console.error);
