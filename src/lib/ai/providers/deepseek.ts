import "server-only";

import type { AIProvider, ChatMessage } from "../types";

const BASE_URL = "https://api.deepseek.com";

async function complete(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
): Promise<string> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
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
      await complete(apiKey, model, [{ role: "user", content: "ping" }], 1);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Could not verify this key.",
      };
    }
  },
  async chat(apiKey, messages, model = "deepseek-chat") {
    return complete(apiKey, model, messages, 800);
  },
};
