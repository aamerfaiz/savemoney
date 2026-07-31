import "server-only";

import type { AIProvider, ChatMessage, ChatOptions } from "../types";

const BASE_URL = "https://api.deepseek.com";

async function complete(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
  jsonMode: boolean,
): Promise<string> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    // DeepSeek's chat completions API is OpenAI-compatible and accepts the
    // same `response_format: {type: "json_object"}` structured-output mode —
    // used only to make extraction more reliable. Callers must still parse +
    // Zod-validate the result themselves; this is never trusted on its own.
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`DeepSeek request failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content ?? "";
}

/** First provider adapter — DeepSeek R1 Flash, OpenAI-compatible chat API. */
export const deepseekProvider: AIProvider = {
  id: "deepseek",
  async testKey(apiKey, model = "deepseek-chat") {
    try {
      await complete(apiKey, model, [{ role: "user", content: "ping" }], 1, false);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Could not verify this key.",
      };
    }
  },
  async chat(apiKey, messages, model = "deepseek-chat", options?: ChatOptions) {
    return complete(
      apiKey,
      model,
      messages,
      options?.maxTokens ?? 800,
      options?.jsonMode ?? false,
    );
  },
};
