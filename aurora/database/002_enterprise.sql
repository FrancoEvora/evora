begin;
alter table public.aurora_workspaces add column is_demo boolean not null default false;
create table public.aurora_module_grants (
 workspace_id uuid not null, user_id uuid not null, module text not null check(module in ('intelligence','structuring','development','management')),
 permission text not null check(permission in ('none','read','write','review')), primary key(workspace_id,user_id,module),
 foreign key(workspace_id,user_id) references public.aurora_members(workspace_id,user_id) on delete cascade
);
create function aurora_private.module_access(w uuid,m text,level_required text default 'read') returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select case when u.role in ('owner','admin') then true when u.role='client' then false else
 array_position(array['none','read','write','review'],coalesce(g.permission,case u.role when 'manager' then 'review' when 'analyst' then 'write' else 'read' end)) >= array_position(array['none','read','write','review'],level_required) end
 from public.aurora_members u left join public.aurora_module_grants g on g.workspace_id=u.workspace_id and g.user_id=u.user_id and g.module=m
 where u.workspace_id=w and u.user_id=auth.uid() and u.active and aurora_private.role_for(w) is not null),false)
$$;
revoke all on function aurora_private.module_access(uuid,text,text) from public,anon;
grant execute on function aurora_private.module_access(uuid,text,text) to authenticated;
create table public.aurora_work_items (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,asset_id uuid not null,
 module text not null check(module in ('intelligence','structuring','development','management')),kind text not null,
 title text not null check(length(title) between 2 and 200),description text not null default '' check(length(description)<=15000),
 status text not null default 'todo' check(status in ('todo','doing','review','approved','blocked','done')),
 priority text not null default 'medium' check(priority in ('low','medium','high','critical')),
 owner_label text not null default '',start_on date,due_on date,progress int not null default 0 check(progress between 0 and 100),
 evidence text not null default '' check(length(evidence)<=15000),details jsonb not null default '{}' check(jsonb_typeof(details)='object' and octet_length(details::text)<30000),
 client_visible boolean not null default false,dependency_id uuid,reviewed_by uuid references auth.users(id),reviewed_at timestamptz,review_note text,
 created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(workspace_id,id),foreign key(workspace_id,asset_id) references public.aurora_assets(workspace_id,id) on delete cascade,
 foreign key(workspace_id,dependency_id) references public.aurora_work_items(workspace_id,id),check(due_on is null or start_on is null or due_on>=start_on)
);
create table public.aurora_licenses (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,asset_id uuid not null,title text not null check(length(title) between 2 and 200),
 license_type text not null default 'LP',authority text not null,protocol text not null default '',jurisdiction text not null default '',
 issued_on date,expires_on date,renewal_due_on date,status text not null default 'preparation' check(status in ('preparation','submitted','issued','suspended','closed')),
 legal_basis text not null default '',evidence text not null default '',owner_label text not null default '',notes text not null default '',
 created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(workspace_id,id),foreign key(workspace_id,asset_id) references public.aurora_assets(workspace_id,id) on delete cascade,
 check(expires_on is null or issued_on is null or expires_on>=issued_on)
);
alter table public.aurora_work_items add column license_id uuid;
alter table public.aurora_work_items add constraint aurora_work_license_fk foreign key(workspace_id,license_id) references public.aurora_licenses(workspace_id,id);
create table public.aurora_financial_lines (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,asset_id uuid not null,
 title text not null check(length(title) between 2 and 200),category text not null default 'construction',direction text not null check(direction in ('cost','revenue')),
 period date not null,planned numeric not null default 0 check(planned>=0),committed numeric not null default 0 check(committed>=0),actual numeric not null default 0 check(actual>=0),
 notes text not null default '',created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(workspace_id,asset_id) references public.aurora_assets(workspace_id,id) on delete cascade
);
create table public.aurora_market_studies (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,asset_id uuid not null,title text not null check(length(title) between 2 and 200),
 radius_km numeric not null default 3 check(radius_km>0 and radius_km<=100),population integer check(population>=0),households integer check(households>=0),income numeric check(income>=0),consumption numeric check(consumption>=0),
 demand_score numeric check(demand_score between 0 and 100),access_score numeric check(access_score between 0 and 100),competition_score numeric check(competition_score between 0 and 100),risk_score numeric check(risk_score between 0 and 100),
 source text not null,source_url text not null default '',reference_date date not null,confidence text not null default 'low' check(confidence in ('low','medium','high')),
 methodology text not null default '',notes text not null default '',created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(workspace_id,asset_id) references public.aurora_assets(workspace_id,id) on delete cascade
);
create table public.aurora_market_points (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,asset_id uuid not null,name text not null check(length(name) between 2 and 200),
 category text not null check(category in ('competitor','retail','education','health','mobility','infrastructure')),
 latitude double precision not null check(latitude between -90 and 90),longitude double precision not null check(longitude between -180 and 180),source text not null,
 created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),foreign key(workspace_id,asset_id) references public.aurora_assets(workspace_id,id) on delete cascade
);
create table public.aurora_reports (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.aurora_workspaces(id),title text not null check(length(title) between 2 and 200),
 status text not null default 'draft' check(status in ('draft','published','archived')),narrative text not null default '' check(length(narrative)<=20000),snapshot jsonb not null,
 version int not null default 1,published_at timestamptz,published_by uuid references auth.users(id),created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),unique(workspace_id,id)
);
create table public.aurora_report_access (
 workspace_id uuid not null,report_id uuid not null,user_id uuid not null,expires_at timestamptz,can_download boolean not null default false,created_at timestamptz not null default now(),
 primary key(report_id,user_id),foreign key(workspace_id,report_id) references public.aurora_reports(workspace_id,id) on delete cascade,
 foreign key(workspace_id,user_id) references public.aurora_members(workspace_id,user_id) on delete cascade
);
create function aurora_private.can_report(r uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.aurora_reports p where p.id=r and aurora_private.role_for(p.workspace_id) is not null and
 (aurora_private.role_for(p.workspace_id) in ('owner','admin','manager') or (p.status='published' and exists(select 1 from public.aurora_report_access g where g.report_id=p.id and g.user_id=auth.uid() and (g.expires_at is null or g.expires_at>now())))))
$$;
revoke all on function aurora_private.can_report(uuid) from public,anon;
grant execute on function aurora_private.can_report(uuid) to authenticated;

-- Column grants keep authorization, reviews and publication on the server.
do $$ declare t text; m text; begin
 foreach t in array array['aurora_work_items','aurora_licenses','aurora_financial_lines','aurora_market_studies','aurora_market_points'] loop
 execute format('alter table public.%I enable row level security',t);
 m:=case when t='aurora_work_items' then 'module' when t='aurora_licenses' then '''development''' when t='aurora_financial_lines' then '''structuring''' else '''intelligence''' end;
 execute format('create policy module_read on public.%I for select to authenticated using(aurora_private.module_access(workspace_id,%s))',t,m);
 execute format('create policy module_insert on public.%I for insert to authenticated with check(aurora_private.module_access(workspace_id,%s,''write'') and created_by=auth.uid())',t,m);
 execute format('create policy module_update on public.%I for update to authenticated using(aurora_private.module_access(workspace_id,%s,''write'')) with check(aurora_private.module_access(workspace_id,%s,''write''))',t,m,m);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select,insert on public.%I to authenticated',t);
 execute format('create index on public.%I(workspace_id,asset_id)',t);
 execute format('create trigger aurora_audit_change after insert or update on public.%I for each row execute function aurora_private.audit_change()',t);
 end loop;
end $$;
grant update(title,description,status,priority,owner_label,start_on,due_on,progress,evidence,details,client_visible,dependency_id,license_id) on public.aurora_work_items to authenticated;
grant update(title,license_type,authority,protocol,jurisdiction,issued_on,expires_on,renewal_due_on,status,legal_basis,evidence,owner_label,notes) on public.aurora_licenses to authenticated;
grant update(title,category,direction,period,planned,committed,actual,notes) on public.aurora_financial_lines to authenticated;
grant update(title,radius_km,population,households,income,consumption,demand_score,access_score,competition_score,risk_score,source,source_url,reference_date,confidence,methodology,notes) on public.aurora_market_studies to authenticated;
create function aurora_private.guard_work_item() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is not null then
  if tg_op='INSERT' and (new.reviewed_by is not null or new.reviewed_at is not null or new.status='approved') then raise exception 'Use o fluxo de aprovação'; end if;
  if tg_op='UPDATE' and (old.title,old.description,old.details,old.evidence,old.due_on,old.owner_label) is distinct from (new.title,new.description,new.details,new.evidence,new.due_on,new.owner_label) then
    new.reviewed_by:=null;new.reviewed_at:=null;new.review_note:=null;if new.status='approved' then new.status:='review';end if;
  end if;
  if new.status='approved' and new.reviewed_by is null then raise exception 'Aprovação requer revisão registrada';end if;
 end if;
 if new.status in ('approved','done') and length(trim(new.evidence))<5 then raise exception 'Registre a evidência antes de concluir';end if;
 if new.dependency_id=new.id then raise exception 'Uma etapa não pode depender dela mesma';end if;
 if new.status in ('approved','done') and exists(select 1 from public.aurora_work_items d where d.id=new.dependency_id and d.status not in ('approved','done')) then raise exception 'Conclua a dependência primeiro';end if;
 new.updated_at:=now();return new;
end $$;
revoke all on function aurora_private.guard_work_item() from public,anon,authenticated;
create trigger aurora_guard_work before insert or update on public.aurora_work_items for each row execute function aurora_private.guard_work_item();
create function aurora_private.review_work(i uuid,decision text,note text) returns void language plpgsql security definer set search_path='' as $$
declare r public.aurora_work_items%rowtype;begin
 select * into r from public.aurora_work_items where id=i for update;
 if r.id is null or not aurora_private.module_access(r.workspace_id,r.module,'review') then raise exception 'Sem permissão para revisar';end if;
 if decision not in ('approved','blocked') or length(trim(note))<5 then raise exception 'Registre a decisão e a justificativa';end if;
 if r.status<>'review' then raise exception 'Envie a etapa para revisão primeiro';end if;
 if r.created_by=auth.uid() and aurora_private.role_for(r.workspace_id)<>'owner' then raise exception 'A revisão deve ser feita por outra pessoa';end if;
 update public.aurora_work_items set status=decision,reviewed_by=auth.uid(),reviewed_at=now(),review_note=note where id=i;
end $$;
create function public.aurora_review_work(i uuid,decision text,note text) returns void language sql security invoker set search_path='' as $$ select aurora_private.review_work(i,decision,note) $$;

alter table public.aurora_module_grants enable row level security;
create policy module_grants_read on public.aurora_module_grants for select to authenticated using(user_id=auth.uid() or aurora_private.role_for(workspace_id) in ('owner','admin','manager'));
alter table public.aurora_reports enable row level security;
alter table public.aurora_report_access enable row level security;
create policy report_read on public.aurora_reports for select to authenticated using(aurora_private.can_report(id));
create policy report_update on public.aurora_reports for update to authenticated using(status='draft' and aurora_private.role_for(workspace_id) in ('owner','admin','manager')) with check(status='draft' and aurora_private.role_for(workspace_id) in ('owner','admin','manager'));
create policy report_access_read on public.aurora_report_access for select to authenticated using(user_id=auth.uid() or aurora_private.role_for(workspace_id) in ('owner','admin','manager'));
revoke all on public.aurora_module_grants,public.aurora_reports,public.aurora_report_access from anon,authenticated;
grant select on public.aurora_module_grants,public.aurora_reports,public.aurora_report_access to authenticated;
grant update(title,narrative) on public.aurora_reports to authenticated;
create index on public.aurora_report_access(workspace_id,user_id);
create index on public.aurora_reports(workspace_id,created_at desc);
create trigger aurora_audit_change after insert or update on public.aurora_reports for each row execute function aurora_private.audit_change();
create function aurora_private.set_module_grant(w uuid,u uuid,m text,p text) returns void language plpgsql security definer set search_path='' as $$ begin
 if coalesce(aurora_private.role_for(w),'') not in ('owner','admin') then raise exception 'Sem permissão';end if;
 if exists(select 1 from public.aurora_members where workspace_id=w and user_id=u and role in ('owner','admin','client')) then raise exception 'Este perfil tem permissões próprias';end if;
 insert into public.aurora_module_grants(workspace_id,user_id,module,permission) values(w,u,m,p) on conflict(workspace_id,user_id,module) do update set permission=excluded.permission;
 insert into public.aurora_audit(workspace_id,actor_id,action,entity,entity_id) values(w,auth.uid(),'permission:'||m||':'||p,'aurora_module_grants',u::text);
end $$;
create function public.aurora_set_module_grant(w uuid,u uuid,m text,p text) returns void language sql security invoker set search_path='' as $$ select aurora_private.set_module_grant(w,u,m,p) $$;

create function aurora_private.create_report(w uuid,t text,asset_ids uuid[],include_financial boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare r uuid;s jsonb;begin
 if coalesce(aurora_private.role_for(w),'') not in ('owner','admin','manager') then raise exception 'Sem permissão';end if;
 if coalesce(array_length(asset_ids,1),0)=0 or array_length(asset_ids,1)>100 then raise exception 'Selecione entre 1 e 100 ativos';end if;
 if exists(select 1 from unnest(asset_ids) a where not exists(select 1 from public.aurora_assets x where x.id=a and x.workspace_id=w)) then raise exception 'Ativo fora da organização';end if;
 select jsonb_build_object('generated_at',now(),'is_demo',(select is_demo from public.aurora_workspaces where id=w),'include_financial',include_financial,
 'assets',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'stage',stage,'city',city,'state',state,'area_ha',area_ha,'estimated_value',case when include_financial then estimated_value else null end)) from public.aurora_assets where workspace_id=w and id=any(asset_ids)),'[]'::jsonb),
 'milestones',coalesce((select jsonb_agg(jsonb_build_object('asset_id',asset_id,'title',title,'module',module,'status',status,'progress',progress,'due_on',due_on)) from public.aurora_work_items where workspace_id=w and asset_id=any(asset_ids) and client_visible),'[]'::jsonb),
 'financial',case when include_financial then coalesce((select jsonb_agg(jsonb_build_object('asset_id',asset_id,'direction',direction,'period',period,'planned',planned,'actual',actual)) from public.aurora_financial_lines where workspace_id=w and asset_id=any(asset_ids)),'[]'::jsonb) else '[]'::jsonb end) into s;
 insert into public.aurora_reports(workspace_id,title,snapshot) values(w,t,s) returning id into r;return r;
end $$;
create function public.aurora_create_report(w uuid,t text,asset_ids uuid[],include_financial boolean default false) returns uuid language sql security invoker set search_path='' as $$ select aurora_private.create_report(w,t,asset_ids,include_financial) $$;
create function aurora_private.publish_report(r uuid,publish boolean) returns void language plpgsql security definer set search_path='' as $$
declare w uuid;begin
 select workspace_id into w from public.aurora_reports where id=r for update;
 if coalesce(aurora_private.role_for(w),'') not in ('owner','admin','manager') then raise exception 'Sem permissão';end if;
 update public.aurora_reports set status=case when publish then 'published' else 'archived' end,published_at=case when publish then now() else published_at end,published_by=auth.uid() where id=r;
end $$;
create function public.aurora_publish_report(r uuid,publish boolean) returns void language sql security invoker set search_path='' as $$ select aurora_private.publish_report(r,publish) $$;
create function aurora_private.share_report(r uuid,u uuid,expiry timestamptz,allow_download boolean,revoke_access boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare w uuid;begin
 select workspace_id into w from public.aurora_reports where id=r;
 if coalesce(aurora_private.role_for(w),'') not in ('owner','admin','manager') then raise exception 'Sem permissão';end if;
 if not exists(select 1 from public.aurora_members where workspace_id=w and user_id=u and active) then raise exception 'Destinatário não pertence à organização';end if;
 if revoke_access then delete from public.aurora_report_access where report_id=r and user_id=u;else
 if expiry is not null and expiry<=now() then raise exception 'A validade precisa estar no futuro';end if;
 insert into public.aurora_report_access(workspace_id,report_id,user_id,expires_at,can_download) values(w,r,u,expiry,allow_download) on conflict(report_id,user_id) do update set expires_at=excluded.expires_at,can_download=excluded.can_download;end if;
 insert into public.aurora_audit(workspace_id,actor_id,action,entity,entity_id) values(w,auth.uid(),case when revoke_access then 'revoke:' else 'share:' end||u::text,'aurora_reports',r::text);
end $$;
create function public.aurora_share_report(r uuid,u uuid,expiry timestamptz,allow_download boolean,revoke_access boolean default false) returns void language sql security invoker set search_path='' as $$ select aurora_private.share_report(r,u,expiry,allow_download,revoke_access) $$;

do $$ declare n text; sig regprocedure; begin
 foreach n in array array['review_work','set_module_grant','create_report','publish_report','share_report'] loop
 for sig in select p.oid::regprocedure from pg_proc p join pg_namespace s on s.oid=p.pronamespace where (s.nspname='aurora_private' and p.proname=n) or (s.nspname='public' and p.proname='aurora_'||n) loop
 execute format('revoke all on function %s from public,anon,authenticated',sig);execute format('grant execute on function %s to authenticated',sig);end loop;end loop;end $$;
commit;
