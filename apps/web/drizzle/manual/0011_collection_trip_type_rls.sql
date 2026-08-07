-- Finance OS — Row Level Security for the Collections "trip" type expansion
-- (collection_expense_payers, collection_expense_splits,
-- collection_settlements). Apply AFTER the generated schema migration
-- 0022_collections_trip_type.sql.
--
-- Mirrors drizzle/manual/0010_collection_participants_and_expenses_rls.sql:
-- rows are locked to their owner (auth.uid() = user_id) and get the shared
-- updated_at trigger. Idempotent so it is safe to re-run.

/* --------------------------------------------------------------------- */
/* updated_at triggers                                                   */
/* --------------------------------------------------------------------- */
drop trigger if exists set_updated_at on public.collection_expense_payers;
create trigger set_updated_at before update on public.collection_expense_payers
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.collection_expense_splits;
create trigger set_updated_at before update on public.collection_expense_splits
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.collection_settlements;
create trigger set_updated_at before update on public.collection_settlements
  for each row execute function public.set_updated_at();

/* --------------------------------------------------------------------- */
/* Enable RLS + owner-only policies (user_id = auth.uid())               */
/* --------------------------------------------------------------------- */
alter table public.collection_expense_payers enable row level security;
alter table public.collection_expense_splits enable row level security;
alter table public.collection_settlements    enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'collection_expense_payers',
    'collection_expense_splits',
    'collection_settlements'
  ]
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
