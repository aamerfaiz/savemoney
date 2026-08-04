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
   mobile uses this client).
4. **Mobile auth**: Supabase PKCE + deep link + AsyncStorage session
   persistence, then the ported vault-unlock screen (passphrase → DEK, same
   flow as web today).
5. **Expo shell + navigation**; port screens in the same order the web
   build itself was built: Transactions first (the reference module), then
   Dashboard, Budget, Goals, Loans, Investments, Net Worth, Analytics.
6. **Android APK build** via EAS Build (`eas build -p android --profile
   preview` → `.apk`, sideloadable, no Play Store submission yet). This is
   the v1 deliverable.
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
- **2026-08-04**: build-order steps 1–2 done in this build sandbox (no
  device/EAS access here — see §5 step 2). `packages/finance-engine`
  extracted; `packages/schemas` deliberately deferred (see §5 step 1,
  dependency on `apps/web/src/lib/format.ts`'s `CurrencyCode`). Vault
  crypto ported to `apps/mobile` with an Argon2id WASM-first/native-
  fallback strategy and validated at the algorithm level via
  `scripts/vault-crypto-vectors.mjs`; real Hermes/device validation is
  the explicit handoff item for whoever picks this up next with a phone
  or EAS Build access.
