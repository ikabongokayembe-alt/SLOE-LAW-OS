import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../../lib/store';
import { useToast } from '../../lib/toast';
import { Settings, Plus, FileUp, ChevronRight, Copy, RotateCw, UserPlus, CreditCard } from 'lucide-react';

function slugify(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

// Firm-level jurisdiction/locale settings. This is the only place these
// fields (added in migration 0007) can be set — they drive the
// statute-of-limitations engine and Phase 1 billing later, and are fed
// into the Operator/Analyst AI prompts as jurisdiction context now.
export function SettingsScreen() {
  const { firm, updateFirm, regenerateIntakeToken, practiceAreas, addPracticeArea, updatePracticeArea } = useStore();
  const { showToast } = useToast();
  const [regeneratingIntake, setRegeneratingIntake] = useState(false);
  const [lawpayUrl, setLawpayUrl] = useState('');
  const [savingLawpay, setSavingLawpay] = useState(false);
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
    setLawpayUrl(firm?.lawpay_payment_page_url ?? '');
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

  const lawpayDirty = firm && lawpayUrl !== (firm.lawpay_payment_page_url ?? '');
  const handleSaveLawpay = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingLawpay(true);
    await updateFirm({ lawpay_payment_page_url: lawpayUrl.trim() || null });
    setSavingLawpay(false);
  };

  const intakeLink = firm?.intake_token ? `${window.location.origin}/intake?token=${firm.intake_token}` : '';

  const handleCopyIntakeLink = async () => {
    if (!intakeLink) return;
    try { await navigator.clipboard.writeText(intakeLink); showToast('success', 'Intake link copied to clipboard.'); }
    catch { showToast('error', "Couldn't copy the link — clipboard unavailable."); }
  };

  const handleRegenerateIntakeLink = async () => {
    if (!confirm('Regenerate the intake link? The current link will stop working immediately — update it anywhere it\'s posted (website, email signature, etc.).')) return;
    setRegeneratingIntake(true);
    await regenerateIntakeToken();
    setRegeneratingIntake(false);
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
                /* `border` is applied in BOTH states (coloured to match the
                   track when on) rather than only when off. With the default
                   border-box sizing, a border present in one state and absent
                   in the other changes the padding box by 1px, so the track
                   and knob shifted by a pixel as it flipped — the mismatch
                   this fixes. The knob is centred with top-1/2 plus
                   -translate-y-1/2 instead of a fixed top-0.5, which on a
                   20px knob in a 22px inner track left 2px above and 0 below.
                   18px of travel leaves an equal 2px inset at each end
                   (44px track - 2px borders - 20px knob - 2px inset). */
                className={`shrink-0 h-6 w-11 rounded-full relative transition-colors disabled:opacity-40 border ${pa.is_active ? 'bg-[var(--signal-positive)] border-[var(--signal-positive)]' : 'bg-[var(--bg-tertiary)] border-[var(--border-default)]'}`}
              >
                <span
                  /* Positioned with an inline style rather than Tailwind
                     translate utilities. In Tailwind v4 those compile to the
                     CSS `translate` property driven by inherited custom
                     properties (--tw-translate-x), and the off-state reset
                     did not take: a knob carrying `translate-x-0` still
                     computed to `translate: 18px -50%`, i.e. identical to the
                     on state, so the knob never moved and the only cue left
                     was the track colour. Verified by reading computed
                     styles, not by eye. An inline left offset can't be
                     defeated by cascade or JIT generation.
                     20px = 42px padding box - 20px knob - 2px inset, which
                     mirrors the 2px inset of the off state exactly (measured:
                     3px from each outer edge once the 1px border is counted). */
                  style={{ left: pa.is_active ? 20 : 2, top: '50%', transform: 'translateY(-50%)' }}
                  className="absolute w-5 h-5 rounded-full bg-white transition-[left] duration-200"
                />
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
        <h3 className="text-sm font-medium mb-1">Client Intake</h3>
        <p className="text-xs text-[var(--text-secondary)] mb-3">
          Share this link on your website or in email — a submission creates a real prospective client and a matter in your Intake column automatically. It still goes through Conflict Check like any other matter before it can move further.
        </p>
        <div className="border border-[var(--border-subtle)] rounded-lg p-4">
          {!firm ? (
            <span className="text-xs text-[var(--text-tertiary)]">Loading…</span>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-3">
                <UserPlus className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
                <code className="flex-1 min-w-0 text-xs text-[var(--text-secondary)] bg-[var(--bg-tertiary)] rounded px-2 py-1.5 truncate">{intakeLink}</code>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyIntakeLink}
                  className="h-8 px-3 flex items-center gap-1.5 text-xs font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] rounded hover:opacity-90 transition-opacity"
                >
                  <Copy className="w-3.5 h-3.5" /> Copy link
                </button>
                <button
                  onClick={handleRegenerateIntakeLink}
                  disabled={regeneratingIntake}
                  className="h-8 px-3 flex items-center gap-1.5 text-xs font-medium border border-[var(--border-subtle)] rounded hover:bg-[var(--bg-tertiary)] transition-colors disabled:opacity-40"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${regeneratingIntake ? 'animate-spin' : ''}`} /> Regenerate
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-8">
        <h3 className="text-sm font-medium mb-1">Payment Collection (LawPay)</h3>
        <p className="text-xs text-[var(--text-secondary)] mb-3">
          Paste your firm's LawPay hosted payment page link — found in your LawPay account under Payments. Once set, every generated invoice gets a real payment link. Card details are entered on LawPay's own page and never pass through Law OS, which is the entire reason this is an integration rather than a built-in payment form.
        </p>
        <form onSubmit={handleSaveLawpay} className="border border-[var(--border-subtle)] rounded-lg p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">LawPay payment page URL</label>
            <input
              type="url" value={lawpayUrl} onChange={e => setLawpayUrl(e.target.value)}
              placeholder="https://secure.lawpay.com/pay/yourfirm"
              className="w-full h-9 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <CreditCard className="w-3.5 h-3.5 text-[var(--text-tertiary)] shrink-0" />
            <button
              type="submit" disabled={savingLawpay || !lawpayDirty}
              className="h-8 px-3 bg-[var(--text-primary)] text-[var(--bg-primary)] rounded text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {savingLawpay ? 'Saving…' : 'Save'}
            </button>
            {!firm?.lawpay_payment_page_url && <span className="text-[11px] text-[var(--text-tertiary)]">No LawPay account connected yet — payment links won't appear on invoices until this is set.</span>}
          </div>
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
