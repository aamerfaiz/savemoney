-- Finance OS — Row Level Security for the Net Worth module (Phase 2).
-- Apply AFTER 0004_net_worth_snapshots.sql (the generated schema migration).
--
-- Mirrors drizzle/manual/0001_rls_and_seed.sql: rows are locked to their owner
-- (spec: "complete data isolation") and get the shared updated_at trigger.
-- Idempotent so it is safe to re-run.

/* --------------------------------------------------------------------- */
/* updated_at trigger                                                    */
/* --------------------------------------------------------------------- */
drop trigger if exists set_updated_at on public.net_worth_snapshots;
create trigger set_updated_at before update on public.net_worth_snapshots
  for each row execute function public.set_updated_at();

/* --------------------------------------------------------------------- */
/* Enable RLS + owner-only policies (user_id = auth.uid())               */
/* --------------------------------------------------------------------- */
alter table public.net_worth_snapshots enable row level security;

drop policy if exists "net_worth_snapshots_select_own" on public.net_worth_snapshots;
drop policy if exists "net_worth_snapshots_insert_own" on public.net_worth_snapshots;
drop policy if exists "net_worth_snapshots_update_own" on public.net_worth_snapshots;
drop policy if exists "net_worth_snapshots_delete_own" on public.net_worth_snapshots;

create policy "net_worth_snapshots_select_own" on public.net_worth_snapshots
  for select using ((select auth.uid()) = user_id);
create policy "net_worth_snapshots_insert_own" on public.net_worth_snapshots
  for insert with check ((select auth.uid()) = user_id);
create policy "net_worth_snapshots_update_own" on public.net_worth_snapshots
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "net_worth_snapshots_delete_own" on public.net_worth_snapshots
  for delete using ((select auth.uid()) = user_id);
