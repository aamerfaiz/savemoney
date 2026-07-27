-- Finance OS — Row Level Security, triggers and seed data.
-- Apply AFTER 0000_init_phase1.sql.
--
-- Every user-owned table is locked down so a user can only ever see and
-- mutate their own rows (spec: "complete data isolation"). System categories
-- (user_id IS NULL) are world-readable but never user-writable.

/* --------------------------------------------------------------------- */
/* Generic updated_at trigger                                            */
/* --------------------------------------------------------------------- */
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles','accounts','categories','income','expenses',
    'budgets','goals','goal_contributions','loans','loan_payments'
  ]
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
/* Auto-create a profile row when a new auth user signs up               */
/* --------------------------------------------------------------------- */
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

/* --------------------------------------------------------------------- */
/* Enable RLS everywhere                                                 */
/* --------------------------------------------------------------------- */
alter table public.profiles           enable row level security;
alter table public.accounts           enable row level security;
alter table public.categories         enable row level security;
alter table public.income             enable row level security;
alter table public.expenses           enable row level security;
alter table public.budgets            enable row level security;
alter table public.goals              enable row level security;
alter table public.goal_contributions enable row level security;
alter table public.loans              enable row level security;
alter table public.loan_payments      enable row level security;

/* --------------------------------------------------------------------- */
/* Profiles                                                              */
/* --------------------------------------------------------------------- */
create policy "profiles_select_own" on public.profiles
  for select using ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles
  for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check ((select auth.uid()) = id);

/* --------------------------------------------------------------------- */
/* Simple owner-only tables (user_id = auth.uid())                       */
/* --------------------------------------------------------------------- */
do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts','income','expenses','budgets',
    'goals','goal_contributions','loans','loan_payments'
  ]
  loop
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

/* --------------------------------------------------------------------- */
/* Categories — own rows + read-only shared system categories            */
/* --------------------------------------------------------------------- */
create policy "categories_select" on public.categories
  for select using (
    (select auth.uid()) = user_id or (user_id is null and is_system)
  );
create policy "categories_insert_own" on public.categories
  for insert with check ((select auth.uid()) = user_id);
create policy "categories_update_own" on public.categories
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "categories_delete_own" on public.categories
  for delete using ((select auth.uid()) = user_id);

/* --------------------------------------------------------------------- */
/* Seed system categories (shared, read-only)                            */
/* --------------------------------------------------------------------- */
insert into public.categories (name, kind, icon, color, is_system)
values
  ('Food',          'expense', 'utensils',      '#f59e0b', true),
  ('Groceries',     'expense', 'shopping-cart', '#84cc16', true),
  ('Rent',          'expense', 'home',          '#8400ff', true),
  ('Utilities',     'expense', 'plug',          '#38bdf8', true),
  ('Fuel',          'expense', 'fuel',          '#ef4444', true),
  ('Shopping',      'expense', 'shopping-bag',  '#ec4899', true),
  ('Entertainment', 'expense', 'clapperboard',  '#a855f7', true),
  ('Healthcare',    'expense', 'heart-pulse',   '#22c55e', true),
  ('Travel',        'expense', 'plane',         '#06b6d4', true),
  ('Insurance',     'expense', 'shield',        '#6366f1', true),
  ('Education',     'expense', 'graduation-cap','#0ea5e9', true),
  ('Investment',    'expense', 'trending-up',   '#10b981', true),
  ('Loan',          'expense', 'landmark',      '#f43f5e', true),
  ('Taxes',         'expense', 'receipt',       '#eab308', true),
  ('Miscellaneous', 'expense', 'shapes',        '#94a3b8', true),
  ('Salary',        'income',  'wallet',        '#22c55e', true),
  ('Freelance',     'income',  'laptop',        '#8400ff', true),
  ('Interest',      'income',  'percent',       '#38bdf8', true),
  ('Dividend',      'income',  'coins',         '#f59e0b', true),
  ('Business',      'income',  'briefcase',     '#a855f7', true)
on conflict do nothing;
