# AI Smart Entry — plan (Phase 3.4 sub-feature)

Companion to `docs/phase-3-ai-assistant-plan.md`. That doc tracks the BYOK
AI Assistant foundation (nav gating, key storage, provider abstraction, ask-a-
question). This doc covers the next feature on top of it: **typing a plain-
language prompt and having the AI propose creating, editing, or deleting
transactions, investments, loans, goals, budgets, or recurring rules — for
the user to review and confirm, never auto-committed.**

Status: the create/log half shipped in PR #14 (merged); a later pass added
edit and delete (below). End-to-end encryption (Phase 3.5.3/3.5.4) then made
every one of those Server Actions expect a client-encrypted amount, which
silently removed every capability except the five plain deletes — create
and log-against capabilities are back as of "Client-side commit for
encrypted capabilities" further down; edit stays unavailable for every
module (see that section for why).

## Why this shape (incident research)

Two real, documented incidents shaped the guardrails below — see full writeup
in conversation history; summarized here for future reference:

1. **McDonald's AI drive-thru (IBM Automated Order Taking, 2021–2024).**
   Misheard voice input went straight into the order with no bounded
   validation and no cheap human checkpoint — hence viral orders like 260
   chicken nuggets and bacon-topped ice cream. McDonald's ended the IBM
   partnership July 2024. Lesson: **bound the model's output and require a
   human confirmation step before anything becomes real** — never execute a
   model's raw output directly.
2. **McHire / Olivia hiring bot breach (Paradox.ai, July 2025) — the real
   McDonald's security incident** (a separate, later viral claim that a
   McDonald's chatbot could be tricked into "writing code" was investigated
   and found to be fabricated — McDonald's has no generative customer
   chatbot in-app). McHire's actual failure: a leftover test admin account
   secured only by the password `123456`, combined with an **IDOR** (no
   check that a requested applicant record belonged to the requester) —
   exposing 64 million applicants' chat transcripts and, reportedly,
   impersonation tokens. Lesson: **no default/test-mode auth bypass, ever,
   and every resource reference must be re-verified server-side to belong to
   the authenticated user — never trust a client- or model-supplied ID.**

General guardrail principles applied (agentic-AI security literature, 2026):
human-in-the-loop for irreversible/financial actions; least privilege (the
model gets no tool that writes, only ever proposes); deterministic
schema/bounds validation on every model output; treat interpolated context as
data, never instructions; containment over prevention for prompt injection
(assume it lands sometimes, make sure it can't do much).

## Architecture

### Capability registry (`src/lib/ai/capabilities/`)

One entry per **existing** create/log action — no new business logic, no
parallel write path:

| key | wraps (existing action) | name→id resolution needed |
|---|---|---|
| `transaction.expense` / `transaction.income` | `createTransaction` | category, account |
| `transaction.edit` | `updateTransaction` | recent transaction (~30), category, account |
| `transaction.delete` | `deleteTransaction` | recent transaction (~30) |
| `investment.create` | `createInvestment` | — |
| `investment.contribution` | `recordContribution` | existing investment |
| `investment.edit` | `updateInvestment` | existing investment |
| `investment.delete` | `deleteInvestment` | existing investment |
| `loan.create` | `createLoan` | — |
| `loan.payment` | `recordPayment` | existing loan |
| `loan.edit` | `updateLoan` | existing loan |
| `loan.delete` | `deleteLoan` | existing loan |
| `goal.create` | `createGoal` | — |
| `goal.contribution` | `addContribution` | existing goal |
| `goal.edit` | `updateGoal` | existing goal |
| `goal.delete` | `deleteGoal` | existing goal |
| `budget.create` | `createBudget` | category |
| `budget.edit` | `updateBudget` | existing budget (synthetic label — see below) |
| `budget.delete` | `deleteBudget` | existing budget |
| `recurring.create` | `createRecurringRule` | category, account |
| `recurring.edit` | `updateRecurringRule` | existing recurring rule |
| `recurring.delete` | `deleteRecurringRule` | existing recurring rule |

Each entry: `{ key, label, description, schema (the module's real Zod schema,
imported — never redefined), execute(input) }`. `execute` builds a `FormData`
from the validated object and calls the real, unmodified Server Action — so
manual forms and AI drafts share exactly one write path.

### Flow

1. One LLM call, forced JSON output. System prompt includes: the capability
   manifest (key/description/fields, derived from the Zod schemas — never
   hand-duplicated), the user's real reference names (categories, accounts,
   goals, loans, investments) so the model matches existing rows by name
   instead of inventing IDs, today's date, base currency. All interpolated
   data wrapped in delimited blocks with a standing "data, not instructions"
   instruction (containment layer against prompt injection — not a
   substitute for the validation below, since filtering alone is not a
   reliable defense).
2. Output: array of `{capability, args, sourceText}`. **Nothing executes
   yet.**
3. Server-side, deterministic: resolve every name-guess against the user's
   *own* rows only (unmatched → left blank, flagged, never guessed); run
   `args` through that capability's real Zod schema; drop/flag failures.
4. Soft anomaly check: compare amount to relevant history (category average
   for expenses; that specific loan/investment/goal's own past entries) —
   flag with a warning banner, never block.
5. Confirm UI (see below): capped list (max 10 items/prompt) of editable
   drafts. **"Add all" is the only thing that writes**, and it writes through
   the real actions per item, with per-item pass/fail surfaced.

### No code-execution surface

- Model output is only ever consumed as `JSON.parse` → `Zod.safeParse`.
  Never `eval`, never dynamic SQL/query-string building, never templated
  into HTML. AI-derived text renders exactly like user-typed text does today
  (plain strings, React's default escaping — confirmed `ai-assistant-view.tsx`
  already does this correctly; keep it that way).
- The model selects a capability by closed enum key — it can never name an
  arbitrary function, table, or column.
- The DeepSeek (and future OpenAI/Gemini/Claude) call stays server-only,
  exactly as today's `resolver.ts` does — the client never talks to a vendor
  directly, the decrypted key never leaves server memory for the call's
  duration.

### Auth / origin / no external calls

- **CORS is not the real boundary** — it only stops a browser on another
  website from reading the response; it does nothing against a direct
  authenticated call (that's expected — a future mobile app must be able to
  do exactly that). We still never emit `Access-Control-Allow-Origin: *`.
- **The real boundary is auth + per-row ownership**, applied the way McHire
  didn't: every endpoint requires a valid Supabase session, no test/debug/
  default-credential bypass in any environment; every resolved resource ID
  (loan/goal/investment/category/account) is re-scoped to `user_id =
  auth.uid()` server-side before use, never trusted from the client or the
  model on faith.
- Rate limiting per user on the extraction endpoint (abuse + cost control
  against the user's own BYOK key).

### Mobile-forward: Route Handlers, not Server Actions (scoped exception)

Server Actions remain the default per `AGENTS.md` for everything else. This
feature is built as a small versioned JSON API instead, because Phase 5
(native mobile via Expo) needs a contract callable from a non-browser client,
and Server Actions are bound to Next's RSC action-id protocol:

- `POST /api/v1/ai/extract` — prompt in, validated draft list out (nothing
  written).
- `POST /api/v1/ai/commit` — validated draft(s) in, re-validated + written
  via the real actions, per-item result out.
- Auth: Supabase session cookie today (web); same handler validates a Bearer
  access token via `supabase.auth.getUser(token)` once the mobile app exists
  — one contract, two transports, no Phase 5 redesign needed.
- Documented as the *one* deliberate deviation from "Server Actions for
  mutations" — noted here and to be added to `AGENTS.md`/the financeos skill
  so it doesn't quietly generalize to other features.

## Edit & delete (this pass)

The branch's PR (#14) merged with create/log capabilities only. Per the
branch-reuse convention, `claude/ai-smart-entry` was restarted from `main`
(`git fetch origin main && git checkout -B claude/ai-smart-entry origin/main`)
rather than stacked on the merged history, and this work opens a new PR.

**Target-pool matching, generalized.** `matchByName()` is now generic over
any `{id, name}`-shaped option, and `loadReferenceData()` grew three more
pools beyond categories/accounts/investments/loans/goals:
- `recurringRules` — matched by their real `name` column, same as
  investments/loans/goals.
- `budgets` — have no name column, so each row gets a synthesized label
  (`"Groceries budget (monthly)"`) built from its category + period.
- `transactions` — the hardest case: no name at all, many rows, and the
  create-time capabilities (`transaction.expense`/`.income`) don't need to
  search them. Capped at the **30 most recent** income+expense rows
  combined, each labeled `"<description or category> · <amount> · <date>"`.
  Editing or deleting something older than that window comes back as a
  clear "couldn't find a match" error rather than silently searching further
  back or guessing — a deliberate v1 limitation, not an oversight.

**Why edit requires a resolved target before it can produce a draft at all
— unlike contribution/payment.** Contribution/payment capabilities validate
fine with an *unresolved* target (the schema doesn't need the target's
current values), so those stayed "ok:true, picker shown" on a miss. Edit is
different: `updateTransaction`/`updateInvestment`/etc. all expect a **full
replacement** of the row's editable fields, same shape as create — there's
no partial-patch action to call. So editing has to merge the user's
requested changes onto the row's *current* values (never wiping a field the
user didn't mention), which means the current row must be fetched first —
and that requires knowing which row, i.e. a resolved target. If the model's
description doesn't match anything, the edit/delete capability returns
`ok:false` with a clear error ("couldn't find X — try including the exact
amount or date") instead of a picker with blank, unprefilled fields, which
would be a worse dead end. `src/lib/ai/capabilities/shared.ts` gained
`fetchCurrent*` row-fetchers (one per module) purely to supply these
defaults; `AICapability.resolve()` became `async` to support them.

**Delete defaults to opt-in, not opt-out.** Every other draft starts
checked (the batch button reads "Confirm all" by default); delete drafts
start **unchecked**, so a "Confirm all" tap can never sweep up a deletion
the user didn't deliberately select. Delete cards also render with a
distinct red-tinted style, a trash icon, and a `destructive`-variant button
— visually unmistakable from an add/edit card. This is the direct
extension of the McDonald's/McHire guardrails to a genuinely higher-stakes
action: the review step that was "nice to have" for an extra expense row is
load-bearing for "don't delete the wrong loan."

**Ownership re-check extended.** `commit.ts`'s `targetBelongsToUser()` now
also checks the `budget`/`recurring`/`transaction` pools (previously only
investment/loan/goal) — every edit/delete target is re-verified against a
fresh, RLS-scoped load at commit time, not just trusted from the extract
response, same as before.

**Transaction routing.** `updateTransaction`/`deleteTransaction` need a
`kind` ("income" or "expense") alongside the id, since income and expenses
are separate tables. `transaction.edit`'s merged candidate always carries
`kind` (it's part of the real schema); `transaction.delete` uses a small
`{kind}`-only schema for the same reason, since it otherwise has no fields
to validate.

## UI plan (agreed)

**Entry point.** `/ai` gets a two-way segmented toggle at the top — **Ask /
Manage** — reusing the existing income/expense pill pattern from
`transaction-form.tsx` (no new Tabs dependency). "Ask" is today's existing
card unchanged. "Manage" (originally "Add", renamed once edit/delete landed
so the label doesn't undersell what it does) is `SmartEntryView`.

**Composer.** Same shell as the current Ask box: `Card` + `Textarea` +
`Button`, submits to `POST /api/v1/ai/extract`. `Skeleton` while pending,
matching every other route's `loading.tsx` convention.

**Draft list — selection model (mobile-first: one primary CTA, not three
competing buttons).**
- Every non-destructive draft card starts **checked by default** (opt-out —
  these came from the user's own prompt); every delete draft starts
  **unchecked** (opt-in — see "Edit & delete" above).
- A header row above the list: "Select all · N of M selected."
- A **sticky bottom action bar** whose single button's label tracks
  selection state: `"Confirm all (8)"` when everything selected is checked
  → `"Confirm selected (5)"` the moment something's unchecked → disabled
  `"Select at least one"` at zero. Generic "Confirm" wording (not "Add") on
  purpose, since one batch can mix adds, edits, and deletes.
  - Placement: the app's bottom tab bar is `fixed inset-x-0 bottom-0` (64px
    + safe-area) and page content reserves `pb-28` to clear it, so this bar
    docks at `fixed bottom-16` on mobile (same `bg-background/85
    backdrop-blur-lg` treatment as `BottomNav`, z-index just under it), and
    becomes an in-flow `sticky bottom-4` element on `lg+` where the sidebar
    replaces the tab bar.
- Each card also has its own small action button — labeled **"Add" /
  "Save" / "Delete"** per the capability's `actionLabel` — that commits just
  that one item immediately, independent of the checkboxes/batch bar.
  Optimistic removal from the list on success, same pattern
  `transactions-view.tsx` uses for delete.
- Each card also has a discard `x` to drop it from the list without
  applying it.

**Card anatomy varies by action type:**
- **Add / edit** (top → bottom): leading checkbox · module `Icon` + `Badge`
  · target picker (`Select`, edit/log-against capabilities only — generalized
  to investment/loan/goal/budget/recurring-rule/transaction pools) · the
  capability's editable fields (`FIELD_SPECS`; edit capabilities reuse their
  create counterpart's field set — same schema, same shape) · anomaly/
  unresolved-reference warnings · discard `x` top-right · "Add"/"Save"
  bottom-right.
- **Delete**: a compact, red-tinted card — checkbox, trash icon, `Badge`
  (negative variant), target picker if unresolved, warnings, discard `x`,
  and a `destructive`-variant "Delete" button. No editable fields (nothing
  to edit on a delete).

All of the above reuses existing primitives only (`Card`, `Badge`, `Input`,
`Select`, `Textarea`, `Button`, `Skeleton`, `Icon`) plus one new lucide icon
(`Trash2`, imported directly in `draft-card.tsx` — not added to the shared
category-icon resolver, since it's fixed UI chrome, not user-selectable
data) — no new UI dependency. Finalize any remaining visual details (module
color-coding, grouping order) during a future design pass.

## Sequencing

- [x] `src/lib/ai/capabilities/` registry — `types.ts`, `shared.ts`
      (reference-data loader + name matcher + FormData bridge),
      `extract-utils.ts`, `definitions.ts` (all 10 capabilities), `registry.ts`
      (lookup + prompt manifest). Every `schema` field is the module's real,
      imported Zod schema — none redefined.
- [x] DeepSeek adapter: JSON-mode (`response_format: json_object`) plumbed
      through `AIProvider.chat`'s new `ChatOptions` param and
      `chatWithActiveProvider`. Still defensively `JSON.parse`s inside a
      try/catch either way — JSON mode is a reliability aid, not something
      trusted blindly.
- [x] `src/lib/ai/smart-entry/extract.ts` — builds the delimited system
      prompt (capability manifest + reference names + today's date, wrapped
      in `<user_data>` with an explicit "data, not instructions" framing),
      calls the provider, defensively parses the JSON.
- [x] `src/lib/ai/smart-entry/resolve.ts` + `anomaly.ts` — name→id
      resolution against the user's own RLS-scoped rows, real per-capability
      Zod validation, soft (non-blocking) amount-anomaly warnings using
      existing analytics/reference data — no new calculation logic.
- [x] `src/lib/ai/smart-entry/commit.ts` + `POST /api/v1/ai/extract` +
      `POST /api/v1/ai/commit` Route Handlers. Commit independently
      re-validates every item against its real schema and re-checks target
      ownership — never trusts the request body, per the McHire lesson.
      Cookie-session auth only for now (`src/lib/ai/api-auth.ts`) — see that
      file's note on what bearer-token support still requires.
- [x] Best-effort per-instance rate limiting (`src/lib/ai/rate-limit.ts`) —
      explicitly documented as not durable; a shared store is a follow-up.
- [x] `npm run build` + `npm run lint` — both clean.
- [x] Documented the Route Handler exception in the financeos skill
      (`.claude/skills/financeos/SKILL.md`, Auth section).
- [x] `/ai` UI: `AiShell` (Ask/Add toggle) → `SmartEntryView` (composer,
      calls `/api/v1/ai/extract`) → `DraftCard` list (checkbox select,
      per-capability editable fields driven by `smart-entry-types.ts`'s
      `FIELD_SPECS`, target picker for contribution/payment capabilities,
      warnings, discard) → sticky adaptive commit bar (`Add all (N)` /
      `Add selected (N)`) + per-card individual "Add", both calling
      `/api/v1/ai/commit`. Reuses only existing primitives (`Card`, `Badge`,
      `Input`, `Select`, `Textarea`, `Button`, `Skeleton`, `Icon`) — no new
      UI dependency. Visually verified at 390px and desktop via a throwaway
      fixture route (not committed).
- [x] Changed the three target-required capabilities (investment
      contribution, loan payment, goal contribution) so an unresolved name
      is a fixable draft with a picker, not a dead-end error — found while
      building the UI; `commit.ts`'s ownership re-check already covered the
      missing-target case, so this was UI-only in terms of new risk.
- [ ] Durable (DB- or Redis-backed) rate limiting, if usage warrants it.
- [ ] Bearer-token auth for `/api/v1/ai/*`, once the query/action layer
      accepts an injected Supabase client instead of each instantiating its
      own cookie-bound one (Phase 5 prerequisite).

### Edit & delete (this pass)

- [x] Extended `ReferenceData`/`loadReferenceData()` with `recurringRules`,
      `budgets` (synthetic label), and `transactions` (capped ~30 recent,
      synthetic label) pools; `matchByName()` generalized to any
      `{id,name}`-shaped option.
- [x] Added `fetchCurrent*` row-fetchers (investment/loan/goal/budget/
      recurring/transaction) so edit capabilities can merge requested
      changes onto current values instead of requiring the model to
      re-supply every field.
- [x] `AICapability.resolve()` is now `async`; `resolveDraftItems()` uses
      `Promise.all` instead of a plain `.map()`.
- [x] Added 12 capabilities: `transaction.edit`/`.delete`,
      `investment.edit`/`.delete`, `loan.edit`/`.delete`, `goal.edit`/
      `.delete`, `budget.edit`/`.delete`, `recurring.edit`/`.delete` — 22
      total. Each `destructive`/`actionLabel` flag drives UI defaults.
- [x] `commit.ts`'s `targetBelongsToUser()` extended to the three new pools.
- [x] Extraction prompt updated: capability manifest now includes edit/
      delete descriptions marked "EXISTING", reference block lists recurring
      rules/budgets/recent transactions, and an explicit instruction to
      extract nothing rather than guess when an edit/delete target isn't in
      the reference data.
- [x] UI: `DraftCard` split into add/edit vs. delete rendering, generalized
      target picker, `transactionFieldSpecs()` for the income/expense field
      split, destructive-default-unselected in `SmartEntryView`, batch
      button wording generalized to "Confirm all/selected", `AiShell`'s tab
      renamed Ask/Manage.
- [x] `npm run build` + `npm run lint` — both clean.
- [ ] Visual verification of the edit/delete card states at 390px + desktop
      (blocked the same way the first pass was — no logged-in session with
      an active AI key in this sandbox; verify via the Vercel preview once
      deployed).

## Client-side commit for encrypted capabilities (this pass)

**The bug this fixes.** Across Phase 3.5.3/3.5.4 (end-to-end encryption, see
"End-to-end encryption (the vault)" in the financeos skill), every money
field this registry used to write went from a plaintext `numeric(14,2)`
column to a vault-encrypted `text` column the server can't read *or write* —
so every create and log-against capability (`transaction.expense`,
`transaction.income`, `investment.create`/`.contribution`, `loan.create`/
`.payment`, `goal.create`/`.contribution`, `budget.create`,
`recurring.create`) was deleted from `CAPABILITY_DEFINITIONS` rather than
left broken, since `execute()` used to call the real Server Action directly
from `/api/v1/ai/commit` with a plaintext amount — which would either fail
validation (the Server Action now expects ciphertext) or, worse, succeed and
write a plaintext value into a ciphertext column. Only the five capabilities
with no amount at all (`investment.delete`, `loan.delete`, `goal.delete`,
`budget.delete`, `recurring.delete`) survived. In practice this meant typing
something as basic as "today I spent 300 on taxi" into Manage silently
produced nothing — extraction still worked, but there was no capability left
for the model to pick.

**The fix.** `resolve()` was always safe to keep — it only validates and
returns a plaintext draft for display, it never writes anything. What had to
move was the *write*. Every restored capability now carries
`requiresClientEncryption: true` (`AICapability`, `capabilities/types.ts`),
and the actual write happens in the browser:
`src/lib/ai/capabilities/client-commit.ts` (`"use client"`) maps each such
capability to the exact same `encryptedCreate*`/`encryptedRecord*`/
`encryptedAddContribution` client-action wrapper the module's own manual
form already binds to `useActionState` — same validate-then-encrypt-with-
the-unlocked-DEK-then-call-the-real-Server-Action path, just fed from a
confirmed draft's fields instead of a form submit. Manual forms and AI
drafts still share one real write path per module; there just isn't one
`execute()` function doing it anymore for these ten.

`SmartEntryView`'s `commitItems` splits a confirm batch by
`requiresClientEncryption`: those items call `commitClientCapability`
directly (no network round trip beyond what the Server Action itself makes);
everything else (the five deletes) still POSTs to `/api/v1/ai/commit` as
before. `commit.ts` additionally refuses any `requiresClientEncryption` item
it receives — defense in depth against a stale client or a direct call,
never a path that would silently write plaintext.

**Contribution/payment capabilities need the target's current decrypted
amount** (`investment.contribution` needs the holding's current invested/
current value to compute a new total; `loan.payment` needs the balance and
rate to split principal/interest; `goal.contribution` needs the current
amount to compute a new total and status) — arithmetic the server has never
been able to do since 3.5.4 (see the removed comment block this replaced).
`client-commit.ts` gets these from `useSideData()`, the same decrypted-list
hook the Investments/Loans/Goals pages already use, passed in from
`SmartEntryView` as `ClientCommitContext`. Looking a `targetId` up in that
list doubles as the ownership check for these two capabilities: the
underlying reads are RLS-scoped, so an id that isn't in the list is refused
the same way `commit.ts`'s `targetBelongsToUser()` refuses an unowned delete
target.

**Still deliberately out of scope**, same reasoning as before just now
explicit: editing an existing transaction/investment/loan/goal/budget/
recurring rule (as opposed to creating one, or logging a contribution/
payment against one) through Smart Entry. An edit has to merge the user's
requested changes onto the row's *current* values — for investments/loans/
goals `useSideData()` already has that decrypted, but wiring the actual
merge-and-encrypt-then-call-`encryptedUpdate*` flow through it, plus doing
the same for budgets/recurring rules (no existing decrypted-list hook on
this page) and transactions (no per-transaction decrypt path here at all —
see `shared.ts`'s `ReferenceData.transactions` comment), is real follow-up
work, not done here. `transaction.edit`/`transaction.delete` stay
unavailable for that last reason specifically.

**Mobile.** `apps/mobile` doesn't have a Smart Entry / Manage screen yet
(see `docs/mobile-build-phase-plan.md` — the mobile module list is
Dashboard/Transactions/Budget/Goals/Analytics/Loans/Investments/Net Worth,
no AI Assistant in v1). Whenever that gets built, it must follow this same
shape: extraction and `resolve()` can stay a shared `/api/v1/ai/extract`
call (already bearer-token-authenticated, mobile-ready), but the commit
step for every `requiresClientEncryption` capability has to run on-device
against the mobile vault DEK (`apps/mobile/src/lib/vault/crypto.ts`) and
call each module's own mobile `client-actions.ts` — mirroring
`client-commit.ts` here, not a new server-side write path. Don't build a
mobile Smart Entry that posts plaintext amounts to `/api/v1/ai/commit`
expecting the server to encrypt them; it can't.

## Out of scope for this pass

- The actual MCP server exposing this registry to external clients (Phase
  4/5 candidate) — the registry's shape (`key`, `description`, `schema`,
  `execute`) is deliberately MCP-tool-shaped so that's a wrapper later, not a
  redesign.
- Receipt OCR / CSV import intelligence (separate Phase 3.4 items) — but the
  "treat interpolated text as data, not instructions" pattern established
  here is required groundwork for those, since they introduce genuinely
  third-party-sourced text.
