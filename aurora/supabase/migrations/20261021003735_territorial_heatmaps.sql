-- Public spatial sources inherit the existing Intelligence authorization and leases.
-- No new access to private assets, no shared-project Auth changes.
alter table public.aurora_sources drop constraint aurora_sources_source_key_check;
alter table public.aurora_sources add constraint aurora_sources_source_key_check check(source_key in (
 'ibge_census','ibge_population','ibge_gdp','ibge_sinapi','ibge_custom','bcb_selic','bcb_ipca','anm_mining',
 'ibama','icmbio','incra','sinisa','inde','municipality','caged','inep','cnes','mapbiomas','ibge_sectors','osm_places'));
create unique index aurora_geo_source_unique on public.aurora_sources(asset_id,source_key) where source_key in ('ibge_sectors','osm_places');

-- Keep the established permission, rate limit, worker secret, and lease checks.
do $$ declare f text;r regprocedure;begin
 foreach r in array array['aurora_private.claim_source(uuid)'::regprocedure,'aurora_private.source_jobs(text)'::regprocedure,'aurora_private.import_source(uuid,jsonb)'::regprocedure,'aurora_private.guard_source_schedule()'::regprocedure] loop
  f:=pg_get_functiondef(r);
  if position('ibge_sectors' in f)=0 then
   if position('''anm_mining'')' in f)=0 then raise exception 'Unexpected source function definition: %',r;end if;
   execute replace(f,'''anm_mining'')','''anm_mining'',''ibge_sectors'',''osm_places'')');
  end if;
 end loop;
end $$;

create function aurora_private.connect_geo_defaults() returns trigger language plpgsql security definer set search_path='' as $$
declare item record;configuration jsonb;begin
 configuration:=jsonb_build_object('auto_default',2,'municipality',new.municipality_code,'latitude',new.latitude,'longitude',new.longitude);
 for item in select * from (values ('ibge_sectors','IBGE · População e domicílios por setor','monthly'),('osm_places','OpenStreetMap · Atividade e serviços','weekly')) as x(key,title,cadence) loop
  insert into public.aurora_sources(workspace_id,asset_id,source_key,title,config,cadence,created_by)
  values(new.workspace_id,new.id,item.key,item.title,configuration,item.cadence,new.created_by) on conflict do nothing;
  update public.aurora_sources set config=configuration,snapshot=null,last_success_at=null,last_status=null,last_error=null,
   lease_token=null,locked_until=null,last_attempt_at=null,next_run_at=now()
  where asset_id=new.id and source_key=item.key and config->>'auto_default'='2' and config is distinct from configuration;
 end loop;
 return new;
end $$;
revoke all on function aurora_private.connect_geo_defaults() from public,anon,authenticated;
create trigger aurora_asset_geo_sources after insert or update of geometry,municipality_code on public.aurora_assets for each row execute function aurora_private.connect_geo_defaults();

insert into public.aurora_sources(workspace_id,asset_id,source_key,title,config,cadence,created_by)
select a.workspace_id,a.id,item.key,item.title,jsonb_build_object('auto_default',2,'municipality',a.municipality_code,'latitude',a.latitude,'longitude',a.longitude),item.cadence,a.created_by
from public.aurora_assets a cross join (values ('ibge_sectors','IBGE · População e domicílios por setor','monthly'),('osm_places','OpenStreetMap · Atividade e serviços','weekly')) as item(key,title,cadence)
where a.latitude is not null and a.longitude is not null and a.municipality_code is not null
on conflict do nothing;

-- Lightweight boot/history data. Full geometry is fetched only for the selected
-- authorized source, under the source table's unchanged RLS policies.
create view public.aurora_sources_summary with (security_invoker=true) as
select id,workspace_id,asset_id,source_key,title,config,cadence,enabled,next_run_at,last_attempt_at,last_success_at,last_status,last_error,
 snapshot-'spatial' as snapshot,created_by,created_at from public.aurora_sources;
create view public.aurora_source_runs_summary with (security_invoker=true) as
select id,workspace_id,source_id,status,snapshot-'spatial' as snapshot,error,created_at from public.aurora_source_runs;
revoke all on public.aurora_sources_summary,public.aurora_source_runs_summary from public,anon,authenticated;
grant select on public.aurora_sources_summary,public.aurora_source_runs_summary to authenticated;
