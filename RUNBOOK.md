# Law OS — Getting it live

## Try it right now (no setup)
The app auto-detects whether Supabase is configured. Without any env vars set,
it runs entirely on local seeded data (`src/data/*.ts`) — every screen, every
interaction, every mutation works in-memory. Run:
```
npm install
npm run dev
```
and it opens fully populated at http://localhost:3000. Nothing is wired to a
network. Data resets whenever you refresh the page (mutations are in-memory
only in this mode).

## 1. Create the Supabase project
1. supabase.com → New project.
2. Note the **Project URL** and **anon public key** (Settings → API).

## 2. Run the schema
Open the Supabase SQL Editor and run, in order:
1. `supabase/migrations/0001_firms_auth.sql`
2. `supabase/migrations/0002_matters_conflict_checks.sql`
3. `supabase/migrations/0003_deadlines_signup.sql`
4. `supabase/migrations/0004_insights.sql`

Or combined as one file: `law-os-full-migration.sql` (all four concatenated).

## 3. Deploy the edge functions
```
supabase functions deploy ai-call
supabase functions deploy composio
supabase functions deploy welcome-email
supabase secrets set GEMINI_API_KEY=your_gemini_key
supabase secrets set COMPOSIO_API_KEY=your_composio_key
supabase secrets set RESEND_API_KEY=your_resend_key
supabase secrets set RESEND_FROM="Law OS <law@sloelabs.com>"
```

## 4. Local dev
```
cp .env.example .env.local
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```
App runs at http://localhost:3000

## 5. Deploy
Vite build output is `dist/`. Set the same two `VITE_SUPABASE_*` env vars
as BUILD-TIME environment variables wherever this deploys (Cloudflare
Worker/Pages, etc.) — they must be present when `npm run build` runs, not
just at runtime, since Vite bakes them into the JS at build time.

## What's already wired
- 9 screens (Command Center, Matters, Deadlines, Conflict Check, Operator,
  Analyst, Agent Library, Team, Integrations) reading live from Supabase,
  scoped to one firm — or from local seed data automatically when Supabase
  isn't configured.
- The conflict-check gate: a matter cannot move out of an intake-marked
  stage without a cleared or explicitly waived conflict check — enforced
  at the database level via a trigger, not just in the UI.
- AI calls (Operator, Analyst) route through `ai-call`, backed by Gemini —
  nothing calls an LLM key from the browser.
- Real OAuth integrations (Gmail, Google Calendar, Outlook, Slack,
  WhatsApp, plus search across Composio's full catalog) via the
  `composio` edge function.
- Real welcome emails via `welcome-email` (Resend).
