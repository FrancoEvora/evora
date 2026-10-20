-- Aurora v1: additive namespace. Existing application tables and auth configuration are untouched.
begin;
create schema if not exists aurora_private;
revoke all on schema aurora_private from public;
grant usage on schema aurora_private to authenticated;

create table public.aurora_workspaces (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 2 and 120),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table public.aurora_members (
 workspace_id uuid not null references public.aurora_workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, display_name text not null,
 email text not null, role text not null check(role in ('owner','admin','manager','analyst','viewer','client')),
 active boolean not null default true, created_at timestamptz not null default now(), primary key(workspace_id,user_id)
);
create index aurora_members_user_idx on public.aurora_members(user_id,workspace_id) where active;
create table public.aurora_assets (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.aurora_workspaces(id),
 name text not null check(length(name) between 2 and 160), division text not null check(division in ('urban','rural')),
 stage text not null default 'intelligence' check(stage in ('intelligence','structuring','development','management')),
 city text not null default '', state text not null default '', address text not null default '',
 area_ha numeric check(area_ha>=0), estimated_value numeric check(estimated_value>=0),
 latitude double precision check(latitude between -90 and 90), longitude double precision check(longitude between -180 and 180),
 geometry jsonb, notes text not null default '' check(length(notes)<=30000),
 status text not null default 'active' check(status in ('active','paused','archived')),
 created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), unique(workspace_id,id)
);
create index aurora_assets_workspace_idx on public.aurora_assets(workspace_id,stage);
create table public.aurora_asset_access (
 workspace_id uuid not null, asset_id uuid not null, user_id uuid not null,
 primary key(asset_id,user_id), foreign key(workspace_id,asset_id) references public.aurora_assets(workspace_id,id) on delete cascade,
 foreign key(workspace_id,user_id) references public.aurora_members(workspace_id,user_id) on delete cascade
);
create table public.aurora_actions (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, asset_id uuid not null,
 title text not null check(length(title) between 2 and 200), description text not null default '' check(length(description)<=12000),
 category text not null default 'general', priority text not null default 'medium' check(priority in ('low','medium','high','critical')),
 status text not null default 'todo' check(status in ('todo','doing','done')), due_on date,
 assignee_id uuid, evidence text not null default '', created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(workspace_id,asset_id) references public.aurora_assets(workspace_id,id) on delete cascade,
 foreign key(workspace_id,assignee_id) references public.aurora_members(workspace_id,user_id)
);
create index aurora_actions_asset_idx on public.aurora_actions(workspace_id,asset_id);
create index aurora_actions_due_idx on public.aurora_actions(due_on) where status <> 'done';
create table public.aurora_documents (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, asset_id uuid not null,
 title text not null check(length(title) between 1 and 200), category text not null default 'general',
 storage_path text not null unique, mime_type text not null, size_bytes bigint not null check(size_bytes between 1 and 20971520),
 extracted_text text not null default '' check(length(extracted_text)<=100000), expires_on date,
 created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(),
 foreign key(workspace_id,asset_id) references public.aurora_assets(workspace_id,id) on delete cascade,
 check(storage_path like workspace_id::text || '/' || asset_id::text || '/%')
);
create index aurora_documents_asset_idx on public.aurora_documents(workspace_id,asset_id);
create table public.aurora_notes (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, asset_id uuid not null,
 body text not null check(length(body) between 2 and 15000), latitude double precision check(latitude between -90 and 90),
 longitude double precision check(longitude between -180 and 180), created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(), foreign key(workspace_id,asset_id) references public.aurora_assets(workspace_id,id) on delete cascade
);
create index aurora_notes_asset_idx on public.aurora_notes(workspace_id,asset_id);
create table public.aurora_runs (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, asset_id uuid not null,
 prompt text not null check(length(prompt)<=6000), result text not null check(length(result)<=60000), model text not null,
 source text not null default 'manual' check(source in ('manual','scheduled')), created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(), foreign key(workspace_id,asset_id) references public.aurora_assets(workspace_id,id) on delete cascade
);
create index aurora_runs_asset_idx on public.aurora_runs(workspace_id,asset_id,created_at desc);
create table public.aurora_alerts (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, asset_id uuid not null,
 title text not null, severity text not null check(severity in ('info','warning','critical')), source_key text not null unique,
 read_at timestamptz, created_at timestamptz not null default now(),
 foreign key(workspace_id,asset_id) references public.aurora_assets(workspace_id,id) on delete cascade
);
create index aurora_alerts_asset_idx on public.aurora_alerts(workspace_id,asset_id);
create table public.aurora_schedules (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, asset_id uuid not null,
 name text not null check(length(name) between 2 and 120), prompt text not null check(length(prompt) between 3 and 6000),
 cadence text not null default 'daily' check(cadence in ('daily','weekly')), enabled boolean not null default false,
 next_run_at timestamptz not null default now(), last_run_at timestamptz, last_status text,
 locked_until timestamptz, lease_token uuid, created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(), foreign key(workspace_id,asset_id) references public.aurora_assets(workspace_id,id) on delete cascade
);
create index aurora_schedules_due_idx on public.aurora_schedules(next_run_at) where enabled;
create table public.aurora_invites (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.aurora_workspaces(id),
 email text not null check(length(email)<=254), role text not null check(role in ('admin','manager','analyst','viewer','client')),
 token_hash text not null unique, created_by uuid not null default auth.uid() references auth.users(id),
 expires_at timestamptz not null default now()+interval '7 days', accepted_at timestamptz, revoked_at timestamptz, created_at timestamptz not null default now()
);
create index aurora_invites_workspace_idx on public.aurora_invites(workspace_id);
create table public.aurora_audit (
 id bigint generated always as identity primary key, workspace_id uuid not null references public.aurora_workspaces(id),
 asset_id uuid, actor_id uuid, action text not null, entity text not null, entity_id text not null,
 created_at timestamptz not null default now()
);
create index aurora_audit_workspace_idx on public.aurora_audit(workspace_id,created_at desc);
create table aurora_private.ai_usage (workspace_id uuid not null,user_id uuid not null,day date not null,total int not null default 0,primary key(workspace_id,user_id,day));
create table aurora_private.worker_config (id boolean primary key default true check(id),token_hash text not null);
alter table aurora_private.ai_usage enable row level security;
alter table aurora_private.worker_config enable row level security;
revoke all on all tables in schema aurora_private from anon,authenticated;

-- Role is read from current membership; no user-editable JWT metadata is trusted.
create function aurora_private.role_for(w uuid) returns text language sql stable security definer set search_path='' as $$
 select role from public.aurora_members where workspace_id=w and user_id=(select auth.uid()) and active and auth.uid() is not null
$$;
create function aurora_private.can_asset(a uuid, writing boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.aurora_assets x join public.aurora_members m on m.workspace_id=x.workspace_id
 where x.id=a and m.user_id=auth.uid() and m.active and
 case when writing then m.role in ('owner','admin','manager','analyst')
 else m.role<>'client' or exists(select 1 from public.aurora_asset_access g where g.asset_id=a and g.user_id=auth.uid()) end)
$$;
revoke all on function aurora_private.role_for(uuid),aurora_private.can_asset(uuid,boolean) from public;
grant execute on function aurora_private.role_for(uuid),aurora_private.can_asset(uuid,boolean) to authenticated;

alter table public.aurora_workspaces enable row level security;
alter table public.aurora_members enable row level security;
alter table public.aurora_asset_access enable row level security;
alter table public.aurora_assets enable row level security;
alter table public.aurora_invites enable row level security;
alter table public.aurora_audit enable row level security;
create policy workspace_read on public.aurora_workspaces for select to authenticated using(aurora_private.role_for(id) is not null);
create policy member_read on public.aurora_members for select to authenticated using(user_id=auth.uid() or aurora_private.role_for(workspace_id) in ('owner','admin','manager'));
create policy access_read on public.aurora_asset_access for select to authenticated using(user_id=auth.uid() or aurora_private.role_for(workspace_id) in ('owner','admin','manager'));
create policy access_write on public.aurora_asset_access for all to authenticated using(aurora_private.role_for(workspace_id) in ('owner','admin','manager')) with check(aurora_private.role_for(workspace_id) in ('owner','admin','manager'));
create policy asset_read on public.aurora_assets for select to authenticated using(aurora_private.can_asset(id));
create policy asset_insert on public.aurora_assets for insert to authenticated with check(aurora_private.role_for(workspace_id) in ('owner','admin','manager','analyst') and created_by=auth.uid());
create policy asset_update on public.aurora_assets for update to authenticated using(aurora_private.can_asset(id,true)) with check(aurora_private.can_asset(id,true) and aurora_private.role_for(workspace_id) in ('owner','admin','manager','analyst'));
create policy invite_read on public.aurora_invites for select to authenticated using(aurora_private.role_for(workspace_id) in ('owner','admin'));
create policy audit_read on public.aurora_audit for select to authenticated using(aurora_private.role_for(workspace_id) in ('owner','admin','manager'));

do $$ declare t text; begin
 foreach t in array array['aurora_actions','aurora_documents','aurora_notes','aurora_runs','aurora_alerts','aurora_schedules'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy read_asset on public.%I for select to authenticated using(aurora_private.can_asset(asset_id))',t);
 if t in ('aurora_actions','aurora_documents','aurora_notes') then
 execute format('create policy insert_asset on public.%I for insert to authenticated with check(aurora_private.can_asset(asset_id,true) and created_by=auth.uid())',t);
 end if;
 if t='aurora_actions' then
 execute format('create policy update_asset on public.%I for update to authenticated using(aurora_private.can_asset(asset_id,true)) with check(aurora_private.can_asset(asset_id,true))',t);
 end if;
 if t='aurora_schedules' then
 execute format('create policy schedule_insert on public.%I for insert to authenticated with check(aurora_private.role_for(workspace_id) in (''owner'',''admin'',''manager'') and created_by=auth.uid() and aurora_private.can_asset(asset_id,true))',t);
 execute format('create policy schedule_update on public.%I for update to authenticated using(aurora_private.role_for(workspace_id) in (''owner'',''admin'',''manager'')) with check(aurora_private.role_for(workspace_id) in (''owner'',''admin'',''manager'') and aurora_private.can_asset(asset_id,true))',t);
 end if;
 end loop;
end $$;

-- Narrow column grants stop ownership / workspace reassignment and lease tampering.
revoke all on public.aurora_workspaces,public.aurora_members,public.aurora_assets,public.aurora_asset_access,public.aurora_actions,public.aurora_documents,public.aurora_notes,public.aurora_runs,public.aurora_alerts,public.aurora_schedules,public.aurora_invites,public.aurora_audit from anon,authenticated;
grant select on public.aurora_workspaces,public.aurora_members,public.aurora_assets,public.aurora_asset_access,public.aurora_actions,public.aurora_documents,public.aurora_notes,public.aurora_runs,public.aurora_alerts,public.aurora_schedules,public.aurora_invites,public.aurora_audit to authenticated;
grant insert on public.aurora_assets,public.aurora_actions,public.aurora_documents,public.aurora_notes,public.aurora_asset_access to authenticated;
grant delete on public.aurora_asset_access to authenticated;
grant update(name,division,stage,city,state,address,area_ha,estimated_value,latitude,longitude,geometry,notes,status) on public.aurora_assets to authenticated;
grant update(title,description,category,priority,status,due_on,assignee_id,evidence) on public.aurora_actions to authenticated;
grant insert(workspace_id,asset_id,name,prompt,cadence,enabled) on public.aurora_schedules to authenticated;
grant update(name,prompt,cadence,enabled) on public.aurora_schedules to authenticated;

create function aurora_private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb; begin r:=to_jsonb(new);
 insert into public.aurora_audit(workspace_id,asset_id,actor_id,action,entity,entity_id)
 values((r->>'workspace_id')::uuid,case when tg_table_name='aurora_assets' then (r->>'id')::uuid else (r->>'asset_id')::uuid end,auth.uid(),lower(tg_op),tg_table_name,coalesce(r->>'id',r->>'user_id',''));
 return new; end $$;
revoke all on function aurora_private.audit_change() from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['aurora_assets','aurora_actions','aurora_documents','aurora_notes','aurora_runs','aurora_members','aurora_asset_access','aurora_schedules'] loop
 execute format('create trigger aurora_audit_change after insert or update on public.%I for each row execute function aurora_private.audit_change()',t);
 end loop; end $$;

create function aurora_private.create_workspace(n text) returns uuid language plpgsql security definer set search_path='' as $$
declare w uuid; u auth.users%rowtype; begin
 if auth.uid() is null then raise exception 'Autenticação necessária'; end if;
 select * into u from auth.users where id=auth.uid();
 if u.email_confirmed_at is null then raise exception 'Confirme seu e-mail primeiro'; end if;
 if (select count(*) from public.aurora_members where user_id=auth.uid() and role='owner')>=5 then raise exception 'Limite de organizações atingido'; end if;
 insert into public.aurora_workspaces(name,created_by) values(trim(n),auth.uid()) returning id into w;
 insert into public.aurora_members(workspace_id,user_id,display_name,email,role) values(w,auth.uid(),coalesce(u.raw_user_meta_data->>'full_name',split_part(u.email,'@',1)),u.email,'owner'); return w; end $$;
create function public.aurora_create_workspace(n text) returns uuid language sql security invoker set search_path='' as $$ select aurora_private.create_workspace(n) $$;

create function aurora_private.invite_member(w uuid,e text,r text) returns text language plpgsql security definer set search_path='' as $$
declare token text; begin
 if auth.uid() is null or coalesce(aurora_private.role_for(w),'') not in ('owner','admin') then raise exception 'Sem permissão'; end if;
 if r not in ('admin','manager','analyst','viewer','client') or e !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Dados inválidos'; end if;
 if r='admin' and aurora_private.role_for(w)<>'owner' then raise exception 'Somente o proprietário pode criar administradores'; end if;
 token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 insert into public.aurora_invites(workspace_id,email,role,token_hash) values(w,lower(trim(e)),r,encode(sha256(convert_to(token,'UTF8')),'hex'));
 return token; end $$;
create function public.aurora_invite_member(w uuid,e text,r text) returns text language sql security invoker set search_path='' as $$ select aurora_private.invite_member(w,e,r) $$;

create function aurora_private.accept_invite(token text) returns uuid language plpgsql security definer set search_path='' as $$
declare i public.aurora_invites%rowtype; u auth.users%rowtype; begin
 if auth.uid() is null then raise exception 'Autenticação necessária'; end if;
 select * into u from auth.users where id=auth.uid();
 if u.email_confirmed_at is null then raise exception 'Confirme seu e-mail'; end if;
 select * into i from public.aurora_invites where token_hash=encode(sha256(convert_to(token,'UTF8')),'hex') for update;
 if i.id is null or i.expires_at<now() or i.accepted_at is not null or i.revoked_at is not null or lower(u.email)<>i.email then raise exception 'Convite inválido, expirado ou destinado a outro e-mail'; end if;
 if exists(select 1 from public.aurora_members where workspace_id=i.workspace_id and user_id=auth.uid()) then raise exception 'Você já faz parte desta organização. Peça ao administrador para revisar seu acesso.'; end if;
 insert into public.aurora_members(workspace_id,user_id,display_name,email,role) values(i.workspace_id,auth.uid(),coalesce(u.raw_user_meta_data->>'full_name',split_part(u.email,'@',1)),u.email,i.role);
 update public.aurora_invites set accepted_at=now() where id=i.id; return i.workspace_id; end $$;
create function public.aurora_accept_invite(token text) returns uuid language sql security invoker set search_path='' as $$ select aurora_private.accept_invite(token) $$;

create function aurora_private.set_member(w uuid,u uuid,r text,a boolean) returns void language plpgsql security definer set search_path='' as $$
declare oldrole text; caller text; begin
 caller:=aurora_private.role_for(w);
 if auth.uid() is null or coalesce(caller,'') not in ('owner','admin') then raise exception 'Sem permissão'; end if;
 if u=auth.uid() then raise exception 'Você não pode alterar o próprio acesso'; end if;
 select role into oldrole from public.aurora_members where workspace_id=w and user_id=u for update;
 if oldrole is null or oldrole='owner' or (oldrole='admin' and caller<>'owner') or (r='admin' and caller<>'owner') then raise exception 'Acesso protegido'; end if;
 if r not in ('admin','manager','analyst','viewer','client') then raise exception 'Perfil inválido'; end if;
 update public.aurora_members set role=r,active=a where workspace_id=w and user_id=u; end $$;
create function public.aurora_set_member(w uuid,u uuid,r text,a boolean) returns void language sql security invoker set search_path='' as $$ select aurora_private.set_member(w,u,r,a) $$;

create function aurora_private.revoke_invite(i uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is null or not exists(select 1 from public.aurora_invites x where x.id=i and aurora_private.role_for(x.workspace_id) in ('owner','admin')) then raise exception 'Sem permissão'; end if;
 update public.aurora_invites set revoked_at=now() where id=i; end $$;
create function public.aurora_revoke_invite(i uuid) returns void language sql security invoker set search_path='' as $$ select aurora_private.revoke_invite(i) $$;

create function aurora_private.reserve_ai(w uuid) returns void language plpgsql security definer set search_path='' as $$
declare n int; begin
 if auth.uid() is null or coalesce(aurora_private.role_for(w),'') not in ('owner','admin','manager','analyst') then raise exception 'Sem permissão para IA'; end if;
 perform pg_advisory_xact_lock(hashtextextended(w::text,0));
 if coalesce((select sum(total) from aurora_private.ai_usage where workspace_id=w and day=current_date),0)>=200 then raise exception 'Limite diário da organização atingido'; end if;
 insert into aurora_private.ai_usage values(w,auth.uid(),current_date,1) on conflict(workspace_id,user_id,day) do update set total=aurora_private.ai_usage.total+1 returning total into n;
 if n>30 then raise exception 'Limite diário de análises atingido'; end if; end $$;
create function public.aurora_reserve_ai(w uuid) returns void language sql security invoker set search_path='' as $$ select aurora_private.reserve_ai(w) $$;

-- Machine functions require a dedicated secret that grants access ONLY to Aurora worker operations.
create function aurora_private.verify_worker(token text) returns void language plpgsql security definer set search_path='' as $$ begin
 if token is null or length(token)<40 or not exists(select 1 from aurora_private.worker_config where token_hash=encode(sha256(convert_to(token,'UTF8')),'hex')) then raise exception 'Worker não autorizado'; end if; end $$;

create function aurora_private.save_run(token text,w uuid,a uuid,u uuid,p text,result_text text,model_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid; begin
 perform aurora_private.verify_worker(token);
 if not exists(select 1 from public.aurora_members where workspace_id=w and user_id=u and active and role in ('owner','admin','manager','analyst')) then raise exception 'Acesso revogado'; end if;
 insert into public.aurora_runs(workspace_id,asset_id,created_by,prompt,result,model) values(w,a,u,p,result_text,model_name) returning id into rid; return rid; end $$;
create function public.aurora_save_run(token text,w uuid,a uuid,u uuid,p text,result_text text,model_name text) returns uuid language sql security invoker set search_path='' as $$ select aurora_private.save_run(token,w,a,u,p,result_text,model_name) $$;

create function aurora_private.monitor_and_claim(token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare s record; jobs jsonb:='[]'::jsonb; lease uuid; begin
 perform aurora_private.verify_worker(token);
 insert into public.aurora_alerts(workspace_id,asset_id,title,severity,source_key)
 select workspace_id,asset_id,case when due_on<current_date then 'Ação vencida: ' else 'Prazo próximo: ' end||title,
 case when due_on<current_date then 'critical' else 'warning' end,'action:'||id::text||':'||due_on::text||':'||(due_on<current_date)::text
 from public.aurora_actions where status<>'done' and due_on<=current_date+7 on conflict(source_key) do nothing;
 insert into public.aurora_alerts(workspace_id,asset_id,title,severity,source_key)
 select workspace_id,asset_id,case when expires_on<current_date then 'Documento vencido: ' else 'Documento a vencer: ' end||title,
 case when expires_on<current_date then 'critical' else 'warning' end,'document:'||id::text||':'||expires_on::text||':'||(expires_on<current_date)::text
 from public.aurora_documents where expires_on<=current_date+30 on conflict(source_key) do nothing;
 for s in select x.* from public.aurora_schedules x join public.aurora_members m on m.workspace_id=x.workspace_id and m.user_id=x.created_by
 where x.enabled and x.next_run_at<=now() and (x.locked_until is null or x.locked_until<now()) and m.active and m.role in ('owner','admin','manager')
 order by x.next_run_at limit 3 for update of x skip locked loop
 lease:=gen_random_uuid(); update public.aurora_schedules set locked_until=now()+interval '10 minutes',lease_token=lease where id=s.id;
 jobs:=jobs||jsonb_build_array(jsonb_build_object('id',s.id,'lease',lease,'workspace_id',s.workspace_id,'asset_id',s.asset_id,'created_by',s.created_by,'prompt',s.prompt,
 'asset',(select to_jsonb(a) from public.aurora_assets a where a.id=s.asset_id),
 'actions',(select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) from (select title,description,status,due_on,priority from public.aurora_actions where asset_id=s.asset_id order by due_on nulls last limit 60) a),
 'documents',(select coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) from (select id,title,category,expires_on,left(extracted_text,10000) as text from public.aurora_documents where asset_id=s.asset_id order by created_at desc limit 8) d),
 'notes',(select coalesce(jsonb_agg(to_jsonb(n)),'[]'::jsonb) from (select body,created_at from public.aurora_notes where asset_id=s.asset_id order by created_at desc limit 10) n)));
 end loop; return jobs; end $$;
create function public.aurora_monitor_and_claim(token text) returns jsonb language sql security invoker set search_path='' as $$ select aurora_private.monitor_and_claim(token) $$;

create function aurora_private.finish_job(token text,j uuid,lease uuid,result_text text,model_name text,error_code text default null) returns void language plpgsql security definer set search_path='' as $$
declare s public.aurora_schedules%rowtype; begin
 perform aurora_private.verify_worker(token); select * into s from public.aurora_schedules where id=j and lease_token=lease and locked_until>now() for update;
 if s.id is null then raise exception 'Execução inválida ou expirada'; end if;
 if error_code is null and s.enabled and exists(select 1 from public.aurora_members where workspace_id=s.workspace_id and user_id=s.created_by and active and role in ('owner','admin','manager')) then
 insert into public.aurora_runs(workspace_id,asset_id,created_by,prompt,result,model,source) values(s.workspace_id,s.asset_id,s.created_by,s.prompt,result_text,model_name,'scheduled');
 end if;
 update public.aurora_schedules set locked_until=null,lease_token=null,last_run_at=now(),last_status=coalesce(error_code,'success'),next_run_at=now()+case when cadence='weekly' then interval '7 days' else interval '1 day' end where id=j; end $$;
create function public.aurora_finish_job(token text,j uuid,lease uuid,result_text text,model_name text,error_code text default null) returns void language sql security invoker set search_path='' as $$ select aurora_private.finish_job(token,j,lease,result_text,model_name,error_code) $$;

-- Explicitly revoke default function execution; only these routes are callable.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='public' and p.proname like 'aurora_%') or n.nspname='aurora_private' loop
 execute format('revoke all on function %s from public,anon,authenticated',f.sig);
 end loop; end $$;
grant execute on function aurora_private.role_for(uuid),aurora_private.can_asset(uuid,boolean),aurora_private.create_workspace(text),aurora_private.invite_member(uuid,text,text),aurora_private.accept_invite(text),aurora_private.set_member(uuid,uuid,text,boolean),aurora_private.revoke_invite(uuid),aurora_private.reserve_ai(uuid) to authenticated;
grant execute on function public.aurora_create_workspace(text),public.aurora_invite_member(uuid,text,text),public.aurora_accept_invite(text),public.aurora_set_member(uuid,uuid,text,boolean),public.aurora_revoke_invite(uuid),public.aurora_reserve_ai(uuid) to authenticated;
grant usage on schema aurora_private to anon;
grant execute on function aurora_private.save_run(text,uuid,uuid,uuid,text,text,text),aurora_private.monitor_and_claim(text),aurora_private.finish_job(text,uuid,uuid,text,text,text) to anon;
grant execute on function public.aurora_save_run(text,uuid,uuid,uuid,text,text,text),public.aurora_monitor_and_claim(text),public.aurora_finish_job(text,uuid,uuid,text,text,text) to anon;

-- Private file vault. No public URLs and no service-role key in the application.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('aurora-vault','aurora-vault',false,20971520,array['application/pdf','image/jpeg','image/png','image/webp','text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.google-earth.kml+xml','application/vnd.google-earth.kmz','application/geo+json','application/json']);
create function aurora_private.storage_access(path text,writing boolean) returns boolean language plpgsql stable security invoker set search_path='' as $$
declare a uuid; w uuid; begin
 if auth.uid() is null then return false; end if;
 begin w:=split_part(path,'/',1)::uuid; a:=split_part(path,'/',2)::uuid; exception when invalid_text_representation then return false; end;
 return exists(select 1 from public.aurora_assets where id=a and workspace_id=w) and aurora_private.can_asset(a,writing); end $$;
revoke all on function aurora_private.storage_access(text,boolean) from public;
grant execute on function aurora_private.storage_access(text,boolean) to authenticated;
create policy aurora_vault_read on storage.objects for select to authenticated using(bucket_id='aurora-vault' and aurora_private.storage_access(name,false));
create policy aurora_vault_insert on storage.objects for insert to authenticated with check(bucket_id='aurora-vault' and aurora_private.storage_access(name,true));
create policy aurora_vault_cleanup on storage.objects for delete to authenticated using(bucket_id='aurora-vault' and owner_id=auth.uid()::text and aurora_private.storage_access(name,true) and not exists(select 1 from public.aurora_documents d where d.storage_path=name));
-- Restrictive guards also protect this bucket from pre-existing broad policies on shared Storage.
create policy aurora_vault_guard_read on storage.objects as restrictive for select to authenticated using(bucket_id<>'aurora-vault' or aurora_private.storage_access(name,false));
create policy aurora_vault_guard_insert on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'aurora-vault' or aurora_private.storage_access(name,true));
create policy aurora_vault_guard_update on storage.objects as restrictive for update to authenticated using(bucket_id<>'aurora-vault') with check(bucket_id<>'aurora-vault');
create policy aurora_vault_guard_delete on storage.objects as restrictive for delete to authenticated using(bucket_id<>'aurora-vault' or (owner_id=auth.uid()::text and aurora_private.storage_access(name,true) and not exists(select 1 from public.aurora_documents d where d.storage_path=name)));
commit;
