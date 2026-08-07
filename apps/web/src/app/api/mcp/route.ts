import "server-only";

/**
 * MCP agent access — the actual server (Phase 3.5.9, see
 * docs/e2ee-path-b-plan.md "Resolved: MCP agent access"). One endpoint,
 * bearer-token authenticated, stateless (a fresh `McpServer` +
 * `WebStandardStreamableHTTPServerTransport` per request — nothing about a
 * connection is held between calls, matching the SDK's own
 * `simpleStatelessStreamableHttp` example). The bearer token IS the entire
 * credential: `resolveMcpSession` turns it into a transient, request-scoped
 * `userId` + unwrapped DEK (mcp/session.ts), which every tool in
 * mcp/tools/{read,write}.ts is handed directly rather than re-deriving
 * anything itself.
 *
 * Every external MCP client (Claude Desktop, Claude Code, Cursor, ...)
 * talks to this same route — nothing here is specific to one client.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type { McpSession } from "@/lib/mcp/session";
import { checkRateLimit, logToolCall, resolveMcpSession } from "@/lib/mcp/session";
import { toolResult } from "@/lib/mcp/tools/shared";
import {
  getCollection,
  getCollectionSchema,
  getNetWorth,
  getNetWorthSchema,
  listBudgets,
  listBudgetsSchema,
  listCollections,
  listCollectionsSchema,
  listGoals,
  listGoalsSchema,
  listInvestments,
  listInvestmentsSchema,
  listLoans,
  listLoansSchema,
  listRecurringRules,
  listRecurringRulesSchema,
  listTransactions,
  listTransactionsSchema,
} from "@/lib/mcp/tools/read";
import {
  addCollectionContribution,
  addCollectionContributionSchema,
  addGoalContribution,
  addGoalContributionSchema,
  createBudget,
  createBudgetSchema,
  createCollection,
  createCollectionSchema,
  createGoal,
  createGoalSchema,
  createInvestment,
  createInvestmentSchema,
  createLoan,
  createLoanSchema,
  createRecurringRule,
  createRecurringRuleSchema,
  createTransaction,
  createTransactionSchema,
  deleteBudget,
  deleteBudgetSchema,
  deleteCollection,
  deleteCollectionSchema,
  deleteGoal,
  deleteGoalSchema,
  deleteInvestment,
  deleteInvestmentSchema,
  deleteLoan,
  deleteLoanSchema,
  deleteRecurringRule,
  deleteRecurringRuleSchema,
  deleteTransaction,
  deleteTransactionSchema,
  addCollectionExpense,
  addCollectionExpenseSchema,
  recordInvestmentContribution,
  recordInvestmentContributionSchema,
  recordLoanPayment,
  recordLoanPaymentSchema,
  toggleRecurringRule,
  toggleRecurringRuleSchema,
  updateBudget,
  updateBudgetSchema,
  updateCollection,
  updateCollectionSchema,
  updateGoal,
  updateGoalSchema,
  updateInvestment,
  updateInvestmentSchema,
  updateLoan,
  updateLoanSchema,
  updateRecurringRule,
  updateRecurringRuleSchema,
  updateTransaction,
  updateTransactionSchema,
} from "@/lib/mcp/tools/write";

export const dynamic = "force-dynamic";

function bearerFrom(req: Request): string | null {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

function unauthorized(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { "content-type": "application/json", "www-authenticate": 'Bearer realm="finance-os-mcp"' },
  });
}

/** Wires one read or write tool function to the server, bound to this
 * request's already-resolved `session` — every tool handler this produces
 * closes over the DEK for exactly this one HTTP request. `kind: "write"`
 * additionally classifies the audit-log entry as "propose" (no `confirm`
 * yet) vs "write" (confirmed), matching the confirm-gate every write tool
 * implements itself (see mcp/tools/write.ts's module doc comment) — this
 * wrapper never re-implements that gate, it only reads the result's shape
 * to log accurately. */
function wire<S extends z.ZodRawShape>(
  server: McpServer,
  session: McpSession,
  kind: "read" | "write",
  name: string,
  description: string,
  inputSchema: S,
  annotations: ToolAnnotations,
  fn: (session: McpSession, args: z.infer<z.ZodObject<S>>) => Promise<unknown>,
) {
  // The callback is cast at the boundary: registerTool's generic inference
  // doesn't resolve cleanly through `wire`'s own generic `S` (a deferred
  // conditional type on an unresolved type parameter), even though each
  // concrete call site is sound — the SDK still validates `rawArgs` against
  // `inputSchema` itself at runtime regardless of what TS inferred here.
  const callback = async (rawArgs: unknown) => {
    const args = rawArgs as z.infer<z.ZodObject<S>>;
    let result: unknown;
    try {
      result = await fn(session, args);
    } catch {
      result = { error: "Something went wrong running this tool." };
    }
    const isError = Boolean(result && typeof result === "object" && "error" in result);
    const isPreview =
      !isError && Boolean(result && typeof result === "object" && (result as { status?: unknown }).status === "preview");
    await logToolCall({
      tokenId: session.tokenId,
      userId: session.userId,
      toolName: name,
      action: isError ? "read" : kind === "read" ? "read" : isPreview ? "propose" : "write",
    });
    return toolResult(result, isError);
  };
  server.registerTool(name, { description, inputSchema, annotations }, callback as never);
}

function buildServer(session: McpSession): McpServer {
  const server = new McpServer({ name: "finance-os", version: "1.0.0" });

  server.registerTool(
    "get_capabilities",
    {
      description:
        "Describes this Finance OS MCP server: what this token can do, its scope, and how the confirm-gate works. Call this first to orient.",
      inputSchema: {},
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const capabilities = {
        server: "finance-os",
        tokenScope: session.scope,
        canWrite: session.canWrite,
        readTools: [
          "list_transactions",
          "list_budgets",
          "list_goals",
          "list_loans",
          "list_investments",
          "list_recurring_rules",
          "list_collections",
          "get_collection",
          "get_net_worth",
        ],
        writeTools: session.canWrite
          ? [
              "create_transaction", "update_transaction", "delete_transaction",
              "create_budget", "update_budget", "delete_budget",
              "create_goal", "update_goal", "delete_goal", "add_goal_contribution",
              "create_loan", "update_loan", "delete_loan", "record_loan_payment",
              "create_investment", "update_investment", "delete_investment", "record_investment_contribution",
              "create_recurring_rule", "update_recurring_rule", "delete_recurring_rule", "toggle_recurring_rule",
              "create_collection", "update_collection", "delete_collection",
              "add_collection_contribution", "add_collection_expense",
            ]
          : [],
        confirmGate:
          "Every write tool is called twice: once without `confirm` (or confirm: false) to preview exactly what would change, and again with confirm: true and the SAME arguments to actually apply it. Nothing is written on the first call.",
        note: session.canWrite
          ? undefined
          : "This token is read-only. Mint or edit a token in Settings → Agent Access with \"Allow write access\" turned on to enable writes.",
      };
      return toolResult(capabilities);
    },
  );

  wire(server, session, "read", "list_transactions", "List income and expense transactions in a date range.", listTransactionsSchema, { readOnlyHint: true, idempotentHint: true, openWorldHint: false }, listTransactions);
  wire(server, session, "read", "list_budgets", "List all budgets with their period and amount.", listBudgetsSchema, { readOnlyHint: true, idempotentHint: true, openWorldHint: false }, listBudgets);
  wire(server, session, "read", "list_goals", "List savings goals with progress.", listGoalsSchema, { readOnlyHint: true, idempotentHint: true, openWorldHint: false }, listGoals);
  wire(server, session, "read", "list_loans", "List loans with balances and terms.", listLoansSchema, { readOnlyHint: true, idempotentHint: true, openWorldHint: false }, listLoans);
  wire(server, session, "read", "list_investments", "List investment holdings.", listInvestmentsSchema, { readOnlyHint: true, idempotentHint: true, openWorldHint: false }, listInvestments);
  wire(server, session, "read", "list_recurring_rules", "List recurring income/expense rules.", listRecurringRulesSchema, { readOnlyHint: true, idempotentHint: true, openWorldHint: false }, listRecurringRules);
  wire(server, session, "read", "list_collections", "List contribution pools (Splitwise-style, single-organizer — e.g. office gift money) with totals collected.", listCollectionsSchema, { readOnlyHint: true, idempotentHint: true, openWorldHint: false }, listCollections);
  wire(server, session, "read", "get_collection", "Get one collection's full contributor breakdown — who gave how much.", getCollectionSchema, { readOnlyHint: true, idempotentHint: true, openWorldHint: false }, getCollection);
  wire(server, session, "read", "get_net_worth", "Get the latest net worth snapshot.", getNetWorthSchema, { readOnlyHint: true, idempotentHint: true, openWorldHint: false }, getNetWorth);

  if (!session.canWrite) return server;

  const writeAnn: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
  const deleteAnn: ToolAnnotations = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };

  wire(server, session, "write", "create_transaction", "Create an income or expense transaction. Preview first, then call again with confirm: true.", createTransactionSchema, writeAnn, createTransaction);
  wire(server, session, "write", "update_transaction", "Update an existing transaction. Preview first, then call again with confirm: true.", updateTransactionSchema, writeAnn, updateTransaction);
  wire(server, session, "write", "delete_transaction", "Soft-delete a transaction. Preview first, then call again with confirm: true.", deleteTransactionSchema, deleteAnn, deleteTransaction);

  wire(server, session, "write", "create_budget", "Create a budget. Preview first, then call again with confirm: true.", createBudgetSchema, writeAnn, createBudget);
  wire(server, session, "write", "update_budget", "Update a budget. Preview first, then call again with confirm: true.", updateBudgetSchema, writeAnn, updateBudget);
  wire(server, session, "write", "delete_budget", "Soft-delete a budget. Preview first, then call again with confirm: true.", deleteBudgetSchema, deleteAnn, deleteBudget);

  wire(server, session, "write", "create_goal", "Create a savings goal. Preview first, then call again with confirm: true.", createGoalSchema, writeAnn, createGoal);
  wire(server, session, "write", "update_goal", "Update a savings goal. Preview first, then call again with confirm: true.", updateGoalSchema, writeAnn, updateGoal);
  wire(server, session, "write", "delete_goal", "Soft-delete a savings goal. Preview first, then call again with confirm: true.", deleteGoalSchema, deleteAnn, deleteGoal);
  wire(server, session, "write", "add_goal_contribution", "Record a contribution toward a savings goal. Preview first, then call again with confirm: true.", addGoalContributionSchema, writeAnn, addGoalContribution);

  wire(server, session, "write", "create_loan", "Create a loan. Preview first, then call again with confirm: true.", createLoanSchema, writeAnn, createLoan);
  wire(server, session, "write", "update_loan", "Update a loan. Preview first, then call again with confirm: true.", updateLoanSchema, writeAnn, updateLoan);
  wire(server, session, "write", "delete_loan", "Soft-delete a loan. Preview first, then call again with confirm: true.", deleteLoanSchema, deleteAnn, deleteLoan);
  wire(server, session, "write", "record_loan_payment", "Record a loan payment (splits principal/interest automatically). Preview first, then call again with confirm: true.", recordLoanPaymentSchema, writeAnn, recordLoanPayment);

  wire(server, session, "write", "create_investment", "Create an investment holding. Preview first, then call again with confirm: true.", createInvestmentSchema, writeAnn, createInvestment);
  wire(server, session, "write", "update_investment", "Update an investment holding. Preview first, then call again with confirm: true.", updateInvestmentSchema, writeAnn, updateInvestment);
  wire(server, session, "write", "delete_investment", "Soft-delete an investment holding. Preview first, then call again with confirm: true.", deleteInvestmentSchema, deleteAnn, deleteInvestment);
  wire(server, session, "write", "record_investment_contribution", "Record a contribution to an investment holding. Preview first, then call again with confirm: true.", recordInvestmentContributionSchema, writeAnn, recordInvestmentContribution);

  wire(server, session, "write", "create_recurring_rule", "Create a recurring income/expense rule. Preview first, then call again with confirm: true.", createRecurringRuleSchema, writeAnn, createRecurringRule);
  wire(server, session, "write", "update_recurring_rule", "Update a recurring rule. Preview first, then call again with confirm: true.", updateRecurringRuleSchema, writeAnn, updateRecurringRule);
  wire(server, session, "write", "delete_recurring_rule", "Soft-delete a recurring rule. Preview first, then call again with confirm: true.", deleteRecurringRuleSchema, deleteAnn, deleteRecurringRule);
  wire(server, session, "write", "toggle_recurring_rule", "Pause or resume a recurring rule. Preview first, then call again with confirm: true.", toggleRecurringRuleSchema, writeAnn, toggleRecurringRule);

  wire(server, session, "write", "create_collection", "Create a contribution pool (Splitwise-style, single-organizer). Preview first, then call again with confirm: true.", createCollectionSchema, writeAnn, createCollection);
  wire(server, session, "write", "update_collection", "Update a collection's title, purpose, target, event date, or open/closed status. Preview first, then call again with confirm: true.", updateCollectionSchema, writeAnn, updateCollection);
  wire(server, session, "write", "delete_collection", "Soft-delete a collection. Preview first, then call again with confirm: true.", deleteCollectionSchema, deleteAnn, deleteCollection);
  wire(server, session, "write", "add_collection_contribution", "Record that someone contributed money to an open collection — matched against, or added to, its contributor roster. Preview first, then call again with confirm: true.", addCollectionContributionSchema, writeAnn, addCollectionContribution);
  wire(server, session, "write", "add_collection_expense", "Record money spent out of a collection's pool — a collection can have several over time; this does not close it. Preview first, then call again with confirm: true.", addCollectionExpenseSchema, writeAnn, addCollectionExpense);

  return server;
}

async function handle(request: Request): Promise<Response> {
  const token = bearerFrom(request);
  const sessionResult = await resolveMcpSession(token);
  if (!sessionResult.ok) return unauthorized(sessionResult.error);
  const { session } = sessionResult;

  const underLimit = await checkRateLimit(session.tokenId);
  if (!underLimit) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again in a minute." }), {
      status: 429,
      headers: { "content-type": "application/json" },
    });
  }

  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = buildServer(session);
  await server.connect(transport);
  return transport.handleRequest(request);
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}

export async function DELETE(request: Request) {
  return handle(request);
}
