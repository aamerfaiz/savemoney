import { z } from "zod";

/**
 * Shared Zod schemas for vault Server Actions — kept out of actions.ts/
 * rotation-actions.ts because a `"use server"` file may only export async
 * functions, not plain values. Exporting these directly from actions.ts
 * (as `export const wrappedPayloadSchema = z.object(...)`) was a real bug
 * that shipped and broke every vault action in at least one deployment:
 * Next.js throws `A "use server" file can only export async functions,
 * found object` for any non-function export, TypeScript's own compiler
 * doesn't catch it, and this sandbox's `npm run build` didn't either —
 * only a real deployed instance actually invoking the code surfaced it.
 */

export const wrappedPayloadSchema = z.object({
  ciphertext: z.string().min(1),
  iv: z.string().min(1),
});

export const kdfParamsSchema = z.object({
  iterations: z.number().int().positive(),
  parallelism: z.number().int().positive(),
  memorySize: z.number().int().positive(),
  hashLength: z.number().int().positive(),
});
