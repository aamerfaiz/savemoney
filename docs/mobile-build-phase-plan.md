# Phase 5 — Native mobile (Expo) build phase plan

Status tracker for **Phase 5** of the financeos roadmap (see the `financeos`
skill / `AGENTS.md`): native mobile via Expo, a shared Turborepo, offline
sync, biometrics, and home-screen widgets. Nothing in this phase has shipped
yet — the app today is a mobile-first **PWA** (Next.js 16 App Router,
installable, works great in a phone browser) but has no native shell, no App
Store/Play Store presence, no offline data, and no OS-level biometrics or
widgets. This doc is the plan for closing that gap.

Extend this file rather than starting a new one as design decisions get made
or increments land — same convention as `docs/phase-3-ai-assistant-plan.md`
and `docs/e2ee-path-b-plan.md`.

## Why native, given the app is already a mobile-first PWA

The web app already covers "usable on a phone." Phase 5 exists for what a
PWA structurally cannot do on both iOS and Android today:

- **Biometric unlock of the vault** (Face ID / Touch ID / Android biometric
  prompt) tied to the OS keystore/keychain, not a browser-storage PIN.
- **True offline** — read *and write* with no network at all, not just an
  installable shell.
- **Home-screen widgets** (Safe-to-Spend, next bill due) — no web equivalent.
- **Push notifications** that work reliably on iOS (web push on iOS Safari is
  limited) for the existing `buildNotifications` alerts (bill due, overspend,
  low safe-to-spend, goal milestone, loan paid off).
- **App Store / Play Store distribution**, which some users expect and trust
  more than "install this website."

## Locked decisions

- **Expo** (React Native), not a bare RN project or a second framework —
  Expo Router gives file-based routing close to Next's mental model, EAS
  gives managed builds/OTA updates without a native toolchain in this
  sandbox, and Expo's module ecosystem covers every native API this phase
  needs (secure storage, biometrics, notifications, widgets via config
  plugins).
- **Shared Turborepo, not a separate repo.** The mobile app is a new
  workspace inside *this* repository, not a fork or sibling repo — it must
  reuse the pure finance engines and types verbatim, and drift is the
  single biggest risk to a second client (see "What gets shared" below).
- **Supabase stays the backend, unchanged.** Same Postgres/Auth project, same
  RLS policies, same tables. The mobile app is a new *client* of the existing
  API surface, not a new backend.
- **The vault model (client-side E2EE, DEK never leaves the device
  decrypted) is non-negotiable and must hold on mobile too** — see "Vault
  crypto parity" below. A mobile build that weakens this (e.g. decrypting on
  a server hop for convenience) is not acceptable.
- **No new backend endpoints required to start.** `src/app/api/v1/ai/*` was
  already deliberately built as plain JSON Route Handlers instead of Server
  Actions *for this reason* (see `docs/ai-smart-entry-plan.md` and the
  financeos skill's "Auth" section) — Phase 5 is the payoff of that seam.
  Everything else the mobile app needs is Supabase's own client SDK
  (`@supabase/supabase-js`) talking directly to Postgres/Auth through RLS,
  exactly like the browser does.

## Monorepo shape (target)

```
savemoney/
  apps/
    web/                # today's Next.js app, moved here as-is (lift, not rewrite)
    mobile/              # new: Expo Router app
  packages/
    finance-core/        # src/lib/finance/*, src/lib/analytics, src/lib/score,
                         # src/lib/calendar, src/lib/reports — pure, no DOM/Node
                         # APIs, already framework-agnostic today
    vault-crypto/        # shared primitives (see "Vault crypto parity")
    types/               # Drizzle-derived row types / Zod schemas used by both
                         # clients (no drizzle-orm/postgres runtime dependency —
                         # types + zod schemas only, so mobile never bundles a
                         # Postgres driver)
  turbo.json
  package.json           # workspaces root
```

This is a **lift, not a rewrite**: `apps/web` starts as today's `src/` moved
under a workspace with no behavior change, verified by a green
`npm run build` before any mobile code is added. Only after that lands do the
pure `src/lib/finance/*`, `analytics`, `score`, `calendar`, and `reports`
modules move into `packages/finance-core` (they already have zero DOM/Node
dependencies — that was a deliberate constraint from Phase 1 onward, see the
financeos skill's "Keep finance logic as pure functions" golden rule, and it
is exactly what makes this move mechanical instead of a rewrite).

## What gets shared vs. rebuilt per platform

| Layer | Shared (`packages/`) | Rebuilt per platform |
|---|---|---|
| Finance math (budget, health score, loan, investment, net worth, analytics, calendar, reports) | ✅ pure functions, zero platform APIs | — |
| Zod schemas / row types | ✅ | — |
| Vault crypto **primitives** (derive/wrap/unwrap/encrypt/decrypt, packed-payload format) | ✅ same algorithms, same wire format | Backing KDF/crypto library differs (Web Crypto vs. `expo-crypto`/`react-native-quick-crypto`) — see below |
| UI components (MagicBento, cards, forms) | ❌ | Native equivalents in `apps/mobile` — Tailwind/shadcn/GSAP have no RN runtime; this is a real rebuild, not a port |
| Data fetching | ❌ | Web: Server Components/Server Actions. Mobile: `@supabase/supabase-js` + TanStack Query directly against Supabase, same RLS-scoped tables |
| Routing | ❌ | Web: Next App Router. Mobile: Expo Router (file-based, but a different framework) |

## Vault crypto parity (the hard part)

This is the single biggest risk in this phase, on the same axis
`src/lib/mcp/server-crypto.ts` already had to solve once: **the exact same
wrap/unwrap and AES-256-GCM packed-payload format must be reproducible from a
runtime other than the browser**, byte-for-byte, or a value encrypted on web
can't be read on mobile (and vice versa).

- `src/lib/vault/crypto.ts` runs on Web Crypto (`crypto.subtle`) +
  hash-wasm's Argon2id, marked `"client-only"`.
- `src/lib/mcp/server-crypto.ts` is already a **deliberate, documented
  duplicate** of those primitives for Node (server-only, no browser) —
  verified byte-for-byte interoperable with the client implementation. That
  precedent is the template for mobile: **do not try to share the crypto
  module directly** (React Native has no `crypto.subtle` or DOM), write a
  third parity implementation (`packages/vault-crypto`'s RN entry point,
  backed by `expo-crypto`/`react-native-quick-crypto` + a WASM or native
  Argon2id binding) and add a cross-runtime test vector suite (fixed
  passphrase/IV/plaintext → expected ciphertext) that all three
  implementations (browser, Node/MCP, RN) must pass identically.
- The DEK-wrap paths (passphrase, recovery code, per-device quick-unlock)
  extend naturally to a fourth wrap kind: **device secure storage** (iOS
  Keychain / Android Keystore via `expo-secure-store`), unlocked by
  biometrics instead of a typed PIN — same "independent, revocable wrap"
  design already used for quick-unlock, not a new architecture.

## Offline sync

Every finance value is E2EE ciphertext (see `docs/e2ee-path-b-plan.md`), so
"offline" here means more than a read cache:

- **Reads**: cache decrypted rows in an on-device store (`expo-sqlite`) keyed
  by the same row IDs as Postgres, refreshed on reconnect. The decrypted
  cache only ever exists after the vault is unlocked on-device — same trust
  boundary as the in-memory web DEK, just persisted locally instead of
  cleared on reload.
- **Writes**: queue client-encrypted mutations (already-ciphertext payloads,
  identical shape to what `actions.ts` expects today) locally when offline,
  flush the queue in order on reconnect through the same Server Actions/
  `/api/v1/ai/*` contract the web app uses. No new write path — offline just
  delays submission of the same encrypted payload.
- **Conflicts**: last-write-wins per row is acceptable to start (matches the
  web app's current lack of optimistic-concurrency tokens); revisit only if
  real multi-device conflicts show up.

## Build phases

### Phase 5.0 — Monorepo lift (no new features)
- [ ] Add Turborepo (`turbo.json`, root workspaces in `package.json`).
- [ ] Move today's app to `apps/web` with zero behavior change; `npm run
      build` green from the new location before anything else proceeds.
- [ ] Extract `src/lib/finance/*`, `analytics`, `score`, `calendar`,
      `reports`, and the shared Zod schemas/types into `packages/`, imported
      back into `apps/web` — still zero behavior change, just relocated.
- [ ] CI/build scripts updated for the workspace layout.

### Phase 5.1 — Expo app shell
- [ ] `apps/mobile`: Expo Router app, auth screens wired to
      `@supabase/supabase-js` (AsyncStorage/SecureStore session persistence
      instead of cookies).
- [ ] Bottom tab nav mirroring `nav-config.ts`'s primary items.
- [ ] Dashboard screen reading real Supabase data (no vault unlock yet —
      demo-mode-equivalent numbers only) to prove the data path end to end.

### Phase 5.2 — Vault crypto parity on RN
- [ ] `packages/vault-crypto` RN implementation + cross-runtime test vector
      suite (browser / Node-MCP / RN all pass the same fixtures).
- [ ] Vault unlock flow on mobile (passphrase, recovery code) reusing the
      shared primitives.
- [ ] Biometric wrap path (`expo-secure-store` + `expo-local-authentication`)
      as a new, independently-revocable DEK wrap, alongside — not replacing —
      passphrase/recovery/PIN.

### Phase 5.3 — Feature parity (read path)
- [ ] Transactions, Budget, Goals, Loans, Investments, Net Worth, Analytics,
      Notifications screens — decrypted read-only views using
      `packages/finance-core` for all math (no logic re-implemented).

### Phase 5.4 — Feature parity (write path) + offline queue
- [ ] Create/edit/delete for the modules above via the same Server Actions/
      `/api/v1/ai/*` contract, encrypted client-side before send.
- [ ] Offline write queue (`expo-sqlite`-backed) with flush-on-reconnect.

### Phase 5.5 — Push notifications
- [ ] Expo push token registration, server-side dispatch triggered by the
      same `buildNotifications` conditions the in-app notifications module
      already computes — one alert source, two delivery channels.

### Phase 5.6 — Home-screen widgets
- [ ] iOS/Android widget (Safe-to-Spend, next bill due) via Expo config
      plugins + native widget extensions; read from the offline cache so a
      widget works without opening the app.

### Phase 5.7 — Store distribution
- [ ] EAS Build + EAS Submit pipelines for iOS/Android; app icons, splash,
      store listings.

## Gotchas anticipated

- Tailwind v4 / shadcn/ui / GSAP MagicBento have no React Native runtime —
  budget real design time for native equivalents, not a mechanical port.
- Drizzle ORM and `postgres` (the driver) are server-only and must never
  enter the mobile bundle — `packages/types` ships Zod schemas and inferred
  types only, no runtime DB dependency.
- `src/lib/mcp/server-crypto.ts`'s "byte-for-byte interoperable duplicate"
  precedent is the proof this pattern works — lean on it rather than
  inventing a new cross-runtime crypto strategy.
- Keep this phase from starting before Phase 3/3.5/4 stabilize further —
  the roadmap explicitly orders native mobile last so the shared core it
  lifts is already correct and stable.
