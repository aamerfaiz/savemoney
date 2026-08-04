"use client";

/**
 * Device-local storage for the PIN-wrapped DEK (Phase 3.5.6 quick-unlock).
 * Plain `indexedDB` — no server round trip, never synced, and deliberately
 * not behind the shared Supabase/Drizzle layer, since this data must never
 * leave this browser profile. Keyed by `userId` so switching accounts on a
 * shared device can't accidentally serve one user's cached wrap to another.
 */

import type { Argon2Params, EncryptedPayload } from "./crypto";

const DB_NAME = "finance-os-vault";
const DB_VERSION = 1;
const STORE = "pin-wraps";

export interface PinWrapRecord {
  userId: string;
  wrap: EncryptedPayload;
  salt: string;
  kdfParams: Argon2Params;
  failedAttempts: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "userId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function savePinWrap(
  userId: string,
  wrap: EncryptedPayload,
  salt: string,
  kdfParams: Argon2Params,
): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ userId, wrap, salt, kdfParams, failedAttempts: 0 });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getPinWrap(userId: string): Promise<PinWrapRecord | null> {
  const db = await openDb();
  const record = await new Promise<PinWrapRecord | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(userId);
    req.onsuccess = () => resolve((req.result as PinWrapRecord | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return record;
}

export async function clearPinWrap(userId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(userId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** Increments the local failed-attempt counter and returns the new count.
 * The caller wipes the wrap once this crosses `PIN_MAX_ATTEMPTS`. */
export async function recordFailedPinAttempt(userId: string): Promise<number> {
  const db = await openDb();
  const count = await new Promise<number>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.get(userId);
    req.onsuccess = () => {
      const rec = req.result as PinWrapRecord | undefined;
      if (!rec) {
        resolve(0);
        return;
      }
      rec.failedAttempts += 1;
      store.put(rec);
      resolve(rec.failedAttempts);
    };
    req.onerror = () => reject(req.error);
  });
  db.close();
  return count;
}

export async function resetPinAttempts(userId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.get(userId);
    req.onsuccess = () => {
      const rec = req.result as PinWrapRecord | undefined;
      if (rec) {
        rec.failedAttempts = 0;
        store.put(rec);
      }
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
  db.close();
}
