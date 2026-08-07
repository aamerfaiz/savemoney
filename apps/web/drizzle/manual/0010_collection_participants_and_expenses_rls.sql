-- Finance OS — Row Level Security for the Collections participants/expenses
-- expansion (roster + expense ledger, replacing the single collection-level
-- payout). Apply AFTER the generated schema migration that adds
-- `collection_participants`/`collection_expenses` and the `participant_id`
-- column on `collection_contributions`.
--
-- Mirrors drizzle/manual/0009_collections_rls.sql: rows are locked to their
-- owner (spec: "complete data isolation") and get the shared updated_at
-- trigger. Idempotent so it is safe to re-run.

/* --------------------------------------------------------------------- */
/* updated_at triggers                                                   */
/* --------------------------------------------------------------------- */
drop trigger if exists set_updated_at on public.collection_participants;
create trigger set_updated_at before update on public.collection_participants
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.collection_expenses;
create trigger set_updated_at before update on public.collection_expenses
  for each row execute function public.set_updated_at();

/* --------------------------------------------------------------------- */
/* Enable RLS + owner-only policies (user_id = auth.uid())               */
/* --------------------------------------------------------------------- */
alter table public.collection_participants enable row level security;
alter table public.collection_expenses     enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['collection_participants', 'collection_expenses']
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
