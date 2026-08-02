"use client";

/**
 * Live progress for the client-side decrypt pass (Phase 3.5.10). Each
 * `useFinanceData`/`useSideData` (and the notifications page's own inline
 * fetch) registers a "chunk" keyed by its query key — `startChunk` sets the
 * row-weighted total the instant raw ciphertext arrives, `tickChunk` adds
 * to `completed` as each dataset's decrypt call resolves. Weighted by row
 * count (not by "number of datasets") so a 300-row expenses list moves the
 * bar proportionally more than a 3-row budgets list.
 *
 * A plain Zustand store rather than component state because the query that
 * owns the decrypt work (`useFinanceData`) and the component that displays
 * progress (`VaultGate`/an Authed*View's loading branch) aren't always the
 * same tree — Dashboard runs `useFinanceData` and `useSideData` in
 * parallel and wants their combined percentage.
 */

import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

interface Chunk {
  completed: number;
  total: number;
}

interface DecryptProgressState {
  chunks: Record<string, Chunk>;
  startChunk: (key: string, total: number) => void;
  tickChunk: (key: string, n: number) => void;
}

export const useDecryptProgressStore = create<DecryptProgressState>((set) => ({
  chunks: {},
  startChunk: (key, total) =>
    set((s) => ({ chunks: { ...s.chunks, [key]: { completed: 0, total } } })),
  tickChunk: (key, n) =>
    set((s) => {
      const c = s.chunks[key];
      if (!c) return s;
      return { chunks: { ...s.chunks, [key]: { ...c, completed: c.completed + n } } };
    }),
}));

/** Wrap a decrypt promise so it reports `n` rows done against `key` when it
 * settles — used inline around each `Promise.all` entry in
 * useFinanceData/useSideData rather than threading a callback into every
 * decrypt*Rows function in decrypt.ts. */
export function withProgress<T>(key: string, n: number, promise: Promise<T>): Promise<T> {
  return promise.then((result) => {
    useDecryptProgressStore.getState().tickChunk(key, n);
    return result;
  });
}

/** Aggregates only the given chunk keys — pass exactly the query keys a
 * page actually awaits (e.g. just `["finance-side-data"]` for Goals), not
 * every key that's ever been registered this session. A page that only
 * reads `useSideData` shouldn't have its progress diluted (or falsely
 * completed) by a `finance-data` chunk some other page finished earlier.
 *
 * Wrapped in `useShallow`: the selector below builds a fresh `{ percent,
 * known }` object every call, and Zustand's `useSyncExternalStore`-backed
 * subscription requires `getSnapshot()` to return a referentially stable
 * result when the underlying state hasn't changed. Without `useShallow`
 * (which compares the returned object's own fields instead of its
 * reference), every store update anywhere — even to an unrelated key —
 * looks like a change, which React detects as an unstable snapshot and
 * responds to by re-rendering forever ("Maximum update depth exceeded"). */
export function useDecryptProgress(keys: string[]) {
  return useDecryptProgressStore(
    useShallow((s) => {
      let completed = 0;
      let total = 0;
      for (const key of keys) {
        const c = s.chunks[key];
        if (c) {
          completed += c.completed;
          total += c.total;
        }
      }
      return {
        percent: total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 100,
        /** False while still waiting on the network fetch (no row counts to
         * weight by yet) — callers show an indeterminate state until then. */
        known: total > 0,
      };
    }),
  );
}
