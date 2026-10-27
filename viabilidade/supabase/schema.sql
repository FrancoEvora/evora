-- Évora Viabilidade · Supabase schema v1
-- Execute this script in the evora-gestao project after it is restored.
-- The browser uses only a publishable key. Every row is protected by ownership RLS.

begin;

create extension if not exists pgcrypto;

create table if not exists public.viability_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  name text not null,
  city text not null default '',
  params jsonb not null default '{}'::jsonb,
  actuals jsonb not null default '{"sales":{},"work":{},"plan":null}'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint viability_projects_user_client_unique unique (user_id, client_id),
  constraint viability_projects_client_id_length check (char_length(client_id) between 1 and 160),
  constraint viability_projects_name_length check (char_length(name) between 1 and 90),
  constraint viability_projects_city_length check (char_length(city) <= 120),
  constraint viability_projects_params_object check (jsonb_typeof(params) = 'object'),
  constraint viability_projects_actuals_object check (jsonb_typeof(actuals) = 'object'),
  constraint viability_projects_version_positive check (version > 0)
);

create index if not exists viability_projects_user_updated_idx
  on public.viability_projects (user_id, updated_at desc);

alter table public.viability_projects enable row level security;
alter table public.viability_projects force row level security;

revoke all on table public.viability_projects from anon, authenticated;
grant select, insert, update, delete on table public.viability_projects to authenticated;

drop policy if exists viability_projects_select_own on public.viability_projects;
create policy viability_projects_select_own
  on public.viability_projects
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists viability_projects_insert_own on public.viability_projects;
create policy viability_projects_insert_own
  on public.viability_projects
  for insert
  to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists viability_projects_update_own on public.viability_projects;
create policy viability_projects_update_own
  on public.viability_projects
  for update
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists viability_projects_delete_own on public.viability_projects;
create policy viability_projects_delete_own
  on public.viability_projects
  for delete
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create table if not exists public.viability_user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_project_client_id text,
  schema_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint viability_user_settings_active_length
    check (active_project_client_id is null or char_length(active_project_client_id) between 1 and 160),
  constraint viability_user_settings_version_positive check (schema_version > 0)
);

alter table public.viability_user_settings enable row level security;
alter table public.viability_user_settings force row level security;

revoke all on table public.viability_user_settings from anon, authenticated;
grant select, insert, update, delete on table public.viability_user_settings to authenticated;

drop policy if exists viability_user_settings_select_own on public.viability_user_settings;
create policy viability_user_settings_select_own
  on public.viability_user_settings
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists viability_user_settings_insert_own on public.viability_user_settings;
create policy viability_user_settings_insert_own
  on public.viability_user_settings
  for insert
  to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists viability_user_settings_update_own on public.viability_user_settings;
create policy viability_user_settings_update_own
  on public.viability_user_settings
  for update
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists viability_user_settings_delete_own on public.viability_user_settings;
create policy viability_user_settings_delete_own
  on public.viability_user_settings
  for delete
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

commit;

-- Verification queries after applying:
-- select relname, relrowsecurity, relforcerowsecurity
-- from pg_class where relname in ('viability_projects','viability_user_settings');
-- select schemaname, tablename, policyname, cmd
-- from pg_policies where tablename in ('viability_projects','viability_user_settings')
-- order by tablename, policyname;
