import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../../lib/store';
import { useToast } from '../../lib/toast';
import { csvToObjects } from '../../lib/csv';
import {
  ImportEntityType, ENTITY_FIELDS, ENTITY_LABELS, ENTITY_SINGULAR, ResolvedRow,
  suggestColumnMapping, resolveAllRows, toPartyInsert, toMatterInsert, toDeadlineInsert,
} from '../../lib/importEngine';
import {
  Upload, ArrowLeft, ArrowRight, Users, Briefcase, Clock, CheckCircle2, AlertTriangle, Trash2, FileUp,
} from 'lucide-react';

type Step = 'select-entity' | 'upload' | 'mapping' | 'preview' | 'summary';

const ENTITY_ICONS: Record<ImportEntityType, any> = { parties: Users, matters: Briefcase, deadlines: Clock };
const ENTITY_ORDER: ImportEntityType[] = ['parties', 'matters', 'deadlines'];
const PREVIEW_ROW_LIMIT = 10;

// CSV import — upload -> map columns -> preview -> confirm -> summary.
// Same step-state shape as NewMatterModal (a plain useState<Step> with
// conditional blocks and forward/back), adapted to a full screen rather
// than a modal because a real column-mapping UI and a multi-column
// preview table genuinely don't fit in a 448px modal — the mechanism
// matches, the container doesn't need to.
export function ImportScreen() {
  const {
    parties, matters, attorneys, practiceAreas, matterStages, importBatches,
    commitImportBatch, removeImportBatch,
  } = useStore();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('select-entity');
  const [entityType, setEntityType] = useState<ImportEntityType | null>(null);
  const [fileName, setFileName] = useState('');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [excludedRows, setExcludedRows] = useState<Set<number>>(new Set());
  const [committing, setCommitting] = useState(false);
  const [lastResult, setLastResult] = useState<{ entityType: ImportEntityType; created: any[] } | null>(null);
  const [confirmingBatchId, setConfirmingBatchId] = useState<string | null>(null);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);

  const fields = entityType ? ENTITY_FIELDS[entityType] : [];
  const lookupContext = useMemo(() => ({
    parties: parties.map(p => ({ id: p.id, name: p.name })),
    matters: matters.map(m => ({ id: m.id, title: m.title })),
    attorneys: attorneys.map(a => ({ id: a.id, name: a.name })),
    practiceAreas: practiceAreas.map(p => ({ id: p.id, key: p.key, label: p.label })),
  }), [parties, matters, attorneys, practiceAreas]);

  const resolvedRows: ResolvedRow[] = useMemo(
    () => entityType ? resolveAllRows(csvRows, fields, mapping, lookupContext) : [],
    [entityType, csvRows, mapping, lookupContext]
  );
  const readyRows = resolvedRows.filter(r => !r.blocked && !excludedRows.has(r.index));
  const blockedCount = resolvedRows.filter(r => r.blocked).length;

  const initialStage = [...matterStages].sort((a, b) => a.sort_order - b.sort_order).find(s => s.is_initial);

  const resetToStart = () => {
    setStep('select-entity');
    setEntityType(null);
    setFileName('');
    setCsvHeaders([]);
    setCsvRows([]);
    setMapping({});
    setExcludedRows(new Set());
    setLastResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSelectEntity = (type: ImportEntityType) => {
    setEntityType(type);
    setStep('upload');
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !entityType) return;
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
      showToast('error', 'That doesn\'t look like a CSV file.');
      return;
    }
    const text = await file.text();
    const objects = csvToObjects(text);
    if (objects.length === 0) {
      showToast('error', 'No rows found in that file.');
      return;
    }
    const headers = Object.keys(objects[0]);
    setFileName(file.name);
    setCsvHeaders(headers);
    setCsvRows(objects);
    setMapping(suggestColumnMapping(headers, ENTITY_FIELDS[entityType]));
    setExcludedRows(new Set());
    setStep('mapping');
  };

  const handleCommit = async () => {
    if (!entityType || readyRows.length === 0) return;
    setCommitting(true);
    const inserts = readyRows.map(r => {
      if (entityType === 'parties') return toPartyInsert(r.resolved);
      if (entityType === 'matters') return toMatterInsert(r.resolved, initialStage!.id);
      return toDeadlineInsert(r.resolved);
    });
    const { created } = await commitImportBatch(entityType, inserts);
    setCommitting(false);
    if (created.length > 0) {
      setLastResult({ entityType, created });
      setStep('summary');
    }
  };

  const handleRollback = async (batchId: string, batchEntityType: ImportEntityType) => {
    setRollingBackId(batchId);
    await removeImportBatch(batchId, batchEntityType);
    setRollingBackId(null);
    setConfirmingBatchId(null);
  };

  const canGoToPreview = csvRows.length > 0 && fields.filter(f => f.required).every(f => mapping[f.key]);

  // Lookup fields resolve to a raw id — the preview must show the actual
  // matched record's name, not the id, or "mistakes are visible before
  // import" doesn't hold for exactly the fields most likely to mismatch.
  function previewCellValue(field: (typeof fields)[number], row: ResolvedRow): string {
    const resolved = row.resolved[field.key];
    if (field.type === 'lookup_party') return (resolved && parties.find(p => p.id === resolved)?.name) || (resolved ? '(unknown)' : '—');
    if (field.type === 'lookup_matter') return (resolved && matters.find(m => m.id === resolved)?.title) || (resolved ? '(unknown)' : '—');
    if (field.type === 'lookup_attorney') return (resolved && attorneys.find(a => a.id === resolved)?.name) || (resolved ? '(unknown)' : '—');
    if (field.type === 'lookup_practice_area') return (resolved && practiceAreas.find(p => p.id === resolved)?.label) || (resolved ? '(unknown)' : '—');
    if (Array.isArray(resolved)) return resolved.join(', ');
    return String(resolved ?? row.raw[mapping[field.key] ?? ''] ?? '—');
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-2 mb-1">
        <FileUp className="w-4 h-4 text-[var(--text-secondary)]" />
        <h2 className="text-xl font-medium">Import Data</h2>
      </div>
      <p className="text-sm text-[var(--text-secondary)] mb-6">
        Bring in parties, matters, and deadlines from a CSV export (Clio, MyCase, or anything else) — mapped and previewed before anything is created.
      </p>
      <Link to="/settings" className="text-xs text-[var(--accent-secondary)] hover:underline mb-6 inline-flex items-center gap-1">
        <ArrowLeft className="w-3 h-3" /> Back to Settings
      </Link>

      {step === 'select-entity' && (
        <div className="space-y-6">
          <div>
            <p className="text-xs text-[var(--text-tertiary)] mb-3">
              One file at a time. If you're importing more than one kind of record, do Parties first — Matters and Deadlines can link to parties/matters by name once they exist.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {ENTITY_ORDER.map(type => {
                const Icon = ENTITY_ICONS[type];
                return (
                  <button
                    key={type}
                    onClick={() => handleSelectEntity(type)}
                    className="text-left bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-4 hover:border-[var(--border-strong)] transition-colors"
                  >
                    <Icon className="w-4 h-4 text-[var(--text-secondary)] mb-2" />
                    <div className="text-sm font-medium">{ENTITY_LABELS[type]}</div>
                    <div className="text-xs text-[var(--text-tertiary)] mt-1">Import {ENTITY_LABELS[type].toLowerCase()} from a CSV</div>
                  </button>
                );
              })}
            </div>
          </div>

          {importBatches.length > 0 && (
            <div>
              <h3 className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] mb-2">Recent imports</h3>
              <div className="border border-[var(--border-subtle)] rounded-lg divide-y divide-[var(--border-subtle)]">
                {importBatches.map(b => (
                  <div key={b.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm">{b.row_count} {ENTITY_LABELS[b.entity_type].toLowerCase()} — {new Date(b.created_at).toLocaleString()}</div>
                      </div>
                      {confirmingBatchId === b.id ? (
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-[var(--signal-negative)]">Delete {b.row_count} records? This can't be undone.</span>
                          <button onClick={() => setConfirmingBatchId(null)} className="h-7 px-2 text-xs border border-[var(--border-subtle)] rounded hover:bg-[var(--bg-tertiary)]">Cancel</button>
                          <button
                            onClick={() => handleRollback(b.id, b.entity_type)}
                            disabled={rollingBackId === b.id}
                            className="h-7 px-2 text-xs bg-[var(--signal-negative)] text-white rounded hover:opacity-90 disabled:opacity-40"
                          >
                            {rollingBackId === b.id ? 'Removing…' : 'Yes, delete'}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmingBatchId(b.id)}
                          className="shrink-0 flex items-center gap-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--signal-negative)] transition-colors"
                        >
                          <Trash2 className="w-3 h-3" /> Undo
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {step === 'upload' && entityType && (
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">Upload a CSV of {ENTITY_LABELS[entityType].toLowerCase()}. The first row must be column headers.</p>
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFileSelected} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full h-32 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-[var(--border-subtle)] rounded-lg hover:border-[var(--border-strong)] transition-colors text-[var(--text-secondary)]"
          >
            <Upload className="w-5 h-5" />
            <span className="text-sm">Click to choose a CSV file</span>
          </button>
          <button onClick={() => setStep('select-entity')} className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Back
          </button>
        </div>
      )}

      {step === 'mapping' && entityType && (
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            <span className="font-medium text-[var(--text-primary)]">{fileName}</span> — {csvRows.length} row{csvRows.length === 1 ? '' : 's'} found. Match each field to a column from your file.
          </p>
          <div className="border border-[var(--border-subtle)] rounded-lg divide-y divide-[var(--border-subtle)]">
            {fields.map(f => (
              <div key={f.key} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm">{f.label} {f.required && <span className="text-[var(--signal-negative)]">*</span>}</div>
                  {f.type.startsWith('lookup_') && (
                    <div className="text-[11px] text-[var(--text-tertiary)]">Matched by exact name against existing records</div>
                  )}
                </div>
                <select
                  value={mapping[f.key] ?? ''}
                  onChange={e => setMapping(m => ({ ...m, [f.key]: e.target.value || null }))}
                  className="h-9 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none w-56 shrink-0"
                >
                  <option value="">— not mapped —</option>
                  {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <button onClick={() => setStep('upload')} className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" /> Back
            </button>
            <button
              onClick={() => setStep('preview')}
              disabled={!canGoToPreview}
              className="h-9 px-4 flex items-center gap-1.5 text-sm font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              Preview <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {step === 'preview' && entityType && (
        <div className="space-y-4">
          <div className={`flex items-center gap-2 text-sm rounded-lg p-3 border ${blockedCount > 0 ? 'bg-[var(--signal-warning)]/10 border-[var(--signal-warning)]/30 text-[var(--signal-warning)]' : 'bg-[var(--signal-positive)]/10 border-[var(--signal-positive)]/30 text-[var(--signal-positive)]'}`}>
            {blockedCount > 0 ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
            {resolvedRows.length - blockedCount} of {resolvedRows.length} rows ready to import{blockedCount > 0 ? `, ${blockedCount} need attention` : ''}.
          </div>

          <div className="border border-[var(--border-subtle)] rounded-lg overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-[var(--text-tertiary)] uppercase tracking-wider">
                  <th className="text-left px-3 py-2 w-8"></th>
                  {fields.map(f => <th key={f.key} className="text-left px-3 py-2 whitespace-nowrap">{f.label}</th>)}
                  <th className="text-left px-3 py-2">Issues</th>
                </tr>
              </thead>
              <tbody>
                {resolvedRows.slice(0, PREVIEW_ROW_LIMIT).map(row => (
                  <tr key={row.index} className={`border-b border-[var(--border-subtle)] last:border-0 ${row.blocked ? 'opacity-50' : ''}`}>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        disabled={row.blocked}
                        checked={!row.blocked && !excludedRows.has(row.index)}
                        onChange={e => setExcludedRows(prev => {
                          const next = new Set(prev);
                          if (e.target.checked) next.delete(row.index); else next.add(row.index);
                          return next;
                        })}
                      />
                    </td>
                    {fields.map(f => (
                      <td key={f.key} className="px-3 py-2 whitespace-nowrap text-[var(--text-secondary)]">
                        {previewCellValue(f, row)}
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      {row.issues.map((issue, i) => (
                        <div key={i} className={issue.severity === 'error' ? 'text-[var(--signal-negative)]' : 'text-[var(--signal-warning)]'}>{issue.message}</div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {resolvedRows.length > PREVIEW_ROW_LIMIT && (
            <p className="text-xs text-[var(--text-tertiary)]">…and {resolvedRows.length - PREVIEW_ROW_LIMIT} more row{resolvedRows.length - PREVIEW_ROW_LIMIT === 1 ? '' : 's'} (not shown, but included in the import).</p>
          )}

          <div className="flex items-center justify-between">
            <button onClick={() => setStep('mapping')} className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" /> Back
            </button>
            <button
              onClick={handleCommit}
              disabled={committing || readyRows.length === 0}
              className="h-9 px-4 text-sm font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {committing ? 'Importing…' : `Import ${readyRows.length} ${readyRows.length === 1 ? ENTITY_SINGULAR[entityType] : ENTITY_LABELS[entityType].toLowerCase()}`}
            </button>
          </div>
        </div>
      )}

      {step === 'summary' && lastResult && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm bg-[var(--signal-positive)]/10 border border-[var(--signal-positive)]/30 text-[var(--signal-positive)] rounded-lg p-3">
            <CheckCircle2 className="w-4 h-4 shrink-0" /> {lastResult.created.length} {ENTITY_LABELS[lastResult.entityType].toLowerCase()} imported.
          </div>
          <div className="border border-[var(--border-subtle)] rounded-lg divide-y divide-[var(--border-subtle)] max-h-64 overflow-y-auto">
            {lastResult.created.map((r: any) => (
              <div key={r.id} className="px-4 py-2 text-sm text-[var(--text-secondary)] truncate">{r.name ?? r.title ?? r.id}</div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={resetToStart} className="h-9 px-4 text-sm font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded hover:opacity-90 transition-opacity">
              Import another file
            </button>
            <Link to="/settings" className="h-9 px-4 flex items-center text-sm font-medium border border-[var(--border-subtle)] rounded hover:bg-[var(--bg-tertiary)] transition-colors">
              Done
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
