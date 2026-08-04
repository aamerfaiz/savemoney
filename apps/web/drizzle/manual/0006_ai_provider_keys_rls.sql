-- Finance OS — Row Level Security + PostgREST lockdown for AI provider keys
-- (Phase 3, BYOK). Apply AFTER drizzle/0006_white_scorpion.sql (the
-- generated schema migration that creates the `private` schema, the
-- `ai_provider` enum, and the `ai_provider_keys` table).
--
-- Security model (see AGENTS.md "AI providers & user API keys"):
--   1. `private` is never added to Supabase's exposed-schemas list, so
--      PostgREST (the anon/authenticated REST API) cannot see this table at
--      all — `supabase.from("ai_provider_keys")` from the browser 404s,
--      independent of RLS. The revokes below are belt-and-braces on top of
--      that, in case the schema is ever exposed by a future config change.
--   2. `encrypted_key`/`key_iv` are AES-256-GCM ciphertext written by
--      src/lib/ai/crypto.ts — the app never stores or logs a plaintext key.
--   3. All reads/writes happen through the direct Postgres connection
--      (src/db/index.ts, DATABASE_URL) from trusted server code only —
--      Server Actions in src/lib/ai/actions.ts — never from the client.
-- Idempotent so it is safe to re-run.

/* --------------------------------------------------------------------- */
/* Deny the PostgREST API roles, explicitly                              */
/* --------------------------------------------------------------------- */
revoke all on schema private from anon, authenticated;
revoke all on private.ai_provider_keys from anon, authenticated;

/* --------------------------------------------------------------------- */
/* updated_at trigger (reuses the shared function from 0001_rls_and_seed) */
/* --------------------------------------------------------------------- */
drop trigger if exists set_updated_at on private.ai_provider_keys;
create trigger set_updated_at before update on private.ai_provider_keys
  for each row execute function public.set_updated_at();

/* --------------------------------------------------------------------- */
/* RLS — owner-only, defense-in-depth on top of the PostgREST exposure gap */
/* --------------------------------------------------------------------- */
alter table private.ai_provider_keys enable row level security;

drop policy if exists "ai_provider_keys_select_own" on private.ai_provider_keys;
drop policy if exists "ai_provider_keys_insert_own" on private.ai_provider_keys;
drop policy if exists "ai_provider_keys_update_own" on private.ai_provider_keys;
drop policy if exists "ai_provider_keys_delete_own" on private.ai_provider_keys;

create policy "ai_provider_keys_select_own" on private.ai_provider_keys
  for select using ((select auth.uid()) = user_id);
create policy "ai_provider_keys_insert_own" on private.ai_provider_keys
  for insert with check ((select auth.uid()) = user_id);
create policy "ai_provider_keys_update_own" on private.ai_provider_keys
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "ai_provider_keys_delete_own" on private.ai_provider_keys
  for delete using ((select auth.uid()) = user_id);
