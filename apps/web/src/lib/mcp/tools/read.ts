import "server-only";

/**
 * Read tools (Phase 3.5.9). Every query filters explicitly by
 * `session.userId` — there is no RLS session on an MCP call (the bearer
 * token is the entire credential), so this file is the enforcement point,
 * same discipline as vault/rotation-actions.ts and backfill-actions.ts.
 *
 * Depth respects `session.scope`: `read_summary` never decrypts or
 * returns a real amount, only structural/plaintext fields (dates,
 * categories, counts) plus a `redacted: true` marker; `read_full`
 * decrypts every packed field via mcp/server-crypto.ts's transient DEK.
 */

import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db";
import type { McpSession } from "../session";
import { decryptPacked } from "../server-crypto";
import { loadAccountMap, loadCategoryMap } from "./shared";

async function decryptOrNull(value: string | null, dek: CryptoKey): Promise<number | null> {
  if (value === null) return null;
  try {
    return Number(await decryptPacked(value, dek));
  } catch {
    return null; // pre-migration/undecryptable row — never surfaced as a crash
  }
}

const dateRangeShape = {
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("ISO date, inclusive. Defaults to 90 days ago."),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("ISO date, inclusive. Defaults to today."),
  limit: z.number().int().min(1).max(200).default(50),
};

export const listTransactionsSchema = {
  kind: z.enum(["income", "expense", "both"]).default("both"),
  ...dateRangeShape,
};

export async function listTransactions(session: McpSession, args: z.infer<z.ZodObject<typeof listTransactionsSchema>>) {
  if (!db) return { error: "Database isn't configured in this environment." };
  const from = args.fromDate ?? new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
  const to = args.toDate ?? new Date().toISOString().slice(0, 10);
  const [categoryMap, accountMap] = await Promise.all([
    loadCategoryMap(session.userId),
    loadAccountMap(session.userId),
  ]);

  const rows: Record<string, unknown>[] = [];

  if (args.kind !== "expense") {
    const incomeRows = await db
      .select()
      .from(schema.income)
      .where(and(eq(schema.income.userId, session.userId), isNull(schema.income.deletedAt), gte(schema.income.receivedAt, from)))
      .orderBy(desc(schema.income.receivedAt))
      .limit(args.limit);
    for (const r of incomeRows) {
      if (r.receivedAt > to) continue;
      rows.push({
        id: r.id,
        kind: "income",
        date: r.receivedAt,
        currency: r.currency,
        category: r.categoryId ? categoryMap.get(r.categoryId)?.name ?? null : null,
        account: r.accountId ? accountMap.get(r.accountId) ?? null : null,
        sourceType: r.sourceType,
        amount: session.scope === "read_full" ? await decryptOrNull(r.amount, session.dek) : undefined,
        description:
          session.scope === "read_full" && r.description
            ? await decryptOrNullSafe(r.description, session.dek)
            : undefined,
        redacted: session.scope !== "read_full",
      });
    }
  }

  if (args.kind !== "income") {
    const expenseRows = await db
      .select()
      .from(schema.expenses)
      .where(and(eq(schema.expenses.userId, session.userId), isNull(schema.expenses.deletedAt), gte(schema.expenses.spentAt, from)))
      .orderBy(desc(schema.expenses.spentAt))
      .limit(args.limit);
    for (const r of expenseRows) {
      if (r.spentAt > to) continue;
      rows.push({
        id: r.id,
        kind: "expense",
        date: r.spentAt,
        currency: r.currency,
        category: r.categoryId ? categoryMap.get(r.categoryId)?.name ?? null : null,
        account: r.accountId ? accountMap.get(r.accountId) ?? null : null,
        amount: session.scope === "read_full" ? await decryptOrNull(r.amount, session.dek) : undefined,
        description:
          session.scope === "read_full" && r.description ? await decryptOrNullSafe(r.description, session.dek) : undefined,
        note: session.scope === "read_full" && r.note ? await decryptOrNullSafe(r.note, session.dek) : undefined,
        redacted: session.scope !== "read_full",
      });
    }
  }

  rows.sort((a, b) => ((a.date as string) < (b.date as string) ? 1 : -1));
  return { transactions: rows.slice(0, args.limit), count: rows.length };
}

async function decryptOrNullSafe(value: string, dek: CryptoKey): Promise<string | null> {
  try {
    return await decryptPacked(value, dek);
  } catch {
    return null;
  }
}

export const listBudgetsSchema = {};
export async function listBudgets(session: McpSession) {
  if (!db) return { error: "Database isn't configured in this environment." };
  const categoryMap = await loadCategoryMap(session.userId);
  const rows = await db
    .select()
    .from(schema.budgets)
    .where(and(eq(schema.budgets.userId, session.userId), isNull(schema.budgets.deletedAt)));
  return {
    budgets: await Promise.all(
      rows.map(async (b) => ({
        id: b.id,
        category: b.categoryId ? categoryMap.get(b.categoryId)?.name ?? "Overall" : "Overall",
        period: b.period,
        currency: b.currency,
        startsOn: b.startsOn,
        amount: session.scope === "read_full" ? await decryptOrNull(b.amount, session.dek) : undefined,
        redacted: session.scope !== "read_full",
      })),
    ),
  };
}

export const listGoalsSchema = {};
export async function listGoals(session: McpSession) {
  if (!db) return { error: "Database isn't configured in this environment." };
  const rows = await db
    .select()
    .from(schema.goals)
    .where(and(eq(schema.goals.userId, session.userId), isNull(schema.goals.deletedAt)));
  return {
    goals: await Promise.all(
      rows.map(async (g) => ({
        id: g.id,
        name: g.name,
        priority: g.priority,
        status: g.status,
        deadline: g.deadline,
        currency: g.currency,
        targetAmount: session.scope === "read_full" ? await decryptOrNull(g.targetAmount, session.dek) : undefined,
        currentAmount: session.scope === "read_full" ? await decryptOrNull(g.currentAmount, session.dek) : undefined,
        monthlyContribution:
          session.scope === "read_full" ? await decryptOrNull(g.monthlyContribution, session.dek) : undefined,
        redacted: session.scope !== "read_full",
      })),
    ),
  };
}

export const listLoansSchema = {};
export async function listLoans(session: McpSession) {
  if (!db) return { error: "Database isn't configured in this environment." };
  const rows = await db
    .select()
    .from(schema.loans)
    .where(and(eq(schema.loans.userId, session.userId), isNull(schema.loans.deletedAt)));
  return {
    loans: await Promise.all(
      rows.map(async (l) => ({
        id: l.id,
        name: l.name,
        type: l.type,
        interestRate: Number(l.interestRate),
        remainingMonths: l.remainingMonths,
        currency: l.currency,
        startDate: l.startDate,
        principal: session.scope === "read_full" ? await decryptOrNull(l.principal, session.dek) : undefined,
        emi: session.scope === "read_full" ? await decryptOrNull(l.emi, session.dek) : undefined,
        remainingAmount:
          session.scope === "read_full" ? await decryptOrNull(l.remainingAmount, session.dek) : undefined,
        extraEmi: session.scope === "read_full" ? await decryptOrNull(l.extraEmi, session.dek) : undefined,
        redacted: session.scope !== "read_full",
      })),
    ),
  };
}

export const listInvestmentsSchema = {};
export async function listInvestments(session: McpSession) {
  if (!db) return { error: "Database isn't configured in this environment." };
  const rows = await db
    .select()
    .from(schema.investments)
    .where(and(eq(schema.investments.userId, session.userId), isNull(schema.investments.deletedAt)));
  return {
    investments: await Promise.all(
      rows.map(async (i) => ({
        id: i.id,
        name: i.name,
        type: i.type,
        expectedReturn: Number(i.expectedReturn),
        currency: i.currency,
        startDate: i.startDate,
        investedAmount: session.scope === "read_full" ? await decryptOrNull(i.investedAmount, session.dek) : undefined,
        currentValue: session.scope === "read_full" ? await decryptOrNull(i.currentValue, session.dek) : undefined,
        monthlyContribution:
          session.scope === "read_full" ? await decryptOrNull(i.monthlyContribution, session.dek) : undefined,
        redacted: session.scope !== "read_full",
      })),
    ),
  };
}

export const listRecurringRulesSchema = {};
export async function listRecurringRules(session: McpSession) {
  if (!db) return { error: "Database isn't configured in this environment." };
  const categoryMap = await loadCategoryMap(session.userId);
  const rows = await db
    .select()
    .from(schema.recurringRules)
    .where(and(eq(schema.recurringRules.userId, session.userId), isNull(schema.recurringRules.deletedAt)));
  return {
    rules: await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        name: r.name,
        kind: r.kind,
        category: r.categoryId ? categoryMap.get(r.categoryId)?.name ?? null : null,
        frequency: r.frequency,
        interval: r.interval,
        startDate: r.startDate,
        endDate: r.endDate,
        isActive: r.isActive,
        currency: r.currency,
        amount: session.scope === "read_full" ? await decryptOrNull(r.amount, session.dek) : undefined,
        redacted: session.scope !== "read_full",
      })),
    ),
  };
}

export const listCollectionsSchema = {};
export async function listCollections(session: McpSession) {
  if (!db) return { error: "Database isn't configured in this environment." };
  const rows = await db
    .select()
    .from(schema.collections)
    .where(and(eq(schema.collections.userId, session.userId), isNull(schema.collections.deletedAt)));

  // Totals are never stored (see schema.ts's comment on `collections`) —
  // summed here from decrypted contributions, same as the client does.
  const totals = new Map<string, number>();
  const counts = new Map<string, number>();
  if (session.scope === "read_full" && rows.length > 0) {
    const contributionRows = await db
      .select()
      .from(schema.collectionContributions)
      .where(
        and(
          eq(schema.collectionContributions.userId, session.userId),
          isNull(schema.collectionContributions.deletedAt),
        ),
      );
    for (const c of contributionRows) {
      const amount = await decryptOrNull(c.amount, session.dek);
      if (amount == null) continue;
      totals.set(c.collectionId, (totals.get(c.collectionId) ?? 0) + amount);
      counts.set(c.collectionId, (counts.get(c.collectionId) ?? 0) + 1);
    }
  }

  return {
    collections: await Promise.all(
      rows.map(async (c) => ({
        id: c.id,
        title: c.title,
        purpose: c.purpose,
        currency: c.currency,
        eventDate: c.eventDate,
        status: c.status,
        targetAmount: session.scope === "read_full" ? await decryptOrNull(c.targetAmount, session.dek) : undefined,
        totalCollected: session.scope === "read_full" ? (totals.get(c.id) ?? 0) : undefined,
        contributorCount: session.scope === "read_full" ? (counts.get(c.id) ?? 0) : undefined,
        redacted: session.scope !== "read_full",
      })),
    ),
  };
}

export const getCollectionSchema = { id: z.string().uuid() };
export async function getCollection(session: McpSession, args: { id: string }) {
  if (!db) return { error: "Database isn't configured in this environment." };
  const [row] = await db
    .select()
    .from(schema.collections)
    .where(and(eq(schema.collections.id, args.id), eq(schema.collections.userId, session.userId), isNull(schema.collections.deletedAt)))
    .limit(1);
  if (!row) return { error: "No collection with that id." };

  const contributionRows = await db
    .select()
    .from(schema.collectionContributions)
    .where(
      and(
        eq(schema.collectionContributions.collectionId, args.id),
        eq(schema.collectionContributions.userId, session.userId),
        isNull(schema.collectionContributions.deletedAt),
      ),
    );

  const contributors = await Promise.all(
    contributionRows.map(async (c) => ({
      id: c.id,
      contributorName: session.scope === "read_full" ? await decryptOrNullSafe(c.contributorName, session.dek) : undefined,
      amount: session.scope === "read_full" ? await decryptOrNull(c.amount, session.dek) : undefined,
      contributedAt: c.contributedAt,
      method: c.method,
      redacted: session.scope !== "read_full",
    })),
  );
  const totalCollected =
    session.scope === "read_full"
      ? contributors.reduce((sum, c) => sum + (c.amount ?? 0), 0)
      : undefined;

  return {
    collection: {
      id: row.id,
      title: row.title,
      purpose: row.purpose,
      currency: row.currency,
      eventDate: row.eventDate,
      status: row.status,
      targetAmount: session.scope === "read_full" ? await decryptOrNull(row.targetAmount, session.dek) : undefined,
      payoutAmount: session.scope === "read_full" ? await decryptOrNull(row.payoutAmount, session.dek) : undefined,
      payoutAt: row.payoutAt,
      totalCollected,
      redacted: session.scope !== "read_full",
    },
    contributors,
  };
}

export const getNetWorthSchema = {};
export async function getNetWorth(session: McpSession) {
  if (!db) return { error: "Database isn't configured in this environment." };
  const [snapshot] = await db
    .select()
    .from(schema.netWorthSnapshots)
    .where(and(eq(schema.netWorthSnapshots.userId, session.userId), isNull(schema.netWorthSnapshots.deletedAt)))
    .orderBy(desc(schema.netWorthSnapshots.capturedAt))
    .limit(1);

  if (!snapshot) return { snapshot: null, message: "No net worth snapshot has been captured yet." };

  return {
    snapshot: {
      capturedAt: snapshot.capturedAt,
      currency: snapshot.currency,
      totalAssets: session.scope === "read_full" ? await decryptOrNull(snapshot.totalAssets, session.dek) : undefined,
      totalLiabilities:
        session.scope === "read_full" ? await decryptOrNull(snapshot.totalLiabilities, session.dek) : undefined,
      netWorth: session.scope === "read_full" ? await decryptOrNull(snapshot.netWorth, session.dek) : undefined,
      redacted: session.scope !== "read_full",
    },
  };
}
