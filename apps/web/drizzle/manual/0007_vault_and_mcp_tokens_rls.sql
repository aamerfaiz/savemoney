-- Finance OS — Row Level Security + PostgREST lockdown for the vault
-- (Phase 3.5, E2EE "not even me"). Apply AFTER drizzle/0007_worried_hitman.sql
-- (the generated schema migration that creates the mcp_token_scope enum,
-- private.vault_keys, and private.mcp_agent_tokens).
--
-- Security model (see docs/e2ee-path-b-plan.md):
--   1. `private` is never added to Supabase's exposed-schemas list, so
--      PostgREST (the anon/authenticated REST API) cannot see either table
--      at all — the revokes below are belt-and-braces on top of that, same
--      posture as drizzle/manual/0006_ai_provider_keys_rls.sql.
--   2. Every ciphertext column here (wrapped_dek_by_*, *_dek_iv) is written
--      client-side by src/lib/vault/crypto.ts — no server code ever holds
--      an unwrapped DEK or a plaintext vault secret. There is deliberately
--      no server-side "read plaintext" action for either table.
--   3. All reads/writes happen through the direct Postgres connection
--      (src/db/index.ts, DATABASE_URL) from trusted server code only —
--      Server Actions in src/lib/vault/actions.ts, plus the MCP token
--      verification path in the Route Handler that services tool calls
--      (which authenticates by token_hash lookup, not a Supabase session,
--      since the caller is an external agent, not a logged-in browser).
-- Idempotent so it is safe to re-run.

/* --------------------------------------------------------------------- */
/* Deny the PostgREST API roles, explicitly                              */
/* --------------------------------------------------------------------- */
revoke all on private.vault_keys from anon, authenticated;
revoke all on private.mcp_agent_tokens from anon, authenticated;

/* --------------------------------------------------------------------- */
/* updated_at trigger (reuses the shared function from 0001_rls_and_seed) */
/* --------------------------------------------------------------------- */
drop trigger if exists set_updated_at on private.vault_keys;
create trigger set_updated_at before update on private.vault_keys
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on private.mcp_agent_tokens;
create trigger set_updated_at before update on private.mcp_agent_tokens
  for each row execute function public.set_updated_at();

/* --------------------------------------------------------------------- */
/* RLS — owner-only, defense-in-depth on top of the PostgREST exposure gap */
/* --------------------------------------------------------------------- */
alter table private.vault_keys enable row level security;

drop policy if exists "vault_keys_select_own" on private.vault_keys;
drop policy if exists "vault_keys_insert_own" on private.vault_keys;
drop policy if exists "vault_keys_update_own" on private.vault_keys;
drop policy if exists "vault_keys_delete_own" on private.vault_keys;

create policy "vault_keys_select_own" on private.vault_keys
  for select using ((select auth.uid()) = user_id);
create policy "vault_keys_insert_own" on private.vault_keys
  for insert with check ((select auth.uid()) = user_id);
create policy "vault_keys_update_own" on private.vault_keys
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "vault_keys_delete_own" on private.vault_keys
  for delete using ((select auth.uid()) = user_id);

alter table private.mcp_agent_tokens enable row level security;

drop policy if exists "mcp_agent_tokens_select_own" on private.mcp_agent_tokens;
drop policy if exists "mcp_agent_tokens_insert_own" on private.mcp_agent_tokens;
drop policy if exists "mcp_agent_tokens_update_own" on private.mcp_agent_tokens;
drop policy if exists "mcp_agent_tokens_delete_own" on private.mcp_agent_tokens;

-- Note: these owner-only policies apply to a hypothetical RLS-respecting
-- session; the actual MCP tool-call verification path looks a row up by
-- token_hash through the RLS-bypassing direct connection (see header above)
-- since there is no auth.uid() session in that request at all — the token
-- itself is the credential. These policies are defense-in-depth, not the
-- mechanism that authenticates an agent's call.
create policy "mcp_agent_tokens_select_own" on private.mcp_agent_tokens
  for select using ((select auth.uid()) = user_id);
create policy "mcp_agent_tokens_insert_own" on private.mcp_agent_tokens
  for insert with check ((select auth.uid()) = user_id);
create policy "mcp_agent_tokens_update_own" on private.mcp_agent_tokens
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "mcp_agent_tokens_delete_own" on private.mcp_agent_tokens
  for delete using ((select auth.uid()) = user_id);
