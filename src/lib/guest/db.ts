import { get, set, del } from "idb-keyval";

/**
 * Guest mode's storage layer. Every "table" is one idb-keyval key holding a
 * plain JSON array — no schema migrations to manage, and it mirrors the
 * shape each row already has elsewhere in the app (Transaction, GoalSummary,
 * etc.), so the same finance engines can consume it unchanged.
 */
const KEY_PREFIX = "financeos:guest:";

export type GuestTable =
  | "transactions"
  | "categories"
  | "accounts"
  | "goals"
  | "loans"
  | "investments"
  | "recurringRules"
  | "budgetLimits"
  | "profile"
  | "seeded";

const ALL_TABLES: GuestTable[] = [
  "transactions",
  "categories",
  "accounts",
  "goals",
  "loans",
  "investments",
  "recurringRules",
  "budgetLimits",
  "profile",
  "seeded",
];

export async function getGuestTable<T>(table: GuestTable): Promise<T | undefined> {
  return get(KEY_PREFIX + table);
}

export async function setGuestTable<T>(table: GuestTable, value: T): Promise<void> {
  await set(KEY_PREFIX + table, value);
}

export async function clearGuestDb(): Promise<void> {
  await Promise.all(ALL_TABLES.map((t) => del(KEY_PREFIX + t)));
}
