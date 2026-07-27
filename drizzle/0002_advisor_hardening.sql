-- Finance OS — advisor hardening.
-- Apply AFTER 0001_rls_and_seed.sql. Clears the Supabase security/perf
-- advisor findings raised after the initial schema + RLS were applied.

/* --------------------------------------------------------------------- */
/* 1. Pin a stable search_path on our trigger functions (security WARN    */
/*    "function_search_path_mutable"). now() lives in pg_catalog, which   */
/*    is always implicitly on the path, so an empty search_path is safe.  */
/* --------------------------------------------------------------------- */
alter function public.set_updated_at() set search_path = '';

/* --------------------------------------------------------------------- */
/* 2. handle_new_user is only ever invoked by the on_auth_user_created    */
/*    trigger (which runs as the table owner), never as an RPC. Revoke    */
/*    EXECUTE from the API roles so it can't be called via /rest/v1/rpc   */
/*    (security WARN "*_security_definer_function_executable").           */
/* --------------------------------------------------------------------- */
revoke execute on function public.handle_new_user() from public, anon, authenticated;

/* --------------------------------------------------------------------- */
/* 3. Covering indexes for foreign keys flagged as unindexed             */
/*    (performance INFO "unindexed_foreign_keys").                        */
/* --------------------------------------------------------------------- */
create index if not exists "budgets_category_idx"        on public.budgets           using btree ("category_id");
create index if not exists "expenses_account_idx"        on public.expenses          using btree ("account_id");
create index if not exists "income_account_idx"          on public.income            using btree ("account_id");
create index if not exists "income_category_idx"         on public.income            using btree ("category_id");
create index if not exists "goal_contrib_user_idx"       on public.goal_contributions using btree ("user_id");
create index if not exists "loan_payments_user_idx"      on public.loan_payments     using btree ("user_id");
