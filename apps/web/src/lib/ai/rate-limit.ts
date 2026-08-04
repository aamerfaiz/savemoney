import "server-only";

/**
 * Best-effort, per-instance rate limiting for the AI endpoints — protects
 * against a runaway client hammering the extraction/commit routes within one
 * warm serverless instance. This is NOT a durable limit: it resets on cold
 * start and isn't shared across instances, so it must not be treated as the
 * real security boundary (that's auth + RLS + per-row ownership, see
 * docs/ai-smart-entry-plan.md). A shared store (e.g. a DB-backed counter or
 * Redis) is the follow-up for a durable limit — tracked there, not built
 * here to avoid adding infra this pass doesn't otherwise need.
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;

const hits = new Map<string, number[]>();

export function checkRateLimit(userId: string, bucket: string): { ok: boolean } {
  const key = `${bucket}:${userId}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);

  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(key, recent);
    return { ok: false };
  }

  recent.push(now);
  hits.set(key, recent);
  return { ok: true };
}
