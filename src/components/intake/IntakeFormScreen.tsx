import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { CheckCircle2 } from 'lucide-react';

interface PracticeAreaOption { key: string; label: string; }

// Public, unauthenticated -- reachable by anyone with the firm's shareable
// intake link (no StoreProvider/AuthProvider needed, unlike every staff
// screen: this page never has a session at all). Same token-authorized-
// action shape as AcceptInviteScreen, just with no signup step, since a
// prospective client isn't creating an account here.
//
// One fixed form: name, contact info, practice area, a short description.
// Not a form-builder -- these are the only fields submit_intake (migration
// 0026) knows how to accept.
export function IntakeFormScreen() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [resolving, setResolving] = useState(true);
  const [firmName, setFirmName] = useState<string | null>(null);
  const [practiceAreas, setPracticeAreas] = useState<PracticeAreaOption[]>([]);
  const [linkError, setLinkError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [practiceAreaKey, setPracticeAreaKey] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!token) { setResolving(false); setLinkError('This link is missing its token.'); return; }
    let cancelled = false;
    supabase.rpc('get_intake_firm', { p_token: token }).then(({ data, error }) => {
      if (cancelled) return;
      setResolving(false);
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row) { setLinkError("This intake link isn't valid — ask the firm for a current one."); return; }
      setFirmName(row.firm_name);
      setPracticeAreas((row.practice_areas ?? []) as PracticeAreaOption[]);
    });
    return () => { cancelled = true; };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    const { error } = await supabase.rpc('submit_intake', {
      p_token: token,
      p_name: name.trim(),
      p_email: email.trim() || null,
      p_phone: phone.trim() || null,
      p_practice_area_key: practiceAreaKey || null,
      p_description: description.trim() || null,
    });
    setSubmitting(false);
    if (error) { setSubmitError("Couldn't submit — try again, or contact the firm directly."); return; }
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {resolving ? (
          <p className="text-sm text-[var(--text-tertiary)] text-center">Loading…</p>
        ) : linkError ? (
          <div className="text-center">
            <h1 className="font-display font-semibold text-xl tracking-tight mb-2">Link not found</h1>
            <p className="text-sm text-[var(--text-secondary)]">{linkError}</p>
          </div>
        ) : submitted ? (
          <div className="text-center">
            <CheckCircle2 className="w-8 h-8 text-[var(--signal-positive)] mx-auto mb-3" />
            <h1 className="font-display font-semibold text-xl tracking-tight mb-2">Thank you</h1>
            <p className="text-sm text-[var(--text-secondary)]">
              {firmName} has received your information and will be in touch. Every new matter goes through a conflict check before we can take it on, so there may be a short wait before you hear back.
            </p>
          </div>
        ) : (
          <>
            <h1 className="font-display font-semibold text-2xl tracking-tight mb-1">Contact {firmName}</h1>
            <p className="text-sm text-[var(--text-secondary)] mb-8">Tell us a bit about your situation and we'll follow up.</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-[10px] uppercase font-mono tracking-wider text-[var(--text-tertiary)] block mb-1">Full name</label>
                <input required value={name} onChange={e => setName(e.target.value)} className="w-full h-10 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase font-mono tracking-wider text-[var(--text-tertiary)] block mb-1">Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full h-10 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none" />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-mono tracking-wider text-[var(--text-tertiary)] block mb-1">Phone</label>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="w-full h-10 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none" />
                </div>
              </div>
              {practiceAreas.length > 0 && (
                <div>
                  <label className="text-[10px] uppercase font-mono tracking-wider text-[var(--text-tertiary)] block mb-1">What's this regarding?</label>
                  <select value={practiceAreaKey} onChange={e => setPracticeAreaKey(e.target.value)} className="w-full h-10 px-3 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none">
                    <option value="">Not sure / other</option>
                    {practiceAreas.map(pa => <option key={pa.key} value={pa.key}>{pa.label}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="text-[10px] uppercase font-mono tracking-wider text-[var(--text-tertiary)] block mb-1">Briefly describe your matter</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={4}
                  placeholder="What's going on, and what do you need help with?"
                  className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded text-sm focus:outline-none resize-none"
                />
              </div>
              {submitError && <div className="text-xs text-[var(--signal-negative)]">{submitError}</div>}
              <button type="submit" disabled={submitting || !name.trim()} className="w-full h-10 bg-[var(--text-primary)] text-[var(--bg-primary)] rounded text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40">
                {submitting ? 'Submitting…' : 'Submit'}
              </button>
              <p className="text-[11px] text-[var(--text-tertiary)] text-center">
                Submitting this does not create an attorney-client relationship until {firmName} confirms it can take your matter.
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
