/** Max MCP tool calls a single token may make in a rolling 60-second
 * window, enforced against `mcp_tool_call_log` (see mcp/session.ts) —
 * the plan doc's "rate-limited" requirement for vault-gated tools. */
export const MCP_RATE_LIMIT_PER_MINUTE = 30;
