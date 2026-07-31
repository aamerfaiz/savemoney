import "server-only";

import { getCapability } from "../capabilities/registry";
import { loadReferenceData, type ReferenceData } from "../capabilities/shared";

export interface CommitItemInput {
  capability: string;
  fields: Record<string, unknown>;
  targetId?: string;
}

export interface CommitItemResult {
  capability: string;
  ok: boolean;
  error?: string;
}

/**
 * Re-validates and writes each item — the only place in Smart Entry a
 * database write happens. Never trusts `fields`/`targetId` as given, even
 * though they typically round-tripped through this same user's own
 * `/extract` call: the UI lets the user edit them, and a client can send
 * anything, so every item is independently re-run through its capability's
 * real Zod schema and (for contribution/payment capabilities) an explicit
 * check that the target row actually belongs to the caller — on top of, not
 * instead of, RLS. See "McHire" in docs/ai-smart-entry-plan.md for why the
 * ownership check is explicit rather than assumed.
 */
export async function commitDraftItems(
  items: CommitItemInput[],
): Promise<CommitItemResult[]> {
  const ref = await loadReferenceData();
  const results: CommitItemResult[] = [];

  for (const item of items) {
    const def = getCapability(item.capability);
    if (!def) {
      results.push({ capability: item.capability, ok: false, error: "Unknown capability." });
      continue;
    }

    const parsed = def.schema.safeParse(item.fields);
    if (!parsed.success) {
      results.push({
        capability: item.capability,
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid data.",
      });
      continue;
    }

    if (def.requiresTarget) {
      if (!item.targetId || !targetBelongsToUser(def.module, item.targetId, ref)) {
        results.push({ capability: item.capability, ok: false, error: "That record could not be found." });
        continue;
      }
    }

    const result = await def.execute(parsed.data as Record<string, unknown>, item.targetId);
    results.push({ capability: item.capability, ok: result.ok, error: result.error });
  }

  return results;
}

function targetBelongsToUser(
  module: string,
  targetId: string,
  ref: ReferenceData,
): boolean {
  if (module === "investment") return ref.investments.some((i) => i.id === targetId);
  if (module === "loan") return ref.loans.some((l) => l.id === targetId);
  if (module === "goal") return ref.goals.some((g) => g.id === targetId);
  return false;
}
