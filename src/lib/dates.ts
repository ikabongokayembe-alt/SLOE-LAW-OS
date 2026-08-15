// Formats a date-ONLY string (e.g. "2026-06-01" — no time component, as
// stored in `date` columns like matters.opened_date / deadlines.due_date)
// using the LOCAL calendar day, not the UTC day.
//
// `new Date("2026-06-01")` parses a bare date string as UTC midnight;
// piping that through toLocaleDateString() then re-projects it into the
// viewer's local timezone, which can land on the WRONG calendar day for
// any timezone west of UTC (confirmed live: a stored "2026-06-01"
// statute-of-limitations date rendered as "May 31, 2026" in a UTC-5
// browser). That's not a cosmetic rounding difference for a legal
// deadline product — it's exactly the kind of off-by-one this app can't
// afford. This parses the same string as a local calendar date instead,
// so the day shown is always the day that was actually stored.
//
// Do NOT use this for real timestamps (created_at, etc. — full ISO
// 8601 with time+offset) — those already represent a genuine instant and
// format correctly with plain toLocaleDateString(); only bare date-only
// strings need this.
// Parses a bare "YYYY-MM-DD" string as a local calendar date (midnight
// local time), not UTC midnight. Shared by formatDateOnly and anything
// else (e.g. days-until-due countdowns) that needs to reason about a
// date-only value as an actual calendar day rather than an instant.
export function parseDateOnly(dateOnlyString: string): Date {
  const [y, m, d] = dateOnlyString.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatDateOnly(dateOnlyString: string, locale: string, options: Intl.DateTimeFormatOptions): string {
  return parseDateOnly(dateOnlyString).toLocaleDateString(locale, options);
}
