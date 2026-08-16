import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../lib/store';
import { useToast } from '../../lib/toast';
import { supabase } from '../../lib/supabase';
import { csvToObjects } from '../../lib/csv';
import { Upload, FileSpreadsheet, Building2, Calendar, CheckCircle2, Search, Plug } from 'lucide-react';

// Best-effort case-insensitive header matching against common export
// column names, so a real-world spreadsheet export doesn't need to match
// our exact field names to import cleanly.
const HEADER_ALIASES = {
  name: ['name', 'client name', 'full name', 'party name', 'company'],
  type: ['type', 'party type', 'individual/organization'],
  notes: ['notes', 'note', 'comments'],
};

function findField(row: Record<string, string>, aliases: string[]): string {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const match = keys.find(k => k.toLowerCase().trim() === alias);
    if (match) return row[match];
  }
  return '';
}

function normalizeType(raw: string): 'individual' | 'organization' {
  const v = raw.toLowerCase();
  if (v.includes('org') || v.includes('company') || v.includes('llc') || v.includes('inc')) return 'organization';
  return 'individual';
}

interface ParsedRow {
  name: string; party_type: 'individual' | 'organization'; notes: string; valid: boolean;
}

function parseRow(row: Record<string, string>): ParsedRow {
  const name = findField(row, HEADER_ALIASES.name);
  return {
    name,
    party_type: normalizeType(findField(row, HEADER_ALIASES.type)),
    notes: findField(row, HEADER_ALIASES.notes),
    valid: name.length > 0,
  };
}

function CsvImportCard() {
  const { addParty } = useStore();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<{ success: number; failed: number } | null>(null);

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setImported(null);
    const text = await file.text();
    const objects = csvToObjects(text);
    setRows(objects.map(parseRow));
  };

  const handleImport = async () => {
    const validRows = rows.filter(r => r.valid);
    if (validRows.length === 0) return;
    setImporting(true);
    let success = 0, failed = 0;
    for (const row of validRows) {
      try {
        const result = await addParty({
          name: row.name,
          party_type: row.party_type,
          aliases: [],
          notes: row.notes || undefined,
        });
        if (result) success++; else failed++;
      } catch {
        failed++;
      }
    }
    setImporting(false);
    setImported({ success, failed });
    setRows([]);
    if (success > 0) showToast('success', `Imported ${success} part${success === 1 ? 'y' : 'ies'}.`);
    if (failed > 0) showToast('error', `${failed} row${failed === 1 ? '' : 's'} failed to import.`);
  };

  const validCount = rows.filter(r => r.valid).length;
  const invalidCount = rows.length - validCount;

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-5">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-center shrink-0">
          <FileSpreadsheet className="w-4 h-4" />
        </div>
        <div>
          <div className="text-sm font-medium">CSV / Spreadsheet Import</div>
          <div className="text-xs text-[var(--text-tertiary)]">Bulk-import your existing client list as parties</div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />

      {rows.length === 0 ? (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="mt-3 w-full h-24 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-[var(--border-subtle)] rounded-lg text-xs text-[var(--text-tertiary)] hover:border-[var(--border-strong)] hover:text-[var(--text-secondary)] transition-colors"
        >
          <Upload className="w-5 h-5" />
          Click to choose a CSV file
        </button>
      ) : (
        <div className="mt-3">
          <div className="text-xs text-[var(--text-secondary)] mb-2">
            {fileName} — {validCount} part{validCount === 1 ? 'y' : 'ies'} ready to import
            {invalidCount > 0 && <span className="text-[var(--signal-warning)]"> · {invalidCount} row{invalidCount === 1 ? '' : 's'} missing a name, skipped</span>}
          </div>
          <div className="max-h-40 overflow-y-auto border border-[var(--border-subtle)] rounded-md mb-3">
            <table className="w-full text-xs">
              <thead className="bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]">
                <tr><th className="text-left px-2 py-1.5">Name</th><th className="text-left px-2 py-1.5">Type</th></tr>
              </thead>
              <tbody>
                {rows.slice(0, 8).map((r, i) => (
                  <tr key={i} className={`border-t border-[var(--border-subtle)] ${!r.valid ? 'opacity-40' : ''}`}>
                    <td className="px-2 py-1.5">{r.name || '—'}</td>
                    <td className="px-2 py-1.5 capitalize">{r.party_type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleImport}
              disabled={importing || validCount === 0}
              className="h-8 px-4 text-xs font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {importing ? 'Importing…' : `Import ${validCount} part${validCount === 1 ? 'y' : 'ies'}`}
            </button>
            <button onClick={() => { setRows([]); setFileName(''); }} className="h-8 px-4 text-xs font-medium rounded border border-[var(--border-subtle)] hover:bg-[var(--bg-tertiary)] transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {imported && (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-[var(--signal-positive)]">
          <CheckCircle2 className="w-3.5 h-3.5" /> Imported {imported.success} part{imported.success === 1 ? 'y' : 'ies'}{imported.failed > 0 ? `, ${imported.failed} failed` : ''}.
        </div>
      )}
    </div>
  );
}

function ComingSoonCard({ icon: Icon, name, description }: { icon: any; name: string; description: string }) {
  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-5 opacity-60">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <div className="text-sm font-medium">{name}</div>
          <div className="text-xs text-[var(--text-tertiary)]">{description}</div>
        </div>
      </div>
      <div className="mt-3 h-8 flex items-center justify-center text-xs text-[var(--text-tertiary)] border border-dashed border-[var(--border-subtle)] rounded">
        Coming soon
      </div>
    </div>
  );
}

// Real, working connectors via Composio — verified end-to-end against the
// live Composio API before this was built. Connecting opens a genuine
// hosted OAuth flow; disconnecting genuinely revokes it.
// `wired` is the honest distinction this screen was missing. EVERY slug
// here can complete a real Composio OAuth flow — none is a fake card. But
// only Gmail and Google Calendar are actually CONSUMED by Law OS
// (sendMatterCommunication and pushDeadlineToCalendar). Connecting Slack
// or WhatsApp previously looked identical to connecting Gmail and then
// did nothing, which is the misleading state the grouping below fixes:
// a working connection to a tool nothing reads from is worse than no
// button at all, because the user reasonably assumes it took effect.
//
// Descriptions were also carrying real-estate copy from a sibling product
// ("viewings and appointments", "urgent leads") — rewritten for legal work.
type Connector = { slug: string; name: string; description: string; wired: boolean };

const CONNECTOR_GROUPS: { group: string; blurb: string; items: Connector[] }[] = [
  {
    group: 'Email',
    blurb: 'Send client correspondence from your own address and file replies against the matter.',
    items: [
      { slug: 'gmail', name: 'Gmail', description: 'Send client updates and file replies against a matter', wired: true },
      { slug: 'outlook', name: 'Outlook', description: 'Microsoft-based inboxes', wired: false },
    ],
  },
  {
    group: 'Calendar',
    blurb: 'Push court dates and filing deadlines to the calendar you already live in.',
    items: [
      { slug: 'googlecalendar', name: 'Google Calendar', description: 'Push hearings and filing deadlines to your calendar', wired: true },
    ],
  },
  {
    group: 'Team messaging',
    blurb: 'Connectable today, but nothing in Law OS reads from these yet.',
    items: [
      { slug: 'slack', name: 'Slack', description: 'Post deadline and conflict alerts to a channel', wired: false },
      { slug: 'whatsapp', name: 'WhatsApp', description: 'Message clients from your connected number', wired: false },
    ],
  },
];

const FEATURED_CONNECTORS: { slug: string; name: string; description: string }[] = [
  { slug: 'gmail', name: 'Gmail', description: 'Send client updates and file replies against a matter' },
  { slug: 'googlecalendar', name: 'Google Calendar', description: 'Push hearings and filing deadlines to your calendar' },
  { slug: 'outlook', name: 'Outlook', description: 'Microsoft-based inboxes' },
  { slug: 'slack', name: 'Slack', description: 'Post deadline and conflict alerts to a channel' },
  { slug: 'whatsapp', name: 'WhatsApp', description: 'Message clients from your connected number' },
];

interface ConnectionStatus { toolkit_slug: string; status: string; connected_account_id: string; }
interface CatalogItem { slug: string; name: string; description: string; logo: string; category: string; }

// Composio's logo CDN is public — no auth needed, works for any toolkit
// slug. Falls back to a generic icon if a given slug has no logo.
function ToolkitLogo({ slug, size = 36 }: { slug: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
        <Plug className="w-4 h-4 text-[var(--text-tertiary)]" />
      </div>
    );
  }
  return (
    <img
      src={`https://logos.composio.dev/api/${slug}`}
      alt=""
      onError={() => setFailed(true)}
      className="rounded-lg bg-white shrink-0 object-contain p-1.5"
      style={{ width: size, height: size }}
    />
  );
}

function ConnectorCard({ connector, connection, onChanged }: { connector: { slug: string; name: string; description: string }; connection?: ConnectionStatus; onChanged: () => void }) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const isConnected = connection?.status === 'ACTIVE';
  const isPending = connection && !isConnected;

  // "Pending — click to retry" covered every non-ACTIVE Composio status
  // with one vague label, so a user could not tell an abandoned sign-in
  // (the common case: the OAuth tab was opened and never completed) from
  // a revoked or expired grant, and had no idea whether retrying would
  // help. Composio reports the state; this just stops throwing it away.
  const pendingLabel = (() => {
    switch ((connection?.status || '').toUpperCase()) {
      case 'INITIATED':
        return 'Sign-in unfinished — click to resume';
      case 'EXPIRED':
        return 'Access expired — reconnect';
      case 'FAILED':
      case 'ERROR':
        return 'Connection failed — try again';
      case 'INACTIVE':
      case 'DISABLED':
        return 'Disconnected at the provider — reconnect';
      default:
        return `Not connected (${connection?.status ?? 'unknown'}) — click to retry`;
    }
  })();

  const pendingHint = (() => {
    switch ((connection?.status || '').toUpperCase()) {
      case 'INITIATED':
        return 'You opened the sign-in but did not finish it. Nothing is connected yet.';
      case 'EXPIRED':
      case 'INACTIVE':
      case 'DISABLED':
        return 'Access was withdrawn at the provider. Reconnecting restores it.';
      default:
        return null;
    }
  })();

  const handleConnect = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('composio', { body: { action: 'connect', toolkit_slug: connector.slug, callback_origin: window.location.origin } });
      if (error || !data?.redirect_url) throw new Error(error?.message ?? 'No redirect URL returned');
      window.open(data.redirect_url, '_blank');
      showToast('success', `Complete the ${connector.name} sign-in in the new tab, then come back and refresh.`);
    } catch (e: any) {
      showToast('error', `Couldn't start connecting ${connector.name}.`);
    }
    setBusy(false);
  };

  const handleDisconnect = async () => {
    if (!connection) return;
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke('composio', { body: { action: 'disconnect', connected_account_id: connection.connected_account_id } });
      if (error) throw error;
      showToast('success', `${connector.name} disconnected.`);
      onChanged();
    } catch {
      showToast('error', `Couldn't disconnect ${connector.name}.`);
    }
    setBusy(false);
  };

  return (
    <div className={`bg-[var(--bg-secondary)] border rounded-lg p-5 ${isConnected ? 'border-[var(--signal-positive)]/40' : 'border-[var(--border-subtle)]'}`}>
      <div className="flex items-center gap-3 mb-2">
        <ToolkitLogo slug={connector.slug} />
        <div className="min-w-0">
          <div className="text-sm font-medium">{connector.name}</div>
          <div className="text-xs text-[var(--text-tertiary)] truncate">{connector.description}</div>
        </div>
      </div>
      {isConnected ? (
        <button onClick={handleDisconnect} disabled={busy} className="mt-3 w-full h-8 flex items-center justify-center gap-1.5 text-xs font-medium text-[var(--signal-positive)] border border-[var(--signal-positive)]/40 rounded hover:bg-[var(--signal-positive)]/10 transition-colors disabled:opacity-40">
          <CheckCircle2 className="w-3.5 h-3.5" /> Connected — Disconnect
        </button>
      ) : (
        <button onClick={handleConnect} disabled={busy} className="mt-3 w-full h-8 text-xs font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded hover:opacity-90 transition-opacity disabled:opacity-40">
          {busy ? 'Opening…' : isPending ? pendingLabel : 'Connect'}
        </button>
      )}
      {isPending && pendingHint && (
        <p className="mt-2 text-[11px] leading-snug text-[var(--text-tertiary)]">{pendingHint}</p>
      )}
    </div>
  );
}

// Browse Composio's real catalog beyond the 5 featured apps — search is
// backed by the composio edge function's 'search' action, which proxies
// Composio's live toolkits endpoint. Whatever someone searches for is
// what's listed — not a fixed guess at what apps matter.
function BrowseCatalog({ connections, onChanged }: { connections: ConnectionStatus[]; onChanged: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    setSearching(true);
    setSearched(true);
    try {
      const { data, error } = await supabase.functions.invoke('composio', { body: { action: 'search', query } });
      if (!error && data?.items) setResults(data.items);
    } catch { /* leave results empty on failure */ }
    setSearching(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSearch(); };
  // Prefers an ACTIVE row over any other for the same toolkit. The edge
  // function already collapses duplicates, but a bare .find() here was
  // half of the bug where a live Gmail showed as "Access expired" -- a
  // stale row sorted first and won. Keeping the preference on both sides
  // means one layer regressing cannot resurrect the symptom.
  const connectionFor = (slug: string) => {
    const all = connections.filter(c => c.toolkit_slug === slug);
    return all.find(c => c.status === 'ACTIVE') ?? all[0];
  };

  return (
    <div>
      <div className="text-xs text-[var(--text-secondary)] mb-3">
        Law OS can connect to any of Composio's 500+ supported apps — search for whatever you actually use.
      </div>
      <div className="flex gap-2 mb-4">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search apps — e.g. Notion, HubSpot, Zoom, Mailchimp…"
          className="flex-1 h-9 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none"
        />
        <button onClick={handleSearch} disabled={searching} className="h-9 px-4 flex items-center gap-1.5 text-xs font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded hover:opacity-90 transition-opacity disabled:opacity-40">
          <Search className="w-3.5 h-3.5" /> {searching ? 'Searching…' : 'Search'}
        </button>
      </div>

      {searched && !searching && results.length === 0 && (
        <div className="text-xs text-[var(--text-tertiary)] py-4 text-center">No apps found for that search.</div>
      )}

      {results.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {results.map(item => (
            <ConnectorCard
              key={item.slug}
              connector={{ slug: item.slug, name: item.name, description: item.description || item.category }}
              connection={connectionFor(item.slug)}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function IntegrationsScreen() {
  const { parties } = useStore();
  const [connections, setConnections] = useState<ConnectionStatus[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [showBrowse, setShowBrowse] = useState(false);

  // A ref, not the loadingStatus state: the focus listener is registered
  // once and would close over a stale value of that state forever.
  const inFlight = useRef(false);

  const loadStatus = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoadingStatus(true);
    try {
      const { data, error } = await supabase.functions.invoke('composio', { body: { action: 'status' } });
      if (!error && data?.connections) setConnections(data.connections);
    } catch { /* leave connections as-is on failure — cards fall back to "Connect" */ }
    inFlight.current = false;
    setLoadingStatus(false);
  };

  useEffect(() => { loadStatus(); }, []);

  // The OAuth handoff happens in a second tab. Whether the provider
  // redirects back or the user switches manually, arriving here is the
  // moment this screen's status is known to be stale -- so refresh on
  // focus rather than making them find the "Refresh status" link. Guarded
  // against firing while a request is already in flight.
  useEffect(() => {
    const onFocus = () => { if (!document.hidden) loadStatus(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prefers an ACTIVE row over any other for the same toolkit. The edge
  // function already collapses duplicates, but a bare .find() here was
  // half of the bug where a live Gmail showed as "Access expired" -- a
  // stale row sorted first and won. Keeping the preference on both sides
  // means one layer regressing cannot resurrect the symptom.
  const connectionFor = (slug: string) => {
    const all = connections.filter(c => c.toolkit_slug === slug);
    return all.find(c => c.status === 'ACTIVE') ?? all[0];
  };
  const connectedCount = connections.filter(c => c.status === 'ACTIVE').length;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xl font-medium">Integrations</h2>
        <button onClick={loadStatus} disabled={loadingStatus} className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-40">
          {loadingStatus ? 'Refreshing…' : 'Refresh status'}
        </button>
      </div>
      <p className="text-sm text-[var(--text-secondary)] mb-6">Connect Law OS to the tools you already use.</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1">Connected</div>
          <div className="text-2xl font-mono">{connectedCount}</div>
        </div>
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1">Parties on File</div>
          <div className="text-2xl font-mono">{parties.length}</div>
        </div>
      </div>

      <div className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] mb-3">Import</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <CsvImportCard />
      </div>

      {/* Grouped by the job the tool does, rather than one flat grid of
          five logos with no ordering logic. Within each group, anything
          Law OS does not yet read from is marked so a working OAuth
          connection is never mistaken for a working feature. */}
      {CONNECTOR_GROUPS.map(({ group, blurb, items }) => (
        <div key={group} className="mb-8">
          <div className="flex items-baseline justify-between mb-1">
            <div className="text-xs uppercase tracking-wider text-[var(--text-tertiary)]">{group}</div>
            {items.every(i => !i.wired) && (
              <span className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] border border-[var(--border-subtle)] rounded px-1.5 py-0.5">
                Not yet used by Law OS
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--text-secondary)] mb-3">{blurb}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {items.map(c => (
              <div key={c.slug} className={c.wired ? '' : 'opacity-70'}>
                <ConnectorCard connector={c} connection={connectionFor(c.slug)} onChanged={loadStatus} />
                {!c.wired && (
                  <p className="mt-1.5 text-[11px] leading-snug text-[var(--text-tertiary)]">
                    Connecting works, but nothing in Law OS reads from {c.name} yet.
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] mb-3">Not built yet</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <ComingSoonCard icon={Building2} name="Court E-Filing Systems" description="Jurisdiction-specific e-filing portals — not on Composio's catalog yet" />
      </div>

      <div className="border-t border-[var(--border-subtle)] pt-6">
        {!showBrowse ? (
          <button onClick={() => setShowBrowse(true)} className="text-sm text-[var(--accent-secondary)] hover:underline">
            Browse more apps →
          </button>
        ) : (
          <BrowseCatalog connections={connections} onChanged={loadStatus} />
        )}
      </div>
    </div>
  );
}
