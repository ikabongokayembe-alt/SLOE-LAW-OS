# Realty OS — Getting it live

## Try it right now (no setup)
The app auto-detects whether Supabase is configured. Without any env vars set,
it runs entirely on local seeded data (`src/data/*.ts`) — every screen, every
interaction, every mutation works in-memory. This is the default state of
this zip. Run:
```
npm install
npm run dev
```
and it opens fully populated at http://localhost:3000. Nothing is wired to a
network. Data resets whenever you refresh the page (mutations are in-memory
only in this mode).

## 1. Create the Supabase project
1. supabase.com → New project (any region close to Bahrain, e.g. `eu-west` or `me-central`).
2. Note the **Project URL** and **anon public key** (Settings → API).
3. Note the **service_role key** too (Settings → API) — needed only for the
   `reset-demo` function secret, never for the frontend.

## 2. Run the schema + seed
Easiest path (no CLI needed): open the Supabase SQL Editor and run, in order:
1. `supabase/migrations/0001_init.sql`
2. `supabase/migrations/0002_seed_function.sql` (this also runs the initial seed)

Or with the Supabase CLI, from the repo root:
```
supabase link --project-ref YOUR-PROJECT-REF
supabase db push
```

## 3. Deploy the edge functions
```
supabase functions deploy ai-call
supabase functions deploy reset-demo
supabase secrets set GEMINI_API_KEY=your_gemini_key
supabase secrets set SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```
(`SUPABASE_URL` and the service role key are auto-injected on most Supabase
projects — only set them manually if `reset-demo` errors with "not configured".)

## 4. Local dev
```
cp .env.example .env.local
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```
App runs at http://localhost:3000

## 5. Deploy
Any static host works (Vite build output is `dist/`). To match your existing
Cloudflare Pages pattern:
```
npm run build
```
Set the same two `VITE_SUPABASE_*` env vars in the Cloudflare Pages project
settings, build command `npm run build`, output directory `dist`.

## What's already wired
- 8 screens (Dashboard, Listings, Leads, Conversations, Viewings, Campaigns,
  Market, Strategic) reading live from Supabase, scoped to one demo tenant —
  or from local seed data automatically when Supabase isn't configured.
- "Reset now" banner button re-seeds the demo tenant via `reset-demo` (Supabase mode only).
- AI calls (insights, campaign copy, etc.) route through `ai-call`, backed by
  Gemini — nothing calls an LLM key from the browser.
- Every interactive element now does something real: conversation search/filters,
  Schedule Viewing and New Campaign creation flows, WhatsApp follow-up drafts
  (copies to clipboard + opens wa.me), live AI message translation, a real
  notifications dropdown, and a Pipeline Velocity chart and Urgent Actions
  card that derive from actual lead/viewing data instead of hardcoded numbers.
- Honest degradation where a real feature isn't built yet: the Call button is
  disabled with a tooltip (no phone field in the data model yet), the EN/AR
  toggle is disabled (no i18n yet) — rather than looking clickable and doing
  nothing.

## What's NOT done yet
- No auth. Anon key can read/write the demo tenant directly (fine for a
  resettable public demo, not for a paying client's real data).
- Multi-tenant support: everything is hardcoded to one `DEMO_TENANT_ID`.
  Turning this into a real per-client product needs tenant provisioning,
  which your Sloe Laboratory tenant-OS pattern already solves — worth
  reusing rather than rebuilding here if this graduates past demo stage.
- No phone numbers on leads (Call button is honestly disabled rather than fake).
- No Arabic UI/i18n (EN/AR toggle is honestly disabled rather than fake).
- Pipeline Velocity chart buckets leads by created_date + current stage —
  real data, but not true historical stage transitions (would need a
  stage_history log to be fully accurate).
- Team Activity and Archived conversation tabs have no underlying data model
  yet — they show an honest empty state rather than fake content.
