# Phase 5 — Mobile Build plan

Status tracker for native mobile (Expo/React Native), pulled forward ahead
of Phase 4 per product decision. This doc is the plan of record for
everything mobile — extend it as decisions land rather than starting a new
file, same convention as `phase-3-ai-assistant-plan.md` / `docs/
ai-smart-entry-plan.md`.

Nothing in this plan is built yet. No Expo project, no monorepo/Turborepo
scaffold exist in the repo today — this is analysis + decisions only.

---

## 0. V1 scope (revised 2026-08-04) — read this first

Earlier drafts of this plan sequenced a PWA-first interim and pulled
automatic-capture (NFC/SMS/notifications/email) into v1. **Revised:**

- **V1 is a straight feature-parity port of the current web app to React
  Native (Expo) — no automatic capture, no NFC, no SMS/notifications, no
  email parsing.** Those move to a later phase (kept as reference in §3/§4
  below, not deleted, since the analysis still holds — just not v1).
- **No PWA-first interim.** Go straight to the native Expo build.
- **Auth for v1 = what the web app already does today:** Supabase login
  (session) **plus** the existing vault unlock step (passphrase → DEK) —
  ported as-is, not redesigned. No new biometric/PIN quick-unlock for v1;
  that's still a later enhancement. (Login alone doesn't unlock any data —
  every finance table is client-side encrypted, so the passphrase-unlock
  screen is part of "current web version as-is," not an extra feature.)
- **Build target: Android APK first.** The codebase is written once in
  React Native (Expo) so iOS is the same codebase, not a separate build —
  but the first deliverable is a sideloadable `.apk`, not a Play Store
  submission and not an iOS build. iOS build follows once there's an Apple
  Developer account + a Mac (or EAS Build's cloud iOS builder) in the loop.
- Everything else already in this doc (automation channels, background
  capture, store submissions) is **future scope**, revisit once the v1 port
  ships.

## 1. Repo & versioning strategy

**One repo, restructured into a monorepo — not a new git repo.** The
roadmap already commits to "a shared Turborepo"; splitting into a second
repo would mean publishing `src/lib/finance/*` and the Zod schemas as a
versioned package just to share them with a separate mobile repo — extra
ceremony, and it drifts. Target layout:

```
apps/
  web/       # current Next.js app, moves here as-is
  mobile/    # new Expo app
packages/
  finance-engine/   # src/lib/finance/* — pure, framework-free, copy over first
  schemas/          # per-module Zod schemas
  api-client/        # typed client for the bearer-token Route Handlers (§2, blocker #1/#2)
```
Migration is mechanical (`git mv src apps/web/src`, add `turbo.json` +
workspace config) and should be its own PR before any mobile code lands, so
the web app's history and CI keep working through the move.

**Versioning web vs. mobile independently — achieved by per-app version
numbers inside the monorepo, not by separate repos:**
- `apps/web` — no meaningful version number; keeps deploying continuously to
  Vercel on every push to `main`, same as today.
- `apps/mobile` — real semver + native build numbers (`versionName`/
  `versionCode` on Android, `CFBundleShortVersionString`/
  `CFBundleVersion` on iOS once that build exists), bumped independently of
  web. Git-tag mobile releases distinctly (`mobile-v1.0.0`) so they don't
  collide with any future web release tags.
- `packages/*` — internal workspace packages (`workspace:*` protocol), never
  published to a registry, so no independent release process needed; a
  change to `packages/finance-engine` just lands in whichever app's PR
  touched it.
- CI: path-filtered per app (Turborepo's affected-graph or simple path
  filters) so a web-only change doesn't trigger a mobile build and vice
  versa.

## 2. Current-state audit — what's reusable vs. blocking

**Reusable as-is:**
- DB schema + RLS (Postgres/Supabase) — transport-agnostic.
- `src/lib/finance/*` — pure, framework-free finance engines. Directly
  packageable as `packages/finance-engine`.
- Per-module Zod schemas — already separated from UI. → `packages/schemas`.
- `src/lib/import/pipeline.ts` — reusable later, once capture channels are
  back in scope (§3).
- The AI Smart Entry capability (`/api/v1/ai/{extract,commit}`) — reusable
  later, same reason.

**Blocking for the v1 port, in order of severity:**
1. **Server Actions almost everywhere.** 19 files across nearly every
   module (`goals/actions.ts`, `loans/actions.ts`, `vault/actions.ts`, …)
   are `"use server"`, bound to Next's RSC action-id protocol — unreachable
   from a React Native client. Two Route Handlers already exist as the
   precedent (`/api/v1/ai/*`, `/api/mcp`) but that's 4 endpoints out of the
   app's full mutation surface — **v1 needs this generalized across every
   module the mobile port touches** (transactions, budgets, goals, loans,
   investments, net worth, vault unlock/setup at minimum).
2. **Bearer-token auth isn't finished even on the one Route Handler surface
   that exists.** Logged as an open TODO in `ai-smart-entry-plan.md`: the
   query/action layer still instantiates its own cookie-bound Supabase
   client internally instead of accepting an injected one. Has to be fixed
   before any mobile-callable API is real — this is a hard v1 blocker, not
   deferrable.
3. **Vault crypto portability — spiked (2026-08-04), one item still open.**
   `apps/mobile/src/lib/vault/crypto.ts` is a third runtime-specific
   duplicate (same precedent as `apps/web/src/lib/mcp/server-crypto.ts`
   for Node): `react-native-quick-crypto`'s `install()` polyfills
   `global.crypto.subtle`/`getRandomValues`, confirmed (its own
   implementation-coverage doc) to support AES-GCM encrypt/decrypt, HKDF
   deriveKey, and wrapKey/unwrapKey — every Web Crypto call this module
   needs, so that half ports close to verbatim. Argon2id is the genuine
   open question: Hermes only gained WebAssembly support (WASM
   precompiled to Hermes bytecode) as of Expo SDK 55 / RN 0.83+, as an
   **opt-in** Hermes v1 feature — whether `hash-wasm` (the same package
   the web app already uses) actually runs depends on the Hermes
   build/config a given device ends up on, and this repo has no Android/
   iOS toolchain to check that on a real device or emulator. Mitigated,
   not resolved: `deriveArgon2Hash()` tries `hash-wasm` first and falls
   back to `react-native-argon2` (a native, non-WASM Argon2id binding) if
   it throws, logging a warning either way so the fallback path is
   visible rather than silent. A minimal spike screen at
   `apps/mobile/App.tsx` runs this end-to-end and prints PASS/FAIL plus
   any fallback warning — whoever gets Android device/EAS access next
   should run it and report which path actually executed. Separately,
   `scripts/vault-crypto-vectors.mjs` (run: `node
   scripts/vault-crypto-vectors.mjs`) validates the *algorithm/wire-format
   design* — Argon2id → wrap/unwrap DEK → AES-GCM round trip, wrong-
   passphrase rejection, the HKDF path, and the packed-payload format —
   against Node's built-in spec-compliant WebCrypto; all 4 vectors pass.
   That proves the design is sound wherever WebCrypto is spec-compliant;
   it does not prove `react-native-quick-crypto`'s or
   `react-native-argon2`'s native bindings actually load under Hermes —
   that's the one remaining gate before Phase 5.4 (mobile auth/vault
   unlock) can build on top of this with confidence.
4. **Full UI rebuild.** MagicBento (GSAP), Tailwind v4, shadcn primitives,
   Recharts are all web-only. Layout/IA can be mirrored; none of the code
   ports. v1 port = re-implement each screen's current web behavior in
   RN, not add anything new.
5. **No monorepo yet** — see §1, first PR.

## 3. Automatic capture channels — future scope, not v1 (kept for reference)

| Channel | Platform | Verdict |
|---|---|---|
| NFC (reading a tap-to-pay transaction) | — | **Not possible.** No OS exposes Apple Pay/Google Pay wallet transactions to third-party apps; EMV card chips don't expose customer-readable transaction history outside a certified terminal. |
| NFC (physical tags as manual triggers) | Both | Real, but it's a manual quick-add convenience (tap a sticker → app opens pre-filled), not automatic capture. |
| SMS reading | **Android only** | No public iOS API exists for reading arbitrary SMS content — a hard platform wall, not a workaround-able limitation. Android: `READ_SMS` + broadcast receiver works, but is a Play Store Restricted Permission requiring justification/review. |
| Notification listener | **Android only** | `NotificationListenerService` reads content from any app's notifications (bank apps, UPI/wallet apps, not just SMS). iOS has no equivalent. Manual "special access" grant, not a runtime dialog. |
| Email parsing | **Cross-platform, not mobile-dependent** | OAuth (Gmail API/IMAP) + polling/webhook. Could be built independent of the native app entirely, whenever it's back in scope. |
| Bank aggregation / Open Banking | Cross-platform | Industry-correct, but needs an aggregator relationship (cost, KYC, regional coverage). Not planned for any near-term phase. |

**Net effect (unchanged):** automatic SMS/notification capture is
Android-only. Revisit this whole section once v1 (the plain port) ships.

## 4. Background capture vs. the vault — future scope, not v1 (kept for reference)

A background SMS/notification listener can fire while the app isn't open,
but the DEK only lives in an in-memory Zustand store, cleared on lock/
logout, never persisted. When this comes back into scope: **defer until
next unlock** — queue raw captured text locally, parse + encrypt only when
the user next opens/unlocks the app. The DEK's in-memory-only guarantee
stays as-is; no background DEK access, no PIN-wrap extension. (Decided
2026-08-04, still the plan whenever capture work resumes.)

## 5. Build order — v1 (straight port, Android APK first)

1. **Monorepo migration** (§1) — its own PR, no behavior change, keeps web
   CI green through the move. **Done** (2026-08-04): `git mv src apps/web/
   src` + the other root config files, root `package.json` (npm workspaces)
   + `turbo.json` added, `apps/web/package.json` renamed to `@savemoney/web`.
   `npm run build`/`lint` verified green from the new location via
   `turbo run build|lint`. `packages/*` extraction (finance-engine, schemas)
   deferred to its own follow-up pass rather than bundled into this PR, since
   it touches import sites across most modules — mechanical but separable
   from the zero-behavior-change lift itself. **Update (2026-08-04):**
   `packages/finance-engine` done — the 7 pure engines (budget, goals,
   health-score, investment, loan, net-worth, recurring) now live there as
   a real npm workspace package (`@savemoney/finance-engine`, subpath
   exports per module, `apps/web` transpiles it). `packages/schemas` stays
   deferred — those `types.ts` files pull `CurrencyCode` from
   `apps/web/src/lib/format.ts`, and moving that out touches ~75 call
   sites for a package nothing consumes before Phase 5.3/5.4 exist. Build
   it when `packages/api-client` or `apps/mobile` actually need it.
2. **Spike vault crypto portability** (§2, blocker #3) — the real gate.
   Prove Argon2id + AES-GCM + HKDF work on a real Android device via
   `react-native-quick-crypto` (or equivalent) before anything else.
   **Code done, device verification still open (2026-08-04):** see §2
   blocker #3 above for the full writeup. Summary: `apps/mobile` scaffolded
   (Expo SDK ~57 / RN 0.86, `blank-typescript` template,
   `@savemoney/mobile`); `react-native-quick-crypto` + `react-native-argon2`
   + `hash-wasm` added; `apps/mobile/src/lib/vault/crypto.ts` written with
   an Argon2id WASM-first/native-fallback strategy; `apps/mobile/App.tsx`
   is a throwaway spike screen (not real navigation — that's Phase 5.5)
   that runs it and prints PASS/FAIL + any fallback warning; the whole
   package type-checks clean (`cd apps/mobile && npx tsc --noEmit`); and
   `node scripts/vault-crypto-vectors.mjs` (repo root) validates the
   algorithm/wire-format design against Node's built-in WebCrypto, 4/4
   vectors passing. **Not done: running any of this on an actual Android
   device/emulator or via EAS Build** — no Android/iOS toolchain exists in
   the sandbox that built this. Also note: this app can no longer run in
   plain **Expo Go** once these native modules are linked — it needs a
   custom dev client (`expo prebuild` + `expo run:android`, or an EAS
   development build), which lines up with EAS Build already being step 6
   below.
3. **Generalize the bearer-token Route Handler pattern** from `/api/mcp`
   across the modules the v1 port needs (§2, blockers #1/#2): vault
   setup/unlock, transactions, budgets, goals, loans, investments, net
   worth at minimum. → `packages/api-client` as the typed client both apps
   could theoretically share (web keeps using Server Actions directly;
   mobile uses this client). **Auth-layer generalization done
   (2026-08-04); per-module Route Handlers done for vault only, rest
   deferred — see below.**
   - `apps/web/src/lib/supabase/server.ts`'s `createClient()` now checks
     for an `Authorization: Bearer <supabase-access-token>` header first
     (via `next/headers`) and, if present, returns a token-scoped client
     (`createBearerClient`, plain `@supabase/supabase-js` +
     `Authorization` header override, no cookies) instead of the cookie-
     bound one — PostgREST/RLS evaluates that JWT exactly like a cookie
     session's, so **every existing `queries.ts`/`actions.ts` function
     that just calls `createClient()` and trusts RLS got bearer-token
     support for free, no per-file changes needed.** Falls back to the
     cookie path byte-for-byte unchanged when there's no bearer header —
     every existing web request, since browsers never send this custom
     header on a normal same-origin call.
   - The 13 files that each hand-rolled their own `requireUser()` (get
     the caller's `userId`, cookie-only) — `transactions/goals/budgets/
     loans/investments/recurring/import/notifications/ai` `actions.ts`,
     `vault/actions.ts`/`backfill-actions.ts`/`reset-actions.ts`/
     `rotation-actions.ts` — now share one implementation,
     `apps/web/src/lib/supabase/require-user.ts`. Real dedup, not just
     the bearer-token fix's side effect. `networth/actions.ts` and
     `profile/actions.ts` inlined the same pattern without a named
     function; same fix applied there. `ai/api-auth.ts`'s
     `requireApiUser` (the file that originally documented this whole
     gap) now just delegates to it.
   - **Important finding, fixed alongside this:** `src/lib/supabase/
     middleware.ts` (the `proxy`) redirected *any* unauthenticated
     request without a session cookie to `/login` — including
     `/api/v1/*` — which would have silently defeated bearer-token auth
     entirely (a mobile client sending only a bearer token, no cookie,
     would get an HTML redirect before ever reaching a Route Handler's
     own auth check). Added `/api/v1` to the proxy's exemption list
     (same reasoning already applied to `/api/mcp`: these routes
     authenticate themselves, the proxy shouldn't pre-empt that with a
     cookie-only gate). Verified live: `curl` against
     `/api/v1/vault/status` with no cookie now returns a JSON 401, not a
     redirect.
   - **Route Handlers built:** `/api/v1/vault/{status,setup,unlock,
     rotate}`, mirroring `/api/v1/ai/*`'s existing convention
     (`requireUser()`/`requireApiUser()` → 401 JSON, zod-shaped body →
     400 JSON, thin wrappers around the existing `vault/actions.ts`/
     `queries.ts` functions). Vault first because Phase 5.4 (mobile
     auth) needs it immediately.
   - **Deliberately not built yet:** `/api/v1/{transactions,budgets,
     goals,loans,investments,net-worth}` Route Handlers. The hard part
     (auth) is done and already covers these modules' `actions.ts`/
     `queries.ts` — building the actual REST endpoints is mechanical at
     this point, so it's deferred to land alongside each module's own
     Phase 5.5 screen port (Transactions first, per that step's own
     ordering) rather than speculatively now, per the "design for these
     seams, don't build ahead of the current phase" rule in the
     financeos skill.
   - `packages/api-client` created: a plain `fetch` wrapper (no React
     Native or web-specific dependency, genuinely shareable), covering
     `vault.status/setup/unlock/rotate` so far. Added as an
     `apps/mobile` dependency now since Phase 5.4 needs it next; extend
     it one module at a time as each Route Handler above lands.
4. **Mobile auth**: Supabase PKCE + deep link + AsyncStorage session
   persistence, then the ported vault-unlock screen (passphrase → DEK, same
   flow as web today). **Email/password path done (2026-08-04); OAuth/
   magic-link deliberately not wired yet — see below.**
   - `apps/mobile/src/lib/supabase/client.ts`: `@supabase/supabase-js`
     configured with `AsyncStorage` as the session store
     (`persistSession`/`autoRefreshToken` true, `detectSessionInUrl`
     false — no browser URL bar on native), `react-native-url-polyfill/
     auto` loaded first (Hermes has no `URL`, which `supabase-js` needs
     internally). Falls back to inert placeholder credentials rather
     than throwing at import time when unconfigured (`createClient`
     throws immediately on an empty string), matching the web app's
     "runs without crashing when Supabase isn't configured" posture —
     gated behind an `isSupabaseConfigured` check everywhere it matters.
   - `apps/mobile/src/lib/api/client.ts`: the app's instance of
     `packages/api-client`, its `getAccessToken` reading the current
     Supabase session's access token (auto-refreshed by the client
     above, so it's never stale).
   - `apps/mobile/src/lib/vault/crypto.ts` gained `generateRecoveryCode`/
     `decodeRecoveryCode` (Crockford Base32, byte-for-byte the same
     format as `apps/web/src/lib/vault/crypto.ts`) — needed for vault
     setup, not just the unlock path Phase 5.2's spike covered.
   - `apps/mobile/src/screens/{auth,vault,unlocked}-screen.tsx` +
     `App.tsx`: a plain state machine (no navigation library yet — that's
     Phase 5.5) — signed out → `AuthScreen` (email/password only);
     signed in, vault not yet unlocked → `VaultScreen` (setup **or**
     unlock, mirroring `vault-unlock-flow.tsx`'s exact protocol: same
     salts/KDF params, same HKDF `info` string `"vault-recovery-kek"`,
     so a vault set up on either client unlocks on the other); vault
     unlocked → `UnlockedScreen`, a confirmation + sign-out (real finance
     screens are Phase 5.5, deliberately not pulled forward here). The
     Phase 5.2 spike screen is gone — replaced by the real unlock flow
     now exercising the same crypto module for real.
   - **Deliberately not done:** Google OAuth and magic-link sign-in.
     Both need PKCE + a deep-link redirect back into the app —
     `app.json`'s `scheme: "savemoney"` is in place, but the
     `expo-web-browser`/`expo-linking` round trip and
     `supabase.auth.exchangeCodeForSession` on the returned URL aren't
     wired. Email/password needs none of that (a direct API call), so
     it's the v1 path that's actually complete; OAuth/magic-link parity
     is an explicit, flagged gap for a follow-up pass — same honesty
     pattern as the Argon2id native fallback in Phase 5.2. Also not
     done: recovery-code-based unlock (forgotten passphrase) and
     device PIN/biometric quick-unlock (the latter is explicitly a
     later Phase 5 enhancement per §0, not v1).
   - Verified: `apps/mobile` type-checks clean (`tsc --noEmit`);
     `apps/web`'s build/lint and the crypto vector script are
     unaffected. **Not verified: actually running this on a device/
     emulator** — same sandbox limitation as Phase 5.2, still the open
     handoff item.
5. **Expo shell + navigation**; port screens in the same order the web
   build itself was built: Transactions first (the reference module), then
   Dashboard, Budget, Goals, Loans, Investments, Net Worth, Analytics.
   **Router shell done (2026-08-04); screens still placeholders — see
   below.**
   - `expo-router` added; `index.ts` still runs the
     `react-native-quick-crypto` polyfill install first, then hands off
     via `import 'expo-router/entry'` (kept `"main": "index.ts"` rather
     than pointing straight at `expo-router/entry` — that ordering is
     the whole reason `index.ts` still exists at all).
   - `app/_layout.tsx` replaces the Phase 5.4 `App.tsx` state machine
     with `Stack.Protected`, gating three top-level routes on the exact
     same session/`useVaultStore` DEK state: `auth` (signed out),
     `vault` (signed in, locked — same `VaultScreen` from Phase 5.4,
     `onUnlocked` now optional since the guard itself reacts to the
     store), `(tabs)` (both satisfied).
   - `app/(tabs)/_layout.tsx`: 5 tabs — Dashboard, Transactions, Budget,
     Goals, Analytics — the same primary set `nav-config.ts` uses on
     web, **minus AI** (not in this build order's module list at all;
     no AI Assistant for v1 mobile). Icons via `lucide-react-native` +
     `react-native-svg`, same icon set as web's `lucide-react` for
     visual consistency. Loans/Investments/Net Worth don't get a tab
     yet — added when Phase 5.5c actually builds them, not as empty
     placeholders ahead of that work.
   - All 5 tab screens are `ComingSoon` placeholders (a direct RN port
     of `apps/web/src/components/coming-soon.tsx`) except a temporary
     sign-out button folded into the Dashboard tab (Settings, where
     that control belongs long-term, isn't built yet either).
   - **`npx expo-doctor` run for a sanity check** (17/20 passed in this
     sandbox; the 2 failures beyond a network-blocked schema check were
     both expected): a duplicate-`react`-version warning is real but
     correct — `apps/mobile` pins `react@19.2.3` (Expo SDK 57's required
     peer version) while `apps/web`/root resolve `react@19.2.4` (Next
     16's), each nested/hoisted independently by npm workspaces exactly
     as intended for two frameworks with different React peer
     requirements. Not a bug; noted here so it isn't "fixed" into an
     actual break later.
   - Verified: `apps/mobile` type-checks clean, `npx expo config` and
     `expo-doctor` resolve the project structure without error,
     `apps/web`'s build/lint and the crypto vectors are unaffected. Not
     verified: running on a device/emulator (same sandbox limitation as
     Phase 5.2/5.4).
   - **Transactions (the reference module) done (2026-08-04).**
     - `packages/finance-engine/src/format.ts`: `format.ts` finally
       extracted out of `apps/web` (deferred in Phase 5.0b — see that
       entry above — until there was a real second consumer; there now
       is one). Mechanical rewrite of all 75 `@/lib/format` call sites
       in `apps/web`, same technique as the original extraction.
     - `packages/api-client` gained `finance.raw()` (wraps
       `fetchFinanceRawData()` — **one shared raw-fetch boundary**,
       mirroring that function's own role on web; Dashboard/Budget/
       Goals/Loans/Investments/Net Worth in Phase 5.5c reuse this same
       method rather than getting a route each) and
       `transactions.{create,update,delete,reference}`.
     - New Route Handlers: `/api/v1/finance/raw` (GET),
       `/api/v1/transactions` (POST), `/api/v1/transactions/[id]`
       (PATCH/DELETE), `/api/v1/transactions/reference` (GET,
       category/account options — plaintext, not encrypted). All thin
       wrappers around the existing `transactions/actions.ts`/
       `raw-data.ts`/`reference.ts` functions, same pattern as vault's
       routes. Verified live via `curl`: all four return a JSON 401
       when unauthenticated, not a redirect.
     - `apps/mobile/src/lib/finance/decrypt.ts`: a narrower port of
       `apps/web/src/lib/finance/decrypt.ts` — income/expenses/
       contributions only, and **no backfill recovery** for pre-
       migration plaintext rows (web's `decryptOrRecoverPacked`/
       `UndecryptableError`). Backfill exists for rows written before
       Phase 3.5.3 shipped, years before this port started, so a
       genuinely undecryptable row here is a real failure, not a
       legacy-plaintext one — flagged omission, not a silent gap.
     - `apps/mobile/src/lib/transactions/{types,compute,client-actions}.ts`:
       direct ports of the web equivalents (same Zod schema, same pure
       flatten/sort/summarize logic, same encrypt-then-call-the-route
       shape).
     - `apps/mobile/app/(tabs)/transactions.tsx` +
       `src/components/transaction-form.tsx`: real list (pull-to-
       refresh, income/expense color-coded, tap to edit, long-press to
       delete) + create/edit modal. **Deliberately minimal relative to
       the web form**: plain YYYY-MM-DD text entry (no native date
       picker) and no category/account picker UI yet (reference data
       is fetched but not wired into a picker control) — both flagged
       UI-polish gaps, additive later, not a rework, since
       `categoryId`/`accountId` already flow through the create/update
       calls untouched.
     - Verified: `apps/mobile` type-checks clean, `apps/web`'s build/
       lint pass with the new routes, the crypto vector script is
       unaffected, and a live `curl` smoke test confirms all four new
       routes 401 correctly (not a redirect) when unauthenticated. Not
       verified: the actual screen on a device (same sandbox
       limitation as every other mobile-runtime check in this plan).
   - **Module order note (2026-08-04):** re-sequenced within this step —
     built Budget next instead of Dashboard. Dashboard composes
     *every* other module's engine (budgets, goals, loans, investments,
     recurring, analytics, net-worth all feed `computeDashboardData`),
     so it isn't actually a self-contained "first slice"; it's the
     capstone that should come *after* the modules it depends on exist.
     Doing it first would mean either a placeholder Dashboard anyway or
     re-deriving most of the remaining modules' engines just to feed
     it. Sticking to dependency order instead — same kind of judgment
     call as deferring `packages/schemas`/OAuth, documented rather than
     silently reordered. Remaining order: Goals, Loans, Investments, Net
     Worth, Analytics, **then** Dashboard last.
   - **Budget done (2026-08-04).** Reuses `finance.raw()` entirely for
     reads (its `budgets`/`income`/`expenses`/`activeGoals`/`loans`/
     `investmentMonthlyContributions` fields are exactly what
     `computeBudgetsData()` needs) — only new routes are
     `/api/v1/budgets` (POST) and `/api/v1/budgets/[id]` (PATCH/
     DELETE), no separate read route. `apps/mobile/src/lib/finance/
     decrypt.ts` gained the budget-feeding narrow decrypts
     (`decryptBudgetRows`/`decryptActiveGoals`/`decryptLoanAmounts`/
     `decryptInvestmentMonthlyContributions` — same narrower, no-
     backfill pattern as Transactions). `apps/mobile/src/lib/budgets/
     {types,period,compute,client-actions}.ts` are direct ports.
     `app/(tabs)/budget.tsx` + `src/components/budget-form.tsx`: safe-
     to-spend summary card, per-category budgets with a utilization bar
     (color-coded ok/warning/over, matching web's `budgetStatus`),
     long-press to delete, a minimal create form (period + amount only
     — no category picker yet, same flagged gap as Transactions').
     Verified the same way: type-checks clean, `apps/web` build/lint
     green, vectors unaffected, live `curl` 401 check on the new routes.
   - **Goals done (2026-08-04).** Goals gets its **own** full-list read
     (`/api/v1/goals` GET → `fetchGoalsRaw()`), separate from the shared
     `finance.raw()` boundary — mirroring web's own two-path structure
     (the shared boundary feeds Dashboard/Budget's narrow aggregate
     needs; each module's own page reads its full list here, same as
     Transactions did with a dedicated route rather than reusing
     `finance.raw()`'s output for its own list). New routes:
     `/api/v1/goals` (GET/POST), `/api/v1/goals/[id]` (PATCH/DELETE),
     `/api/v1/goals/[id]/contributions` (POST). `apps/mobile/src/lib/
     finance/decrypt.ts` gained the full `decryptGoalRows` (with `id`,
     unlike the narrow `decryptActiveGoals` Budget uses). `src/lib/
     goals/{types,compute,client-actions}.ts` are direct ports,
     including the contribution flow's client-computed running total
     (the server can't read-modify-write ciphertext, so the new
     `currentAmount`/`status` are computed from the already-decrypted
     goal and sent pre-encrypted — same accepted single-user
     concurrency tradeoff as web's version). `app/(tabs)/goals.tsx` +
     `src/components/{goal-form,contribution-form}.tsx`: progress bars,
     tap a goal to add a contribution (small modal), long-press to
     delete, create form (name/target/saved-so-far/deadline — no icon
     picker yet, same flagged-gap pattern). Verified the same way:
     type-checks clean, `apps/web` build/lint green, vectors unaffected,
     live `curl` 401 checks on the new routes.
   - **Loans done (2026-08-04) — plus a navigation gap it exposed.**
     Same two-path structure as Goals: `/api/v1/loans` (GET/POST),
     `/api/v1/loans/[id]` (PATCH/DELETE), `/api/v1/loans/[id]/payments`
     (POST). `apps/mobile/src/lib/finance/decrypt.ts` gained the full
     `decryptLoanRows`; `src/lib/loans/{types,compute,client-actions}.ts`
     are direct ports, including the payment-recording principal/
     interest split computed client-side (same reasoning as goals'
     contribution flow — the server can't do arithmetic on ciphertext).
     **Loans isn't a primary tab on web either** (reached via the
     drawer, same as Investments/Net Worth) — building it exposed that
     Phase 5.5a's 5-tab shell had nowhere to put it. Added a 6th "More"
     tab (`app/(tabs)/more.tsx`) linking to non-tab routes for the
     secondary modules; `app/loans.tsx` (not under `(tabs)/`) is the
     actual screen, pushed with a header via a new `Stack.Screen` in
     the root layout's already-unlocked `Stack.Protected` group.
     Explicitly flagged as a deviation from the "5 max, thumb reach"
     rule, not a silent one — a real drawer (matching web's top-left
     logo) is deferred until Investments/Net Worth join More and the
     list is long enough to justify it. Verified the same way:
     type-checks clean, `apps/web` build/lint green, vectors unaffected,
     live `curl` 401 checks on the new routes.
   - **Investments done (2026-08-04).** Same two-path structure again:
     `/api/v1/investments` (GET/POST), `/api/v1/investments/[id]`
     (PATCH/DELETE), `/api/v1/investments/[id]/contributions` (POST).
     `apps/mobile/src/lib/finance/decrypt.ts` gained the full
     `decryptInvestmentRows`; `src/lib/investments/{types,compute,
     client-actions}.ts` are direct ports, including the contribution
     flow's client-computed new invested/current totals (same reasoning
     as goals'/loans' equivalents). `app/investments.tsx` (a second
     non-tab route, joining `app/loans.tsx`) + `src/components/
     {investment-form,investment-contribution-form}.tsx`: total value/
     gain summary, per-holding return %, tap to add a contribution
     (amount + an "also bump current value" toggle, since a SIP top-up
     and a value-only bump are different things here), long-press to
     delete. Along the way, renamed `ContributionForm`'s `goalName` prop
     to the generic `label` (Goals already used it; Investments needed
     its own variant anyway for the addToValue toggle, but the rename
     keeps the shared one honestly generic instead of goal-specific in
     name only). `More` now lists both Loans and Investments. Verified
     the same way: type-checks clean, `apps/web` build/lint green,
     vectors unaffected, live `curl` 401 checks on the new routes.
   - **Analytics done, and a re-sequencing it justified (2026-08-04).**
     Built Analytics *before* Net Worth (further reordering within this
     already-reordered step — see the module-order note above): Net
     Worth's trend needs the same trailing-6-month `{label, net}[]`
     data Analytics computes, so building Analytics first meant Net
     Worth could reuse that computation instead of re-deriving it.
     **No new Route Handler at all** — `computeAnalyticsData()` only
     needs income/expenses/activeGoals/loans/contributions/investment-
     contributions, all already served by `finance.raw()`. `apps/
     mobile/src/lib/analytics/{types,compute}.ts` are direct ports.
     `app/(tabs)/analytics.tsx` replaces its `ComingSoon` placeholder: a
     financial-health-score card, a 6-month income/expense bar chart,
     and a category breakdown — **no charting library**, bars are plain
     `View`s sized by relative height (web uses Recharts, which has no
     RN runtime; this is the "re-implement behavior, not the exact
     chrome" approach applied to a chart specifically for the first
     time). Verified: type-checks clean, `apps/web` build/lint
     unaffected (no new routes), vectors unaffected.
   - **Net Worth done (2026-08-04) — the heaviest read composition so
     far.** Net worth is assets/liabilities across Investments + Goals
     + Loans, so `app/net-worth.tsx` pulls from all three modules' own
     full-list routes *and* `finance.raw()` (for the Analytics-style
     trend fallback) *and* its own snapshots route — matching web's own
     dashboard/net-worth composition, which pulls from the same
     sources; this isn't over-fetching, it's what the computation
     actually needs. New routes: `/api/v1/net-worth` (POST, capture
     today's snapshot — no update/delete, snapshots are append/upsert-
     by-day only) and `/api/v1/net-worth/snapshots` (GET, a plain
     ciphertext passthrough mirroring web's own
     `fetchNetWorthSnapshotsAction`). `apps/mobile/src/lib/finance/
     decrypt.ts` gained `decryptSnapshotRows`; `src/lib/networth/
     {types,compute,client-actions}.ts` are direct ports of `buildNetWorth`
     and the snapshot-capture encrypt wrapper. Screen shows the net-
     worth figure, month-over-month change, assets/liabilities split,
     a per-component breakdown, and a "save today's snapshot" button.
     `More` now lists all three secondary modules. Verified the same
     way: type-checks clean, `apps/web` build/lint green with the new
     routes, vectors unaffected, live `curl` 401 checks on both new
     routes.
   - **Dashboard done (2026-08-04) — Phase 5.5c/step 5 complete.** Not a
     port of `apps/web/src/lib/dashboard/compute.ts`'s
     `computeDashboardData()` — that function hard-requires
     `RecurringData` for the "upcoming bills" card, and Recurring/Bill
     Calendar were never in the v1 mobile module list (only the 8 named
     in this step). `app/(tabs)/index.tsx` instead composes the same
     building blocks directly — `computeBudgetsData`,
     `computeAnalyticsData`, `computeGoalsData`, `computeLoansData`,
     `computeInvestmentsData`, `buildNetWorth`,
     `computeTransactionsList`/`summarize` — pulling from
     `finance.raw()` plus Goals/Loans/Investments/Net-Worth's own
     routes (same composition `app/net-worth.tsx` already needed).
     Shows monthly income/expenses, net worth, health score, safe-to-
     spend, top 3 active goals, and the 5 most recent transactions.
     **Upcoming bills is a flagged, explicit omission** — fabricating
     fake recurring data just to satisfy a ported function's type
     signature would be worse than composing honestly and noting the
     gap; add it back if/when Recurring lands in a later phase. The
     temporary sign-out button from Phase 5.5a's placeholder Dashboard
     moved here to stay with the real screen. No new Route Handler —
     verified: type-checks clean, `apps/web` build/lint unaffected,
     vectors unaffected.
   - **This closes out Phase 5.5c / build-order step 5's screen list**:
     Transactions, Budget, Goals, Loans, Investments, Net Worth,
     Analytics, Dashboard all ported. Remaining open items across this
     whole build phase, tracked honestly rather than silently: OAuth/
     magic-link sign-in, recovery-code unlock, device PIN/biometric
     quick-unlock, category/account pickers on the forms that skip
     them, a real drawer for `More` (vs. its current 6th-tab
     placement), Recurring/Bill Calendar (and thus upcoming bills), and
     — the biggest one — **on-device/EAS verification of everything in
     this doc**, since this build sandbox never had Android/iOS
     tooling.
6. **Android APK build** via EAS Build (`eas build -p android --profile
   preview` → `.apk`, sideloadable, no Play Store submission yet). This is
   the v1 deliverable. **Blocked on credentials this sandbox doesn't have
   (2026-08-04) — everything that doesn't need them is done.**
   - `apps/mobile/app.json` gained `android.package`/`ios.bundleIdentifier`
     (`com.savemoney.financeos` — both platforms, EAS requires the
     Android one to build at all and iOS will need its own before step 7).
     `apps/mobile/eas.json` added: a `preview` profile
     (`distribution: internal`, `android.buildType: apk` — exactly the
     sideloadable artifact this step wants) and a bare `production`
     profile as a placeholder for later.
   - `npx expo config --type public` still resolves cleanly with both
     new identifiers in place.
   - **`eas build -p android --profile preview` genuinely cannot proceed
     further here**: `eas-cli whoami` → "Not logged in"; running the
     build non-interactively fails with "An Expo user account is
     required to proceed" (log in via `eas login`, or `EXPO_TOKEN` for
     CI). This sandbox has no Expo account and manufacturing one isn't
     something to fake credentials for — same category of gate as
     Phase 5.2/5.4/5.5's "needs a real device" items, just at the very
     last step instead of mid-build. **Handoff**: whoever has (or
     creates) an Expo account should run, from `apps/mobile/`:
     `npx eas-cli login`, then `npx eas-cli build -p android --profile
     preview`. First run will prompt to create/link an EAS project
     (writes `extra.eas.projectId` into `app.json`) and generate an
     Android keystore automatically — both fine to accept the defaults
     on. The resulting `.apk` is the v1 deliverable this whole plan has
     been building toward.
   - **Update, 2026-08-04**: user created an Expo account and supplied
     access tokens directly in chat (handled as sensitive — never
     written to any file/commit, unset from the shell after use).
     `eas-cli whoami` failed identically with both tokens, which first
     looked like bad credentials. Checked this sandbox's outbound-proxy
     status (`$HTTPS_PROXY/__agentproxy/status`) and found the real
     cause: `api.expo.dev:443` is rejected at the network-policy layer
     (`connect_rejected`, gateway 403 on CONNECT) — before token
     validation ever happens. Confirmed a second time, cleanly (a plain
     `curl https://api.expo.dev/` with no token), same result. This
     sandbox cannot reach Expo's API at all; not a credentials problem,
     not something to retry around. Per this sandbox's proxy policy
     ("do not retry or route around it — report the blocked host"), no
     further attempts were made from here.
   - **Workaround in progress**: user connected the GitHub repo directly
     on Expo's dashboard (build triggers from Expo's cloud infra on
     push, bypassing this sandbox's network entirely). First
     GitHub-triggered build failed: `EAS project not configured. Must
     configure EAS project by running 'eas init' before this command
     can be run in non-interactive mode.` — expected, since `eas init`
     (which writes `extra.eas.projectId` into `app.json`) never
     successfully ran anywhere yet. Since `eas init` itself needs
     `api.expo.dev` (blocked here) or an interactive session, the
     project ID needs to come from the user's Expo dashboard instead
     (Project settings → Project ID, on the `savemoney-mobile` project
     the GitHub integration likely already auto-created) so it can be
     hand-written into `app.json` without any network call from this
     sandbox.
   - **Resolved, 2026-08-04**: user's Expo project is
     `https://expo.dev/accounts/aamers-apps/projects/finance-os`
     (`expo.dev` is blocked by the same network policy as `api.expo.dev`
     — confirmed, so this had to come from the user reading their own
     dashboard, not a fetch from here). Hand-wrote into
     `apps/mobile/app.json`: `owner: "aamers-apps"`, `slug` changed from
     `savemoney-mobile` → `finance-os` (now matches the dashboard
     project exactly, since `eas init` never ran to do this
     automatically), and `extra.eas.projectId:
     "14d4694d-79c1-4f6c-b9a3-9817f1bdf82b"` (the UUID from the
     dashboard's project settings). Verified with `npx expo config
     --type public` — resolves cleanly, `owner`/`slug`/`projectId` all
     present. This should be enough for the next GitHub-triggered EAS
     build to skip the "EAS project not configured" failure and proceed
     straight to `build:internal`.
   - **Alternative added, 2026-08-04 — GitHub Actions APK build**: EAS's
     free-tier queue was reported as slow. Investigated two faster
     alternatives (`eas build --local` and a plain native Gradle build)
     from this sandbox first: this sandbox has JDK 21 + Gradle 8.14.3 but
     no Android SDK, and `npx expo prebuild --platform android` itself
     succeeds, but the actual Gradle compile hits the same category of
     network block as EAS — React Native's Gradle plugin requires JDK 17
     specifically and Gradle's toolchain auto-download (`foojay`) got a
     403 through the proxy, and separately `dl.google.com` (needed for
     the Android SDK platform/build-tools) is blocked exactly like
     `api.expo.dev`/`expo.dev` were. So neither local option works from
     *this* sandbox — confirmed, not assumed. (The prebuild-generated
     `apps/mobile/android/` directory is gitignored and was left
     untracked; `expo prebuild` also flips `package.json`'s
     `android`/`ios` scripts to bare-workflow variants — reverted that so
     the managed-workflow/EAS scripts stay intact, since we aren't
     committing to a bare workflow here.)
     Added `.github/workflows/android-apk.yml` instead: runs entirely on
     GitHub's runners (real network access, no proxy policy), doing
     `expo prebuild` + `./gradlew assembleRelease` directly — same net
     result as EAS's `preview` profile APK, but without EAS's queue.
     Signs with the auto-generated debug keystore from prebuild's
     template (matches EAS's own "no real release keystore yet"
     posture at this stage — swap for a real one via GitHub Secrets
     before any Play Store submission). Triggers: `workflow_dispatch`
     (manual, any branch/ref) and `push` to `main` scoped to
     mobile/package-relevant paths. Not run yet in this sandbox (can't
     — no way to trigger/observe GitHub Actions runs without GitHub
     write/Actions access from here); next real verification happens
     when the user runs it from the Actions tab.
7. iOS build — same codebase, no new screens — once an Apple Developer
   account is in place. Not blocking v1's Android APK.
8. *(Later phase, not v1)* automatic capture channels per §3/§4, offline
   sync, biometrics, widgets, store submissions.

## 6. Decisions log

- **2026-08-04, initial**: Phase 4 (general SMS/bank/email import) on hold;
  mobile (Phase 5) prioritized next, automation folded into this plan.
  *(Superseded by the same-day revision below — automation moved back out
  of v1.)*
- **2026-08-04, revision**: v1 = plain feature-parity port, no automation,
  no PWA interim, Android APK as the first deliverable, iOS on the same RN
  codebase to follow. Monorepo (not a new repo) with independently
  versioned `apps/web` and `apps/mobile`. See §0–§1.
- Background-capture model (defer-until-unlock) and the "no bank
  aggregation in v1" call from the first pass both still stand for
  whenever automation work resumes (§3/§4) — not reopened, just not
  relevant until then.
- **2026-08-04**: build-order steps 1–3 done in this build sandbox (no
  device/EAS access here — see §5 step 2). `packages/finance-engine`
  extracted; `packages/schemas` deliberately deferred (see §5 step 1,
  dependency on `apps/web/src/lib/format.ts`'s `CurrencyCode`). Vault
  crypto ported to `apps/mobile` with an Argon2id WASM-first/native-
  fallback strategy and validated at the algorithm level via
  `scripts/vault-crypto-vectors.mjs`; real Hermes/device validation is
  the explicit handoff item for whoever picks this up next with a phone
  or EAS Build access. Step 3 (bearer-token generalization) also done:
  `createClient()` itself now resolves bearer-vs-cookie so every
  existing query got mobile support for free, the 13 duplicated
  `requireUser()` copies were consolidated to one shared
  implementation, and — the one genuinely surprising find — the proxy
  middleware was silently redirecting every unauthenticated `/api/v1/*`
  request to `/login` regardless of intent, which would have defeated
  bearer-token auth entirely had it shipped unnoticed; fixed alongside
  the rest. Only vault's Route Handlers are built (Phase 5.4 needs them
  next); transactions/budgets/goals/loans/investments/net-worth Route
  Handlers are deferred to land with each module's Phase 5.5 screen.
  Step 4 (mobile auth) also done for the email/password path: Supabase
  client + AsyncStorage session persistence, `packages/api-client`
  wired to the live session token, and a real auth → vault-setup/
  unlock → unlocked flow exercising Phase 5.2's crypto module for real
  instead of a throwaway spike. Google OAuth/magic-link (need PKCE +
  deep link) and recovery-code unlock are explicit, flagged gaps —
  not silently skipped, just not v1-blocking.
  the explicit handoff item for whoever picks this up next with a phone
  or EAS Build access.
