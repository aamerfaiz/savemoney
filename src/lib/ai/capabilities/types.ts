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
   * both inside `resolve()` and again, independently, at commit time. */
  schema: z.ZodTypeAny;
  /** True for "log against an existing row" capabilities (contribution/
   * payment) — these need a resolved target id before they can execute. */
  requiresTarget: boolean;
  /**
   * Turn the model's raw, name-based args into validated, id-based fields.
   * Never invents an id: a name that doesn't match one of the user's own
   * rows is left unresolved and reported in `warnings`, not guessed.
   */
  resolve: (
    args: Record<string, unknown>,
    ref: ReferenceData,
  ) => ResolveOutcome & { targetId?: string; targetLabel?: string };
  /** Calls the real, unmodified Server Action. The only place a write
   * happens for this capability. */
  execute: (
    fields: Record<string, unknown>,
    targetId?: string,
  ) => Promise<{ ok: boolean; error?: string }>;
}
