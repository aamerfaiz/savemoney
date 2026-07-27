-- RLS + updated_at trigger for import_batches.
-- Apply after drizzle/0002_import_batches.sql.

alter table public.import_batches enable row level security;

create policy "import_batches_select_own" on public.import_batches
  for select using ((select auth.uid()) = user_id);
create policy "import_batches_insert_own" on public.import_batches
  for insert with check ((select auth.uid()) = user_id);
create policy "import_batches_update_own" on public.import_batches
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "import_batches_delete_own" on public.import_batches
  for delete using ((select auth.uid()) = user_id);

drop trigger if exists set_updated_at on public.import_batches;
create trigger set_updated_at before update on public.import_batches
  for each row execute function public.set_updated_at();
