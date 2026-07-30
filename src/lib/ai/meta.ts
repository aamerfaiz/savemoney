import type { AIProviderMeta } from "./types";

/**
 * Plain data — safe to import from client components (the Settings form).
 * Adapter wiring itself lives in registry.ts (server-only).
 */
export const PROVIDER_META: AIProviderMeta[] = [
  {
    id: "deepseek",
    label: "DeepSeek (R1 Flash)",
    defaultModel: "deepseek-chat",
    keyPlaceholder: "sk-...",
    available: true,
  },
  {
    id: "openai",
    label: "OpenAI",
    defaultModel: "gpt-4o-mini",
    keyPlaceholder: "sk-...",
    available: false,
  },
  {
    id: "gemini",
    label: "Google Gemini",
    defaultModel: "gemini-1.5-flash",
    keyPlaceholder: "AIza...",
    available: false,
  },
  {
    id: "claude",
    label: "Anthropic Claude",
    defaultModel: "claude-sonnet-5",
    keyPlaceholder: "sk-ant-...",
    available: false,
  },
];
