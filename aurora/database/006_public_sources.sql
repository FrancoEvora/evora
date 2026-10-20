-- Public-data provenance, scheduled acquisition and immutable update history.
create table public.aurora_sources(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,asset_id uuid not null,
 source_key text not null check(source_key in ('ibge_census','ibge_population','ibge_gdp','ibge_sinapi','ibge_custom','bcb_selic','bcb_ipca','anm_mining','ibama','icmbio','incra','sinisa','inde','municipality')),
 title text not null check(length(title) between 2 and 200),config jsonb not null default '{}' check(octet_length(config::text)<4000),
 cadence text not null default 'manual' check(cadence in ('manual','daily','weekly','monthly')),enabled boolean not null default true,
 next_run_at timestamptz not null default now(),last_attempt_at timestamptz,last_success_at timestamptz,last_status text,last_error text,
 snapshot jsonb,lease_token uuid,locked_until timestamptz,created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),
 foreign key(workspace_id,asset_id) references public.aurora_assets(workspace_id,id) on delete cascade,unique(workspace_id,id)
);
create table public.aurora_source_runs(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,source_id uuid not null,
 status text not null check(status in ('success','error','manual')),snapshot jsonb,error text,created_at timestamptz not null default now(),
 foreign key(workspace_id,source_id) references public.aurora_sources(workspace_id,id) on delete cascade
);
create index on public.aurora_sources(workspace_id,asset_id);
create index on public.aurora_sources(next_run_at) where enabled and cadence<>'manual';
create index on public.aurora_source_runs(workspace_id,source_id,created_at desc);
alter table public.aurora_sources enable row level security;
alter table public.aurora_source_runs enable row level security;
revoke all on public.aurora_sources,public.aurora_source_runs from anon,authenticated;
grant select on public.aurora_sources,public.aurora_source_runs to authenticated;
grant insert(workspace_id,asset_id,source_key,title,config,cadence,enabled) on public.aurora_sources to authenticated;
grant update(title,cadence,enabled) on public.aurora_sources to authenticated;
create policy sources_read on public.aurora_sources for select to authenticated using(aurora_private.module_access(workspace_id,'intelligence'));
create policy sources_insert on public.aurora_sources for insert to authenticated with check(aurora_private.role_for(workspace_id) in ('owner','admin','manager') and aurora_private.module_access(workspace_id,'intelligence','write') and created_by=auth.uid());
create policy sources_update on public.aurora_sources for update to authenticated using(aurora_private.role_for(workspace_id) in ('owner','admin','manager') and aurora_private.module_access(workspace_id,'intelligence','write'));
create policy source_runs_read on public.aurora_source_runs for select to authenticated using(aurora_private.module_access(workspace_id,'intelligence'));
create trigger aurora_audit_change after insert or update of title,cadence,enabled on public.aurora_sources for each row execute function aurora_private.audit_change();
create function aurora_private.source_authorized(w uuid,u uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.aurora_members m where m.workspace_id=w and m.user_id=u and m.active and (m.role in ('owner','admin') or (m.role in ('manager','analyst') and coalesce((select permission from public.aurora_module_grants g where g.workspace_id=w and g.user_id=u and g.module='intelligence'),'write') in ('write','review'))))
$$;
revoke all on function aurora_private.source_authorized(uuid,uuid) from public,anon,authenticated;
create function aurora_private.claim_source(i uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.aurora_sources%rowtype;begin
 select * into s from public.aurora_sources where id=i for update;
 if s.id is null or not aurora_private.module_access(s.workspace_id,'intelligence','write') then raise exception 'Sem permissão para atualizar';end if;
 if s.source_key not in ('ibge_census','ibge_population','ibge_gdp','ibge_sinapi','ibge_custom','bcb_selic','bcb_ipca','anm_mining') then raise exception 'Use importação manual para esta fonte';end if;
 if s.last_attempt_at>now()-interval '1 minute' or s.locked_until>now() then raise exception 'Atualização em andamento ou muito recente. Aguarde um minuto';end if;
 if (select count(*) from public.aurora_source_runs where workspace_id=s.workspace_id and created_at>now()-interval '1 day')>=200 then raise exception 'Limite diário de 200 atualizações da organização atingido';end if;
 update public.aurora_sources set lease_token=gen_random_uuid(),locked_until=now()+interval '5 minutes',last_attempt_at=now(),last_status='running' where id=i returning * into s;
 return to_jsonb(s);
end $$;
create function public.aurora_claim_source(i uuid) returns jsonb language sql security invoker set search_path='' as $$select aurora_private.claim_source(i)$$;
create function aurora_private.source_jobs(token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare s record;result jsonb:='[]';begin
 perform aurora_private.verify_worker(token);
 for s in select x.* from public.aurora_sources x where x.enabled and x.cadence<>'manual' and x.next_run_at<=now() and (x.locked_until is null or x.locked_until<now()) and x.source_key in ('ibge_census','ibge_population','ibge_gdp','ibge_sinapi','ibge_custom','bcb_selic','bcb_ipca','anm_mining') and aurora_private.source_authorized(x.workspace_id,x.created_by) order by x.next_run_at limit 24 for update skip locked loop
 update public.aurora_sources set lease_token=gen_random_uuid(),locked_until=now()+interval '5 minutes',last_attempt_at=now(),last_status='running' where id=s.id returning * into s;
 result:=result||jsonb_build_array(to_jsonb(s));end loop;return result;
end $$;
create function public.aurora_source_jobs(token text) returns jsonb language sql security invoker set search_path='' as $$select aurora_private.source_jobs(token)$$;
create function aurora_private.finish_source(token text,i uuid,lease uuid,payload jsonb,failure text) returns void language plpgsql security definer set search_path='' as $$
declare s public.aurora_sources%rowtype;begin
 perform aurora_private.verify_worker(token);select * into s from public.aurora_sources where id=i for update;
 if s.id is null or s.lease_token is distinct from lease or s.locked_until<now() then raise exception 'Execução expirada';end if;
 if payload is not null and (octet_length(payload::text)>1000000 or jsonb_typeof(payload->'rows')<>'array') then raise exception 'Resposta inválida';end if;
 insert into public.aurora_source_runs(workspace_id,source_id,status,snapshot,error) values(s.workspace_id,i,case when failure is null then 'success' else 'error' end,payload,left(failure,500));
 update public.aurora_sources set snapshot=case when failure is null then payload else snapshot end,last_success_at=case when failure is null then now() else last_success_at end,last_status=case when failure is null then 'success' else 'error' end,last_error=left(failure,500),lease_token=null,locked_until=null,next_run_at=now()+case when failure is not null then interval '1 day' when cadence='daily' then interval '1 day' when cadence='weekly' then interval '7 days' else interval '1 month' end where id=i;
end $$;
create function public.aurora_finish_source(token text,i uuid,lease uuid,payload jsonb,failure text) returns void language sql security invoker set search_path='' as $$select aurora_private.finish_source(token,i,lease,payload,failure)$$;
create function aurora_private.import_source(i uuid,payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare s public.aurora_sources%rowtype;begin
 select * into s from public.aurora_sources where id=i for update;
 if s.id is null or not aurora_private.module_access(s.workspace_id,'intelligence','write') then raise exception 'Sem permissão';end if;
 if s.source_key in ('ibge_census','ibge_population','ibge_gdp','ibge_sinapi','ibge_custom','bcb_selic','bcb_ipca','anm_mining') then raise exception 'Esta conexão exige consulta ao provedor';end if;
 if payload is null or octet_length(payload::text)>1000000 or coalesce(jsonb_typeof(payload->'rows'),'')<>'array' or coalesce(payload->>'source_url','')!~'^https://' then raise exception 'Arquivo ou fonte inválida';end if;
 payload:=payload||jsonb_build_object('real_public_data',false,'manual_import',true,'imported_by',auth.uid(),'fetched_at',now());
 insert into public.aurora_source_runs(workspace_id,source_id,status,snapshot) values(s.workspace_id,i,'manual',payload);
 update public.aurora_sources set snapshot=payload,last_success_at=now(),last_attempt_at=now(),last_status='manual',last_error=null where id=i;
end $$;
create function public.aurora_import_source(i uuid,payload jsonb) returns void language sql security invoker set search_path='' as $$select aurora_private.import_source(i,payload)$$;
revoke all on function aurora_private.claim_source(uuid),public.aurora_claim_source(uuid),aurora_private.import_source(uuid,jsonb),public.aurora_import_source(uuid,jsonb) from public,anon;
grant execute on function aurora_private.claim_source(uuid),public.aurora_claim_source(uuid),aurora_private.import_source(uuid,jsonb),public.aurora_import_source(uuid,jsonb) to authenticated;
revoke all on function aurora_private.source_jobs(text),public.aurora_source_jobs(text),aurora_private.finish_source(text,uuid,uuid,jsonb,text),public.aurora_finish_source(text,uuid,uuid,jsonb,text) from public,authenticated;
grant execute on function aurora_private.source_jobs(text),public.aurora_source_jobs(text),aurora_private.finish_source(text,uuid,uuid,jsonb,text),public.aurora_finish_source(text,uuid,uuid,jsonb,text) to anon;
