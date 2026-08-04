# Phase 5 — Mobile Build plan

Status tracker for native mobile (Expo), pulled forward ahead of Phase 4 per
product decision. This doc is the plan of record for everything mobile —
extend it as decisions land rather than starting a new file, same convention
as `phase-3-ai-assistant-plan.md` / `docs/ai-smart-entry-plan.md`.

**Decision (2026-08-04): Phase 4 (SMS/bank/email import as a general
feature) is on hold. Mobile (Phase 5) is next**, specifically because the
mobile app needs automatic transaction capture (NFC / SMS / notifications /
email) as a core feature, not a later add-on — so parts of what the roadmap
called "Phase 4" now live inside this plan instead of a separate phase.

Nothing in this plan is built yet. No Expo project, no monorepo/Turborepo
scaffold exist in the repo today — this is analysis + open questions only.

---

## 1. What "mobile build" covers

From the original roadmap (`AGENTS.md`): native mobile via Expo, a shared
Turborepo, offline sync, biometrics, widgets. Expanded per this round of
analysis to explicitly include **automatic transaction capture** — reading
signals the phone already receives (SMS, notifications, email) or can
trigger on (NFC) so the user doesn't have to manually log every expense/
income.

## 2. Current-state audit — what's reusable vs. blocking

**Reusable as-is:**
- DB schema + RLS (Postgres/Supabase) — transport-agnostic.
- `src/lib/finance/*` — pure, framework-free finance engines. Directly
  packageable.
- Per-module Zod schemas — already separated from UI.
- `src/lib/import/pipeline.ts` — already designed for this: pure
  `detectMapping` / `normalizeRow` / `dedupeKey` / `buildPreview` over a
  `Record<string,string>[]`, explicitly built so "SMS/email/bank feeds...
  reuse the same functions." Any capture channel below should normalize
  into this pipeline rather than getting its own write path.
- The AI Smart Entry capability (`/api/v1/ai/{extract,commit}`,
  `docs/ai-smart-entry-plan.md`) — free-text → structured draft via the
  user's BYOK key, with a **human-confirm gate before anything writes**.
  This is the natural parser for messy/varying SMS & email text instead of
  hand-written per-bank regex (this app is not country-locked — defaults to
  USD but supports any currency — so format diversity is real). The
  confirm-gate matters even more for ambient/unprompted capture than for
  typed prompts: it's also the defense against a phishing SMS crafted to
  look like a bank debit.

**Blocking, in order of severity:**
1. **Server Actions almost everywhere.** 19 files across nearly every
   module (`goals/actions.ts`, `loans/actions.ts`, `vault/actions.ts`, …)
   are `"use server"`, bound to Next's RSC action-id protocol — unreachable
   from a React Native client. Two Route Handlers already exist as the
   precedent (`/api/v1/ai/*`, `/api/mcp`) but that's 4 endpoints out of the
   app's full mutation surface.
2. **Bearer-token auth isn't finished even on the one Route Handler surface
   that exists.** Logged as an open TODO in `ai-smart-entry-plan.md`: the
   query/action layer still instantiates its own cookie-bound Supabase
   client internally instead of accepting an injected one. Has to be fixed
   before any mobile-callable API is real.
3. **Vault crypto portability is unproven.** `src/lib/vault/crypto.ts` is
   `"client-only"`, built on browser `crypto.subtle` (AES-GCM, HKDF) +
   `hash-wasm`'s Argon2id (WASM). Hermes (Expo's JS engine) has no native
   `crypto.subtle` and inconsistent WASM support. Since every finance field
   is encrypted client-side, the app cannot function on mobile until this is
   proven — via polyfill (`react-native-quick-crypto` covers AES-GCM/HKDF)
   or a native Argon2 module. `docs/e2ee-path-b-plan.md` explicitly scoped
   mobile as undesigned ("inherits this design... but isn't being designed
   here").
4. **Full UI rebuild.** MagicBento (GSAP), Tailwind v4, shadcn primitives,
   Recharts are all web-only. Layout/IA can be mirrored; none of the code
   ports.
5. **No monorepo yet.** Single `npm` app today, not even a workspace. The
   "shared Turborepo" from the roadmap is aspirational.

**In good shape already:** the vault's 4-independent-KEK-wrap design
(passphrase / recovery code / device PIN / MCP token) anticipated this —
`e2ee-path-b-plan.md` calls native "a particularly good fit later" since
iOS Keychain / Android Keystore can hardware-back the device quick-unlock
wrap, replacing the current PIN-only Argon2id wrap. Ready to extend once
crypto portability (#3) is resolved.

## 3. Automatic capture channels — technical reality

| Channel | Platform | Verdict |
|---|---|---|
| NFC (reading a tap-to-pay transaction) | — | **Not possible.** No OS exposes Apple Pay/Google Pay wallet transactions to third-party apps; EMV card chips don't expose customer-readable transaction history outside a certified terminal. |
| NFC (physical tags as manual triggers) | Both | Real, but it's a manual quick-add convenience (tap a sticker → app opens pre-filled), not automatic capture. |
| SMS reading | **Android only** | No public iOS API exists for reading arbitrary SMS content — a hard platform wall, not a workaround-able limitation. Android: `READ_SMS` + broadcast receiver works, but is a Play Store Restricted Permission requiring justification/review. |
| Notification listener | **Android only** | `NotificationListenerService` reads content from any app's notifications (bank apps, UPI/wallet apps, not just SMS) — arguably stronger than SMS since more confirmations are push-based now. iOS has no equivalent (Notification Service Extension only sees pushes sent to your own app). Manual "special access" grant, not a runtime dialog. |
| Email parsing | **Cross-platform, not mobile-dependent** | OAuth (Gmail API/IMAP) + polling/webhook. Works identically from a server job, doesn't need the phone open, no OS permission, no store review risk. Could be built independent of the native app entirely. |
| Bank aggregation / Open Banking (Plaid, TrueLayer, Salt Edge, regional AA/UPI frameworks) | Cross-platform | Industry-correct: structured, consented data, no scraping fragility. Requires an aggregator relationship (cost, KYC, regional coverage gaps) — genuinely Phase-4-shaped infra, independent of native vs. PWA. |

**Net effect:** automatic SMS/notification capture is Android-only, full
stop. If iOS parity matters, it has to come from email parsing, bank
aggregation, or AI-assisted manual entry (Smart Entry) — not from
replicating the Android mechanism.

## 4. New architectural question: background capture vs. the vault

A background SMS/notification listener can fire while the app isn't open,
but the DEK only lives in an in-memory Zustand store, cleared on lock/
logout, never persisted. Two directions, undecided:
- Queue raw captured text locally (already plaintext PII by nature of what's
  being read) and defer parsing + encryption until the user next opens/
  unlocks the app; or
- Extend the device quick-unlock PIN wrap (hardware-backed via Keychain/
  Keystore on native) so a background service can unwrap the DEK without a
  full interactive unlock.

Either way this doesn't break the "server never sees plaintext" promise —
capture and parsing stay on-device — but it does mean requesting very broad
permissions (full SMS / full notification access), which is a real
user-trust conversation and, on Android, real Play Store scrutiny.

## 5. Build order (per §6 decisions)

**Track A — PWA-first interim (ships first, lower risk):**
1. PWA hardening: installability, WebAuthn biometric quick-unlock (extends
   the existing PIN-wrap slot in `src/lib/vault/`), offline shell.
2. Email-parsing capture (OAuth to Gmail/IMAP + polling/webhook) — not
   mobile-dependent, built as a server job, funnels through
   `src/lib/import/pipeline.ts` + the AI Smart Entry confirm-gate. Usable
   from the PWA immediately.
3. Generalize the bearer-token Route Handler pattern from `/api/mcp` across
   the rest of the mutation surface; finish the bearer-auth TODO in §2.2 —
   needed for Track B regardless, do it here so it's not blocking later.

**Track B — native Expo build (starts in parallel, ships once proven):**
4. Spike vault crypto portability (§2.3: Argon2id/AES-GCM/HKDF on Hermes) —
   the gate for committing further native effort. Runs in parallel with
   Track A, not after it.
5. Scaffold the Turborepo; extract `src/lib/finance/*` + Zod schemas into a
   shared package — low-risk, independent of the spike's outcome.
6. Mobile auth: Supabase PKCE + deep link + AsyncStorage session
   persistence.
7. Expo shell + navigation; port screens starting with Transactions
   (already "the reference module" on web).
8. NFC-tag manual-trigger quick-add.
9. SMS + notification-listener capture (Android only) — the first
   mobile-native-only feature, impossible in the PWA interim (browser
   sandboxing blocks both). Captured text queues locally and defers
   parsing/encryption until next unlock (§6).
10. Offline queue/sync + Keychain/Keystore-backed biometric unlock last.

## 6. Decisions (2026-08-04)

- **Platform priority: both simultaneously, degraded iOS.** Android and iOS
  are built together; iOS ships without SMS/notification capture (no API
  exists for either — not a sequencing choice, a platform wall) and relies
  on email parsing + NFC tags + Smart Entry instead. No Android-first or
  iOS-first staging.
- **v1 automation channels: SMS + notification listener (Android), email
  parsing, NFC tags (manual trigger).** Bank aggregation (Plaid/Open
  Banking/regional AA) is explicitly **not** in v1 — revisit later given its
  cost/KYC/regional-coverage overhead.
- **Background capture model: defer until next unlock.** A background
  SMS/notification listener queues raw captured text locally; parsing +
  vault encryption happen only when the user next opens/unlocks the app.
  The DEK's in-memory-only guarantee is preserved as-is — no background
  DEK access, no PIN-wrap extension for this.
- **Native vs. PWA sequencing: PWA-first interim.** Ship a PWA-first push
  (installable, WebAuthn biometrics) as a lower-risk stopgap while the vault
  crypto-portability spike (Argon2id/AES-GCM/HKDF on Hermes) runs in
  parallel. Move to the full Expo rebuild once that spike is proven. Note:
  the PWA-first interim **cannot carry SMS/notification-listener capture**
  (browser sandboxing blocks both) — that channel only exists once the
  native Expo app ships, so it's out of scope for the interim phase and
  becomes the first mobile-native-only feature once native lands.
