import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../../lib/store';
import { Settings, Plus, FileUp, ChevronRight } from 'lucide-react';

function slugify(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

// Firm-level jurisdiction/locale settings. This is the only place these
// fields (added in migration 0007) can be set — they drive the
// statute-of-limitations engine and Phase 1 billing later, and are fed
// into the Operator/Analyst AI prompts as jurisdiction context now.
export function SettingsScreen() {
  const { firm, updateFirm, practiceAreas, addPracticeArea, updatePracticeArea } = useStore();
  const [country, setCountry] = useState('');
  const [region, setRegion] = useState('');
  const [currency, setCurrency] = useState('');
  const [locale, setLocale] = useState('');
  const [saving, setSaving] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newKey, setNewKey] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [addingPa, setAddingPa] = useState(false);
  const [toggleBusyId, setToggleBusyId] = useState<string | null>(null);

  useEffect(() => {
    setCountry(firm?.country ?? '');
    setRegion(firm?.region ?? '');
    setCurrency(firm?.currency ?? '');
    setLocale(firm?.locale ?? '');
  }, [firm]);

  const dirty = firm && (
    country !== (firm.country ?? '') ||
    region !== (firm.region ?? '') ||
    currency !== (firm.currency ?? '') ||
    locale !== (firm.locale ?? '')
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await updateFirm({
      country: country.trim() ? country.trim().toUpperCase() : null,
      region: region.trim() || null,
      currency: currency.trim() ? currency.trim().toUpperCase() : null,
      locale: locale.trim() || null,
    });
    setSaving(false);
  };

  const sortedPracticeAreas = [...practiceAreas].sort((a, b) => a.label.localeCompare(b.label));

  const handleToggleActive = async (id: string, current: boolean) => {
    setToggleBusyId(id);
    await updatePracticeArea(id, { is_active: !current });
    setToggleBusyId(null);
  };

  const handleAddPracticeArea = async (e: React.FormEvent) => {
    e.preventDefault();
    const key = newKey.trim() || slugify(newLabel);
    if (!newLabel.trim() || !key) return;
    setAddingPa(true);
    const { error } = await addPracticeArea({ key, label: newLabel.trim() });
    setAddingPa(false);
    if (!error) {
      setNewLabel('');
      setNewKey('');
      setKeyTouched(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 mb-1">
        <Settings className="w-4 h-4 text-[var(--text-secondary)]" />
        <h2 className="text-xl font-medium">Firm Settings</h2>
      </div>
      <p className="text-sm text-[var(--text-secondary)] mb-8">
        Jurisdiction and locale for this firm — used to reason about which legal system applies, and to format dates/numbers the way your firm expects.
      </p>

      <form onSubmit={handleSave} className="border border-[var(--border-subtle)] rounded-lg p-5 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Country</label>
            <input
              type="text" value={country} onChange={e => setCountry(e.target.value)}
              placeholder="US, CA, GB, BH…" maxLength={2}
              className="w-full h-9 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm uppercase focus:outline-none"
            />
            <p className="text-[11px] text-[var(--text-tertiary)] mt-1">ISO 3166-1 alpha-2 code.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Region <span className="text-[var(--text-tertiary)] font-normal">(optional)</span></label>
            <input
              type="text" value={region} onChange={e => setRegion(e.target.value)}
              placeholder="Texas, Ontario, Dubai…"
              className="w-full h-9 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none"
            />
            <p className="text-[11px] text-[var(--text-tertiary)] mt-1">State/province/emirate — if your country has one.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Currency</label>
            <input
              type="text" value={currency} onChange={e => setCurrency(e.target.value)}
              placeholder="USD, CAD, GBP, BHD…" maxLength={3}
              className="w-full h-9 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm uppercase focus:outline-none"
            />
            <p className="text-[11px] text-[var(--text-tertiary)] mt-1">ISO 4217 code.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Locale</label>
            <input
              type="text" value={locale} onChange={e => setLocale(e.target.value)}
              placeholder="en-US, en-GB, ar-BH…"
              className="w-full h-9 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none"
            />
            <p className="text-[11px] text-[var(--text-tertiary)] mt-1">Drives date/number formatting across the app.</p>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit" disabled={saving || !dirty}
            className="h-9 px-4 bg-[var(--text-primary)] text-[var(--bg-primary)] rounded text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          {!firm && <span className="text-xs text-[var(--text-tertiary)]">Loading firm…</span>}
        </div>
      </form>

      <div className="mt-8">
        <h3 className="text-sm font-medium mb-1">Practice Areas</h3>
        <p className="text-xs text-[var(--text-secondary)] mb-3">
          Turn presets on or off, or add one specific to your firm. This drives which default stage list a new matter gets.
        </p>

        <div className="border border-[var(--border-subtle)] rounded-lg divide-y divide-[var(--border-subtle)]">
          {sortedPracticeAreas.map(pa => (
            <div key={pa.id} className="flex items-center justify-between px-4 py-3 gap-3">
              <div className="min-w-0">
                <div className="text-sm truncate">{pa.label}</div>
                <div className="text-xs text-[var(--text-tertiary)] font-mono truncate">{pa.key}</div>
              </div>
              <button
                onClick={() => handleToggleActive(pa.id, pa.is_active)}
                disabled={toggleBusyId === pa.id}
                role="switch"
                aria-checked={pa.is_active}
                title={pa.is_active ? 'Active — click to deactivate' : 'Inactive — click to activate'}
                className={`shrink-0 h-6 w-11 rounded-full relative transition-colors disabled:opacity-40 ${pa.is_active ? 'bg-[var(--signal-positive)]' : 'bg-[var(--bg-tertiary)] border border-[var(--border-default)]'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${pa.is_active ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
              </button>
            </div>
          ))}
          {sortedPracticeAreas.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-[var(--text-tertiary)]">No practice areas yet.</div>
          )}
        </div>

        <form onSubmit={handleAddPracticeArea} className="flex items-end gap-2 mt-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">New practice area</label>
            <input
              type="text" value={newLabel}
              onChange={e => {
                setNewLabel(e.target.value);
                if (!keyTouched) setNewKey(slugify(e.target.value));
              }}
              placeholder="Estate Planning, Tax, IP…"
              className="w-full h-9 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none"
            />
          </div>
          <div className="w-40">
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Key</label>
            <input
              type="text" value={newKey}
              onChange={e => { setNewKey(slugify(e.target.value)); setKeyTouched(true); }}
              placeholder="estate_planning"
              className="w-full h-9 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm font-mono focus:outline-none"
            />
          </div>
          <button
            type="submit" disabled={addingPa || !newLabel.trim() || !(newKey.trim() || slugify(newLabel))}
            className="h-9 px-3 flex items-center gap-1.5 bg-[var(--text-primary)] text-[var(--bg-primary)] rounded text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </form>
      </div>

      <div className="mt-8">
        <h3 className="text-sm font-medium mb-1">Data Import</h3>
        <p className="text-xs text-[var(--text-secondary)] mb-3">
          Bring in parties, matters, and deadlines from a CSV export — mapped and previewed before anything is created.
        </p>
        <Link
          to="/settings/import"
          className="flex items-center justify-between gap-3 border border-[var(--border-subtle)] rounded-lg px-4 py-3 hover:border-[var(--border-strong)] transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <FileUp className="w-4 h-4 text-[var(--text-secondary)]" />
            <span className="text-sm">Import from CSV</span>
          </div>
          <ChevronRight className="w-4 h-4 text-[var(--text-tertiary)]" />
        </Link>
      </div>
    </div>
  );
}
