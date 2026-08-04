-- Finance OS — Row Level Security for the Investments module (Phase 2).
-- Apply AFTER 0003_investments.sql (the generated schema migration).
--
-- Mirrors drizzle/manual/0001_rls_and_seed.sql: every user-owned row is locked
-- to its owner (spec: "complete data isolation"), and each table gets the
-- shared updated_at trigger. Idempotent so it is safe to re-run.

/* --------------------------------------------------------------------- */
/* updated_at triggers for the new tables                                */
/* --------------------------------------------------------------------- */
do $$
declare
  t text;
begin
  foreach t in array array['investments','investment_contributions']
  loop
    execute format(
      'drop trigger if exists set_updated_at on public.%I;', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at();', t);
  end loop;
end;
$$;

/* --------------------------------------------------------------------- */
/* Enable RLS                                                            */
/* --------------------------------------------------------------------- */
alter table public.investments              enable row level security;
alter table public.investment_contributions enable row level security;

/* --------------------------------------------------------------------- */
/* Owner-only policies (user_id = auth.uid())                            */
/* --------------------------------------------------------------------- */
do $$
declare
  t text;
begin
  foreach t in array array['investments','investment_contributions']
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
