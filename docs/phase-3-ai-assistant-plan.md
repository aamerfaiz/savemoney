# Phase 3 — AI Assistant (BYOK) plan

Status tracker for the AI Assistant module described in `AGENTS.md` /
the `financeos` skill. Each phase below is a placeholder for a build
increment — check items off (or replace `[ ]` with `[x]`) as they land, and
extend this file rather than starting a new one when new AI features are
added.

## UI flow (product decision — locked)

- **Bottom nav** goes from `Dashboard · Transactions · Budget · Goals ·
  Analytics` to `Dashboard · Transactions · AI · Goals · Analytics`. Budget
  moves to secondary nav (still reachable from the drawer / desktop sidebar).
- **AI** occupies the center slot and is visually distinct from the other four
  (raised, filled brand color) — the way a center action button reads on
  mobile finance/social apps.
- Tapping **AI** opens `/ai`.
  - **No active provider key** → the page shows a "Connect your AI provider"
    prompt with a path to **Settings → AI & Integrations**, where the user
    pastes a key (BYOK), tests it, and saves it.
  - **Active key present** → the page unlocks AI Mode: ask-a-question first,
    with the rest of the feature list (below) rolling in behind the same
    gate as each one ships.

## Phase 3.0 — Nav shell + gating (this build)

- [x] `AI` added to `nav-config.ts` as the center primary item (accent style).
- [x] `Budget` demoted from primary (still in the full nav).
- [x] `/ai` route: gates on "does the user have an active provider key."
- [x] Settings → new "AI & Integrations" card (add/test/activate/delete keys).
- [x] Guest mode: `AI` (and every other non-guest-capable route) hidden from
      nav and blocked server-side — BYOK is inherently tied to a real
      `auth.users` row, so there's no guest-mode story for it. See
      "Guest mode" below.

## Guest mode

Guest sessions run entirely client-side against IndexedDB (`src/lib/guest/`)
and only two routes have real guest data support: `/dashboard` and
`/transactions` (`GUEST_ALLOWED_PATHS` in `src/lib/guest/constants.ts`).
Every other route — Budget, Goals, AI, Settings, etc. — reads through the
real Supabase client and assumes a signed-in user. Two layers keep guests
away from those safely:

1. `src/lib/supabase/middleware.ts` redirects a guest session hitting a
   non-allowed path straight to `/dashboard`, server-side, before any query
   runs.
2. `src/components/nav/nav-config.ts`'s `visibleNavItems()` filters the
   bottom bar, the mobile drawer, and the desktop sidebar down to the
   guest-allowed set, so there's no dead-end link to begin with.

Extend `GUEST_ALLOWED_PATHS` only alongside adding real IndexedDB-backed
guest data for that module — don't add a route there without one.

## Phase 3.1 — Secure key storage (this build)

- [x] `private.ai_provider_keys` table (own Postgres schema, **not** exposed
      to PostgREST — the anon/authenticated API roles cannot `SELECT` it at
      all, RLS is a second layer on top of that).
- [x] AES-256-GCM envelope encryption at rest (`AI_KEYS_ENCRYPTION_KEY`,
      server-only secret). Only `key_last4` is ever readable in plaintext.
- [x] Server Actions: `saveProviderKey`, `testProviderKey`, `setActiveKey`,
      `deleteProviderKey` — plaintext key touches server memory only, for the
      duration of the call, never logged.

## Phase 3.2 — Provider abstraction (this build)

- [x] `AIProvider` interface (`chat`, `testKey`) in `src/lib/ai/types.ts`.
- [x] `registry.ts` — provider id → adapter, so Settings and the resolver
      never hard-code a vendor.
- [x] `providers/deepseek.ts` — first adapter (DeepSeek R1 Flash / chat
      completions endpoint).
- [x] `resolver.ts` — the single chokepoint: loads the user's active key,
      decrypts, dispatches to the right adapter. Every AI feature below calls
      through this, never a vendor SDK directly.
- [ ] `providers/openai.ts`, `providers/gemini.ts`, `providers/claude.ts` —
      one file each, registered in `registry.ts`. (placeholder)

## Phase 3.3 — First feature: Ask a question (this build, minimal)

- [x] `/ai` renders a simple ask box once a key is active; calls
      `resolver` → `chat()` with the user's raw question.
- [x] `src/lib/ai/context.ts` — `buildFinanceContext()` composes a compact,
      human-readable snapshot (safe-to-spend, this month's income/expenses/
      savings rate, per-category budget status, goals, loans, investments,
      net worth, health score) from the same module queries/finance engines
      the dashboard uses — never recomputed by hand. `askAssistant` folds
      this into the system prompt so answers are grounded in real numbers;
      it falls back to a generic assistant (no crash) if a query hiccups.
- [ ] Feed recent individual transactions in too (not just aggregates), if
      users start asking about specific purchases. (placeholder)
- [ ] Conversation history / multi-turn memory. (placeholder)
- [ ] Streaming responses. (placeholder)

## Phase 3.4 — Remaining AI features (placeholders, not yet built)

- [x] **AI Smart Entry** — prompt → structured draft (create, edit, or
      delete a transaction, investment, loan, goal, budget, or recurring
      rule) → human-confirmed → committed through the existing module
      actions. Create/log capabilities shipped in PR #14 (merged); edit and
      delete capabilities followed on the same branch, new PR. See
      `docs/ai-smart-entry-plan.md`. This is the shared plumbing (capability
      registry, propose-then-confirm draft pattern, name→id resolution,
      data-guard prompting) the next three items below are designed to reuse
      rather than each building their own pipeline.
- [ ] Monthly summary (`summarize()` over the month's transactions +
      analytics data).
- [ ] Expense insights / anomaly callouts on the dashboard — broader version
      of Smart Entry's per-draft anomaly warning (patterns over time, not
      just one entry).
- [ ] Receipt OCR → auto-filled transaction draft — a new *extraction
      source* feeding the same Smart Entry draft/confirm pipeline, not a
      separate flow.
- [ ] CSV import intelligence (smarter `detectMapping` suggestions from the
      AI, layered on the existing pure `src/lib/import/pipeline.ts`) — same
      propose-then-confirm shape the CSV wizard already uses, which is what
      Smart Entry's draft list was modeled on.
- [ ] Auto-categorization suggestions on uncategorized transactions — reuses
      Smart Entry's name→id category-resolution logic against existing rows
      instead of freshly extracted ones.
- [ ] What-if simulator ("can I afford a car?") — a dedicated finance engine
      in `src/lib/finance/`, AI narrates the pure-function output rather than
      computing numbers itself. Unrelated to Smart Entry (read-only
      narration, not data entry).

## Phase 3.5 — End-to-end encryption ("not even me")

Not part of the original Phase 3 spec — added after a security-model
discussion concluded that server-side envelope encryption (this file's
Phase 3.1/3.2 model, `AI_KEYS_ENCRYPTION_KEY`) isn't sufficient once the
bar is "even the developer can't read it," not just "a DB leak can't read
it." Scope reaches every financial table, not just the AI keys, so it's
tracked in its own doc rather than inline here.

- [ ] Design only, not started. Full plan, phase-wise build (3.5.0–3.5.8),
      and open questions: `docs/e2ee-path-b-plan.md`.

## Out of scope for Phase 3 (later phases per the roadmap)

- Phase 4: SMS/Bank/Email import feeding the same pipeline.
- Phase 5: native mobile.

## Rollout note

`drizzle/0006_white_scorpion.sql` (generated: `private` schema, `ai_provider`
enum, `ai_provider_keys` table) and `drizzle/manual/0006_ai_provider_keys_rls.sql`
(RLS + PostgREST-role revokes) are **applied** to the `FinanceOS` Supabase
project (`ucgholzcnqqwwentdaqt`) via the Supabase MCP — `list_tables` confirms
`private.ai_provider_keys` exists with RLS enabled and a clean security
advisor pass. `AI_KEYS_ENCRYPTION_KEY` is set in Vercel — Phase 3.0/3.1/3.2
are now live end-to-end against the real deployment (DeepSeek only; save a
key in Settings → AI & Integrations to try it).
