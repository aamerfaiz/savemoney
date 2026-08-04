-- Finance OS — Row Level Security for the Notifications table (Phase 2).
-- Apply AFTER 0005_recurring_and_notifications.sql (the generated schema migration).
--
-- Mirrors drizzle/manual/0001_rls_and_seed.sql: every user-owned row is locked
-- to its owner (spec: "complete data isolation"), plus the shared updated_at
-- trigger. Idempotent so it is safe to re-run.

/* --------------------------------------------------------------------- */
/* updated_at trigger                                                    */
/* --------------------------------------------------------------------- */
drop trigger if exists set_updated_at on public.notifications;
create trigger set_updated_at before update on public.notifications
  for each row execute function public.set_updated_at();

/* --------------------------------------------------------------------- */
/* Enable RLS                                                            */
/* --------------------------------------------------------------------- */
alter table public.notifications enable row level security;

/* --------------------------------------------------------------------- */
/* Owner-only policies (user_id = auth.uid())                            */
/* --------------------------------------------------------------------- */
drop policy if exists "notifications_select_own" on public.notifications;
drop policy if exists "notifications_insert_own" on public.notifications;
drop policy if exists "notifications_update_own" on public.notifications;
drop policy if exists "notifications_delete_own" on public.notifications;

create policy "notifications_select_own" on public.notifications
  for select using ((select auth.uid()) = user_id);
create policy "notifications_insert_own" on public.notifications
  for insert with check ((select auth.uid()) = user_id);
create policy "notifications_update_own" on public.notifications
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "notifications_delete_own" on public.notifications
  for delete using ((select auth.uid()) = user_id);
