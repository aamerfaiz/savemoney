import "server-only";

import type { AICapability } from "./types";
import { CAPABILITY_DEFINITIONS } from "./definitions";

const BY_KEY = new Map(CAPABILITY_DEFINITIONS.map((c) => [c.key, c]));

/** The model may only ever select a key from this closed list — it can
 * never name an arbitrary function, table, or column. */
export function getCapability(key: string): AICapability | undefined {
  return BY_KEY.get(key);
}

export function listCapabilities(): AICapability[] {
  return CAPABILITY_DEFINITIONS;
}

/** The capability list as fed into the extraction system prompt. */
export function buildCapabilityManifest(): string {
  return CAPABILITY_DEFINITIONS.map((c) => `- "${c.key}": ${c.promptDescription}`).join(
    "\n",
  );
}
