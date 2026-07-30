-- Finance OS — Row Level Security for the Recurring rules table (Phase 2).
-- Apply AFTER 0005_recurring_and_notifications.sql (the generated schema migration).
--
-- Mirrors drizzle/manual/0001_rls_and_seed.sql: every user-owned row is locked
-- to its owner (spec: "complete data isolation"), plus the shared updated_at
-- trigger. Idempotent so it is safe to re-run.

/* --------------------------------------------------------------------- */
/* updated_at trigger                                                    */
/* --------------------------------------------------------------------- */
drop trigger if exists set_updated_at on public.recurring_rules;
create trigger set_updated_at before update on public.recurring_rules
  for each row execute function public.set_updated_at();

/* --------------------------------------------------------------------- */
/* Enable RLS                                                            */
/* --------------------------------------------------------------------- */
alter table public.recurring_rules enable row level security;

/* --------------------------------------------------------------------- */
/* Owner-only policies (user_id = auth.uid())                            */
/* --------------------------------------------------------------------- */
drop policy if exists "recurring_rules_select_own" on public.recurring_rules;
drop policy if exists "recurring_rules_insert_own" on public.recurring_rules;
drop policy if exists "recurring_rules_update_own" on public.recurring_rules;
drop policy if exists "recurring_rules_delete_own" on public.recurring_rules;

create policy "recurring_rules_select_own" on public.recurring_rules
  for select using ((select auth.uid()) = user_id);
create policy "recurring_rules_insert_own" on public.recurring_rules
  for insert with check ((select auth.uid()) = user_id);
create policy "recurring_rules_update_own" on public.recurring_rules
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "recurring_rules_delete_own" on public.recurring_rules
  for delete using ((select auth.uid()) = user_id);
