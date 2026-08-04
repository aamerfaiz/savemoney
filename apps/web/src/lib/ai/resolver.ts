import "server-only";

import { getProvider } from "./registry";
import type { AIProviderId, ChatMessage, ChatOptions } from "./types";

/**
 * The one chokepoint every AI feature calls through to reach a vendor —
 * never call a provider adapter or vendor SDK directly from a feature, see
 * AGENTS.md "AI providers & user API keys".
 *
 * Under Phase 3.5 ("not even me") the server can no longer decrypt a stored
 * key itself — there is no server-held key that can. Callers must already
 * hold the plaintext key, decrypted client-side from the vault DEK and
 * forwarded once, transiently, in the same request as this call (the
 * transient relay — see docs/e2ee-path-b-plan.md "Resolved: the AI
 * Assistant conflict"). This function never logs or persists it.
 */
export async function chatWithProvider(
  apiKey: string,
  providerId: AIProviderId,
  model: string | undefined,
  messages: ChatMessage[],
  options?: ChatOptions,
): Promise<string> {
  const provider = getProvider(providerId);
  return provider.chat(apiKey, messages, model, options);
}
