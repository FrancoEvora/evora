-- Évora Viabilidade · Inteligência por empreendimento
-- Aplicada ao projeto qsdffayasuzsmngteika em 27/10/2026.

begin;

create table if not exists public.viability_ai_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_client_id text not null,
  title text not null default 'Análise estratégica',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint viability_ai_threads_user_project_unique unique (user_id, project_client_id),
  constraint viability_ai_threads_id_user_unique unique (id, user_id),
  constraint viability_ai_threads_project_fk
    foreign key (user_id, project_client_id)
    references public.viability_projects (user_id, client_id)
    on delete cascade,
  constraint viability_ai_threads_project_length
    check (char_length(project_client_id) between 1 and 160),
  constraint viability_ai_threads_title_length
    check (char_length(title) between 1 and 160)
);

create index if not exists viability_ai_threads_user_updated_idx
  on public.viability_ai_threads (user_id, updated_at desc);

alter table public.viability_ai_threads enable row level security;
alter table public.viability_ai_threads force row level security;

revoke all on table public.viability_ai_threads from anon, authenticated;
grant select, insert, update, delete on table public.viability_ai_threads to authenticated;

drop policy if exists viability_ai_threads_select_own on public.viability_ai_threads;
create policy viability_ai_threads_select_own
  on public.viability_ai_threads for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists viability_ai_threads_insert_own on public.viability_ai_threads;
create policy viability_ai_threads_insert_own
  on public.viability_ai_threads for insert to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists viability_ai_threads_update_own on public.viability_ai_threads;
create policy viability_ai_threads_update_own
  on public.viability_ai_threads for update to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists viability_ai_threads_delete_own on public.viability_ai_threads;
create policy viability_ai_threads_delete_own
  on public.viability_ai_threads for delete to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create table if not exists public.viability_ai_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint viability_ai_messages_thread_user_fk
    foreign key (thread_id, user_id)
    references public.viability_ai_threads (id, user_id)
    on delete cascade,
  constraint viability_ai_messages_role_check
    check (role in ('user', 'assistant')),
  constraint viability_ai_messages_content_length
    check (char_length(content) between 1 and 50000),
  constraint viability_ai_messages_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create index if not exists viability_ai_messages_thread_created_idx
  on public.viability_ai_messages (thread_id, created_at asc);
create index if not exists viability_ai_messages_user_created_idx
  on public.viability_ai_messages (user_id, created_at desc);

alter table public.viability_ai_messages enable row level security;
alter table public.viability_ai_messages force row level security;

revoke all on table public.viability_ai_messages from anon, authenticated;
grant select, insert, update, delete on table public.viability_ai_messages to authenticated;

drop policy if exists viability_ai_messages_select_own on public.viability_ai_messages;
create policy viability_ai_messages_select_own
  on public.viability_ai_messages for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists viability_ai_messages_insert_own on public.viability_ai_messages;
create policy viability_ai_messages_insert_own
  on public.viability_ai_messages for insert to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists viability_ai_messages_update_own on public.viability_ai_messages;
create policy viability_ai_messages_update_own
  on public.viability_ai_messages for update to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists viability_ai_messages_delete_own on public.viability_ai_messages;
create policy viability_ai_messages_delete_own
  on public.viability_ai_messages for delete to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

commit;
