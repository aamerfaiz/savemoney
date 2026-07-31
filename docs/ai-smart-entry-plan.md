# AI Smart Entry — plan (Phase 3.4 sub-feature)

Companion to `docs/phase-3-ai-assistant-plan.md`. That doc tracks the BYOK
AI Assistant foundation (nav gating, key storage, provider abstraction, ask-a-
question). This doc covers the next feature on top of it: **typing a plain-
language prompt and having the AI propose transactions, investment
contributions, loan payments, goal contributions, or new records — for the
user to review and confirm, never auto-committed.**

Status: design agreed, not yet implemented. Branch: `claude/ai-smart-entry`.

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
| `investment.create` | `createInvestment` | — |
| `investment.contribution` | `recordContribution` | existing investment |
| `loan.create` | `createLoan` | — |
| `loan.payment` | `recordPayment` | existing loan |
| `goal.create` | `createGoal` | — |
| `goal.contribution` | `addContribution` | existing goal |
| `budget.create` | `createBudget` | category |
| `recurring.create` | `createRecurringRule` | category, account |

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

## UI plan (agreed)

**Entry point.** `/ai` gets a two-way segmented toggle at the top — **Ask /
Add** — reusing the existing income/expense pill pattern from
`transaction-form.tsx` (no new Tabs dependency). "Ask" is today's existing
card unchanged. "Add" is new.

**Composer.** Same shell as the current Ask box: `Card` + `Textarea` +
`Button`, submits to `POST /api/v1/ai/extract`. `Skeleton` while pending,
matching every other route's `loading.tsx` convention.

**Draft list — selection model (mobile-first: one primary CTA, not three
competing buttons).**
- Every draft card starts **checked by default** (opt-out — these came from
  the user's own prompt).
- A header row above the list: "Select all · N of M selected."
- A **sticky bottom action bar** whose single button's label tracks
  selection state: `"Add all (8)"` when everything's checked → `"Add
  selected (5)"` the moment something's unchecked → disabled `"Select at
  least one"` at zero. "Confirm all" and "confirm selected" are the *same*
  control, driven by checkbox state — not separate buttons.
  - Placement: the app's bottom tab bar is `fixed inset-x-0 bottom-0` (64px
    + safe-area) and page content reserves `pb-28` to clear it, so this bar
    docks at `fixed bottom-16` on mobile (same `bg-background/85
    backdrop-blur-lg` treatment as `BottomNav`, z-index just under it), and
    becomes an in-flow `sticky bottom-4` element on `lg+` where the sidebar
    replaces the tab bar.
- Each card also has its own small **"Add"** button — commits that one item
  immediately, independent of the checkboxes/batch bar (the **individual**
  case). Optimistic removal from the list on success, same pattern
  `transactions-view.tsx` uses for delete.
- Each card also has a discard `x` to drop it from the list without adding.

**Card anatomy** (top → bottom): leading checkbox · module `Icon` + `Badge`
(Expense/Income/Investment/Loan/Goal/Budget/Recurring) · amount/date row ·
category/account `Select` · description `Input` · anomaly warning banner
when the amount is flagged (soft, non-blocking) · "couldn't match — will
save uncategorized" note when a name reference didn't resolve · discard `x`
top-right · individual "Add" bottom-right.

All of the above reuses existing primitives only (`Card`, `Badge`, `Input`,
`Select`, `Textarea`, `Button`, `Skeleton`, `Icon`) — no new UI dependency.
Finalize any remaining visual details (module color-coding, grouping order)
during implementation review.

## Sequencing (not yet started)

- [ ] `src/lib/ai/capabilities/` registry + per-capability Zod re-exports.
- [ ] Extraction prompt template + DeepSeek JSON-mode call (verify
      `response_format: json_object` support before relying on it).
- [ ] `/api/v1/ai/extract` + `/api/v1/ai/commit` Route Handlers (session +
      future bearer-token auth, rate limiting, ownership re-checks).
- [ ] Name→id resolution against the user's real reference data.
- [ ] Anomaly guard (reuse existing analytics/history queries — no new
      calculation logic).
- [ ] `/ai` UI: mode toggle, composer, draft list, confirm/commit.
- [ ] Update `AGENTS.md` / financeos skill with the Route Handler exception.
- [ ] `npm run build` + mobile (390px) and desktop screenshot verification.

## Out of scope for this pass

- The actual MCP server exposing this registry to external clients (Phase
  4/5 candidate) — the registry's shape (`key`, `description`, `schema`,
  `execute`) is deliberately MCP-tool-shaped so that's a wrapper later, not a
  redesign.
- Receipt OCR / CSV import intelligence (separate Phase 3.4 items) — but the
  "treat interpolated text as data, not instructions" pattern established
  here is required groundwork for those, since they introduce genuinely
  third-party-sourced text.
