// Billing Phase 1 helpers — duration is stored in minutes (see migration
// 0013's comment on why), converted to hours only at display/export time.
// amount is ALWAYS computed here, never stored — see the TimeEntry type
// comment for why a persisted amount would drift.

export function minutesToHours(minutes: number): number {
  return minutes / 60;
}

export function hoursToMinutes(hours: number): number {
  return Math.round(hours * 60);
}

export function computeAmount(durationMinutes: number, rate: number | null): number | null {
  if (rate === null || rate === undefined) return null;
  return minutesToHours(durationMinutes) * rate;
}

export function formatAmount(amount: number, currency: string | null, locale: string): string {
  const code = currency || 'USD';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: code }).format(amount);
  } catch {
    // Intl throws on a currency code it doesn't recognize — fall back to
    // a plain prefix rather than crashing the screen over a bad ISO 4217
    // value someone typed into Firm Settings.
    return `${code} ${amount.toFixed(2)}`;
  }
}

export function formatHours(durationMinutes: number): string {
  const hours = minutesToHours(durationMinutes);
  return hours % 1 === 0 ? String(hours) : hours.toFixed(2);
}
