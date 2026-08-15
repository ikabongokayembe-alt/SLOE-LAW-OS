import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../lib/store';
import { AuditLogEntry } from '../../types';
import { PlusCircle, Pencil, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE = 25;

const TABLE_LABELS: Record<string, string> = {
  matters: 'Matter', deadlines: 'Deadline', parties: 'Party',
  conflict_checks: 'Conflict Check', documents: 'Document', time_entries: 'Time Entry',
};

// Fields that exist on every audited row but are never useful to show in
// a diff — internal bookkeeping, not something that changed in a way a
// person reviewing history cares about.
const NOISE_FIELDS = new Set(['id', 'firm_id', 'created_at', 'import_batch_id']);

// The field whose value best identifies a row to a human, per table —
// used both for the "what" line and for matter-title resolution.
const TITLE_FIELD: Record<string, string> = {
  matters: 'title', deadlines: 'title', parties: 'name',
  conflict_checks: 'searched_name', documents: 'file_name', time_entries: 'description',
};

function recordTitle(entry: AuditLogEntry): string {
  const row = entry.new_values ?? entry.old_values ?? {};
  const field = TITLE_FIELD[entry.table_name];
  return (field && row[field]) || `${TABLE_LABELS[entry.table_name] ?? entry.table_name} record`;
}

// Which matter (if any) a row belongs to — the matters table's own id
// for a matters row, or a matter_id column for anything that has one
// (deadlines/documents/time_entries; conflict_checks sometimes; parties
// never). Used only for the matter filter, not displayed directly.
function matterIdFor(entry: AuditLogEntry): string | null {
  if (entry.table_name === 'matters') return entry.record_id;
  const row = entry.new_values ?? entry.old_values ?? {};
  return row.matter_id ?? null;
}

function actorLabel(entry: AuditLogEntry): string {
  if (entry.profiles?.name) return entry.profiles.name;
  if (entry.changed_by === null) return 'System';
  return 'Team member'; // resolvable id, but RLS on profiles hid the name from this viewer
}

function formatValue(v: any): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  return String(v);
}

interface FieldDiff { field: string; from: any; to: any }

function diffFields(oldValues: Record<string, any> | null, newValues: Record<string, any> | null): FieldDiff[] {
  if (!oldValues || !newValues) return [];
  const diffs: FieldDiff[] = [];
  const keys = new Set([...Object.keys(oldValues), ...Object.keys(newValues)]);
  for (const key of keys) {
    if (NOISE_FIELDS.has(key)) continue;
    const before = oldValues[key], after = newValues[key];
    if (JSON.stringify(before) !== JSON.stringify(after)) diffs.push({ field: key, from: before, to: after });
  }
  return diffs;
}

const ACTION_ICON: Record<string, any> = { insert: PlusCircle, update: Pencil, delete: Trash2 };
const ACTION_LABEL: Record<string, string> = { insert: 'Created', update: 'Updated', delete: 'Deleted' };
const ACTION_COLOR: Record<string, string> = {
  insert: 'text-[var(--signal-positive)]', update: 'text-[var(--text-tertiary)]', delete: 'text-[var(--signal-negative)]',
};

export function HistoryScreen() {
  const { auditLog, matters } = useStore();
  const [matterFilter, setMatterFilter] = useState('all');
  const [tableFilter, setTableFilter] = useState('all');
  const [page, setPage] = useState(1);

  const matterTitle = (id: string) => matters.find(m => m.id === id)?.title ?? '—';

  const filtered = useMemo(() => {
    return auditLog
      .filter(e => tableFilter === 'all' || e.table_name === tableFilter)
      .filter(e => matterFilter === 'all' || matterIdFor(e) === matterFilter);
  }, [auditLog, tableFilter, matterFilter]);

  useEffect(() => { setPage(1); }, [matterFilter, tableFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, pageCount);
  const paged = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-medium">History</h2>
          <p className="text-sm text-[var(--text-secondary)]">Who changed what, and when — matters, deadlines, parties, conflict checks, documents, and time entries.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="text-[10px] uppercase font-mono tracking-wider text-[var(--text-tertiary)] block mb-1">Matter</label>
          <select value={matterFilter} onChange={e => setMatterFilter(e.target.value)} className="h-9 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none w-full sm:w-56">
            <option value="all">All matters</option>
            {matters.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase font-mono tracking-wider text-[var(--text-tertiary)] block mb-1">Record type</label>
          <select value={tableFilter} onChange={e => setTableFilter(e.target.value)} className="h-9 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none w-full sm:w-48">
            <option value="all">All types</option>
            {Object.entries(TABLE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
      </div>

      <div className="text-xs text-[var(--text-tertiary)] mb-3">
        {filtered.length} change{filtered.length === 1 ? '' : 's'}{auditLog.length === 500 ? ' (most recent 500 loaded)' : ''}
      </div>

      {filtered.length === 0 ? (
        <div className="text-sm text-[var(--text-tertiary)] py-8 text-center">
          {auditLog.length === 0 ? 'No changes recorded yet.' : 'No changes match these filters.'}
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {paged.map(entry => {
              const Icon = ACTION_ICON[entry.action] ?? Pencil;
              const diffs = entry.action === 'update' ? diffFields(entry.old_values, entry.new_values) : [];
              const mId = matterIdFor(entry);
              return (
                <div key={entry.id} className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
                  <div className="flex items-start gap-3">
                    <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${ACTION_COLOR[entry.action]}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm font-medium">{ACTION_LABEL[entry.action]} {TABLE_LABELS[entry.table_name] ?? entry.table_name}</span>
                        <span className="text-sm text-[var(--text-secondary)] truncate">— {recordTitle(entry)}</span>
                      </div>
                      <div className="text-xs text-[var(--text-tertiary)]">
                        {actorLabel(entry)} · {new Date(entry.changed_at).toLocaleString()}
                        {mId && entry.table_name !== 'matters' && <> · {matterTitle(mId)}</>}
                      </div>
                      {diffs.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {diffs.map(d => (
                            <div key={d.field} className="text-xs">
                              <span className="text-[var(--text-tertiary)] font-mono">{d.field}</span>{' '}
                              <span className="text-[var(--signal-negative)] line-through decoration-[var(--signal-negative)]/50">{formatValue(d.from)}</span>
                              {' → '}
                              <span className="text-[var(--signal-positive)]">{formatValue(d.to)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {pageCount > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm">
              <span className="text-xs text-[var(--text-tertiary)]">Page {pageSafe} of {pageCount} · {filtered.length} total</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={pageSafe <= 1}
                  className="h-8 px-2.5 flex items-center gap-1 text-xs border border-[var(--border-subtle)] rounded hover:bg-[var(--bg-tertiary)] transition-colors disabled:opacity-40"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Prev
                </button>
                <button
                  onClick={() => setPage(p => Math.min(pageCount, p + 1))}
                  disabled={pageSafe >= pageCount}
                  className="h-8 px-2.5 flex items-center gap-1 text-xs border border-[var(--border-subtle)] rounded hover:bg-[var(--bg-tertiary)] transition-colors disabled:opacity-40"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
