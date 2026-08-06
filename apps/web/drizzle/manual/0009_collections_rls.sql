-- Finance OS — Row Level Security for the Collections module.
-- Apply AFTER the generated schema migration that creates `collections` and
-- `collection_contributions`.
--
-- Mirrors drizzle/manual/0001_rls_and_seed.sql: rows are locked to their
-- owner (spec: "complete data isolation") and get the shared updated_at
-- trigger. Idempotent so it is safe to re-run.

/* --------------------------------------------------------------------- */
/* updated_at triggers                                                   */
/* --------------------------------------------------------------------- */
drop trigger if exists set_updated_at on public.collections;
create trigger set_updated_at before update on public.collections
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.collection_contributions;
create trigger set_updated_at before update on public.collection_contributions
  for each row execute function public.set_updated_at();

/* --------------------------------------------------------------------- */
/* Enable RLS + owner-only policies (user_id = auth.uid())               */
/* --------------------------------------------------------------------- */
alter table public.collections               enable row level security;
alter table public.collection_contributions   enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['collections', 'collection_contributions']
  loop
    execute format('drop policy if exists "%1$s_select_own" on public.%1$I;', t);
    execute format('drop policy if exists "%1$s_insert_own" on public.%1$I;', t);
    execute format('drop policy if exists "%1$s_update_own" on public.%1$I;', t);
    execute format('drop policy if exists "%1$s_delete_own" on public.%1$I;', t);
    execute format($f$
      create policy "%1$s_select_own" on public.%1$I
        for select using ((select auth.uid()) = user_id);
      create policy "%1$s_insert_own" on public.%1$I
        for insert with check ((select auth.uid()) = user_id);
      create policy "%1$s_update_own" on public.%1$I
        for update using ((select auth.uid()) = user_id)
        with check ((select auth.uid()) = user_id);
      create policy "%1$s_delete_own" on public.%1$I
        for delete using ((select auth.uid()) = user_id);
    $f$, t);
  end loop;
end;
$$;
