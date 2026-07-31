import "server-only";

import { getAnalyticsData } from "@/lib/analytics/queries";
import type { AnalyticsData } from "@/lib/analytics/types";

import { loadReferenceData } from "../capabilities/shared";
import { getCapability } from "../capabilities/registry";
import { checkAnomaly } from "./anomaly";
import type { ExtractedItem } from "./extract";

export interface DraftResult {
  /** Stable within one extraction response — the position in the list. */
  id: string;
  capability: string;
  moduleLabel: string;
  ok: boolean;
  /** Validated, ready-to-submit fields — present only when `ok`. */
  fields?: Record<string, unknown>;
  targetId?: string;
  targetLabel?: string;
  /** Non-blocking notes: unresolved references, soft anomaly flags. */
  warnings: string[];
  error?: string;
  sourceText?: string;
}

/**
 * Deterministic, server-side pass over the model's raw proposal: resolve
 * every name reference against the user's own rows, run each item through
 * its capability's real Zod schema, and flag (never block) soft anomalies.
 * Nothing here writes to the database.
 */
export async function resolveDraftItems(items: ExtractedItem[]): Promise<DraftResult[]> {
  const [ref, analytics] = await Promise.all([loadReferenceData(), safeAnalytics()]);

  return items.map((item, index) => {
    const id = `draft-${index}`;
    const def = getCapability(item.capability);
    if (!def) {
      return {
        id,
        capability: item.capability,
        moduleLabel: "Unknown",
        ok: false,
        warnings: [],
        error: `Unrecognized capability "${item.capability}".`,
        sourceText: item.sourceText,
      };
    }

    const outcome = def.resolve(item.args ?? {}, ref);
    const warnings = [...outcome.warnings];
    if (outcome.ok && outcome.fields) {
      const anomaly = checkAnomaly(def.key, outcome.fields, outcome.targetLabel, ref, analytics);
      if (anomaly) warnings.push(anomaly);
    }

    return {
      id,
      capability: def.key,
      moduleLabel: def.label,
      ok: outcome.ok,
      fields: outcome.fields,
      targetId: outcome.targetId,
      targetLabel: outcome.targetLabel,
      warnings,
      error: outcome.error,
      sourceText: item.sourceText,
    };
  });
}

async function safeAnalytics(): Promise<AnalyticsData | null> {
  try {
    return await getAnalyticsData();
  } catch {
    // Anomaly warnings are a soft nice-to-have — never fail the whole
    // extraction because the analytics query hiccuped.
    return null;
  }
}
