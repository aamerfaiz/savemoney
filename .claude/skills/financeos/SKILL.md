---
name: financeos
description: >-
  Architecture guide and working conventions for the Finance OS codebase (the
  "savemoney" repo) — an AI-powered personal finance app built with Next.js 16,
  React 19, Tailwind v4, Supabase, and Drizzle ORM. Use this skill whenever you
  are adding, changing, or debugging ANYTHING in this repository: new dashboard
  cards or modules (income, expenses, budgets, goals, loans, analytics, etc.),
  database schema or migrations, Row Level Security policies, Supabase auth,
  the MagicBento UI grid, styling/theming, or the finance calculation engines.
  Read this before writing code here so your changes match the established
  patterns instead of reinventing them.
---

# Finance OS — codebase guide for agents

Finance OS is a mobile-first, AI-powered personal finance **operating system**
(not just an expense tracker). It answers questions like "Can I afford a car?"
and "How much can I safely spend this month?" from one dashboard. This skill
tells you how the code is organized and how to extend it consistently.

The full product spec lives in the repo history / issue that seeded it; the
roadmap phases below summarize it. Ground truth for *how things are built* is
this file plus the code it points to.

## Golden rules

1. **Match existing patterns.** Before adding a component, card, table, or
   route, open a sibling that already does the same thing and mirror it. The
   codebase is small and deliberately consistent.
2. **Dark-first, mobile-first.** Design for a 390px viewport first, then scale
   up. Never hard-code colors — use the design tokens (see Styling).
3. **Money is `numeric(14,2)` + an ISO currency code per row.** Never store
   money as float. Format for display only via `src/lib/format.ts`.
4. **Every user-owned row has `userId` → `auth.users(id)` and RLS.** Data
   isolation is a core requirement. New tables MUST get RLS policies.
5. **Keep finance logic as pure functions** in `src/lib/finance/`. They must be
   testable without a database or a browser. The dashboard, analytics, and the
   future what-if simulator all reuse them.
6. **Verify with `npm run build`** before committing — it type-checks and
   prerenders. Screenshots via the preinstalled Chromium are the way to check
   UI (see Verifying changes).

## Tech stack (fixed — don't swap without asking)

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 ·
shadcn/ui conventions · Supabase (Auth + Postgres + Storage) · Drizzle ORM ·
TanStack Query · Zustand · Zod · Recharts · GSAP (MagicBento) · deployed on
Vercel · PWA.

Note Next.js 16 specifics: the app uses **Tailwind v4** (CSS `@theme`, no
`tailwind.config.js`) and the **`proxy.ts`** convention (Next 16 renamed
`middleware.ts` → `proxy.ts`, exported function is `proxy`). See
`node_modules/next/dist/docs/` when unsure about a Next 16 API.

## Where things live

```
src/
  app/
    (app)/               # authed shell (route group)
      layout.tsx         # sidebar + top bar + bottom nav, content padding
      dashboard/page.tsx # the MagicBento dashboard (server component)
      <module>/page.tsx  # transactions, budget, goals, loans, analytics, settings
    login/               # auth screen (auth-form.tsx is the client form)
    auth/callback/route.ts  # OAuth / magic-link code exchange
    layout.tsx           # root: fonts, <Providers>, metadata, viewport
    manifest.ts          # PWA manifest (metadata route)
    globals.css          # design tokens (@theme) + base styles
  components/
    magic-bento/         # BentoGrid / BentoCard / GlobalSpotlight (+ css)
    dashboard/           # dashboard cards (stat-tile, health-gauge, charts…)
    nav/                 # sidebar, bottom-nav, top-bar, nav-config
    ui/                  # shadcn-style primitives (button, card, input…)
    icon.tsx             # string-name → lucide icon resolver
    providers.tsx        # TanStack Query provider
    coming-soon.tsx      # placeholder for unbuilt modules
  db/
    schema.ts            # Drizzle schema (all tables + enums + types)
    index.ts             # server-side Drizzle client (postgres-js)
  lib/
    finance/             # budget.ts, health-score.ts (PURE engines)
    supabase/            # client.ts, server.ts, middleware.ts (session)
    format.ts            # formatCurrency / formatPercent / dates
    utils.ts             # cn() classname merge
  data/mock-dashboard.ts # DashboardData shape + demo-mode fallback only
  lib/dashboard/queries.ts # REAL dashboard, composed from the module queries
  lib/profile/           # getProfile (name + base currency) + updateProfile
  proxy.ts               # session refresh + auth guard (Next 16 "middleware")
drizzle/
  0000_init_phase1.sql        # generated: tables, enums, FKs
  0001_advisor_hardening.sql  # generated: FK-covering indexes (idempotent)
  manual/
    0001_rls_and_seed.sql     # hand-written: RLS, triggers, seed (applied out-of-band)
  meta/                       # drizzle snapshots — keep in sync via db:generate
```

Drizzle owns the numbered schema migrations (`0000`, `0001`, …) and their
`meta/` snapshots; run `npm run db:generate` after editing `schema.ts` so the
snapshot stays in sync. Hand-written SQL that Drizzle can't diff (RLS policies,
triggers, seed data) lives in `drizzle/manual/` and is applied separately via
the Supabase MCP `apply_migration` or the SQL editor.

## Common tasks

### Add a new dashboard card
1. Create a component in `src/components/dashboard/`. Keep it presentational —
   it receives already-computed data as props, no data fetching inside.
2. Add the data it needs to `DashboardData` in `src/data/mock-dashboard.ts`
   (and later to the real query).
3. Render it in `src/app/(app)/dashboard/page.tsx` inside a `<BentoCard>`.
   Use `span={2}` for wide cards, `span={1}` default, `span="full"` for a full
   row. Charts must be `"use client"` (Recharts).

### Add a new feature module
**Copy the Transactions module — it is the reference implementation.** It shows
the full pattern end to end: `src/lib/transactions/` holds `types.ts` (Zod
input schema + unified type), `reference.ts` (category/account options),
`queries.ts` (server reads, RLS-scoped, with a demo fallback), `actions.ts`
(`"use server"` create/update/soft-delete), and `mock.ts` (demo data). The UI
is `src/components/transactions/` (`transactions-view.tsx` client shell +
`transaction-form.tsx`), wired from `src/app/(app)/transactions/page.tsx`
(server component). Mirror this shape for goals, loans, budgets, etc.

1. The route already exists as a `ComingSoon` stub under `src/app/(app)/`.
   Replace the stub's body.
2. Add the module to `src/components/nav/nav-config.ts` if it's not there
   (set `primary: true` to appear in the mobile bottom bar — keep that to ~5
   items for thumb reach).
3. Fetch data in a **server component** via `createClient()` from
   `@/lib/supabase/server`; RLS scopes rows to the user automatically. Use
   **Server Actions** for mutations. Validate all input with **Zod**.
4. Reuse `ui/` primitives and the finance engines; don't recompute budgets or
   scores by hand.

### Change the database
1. Edit `src/db/schema.ts` (follow the existing table style: `defaultRandom()`
   uuid PK, `userId` FK to `authUsers.id`, the shared `audit` columns —
   `createdAt`/`updatedAt`/`deletedAt` — and an index on `userId`).
2. Run `npm run db:generate` to produce a new `drizzle/NNNN_*.sql`.
3. **Write RLS for any new table** — add policies to a new SQL file in
   `drizzle/manual/` mirroring `drizzle/manual/0001_rls_and_seed.sql` (enable
   RLS, then select/insert/update/delete `using ((select auth.uid()) =
   user_id)`). Tables without RLS leak data across users; this is
   non-negotiable. Also index every new foreign-key column (Supabase's advisor
   flags unindexed FKs) — put those in `schema.ts` so they're tracked.
4. Apply: `npm run db:migrate` for the generated file, and run the RLS/seed
   SQL in the Supabase SQL editor (or via the Supabase MCP `apply_migration`).
   The project ref is in `.mcp.json`.
5. Regenerate types if you use them: Supabase MCP `generate_typescript_types`.

### Work with the MagicBento grid
`src/components/magic-bento/magic-bento.tsx` exports `BentoGrid`, `BentoCard`,
`GlobalSpotlight`, `useMobileDetection`. It's a generalized port of React Bits'
MagicBento (GSAP effects: spotlight, border glow, particle stars, tilt,
magnetism, click ripple). All effects **auto-disable on mobile and under
reduced-motion** — preserve that. Per-card toggles: `enableStars`,
`enableBorderGlow`, `enableTilt`, `enableMagnetism`, `clickEffect`. The glow
color comes from the CSS var `--glow-color` (RGB triplet), set on the card via
tokens — don't pass hard-coded RGB.

### Auth
- Browser: `createClient()` from `@/lib/supabase/client`.
- Server/Actions/Route Handlers: `createClient()` from `@/lib/supabase/server`.
- Session refresh + route guard: `src/proxy.ts` → `updateSession()` in
  `@/lib/supabase/middleware`. **Auth is only enforced when the Supabase env
  vars are set** — absent them the app runs in demo mode on mock data. Keep
  that graceful fallback so the UI is always runnable.

## Personalization, currency & optimistic UI

- **User identity**: never hard-code a name. `getProfile()` (`src/lib/profile/
  queries.ts`) returns the signed-in user's display name + base currency (a
  neutral "there"/USD guest in demo mode); the app shell and dashboard read
  from it. Settings (`/settings`) edits both via `updateProfile`.
- **Base currency**: the profile's `base_currency` is the app's display default
  and is stamped onto every newly-created row — create actions call
  `baseCurrencyFor(supabase, userId)` instead of hard-coding "USD". Existing
  rows keep their stored currency (no conversion yet — that's the future
  multi-currency module).
- **Optimistic UI**: list views (transactions/budgets/goals/loans) own their
  deletes with React 19 `useOptimistic` — the row disappears immediately inside
  a `startTransition`, then the Server Action + `router.refresh()` confirm. Any
  derived totals recompute from the optimistic list. Follow this pattern (view
  owns the mutation, row calls an `onDelete` prop) rather than per-row
  transitions.

## Navigation & loading

- **Instant tab switches**: every route under `(app)/` has a `loading.tsx` that
  renders a skeleton mirroring its layout (built from `src/components/
  skeletons.tsx` + the `Skeleton` primitive). The App Router swaps it in the
  moment a tab is tapped, then streams the server-rendered page — so navigation
  never blocks on data. Add a `loading.tsx` for any new route.
- **Mobile nav**: the bottom bar holds only 5 primary items. The **top-left
  logo opens a full-nav drawer** (`src/components/nav/mobile-nav.tsx`) covering
  everything, incl. Loans/Import/Settings. It's **portaled to `document.body`**
  because the header's `backdrop-blur` (a `backdrop-filter` ancestor) would
  otherwise trap `position: fixed`. Any fixed overlay mounted inside the header
  needs the same portal treatment.

## Styling & design tokens

Defined in `src/app/globals.css` under `@theme` and `:root`. Use utility
classes that map to them; never inline hex.

- Surfaces: `bg-background`, `bg-card`, `bg-muted`, `bg-accent`, `border-border`
- Text: `text-foreground`, `text-muted-foreground`, `text-card-foreground`
- Brand (purple): `bg-brand`, `text-brand`, `bg-brand/15` (accent = 132,0,255)
- Semantic: `text-positive` (green), `text-negative` (red), `text-warning`,
  `text-info`
- Radii: `rounded-lg` (20px), `rounded-md` (14px), `rounded-sm` (10px)
- Numbers: add `tabular-nums` to money/metrics so they don't jitter.
- Merge classes with `cn()` from `@/lib/utils`.

Light theme is opt-in via `:root[data-theme="light"]`; the app ships dark-first.

## The finance engines (the actual product value)

These are pure and must stay that way — CRUD is table-stakes, this logic is the
differentiator.

- `src/lib/finance/budget.ts` — `computeBudget()`:
  `Safe-to-Spend = Income − Fixed Expenses − Investments − Loan Payments −
  Goal contributions`, then daily/weekly slices, remaining, utilization,
  per-remaining-day, overspend flag.
- `src/lib/finance/health-score.ts` — `computeHealthScore()`: the weighted
  0–100 score from savings rate, emergency fund, debt ratio, investment rate,
  budget discipline, income stability, goal completion. Returns score, band,
  and per-signal breakdown.

Future engines to add here the same way: what-if simulator, loan amortization /
payoff projection, net-worth history.

## The import pipeline (shared — reuse it for SMS/bank/email later)

`src/lib/import/pipeline.ts` is the single, pure entry point every importer
funnels through (spec: "all imports should use the same processing pipeline").
CSV is the first consumer; SMS/email/bank feeds (Phase 4) should produce the
same `Record<string,string>[]` raw rows and call the same functions:
`detectMapping` (header → field guessing), `normalizeRow` (→ a `CanonicalRow`
with kind/amount/date), `dedupeKey`, and `buildPreview` (flags duplicates both
within the batch and against the DB). Keep it pure — no I/O — so it runs on the
server (with DB dedupe) or the client (instant preview).

Persistence: every import creates an `import_batches` row and stamps each
inserted income/expense with `import_batch_id`, so **rollback** is a soft-delete
of all rows for a batch plus `status = 'rolled_back'` (`src/lib/import/actions.ts`:
`previewImport` / `commitImport` / `rollbackImport`). Duplicate identity is
`kind|amount|date|description`. UI is a 4-step wizard in
`src/components/import/`. Route: `/import`.

## AI providers & user API keys (BYOK) — required, Phase 3

Finance OS is **bring-your-own-key**: each user stores their own AI provider
API key(s) and the app uses them to run AI features. DeepSeek R1 Flash is the
first provider; OpenAI, Gemini and Claude follow via the same abstraction. This
is a first-class product requirement, not an afterthought — the spec calls for
an "extensible plugin architecture for AI providers."

Implementation is deferred to **Phase 3**, but design to this shape so nothing
has to be retrofitted:

**Security model (non-negotiable — these are user secrets):**
- Keys are **never readable by the browser.** Store them in a **private schema
  that is NOT exposed to PostgREST** (e.g. `private.ai_provider_keys`), so the
  anon/authenticated Supabase API cannot `SELECT` them at all.
- **Encrypt at rest with app-level AES-256-GCM** (envelope encryption) using a
  server-only `AI_KEYS_ENCRYPTION_KEY` env secret. Even a leaked row is
  ciphertext. Never log plaintext keys.
- Plaintext is decrypted **only** in trusted server code (Server Actions /
  Route Handlers / Edge Functions) at call time, and used immediately.
- The client only ever receives non-secret metadata:
  `provider · model · ••••last4 · is_active · createdAt`.

**Intended table** (add in the Phase 3 migration, with RLS `user_id =
auth.uid()`, in the private schema; do not expose via the API):
`private.ai_provider_keys(id, user_id → auth.users, provider, label,
encrypted_key, key_iv, key_last4, model, is_active, createdAt, updatedAt,
deletedAt)`.

**Provider abstraction** — `src/lib/ai/`:
- `types.ts` — an `AIProvider` interface (e.g. `chat()`, `summarize()`,
  `testKey()`) so features never hard-code a vendor.
- `providers/deepseek.ts` — first adapter (DeepSeek R1 Flash). New vendors =
  one new adapter file; register them in a small `registry.ts`.
- A server-only resolver that loads the user's active key, decrypts it, picks
  the adapter, and runs the call. AI features (monthly summary, expense
  insights, ask-a-question, receipt categorization, CSV cleanup) call the
  resolver, never a vendor SDK directly.

**Settings UI** — an "AI & Integrations" section: paste key → **test
connection** → save; rotate/delete; masked display. Gate the AI Assistant
module behind "user has a valid active key" (it is an optional module).

## Verifying changes

- `npm run build` — type-check + prerender. Fix all errors before committing.
- `npm run dev` — local dev. Without env vars → demo mode (mock data).
- **Visual check with the preinstalled Chromium** (no `playwright install`):
  start the server, then a `playwright-core` script with
  `executablePath: '/opt/pw-browsers/chromium-<ver>/chrome-linux/chrome'`.
  Screenshot at 390px (mobile) AND a desktop width — this app is mobile-first,
  so always confirm both. Remove any throwaway deps/scripts before committing.

## Roadmap (build order from the spec)

- **Phase 1** (in progress): Auth ✅, Dashboard ✅, **Transactions (income +
  expenses) ✅** — the reference module — Categories (seeded) ✅, **Budget ✅**
  (safe-to-spend via `computeBudget` + per-category limits with live spend),
  **Goals ✅** (`computeGoalProjection`), **Loans ✅** (`computeLoanProjection`:
  amortization, payoff date, interest/time saved from extra EMI; record-payment
  splits principal/interest). Safe-to-spend now pulls real income, recurring
  expenses, goal contributions and loan EMIs — only `investments` is still 0
  (Phase 2). **Analytics ✅** (`src/lib/analytics`: trailing-6-month income vs
  expenses, savings-rate trend, category breakdown, top categories, derived
  health score; charts in `src/components/analytics`). **CSV import ✅** — see
  the import pipeline below. **Phase 1 is complete.**
- **Phase 2**: Investments, Net Worth, Reports, Financial Score, Notifications,
  Recurring transactions, Bill calendar.
- **Phase 3**: AI Assistant with **user-provided API keys (BYOK)** — see the
  "AI providers & user API keys" section above — pluggable providers
  (DeepSeek first), What-if Simulator, Receipt OCR, CSV intelligence,
  auto-categorization.
- **Phase 4**: SMS/Bank/Email sync (one shared import pipeline), shared family
  accounts.
- **Phase 5**: Native mobile (Expo) via a shared Turborepo, offline sync,
  biometrics, widgets.

Design for these seams now (pluggable AI providers, a single import pipeline,
shareable packages) but don't build ahead of the current phase.

## Gotchas

- Tailwind **v4**: no config file; tokens live in CSS `@theme`. Fractional
  spacing like `size-4.5` is valid.
- Recharts v3 tooltip `formatter` values are typed loosely — coerce with
  `Number(value)` (see `net-worth-card.tsx`).
- `useSearchParams` (client) needs a `<Suspense>` boundary — see `login/page`.
- Don't commit `node_modules`, `.env.local`, `.next`, or throwaway scripts.
  `.env.example` documents required vars.
- The Supabase MCP server is configured in `.mcp.json` (project ref
  `ucgholzcnqqwwentdaqt`); it requires per-user OAuth (`claude /mcp`).
