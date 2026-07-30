# Finance OS — React Native App Migration Plan

Status: **planning document only** — no code changes in this pass.
Scope: turn the existing Finance OS web app (Next.js 16 PWA) into a native
mobile app with **React Native**, while **keeping the current Supabase
backend** (Postgres, Auth, Storage, RLS, Drizzle schema) unchanged.

This document is the requirements/architecture plan referenced by the
roadmap's **Phase 5 — Native mobile (Expo)** entry in
`.claude/skills/financeos/SKILL.md`. It expands that one-line entry into a
concrete plan.

---

## 1. Goals & non-goals

**Goals**
- Ship a native iOS/Android app with feature parity with the web app over
  time, starting with the reference module (Transactions) and the
  dashboard.
- Reuse the backend (Supabase project, Postgres schema, RLS policies,
  Drizzle migrations) and the finance calculation engines **as-is**.
- Keep the web app fully functional throughout — this is additive, not a
  rewrite of the backend or a big-bang cutover.
- Set up the repo so future modules are added to both platforms with
  minimal duplicated logic (mirrors the "match existing patterns" rule from
  the web codebase, applied across platforms).

**Non-goals (for this plan)**
- No backend/schema changes. No new tables, no RLS changes, no new
  Supabase project.
- No decision here to deprecate the PWA — the web app keeps shipping.
- No implementation — this document only.

---

## 2. What stays exactly as-is

These are already platform-agnostic and require **zero changes**:

| Layer | Location | Why it ports for free |
|---|---|---|
| Supabase project (Postgres, Auth, Storage) | Supabase (ref `ucgholzcnqqwwentdaqt`) | `@supabase/supabase-js` works identically in React Native |
| DB schema + migrations | `src/db/schema.ts`, `drizzle/*.sql` | Server-side only; mobile never talks to Drizzle directly |
| RLS policies | `drizzle/manual/*.sql` | Enforced in Postgres — protects mobile clients calling Supabase directly, same as web |
| Finance engines (pure functions) | `src/lib/finance/*.ts` (budget, health-score, investment, net-worth, loan, recurring, goals) | Pure TypeScript, no DOM/Next dependency |
| Zod validation schemas | `src/lib/*/types.ts` | Framework-agnostic |
| Format helpers | `src/lib/format.ts` | Framework-agnostic (uses `Intl`, available in RN via Hermes) |

Everything else — UI, navigation, styling, data-fetching plumbing — is
Next.js/DOM-specific and needs a mobile equivalent.

---

## 3. Target repo shape: Turborepo monorepo

Introduce a monorepo so web and mobile share logic without copy-paste.
This is the same seam the skill file already calls out ("shareable
packages" in Phase 5) — this plan makes it concrete.

```
savemoney/
  apps/
    web/            # current Next.js app, moved here mostly unchanged
    mobile/         # new Expo (React Native) app
  packages/
    core/           # finance engines + Zod schemas + types + format.ts
                     #   (verbatim moves from src/lib/finance, src/lib/*/types.ts)
    data/           # isomorphic data-access layer (see §5) — replaces
                     #   "Server Actions" as the mutation boundary
    db/             # Drizzle schema + drizzle client + migrations
                     #   (server-only; consumed by apps/web and Supabase
                     #   Edge Functions, NEVER bundled into apps/mobile)
    tokens/          # design tokens as plain JS/JSON: colors, radii,
                     #   spacing — single source for Tailwind v4 `@theme`
                     #   (web) and the NativeWind theme (mobile)
    config/          # shared tsconfig/eslint base
  turbo.json
  package.json       # workspaces root
```

Migration of `apps/web` is a **path move + import rewrite**, not a
rewrite — Next.js 16, Tailwind v4, and all current behavior stay identical.

---

## 4. Mobile stack (proposed)

| Concern | Choice | Rationale |
|---|---|---|
| Framework | **Expo (React Native, Expo Router)** | Matches the skill's Phase 5 note ("Native mobile (Expo)"); Expo Router's file-based routing mirrors the App Router mental model already used in `src/app/(app)/` |
| Language | TypeScript | Same as web |
| Styling | **NativeWind v4** | Tailwind-compatible utility classes in RN; can consume the shared `packages/tokens` the same way `globals.css`'s `@theme` does on web, keeping "never hard-code colors" true on both platforms |
| Navigation | Expo Router (stack + tabs) | Bottom tab bar maps directly to the existing 5-item bottom nav (`src/components/nav/bottom-nav.tsx`, `nav-config.ts`) |
| Server state | TanStack Query | Same library as web (`src/components/providers.tsx`) — query keys/hooks can be shared via `packages/data` |
| Local/offline state | Zustand + MMKV (or AsyncStorage) | Zustand already used on web; MMKV for fast persisted cache |
| Auth storage | `@supabase/supabase-js` + `expo-secure-store` adapter | Supabase's documented RN pattern; magic-link/OAuth callback via `expo-linking` deep link (custom URL scheme), replacing `src/app/auth/callback/route.ts` |
| Charts | **Victory Native XL** (Skia-based) or `react-native-svg` equivalents | Recharts is DOM-only; chart *data shaping* stays in `packages/core`/`packages/data`, only the render layer is rewritten |
| Forms | React Hook Form or plain controlled inputs + shared Zod schemas | Zod schemas already exist per module (`src/lib/transactions/types.ts` etc.) — reused unchanged |
| Push notifications | `expo-notifications` | Extends the existing in-app `src/lib/notifications` module (bill due, overspend, goal milestones) to device push |
| Biometrics | `expo-local-authentication` | Listed explicitly in the roadmap's Phase 5 |
| Native build/distribution | **EAS Build + EAS Submit** | Standard Expo path to TestFlight/Play Console |

### No direct equivalent — must be rebuilt, not ported
- **MagicBento / GSAP dashboard** (`src/components/magic-bento/`): GSAP
  spotlight/tilt/particle effects are DOM-specific. Treat the mobile
  dashboard as new work using `react-native-reanimated` + `react-native-skia`
  for a simplified bento-style grid (static cards, no spotlight/tilt — those
  already auto-disable on mobile web per the "Gotchas" section, so parity
  bar is low).
- **Recharts** → Victory Native / Skia charts, as above.
- **CSV import UI** (`src/lib/import/pipeline.ts` stays; the file-input UI
  doesn't): replace browser `File`/PapaParse-in-browser flow with
  `expo-document-picker` + on-device parse, still funneled through the same
  pure `detectMapping`/`normalizeRow`/`buildPreview` pipeline in
  `packages/core`.
- **`proxy.ts` session-refresh middleware**: no middleware concept in RN;
  session refresh becomes an app-init effect using the Supabase client's
  `onAuthStateChange`.

---

## 5. The hard part: replacing Server Actions

The web app's mutations are all Next.js **Server Actions** (`"use server"`
functions in each module's `actions.ts`, e.g.
`src/lib/transactions/actions.ts`). Server Actions don't exist outside
Next.js, so mobile can't call them directly. Two options:

**Option A — Direct Supabase calls from the client (recommended default).**
Since every table already has RLS scoping rows to `auth.uid()`, most
mutations (create/update/soft-delete a transaction, budget, goal, etc.) are
safe to run directly from `@supabase/supabase-js` on-device — exactly like
`src/lib/supabase/client.ts` already does for reads. Refactor each module's
`actions.ts` into a **framework-agnostic function in `packages/data`** that
takes a `SupabaseClient` and Zod-validated input, and is called by:
  - a thin `"use server"` wrapper on web (keeps today's behavior), and
  - a plain async function call on mobile.

**Option B — Supabase Edge Functions for privileged logic only.**
Reserve Edge Functions (or a thin Next.js Route Handler both platforms can
hit) for anything that must never run on-device — the one clear case today
is **Phase 3's AI provider keys**: decrypting a user's BYOK key with
`AI_KEYS_ENCRYPTION_KEY` must stay server-side per the skill's security
model ("Plaintext is decrypted only in trusted server code"). Everything
else defaults to Option A.

This is the single biggest refactor the migration requires on the *existing*
web codebase, and it should land **before** mobile work starts, since it
also cleans up `packages/data` as a real shared boundary.

---

## 6. Auth flow on mobile

- Email/password and magic link both go through `supabase-js`.
- Magic link / OAuth redirect: register a custom URL scheme
  (`financeos://auth/callback`) with `expo-linking`; exchange the code the
  same way `src/app/auth/callback/route.ts` does today, just client-side.
- Session persisted via `expo-secure-store` (not plain AsyncStorage, since
  tokens are secrets).
- App-launch guard replaces `proxy.ts`: check session in a root layout
  effect, redirect to the auth stack if absent — same logic as
  `updateSession()` in `@/lib/supabase/middleware`, ported to a hook.
- Demo/guest mode (`src/lib/guest/`) can port as-is since it's already
  client-only mock data with no auth dependency.

---

## 7. Offline & sync (Phase 5 requirement)

- TanStack Query's persisted cache (`@tanstack/query-async-storage-persister`
  + MMKV) for read-through offline viewing.
- A mutation queue (Zustand-backed) for writes made offline: enqueue
  create/update calls from `packages/data`, flush on reconnect, dedupe using
  the same `dedupeKey` concept already used by the import pipeline.
- Net Worth snapshots, budgets, and dashboard aggregates are all derived
  from `packages/core` pure functions — safe to recompute locally once the
  underlying rows sync, so offline UI can show "last synced" derived data
  without needing its own offline calculation path.

---

## 8. Migration phases

| Phase | Deliverable | Depends on |
|---|---|---|
| **A** | Turborepo scaffold: move `apps/web`, extract `packages/core`, `packages/tokens`, `packages/config`. Web app builds and behaves identically. | — |
| **B** | Extract `packages/data`: refactor one module's Server Actions (start with Transactions, the reference module) into the client/server-agnostic shape from §5. Web still works, now via the wrapper. | A |
| **C** | Repeat B for remaining modules (budget, goals, loans, investments, net-worth, recurring, calendar, notifications). | B |
| **D** | Scaffold `apps/mobile` (Expo Router, NativeWind, Supabase client, auth stack, tab nav mirroring `nav-config.ts`). | A |
| **E** | Port Transactions end-to-end on mobile (list, create/edit form, optimistic delete) — proves the whole pattern. | C, D |
| **F** | Port dashboard (simplified static bento, no GSAP), Budget, Goals, Loans, Analytics, Investments, Net Worth, Recurring, Calendar, Financial Score, Reports, Notifications — one module at a time, same order as the web roadmap. | E |
| **G** | Offline sync + push notifications + biometrics. | F |
| **H** | EAS Build/Submit setup, app icons/splash, store listings, TestFlight/Play internal testing. | F (can start once 3–4 core modules are done) |
| **I** (stretch) | Home-screen widgets (iOS WidgetKit / Android App Widgets via Expo config plugins). | H |

Each phase after A keeps web fully shippable — this is designed to be
incremental, not a freeze on web development.

---

## 9. Risks / effort call-outs

- **Server Actions → `packages/data` refactor (Phase B/C)** touches every
  existing module and is the highest-risk step for regressions on web; needs
  full `npm run build` + manual QA per module as it's refactored, not just
  at the end.
- **MagicBento has no RN equivalent** — budget this as new design/build
  work, not a port, and don't block other modules on it.
- **BYOK AI key security (Phase 3, still unimplemented on web)** must land
  its server-only decryption boundary *before* mobile AI features are built,
  so mobile has a safe endpoint to call from day one rather than retrofitting
  one later.
- **Design tokens duplication risk**: `packages/tokens` must be the single
  source of truth consumed by both Tailwind's `@theme` and NativeWind's
  theme config, or the two platforms will visually drift.
- **CSV import** needs a real on-device file-picker spike early — file
  handling APIs differ enough from the browser that it's worth validating
  before committing to the phase order above.

---

## 10. Open decisions (need a call before implementation starts)

1. **Styling library**: NativeWind (recommended, keeps Tailwind mental
   model) vs. Tamagui (more RN-native, better performance ceiling, steeper
   learning curve).
2. **Monorepo timing**: do the Turborepo restructure (Phase A) as its own
   standalone PR before any mobile code exists, or bundle it with the first
   mobile scaffold PR?
3. **EAS / App Store / Play Console accounts**: who owns these — needed
   before Phase H.
4. **Minimum supported module set for v1 mobile release**: full parity
   before shipping, or ship after Transactions + Dashboard + Budget (the
   three most-used screens) and iterate?

---

## 11. Summary

Nothing about the Supabase backend changes. The work is: (1) extract the
already-pure logic (`finance` engines, Zod schemas, format helpers) into
shared packages, (2) replace the Next-only Server Action boundary with an
isomorphic data layer so both platforms can call the same mutation logic,
and (3) build a new Expo/React Native UI layer (Expo Router + NativeWind +
Victory Native) that consumes both. The DB schema, RLS, and roadmap phases
in the skill file are unaffected.
