// LawPay (AffiniPay/8am) hosted payment page link construction.
//
// This is the ENTIRE client-facing surface of the LawPay integration on
// this side: a URL, built from documented query parameters, pointing at
// LawPay's own hosted payment page. No card data, no payment form, no
// API call happens here or anywhere else in this app -- the client
// enters their card on LawPay's page, which is the whole point of using
// a PCI-compliant hosted page instead of building payment collection
// in-house (see migration 0027's header comment for the full reasoning
// and what's confirmed vs. unconfirmed in LawPay's public docs).
//
// Confirmed from developers.8am.com/merchant/hosted-payment-pages.html:
// the page accepts pre-fill query params (name, amount, address1/2,
// city, state, postal_code, country, phone, email, reference,
// recur_frequency), and a `readOnlyFields` param that locks specific
// fields from client editing.
import { Invoice, Firm, Party } from '../types';

// `amount` is in CENTS per the documented hosted-payment-page params
// (matching the Charges API's own `amount` field, also confirmed in
// cents) -- Invoice.total_amount is stored as a decimal currency amount
// (see migration 0025), so this is the one place that unit conversion
// happens, deliberately isolated rather than repeated at each call site.
export function buildLawPayPaymentLink(firm: Pick<Firm, 'lawpay_payment_page_url'>, invoice: Invoice, client: Party | undefined): string | null {
  if (!firm.lawpay_payment_page_url) return null;
  if (invoice.total_amount === null) return null; // nothing to charge if no entry had a rate

  const params = new URLSearchParams();
  if (client?.name) params.set('name', client.name);
  params.set('amount', String(Math.round(invoice.total_amount * 100)));
  // The invoice's own id is the ONE value the lawpay-webhook edge
  // function can reliably use to match an incoming payment notification
  // back to this exact invoice (see supabase/functions/lawpay-webhook) --
  // it is never guessed or derived, always the real primary key.
  params.set('reference', invoice.id);
  // Locks the two fields that matter for correctness: a client should
  // never be able to pay a different amount than what was actually
  // invoiced, or have their payment attributed to a different invoice.
  params.set('readOnlyFields', 'amount,reference');

  const base = firm.lawpay_payment_page_url.replace(/\/+$/, '');
  return `${base}?${params.toString()}`;
}

export function isLawPayConnected(firm: Pick<Firm, 'lawpay_payment_page_url'> | null | undefined): boolean {
  return !!(firm?.lawpay_payment_page_url && firm.lawpay_payment_page_url.trim().length > 0);
}

export function maskLawPayUrl(url: string | null | undefined): string {
  if (!url || !url.trim()) return '';
  const trimmed = url.trim().replace(/\/+$/, '');
  try {
    const parsed = new URL(trimmed);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length > 1) {
      const slug = parts[parts.length - 1];
      const maskedSlug = slug.length > 4 ? `${slug.slice(0, 2)}•••${slug.slice(-2)}` : '••••';
      parts[parts.length - 1] = maskedSlug;
      return `${parsed.origin}/${parts.join('/')}`;
    }
    return `${parsed.origin}${parsed.pathname.slice(0, 10)}...`;
  } catch {
    return trimmed.length > 25 ? `${trimmed.slice(0, 15)}...${trimmed.slice(-8)}` : trimmed;
  }
}

