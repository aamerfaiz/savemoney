import "server-only";

import type { AIProvider, AIProviderId } from "./types";
import { deepseekProvider } from "./providers/deepseek";

/**
 * Provider id -> adapter. New vendors are one adapter file (see
 * providers/deepseek.ts) plus one line here — nothing else changes.
 */
const adapters: Partial<Record<AIProviderId, AIProvider>> = {
  deepseek: deepseekProvider,
};

export function getProvider(id: AIProviderId): AIProvider {
  const adapter = adapters[id];
  if (!adapter) {
    throw new Error(`No adapter registered for provider "${id}" yet.`);
  }
  return adapter;
}
