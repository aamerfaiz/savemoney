import "server-only";

import type { z } from "zod";

import type { ReferenceData } from "./shared";

export interface ResolveOutcome {
  ok: boolean;
  /** Fields ready to submit, already run through the module's real Zod
   * schema — nothing downstream re-derives or re-guesses these. */
  fields?: Record<string, unknown>;
  /** Non-blocking notes: unresolved name references, soft anomaly flags. */
  warnings: string[];
  /** Set when the item can't be turned into a valid draft at all. */
  error?: string;
}

/**
 * One entry per existing create/log Server Action — see
 * `docs/ai-smart-entry-plan.md`. This is deliberately shaped like an MCP
 * tool definition (key, description, schema, handler) so a future MCP
 * server can wrap this registry directly rather than being redesigned.
 */
export interface AICapability {
  key: string;
  module:
    | "transaction"
    | "investment"
    | "loan"
    | "goal"
    | "budget"
    | "recurring";
  label: string;
  /** Fed verbatim into the extraction system prompt — the model's only
   * description of what this capability does and what fields it takes. */
  promptDescription: string;
  /** The module's real, imported Zod schema — never redefined here. Used
   * both inside `resolve()` and again, independently, at commit time.
   * Delete capabilities use a trivial schema (just enough to carry any
   * routing info, e.g. a transaction's income/expense kind) since there are
   * no editable fields. */
  schema: z.ZodTypeAny;
  /** True for capabilities that act on an existing row — log-against
   * (contribution/payment), edit, and delete all need a resolved target id
   * before they can execute; plain creates don't. */
  requiresTarget: boolean;
  /** Drives the confirm UI: default selection (destructive actions are
   * opt-in, never opt-out) and the per-card action button's label/style. */
  destructive: boolean;
  actionLabel: "Add" | "Save" | "Delete";
  /**
   * Turn the model's raw, name-based args into validated, ready-to-submit
   * fields. Never invents an id: a name that doesn't match one of the
   * user's own rows is left unresolved and reported in `warnings` (for
   * log-against capabilities, where the rest of the draft can still stand)
   * or `error` (for edit/delete, which have nothing valid to show without a
   * resolved target — see docs/ai-smart-entry-plan.md). Async because edit
   * capabilities fetch the target's current row to merge unmentioned fields
   * onto, rather than wiping them.
   */
  resolve: (
    args: Record<string, unknown>,
    ref: ReferenceData,
  ) => Promise<ResolveOutcome & { targetId?: string; targetLabel?: string }>;
  /** Calls the real, unmodified Server Action. The only place a write
   * happens for this capability. */
  execute: (
    fields: Record<string, unknown>,
    targetId?: string,
  ) => Promise<{ ok: boolean; error?: string }>;
}
