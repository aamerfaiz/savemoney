# Phase 3.5 — End-to-end encryption ("not even me") plan

**Roadmap position**: a sub-phase of **Phase 3** (AI Assistant / BYOK) in
the financeos roadmap — see `docs/phase-3-ai-assistant-plan.md`, which
points here. Internally numbered **3.5.0–3.5.8** below, following the same
`3.x` convention that doc uses for its own sub-phases. Also referred to as
"Path B" earlier in the design discussion that produced this doc.

Status: **design only, nothing in this doc is implemented yet.**

This is deliberately a different, stronger bar than the AI provider key
encryption already shipped (`src/lib/ai/crypto.ts`). That's envelope
encryption with a server-held key — real protection against a DB-level
leak, but decryptable by anyone with server access. Phase 3.5 removes the
server (and its operator) from the trust boundary entirely for the fields
it covers.

Extend this file rather than starting a new one as design decisions get
made or increments land, same convention as `docs/phase-3-ai-assistant-plan.md`.

## How this feels to use (plain-language walkthrough)

Before the cryptography: what a user actually experiences, end to end.

1. **Signing up.** Normal account creation (email/password or Google). The
   first time you touch an encrypted module, the app says "set up your
   Vault" — you pick a passphrase (a separate secret from your login
   password) and the app shows you a one-time recovery code, and makes you
   confirm you saved it before continuing — the same beat as a crypto
   wallet making you write down a seed phrase.
2. **Everyday use.** Open the app, unlock the vault (full passphrase, or a
   short PIN/Face ID if you've set up quick-unlock on that device), and it
   feels completely normal from there — add a $40 grocery expense, watch
   the dashboard and budget update. Behind the scenes your device
   scrambles the amount before it leaves, and unscrambles whatever comes
   back; the server only ever sees gibberish.
3. **Asking the AI assistant** "Can I afford a $400 car payment?" — your
   browser decrypts your numbers locally to build the answer's context,
   and separately decrypts your saved DeepSeek key just long enough to
   hand it to the server for that one question. The server places the
   call, returns the answer, and immediately forgets the key — nothing is
   written down. If you never use the assistant, your AI key never
   touches the server at all.
4. **New laptop.** Sign in normally; the app doesn't recognize the device,
   so it asks for your vault passphrase — the *same* one, not a new setup.
   Type it, everything unlocks, all your data appears. No pairing step, no
   QR code.
5. **Forgetting your vault passphrase.** The recovery code from setup is
   the only way back in. Lose both, and the data is genuinely,
   permanently unreadable — same trade a lost wallet seed makes. No
   support ticket fixes this, because there's nothing server-side that
   could fix it.
6. **Phone stolen**, with quick-unlock enabled. Whoever has it can try the
   PIN, but it only unlocks a copy cached on *that* phone — it doesn't
   work elsewhere and doesn't reveal the passphrase. If that's not
   reassuring enough, rotating the vault from another device makes the
   stolen phone's cached copy useless.
7. **What "even I can't see it" means in practice.** If the whole database
   leaked, every amount, note, and saved AI key would be noise — there's
   no master key anywhere server-side that opens it. The one named
   exception: for the few seconds it takes to answer an AI question you
   asked, your key passes through server memory to make that one call,
   then it's gone. That's the single deliberate crack in an otherwise
   airtight system, and it's disclosed on purpose rather than hidden.

## Goal / non-goal

- **Goal**: a user's financial data (amounts, descriptions, notes — see
  Scope below) is unreadable by the server, the database, backups, or
  anyone with production access, including the developer. Only the user's
  own browser, holding a key derived from a secret only they know, can
  decrypt it.
- **Non-goal (this phase)**: hiding *metadata* — which tables have rows,
  how many, `createdAt` timestamps, category/account/goal *names* if left
  unencrypted for UI convenience, etc. Traffic analysis / row-count
  leakage is a known, accepted limitation of this design, not something
  this phase tries to close.
- **Non-goal**: protecting against a compromised *client* (malware on the
  user's device, a browser extension, an XSS bug). E2EE protects the
  server-side trust boundary, not the endpoint.

## Threat model this actually defends against

Worth being explicit, since "not even me" is a strong claim:

- ✅ You, with full Vercel/Supabase/DB access, reading a user's
  amounts/notes directly.
- ✅ A stolen Postgres backup or leaked DB credential.
- ✅ A compromised `SUPABASE_SERVICE_ROLE_KEY` or direct DB connection
  string.
- ✅ Legal compulsion against the server operator producing plaintext
  (there is none to produce).
- ❌ A user who loses both their password and their recovery key (see
  Recovery below) — their data is permanently unrecoverable, by design;
  this is the fundamental trade E2EE makes.
- ❌ Malicious/compromised client-side code shipped by you — E2EE assumes
  the JS you ship is trustworthy at the moment the user runs it.

## Key architecture — vault key pattern

Directly deriving an AES key from the user's password and using it to
encrypt every row is the naive approach and it's wrong: rotating the
password would require re-encrypting every row. Instead, use the standard
two-layer scheme (Bitwarden/1Password shape):

1. **KEK (key-encryption key)** — derived client-side from the user's
   secret via Argon2id (WebCrypto doesn't ship Argon2 natively; use a WASM
   build, e.g. `hash-wasm` or `argon2-browser`) with a random per-user
   salt. Never leaves the browser, never transmitted, never stored.
2. **DEK (data-encryption key)** — a random 256-bit AES key, generated
   once per user at vault setup. This is the key that actually
   encrypts/decrypts rows. It is *wrapped* (encrypted) by the KEK and the
   wrapped blob is what's stored server-side — the server only ever sees
   ciphertext of a key it cannot use.
3. **Per-field encryption** — every sensitive column is AES-256-GCM
   encrypted with the DEK and a fresh random IV per field (never reuse an
   IV with the same key — same discipline as `src/lib/ai/crypto.ts`, just
   run in the browser via `crypto.subtle` instead of Node's `crypto`).

Rotating the password only re-wraps the DEK (cheap); it never touches the
encrypted data itself. This also enables multiple unlock paths (password +
recovery key, see below) by wrapping the *same* DEK twice, under two
different KEKs.

## Recovery key (mandatory, not optional)

Forgetting the vault secret must not silently mean "we'll email you a
password reset" — that flow doesn't exist here, because a password reset
can't recover a key it never had. At vault setup:

- Generate a random 256-bit recovery key client-side, encode it as a
  readable code (like a Signal/1Password recovery kit), show it **once**,
  require the user to confirm they saved it before continuing.
- Wrap the same DEK a second time under a KEK derived from this recovery
  key (its own salt) and store that wrapped copy alongside the
  password-wrapped one.
- Losing both the vault secret and the recovery key = data is
  cryptographically gone. State this plainly in the UI at setup time, not
  just in this doc.

## Handling Google OAuth (no password to derive from)

`src/app/login/auth-form.tsx` offers "Continue with Google" — there is no
password in that flow to derive a KEK from. E2EE therefore needs a secret
**independent of account login**:

- First login (password or OAuth) that touches an encrypted module
  prompts a one-time "Set up your Vault Passphrase" step — a secret
  distinct from the account password, used only for the KEK derivation
  above.
- This makes the vault passphrase symmetric across both auth methods:
  even password-login users get a dedicated vault passphrase rather than
  reusing their Supabase Auth password directly, which also sidesteps a
  subtler issue — Supabase Auth's password is verified server-side
  (bcrypt), and the login form's plaintext technically transits to
  Supabase during sign-in; keeping the vault passphrase a fully separate
  secret means it never has to be sent anywhere, ever, for any reason.

## Session, unlock & multi-device UX

- **Locked state.** On login, the app knows the user is authenticated
  (Supabase session valid) but has no DEK in memory. Encrypted modules
  show an unlock prompt.
- **Unlocking the vault** derives the KEK client-side, unwraps the DEK,
  and holds it only in memory (a module-level `CryptoKey`, ideally
  `extractable: false` where the Web Crypto API allows using it directly
  for decrypt operations without ever exporting raw bytes to
  JS-reachable memory). No raw key material in
  `localStorage`/`sessionStorage`/cookies, ever.
- **Quick-unlock (decided): a device-local PIN/biometric layer, modeled
  directly on how crypto wallets do it.** A wallet's seed phrase is the
  real, portable secret; its PIN only unlocks an already-decrypted copy
  cached in that phone's own secure storage — it's never the thing
  protecting funds against a stolen database, because there is no
  server-side database of wrapped keys to defend against. Applied here:
  - After a normal full-passphrase unlock, the user can opt in to "Quick
    unlock on this device." The app re-wraps the DEK under a
    PIN-or-WebAuthn-derived key and stores that wrapped copy **only in
    local `IndexedDB` on that device** — it never touches the server.
  - Subsequent opens on that device use the short PIN or a WebAuthn
    platform authenticator (preferred where available — genuinely
    hardware-backed, key material typically not extractable even with
    physical device access) to unlock the local cache.
  - A new device, or a cleared local cache, always falls back to the full
    passphrase or recovery key — the PIN grants nothing across devices,
    by design.
- **Multi-device (resolved): the vault already "just works" across
  devices**, because the password-wrapped and recovery-wrapped DEK blobs
  are portable, server-stored ciphertext. A new device's flow is just:
  sign in via Supabase Auth, get prompted for the vault passphrase, fetch
  the wrapped blob, unwrap locally. No device-pairing/QR-code exchange
  (that's Signal's model, solving a different problem). Quick-unlock, by
  contrast, is deliberately **not** portable — opt-in, independently, per
  device.
- **Device revocation (resolved):** losing a device with quick-unlock
  enabled can't be fixed by a remote "log out" alone — that stops future
  Supabase API access but can't reach into a key already cached on
  hardware you no longer control. The real remedy is a full **vault
  rotation**: generate a new DEK, re-encrypt every row under it, re-wrap
  for the password, the recovery key, and every remaining trusted device.
  Expensive (touches all the user's data) but honest — the lost device's
  cached copy of the *old* DEK becomes useless. WebAuthn-backed
  quick-unlock lowers how often this is actually needed, since that key
  material generally isn't extractable even with physical possession.

## Scope — what gets encrypted

Money and free-text columns across the modules that carry real user data
(see `src/db/schema.ts`):

| Table | Encrypted columns |
|---|---|
| `income` | `amount`, `description` |
| `expenses` | `amount`, `description`, `note`, `tags` |
| `budgets` | `amount` |
| `goals` | `targetAmount`, `currentAmount`, `monthlyContribution`, possibly `name` |
| `goal_contributions` | `amount`, `note` |
| `loans` | `principal`, `emi`, `remainingAmount`, `extraEmi`, possibly `name` |
| `loan_payments` | `amount`, `principalComponent`, `interestComponent` |
| `investments` | `investedAmount`, `currentValue`, `monthlyContribution`, possibly `name` |
| `investment_contributions` | `amount`, `note` |
| `net_worth_snapshots` | `totalAssets`, `totalLiabilities`, `netWorth`, `note` |
| `accounts` | `balance`, possibly `name` |
| `recurring_rules` | `amount`, `note` |
| `notifications` | `body` (title is app-generated, low sensitivity) |
| `private.ai_provider_keys` | `encryptedKey` (the vendor API key itself) |

**`private.ai_provider_keys` is in scope too — locked decision, not a
maybe.** It's already encrypted (`src/lib/ai/crypto.ts`), but under a
server-held `AI_KEYS_ENCRYPTION_KEY`, which is exactly the "same method as
the AI keys, but I can still see it" gap this whole doc exists to close.
Under Phase 3.5 it gets the identical vault-key treatment as everything
else: `encryptedKey`/`keyIv` become wrapped by the user's DEK instead of
the server secret. See "Resolved: the AI Assistant conflict" below — this
one choice has a real, larger consequence for how the AI features work,
not just where the ciphertext sits.

`userId`, foreign keys, `currency`, `date`/`timestamp` columns, `kind`,
`type`, `status` enums stay plaintext — RLS still needs `userId` to scope
rows, and dates/kinds are needed for calendar/recurring logic and carry
little sensitivity alone. Names (goal/loan/investment/account) are a
judgment call — encrypting them loses "New Car Fund" / "Home Loan" labels
in any tooling or Supabase dashboard view, which is arguably the point,
but also makes debugging harder. Flagging as a decision, defaulting to
**encrypt names too** for consistency with the "not even me" bar.

**Storage shape**: each encrypted column becomes `text` (base64
ciphertext-plus-IV, same packing as `EncryptedPayload` in
`src/lib/ai/crypto.ts`) instead of `numeric`/plain `text`. Postgres-level
`numeric(14,2)` constraints are lost for these columns; validation moves
entirely to the client (Zod, already the pattern for input) before
encryption.

**Confirmed non-breaking**: I checked the existing query layer — nothing
does SQL-level `SUM`/`GROUP BY`/`ORDER BY amount`/range filters on money
columns today. Every finance engine in `src/lib/finance/` already
receives plaintext rows fetched via Drizzle and aggregates in JS
(`computeBudget`, `computeHealthScore`, etc.). So encrypting these columns
doesn't break any *existing* aggregation — it only forecloses ever adding
SQL-level search/sort/filter on them later (e.g. "search transactions by
description," "sort by amount" done in the database) — those would have
to become client-side operations over already-decrypted rows instead.

## Architecture shift — where computation moves

This is the largest cost of Phase 3.5. Nearly every page in
`src/app/(app)/` is a **server component** today, reading plaintext via
`createClient()` from `@/lib/supabase/server` and composing the finance
engines server-side for instant SSR (see AGENTS.md "Navigation &
loading"). Under E2EE the server cannot decrypt, so every one of these has
to become client-driven instead:

- `dashboard`, `budget`, `goals`, `loans`, `investments`, `net-worth`,
  `analytics`, `reports`, `financial-score`, `calendar`, `notifications`,
  `transactions`, `recurring` — all currently server components — need to
  fetch **ciphertext** (still RLS-scoped, still per-user) and decrypt +
  run the finance engines in the browser instead.
- The finance engines themselves (`src/lib/finance/*.ts`) don't change —
  golden rule 5 ("pure functions, testable without a database or
  browser") holds either way. Only the *call site* moves from a server
  component to a client hook/effect.
- Server Actions (`transactions/actions.ts`, `budgets/actions.ts`, etc.)
  currently receive plaintext `FormData` and insert via Drizzle. Under
  E2EE they receive **already-encrypted** field values — the client
  encrypts with the in-memory DEK before calling the action. The action's
  job shrinks to "validate shape, stamp `userId`, insert ciphertext."
- `loading.tsx` skeletons still work — they cover the fetch+decrypt+compute
  round trip the same way they cover the current fetch, just a
  client-side one now instead of a server one.
- CSV import (`src/lib/import/pipeline.ts`) dedupe-against-DB currently
  compares against server-fetched rows; under E2EE the comparison set has
  to be decrypted rows, which either means fetching-then-decrypting
  client-side before dedupe, or accepting dedupe becomes client-only. The
  pipeline is already pure/side-effect-free per its own design note, so
  this is a caller-side change, not a pipeline rewrite.
- Notification generation (`buildNotifications`) — same shift, becomes a
  client-side computation over decrypted data instead of read-time
  server-side.

## Resolved: the AI Assistant conflict

**Decision (locked): the vendor API key is under the vault too, full stop
— "not even me" includes the AI keys.** This resolves the three-way fork
the first draft of this doc left open, and it has real, larger
consequences than just moving where ciphertext sits:

- `AI_KEYS_ENCRYPTION_KEY` (server secret) is retired for provider keys.
  `saveProviderKey`/`setActiveProviderKey`/`deleteProviderKey`
  (`src/lib/ai/actions.ts`) stop being able to hand the server plaintext
  at save time — the client wraps the vendor key with the DEK before it's
  ever sent, same as any other encrypted field in this plan.
- The server can therefore **never again decrypt a vendor key to make the
  call itself.** `chatWithActiveProvider()` (`src/lib/ai/resolver.ts`) —
  today's one chokepoint that decrypts server-side and calls
  `provider.chat()` — can no longer do that. This isn't only the Ask
  feature: **Smart Entry's extraction** (`src/lib/ai/smart-entry/
  extract.ts`, reached via `/api/v1/ai/extract`) goes through the exact
  same chokepoint, so both AI features move together, not just Ask.
- **Decision (locked): the actual vendor call stays server-side, via a
  transient relay — not a pure browser-to-vendor fetch.** A pure
  client-side call (browser calls DeepSeek directly) depends on every
  current and future provider's chat-completions endpoint permitting
  browser-origin CORS with an `Authorization` header — unverified, and
  plenty of vendor APIs deliberately don't allow it precisely to stop
  keys leaking into client bundles/network tabs (Anthropic's own SDK
  gates this behind `dangerouslyAllowBrowser: true` and warns against it
  in production). Betting the whole AI feature set on that per-vendor
  behavior is fragile. The relay removes that dependency entirely while
  keeping the "no server-held master key" property that actually matters
  for "not even me."
- **How the relay works**: the browser (vault unlocked, DEK in memory)
  decrypts the vendor key locally, then sends the *plaintext* key in the
  body of a single HTTPS request to a Route Handler
  (`src/app/api/v1/ai/*` — the existing documented exception to
  "mutations are Server Actions," see AGENTS.md). That handler
  immediately uses it to call the vendor, streams/returns the result, and
  **never logs or persists the key** — it exists in server memory for the
  lifetime of that one request only, then it's gone. Nothing new is
  written to `ai_provider_keys` or anywhere else in plaintext at any
  point.
- **What this does and doesn't buy.** It fully closes the original gap —
  there is no `AI_KEYS_ENCRYPTION_KEY`-style server secret that can
  decrypt a stored key at rest, ever, so a DB leak/backup theft/stolen
  service-role credential still yields nothing usable. What it does
  *not* do is make the server literally incapable of seeing the key
  during an in-flight request the user themself initiated — that's a
  narrower, honest exception ("not even me, except transiently, only
  during a request you made, only if the deployed code doesn't
  misbehave") and needs to be named as such in the Settings UI, not
  glossed over.
- Direct client-to-vendor calls (skipping the relay) remain a valid
  **optional future optimization** per provider, if/when a given
  vendor's CORS policy is confirmed to allow it — it shrinks the trust
  window further for that provider. Not required, not blocking 3.5.2.
- Rate limiting (`src/lib/ai/rate-limit.ts`) currently protects the
  extract/commit routes per-user server-side — that's about abuse/cost
  control on Smart Entry's *own* endpoints, independent of this change,
  and keeps working unchanged since it doesn't touch the vendor key.
- `testProviderKey` (verify a key before saving) goes through the same
  relay shape: the browser sends the freshly-entered plaintext key once
  for a test call, never a server-side `adapter.testKey()` holding a
  *stored* key.

## Alternatives considered (and rejected)

- **Customer-managed KMS key** — the enterprise SaaS pattern (Snowflake-,
  Slack-, Zoom-style "bring your own encryption key"): the wrapping key
  lives in the customer's own cloud KMS account; the server calls out to
  that KMS to decrypt at request time, and the customer can revoke access
  unilaterally. A real pattern, with audit trail and revocability — but
  it doesn't clear this doc's bar: the server's running process still
  holds plaintext in memory at the moment of use, same residual exception
  as the transient relay, while adding real operational complexity (every
  user needing their own cloud KMS account) that a personal finance app
  with no enterprise-compliance driver doesn't need. Rejected; the
  transient relay gets the same "at rest" guarantee more simply.
- **Static server-held master key, extended to all financial data** —
  this is the original "same as the AI keys" idea (`AI_KEYS_ENCRYPTION_KEY`
  applied everywhere). Real protection against a DB leak, but explicitly
  not "not even me," since anyone with server/env access can decrypt on
  demand at any time, not just transiently during a user-initiated
  request. Rejected as insufficient for the stated goal — it's what's
  shipped today, and stays in place until this plan replaces it table by
  table.
- **Pure client-to-vendor AI calls, no relay** — rejected as the
  *primary* mechanism (kept as an optional future optimization) because
  it depends on unverified, vendor-specific CORS support — see "Resolved:
  the AI Assistant conflict."

## Build phases

- [ ] **3.5.0 — Design & product decisions (this doc).**
  - [x] Threat model, key architecture (KEK/DEK), scope table.
  - [x] AI provider keys folded into scope; transient relay locked in as
        the mechanism over a pure client-side call.
  - [x] Device-local quick-unlock (wallet-style PIN/biometric) and the
        multi-device/revocation model decided.
  - [ ] Final gate: walk the "Open questions" list below to zero before
        3.5.1 starts.
- [ ] **3.5.1 — Vault key infrastructure.**
  - [ ] WebCrypto helpers: Argon2id KEK derivation (via a WASM lib),
        AES-256-GCM wrap/unwrap for the DEK, AES-256-GCM encrypt/decrypt
        for fields — client-side only, mirroring `src/lib/ai/crypto.ts`'s
        payload shape but run in the browser.
  - [ ] New table (private schema, alongside `ai_provider_keys`) for the
        wrapped DEK: `userId`, `wrappedDekByPassword`, `passwordKekSalt`,
        `kdfParams`, `wrappedDekByRecovery`, `recoveryKekSalt`,
        `...audit`. RLS `user_id = auth.uid()`, PostgREST-role revoked
        like `ai_provider_keys` — defense in depth even though the blobs
        are useless without the user's secret.
  - [ ] Server Actions: `setupVault` (first-time: generate DEK, wrap
        twice, store), `rotateVaultSecret` (re-wrap DEK under a new KEK,
        no data touched — used for a plain passphrase change), no
        server-side "read plaintext" action ever exists for this table
        by design.
  - [ ] Settings → new "Vault & Encryption" card: set up, view
        recovery-key status (shown-once acknowledgment, never
        re-displayable), rotate passphrase.
  - [ ] Unlock UI: prompt on session start for any encrypted route:
        derive KEK, unwrap DEK, hold in memory.
  - [ ] **Verify**: `npm run build` (type-check + prerender) passes;
        screenshot the vault-setup flow and unlock prompt at 390px
        (mobile) and a desktop width with the preinstalled Chromium, per
        the skill's "Verifying changes" convention — this is new UI.
- [ ] **3.5.2 — Pilot: migrate `private.ai_provider_keys` to
      vault-wrapped storage.** Smallest table, already isolated, already
      has its own encrypt/decrypt helper to model the client-side version
      from — and it's the specific thing that prompted locking in "not
      even me" instead of the server-secret model. Prove the vault
      pattern here before the twelve finance tables.
  - [ ] Move `saveProviderKey`/`testProviderKey` to wrap client-side for
        storage; server persists ciphertext only, and `testProviderKey`'s
        verification call goes through the relay below rather than a
        server-side `adapter.testKey()` holding a stored key.
  - [ ] Build the transient-relay Route Handler: accepts a plaintext
        vendor key in the request body (sent once, per call, from the
        unlocked browser), calls the provider adapter, returns the
        result, never logs/persists the key. Rework
        `chatWithActiveProvider` (`src/lib/ai/resolver.ts`) and both
        callers — Ask (`src/lib/ai/actions.ts`) and Smart Entry
        extraction (`src/lib/ai/smart-entry/extract.ts`) — to go through
        it instead of decrypting a stored key server-side.
  - [ ] (Optional, non-blocking) Confirm per-provider whether a pure
        client-to-vendor call is possible (CORS), as a future
        optimization that skips the relay entirely for that provider.
  - [ ] **Verify**: `npm run build` passes. Manual test: save a key, ask
        the assistant a question end to end, then confirm via the
        Supabase MCP / SQL editor that the stored row is unreadable
        ciphertext with no remaining server secret able to open it.
- [ ] **3.5.3 — Pilot the finance-data pattern.** Recommend Transactions
      next (it's already "the reference module" per AGENTS.md) — prove
      encrypt-on-write, decrypt-on-read, client-side dashboard tile,
      before touching the other eleven finance tables.
  - [ ] **Verify**: `npm run build` passes; screenshot the transactions
        list and any dashboard tile it feeds, rendering real (decrypted)
        numbers, at 390px and desktop.
- [ ] **3.5.4 — Roll the pattern out** to the remaining tables in the
      Scope table above, module by module, following the skill's "Add a
      new feature module" shape for each.
  - [ ] **Verify**: build + screenshot per module as it lands, same as
        3.5.3.
- [ ] **3.5.5 — Move server-component pages to client-driven fetch +
      decrypt + compute**, module by module, per the Architecture shift
      section.
  - [ ] **Verify**: build passes; confirm `loading.tsx` skeletons still
        cover the (now client-side) fetch+decrypt+compute window without
        a layout flash; screenshot each migrated page at 390px and
        desktop.
- [ ] **3.5.6 — Recovery key UX, OAuth vault passphrase, quick-unlock &
      multi-device.**
  - [ ] Recovery-key display/confirm flow at vault setup.
  - [ ] "Set up your Vault Passphrase" prompt for OAuth-only accounts on
        first touch of an encrypted module.
  - [ ] Device-local quick-unlock (PIN, or WebAuthn where available),
        stored only in that device's local `IndexedDB`, never synced.
  - [ ] "Rotate vault" flow for device revocation: new DEK, re-wrap for
        password/recovery/remaining trusted devices, re-encrypt every
        row.
  - [ ] **Verify**: screenshot the unlock and quick-unlock UI; manually
        test the revocation flow end-to-end (simulate a second device,
        rotate, confirm its cached unlock no longer works).
- [ ] **3.5.7 — Backfill & cleanup.**
  - [ ] Backfill tooling for any pre-existing plaintext rows, including
        today's `AI_KEYS_ENCRYPTION_KEY`-wrapped provider keys (users
        re-save their key once to move it under the vault).
  - [ ] Remove dead server-side plaintext code paths, including
        `AI_KEYS_ENCRYPTION_KEY` and `src/lib/ai/crypto.ts`'s
        server-secret path, once every consumer has migrated.
  - [ ] Security review + a fresh Supabase advisor pass on every new
        private-schema table.
- [ ] **3.5.8 — Rollout & documentation.**
  - [ ] Flip this doc's Status line from "design only" once shipped.
  - [ ] Mark Phase 3.5 in `docs/phase-3-ai-assistant-plan.md`.
  - [ ] Update the financeos skill's roadmap section (Phase 3 entry) to
        note E2EE is live.

## Open questions (need a decision, not defaulted)

- **Decided, but needs a UI decision to match**: the relay's per-request,
  no-persistence server touch of the plaintext key is the accepted
  reading of "not even me" for the AI keys. What's not yet decided is
  *how* this gets surfaced to the user — e.g. a one-time note in Settings
  → AI & Integrations explaining that asking the assistant a question
  means your key transits the server for that single call (never stored,
  never logged), versus staying silent about it. Leaning toward
  surfacing it — "not even me" should be a claim the user can audit, not
  one they have to trust blindly.
- Encrypt entity *names* (goal/loan/investment/account) or leave them
  plaintext for easier debugging/support — current default above is
  encrypt them too, but that's a judgment call worth confirming.
- Per-provider CORS support (DeepSeek now, OpenAI/Gemini/Claude later) —
  no longer blocking (the relay doesn't need it), but worth checking
  later purely as an optimization; see 3.5.2.

## Explicitly out of scope for Phase 3.5

- Hiding row existence/counts/timestamps (see Non-goals).
- Protecting against a compromised client/endpoint.
- Anything in Phase 4 (SMS/bank/email import) or Phase 5 (native mobile)
  — those inherit this design once it lands but aren't being designed
  here. Native mobile is a particularly good fit later: iOS Keychain /
  Android Keystore give the quick-unlock layer real hardware backing for
  free.
