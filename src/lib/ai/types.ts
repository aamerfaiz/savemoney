export type AIProviderId = "deepseek" | "openai" | "gemini" | "claude";

export interface AIProviderMeta {
  id: AIProviderId;
  label: string;
  defaultModel: string;
  keyPlaceholder: string;
  /** Only providers with a registered adapter are usable; others show as "coming soon". */
  available: boolean;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * One adapter per vendor. AI features call through `resolver.ts`, never an
 * adapter or vendor SDK directly, so adding a provider never touches a
 * feature's code — see AGENTS.md "AI providers & user API keys".
 */
export interface AIProvider {
  id: AIProviderId;
  /** Verify a key actually works before it's ever persisted. */
  testKey(apiKey: string, model?: string): Promise<{ ok: boolean; error?: string }>;
  chat(apiKey: string, messages: ChatMessage[], model?: string): Promise<string>;
}
