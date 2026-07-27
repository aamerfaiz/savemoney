# Finance OS

An AI-powered personal finance **operating system** — not just an expense
tracker. Finance OS helps you answer questions like _"Can I afford a car?"_,
_"How much can I safely spend this month?"_ and _"Am I saving enough?"_ from a
single, mobile-first dashboard.

This repository currently contains the **Phase 1 foundation + dashboard shell**.

---

## Tech stack

| Area        | Choice |
|-------------|--------|
| Framework   | Next.js 16 (App Router) + React 19 + TypeScript |
| Styling     | Tailwind CSS v4 + shadcn/ui conventions (dark-first, purple accent) |
| UI motion   | [React Bits **MagicBento**](https://reactbits.dev) grid (GSAP) |
| Auth        | Supabase Auth (email / password, magic link, Google OAuth) |
| Database    | Supabase Postgres + Drizzle ORM (with Row Level Security) |
| Data / state| TanStack Query + Zustand |
| Validation  | Zod |
| Charts      | Recharts |
| PWA         | Web manifest + installable, mobile-first |

## What's in this build

- **Mobile-first app shell** — desktop sidebar + mobile bottom tab bar, sticky
  header, safe-area aware.
- **Dashboard** built on a reusable **MagicBento** grid (cursor spotlight,
  border glow, particle stars, tilt, magnetism, click ripple — all
  auto-disabled on mobile / reduced-motion). It surfaces monthly income,
  expenses, savings, investments, safe-to-spend budget, net worth trend,
  financial health score, spending breakdown, goals, upcoming bills/EMI and
  recent transactions.
- **Two core finance engines** as pure, testable functions:
  - `src/lib/finance/budget.ts` — the dynamic budgeting / safe-to-spend engine.
  - `src/lib/finance/health-score.ts` — the 0–100 Financial Health Score.
- **Auth wiring** — login page, Supabase browser/server clients, session
  `proxy` (middleware), and OAuth/magic-link callback route.
- **Drizzle schema** for the Phase 1 tables + **RLS policies**, triggers and
  seeded system categories.
- Mock data drives the dashboard so it renders before the database is wired.

## Project structure

```
src/
  app/
    (app)/                 # authed shell: dashboard + module routes
    login/                 # auth screen + form
    auth/callback/         # OAuth / magic-link handler
    manifest.ts            # PWA manifest
  components/
    magic-bento/           # reusable BentoGrid / BentoCard (React Bits)
    dashboard/             # dashboard cards (stat tiles, gauge, charts…)
    nav/                   # sidebar, bottom nav, top bar
    ui/                    # shadcn-style primitives
  db/                      # Drizzle schema + client
  lib/
    finance/               # budget + health-score engines
    supabase/              # client / server / session helpers
    format.ts              # currency / date formatting
  data/                    # mock dashboard snapshot
drizzle/                   # generated migration + RLS/seed SQL
```

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in Supabase values
npm run dev
```

Without Supabase env vars the app runs in **demo mode**: auth is not enforced
and the dashboard renders from mock data.

### Database setup

1. Fill `DATABASE_URL` in `.env.local` (Supabase → Database → Connection string).
2. Apply the schema and policies:

   ```bash
   npm run db:migrate            # applies drizzle/0000_init_phase1.sql
   # then run drizzle/0001_rls_and_seed.sql in the Supabase SQL editor
   # (RLS policies, triggers, and seeded system categories)
   ```

   `npm run db:generate` regenerates migrations after editing
   `src/db/schema.ts`; `npm run db:studio` opens Drizzle Studio.

## Roadmap (from the spec)

- **Phase 1** — Auth, Dashboard, Income, Expenses, Categories, Budgets, Goals,
  Loans, Analytics, CSV import, PWA. _(foundation + dashboard shell in place)_
- **Phase 2** — Investments, Net Worth, Reports, Health Score, Notifications.
- **Phase 3** — AI Assistant with **user-provided API keys (BYOK)** — users add
  their own AI provider keys (DeepSeek R1 Flash first, then OpenAI/Gemini/Claude)
  via an "AI & Integrations" settings screen; keys are encrypted at rest and
  never exposed to the browser. Plus What-if Simulator, OCR, auto-categorization.
- **Phase 4** — SMS/bank/email sync, shared family accounts.
- **Phase 5** — Native mobile (Expo), offline sync, biometrics, widgets.

## Design principles

Mobile-first · WCAG AA in mind · offline-capable PWA · modular architecture ·
privacy-first (Row Level Security, user-owned data) · extensible plugin seams
for AI providers and future bank integrations.
