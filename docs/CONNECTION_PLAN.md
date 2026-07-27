# Finance OS — Connection Plan

**Goal:** take the current scaffold (UI shell + dashboard rendering from mock
data, all other modules stubbed) and **connect it to a live Supabase backend**
so real user data flows end-to-end: auth → database (RLS) → server queries →
UI → mutations.

This plan is organized as **connection phases**. They are about *wiring what
already exists to real data*, which is a different axis from the product
roadmap phases in `README.md`. Each phase below is independently shippable and
leaves the app runnable (demo mode still works when env vars are absent).

**How to use this doc:** each phase has an **Objective**, **Tasks**,
**Files**, **Acceptance criteria**, and a **Status Log**. As we execute, we
update the `Status:` field and append dated entries to the Status Log. Nothing
is coded until you've read and approved this plan.

**Status legend:** `⬜ Not started` · `🟡 In progress` · `✅ Done` · `⛔ Blocked`

---

## Current state (baseline)

| Area | State |
|------|-------|
| App shell (sidebar / bottom nav / top bar) | ✅ Built |
| Dashboard UI (MagicBento cards) | ✅ Built, but on **mock** `getDashboardData()` |
| Finance engines (`budget.ts`, `health-score.ts`) | ✅ Pure, ready to reuse |
| Drizzle schema + migrations (`0000`, `0001` RLS/seed) | ✅ Written, **not verified applied** |
| Supabase clients (`client/server/middleware`) | ✅ Present |
| Auth (login, callback, proxy guard) | ⚠️ Wired but **only enforced when env vars set** (demo mode otherwise) |
| `.env.example` | ⛔ Missing |
| Transactions / Budget / Goals / Loans / Analytics / Settings | ⛔ `ComingSoon` stubs |
| Real data access (queries / server actions) | ⛔ None |

---

## Phase 0 — Infrastructure & environment

**Objective:** a reproducible, documented backend the app can actually talk to.
Migrations applied, RLS live, env documented, connection verified.

**Tasks**
- [ ] Add `.env.example` documenting `NEXT_PUBLIC_SUPABASE_URL`,
      `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DATABASE_URL` (pooled, port 6543),
      and any auth redirect vars.
- [ ] Confirm/apply `drizzle/0000_init_phase1.sql` against the Supabase project.
- [ ] Run `drizzle/0001_rls_and_seed.sql` (RLS policies, `profiles` trigger,
      seeded system categories) via Supabase SQL editor / MCP `apply_migration`.
- [ ] Verify RLS is enabled on every user-owned table.
- [ ] Verify the Supabase MCP connection / project ref (`ucgholzcnqqwwentdaqt`).
- [ ] Document the setup steps in `README.md` (validate against reality).

**Files:** `.env.example`, `drizzle/*.sql` (verify), `README.md`

**Acceptance criteria**
- A fresh clone with valid env vars connects to the DB; `npm run build` passes.
- `list_tables` shows all Phase-1 tables with RLS enabled.
- Seeded system categories are present.

**Status:** ⬜ Not started
**Status Log**
| Date | Update |
|------|--------|
| _(placeholder)_ | _pending_ |

---

## Phase 1 — Authentication end-to-end

**Objective:** real accounts. Sign up, log in (email/password + magic link +
Google OAuth), log out, session persists, unauthenticated users are guarded to
`/login`, and a `profiles` row is created per user.

**Tasks**
- [ ] Verify email/password + magic-link sign-in through `login/auth-form.tsx`.
- [ ] Verify OAuth/magic-link `auth/callback/route.ts` code exchange.
- [ ] Confirm `proxy.ts` → `updateSession()` guards `(app)` routes when env set.
- [ ] Confirm the `profiles` insert trigger fires on new user (from `0001`).
- [ ] Add sign-out action and surface current user in the top bar.
- [ ] Preserve demo-mode fallback when env vars are absent.

**Files:** `src/app/login/*`, `src/app/auth/callback/route.ts`,
`src/proxy.ts`, `src/lib/supabase/*`, `src/components/nav/top-bar.tsx`

**Acceptance criteria**
- New signup creates an `auth.users` + `profiles` row.
- Visiting `(app)` while logged out redirects to `/login`; logged in stays.
- Sign-out clears the session and redirects.

**Status:** ⬜ Not started
**Status Log**
| Date | Update |
|------|--------|
| _(placeholder)_ | _pending_ |

---

## Phase 2 — Data access layer & dashboard on real data

**Objective:** replace the mock seam with real, RLS-scoped queries. The
dashboard is the proof: same `DashboardData` shape, sourced from Supabase.

**Tasks**
- [ ] Create `src/lib/data/` server query helpers (RLS-scoped via
      `createClient()` from `@/lib/supabase/server`).
- [ ] Implement `getDashboardData()` for real: aggregate income/expenses/
      goals/loans, then feed the **existing** `computeBudget()` /
      `computeHealthScore()` engines (do not recompute by hand).
- [ ] Keep the mock as an explicit demo-mode fallback (no env → mock).
- [ ] Wire TanStack Query provider usage for any client-side reads.
- [ ] Empty-state handling for brand-new accounts (no rows yet).

**Files:** `src/lib/data/*` (new), `src/data/mock-dashboard.ts` (becomes
fallback), `src/app/(app)/dashboard/page.tsx`

**Acceptance criteria**
- With env + a seeded account, the dashboard reflects real DB rows.
- With no env, dashboard still renders from mock (demo mode).
- New account shows sensible zero/empty states, no crashes.

**Status:** ⬜ Not started
**Status Log**
| Date | Update |
|------|--------|
| _(placeholder)_ | _pending_ |

---

## Phase 3 — Transactions module (income + expenses CRUD)

**Objective:** the highest-volume data, and what most other modules depend on.
Replace the `transactions` stub with real list + create/edit/delete.

**Tasks**
- [ ] Server component list (paginated, RLS-scoped) for income + expenses.
- [ ] Server Actions for create/update/soft-delete; validate with **Zod**.
- [ ] Category picker sourced from `categories` (system + user).
- [ ] Money as `numeric(14,2)` + currency per row; format via `format.ts`.
- [ ] Optimistic UI via TanStack Query where it helps.

**Files:** `src/app/(app)/transactions/page.tsx`, new components under
`src/components/transactions/`, new actions, `src/db/schema.ts` (reuse)

**Acceptance criteria**
- User can add/edit/delete an expense and an income entry; list updates.
- Rows are user-isolated (RLS verified with a second account).
- Dashboard aggregates reflect new transactions.

**Status:** ⬜ Not started
**Status Log**
| Date | Update |
|------|--------|
| _(placeholder)_ | _pending_ |

---

## Phase 4 — Categories & Budgets module

**Objective:** manage categories and per-period budgets; drive the
safe-to-spend engine from real budget rows.

**Tasks**
- [ ] Categories management (list/create/edit, respect system vs user).
- [ ] Budgets CRUD per category/period; validate with Zod.
- [ ] Feed real budgets into `computeBudget()`; render on budget page + card.
- [ ] Utilization / overspend flags from live data.

**Files:** `src/app/(app)/budget/page.tsx`, `src/components/budget/*` (new),
`src/lib/finance/budget.ts` (reuse), actions

**Acceptance criteria**
- Creating a budget changes the dashboard Budget card and `/budget`.
- Overspend flag appears when spend exceeds the limit.

**Status:** ⬜ Not started
**Status Log**
| Date | Update |
|------|--------|
| _(placeholder)_ | _pending_ |

---

## Phase 5 — Goals & Loans modules

**Objective:** real goals (with contributions) and loans (with payments),
feeding the dashboard cards and the health score.

**Tasks**
- [ ] Goals CRUD + contributions (progress, priority, status).
- [ ] Loans CRUD + payments; surface EMI/upcoming items.
- [ ] Feed goal contributions + loan payments into budget/health engines.

**Files:** `src/app/(app)/goals/page.tsx`, `src/app/(app)/loans/page.tsx`,
`src/components/goals/*`, `src/components/loans/*` (new), actions

**Acceptance criteria**
- Adding a goal contribution updates goal progress + dashboard Goals card.
- Loan payments reflect in upcoming items and safe-to-spend.

**Status:** ⬜ Not started
**Status Log**
| Date | Update |
|------|--------|
| _(placeholder)_ | _pending_ |

---

## Phase 6 — Analytics & full dashboard aggregation

**Objective:** real net-worth trend, spending-by-category, and cash-flow
analytics computed from the database over time.

**Tasks**
- [ ] Spending-by-category + net-worth trend queries (time-bucketed).
- [ ] Replace remaining mock aggregates in `DashboardData`.
- [ ] Build the `/analytics` page from real series (Recharts, `"use client"`).

**Files:** `src/app/(app)/analytics/page.tsx`, `src/lib/data/*`,
`src/components/dashboard/*` (reuse chart cards)

**Acceptance criteria**
- Analytics charts match underlying transactions.
- No remaining hard-coded mock values on the dashboard when env is set.

**Status:** ⬜ Not started
**Status Log**
| Date | Update |
|------|--------|
| _(placeholder)_ | _pending_ |

---

## Phase 7 — Settings, CSV import & polish

**Objective:** account/profile settings, currency, CSV import pipeline, and
final PWA/verification polish.

**Tasks**
- [ ] Settings page: profile, default currency, theme, sign-out.
- [ ] CSV import → single normalized import pipeline (design for Phase-4 sync).
- [ ] PWA install check; mobile (390px) + desktop screenshot verification.
- [ ] Full `npm run build` + lint clean.

**Files:** `src/app/(app)/settings/page.tsx`, import lib (new),
`src/app/manifest.ts` (verify)

**Acceptance criteria**
- Profile + currency changes persist and reflect app-wide.
- CSV import creates transactions correctly.
- Build + lint pass; verified at both breakpoints.

**Status:** ⬜ Not started
**Status Log**
| Date | Update |
|------|--------|
| _(placeholder)_ | _pending_ |

---

## Cross-cutting conventions (apply in every phase)

- **RLS is non-negotiable** — every user-owned table/query is user-scoped.
- **Reads in server components** via `@/lib/supabase/server`; **mutations via
  Server Actions** validated with **Zod**.
- **Reuse the pure finance engines** — never recompute budgets/scores by hand.
- **Money** = `numeric(14,2)` + ISO currency per row; format only via
  `src/lib/format.ts`.
- **Demo-mode fallback preserved** — no env vars → mock data, app still runs.
- **Verify with `npm run build`** and Chromium screenshots at 390px + desktop.
- **Match existing patterns** — mirror a sibling before inventing.

## Overall progress

| Phase | Title | Status |
|-------|-------|--------|
| 0 | Infrastructure & environment | ⬜ Not started |
| 1 | Authentication end-to-end | ⬜ Not started |
| 2 | Data access layer & dashboard on real data | ⬜ Not started |
| 3 | Transactions (income + expenses CRUD) | ⬜ Not started |
| 4 | Categories & Budgets | ⬜ Not started |
| 5 | Goals & Loans | ⬜ Not started |
| 6 | Analytics & full dashboard aggregation | ⬜ Not started |
| 7 | Settings, CSV import & polish | ⬜ Not started |
