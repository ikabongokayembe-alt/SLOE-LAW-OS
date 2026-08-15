-- Globalization foundation: jurisdiction, licensing, locale.
--
-- Why now: `firms` currently has only id/name/created_at — no way to
-- represent what jurisdiction a firm operates in. That's fine for generic
-- practice management, but it directly blocks two things already planned:
-- the statute-of-limitations engine (needs jurisdiction to know which
-- rules apply) and Phase 1 billing (needs currency). Retrofitting this
-- after real firm data exists is much more painful than doing it now,
-- before either of those ship. This migration is purely additive — no
-- existing behavior changes, no UI built on top of the erasure columns
-- yet (see below), no statute engine, no billing UI.
--
-- ─────────────────────────────────────────────────────────────────────
-- 1. firms — jurisdiction + locale
-- ─────────────────────────────────────────────────────────────────────
-- All nullable: not every firm has entered this yet, and a subdivision
-- (region) genuinely doesn't apply to every country. `currency` is the
-- one field backfilled to a concrete value for EXISTING rows only (every
-- firm on the platform today is USD-billed) — that backfill is done with
-- an UPDATE below, not a column DEFAULT, so it says nothing about what a
-- newly-created firm should be assumed to use going forward. New firms
-- get NULL currency until they set it explicitly (see the firm settings
-- screen).
alter table firms add column if not exists country text;   -- ISO 3166-1 alpha-2, e.g. 'US', 'CA', 'GB', 'BH'
alter table firms add column if not exists region text;    -- state/province/emirate/subdivision; not every country has one
alter table firms add column if not exists currency text;  -- ISO 4217, e.g. 'USD', 'CAD', 'GBP', 'BHD'
alter table firms add column if not exists locale text;    -- e.g. 'en-US', 'en-GB', 'ar-BH' — drives date/number formatting

update firms set currency = 'USD' where currency is null;

-- ─────────────────────────────────────────────────────────────────────
-- 2. attorneys — bar_number was US-centric naming (a firm in England or
-- Bahrain doesn't have a "bar number" from a "bar association" in the US
-- sense). Renamed in place (not drop+recreate) so existing data survives;
-- licensing_body records WHICH body issued it ("State Bar of Texas",
-- "Law Society of England and Wales", "Bahrain Bar Society"), which
-- license_number alone doesn't tell you.
-- ─────────────────────────────────────────────────────────────────────
alter table attorneys rename column bar_number to license_number;
alter table attorneys add column if not exists licensing_body text;

-- ─────────────────────────────────────────────────────────────────────
-- 3. Data-erasure readiness (GDPR/LGPD/similar right-to-erasure requests).
-- Schema-only: a nullable deleted_at on the tables most likely to carry
-- personal data. Nothing reads this column yet — no query is changed to
-- filter on it, and no UI/endpoint is built here. This exists purely so
-- that when a real erasure request needs handling later, the columns
-- already exist instead of requiring another migration under time
-- pressure. Do not start relying on this for soft-delete behavior until
-- that follow-up work actually filters on it.
-- ─────────────────────────────────────────────────────────────────────
alter table matters add column if not exists deleted_at timestamptz;
alter table parties add column if not exists deleted_at timestamptz;
alter table deadlines add column if not exists deleted_at timestamptz;
alter table documents add column if not exists deleted_at timestamptz;
alter table profiles add column if not exists deleted_at timestamptz;
