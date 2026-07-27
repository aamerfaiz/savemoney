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

> **⚡ Active build plan — read this first.** The step-by-step plan for wiring
> the scaffold to a live backend lives in **`docs/CONNECTION_PLAN.md`**. It
> tracks the "connection phases" (0–7) that take the app from mock-data-only to
> a connected Supabase backend, and it carries a **per-phase Status Log** plus
> an **Overall progress** table. Before starting or resuming connection work,
> open that doc to see what's done vs. pending, do the work, then **update the
> phase's Status Log and the progress table in the same change**. Keep it the
> single source of truth for connection status — don't track it only in chat.

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
  data/mock-dashboard.ts # mock snapshot; getDashboardData() is the seam
  proxy.ts               # session refresh + auth guard (Next 16 "middleware")
drizzle/
  0000_init_phase1.sql   # generated schema migration
  0001_rls_and_seed.sql  # RLS policies, triggers, seeded system categories
```

## Common tasks

### Add a new dashboard card
1. Create a component in `src/components/dashboard/`. Keep it presentational —
   it receives already-computed data as props, no data fetching inside.
2. Add the data it needs to `DashboardData` in `src/data/mock-dashboard.ts`
   (and later to the real query).
3. Render it in `src/app/(app)/dashboard/page.tsx` inside a `<BentoCard>`.
   Use `span={2}` for wide cards, `span={1}` default, `span="full"` for a full
   row. Charts must be `"use client"` (Recharts).

### Add a new feature module (e.g. real Transactions page)
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
3. **Write RLS for any new table** — add policies to a new SQL file mirroring
   `drizzle/0001_rls_and_seed.sql` (enable RLS, then select/insert/update/
   delete `using ((select auth.uid()) = user_id)`). Tables without RLS leak
   data across users; this is non-negotiable.
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

## Verifying changes

- `npm run build` — type-check + prerender. Fix all errors before committing.
- `npm run dev` — local dev. Without env vars → demo mode (mock data).
- **Visual check with the preinstalled Chromium** (no `playwright install`):
  start the server, then a `playwright-core` script with
  `executablePath: '/opt/pw-browsers/chromium-<ver>/chrome-linux/chrome'`.
  Screenshot at 390px (mobile) AND a desktop width — this app is mobile-first,
  so always confirm both. Remove any throwaway deps/scripts before committing.

## Roadmap (build order from the spec)

- **Phase 1** (foundation shipped): Auth, Dashboard, Income, Expenses,
  Categories, Budgets, Goals, Loans, Analytics, CSV import, PWA.
- **Phase 2**: Investments, Net Worth, Reports, Financial Score, Notifications,
  Recurring transactions, Bill calendar.
- **Phase 3**: AI Assistant (pluggable providers), What-if Simulator, Receipt
  OCR, CSV intelligence, auto-categorization.
- **Phase 4**: SMS/Bank/Email sync (one shared import pipeline), shared family
  accounts.
- **Phase 5**: Native mobile (Expo) via a shared Turborepo, offline sync,
  biometrics, widgets.

Design for these seams now (pluggable AI providers, a single import pipeline,
shareable packages) but don't build ahead of the current phase.

**Note the two axes.** The roadmap phases above are about *product scope*
(what features exist). The **connection phases** in `docs/CONNECTION_PLAN.md`
are a separate axis — *wiring the existing scaffold to a live backend*. Most
Phase-1 features are already coded but still run on mock data; the connection
plan is how we turn them on. Consult that doc for current connection status.

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
