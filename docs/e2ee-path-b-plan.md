# Phase 3.5 — End-to-end encryption ("not even me") plan

**Roadmap position**: a sub-phase of **Phase 3** (AI Assistant / BYOK) in
the financeos roadmap — see `docs/phase-3-ai-assistant-plan.md`, which
points here. Internally numbered **3.5.0–3.5.9** below, following the same
`3.x` convention that doc uses for its own sub-phases. Also referred to as
"Path B" earlier in the design discussion that produced this doc.

Status: **live for 3.5.0–3.5.7.** Vault infrastructure, the transient
AI-key relay, every finance table's client-side field encryption (income
through recurring rules and AI provider keys), the passphrase/recovery-
code/quick-unlock/vault-rotation UX, and automatic backfill of
pre-migration plaintext rows are all shipped and running against the live
database. **3.5.9 (the actual MCP server: tool handlers, transport,
`get_capabilities`) is not started** — the token infrastructure landed
early alongside 3.5.1, but building the tools themselves is on hold
pending a locked decision on write access and scope granularity (see
"Still open" below). This section (3.5.8) is the rollout/documentation
pass tying 3.5.0–3.5.7 off; 3.5.9 remains open work.

This was deliberately a different, stronger bar than the AI provider key
encryption Phase 3 originally shipped with — envelope encryption under a
server-held key (`AI_KEYS_ENCRYPTION_KEY`), real protection against a
DB-level leak, but decryptable by anyone with server access. Phase 3.5.2
migrated `private.ai_provider_keys` to the vault DEK instead, and 3.5.7
deleted the now-dead `src/lib/ai/crypto.ts`/`AI_KEYS_ENCRYPTION_KEY` path
entirely — every table in scope now removes the server (and its operator)
from the trust boundary, not just this one.

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
8. **Connecting an agent (MCP).** In Settings → Agent Access you mint a
   named token ("Claude Desktop," "budget-check automation") — shown
   once, same beat as the recovery code. That token isn't just a login: it
   opens its *own* copy of your vault, so an agent holding it can ask
   real questions ("what's left in groceries this week?") without you
   having the app open. That's a deliberate, disclosed trade — a lost or
   stolen token is a lost or stolen key to your data, not just a login you
   can shrug off, so it's scoped and revocable independently of your
   password and recovery code, and you should treat minting one with the
   same weight as writing down the recovery code.

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
- **Decision (locked): mandatory per module, not an opt-in toggle.** There
  is no setting to "use the app without encryption." Once a table
  migrates (3.5.3 onward), its sensitive columns become ciphertext-only —
  `numeric(14,2)`/plain `text` becomes `text` holding an AES-GCM blob, for
  every row, for every user. There's no dual-mode where some users' rows
  stay plaintext in the same table. Practically: touching a migrated
  module (e.g. Transactions) with no vault set up is what triggers the
  forced "set up your Vault" prompt from the walkthrough above — not a
  choice offered alongside a "skip encryption" path. Existing users with
  pre-migration plaintext rows don't get to opt out either; 3.5.7's
  backfill re-encrypts their existing data the first time they touch the
  now-migrated module. The only real "opt-out" is not using the app's
  encrypted modules at all, the same way there's no way to use Finance OS
  without RLS scoping your rows to your own account.

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
- ⚠️ **A leaked MCP agent token** — see "MCP agent access" below. Unlike
  the vault passphrase (never transmitted) or the AI relay (transient,
  once, per user-initiated request), an MCP token is a *standing* bearer
  secret that lives in an agent's config on disk and transits the network
  on every tool call. This is a deliberate, disclosed, user-opt-in
  exception to "not even me" — not a gap in the design, but its blast
  radius is real and worth naming here alongside the things this doc does
  defend against.

## Key architecture — vault key pattern

Directly deriving an AES key from the user's password and using it to
encrypt every row is the naive approach and it's wrong: rotating the
password would require re-encrypting every row. Instead, use the standard
two-layer scheme (Bitwarden/1Password shape):

1. **KEK (key-encryption key)** — derived client-side from the user's
   secret via Argon2id (WebCrypto doesn't ship Argon2 natively; use a WASM
   build — **decision (locked): `hash-wasm`**, over `argon2-browser`: more
   actively maintained, TypeScript-native, SIMD-optimized, and already
   covers other primitives this plan needs (HKDF for the MCP token KEK
   below) so it's one dependency instead of two) with a random per-user
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
- **Quick-unlock (decided): a device-local 4-digit PIN for v1 — no
  biometric/WebAuthn yet**, modeled on how crypto wallets do it. A
  wallet's seed phrase is the real, portable secret; its PIN only unlocks
  an already-decrypted copy cached in that device's own local storage —
  it's never the thing protecting funds against a stolen database,
  because there is no server-side database of wrapped keys to defend
  against. Applied here:
  - After a normal full-passphrase unlock, the user can opt in to "Quick
    unlock on this device." The app re-wraps the DEK under a
    PIN-derived key and stores that wrapped copy **only in local
    `IndexedDB` on that device** — it never touches the server.
  - **Decision (locked): attempt-throttled.** A 4-digit PIN is only
    10,000 combinations, weak on its own against someone with brief
    physical access to the device — after a set number of wrong attempts
    (e.g. 5–10), the app wipes the local wrapped-PIN copy from
    `IndexedDB`, forcing a fallback to the full passphrase or recovery
    key. This is a local, client-side counter (there's no server to
    enforce it against), reset on a successful unlock.
  - A new device, or a cleared/wiped local cache, always falls back to
    the full passphrase or recovery key — the PIN grants nothing across
    devices, by design.
  - **WebAuthn/biometric quick-unlock is explicitly deferred, not built
    in v1** — see "Explicitly out of scope for Phase 3.5" below. The PIN
    re-wrap mechanism is designed so swapping in a WebAuthn-derived key
    later is additive (a second local wrap), not a rework.
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
  cached copy of the *old* DEK becomes useless. With PIN-only
  quick-unlock in v1 (no WebAuthn yet), this is the *only* remedy for a
  lost device with quick-unlock enabled — there's no hardware-backed key
  to fall back on to lower how often it's needed, which is a real cost of
  deferring WebAuthn, worth remembering if it starts happening often in
  practice.
- **Total lockout ("reset account", built ad hoc, not a numbered
  sub-phase):** a real user hit this — vault set up on a device they no
  longer have access to, the passphrase retyped elsewhere didn't match
  (near-certainly a silent byte-level mismatch: no Unicode normalization
  happens anywhere in this stack, confirmed by reading both `vault/
  crypto.ts` and hash-wasm's own `getUInt8Buffer`, so a passphrase with
  any accent/quote/dash that a different keyboard represents differently
  fails outright even though it looks identical), and the recovery code
  wasn't available either. This is exactly the scenario "not even me"
  says has no recovery path — confirmed by direct inspection: the
  `vault_keys` row was intact and never touched by rotation, so it
  genuinely was unrecoverable, not a bug. **"Reset account"** (Settings →
  Danger Zone, `vault/reset-actions.ts` + `components/settings/
  reset-account-settings.tsx`) is the honest way out: type-to-confirm
  dialog, then deletes every row this account owns across every
  vault-DEK-encrypted table (permanently undecryptable garbage anyway,
  once the wrapping DEK is unreachable — this doesn't destroy anything
  still readable) plus the vault credentials and MCP tokens, landing back
  at "no vault set up" for a real fresh start. Deliberately leaves
  `accounts`/`categories`/the `auth.users` row/profile alone — none of
  those were ever vault-encrypted, so a lost passphrase doesn't touch
  them, and a brand-new signup already re-seeds categories. Works
  regardless of vault lock state (scoped by the authenticated session's
  `userId` only, never needs the DEK) since that's precisely the state
  it exists to get someone out of.

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
little sensitivity alone. **Decision (locked): encrypt names too**
(goal/loan/investment/account) — no plaintext carve-out for Supabase
dashboard/tooling debuggability. Losing "New Car Fund" / "Home Loan"
labels in raw DB tooling is accepted as the point, not a cost; debugging
against real account data happens by borrowing the account owner's own
vault credential through the normal unlock flow, not by leaving fields
readable at rest.

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

- `dashboard`, `budget`, `analytics`, `net-worth`, `reports`,
  `financial-score`, `notifications`, `transactions` — **done as of
  3.5.3**, converted alongside encrypting `income`/`expenses` rather than
  as a separate later pass, once tracing consumers showed they couldn't
  be decoupled. `goals`, `loans`, `investments`, `calendar`, `recurring` —
  still server components, convert each as its table lands in 3.5.4. All
  fetch **ciphertext** (still RLS-scoped, still per-user) and decrypt +
  run the finance engines in the browser instead of server-side.
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
  misbehave"). **Decision (locked): stays silent** — no Settings-UI
  disclosure copy about the transient server touch. This is a deliberate
  product call, made with the trade-off (this doc's own earlier leaning
  was toward surfacing it, since "not even me" is easier to audit when
  disclosed) understood and overridden, not defaulted past.
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

## Resolved: MCP agent access (a third, disclosed unlock path)

MCP support (agents like Claude reading/acting on a user's finance data)
runs into the exact same wall the AI Assistant hit: an MCP server is just
another server-side caller, and under Path B the server holds no
decryptable data. An MCP *auth* token alone doesn't fix this — a bearer
token proves "this caller may act as user X," it doesn't hand back
plaintext. Two shapes were on the table:

- **Metadata/computed-only MCP** — tools never touch encrypted columns
  (dates, kinds, currency, counts, category names if left plaintext).
  Works headless, survives 3.5 unchanged, no new crypto. Ships now,
  independent of everything below.
- **Vault-gated relay MCP** — same shape as the AI relay: tool calls only
  work while the calling context shares the user's already-unlocked
  vault. Honors "not even me" fully, but the agent goes dark the moment
  the user's device locks — no headless "check my budget at 2am."

**Decision (locked): go further than either — the MCP token itself is a
third unlock path for the DEK**, so agents get real financial data without
needing a live, unlocked browser session at call time. Mechanically this
is the *same primitive* the recovery key already uses (wrap the same DEK
under one more independently-derived KEK), not a new kind of secret:

- At token creation (Settings → Agent Access), the client generates a
  random 256-bit token client-side, derives a KEK from it via HKDF (no
  Argon2id needed here — unlike the vault passphrase or a PIN, the token
  is already full-entropy, so a slow human-secret KDF buys nothing), and
  wraps the **current DEK** under that KEK. The wrapped blob is stored
  server-side in a new private-schema table, alongside a *hash* of the
  token for lookup — never the raw token.
- The raw token is shown to the user **once**, to copy into the agent's
  config (e.g., Claude Desktop's MCP config) — the same "shown once,
  acknowledge you saved it" beat as the recovery code.
- On each MCP tool call, the Route Handler receives the token, hashes it
  to look up the row, derives the KEK from the *raw* token (sent on every
  call, per how bearer auth works — this is the standing exposure named
  in the Threat model section above), unwraps the DEK **in server memory
  for that request only**, decrypts whatever the tool needs, and forgets
  the key when the request ends. Same "transient, never persisted"
  discipline as the AI relay, applied to a token that itself is
  standing rather than transient.
- **Independent revocation.** Deleting a token's row invalidates that
  unlock path immediately without touching the password- or
  recovery-wrapped DEK, and without a full vault rotation — unlike device
  revocation (which re-encrypts everything because a device may have
  cached raw key material), a revoked MCP token was never anything but a
  wrapped blob the server can simply stop honoring.
- **Scoping.** Each token gets an explicit scope at creation (e.g.
  read-only summary data vs. full transaction detail vs. read+write) —
  no all-or-nothing default. A budget-check automation and a
  full-access assistant should not be able to mint the same token.
- **Expiry.** **Decision (locked): user picks the duration at creation
  (Jira/GitHub-PAT style presets — e.g. 7/30/90/365 days), but "no
  expiry" is not offered — a hard maximum (e.g. 365 days) applies
  regardless of what's picked.** A token that's leaked and never noticed
  must still eventually stop working on its own; re-mint is the only path
  past the cap, never silent renewal. This narrows the standing-risk
  window that makes this path weaker than the transient AI relay.
- **Client target is broad and untrusted for storage purposes:** Cursor,
  Claude Code, Claude Desktop, and other MCP clients, not one controlled
  integration. The threat model must assume the token sits in a
  plaintext config file on disk (worst case), not an OS keychain (best
  case) — see the Threat model section above.
- **Cross-client response compatibility (confirmed, not hypothetical —
  matches a real issue already hit building this app's AI features):**
  Claude Code and Claude Desktop currently read only `content[].text` and
  can drop or ignore `structuredContent`; Cursor does the opposite and
  prioritizes `structuredContent`. Per the MCP spec's own backward-
  compatibility guidance, every tool response **must** include the
  serialized JSON as a `TextContent` block in `content`, with
  `structuredContent` included alongside as a bonus for clients that use
  it — never `structuredContent`-only. This applies to every MCP tool
  built under 3.5.9 and 3.5.9's headless metadata tools alike.
- **A `get_capabilities` (or similarly named) tool** — not a resource,
  since tool support is the one primitive every target client reliably
  has — returns a description of what the MCP server can do (available
  tools, their scopes, what data each needs unlocked) so a connecting
  agent can self-orient, the same role a `SKILL.md` plays for Claude
  Code. Ship this alongside the first batch of headless metadata tools;
  it needs no vault access itself.

**What this does and doesn't buy.** It closes the "agent needs the browser
open" gap the vault-gated relay can't, at the honest cost of a standing
secret that, if stolen from wherever the agent stores it, decrypts
everything that token is scoped to until revoked — a materially different
risk shape than the vault passphrase or the transient AI-key relay, and it
must be disclosed to the user in exactly those terms at token-creation
time (mirroring the AI relay's Settings-UI disclosure decision above), not
folded into generic "connect an agent" copy.

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
- **MCP token as auth-only, no decryption capability** — the token proves
  identity, tools only ever return metadata/computed summaries the client
  already decrypted and chose to expose. Cleanest fit with "not even me,"
  ships fastest, no new crypto — but agents can't answer real financial
  questions unless the user's browser is open and forwarding data, which
  defeats the point of a headless agent integration. Rejected as the
  *only* tier; kept as the always-available fallback tier alongside the
  vault-gated token (see "Resolved: MCP agent access" above).
- **Vault-gated relay only, no third DEK wrap** — agents can only act
  while the user's vault happens to be unlocked at that moment (matches
  the AI relay's transient model exactly). Strongest security bar of the
  three, but functionally close to useless for the "check my budget
  overnight" use case that motivates wanting an agent at all. Rejected as
  insufficient for the stated MCP goal, though its transient-only
  discipline is exactly what the AI relay keeps for vendor keys, where
  headless access was never a requirement.

## Build phases

- [ ] **3.5.0 — Design & product decisions (this doc).**
  - [x] Threat model, key architecture (KEK/DEK), scope table.
  - [x] AI provider keys folded into scope; transient relay locked in as
        the mechanism over a pure client-side call.
  - [x] Device-local quick-unlock (wallet-style PIN/biometric) and the
        multi-device/revocation model decided.
  - [ ] Final gate: walk the "Open questions" list below to zero before
        3.5.1 starts.
- [x] **3.5.1 — Vault key infrastructure.** Landed, with two scope notes
      below — not a full close-out.
  - [x] WebCrypto helpers (`src/lib/vault/crypto.ts`): Argon2id KEK
        derivation via `hash-wasm` (passphrase/PIN), native HKDF KEK
        derivation (recovery key/MCP token — see the library pick above),
        AES-256-GCM DEK wrap/unwrap and field encrypt/decrypt, Crockford
        Base32 recovery-code/token encoding. Client-side only
        (`import "client-only"`), mirroring `src/lib/ai/crypto.ts`'s
        payload shape.
  - [x] `private.vault_keys` (`userId`, `wrappedDekByPassword`,
        `passwordKekSalt`, `passwordKdfParams`, `wrappedDekByRecovery`,
        `recoveryKekSalt`, `recoveryAcknowledgedAt`, `...audit`) and
        `private.mcp_agent_tokens` (the 3.5.9 table, built alongside since
        the schema work is shared) — `drizzle/0007_worried_hitman.sql` +
        RLS/PostgREST-revokes in
        `drizzle/manual/0007_vault_and_mcp_tokens_rls.sql`, mirroring
        `ai_provider_keys`. **Applied to the live Supabase project** —
        both tables confirmed present with RLS enabled via the Supabase
        MCP (`list_tables`), and `get_advisors` shows no new security
        lints from either table.
  - [x] Server Actions/queries (`src/lib/vault/actions.ts`,
        `src/lib/vault/queries.ts`): `setupVault`, `rotateVaultSecret`,
        `getVaultBlob`, `getVaultSetupStatus` — every input/output is
        ciphertext, a salt, KDF params, or a token hash; no server-side
        "read plaintext" path exists.
  - [x] Settings → "Vault & Encryption" card: first-time setup (with the
        mandatory shown-once recovery code + confirm checkbox) and
        passphrase rotation. **Scope note**: doesn't yet show an ongoing
        "recovery-key acknowledged" status indicator post-setup — small
        polish item, not a functional gap.
  - [x] Unlock UI + in-memory DEK store (`src/lib/vault/store.ts`, plain
        zustand `create`, no `persist` middleware). **Scope note**: this
        is the unlock flow embedded in the Settings card, not a global
        prompt gating every route — deliberately deferred, since no page
        actually has encrypted data yet (that's 3.5.3+); building a
        global gate now would be gating nothing. Settings itself already
        forces a real test of the flow, since minting an MCP token
        requires an unwrapped DEK.
  - [x] **Verify**: `npm run build` + `npm run lint` pass. The full
        client-side crypto pipeline (Argon2id, HKDF, AES-GCM wrap,
        recovery-code generation) was exercised end-to-end in a real
        browser and screenshotted at 390px and desktop, via a throwaway
        preview route (not committed) since this sandbox has no Supabase
        *auth* credentials to log in and drive the real `/settings` page
        end to end. The migration itself is applied and confirmed live
        (see above); the full round-trip through a real authenticated
        session (`setupVault` actually persisting, then unlocking on a
        second load) is still unverified — needs a real login, which
        this sandbox can't do.
- [x] **3.5.2 — Pilot: migrate `private.ai_provider_keys` to
      vault-wrapped storage.** Smallest table, already isolated, already
      has its own encrypt/decrypt helper to model the client-side version
      from — and it's the specific thing that prompted locking in "not
      even me" instead of the server-secret model. Landed; one item below
      (the live end-to-end vendor call) is unverified — see the note.
  - [x] `saveProviderKey` now takes an already-tested, already-DEK-
        encrypted payload (`src/components/settings/ai-provider-settings.tsx`
        encrypts client-side via `encryptField` before calling it) —
        server persists ciphertext only, no server-side `adapter.testKey()`
        or `encryptSecret()` call remains in the save path.
        `testProviderKey` needed **no change** — it already only ever
        handled freshly-typed plaintext from the form, never a stored key,
        so it already satisfied the transient/no-persist property.
  - [x] Transient-relay Route Handler built: `src/app/api/v1/ai/ask/
        route.ts` for Ask, and `src/app/api/v1/ai/extract/route.ts`
        extended to accept the same relayed `{apiKey, provider, model}`
        for Smart Entry. `chatWithActiveProvider` (`src/lib/ai/
        resolver.ts`) is retired in favor of `chatWithProvider(apiKey,
        providerId, model, messages, options)` — a thin pass-through to
        the adapter, no DB access, keeping the "one chokepoint" rule from
        AGENTS.md intact. Both callers — Ask and Smart Entry extraction
        (`src/lib/ai/smart-entry/extract.ts`) — go through it. `askAssistant`
        (the old Server Action) is removed; the decrypt-then-relay
        sequence it would have needed can't run inside a Server Action
        reached via a plain form, so `ai-assistant-view.tsx` now calls the
        route directly. New shared client helper:
        `src/lib/ai/client-key.ts`'s `resolveActiveKey(dek)` (fetch
        ciphertext via `getActiveProviderKeyBlob`, decrypt with
        `decryptField`) — used by both Ask and Extract so the sequence
        isn't duplicated, and it surfaces a friendly "re-save your key"
        error rather than a raw decrypt exception for keys saved before
        this landed.
  - [ ] (Optional, non-blocking) Confirm per-provider whether a pure
        client-to-vendor call is possible (CORS), as a future
        optimization that skips the relay entirely for that provider. Not
        attempted.
  - [x] **Verify**: `npm run build` + `npm run lint` pass. Browser-exercised
        (throwaway preview route, removed before commit) with a simulated
        unlocked vault: Save ran real client-side `encryptField`, then hit
        a graceful "Database isn't configured" error; Ask and Extract both
        ran `resolveActiveKey` and hit the same graceful error — zero
        console/page errors across all three. **Not verified**: an actual
        end-to-end vendor call (save → ask → get a real answer) — this
        sandbox has no Supabase auth session and no real vendor API key to
        drive that with. Confirmed via the Supabase MCP that the one live
        row (`private.ai_provider_keys`, DeepSeek, created before this
        change) is still server-secret-encrypted — it will hit the
        "couldn't decrypt, re-save it" path the first time it's used,
        exactly the expected/flagged consequence of this migration, not a
        bug to fix here.
- [x] **3.5.3 — `income`/`expenses` encrypted, and every consumer migrated
      to client-side decrypt+compute.** Scope grew from the original "pilot
      on Transactions + one dashboard tile" plan: tracing every consumer of
      `income`/`expenses` found that `getBudgetsData`/`getAnalyticsData`
      alone feed Budget, Analytics, Dashboard, Net Worth, Reports,
      Financial Score, Notifications, the AI Assistant's context, and
      Smart Entry's reference data — encrypting the two tables without
      migrating all of them would have broken every one of those pages
      immediately, not later. Decision (made in-session, not
      pre-planned): migrate every consumer now rather than ship a
      narrower slice with known breakage. This absorbs most of what 3.5.5
      would have done, for these two tables specifically — see the
      updated 3.5.4/3.5.5 scope below.
  - [x] `income.amount`, `expenses.amount`, `expenses.description` (already
        `text`, now holds ciphertext), `expenses.note`, `expenses.tags`
        (was `text[]`, now `text` holding an encrypted JSON-serialized
        array) — `drizzle/0008_lyrical_doctor_octopus.sql`, hand-patched
        with `USING` clauses (drizzle-kit's generated SQL lacked them;
        Postgres has no implicit `numeric`→`text` or `text[]`→`text`
        cast). Applied to the live project. The 5 existing rows (2
        income, 3 expense — test-scale, confirmed via the Supabase MCP
        before applying) are now unreadable non-ciphertext strings, same
        accepted consequence as the 3.5.2 AI-key migration.
  - [x] Single-column packing: `packPayload`/`unpackPayload`/
        `encryptPacked`/`decryptPacked` added to `src/lib/vault/crypto.ts`
        (`iv:ciphertext` in one `text` column, not two, since finance
        rows have several encrypted fields each). Verified end-to-end in
        a real browser: amount, unicode description, a JSON tag array,
        and a wrong-DEK decrypt correctly failing — all passed.
  - [x] New shared client-side data layer: `src/lib/finance/raw-data.ts`
        (one Server Action fetching ciphertext income/expense rows plus
        every non-encrypted supporting row — budgets config, active
        goals, loans, investment contributions — since once the fetch
        boundary moves client-side, *everything* the compute needs has
        to be reachable from there, secret or not), `src/lib/finance/
        decrypt.ts` (fault-tolerant per-row decrypt — a row that fails
        doesn't take down the list, see `DecryptResult`), and
        `src/lib/finance/use-finance-data.ts` / `use-side-data.ts`
        (TanStack Query hooks — first real use of the already-provisioned
        but previously-unused `@tanstack/react-query`, so pages share one
        cached fetch+decrypt+compute instead of each re-doing it).
  - [x] `getBudgetsData`/`getAnalyticsData`/`getTransactions` (all
        deleted) → pure `computeBudgetsData`/`computeAnalyticsData`/
        `computeTransactionsList` (`src/lib/budgets/compute.ts`,
        `src/lib/analytics/compute.ts`, `src/lib/transactions/
        compute.ts`) — identical aggregation math, just taking
        already-decrypted rows instead of fetching+computing together.
        Same split applied to `getDashboardData`, `getNetWorthData`
        (→ `buildNetWorth` extracted to `src/lib/networth/compute.ts`),
        `getReportsData`, `getScoreData`, `getNotificationsData` — all
        deleted as `queries.ts` I/O functions, replaced by pure
        `compute.ts` counterparts plus thin Server Action wrappers
        (`src/lib/finance/side-data.ts`) for the non-encrypted rows they
        still need (goals/loans/investments/recurring/snapshots/calendar).
  - [x] Every one of those pages (Transactions, Dashboard, Budget,
        Analytics, Net Worth, Reports, Financial Score, Notifications)
        now has a client `Authed*` wrapper component that unlocks,
        fetches, decrypts, computes, and shows a locked/loading/error
        state — `src/components/finance/vault-gate.tsx` is the shared
        boilerplate for the single-query pages; the multi-query pages
        (Dashboard, Notifications) inline the same three states since
        `VaultGate` was built for one query.
  - [x] Write path: `transactions/actions.ts`'s `createTransaction`/
        `updateTransaction` now take pre-encrypted ciphertext instead of
        FormData with plaintext amount — amount/length validation moved
        client-side (`transactionInputSchema`, unchanged, just run
        earlier) since the server can no longer inspect a value it can't
        read. `transaction-form.tsx` itself didn't need to change — the
        create/update actions it binds to `useActionState` are just
        function props, so the encrypt-then-call wrapping
        (`src/lib/transactions/client-actions.ts`) happens entirely at
        the call site, invisible to the form. Guest mode (IndexedDB, no
        vault) is untouched — same FormData-shaped action props, just a
        different function behind them.
  - [x] CSV import (`src/lib/import/actions.ts` +
        `src/lib/import/client-actions.ts`): dedupe-against-DB moved
        entirely client-side (fetch ciphertext rows in range, decrypt,
        run the *same* pure `dedupeKey`/`buildPreview` from
        `pipeline.ts` — unchanged, per the pipeline's own "pure, no I/O"
        design), and `commitImport` now receives pre-encrypted rows. One
        real behavior change, unavoidable: the server-side commit-time
        re-validation pass against a *fresh* DB read (defense in depth
        against a stale client-side preview) is gone — the server
        can't re-derive dedupe keys from ciphertext, so it now trusts
        the client's already-computed preview. Flagged, not hidden.
  - [x] AI Assistant context (`src/lib/ai/context.ts`) — `buildFinanceContext`
        is now a pure function called client-side
        (`ai-assistant-view.tsx`) and sent to `/api/v1/ai/ask` as an
        optional `context` field, same transient-relay shape as the
        vendor key itself. Smart Entry's reference data
        (`loadReferenceData`) no longer includes transactions at all —
        `description`/`amount` are encrypted, so there's nothing
        plaintext left to build a match label from; category/account/
        investment/loan/goal/recurring/budget matching is unaffected.
  - [x] **Scope cut, not a bug**: Smart Entry's four `transaction.*`
        capabilities (add income, add expense, edit, delete) are
        **removed**, not disabled. `transaction.edit`/`.delete` already
        degrade gracefully (their reference lookup can never match now
        that `ref.transactions` is empty), but `transaction.expense`/
        `.income` had no such gate and would have called the
        now-incompatible `createTransaction` directly from the
        server-only `/api/v1/ai/commit` path — which has no DEK to
        encrypt with. Properly supporting them needs commit.ts's
        independent re-validation (`def.schema.safeParse`, the "never
        trust fields" defense-in-depth check) to stop needing a real
        plaintext amount post-encryption — a genuine redesign of that
        trust boundary, not attempted here. Adding/editing/deleting a
        transaction still works normally through the Transactions page
        itself; only the natural-language Smart Entry shortcut for
        transactions specifically is gone. Every other capability
        (budgets, goals, loans, investments, recurring rules) is
        unaffected.
  - [x] **Verify**: `npm run build` + `npm run lint` pass. Browser-verified
        the crypto round-trip (amount, unicode description, tag array,
        pack/unpack shape, wrong-DEK rejection — all passed) and the
        Transactions create flow with a simulated unlocked vault via a
        throwaway preview route (removed before commit). Confirmed via
        the Supabase MCP that `income.amount`/`expenses.amount`/
        `expenses.tags` are now `text` in the live project, RLS still
        enabled on both tables, no new security advisories. **Not
        verified**: a real end-to-end session (real login, real data) —
        this sandbox has no Supabase auth credentials to drive that with,
        same limitation as every phase so far.
- [ ] **3.5.4 — Roll the pattern out** to the remaining finance tables,
      module by module, following the skill's "Add a new feature module"
      shape for each. Each one likely repeats 3.5.3's real lesson: trace
      every consumer before assuming a table can be migrated in isolation —
      `raw-data.ts`/`side-data.ts`/the `use*Data` hooks already built are
      the place to extend, not a new parallel fetch layer per table.
  - [x] `notifications.body` — done. Chosen first because it's uniquely
        low-risk: one consumer file, write-only (the live list is always
        recomputed fresh by `computeNotificationsData`;
        `fetchNotificationStateAction` only ever reads back
        `dedupe_key`/`is_read`/`is_dismissed`, confirmed by re-reading
        `compute.ts` — `state` is never destructured for `body`), and the
        column was already `text` so no schema/migration was needed at
        all — purely an application-layer write-path change. `title`
        stays plaintext (app-generated, low sensitivity, matches the
        locked decision above); `body` is packed-encrypted client-side via
        a new `src/lib/notifications/client-actions.ts`
        (`encryptedMarkNotificationRead`/`encryptedDismissNotification`/
        `encryptedMarkAllNotificationsRead`), mirroring the
        `transactions/client-actions.ts` shape from 3.5.3.
        `notifications-view.tsx` now takes `dek: CryptoKey` as a required
        prop from `authed-notifications.tsx` (which already gated
        rendering on `dek` being non-null). Widened `body`'s Zod max from
        500 to 4000 in `notifications/actions.ts` — packed ciphertext
        (iv + base64 ciphertext + delimiter) runs well past the
        plaintext's own length. **Verified**: `npm run build` and
        `npm run lint` both clean. **Not verified**: a real browser
        session — this sandbox still has no Supabase auth credentials,
        same limitation as every phase so far.
  - [x] `budgets.amount` — done. Migration `encrypt_budgets_amount_column`
        applied to the live project (`numeric(14,2)` → `text`, `USING
        amount::text`); Drizzle schema/migration committed as
        `drizzle/0009_nebulous_serpent_society.sql`. Read path: `raw-data.ts`
        now returns `amount` as packed ciphertext on `RawBudgetRow`; a new
        `decryptBudgetRows()` in `finance/decrypt.ts` (same
        `Promise.allSettled` fault-tolerance as income/expenses) feeds
        `computeBudgetsData()`, which now takes decrypted budget rows as an
        explicit parameter instead of reading `raw.budgets` itself — the only
        call site was `useFinanceData()`. Write path: `budget-form.tsx` now
        requires a `dek: CryptoKey` prop (threaded from
        `authed-budgets-view.tsx` → `budgets-view.tsx`, matching the
        `AuthedTransactionsView` pattern) and binds new
        `encryptedCreateBudget`/`encryptedUpdateBudget` wrappers in a new
        `src/lib/budgets/client-actions.ts`, mirroring
        `transactions/client-actions.ts`; `budgets/actions.ts`'s
        `createBudget`/`updateBudget` now take a typed
        `EncryptedBudgetInput` object instead of `(prevState, formData)`
        directly (no longer bindable straight to `useActionState`).
        `budgets-view.tsx` gained the same "N budgets couldn't be read"
        decrypt-failure banner as Transactions
        (`FinanceData.failedBudgetCount`).
        **Scope cut**: removed the `budget.create`/`budget.edit` Smart
        Entry capabilities from `ai/capabilities/definitions.ts` (and the
        now-dead `fetchCurrentBudget` helper from `shared.ts`) — same
        reasoning as the `transaction.*` removal in 3.5.3: their
        `execute()` runs server-side via `/api/v1/ai/commit` with no DEK to
        encrypt an amount with. `budget.delete` is untouched (no amount
        involved). Creating/editing a budget still works normally through
        the Budget page. **Verified**: `npm run build`/`npm run lint`
        clean; migration applied via Supabase MCP, `get_advisors` shows no
        new findings. **Not verified**: a real browser session, same
        sandbox limitation as every phase so far.
  - [x] `goals.targetAmount`/`currentAmount`/`monthlyContribution` — done.
        The biggest sub-item so far: unlike budgets, `goals` fed a *second*,
        separate root query (`raw-data.ts`'s `activeGoals`, for safe-to-spend
        + health score) on top of the Goals page's own full-list query, and
        the Goals page itself was still a server component (`getGoalsData()`
        computed projections server-side). Migration
        `encrypt_goals_amount_columns` applied live (`numeric` → `text` × 3,
        `USING <col>::text`, dropped the stale `current_amount` default).
        **Read path**: `goals/queries.ts`'s `fetchGoalsRaw()` now returns
        ciphertext only (no more server-side `computeGoalProjection`/sort/
        totals); new `src/lib/goals/compute.ts`'s `computeGoalsData()` is
        the pure client-callable replacement (mirrors `budgets/compute.ts`).
        New `decryptGoalRows()`/`decryptActiveGoals()` in `finance/
        decrypt.ts` (the latter for the narrower `activeGoals` shape).
        `computeBudgetsData`/`computeAnalyticsData` now take decrypted
        active-goals as an explicit param instead of `raw.activeGoals`.
        `side-data.ts`'s `fetchGoalsDataAction()` now returns raw rows;
        `use-side-data.ts` gained a `dek`/`currency` param and decrypts+
        computes goals itself (loans/investments/recurring/snapshots stay
        server-computed — not encrypted yet), exposing `failedGoalCount`.
        `authed-notifications.tsx` had its own separate parallel goals fetch
        (missed on a first pass, caught by tracing every consumer per the
        3.5.3 lesson) — updated the same way inline.
        **Write path**: `goal-form.tsx`/`contribution-form.tsx` now require
        a `dek: CryptoKey` prop (threaded from a new
        `authed-goals-view.tsx`, replacing the server-component
        `goals/page.tsx`); new `src/lib/goals/client-actions.ts` mirrors
        `budgets/client-actions.ts`. `createGoal`/`updateGoal` now take a
        typed `EncryptedGoalInput`; `status` (`active`/`completed`) is now
        derived client-side before encrypting, since the server can no
        longer compare two ciphertext amounts to derive it itself.
        **Hardest piece**: `addContribution` used to be a server-side
        read-modify-write (`SELECT current_amount` → add the contribution →
        `UPDATE`) — impossible once `current_amount` is ciphertext the
        server can't read. Redesigned so the client (which already has the
        goal's decrypted `currentAmount`/`targetAmount` on-screen) computes
        the new running total and status itself, encrypts the total, and
        sends both to the server as a trusted write (`goal_contributions.
        amount` itself stays plaintext and server-validated — that table
        isn't encrypted until its own turn in this list).
        **Known tradeoff, documented not hidden**: this trades the
        database's atomic increment for a client-computed one — two
        concurrent contributions to the same goal (e.g. two open tabs)
        could race and one clobber the other's total. Accepted for a
        single-user app; would need revisiting for the shared-accounts
        Phase 4 feature.
        `net_worth/actions.ts`'s `captureSnapshot()` used to call
        `getGoalsData()` directly server-side for the "Goal savings" net
        worth component — now takes `goalsSavedTotal` as a parameter,
        supplied by the client (`authed-networth.tsx` already has it
        decrypted via `useSideData`); investments/loans still fetch
        server-side there since they're not encrypted yet.
        **Scope cut**: removed `goal.create`/`goal.edit`/`goal.contribution`
        Smart Entry capabilities (and the now-dead `fetchCurrentGoal`
        helper, and the `monthly_contribution`-based `typicalAmount` in
        `loadReferenceData()`'s goals reference) — same reasoning as
        budgets, with `goal.contribution` additionally blocked by needing
        the goal's current decrypted amount server-side to compute a new
        total, which is exactly what's no longer possible.
        `goal.delete` is untouched. **Verified**: `npm run build`/
        `npm run lint` clean; migration applied via Supabase MCP,
        `get_advisors` shows no new findings. **Not verified**: a real
        browser session, same sandbox limitation as every phase so far.
  - [x] `loans.principal`/`emi`/`remainingAmount`/`extraEmi` — done. Wider
        blast radius than goals: loans fed the Loans page (server
        component, same pre-conversion shape goals had), a second raw feed
        in `raw-data.ts` for safe-to-spend/health score, *and* the bill
        calendar — `calendar/queries.ts`'s `getBillCalendarData()` and the
        dead `getUpcomingBills()` (deleted, zero callers — confirmed before
        touching it) both called `getLoansData()` directly server-side to
        build EMI occurrences. `interestRate`/`remainingMonths` stay
        plaintext per the locked scope; migration
        `encrypt_loans_amount_columns` applied live (`numeric` → `text` ×
        4, `USING <col>::text`).
        **Read path**: `loans/queries.ts`'s `fetchLoansRaw()` returns
        ciphertext only — the old DB-level `ORDER BY remaining_amount` is
        gone too (a ciphertext column sorts meaninglessly), moved to a
        client-side sort in the new `loans/compute.ts`'s
        `computeLoansData()`. New `decryptLoanRows()`/`decryptLoanAmounts()`
        in `finance/decrypt.ts` (the latter narrow, for the
        `raw-data.ts`/safe-to-spend/health-score path, mirroring
        `decryptActiveGoals`). `use-side-data.ts` decrypts+computes loans
        alongside goals now, exposing `failedLoanCount`.
        **Calendar page converted** the same way Goals was: new
        `authed-calendar-view.tsx` sources decrypted loans from
        `useSideData()`, then calls `fetchBillCalendarAction(loans)` — that
        action (and `getBillCalendarData()` underneath it) now takes
        already-decrypted loans as a parameter instead of fetching them
        itself. `authed-notifications.tsx`'s own separate loans fetch
        (same pattern as its goals fetch last sub-item) updated the same
        way, and reordered so calendar fetches after loans are decrypted.
        **Write path**: `loan-form.tsx`/`payment-form.tsx` now require a
        `dek: CryptoKey` prop (threaded from a new `authed-loans-view.tsx`,
        replacing the server-component `loans/page.tsx`); new
        `src/lib/loans/client-actions.ts` mirrors `goals/client-actions.ts`.
        **Hardest piece, same shape as goals' `addContribution`**:
        `recordPayment`'s server-side read-modify-write (read
        `remaining_amount`, split into interest/principal against it using
        `interest_rate`, write back the new balance) is impossible once
        `remaining_amount` is ciphertext the server can't read. Moved to
        `payment-form.tsx`'s client wrapper, which already has the loan's
        decrypted `remainingAmount`/`interestRate` on screen — computes the
        split and new balance exactly as the old server code did, just
        client-side now, encrypts the new balance, and sends everything as
        a trusted write. `loan_payments.*` itself stays plaintext (own
        future turn in this list). Same documented concurrency tradeoff as
        goals applies here too.
        `net_worth/actions.ts`'s `captureSnapshot()` now also takes
        `loansRemainingTotal` as a parameter (previously fixed for goals
        last sub-item; loans needed the identical fix).
        **Scope cut**: removed `loan.create`/`loan.edit`/`loan.payment`
        Smart Entry capabilities (and the now-dead `fetchCurrentLoan`
        helper, and the `emi`-based `typicalAmount` in
        `loadReferenceData()`'s loans reference) — same reasoning as goals,
        with `loan.payment` additionally blocked by needing the loan's
        current decrypted balance server-side to compute the split.
        `loan.delete` is untouched. **Verified**: `npm run build`/
        `npm run lint` clean; migration applied via Supabase MCP,
        `get_advisors` shows no new findings. **Not verified**: a real
        browser session, same sandbox limitation as every phase so far.
  - [x] `investments.investedAmount`/`currentValue`/`monthlyContribution` —
        done. Same shape as goals/loans exactly: Investments page was still
        a server component computing `computeInvestmentProjection()`
        server-side, plus a narrower parallel `investmentMonthlyContributions`
        feed in `raw-data.ts` for safe-to-spend. `expectedReturn`/
        `startDate`/`type` stay plaintext per the locked scope; migration
        `encrypt_investments_amount_columns` applied live (`numeric` →
        `text` × 3, `USING <col>::text`).
        **Read path**: `investments/queries.ts`'s `fetchInvestmentsRaw()`
        returns ciphertext only — the old DB-level `ORDER BY current_value`
        moved to a client-side sort in the new `investments/compute.ts`'s
        `computeInvestmentsData()`. New `decryptInvestmentRows()`/
        `decryptInvestmentMonthlyContributions()` in `finance/decrypt.ts`
        (the latter narrow, mirroring `decryptActiveGoals`/
        `decryptLoanAmounts`) — this let `computeBudgetsData` finally drop
        its last `FinanceRawData` passthrough param entirely, now taking
        every input as an explicit decrypted value.
        `use-side-data.ts` decrypts+computes investments alongside
        goals/loans now, exposing `failedInvestmentCount`.
        **Write path**: `investment-form.tsx`/`contribution-form.tsx` now
        require a `dek: CryptoKey` prop (threaded from a new
        `authed-investments-view.tsx`, replacing the server-component
        `investments/page.tsx`); new `src/lib/investments/client-actions.ts`
        mirrors `loans/client-actions.ts`.
        **Hardest piece, same shape as goals/loans**: `recordContribution`'s
        server-side read-modify-write (`invested_amount += amount`,
        `current_value += amount` when `addToValue`) is impossible once
        both are ciphertext. Moved to `contribution-form.tsx`'s client
        wrapper, which already has the holding's decrypted
        `investedAmount`/`currentValue` on screen. `investment_contributions.
        amount` itself stays plaintext (own future turn in this list). Same
        documented concurrency tradeoff as goals/loans applies here too.
        `net_worth/actions.ts`'s `captureSnapshot()` now takes
        `investmentsTotalValue` as a third pre-computed parameter — the
        last of the three net-worth components to need this fix (goals and
        loans were already converted).
        **Scope cut**: removed `investment.create`/`investment.edit`/
        `investment.contribution` Smart Entry capabilities (and the now-dead
        `fetchCurrentInvestment` helper, and the `monthly_contribution`-based
        `typicalAmount` in `loadReferenceData()`'s investments reference) —
        same reasoning as goals/loans, with `investment.contribution`
        additionally blocked by needing the holding's current decrypted
        amounts server-side. `investment.delete` is untouched. **Verified**:
        `npm run build`/`npm run lint` clean; migration applied via Supabase
        MCP, `get_advisors` shows no new findings. **Not verified**: a real
        browser session, same sandbox limitation as every phase so far.
  - [x] `net_worth_snapshots.*` — done. The smallest and most contained
        sub-item so far — only three files touched the table
        (`networth/queries.ts`, `networth/actions.ts`, `db/schema.ts`), no
        Smart Entry capability existed for it, and there was no
        read-modify-write to redesign. `total_assets`/`total_liabilities`/
        `net_worth` encrypted; `captured_at`/`currency`/`note` stay
        plaintext. Migration `encrypt_net_worth_snapshots_columns` applied
        live (`numeric` → `text` × 3, `USING <col>::text`).
        **Read path**: `networth/queries.ts`'s `fetchNetWorthSnapshotsRaw()`
        (renamed from `fetchNetWorthSnapshots`) returns ciphertext only. New
        `decryptSnapshotRows()` in `finance/decrypt.ts`; `use-side-data.ts`
        decrypts alongside goals/loans/investments, exposing
        `failedSnapshotCount` (not surfaced in the UI — a failed-to-decrypt
        snapshot just drops out of the trend reconstruction silently,
        same fault-tolerant behavior as everywhere else, but there's no
        dedicated snapshot list in the UI to hang a banner off like
        budgets/goals/loans/investments have).
        **Write path — actually simpler than before**: `captureSnapshot()`
        used to *recompute* `total_assets`/`total_liabilities`/`net_worth`
        itself from three raw component totals (a workaround from the
        goals/loans/investments sub-items, added one at a time as each
        table's total became unreadable server-side). Since the client
        already builds the full `NetWorthResult` via `buildNetWorth()` to
        render the page — the same numbers a snapshot would capture —
        `captureSnapshot()` now just persists three pre-encrypted numbers
        instead of recomputing anything, and `networth-view.tsx`'s
        `onCapture` encrypts `data.result` directly via a new
        `src/lib/networth/client-actions.ts`. Net simplification:
        `NetWorthView`/`AuthedNetWorth` shed the three
        `investmentsTotalValue`/`goalsSavedTotal`/`loansRemainingTotal`
        props they'd accumulated over the last three sub-items, replaced
        with a single `dek` prop. **Verified**: `npm run build`/
        `npm run lint` clean; migration applied via Supabase MCP,
        `get_advisors` shows no new findings. **Not verified**: a real
        browser session, same sandbox limitation as every phase so far.
  - [x] `goal_contributions.amount` — done. Contained: only `raw-data.ts`
        (the `contributions` feed used by Transactions' "transfer" rows and
        Analytics' monthly `contributed` bucket) and `goals/actions.ts`'s
        `addContribution` touch this column; no Smart Entry capability
        exists for it (`goal.contribution` was already removed in the
        `goals.*` sub-item, before this table's own amount was even in
        scope). `contributed_at`/`note` stay plaintext; migration
        `encrypt_goal_contributions_amount` applied live (`numeric` →
        `text`, `USING amount::text`).
        **Read path**: `raw-data.ts`'s `RawContributionRow.amount` is now
        ciphertext; new `decryptContributionRows()` in `finance/decrypt.ts`.
        `computeAnalyticsData`/`computeTransactionsList` both take an
        explicit `decryptedContributions` param now instead of reading
        `raw.contributions` themselves. Added `failedContributionCount` to
        `FinanceData` and folded it into the existing Transactions
        decrypt-failure banner (already covering income/expenses) rather
        than adding a new one.
        **Write path**: `addContribution`'s `amount` field (the log entry
        itself) now travels as ciphertext alongside the already-ciphertext
        `newCurrentAmount` (the running balance, encrypted since the
        `goals.*` sub-item) — `goals/client-actions.ts`'s
        `encryptedAddContribution` encrypts both from the same plaintext
        form value before calling the action. No new read-modify-write
        problem here: the balance arithmetic was already moved client-side
        last sub-item, this just adds one more field to the same
        already-encrypting call. **Verified**: `npm run build`/
        `npm run lint` clean; migration applied via Supabase MCP,
        `get_advisors` shows no new findings. **Not verified**: a real
        browser session, same sandbox limitation as every phase so far.
  - [x] `investment_contributions.amount` — done. Same shape and same
        size as `goal_contributions.amount`, one difference: this table
        doesn't feed a visible list anywhere (unlike goal contributions,
        which show as Transactions "transfer" rows) — its only consumer is
        `analytics/compute.ts`'s `investmentRate` aggregate (health-score
        input), via `raw-data.ts`'s `investmentContributions` field.
        `contributed_at`/`note` stay plaintext; migration
        `encrypt_investment_contributions_amount` applied live (`numeric`
        → `text`, `USING amount::text`).
        **Read path**: new `decryptInvestmentContributionRows()` in
        `finance/decrypt.ts`. `computeAnalyticsData` now takes an explicit
        `decryptedInvestmentContributions` param instead of reading
        `raw.investmentContributions` itself — dropped its last
        `FinanceRawData` passthrough entirely, same cleanup
        `computeBudgetsData` got in the `investments.*` sub-item. No
        dedicated decrypt-failure banner added (same call as
        `net_worth_snapshots`: no list UI to hang one on, a failed row
        just drops silently out of the aggregate).
        **Write path**: `recordContribution`'s `amount` field now travels
        as ciphertext alongside the already-ciphertext
        `newInvestedAmount`/`newCurrentValue` (encrypted since the
        `investments.*` sub-item) — same "one more field on an
        already-encrypting call" shape as goal contributions, no new
        read-modify-write problem. **Verified**: `npm run build`/
        `npm run lint` clean; migration applied via Supabase MCP,
        `get_advisors` shows no new findings. **Not verified**: a real
        browser session, same sandbox limitation as every phase so far.
  - [x] `loan_payments.*` — done. Smallest sub-item so far: this table
        has no read consumer anywhere in the app (unlike goal/investment
        contributions, which at least feed an aggregate) — purely a
        write-once audit log from `recordPayment`. Three amount columns
        this time (`amount`, `principal_component`, `interest_component`,
        the `*` in the doc's list) vs. the single-column contribution
        tables; `paid_on`/`is_extra` stay plaintext. Migration
        `encrypt_loan_payments_columns` applied live (`numeric` → `text`
        × 3, `USING <col>::text`).
        No read-path changes at all — nothing in `raw-data.ts`,
        `finance/decrypt.ts`, or any compute function touches this table.
        **Write path**: `recordPayment`'s interest/principal split was
        already computed client-side in `payment-form.tsx`'s wrapper since
        the `loans.*` sub-item (it needed the loan's decrypted balance to
        do the split at all) — this sub-item just adds encryption on top
        of numbers that were already being calculated there, alongside the
        already-ciphertext `newRemainingAmount`. **Verified**:
        `npm run build`/`npm run lint` clean; migration applied via
        Supabase MCP, `get_advisors` shows no new findings. **Not
        verified**: a real browser session, same sandbox limitation as
        every phase so far.
  - [x] `recurring_rules.amount` — done, the last table in this checklist.
        `frequency`/`interval`/`startDate`/`endDate`/`isActive`/`note` stay
        plaintext (same "no-name/no-note" precedent as every prior
        contribution/payment/snapshot table). Migration
        `recurring_rules_amount_to_text` applied live (`numeric` → `text`,
        `USING amount::text`).
        **Read path**: new `fetchRecurringRulesRaw()` (`recurring/
        queries.ts`, replacing the old server-side `getRecurringData()`)
        returns ciphertext rows with no DB-level sort; new
        `decryptRecurringRows()` in `finance/decrypt.ts`; new pure
        `computeRecurringData()` (`recurring/compute.ts`) now owns the
        `nextOccurrence`/`monthlyAmount` calc and the `is_active`/
        `start_date` sort client-side, and exports `RecurringData`
        (superseding the old export from `queries.ts`). The Recurring page
        converts to the same client-driven `Authed*View` shape as goals/
        loans/investments (`authed-recurring-view.tsx`, page reduced to a
        thin server shell), with a `ShieldAlert` decrypt-failure banner
        since it has a real list UI. `getBillCalendarData()` (`calendar/
        queries.ts`) — which already took decrypted `loans` as a param
        since the `loans.*` sub-item — now also takes decrypted `rules` as
        a second param instead of calling `getRecurringData()` itself;
        both call sites (`authed-calendar-view.tsx`,
        `authed-notifications.tsx`) updated to decrypt+compute recurring
        rules before calling it. `use-side-data.ts` gained
        `decryptRecurringRows`/`computeRecurringData` in its parallel
        pipeline and a `failedRecurringCount` field.
        **Write path**: plain overwrite, no prior read — simpler than the
        contribution/payment tables. New `recurring/client-actions.ts`
        (`encryptedCreateRecurringRule`/`encryptedUpdateRecurringRule`)
        mirrors `budgets/client-actions.ts`; `recurring/actions.ts`'s
        `createRecurringRule`/`updateRecurringRule` now take a typed
        `EncryptedRecurringInput` object instead of `FormData`.
        `recurring.create`/`recurring.edit` Smart Entry capabilities
        removed (see the phase-wide note below) —
        `fetchCurrentRecurring()` (its only caller) deleted from
        `capabilities/shared.ts`. **Verified**: `npm run build`/
        `npm run lint` clean (after trimming 5 now-dead imports in
        `capabilities/definitions.ts` that lint flagged post-removal);
        migration applied via Supabase MCP, `get_advisors` shows only the
        pre-existing `auth_leaked_password_protection` WARN. **Not
        verified**: a real browser session, same sandbox limitation as
        every phase so far.

  - [x] **Scope cut, phase-wide, not a bug — flagging prominently rather
        than burying it in the table-by-table notes above.** Every
        create/edit/contribution/payment Smart Entry capability has now
        been removed, one table at a time, across this entire 3.5.4 pass
        (`transaction.*` was already removed in 3.5.3). After the
        `recurring_rules.amount` sub-item, `capabilities/definitions.ts`'s
        `CAPABILITY_DEFINITIONS` contains exactly five entries:
        `investment.delete`, `loan.delete`, `goal.delete`, `budget.delete`,
        `recurring.delete` — every single one a delete capability. The
        reason is structural, not an oversight per table: every
        `execute()` in this file runs server-side via `/api/v1/ai/commit`,
        which has no DEK, so it can never encrypt a field it writes — and
        the contribution/payment capabilities had the added problem of
        needing a decrypted *current* value server-side to compute a
        running total or split. Net effect: Smart Entry's natural-language
        quick-add/quick-edit is gone for every financial amount in the
        app. What remains is "delete something by name" only. Creating or
        editing any budget/goal/loan/investment/recurring rule, or logging
        a contribution/payment, still works normally through each
        module's own page (client-side encrypt path) — this only affects
        the AI chat shortcut. Left the now-fully-dead utility exports
        (`todayISO`/`toNumber`/`normalizeDate`/`normalizeEnum` in
        `capabilities/extract-utils.ts`) in place rather than pruning them
        — same call as the harmless dead entries left in
        `smart-entry-types.ts`/`anomaly.ts` from earlier phases; a
        proper redesign of Smart Entry (e.g. client-side amount validation
        before the commit round-trip) is a 3.5.6+/product decision, not
        something to improvise here.

  - [x] **Phase 3.5.4 checklist complete** — all nine tables above done.
  - [ ] **Verify**: build + screenshot per module as it lands, same as
        3.5.3.
- [x] **3.5.5 — mostly absorbed into 3.5.3.** Transactions, Dashboard,
      Budget, Analytics, Net Worth, Reports, Financial Score, and
      Notifications are already client-driven fetch+decrypt+compute — not
      because this sub-phase ran, but because 3.5.3's "migrate every
      consumer" decision required it immediately, not on a later pass.
      **Still open**: Goals, Loans, Investments, Recurring, Calendar,
      Settings' account list — pages whose own tables aren't encrypted
      yet, so they're still server components. Each one converts as its
      underlying table lands in 3.5.4, using the same `Authed*` wrapper +
      `use*Data` hook pattern 3.5.3 already established — this is no
      longer a distinct architectural pass, just part of doing 3.5.4
      properly per table.
  - [ ] **Verify** (for whatever's left when 3.5.4 finishes): build
        passes; confirm `loading.tsx` skeletons still cover the
        client-side fetch+decrypt+compute window without a layout flash;
        screenshot each newly-migrated page at 390px and desktop.
- [x] **3.5.6 — Recovery key UX, OAuth vault passphrase, quick-unlock &
      multi-device.** Done, all four sub-items.
  - [x] Recovery-key display/confirm flow at vault setup — **turned out
        to already exist**, built as part of 3.5.1
        (`vault-settings.tsx`'s `handleBeginSetup`/`showRecovery` mode +
        the confirm dialog with the "I've saved this" checkbox) ahead of
        this checklist catching up to it. What was actually missing, and
        what this sub-item built, is the other half: **recovery-code
        *unlock*** — until now the locked-state UI said "coming in 3.5.6"
        with no way to actually use the code. Added a `decodeRecoveryCode`
        (`vault/crypto.ts`, inverse of the existing `base32Encode`,
        tolerant of the dashes `groupCode` inserts and the classic
        Crockford O↔0/I,L↔1 transcription confusions) and a "Forgot your
        passphrase? Use your recovery code" link on the locked screen that
        opens a combined recover-and-reset-passphrase form: recovery code
        + new passphrase in one step (`handleRecoverUnlock` in
        `vault-settings.tsx`), since arriving here already implies the old
        passphrase is gone — unwraps the DEK via the recovery path, then
        immediately re-wraps it under the new passphrase via the same
        `rotateVaultSecret` call `handleRotatePassphrase` uses.
  - [x] "Set up your Vault Passphrase" prompt for OAuth-only accounts on
        first touch of an encrypted module — done, and used it as the
        occasion to fix a bigger gap: every encrypted-module page (16
        files: 9 `Authed*View` components with their own copy-pasted
        `if (!dek)` block, plus the shared `VaultGate` used by
        budgets/analytics/score) only ever checked "is there a DEK in
        memory," so a brand new user with no vault at all saw the same
        "Unlock your vault in Settings" copy as someone who'd simply
        locked it — no path to *setting one up* short of guessing to
        visit Settings unprompted. `getVaultSetupStatus` (`vault/
        queries.ts`) now also returns `isOAuthOnly` (`!user.identities
        .some(i => i.provider === "email")` — Google-only accounts have
        never typed a password into this app, so the copy is framed as
        "this is your first one," not "another password"), exposed
        client-side via a new `fetchVaultStatus` action +
        `useVaultStatus()` query hook. All 16 gate sites now render one
        new shared `<VaultLockedPrompt module="…" />` component
        (`components/finance/vault-locked-prompt.tsx`) that branches on
        `hasVault`: sets up (deep-links to `/settings#vault` with tailored
        copy) vs. locked (the original unlock prompt, now also a link).
        `VaultGate` gained an optional `module` prop threaded through its
        three call sites for better copy. Every removed inline block's
        `ShieldAlert` import was cleaned up except `authed-transactions-
        view.tsx`, which still uses it for its own decrypt-failure banner.
  - [x] Device-local quick-unlock — **PIN only, per the doc's locked
        decision above** (WebAuthn explicitly deferred, not attempted).
        New `vault/local-store.ts`: a small hand-written `indexedDB`
        wrapper (no new dependency), one record per `userId` — `{wrap,
        salt, kdfParams, failedAttempts}` — so a second account signing
        into the same browser can never see the first account's cached
        wrap. `PIN_MAX_ATTEMPTS = 8` (`vault/constants.ts`); a wrong PIN
        increments a local counter and past the limit wipes the local
        record, forcing a fallback to passphrase or recovery — exactly the
        "attempt-throttled" design already locked in the doc. New opt-in
        `<QuickUnlockSettings>` in the unlocked Settings panel (wraps the
        already-in-memory DEK under a PIN-derived `PIN_KDF_PARAMS` key,
        `savePinWrap`s it) and a `<QuickUnlockPin>` sub-component embedded
        directly in `VaultLockedPrompt` — checks this device's IndexedDB
        for a wrap and, if one exists, offers a PIN field right there
        instead of a trip to Settings. Both are silent no-ops on a device
        that never opted in.
  - [x] "Rotate vault" flow for device revocation — the biggest sub-item.
        New DEK, every row across every vault-DEK-encrypted table
        re-encrypted, re-wrapped for password + a **freshly issued**
        recovery code. **Two design calls made while building this, not
        fully pinned down by the doc's prose:**
        - *Which tables count as "every row."* The doc's own scope table
          lists intended columns, but several were deliberately left
          plaintext during 3.5.4 (contribution/payment/snapshot/recurring
          `.note` fields, all `name` fields — confirmed by grepping
          `finance/decrypt.ts`, the authoritative "what's actually
          packed-ciphertext" source, not the aspirational doc table).
          Rotation re-encrypts exactly what's actually encrypted today:
          `income`, `expenses`, `budgets`, `goals`, `goal_contributions`,
          `loans`, `loan_payments`, `investments`,
          `investment_contributions`, `net_worth_snapshots`,
          `recurring_rules`, `notifications.body`, and
          `private.ai_provider_keys.encryptedKey` — the last one is easy
          to miss since it predates the packed single-column format
          (still two columns, `encryptedKey`+`keyIv`) and was migrated to
          DEK-wrapping back in 3.5.2, not 3.5.4. `loan_payments` and
          `notifications.body` have no read/decrypt path anywhere in the
          app (write-once audit trails), but still get re-encrypted for
          consistency — "re-encrypt every row" means every row, including
          ones nothing currently reads back. Soft-deleted rows are
          included too (no `deletedAt` filter in `rotation-queries.ts`) so
          nothing is left orphaned under the old DEK.
        - *What "remaining trusted devices" means when quick-unlock wraps
          are local-only and MCP tokens wrap via a secret this server
          never had.* Neither can be re-wrapped server-side — there's
          nothing to re-derive their KEK from without the PIN or the raw
          token, which this server never stored. Resolved as: this
          device's own quick-unlock (if enabled) is simply cleared
          (`clearPinWrap`) rather than carried forward, and the user
          re-enables it via the same `QuickUnlockSettings` UI right there
          post-rotation (forced to re-derive since we don't have the PIN
          cached either); every MCP agent token is revoked
          (`revokedAt = now()` — its wrap wasn't reusable, so there's no
          "leave it alone" option, and an orphaned token silently failing
          to decrypt fresh data is worse than an explicit revocation the
          user can see in Agent Access and re-mint from). Any other
          *device* that only had quick-unlock enabled just stops working
          next time it tries to decrypt — its cached PIN-unwrap still
          "succeeds" (it's unwrapping the *old* DEK correctly), but that
          DEK no longer decrypts anything, which the existing
          fault-tolerant per-row decrypt already surfaces as the ordinary
          "N couldn't be read" banner rather than a crash. That device
          falls back to the passphrase or new recovery code, same as a
          brand new device.
        New files: `vault/rotation-queries.ts` (server-only bulk raw
        fetch, one query per table, direct Postgres client since
        `aiProviderKeys` lives outside PostgREST's exposed schemas),
        `vault/rotation-actions.ts` (`applyVaultRotation` — one
        `db.transaction()` looping per-row updates across all 13 tables
        plus the `vault_keys` rewrap plus the MCP-token revoke; every
        `WHERE` scoped by both `id` *and* `userId`, not `id` alone — an
        early draft filtered by `id` only, which would have let any
        authenticated caller overwrite arbitrary rows by ID; caught and
        fixed before this ever ran against the live DB), `vault/
        reencrypt.ts` (pure client-side decrypt-under-old/encrypt-under-
        new for every field, no UI/network), and
        `components/settings/rotate-vault-settings.tsx` (the flow:
        confirm → re-enter current passphrase, verified via an
        encrypt/decrypt round-trip probe against the already-unlocked DEK
        rather than exporting raw key bytes → fetch + re-encrypt +
        generate new recovery code → confirm saved → submit). The
        passphrase itself doesn't change (kept, just re-wrapped under a
        fresh salt) — rotation's job is invalidating a *device's cached
        DEK copy*, not the passphrase, which "Change passphrase" already
        covers.
  - [x] **Verify**: `npm run build`/`npm run lint` clean after every
        sub-item. **Not verified**: a real browser session — this sandbox
        has no Supabase auth credentials, same limitation as every phase
        so far, so the unlock/quick-unlock/rotation UI and the
        end-to-end "simulate a second device, rotate, confirm its cached
        unlock no longer works" scenario are unexercised. The
        re-encryption logic's correctness rests on `reencrypt.ts` being a
        straight decrypt-then-encrypt of the same `decryptPacked`/
        `encryptPacked`/`decryptField`/`encryptField` primitives already
        proven correct by every prior phase's round-trip, not on any new
        crypto — but that's a code-review argument, not a tested one.
- [x] **3.5.7 — Backfill & cleanup.** Done, all three sub-items.
  - [x] Backfill tooling for any pre-existing plaintext rows — turned out
        to be a real, immediate need, not a hypothetical: querying the
        live DB showed every seed row in `income`/`expenses`/`budgets`/
        `goals`/`investments`/`net_worth_snapshots` is still plain decimal
        text (`"50000.00"`, not `iv:ciphertext`), left over from before
        each table's migration landed. Built automatic backfill exactly as
        this doc's own "mandatory per module" section already promised:
        "3.5.7's backfill re-encrypts their existing data the first time
        they touch the now-migrated module."
        **Detection**: new `decryptOrRecoverPacked()` (`vault/crypto.ts`)
        — a structural check (`looksLikePackedPayload`: does the value
        even have the shape of a packed `{iv}:{ciphertext}` payload, IV
        half exactly 16 base64 chars?) decides whether a decrypt failure
        means "never encrypted at all" (recover the raw value, hand back
        a fresh re-encryption too) vs. "genuinely undecryptable" (wrong
        DEK, corruption — returns `null`, stays a real failure, never
        guessed at). Verified with a standalone script exercising all four
        cases — legacy plaintext, already-good ciphertext, ciphertext
        under a *different* DEK, and free text that happens to contain a
        colon — since a live browser session isn't available here; all
        four behaved as designed, including the two adversarial-shaped
        ones that must NOT be treated as legacy plaintext.
        **Wiring**: `finance/decrypt.ts`'s per-row builders now return an
        additional `backfill` array alongside the existing `rows`/
        `failedCount`; the two central hooks that already touch every
        encrypted table — `use-finance-data.ts` (income, expenses,
        budgets, goal_contributions, investment_contributions — the last
        one needed a new `id` column threaded through `raw-data.ts`'s
        query, since nothing previously needed its row identity) and
        `use-side-data.ts` (goals, loans, investments, recurring_rules,
        net_worth_snapshots) — fire the matching new `backfillXRows`
        action (`vault/backfill-actions.ts`, one per table, each scoped
        by `id` *and* `userId`) fire-and-forget after decrypting, never
        blocking the page. **Deliberately not covered**: the three
        "narrow" cross-module fetches (`decryptActiveGoals`/
        `decryptLoanAmounts`/`decryptInvestmentMonthlyContributions`,
        used only for the safe-to-spend/health-score aggregates) have no
        row `id` in their raw queries at all — backfilling those tables
        still happens, just via the owning module's own full fetch
        (Goals/Loans/Investments pages) rather than every place that
        happens to read a sliver of the same table. `loan_payments` and
        `notifications.body` have no read/decrypt path anywhere (write-
        once audit trails), so there's no "touch the module" moment for
        them either — a documented gap, not an oversight; both still get
        cleaned up whenever the user runs "Rotate vault" (3.5.6), which
        re-encrypts every row regardless of read paths.
        The `AI_KEYS_ENCRYPTION_KEY`-wrapped provider key case needed no
        new tooling — `resolveActiveKey()` (`ai/client-key.ts`) already
        catches a decrypt failure there and tells the user to re-save
        their key in Settings, which was always the intended fix per this
        doc's own parenthetical.
  - [x] Removed dead server-side plaintext code paths: `src/lib/ai/
        crypto.ts` (the old `encryptSecret`/`decryptSecret` pair) was
        confirmed to have zero remaining importers anywhere in `src` —
        Phase 3.5.2 already fully cut `ai_provider_keys` over to
        DEK-wrapping, so this was pure dead code, not something requiring
        a migration window. Deleted the file outright. Removed
        `AI_KEYS_ENCRYPTION_KEY` from `.env.example` and corrected its
        neighboring `DATABASE_URL` comment, which still described the
        connection's purpose as of 3.5.1 (just `ai_provider_keys`) rather
        than its real scope today (`vault_keys`, `mcp_agent_tokens`, and
        the bulk rotation/backfill queries). Left the narrative mentions
        of `AI_KEYS_ENCRYPTION_KEY` in `docs/phase-3-ai-assistant-plan.md`
        and the financeos skill alone — updating those to reflect E2EE
        being live is explicitly 3.5.8's job ("update the financeos
        skill's roadmap section... to note E2EE is live"), not this
        sub-item's.
  - [x] Security review: re-checked every new write path added across
        3.5.6/3.5.7 scopes its `WHERE` by both `id` *and* `userId`, not
        `id` alone (the same class of bug caught and fixed during 3.5.6's
        rotation action) — confirmed clean across all ten
        `backfillXRows` actions. No new `private` schema tables since
        3.5.1, so nothing new needs its own RLS pass; `get_advisors`
        (security) still shows only the pre-existing
        `auth_leaked_password_protection` WARN, unchanged since 3.5.1.
  - [x] **Verify**: `npm run build`/`npm run lint` clean. **Not
        verified**: a real browser session actually recovering the live
        DB's known-plaintext seed rows — this sandbox still has no
        Supabase auth credentials, same limitation as every phase so far;
        the detection/recovery logic itself was verified standalone (see
        above), just not the end-to-end write-back against a real
        session.
- [x] **3.5.8 — Rollout & documentation.** Done, all three sub-items —
      note this only covers 3.5.0–3.5.7; 3.5.9 is explicitly called out
      as still open everywhere it's mentioned below, not silently implied
      as done.
  - [x] Flipped this doc's Status line (top of file) from "design only" to
        an accurate "live for 3.5.0–3.5.7, 3.5.9 not started" summary;
        also corrected its neighboring paragraph, which still described
        `src/lib/ai/crypto.ts` as the current AI-key encryption model —
        that file was deleted in 3.5.7.
  - [x] Marked Phase 3.5 in `docs/phase-3-ai-assistant-plan.md`: its
        Phase 3.5 entry now splits into "live for 3.5.0–3.5.7" (checked)
        and "3.5.9 not started" (unchecked, with the write-access/scope
        blocker noted) instead of one blanket "design only, not started."
        Also corrected its "Rollout note" section, which said
        `AI_KEYS_ENCRYPTION_KEY` "is set in Vercel" as if still load-
        bearing — now notes it's safe to remove from the deployment's env
        vars since 3.5.7 deleted the only code that read it.
  - [x] Updated the financeos skill's roadmap Phase 3 bullet to note E2EE
        is live (`docs/e2ee-path-b-plan.md` reference, 3.5.9 flagged as
        the one open piece). Also fixed the skill's "AI providers & user
        API keys" section above it, which still documented the original
        `AI_KEYS_ENCRYPTION_KEY` server-secret model as current, forward-
        looking design guidance ("Implementation is deferred to Phase 3,
        but design to this shape") — corrected to describe the vault-DEK
        model that's actually live, since this section is the skill's own
        stated "ground truth for how things are built" and a future agent
        reading it literally would have reintroduced the deleted pattern.
  - [x] **Verify**: no code changed this sub-item — docs only. `npm run
        build`/`npm run lint` re-run anyway for consistency with every
        other sub-item's verification, both clean (unaffected, as
        expected).
- [ ] **3.5.9 — MCP agent access.** Depends on 3.5.1 (vault infra) and the
      relay pattern proven in 3.5.2; independent of 3.5.3–3.5.7 (can land
      before or after the rest of the finance-table rollout, but tools
      that read a given table obviously can't return real data for it
      until that table's migrated). The token *infrastructure* below
      landed early, alongside 3.5.1's schema work — the actual MCP
      server/tool handlers did not, and are the remaining scope here.
  - [x] `private.mcp_agent_tokens` (`id`, `userId`, `label`, `tokenHash`,
        `wrappedDekByToken`, `tokenDekIv`, `tokenKekSalt`, `scope`,
        `expiresAt`, `lastUsedAt`, `revokedAt`, `...audit`) — built and
        migrated alongside `vault_keys` in 3.5.1, same RLS/PostgREST
        treatment. Applied to the live project.
  - [x] Settings → "Agent Access" card: mint a scoped (`read_summary` /
        `read_full`), named, expiring token (preset durations, hard-capped
        at `MCP_TOKEN_MAX_DURATION_DAYS`, shown once); list active tokens
        with `lastUsedAt`; revoke. Wraps the DEK under an HKDF-derived
        token KEK client-side (`src/lib/vault/crypto.ts`,
        `src/components/settings/agent-access-settings.tsx`).
  - [ ] Metadata/computed-only MCP tools (headless, no token-DEK
        unwrapping needed) — ship first, independent of the rest of this
        phase. **Not started** — this is the actual MCP server (tool
        definitions, transport, `get_capabilities`), distinct from the
        token infrastructure above.
  - [ ] Vault-gated MCP tools: the per-call transient unwrap Route
        Handler described above, scoped per token, rate-limited and
        audit-logged (who/when a token was used — content stays opaque,
        but usage isn't).
  - [ ] Every tool response includes the JSON as a `content[].text` block
        (never `structuredContent`-only) — see the cross-client
        compatibility note above; test against Claude Code, Claude
        Desktop, and Cursor specifically, not just one client.
  - [ ] `get_capabilities` tool (self-describing, no vault access
        needed) — ship with the first headless tools.
  - [ ] **Verify**: `npm run build` passes. Manual test: mint a token,
        call a scoped tool end to end, confirm a revoked token is refused
        immediately, confirm the stored row is unreadable ciphertext with
        no server secret able to open it absent a valid token, confirm
        an expired token is refused and that "no expiry" isn't offered
        as a choice in the UI.

## Resolved (formerly open questions)

All of the below were open as of the previous revision and are now
locked decisions — kept here as a log rather than deleted, so the "why"
isn't lost:

- AI relay disclosure: **stays silent**, no Settings-UI note. (See
  "Resolved: the AI Assistant conflict.")
- Entity names (goal/loan/investment/account): **encrypted**, no
  plaintext carve-out for debugging. Debugging against real data happens
  by borrowing the account owner's own vault credential, not by leaving
  fields readable at rest. (See Scope.)
- MCP token max lifetime: **user-chosen at creation (preset durations),
  hard-capped at a maximum (e.g. 365 days) — "no expiry" is not offered.**
  (See "Resolved: MCP agent access.")
- MCP token storage on the agent side: **assume the worst case (plaintext
  config file, no OS keychain)** — the target client set is broad
  (Cursor, Claude Code, Claude Desktop, others), not one controlled
  integration, so the threat model can't rely on any one of them's
  storage guarantees.
- Device-local quick-unlock: **4-digit PIN only for v1, with
  attempt-throttling (wipe local cache after N wrong tries)** — WebAuthn/
  biometric deferred, see below.

## Still open (not blocking 3.5.1, needs a decision before 3.5.9 ships)

- **MCP scope granularity** — per-module (transactions vs. budget vs.
  net-worth vs. everything) is the current assumption; whether read+write
  scopes are offered at all in v1, or read-only only until the pattern's
  proven, still needs a decision.
- Per-provider CORS support (DeepSeek now, OpenAI/Gemini/Claude later) —
  no longer blocking (the relay doesn't need it), but worth checking
  later purely as an optimization; see 3.5.2.

## Explicitly out of scope for Phase 3.5

- Hiding row existence/counts/timestamps (see Non-goals).
- Protecting against a compromised client/endpoint.
- **WebAuthn/biometric quick-unlock** — deferred by decision, not a
  permanent non-goal. v1 ships PIN-only; the PIN re-wrap mechanism is
  built so adding a WebAuthn-derived wrap later is additive. Until then,
  device revocation (lost device with quick-unlock on) always requires a
  full vault rotation — there's no hardware-backed key to lower how often
  that's needed.
- A server-side "debug/support" decryption path of any kind. Debugging
  against real data during development happens by the account owner
  sharing their own vault passphrase or recovery code ad hoc, through the
  normal unlock flow — never a separate standing key. (Confirmed
  explicitly, not defaulted — see the MCP agent access discussion.)
- Anything in Phase 4 (SMS/bank/email import) or Phase 5 (native mobile)
  — those inherit this design once it lands but aren't being designed
  here. Native mobile is a particularly good fit later: iOS Keychain /
  Android Keystore give the quick-unlock layer real hardware backing for
  free.
