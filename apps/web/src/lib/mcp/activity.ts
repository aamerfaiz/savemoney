"use server";

/**
 * Read-only view over `mcp_tool_call_log` for the top bar's notification
 * bell (see mcp/session.ts's `logToolCall`, which already writes a row on
 * every MCP tool call — this adds no new table or migration). Deliberately
 * only surfaces confirmed writes (`action = 'write'`): reads and previews
 * aren't user-notification-worthy, and the log itself never stores what
 * changed (no amounts/names — see schema.ts's doc comment on
 * `mcpToolCallLog`), so this can only ever report "an agent did X", never
 * specifics. That's an intentional privacy boundary, not a gap to fill in.
 *
 * `mcp_tool_call_log` lives in the `private` Postgres schema (invisible to
 * PostgREST), so this goes through the direct Drizzle client exactly like
 * every other MCP-adjacent query — the caller's identity comes from the
 * normal Supabase session (this runs from the browser via a Server Action,
 * not from an MCP call), and every row is filtered by that user's id.
 */

import { and, desc, eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { createClient } from "@/lib/supabase/server";

export interface McpActivityItem {
  id: string;
  toolName: string;
  label: string;
  createdAt: string;
}

const TOOL_LABELS: Record<string, string> = {
  create_transaction: "Added a transaction",
  update_transaction: "Updated a transaction",
  delete_transaction: "Deleted a transaction",
  create_budget: "Created a budget",
  update_budget: "Updated a budget",
  delete_budget: "Deleted a budget",
  create_goal: "Created a goal",
  update_goal: "Updated a goal",
  delete_goal: "Deleted a goal",
  add_goal_contribution: "Added a goal contribution",
  create_loan: "Added a loan",
  update_loan: "Updated a loan",
  delete_loan: "Deleted a loan",
  record_loan_payment: "Recorded a loan payment",
  create_investment: "Added an investment",
  update_investment: "Updated an investment",
  delete_investment: "Deleted an investment",
  record_investment_contribution: "Recorded an investment contribution",
  create_recurring_rule: "Created a recurring rule",
  update_recurring_rule: "Updated a recurring rule",
  delete_recurring_rule: "Deleted a recurring rule",
  toggle_recurring_rule: "Paused or resumed a recurring rule",
};

function labelFor(toolName: string): string {
  return TOOL_LABELS[toolName] ?? `Ran ${toolName} via MCP`;
}

/** Recent confirmed MCP writes for the signed-in user, newest first. A
 * plain on-demand read — the top bar polls this on an interval rather than
 * subscribing to anything live. */
export async function fetchMcpActivity(limit = 20): Promise<McpActivityItem[]> {
  if (!db) return [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const rows = await db
    .select({
      id: schema.mcpToolCallLog.id,
      toolName: schema.mcpToolCallLog.toolName,
      createdAt: schema.mcpToolCallLog.createdAt,
    })
    .from(schema.mcpToolCallLog)
    .where(and(eq(schema.mcpToolCallLog.userId, user.id), eq(schema.mcpToolCallLog.action, "write")))
    .orderBy(desc(schema.mcpToolCallLog.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    toolName: r.toolName,
    label: labelFor(r.toolName),
    createdAt: r.createdAt.toISOString(),
  }));
}
