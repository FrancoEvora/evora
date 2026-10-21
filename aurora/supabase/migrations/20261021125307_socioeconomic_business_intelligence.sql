-- Public business snapshots reuse the Intelligence module's existing authorization.
alter table public.aurora_sources drop constraint aurora_sources_source_key_check;
alter table public.aurora_sources add constraint aurora_sources_source_key_check check(source_key in (
 'ibge_census','ibge_population','ibge_gdp','ibge_sinapi','ibge_custom','bcb_selic','bcb_ipca','anm_mining',
 'ibama','icmbio','incra','sinisa','inde','municipality','caged','inep','cnes','mapbiomas','ibge_sectors','osm_places','cnpj_businesses'));
create unique index aurora_business_source_unique on public.aurora_sources(asset_id,source_key) where source_key='cnpj_businesses';
do $$ declare f text;r regprocedure;begin
 foreach r in array array['aurora_private.claim_source(uuid)'::regprocedure,'aurora_private.source_jobs(text)'::regprocedure,'aurora_private.import_source(uuid,jsonb)'::regprocedure,'aurora_private.guard_source_schedule()'::regprocedure] loop
  f:=pg_get_functiondef(r);
  if position('cnpj_businesses' in f)=0 then
   if position('''osm_places'')' in f)=0 then raise exception 'Unexpected source whitelist: %',r;end if;
   execute replace(f,'''osm_places'')','''osm_places'',''cnpj_businesses'')');
  end if;
 end loop;
 f:=pg_get_functiondef('aurora_private.finish_source(text,uuid,uuid,jsonb,text)'::regprocedure);
 if position('octet_length(payload::text)>1000000' in f)=0 then raise exception 'Unexpected snapshot size guard';end if;
 f:=replace(f,'octet_length(payload::text)>1000000','octet_length(payload::text)>case when s.source_key in (''ibge_sectors'',''osm_places'',''cnpj_businesses'') then 6000000 else 1000000 end');
 -- Continue bounded business pagination on the next daily worker, then return to the selected cadence.
 f:=replace(f,'when failure is not null then interval ''1 day''','when failure is not null then interval ''1 day'' when s.source_key=''cnpj_businesses'' and payload#>>''{business,complete}''=''false'' and jsonb_array_length(payload#>''{business,records}'')<10000 then interval ''1 day''');
 execute f;
end $$;
create function aurora_private.connect_business_default() returns trigger language plpgsql security definer set search_path='' as $$
declare configuration jsonb;begin
 configuration:=jsonb_build_object('auto_default',3,'municipality',new.municipality_code);
 insert into public.aurora_sources(workspace_id,asset_id,source_key,title,config,cadence,created_by)
 values(new.workspace_id,new.id,'cnpj_businesses','CNPJ · Empresas por atividade',configuration,'monthly',new.created_by) on conflict do nothing;
 update public.aurora_sources set config=configuration,snapshot=null,last_success_at=null,last_status=null,last_error=null,lease_token=null,locked_until=null,last_attempt_at=null,next_run_at=now()
 where asset_id=new.id and source_key='cnpj_businesses' and config->>'auto_default'='3' and config is distinct from configuration;
 return new;
end $$;
revoke all on function aurora_private.connect_business_default() from public,anon,authenticated;
create trigger aurora_asset_business_source after insert or update of municipality_code on public.aurora_assets for each row execute function aurora_private.connect_business_default();
insert into public.aurora_sources(workspace_id,asset_id,source_key,title,config,cadence,created_by)
select a.workspace_id,a.id,'cnpj_businesses','CNPJ · Empresas por atividade',jsonb_build_object('auto_default',3,'municipality',a.municipality_code),'monthly',a.created_by from public.aurora_assets a where a.municipality_code is not null on conflict do nothing;
create or replace view public.aurora_sources_summary with (security_invoker=true) as
select id,workspace_id,asset_id,source_key,title,config,cadence,enabled,next_run_at,last_attempt_at,last_success_at,last_status,last_error,
 snapshot-'spatial'-'business' as snapshot,created_by,created_at from public.aurora_sources;
create or replace view public.aurora_source_runs_summary with (security_invoker=true) as
select id,workspace_id,source_id,status,snapshot-'spatial'-'business' as snapshot,error,created_at from public.aurora_source_runs;
