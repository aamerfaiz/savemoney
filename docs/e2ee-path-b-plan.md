# End-to-end encryption ("not even me") — plan

Status: **design only, nothing in this doc is implemented yet.** This is the
Path B option from the data-security discussion (see conversation history /
PR #16 context): encrypt user financial data so that the app operator —
whoever holds Vercel/Supabase/server access — cannot read it, not just so a
stolen database dump can't be read.

This is deliberately a different, stronger bar than the AI provider key
encryption already shipped (`src/lib/ai/crypto.ts`). That's envelope
encryption with a server-held key — real protection against a DB-level leak,
but decryptable by anyone with server access. Path B removes the server (and
its operator) from the trust boundary entirely for the fields it covers.

Extend this file rather than starting a new one as design decisions get made
or increments land, same convention as `docs/phase-3-ai-assistant-plan.md`.

## Goal / non-goal

- **Goal**: a user's financial data (amounts, descriptions, notes — see
  Scope below) is unreadable by the server, the database, backups, or anyone
  with production access, including the developer. Only the user's own
  browser, holding a key derived from a secret only they know, can decrypt
  it.
- **Non-goal (this phase)**: hiding *metadata* — which tables have rows, how
  many, `createdAt` timestamps, category/account/goal *names* if left
  unencrypted for UI convenience, etc. Traffic analysis / row-count leakage
  is a known, accepted limitation of this design, not something this phase
  tries to close.
- **Non-goal**: protecting against a compromised *client* (malware on the
  user's device, a browser extension, an XSS bug). E2EE protects the
  server-side trust boundary, not the endpoint.

## Threat model this actually defends against

Worth being explicit, since "not even me" is a strong claim:

- ✅ You, with full Vercel/Supabase/DB access, reading a user's amounts/notes
  directly.
- ✅ A stolen Postgres backup or leaked DB credential.
- ✅ A compromised `SUPABASE_SERVICE_ROLE_KEY` or direct DB connection string.
- ✅ Legal compulsion against the server operator producing plaintext (there
  is none to produce).
- ❌ A user who loses both their password and their recovery key (see
  Recovery below) — their data is permanently unrecoverable, by design; this
  is the fundamental trade E2EE makes.
- ❌ Malicious/compromised client-side code shipped by you — E2EE assumes the
  JS you ship is trustworthy at the moment the user runs it.

## Key architecture — vault key pattern

Directly deriving an AES key from the user's password and using it to
encrypt every row is the naive approach and it's wrong: rotating the
password would require re-encrypting every row. Instead, use the standard
two-layer scheme (Bitwarden/1Password shape):

1. **KEK (key-encryption key)** — derived client-side from the user's
   secret via Argon2id (WebCrypto doesn't ship Argon2 natively; use a WASM
   build, e.g. `hash-wasm` or `argon2-browser`) with a random per-user salt.
   Never leaves the browser, never transmitted, never stored.
2. **DEK (data-encryption key)** — a random 256-bit AES key, generated once
   per user at vault setup. This is the key that actually encrypts/decrypts
   rows. It is *wrapped* (encrypted) by the KEK and the wrapped blob is
   what's stored server-side — the server only ever sees ciphertext of a key
   it cannot use.
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

- First login (password or OAuth) that touches an encrypted module prompts
  a one-time "Set up your Vault Passphrase" step — a secret distinct from
  the account password, used only for the KEK derivation above.
- This makes the vault passphrase symmetric across both auth methods: even
  password-login users get a dedicated vault passphrase rather than reusing
  their Supabase Auth password directly, which also sidesteps a subtler
  issue — Supabase Auth's password is verified server-side (bcrypt), and
  the login form's plaintext technically transits to Supabase during
  sign-in; keeping the vault passphrase a fully separate secret means it
  never has to be sent anywhere, ever, for any reason.

## Session / unlock UX

- On login, the app is in a "locked" state: it knows the user is
  authenticated (Supabase session valid) but has no DEK in memory.
  Encrypted modules show an unlock prompt.
- Unlocking derives the KEK client-side, unwraps the DEK, and holds it only
  in memory (a module-level `CryptoKey`, ideally `extractable: false` where
  the Web Crypto API allows using it directly for decrypt operations
  without ever exporting raw bytes to JS-reachable memory).
- No raw key material in `localStorage`/`sessionStorage`/cookies, ever.
- Open question (needs a product decision, not a technical one): is a
  "remember this device for N days" convenience option in scope, and if so
  what backs it — a device-bound wrapped DEK gated by a shorter/weaker
  local secret (e.g. WebAuthn platform authenticator) is the standard
  answer, but it's additional scope. Flagging, not deciding, here.

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

`userId`, foreign keys, `currency`, `date`/`timestamp` columns, `kind`,
`type`, `status` enums stay plaintext — RLS still needs `userId` to scope
rows, and dates/kinds are needed for calendar/recurring logic and carry
little sensitivity alone. Names (goal/loan/investment/account) are a
judgment call — encrypting them loses "New Car Fund" / "Home Loan"
labels in any tooling or Supabase dashboard view, which is arguably the
point, but also makes debugging harder. Flagging as a decision, defaulting
to **encrypt names too** for consistency with the "not even me" bar.

**Storage shape**: each encrypted column becomes `text` (base64
ciphertext-plus-IV, same packing as `EncryptedPayload` in
`src/lib/ai/crypto.ts`) instead of `numeric`/plain `text`. Postgres-level
`numeric(14,2)` constraints are lost for these columns; validation moves
entirely to the client (Zod, already the pattern for input) before
encryption.

**Confirmed non-breaking**: I checked the existing query layer — nothing
does SQL-level `SUM`/`GROUP BY`/`ORDER BY amount`/range filters on money
columns today. Every finance engine in `src/lib/finance/` already receives
plaintext rows fetched via Drizzle and aggregates in JS
(`computeBudget`, `computeHealthScore`, etc.). So encrypting these columns
doesn't break any *existing* aggregation — it only forecloses ever adding
SQL-level search/sort/filter on them later (e.g. "search transactions by
description," "sort by amount" done in the database) — those would have to
become client-side operations over already-decrypted rows instead.

## Architecture shift — where computation moves

This is the largest cost of Path B. Nearly every page in `src/app/(app)/`
is a **server component** today, reading plaintext via
`createClient()` from `@/lib/supabase/server` and composing the finance
engines server-side for instant SSR (see AGENTS.md "Navigation & loading").
Under E2EE the server cannot decrypt, so every one of these has to become
client-driven instead:

- `dashboard`, `budget`, `goals`, `loans`, `investments`, `net-worth`,
  `analytics`, `reports`, `financial-score`, `calendar`, `notifications`,
  `transactions`, `recurring` — all currently server components — need to
  fetch **ciphertext** (still RLS-scoped, still per-user) and decrypt +
  run the finance engines in the browser instead.
- The finance engines themselves (`src/lib/finance/*.ts`) don't change —
  golden rule 5 ("pure functions, testable without a database or browser")
  holds either way. Only the *call site* moves from a server component to a
  client hook/effect.
- Server Actions (`transactions/actions.ts`, `budgets/actions.ts`, etc.)
  currently receive plaintext `FormData` and insert via Drizzle. Under E2EE
  they receive **already-encrypted** field values — the client encrypts
  with the in-memory DEK before calling the action. The action's job
  shrinks to "validate shape, stamp `userId`, insert ciphertext."
- `loading.tsx` skeletons still work — they cover the fetch+decrypt+compute
  round trip the same way they cover the current fetch, just a client-side
  one now instead of a server one.
- CSV import (`src/lib/import/pipeline.ts`) dedupe-against-DB currently
  compares against server-fetched rows; under E2EE the comparison set has
  to be decrypted rows, which either means fetching-then-decrypting
  client-side before dedupe, or accepting dedupe becomes client-only. The
  pipeline is already pure/side-effect-free per its own design note, so
  this is a caller-side change, not a pipeline rewrite.
- Notification generation (`buildNotifications`) — same shift, becomes a
  client-side computation over decrypted data instead of read-time
  server-side.

## Direct conflict: the AI Assistant (BYOK)

This needs an explicit decision, not a default. `buildFinanceContext()`
(`src/lib/ai/context.ts`) runs server-side specifically so the DeepSeek
vendor key never touches the browser — a deliberate, documented security
goal (AGENTS.md: "Keys are never readable by the browser"). Under E2EE the
server has no plaintext numbers to put in that context at all. Three ways
to resolve it, none free:

1. **AI Assistant is unavailable for encrypted accounts.** Simplest,
   preserves the existing BYOK vendor-key security model untouched, costs
   the feature entirely for anyone who opts into Path B.
2. **Move AI calls client-side.** Decrypt the vendor API key in the
   browser and call DeepSeek directly from the client. This reverses the
   "never readable by browser" guarantee for the *vendor* key — a real,
   documented regression to weigh against gaining the feature back.
3. **User-gated context sharing.** Keep the vendor key server-side (current
   model intact), but have the *client* decrypt the numbers, build the
   context string itself, and send that plaintext context (not raw DB
   rows) to the server for just that one request, with explicit user
   consent each time ("share your numbers with the AI for this
   question?"). Narrows the exposure window to opt-in, per-question, but
   is a deliberate small hole in "not even me" that needs to be named as
   such, not hidden.

Not deciding this here — recorded as an open question for Phase B.5 below.

## Build phases

- [ ] **B.0 — Design & product decisions (this doc).** Threat model, key
      architecture, scope table, and the open questions below all need
      sign-off before code starts.
- [ ] **B.1 — Vault key infrastructure.**
  - [ ] WebCrypto helpers: Argon2id KEK derivation (via a WASM lib), AES-
        256-GCM wrap/unwrap for the DEK, AES-256-GCM encrypt/decrypt for
        fields — client-side only, mirroring `src/lib/ai/crypto.ts`'s
        payload shape but run in the browser.
  - [ ] New table (private schema, alongside `ai_provider_keys`) for the
        wrapped DEK: `userId`, `wrappedDekByPassword`, `passwordKekSalt`,
        `kdfParams`, `wrappedDekByRecovery`, `recoveryKekSalt`, `...audit`.
        RLS `user_id = auth.uid()`, PostgREST-role revoked like
        `ai_provider_keys` — defense in depth even though the blobs are
        useless without the user's secret.
  - [ ] Server Actions: `setupVault` (first-time: generate DEK, wrap twice,
        store), `rotateVaultSecret` (re-wrap DEK under a new KEK, no data
        touched), no server-side "read plaintext" action ever exists for
        this table by design.
  - [ ] Settings → new "Vault & Encryption" card: set up, view recovery-key
        status (shown-once acknowledgment, never re-displayable), rotate
        passphrase.
  - [ ] Unlock UI: prompt on session start for any encrypted route: derive
        KEK, unwrap DEK, hold in memory.
- [ ] **B.2 — Pilot one module end-to-end.** Recommend Transactions (it's
      already "the reference module" per AGENTS.md) — prove
      encrypt-on-write, decrypt-on-read, client-side dashboard tile, before
      touching the other eleven tables.
- [ ] **B.3 — Roll the pattern out** to the remaining tables in the Scope
      table above.
- [ ] **B.4 — Move server-component pages to client-driven fetch +
      decrypt + compute**, module by module, per the Architecture shift
      section.
- [ ] **B.5 — Resolve the AI Assistant conflict** — pick one of the three
      options above (or a variant), implement it, update
      `docs/phase-3-ai-assistant-plan.md` to reflect the decision.
- [ ] **B.6 — Recovery key UX, vault passphrase for OAuth users, session
      unlock/remember-device UX.**
- [ ] **B.7 — Backfill tooling** for any pre-existing plaintext rows,
      security review, remove dead server-side plaintext code paths once
      migrated.

## Open questions (need a decision, not defaulted)

- AI Assistant resolution (B.5) — which of the three options, or a fourth.
- "Remember this device" convenience vs. re-deriving the KEK every
  session — and if in scope, what backs it (WebAuthn-gated local wrapped
  key is the standard answer).
- Encrypt entity *names* (goal/loan/investment/account) or leave them
  plaintext for easier debugging/support — current default above is encrypt
  them too, but that's a judgment call worth confirming.
- Multi-device: this plan assumes any browser can unlock via password or
  recovery key (both are portable secrets, not device-bound), so multi-
  device "just works" as long as the user has their passphrase — confirm
  that's the intended model before building B.6's remember-device feature,
  since a device-bound convenience key needs a per-device wrap, not a
  single one.
- Guest mode (`src/lib/guest/`, IndexedDB-backed, unauthenticated) is
  already 100% local to the user's device and never touches the server —
  it already trivially satisfies "not even me" and is **out of scope**
  here; this plan only concerns authenticated Supabase-backed accounts.

## Explicitly out of scope for Path B

- Hiding row existence/counts/timestamps (see Non-goals).
- Protecting against a compromised client/endpoint.
- Anything in Phase 4 (SMS/bank/email import) or Phase 5 (native mobile) —
  those inherit this design once it lands but aren't being designed here.
