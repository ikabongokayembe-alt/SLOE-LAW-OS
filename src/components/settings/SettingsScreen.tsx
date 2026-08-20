import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../../lib/store';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../lib/toast';
import { Settings, Plus, FileUp, ChevronRight, Copy, RotateCw, UserPlus, CreditCard, CheckCircle2, AlertCircle, ExternalLink, ShieldCheck, Phone, Zap, Check, Sparkles } from 'lucide-react';

import { isLawPayConnected, maskLawPayUrl } from '../../lib/lawpay';
import { fetchPricingPlans, fetchFirmBillingStatus, createCheckoutSession, createPortalSession, PricingPlan, FirmBillingRecord } from '../../lib/billing';


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
  const [phoneAnsweringNumber, setPhoneAnsweringNumber] = useState('');
  const [savingPhoneAnswering, setSavingPhoneAnswering] = useState(false);
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

  const { profile } = useAuth();
  const [billingRecord, setBillingRecord] = useState<FirmBillingRecord | null>(null);
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [loadingBilling, setLoadingBilling] = useState(true);
  const [checkoutBusyPlan, setCheckoutBusyPlan] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);

  useEffect(() => {
    setCountry(firm?.country ?? '');
    setRegion(firm?.region ?? '');
    setCurrency(firm?.currency ?? '');
    setLocale(firm?.locale ?? '');
    setLawpayUrl(firm?.lawpay_payment_page_url ?? '');
    setPhoneAnsweringNumber(firm?.phone_answering_number ?? '');

    async function loadBilling() {
      if (!firm?.id) return;
      setLoadingBilling(true);
      const [bRec, pList] = await Promise.all([
        fetchFirmBillingStatus(firm.id),
        fetchPricingPlans(),
      ]);
      setBillingRecord(bRec);
      setPlans(pList);
      setLoadingBilling(false);
    }
    loadBilling();
  }, [firm]);

  const handleCheckout = async (planKey: 'starter' | 'pro' | 'business') => {
    if (profile?.role !== 'principal' && profile?.role !== 'manager') {
      showToast('error', 'Only firm partners or practice managers can change the firm subscription.');
      return;
    }
    setCheckoutBusyPlan(planKey);
    try {
      const checkoutUrl = await createCheckoutSession(planKey);
      window.location.href = checkoutUrl;
    } catch (err: any) {
      showToast('error', err.message || 'Could not start checkout session.');
      setCheckoutBusyPlan(null);
    }
  };

  const handleManageBilling = async () => {
    if (profile?.role !== 'principal' && profile?.role !== 'manager') {
      showToast('error', 'Only firm partners or practice managers can access the billing portal.');
      return;
    }
    setPortalBusy(true);
    try {
      const portalUrl = await createPortalSession();
      window.location.href = portalUrl;
    } catch (err: any) {
      showToast('error', err.message || 'Could not open billing portal.');
      setPortalBusy(false);
    }
  };


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

  const phoneAnsweringDirty = firm && phoneAnsweringNumber !== (firm.phone_answering_number ?? '');
  const isPhoneAnsweringConnected = firm && !!(firm.phone_answering_number && firm.phone_answering_number.trim().length > 0);
  const handleSavePhoneAnswering = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPhoneAnswering(true);
    await updateFirm({ phone_answering_number: phoneAnsweringNumber.trim() || null });
    setSavingPhoneAnswering(false);
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
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-sm font-medium flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[var(--accent-secondary)]" /> Payment Collection (LawPay)
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Connect your firm's LawPay hosted payment page to accept card payments directly on invoices and through the client portal.
            </p>
          </div>
          {isLawPayConnected(firm) ? (
            <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--signal-positive)] bg-[var(--signal-positive)]/10 border border-[var(--signal-positive)]/30 rounded-full px-2.5 py-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> LawPay Connected
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--signal-warning)] bg-[var(--signal-warning)]/10 border border-[var(--signal-warning)]/30 rounded-full px-2.5 py-1">
              <AlertCircle className="w-3.5 h-3.5" /> Not Connected
            </span>
          )}
        </div>

        <div className="border border-[var(--border-subtle)] bg-[var(--bg-secondary)] rounded-lg p-4 space-y-4">
          {isLawPayConnected(firm) ? (
            <div className="bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-md p-3 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-[var(--text-primary)] flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[var(--signal-positive)]" /> Active Payment Endpoint
                </span>
                <a
                  href={firm?.lawpay_payment_page_url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[var(--accent-secondary)] hover:underline"
                >
                  Visit Hosted Page <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="font-mono text-[var(--text-secondary)] bg-[var(--bg-primary)] px-2.5 py-1.5 rounded border border-[var(--border-subtle)] truncate">
                {maskLawPayUrl(firm?.lawpay_payment_page_url)}
              </div>
              <p className="text-[var(--text-tertiary)]">
                Online payment links are active across all generated invoices and client-facing surfaces. Payments complete securely on LawPay's PCI-compliant hosted checkout.
              </p>
            </div>
          ) : (
            <div className="bg-[var(--signal-warning)]/5 border border-[var(--signal-warning)]/20 rounded-md p-3 text-xs text-[var(--text-secondary)] space-y-1">
              <p className="font-medium text-[var(--text-primary)]">What connecting LawPay unlocks:</p>
              <ul className="list-disc list-inside space-y-0.5 text-[var(--text-secondary)] pl-1">
                <li>Automatic PCI-compliant online payment links generated on all invoices</li>
                <li>One-click direct invoice payment option inside the Client Portal</li>
                <li>Webhook-confirmed automatic payment reconciliation</li>
              </ul>
            </div>
          )}

          <form onSubmit={handleSaveLawpay} className="space-y-3 pt-1">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                {isLawPayConnected(firm) ? 'Update LawPay payment page URL' : 'LawPay payment page URL'}
              </label>
              <input
                type="url"
                value={lawpayUrl}
                onChange={e => setLawpayUrl(e.target.value)}
                placeholder="https://secure.lawpay.com/pay/yourfirm"
                className="w-full h-9 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none focus:border-[var(--border-strong)]"
              />
              <span className="text-[11px] text-[var(--text-tertiary)] mt-1 block">
                Found in your LawPay merchant account dashboard under <em>Payments &gt; Hosted Payment Pages</em>.
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={savingLawpay || !lawpayDirty}
                className="h-8 px-4 bg-[var(--text-primary)] text-[var(--bg-primary)] rounded text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {savingLawpay ? 'Saving…' : 'Save Connection'}
              </button>
              {lawpayDirty && (
                <button
                  type="button"
                  onClick={() => setLawpayUrl(firm?.lawpay_payment_page_url ?? '')}
                  className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Phone className="w-4 h-4 text-[var(--accent-secondary)]" /> Phone Answering (ElevenLabs &amp; Twilio)
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Connect your firm's voice-enabled Twilio phone number to deploy an automated AI answering agent powered by ElevenLabs Conversational AI.
            </p>
          </div>
          {isPhoneAnsweringConnected ? (
            <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--signal-positive)] bg-[var(--signal-positive)]/10 border border-[var(--signal-positive)]/30 rounded-full px-2.5 py-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Voice Agent Active
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--signal-warning)] bg-[var(--signal-warning)]/10 border border-[var(--signal-warning)]/30 rounded-full px-2.5 py-1">
              <AlertCircle className="w-3.5 h-3.5" /> Not Connected
            </span>
          )}
        </div>

        <div className="border border-[var(--border-subtle)] bg-[var(--bg-secondary)] rounded-lg p-4 space-y-4">
          {isPhoneAnsweringConnected ? (
            <div className="bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-md p-3 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-[var(--text-primary)] flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[var(--signal-positive)]" /> Active Twilio Voice Number
                </span>
                <span className="font-mono text-[var(--text-primary)] font-semibold">{firm?.phone_answering_number}</span>
              </div>
              <div className="text-[var(--text-tertiary)] space-y-1">
                <p>Post-call transcripts and triage results are automatically ingested via your post-call webhook endpoint:</p>
                <div className="font-mono text-[11px] text-[var(--text-secondary)] bg-[var(--bg-primary)] px-2.5 py-1.5 rounded border border-[var(--border-subtle)] truncate">
                  {`${window.location.origin.replace(/\.workers\.dev|\.co/, '')}/functions/v1/phone-answering-webhook`}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-[var(--signal-warning)]/5 border border-[var(--signal-warning)]/20 rounded-md p-3 text-xs text-[var(--text-secondary)] space-y-1">
              <p className="font-medium text-[var(--text-primary)]">What connecting AI Phone Answering unlocks:</p>
              <ul className="list-disc list-inside space-y-0.5 text-[var(--text-secondary)] pl-1">
                <li>Automated 24/7 client intake collection for prospective caller inquiries</li>
                <li>Automatic matter note &amp; transcript creation for caller updates on active matters</li>
                <li>Flagged high-priority callback alerts for human staff follow-up</li>
              </ul>
            </div>
          )}

          <form onSubmit={handleSavePhoneAnswering} className="space-y-3 pt-1">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                {isPhoneAnsweringConnected ? 'Update Voice Phone Number' : 'Twilio Voice Phone Number'}
              </label>
              <input
                type="tel"
                value={phoneAnsweringNumber}
                onChange={e => setPhoneAnsweringNumber(e.target.value)}
                placeholder="+1 (555) 234-5678"
                className="w-full h-9 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none focus:border-[var(--border-strong)]"
              />
              <span className="text-[11px] text-[var(--text-tertiary)] mt-1 block">
                Purchased in your Twilio console and imported into your ElevenLabs Conversational AI Agent settings.
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={savingPhoneAnswering || !phoneAnsweringDirty}
                className="h-8 px-4 bg-[var(--text-primary)] text-[var(--bg-primary)] rounded text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {savingPhoneAnswering ? 'Saving…' : 'Save Connection'}
              </button>
              {phoneAnsweringDirty && (
                <button
                  type="button"
                  onClick={() => setPhoneAnsweringNumber(firm?.phone_answering_number ?? '')}
                  className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      </div>



      <div className="mt-8 pt-8 border-t border-[var(--border-subtle)]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[var(--accent-secondary)]" /> Subscription &amp; Billing
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Law OS firm subscription plan, billing portal management, and self-serve upgrades.
            </p>
          </div>
          {billingRecord?.stripe_customer_id && (
            <button
              onClick={handleManageBilling}
              disabled={portalBusy}
              className="flex items-center gap-1.5 h-8 px-3 text-xs bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] rounded font-medium text-[var(--text-primary)] transition-colors disabled:opacity-40"
            >
              {portalBusy ? 'Opening Portal…' : 'Manage Subscription'} <ExternalLink className="w-3 h-3 text-[var(--text-tertiary)]" />
            </button>
          )}
        </div>

        <div className="border border-[var(--border-subtle)] bg-[var(--bg-secondary)] rounded-lg p-5 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[var(--border-subtle)]">
            <div className="space-y-1">
              <div className="text-xs text-[var(--text-tertiary)] font-medium uppercase tracking-wider">Current Firm Plan</div>
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold text-[var(--text-primary)] capitalize">
                  {billingRecord?.plan || 'Free Trial'} Plan
                </span>
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium border ${
                  billingRecord?.billing_status === 'active'
                    ? 'bg-[var(--signal-positive)]/10 text-[var(--signal-positive)] border-[var(--signal-positive)]/30'
                    : billingRecord?.billing_status === 'past_due'
                    ? 'bg-[var(--signal-warning)]/10 text-[var(--signal-warning)] border-[var(--signal-warning)]/30'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                }`}>
                  {billingRecord?.billing_status ? billingRecord.billing_status.toUpperCase() : 'TRIALING'}
                </span>
              </div>
            </div>
            {profile?.role !== 'principal' && profile?.role !== 'manager' && (
              <span className="text-xs text-[var(--text-tertiary)] italic">
                Only firm partners or practice managers can modify billing.
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map((p) => {
              const isCurrent = (billingRecord?.plan || 'trial') === p.planKey;
              const isBusy = checkoutBusyPlan === p.planKey;
              return (
                <div
                  key={p.id}
                  className={`border rounded-lg p-4 flex flex-col justify-between transition-colors ${
                    isCurrent
                      ? 'border-[var(--text-primary)] bg-[var(--bg-primary)] shadow-sm'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-tertiary)]/50 hover:border-[var(--border-default)]'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-[var(--text-primary)]">{p.name}</h4>
                      {isCurrent && (
                        <span className="text-[10px] font-medium bg-[var(--text-primary)] text-[var(--bg-primary)] px-2 py-0.5 rounded-full">
                          Active
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="text-2xl font-bold text-[var(--text-primary)]">
                        ${(p.monthlyCents / 100).toFixed(0)}
                      </span>
                      <span className="text-xs text-[var(--text-tertiary)]"> / month</span>
                    </div>
                    <ul className="space-y-2 pt-2 border-t border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
                      {p.features.map((feat, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <Check className="w-3.5 h-3.5 text-[var(--signal-positive)] shrink-0 mt-0.5" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="pt-4 mt-4">
                    {isCurrent ? (
                      <button
                        disabled
                        className="w-full h-8 bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] border border-[var(--border-subtle)] rounded text-xs font-medium cursor-default"
                      >
                        Current Plan
                      </button>
                    ) : (
                      <button
                        onClick={() => handleCheckout(p.planKey)}
                        disabled={isBusy || (profile?.role !== 'principal' && profile?.role !== 'manager')}
                        className="w-full h-8 bg-[var(--text-primary)] text-[var(--bg-primary)] hover:opacity-90 transition-opacity rounded text-xs font-medium disabled:opacity-40 flex items-center justify-center gap-1"
                      >
                        {isBusy ? (
                          'Redirecting…'
                        ) : (
                          <>
                            <Zap className="w-3.5 h-3.5" /> Select {p.name}
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
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
