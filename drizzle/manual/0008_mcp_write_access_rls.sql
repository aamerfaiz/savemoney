-- Finance OS — RLS + PostgREST lockdown for private.mcp_tool_call_log
-- (Phase 3.5.9, MCP agent access). Apply AFTER
-- drizzle/0018_shallow_frog_thor.sql (the generated migration that adds
-- mcp_agent_tokens.can_write and creates private.mcp_tool_call_log).
--
-- Same posture as drizzle/manual/0007_vault_and_mcp_tokens_rls.sql:
-- `private` is never PostgREST-exposed, so the revoke below is
-- belt-and-braces on top of that. All reads/writes happen through the
-- direct Postgres connection from trusted server code (the MCP Route
-- Handler's token-verified request path) — there is no auth.uid()
-- session on an MCP tool call, so the owner-only RLS policies below are
-- defense-in-depth, not the actual authorization mechanism (the token
-- hash lookup is). Idempotent so it is safe to re-run.

revoke all on private.mcp_tool_call_log from anon, authenticated;

alter table private.mcp_tool_call_log enable row level security;

drop policy if exists "mcp_tool_call_log_select_own" on private.mcp_tool_call_log;
drop policy if exists "mcp_tool_call_log_insert_own" on private.mcp_tool_call_log;

-- Insert-only audit trail — no update/delete policy at all, deliberately;
-- a log row is never modified or removed once written.
create policy "mcp_tool_call_log_select_own" on private.mcp_tool_call_log
  for select using ((select auth.uid()) = user_id);
create policy "mcp_tool_call_log_insert_own" on private.mcp_tool_call_log
  for insert with check ((select auth.uid()) = user_id);
