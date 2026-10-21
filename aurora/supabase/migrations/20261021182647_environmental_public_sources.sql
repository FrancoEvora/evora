-- Environmental sources reuse the tenant/module authorization, rate limits and worker leases.
alter table public.aurora_sources drop constraint aurora_sources_source_key_check;
alter table public.aurora_sources add constraint aurora_sources_source_key_check check(source_key in ('ibge_census','ibge_population','ibge_gdp','ibge_sinapi','ibge_custom','bcb_selic','bcb_ipca','anm_mining','ibama','icmbio','incra','sinisa','inde','municipality','caged','inep','cnes','mapbiomas','ibge_sectors','osm_places','cnpj_businesses','ide_sisema','iphan','graprohab'));
create unique index aurora_environment_source_unique on public.aurora_sources(asset_id,source_key) where source_key in ('ide_sisema','ibama','icmbio','iphan','graprohab');
do $$ declare f text;r regprocedure;begin
 foreach r in array array['aurora_private.claim_source(uuid)'::regprocedure,'aurora_private.source_jobs(text)'::regprocedure,'aurora_private.import_source(uuid,jsonb)'::regprocedure,'aurora_private.guard_source_schedule()'::regprocedure] loop
  f:=pg_get_functiondef(r);
  if position('''cnpj_businesses'')' in f)=0 then raise exception 'Unexpected source whitelist: %',r;end if;
  f:=replace(f,'''cnpj_businesses'')','''cnpj_businesses'',''ide_sisema'',''ibama'',''icmbio'',''iphan'',''graprohab'')');
  if r='aurora_private.guard_source_schedule()'::regprocedure then
   f:=replace(replace(f,')>=100 then',')>=1000 then'),'Limite de 100 conexões','Limite de 1000 conexões');
  end if;
  if r in ('aurora_private.claim_source(uuid)'::regprocedure,'aurora_private.source_jobs(text)'::regprocedure) then
   -- Read the current polygon/state server-side. Never trust editable source config for legal geography.
   f:=replace(f,'to_jsonb(s)','(to_jsonb(s)||jsonb_build_object(''asset_geometry'',(select a.geometry from public.aurora_assets a where a.id=s.asset_id and a.workspace_id=s.workspace_id),''asset_state'',(select a.state from public.aurora_assets a where a.id=s.asset_id and a.workspace_id=s.workspace_id)))');
  end if;
  execute f;
 end loop;
 f:=pg_get_functiondef('aurora_private.finish_source(text,uuid,uuid,jsonb,text)'::regprocedure);
 if position('''cnpj_businesses'') then 6000000' in f)=0 then raise exception 'Unexpected snapshot size guard';end if;
 execute replace(f,'''cnpj_businesses'') then 6000000','''cnpj_businesses'',''ide_sisema'',''ibama'',''icmbio'',''iphan'',''graprohab'') then 6000000');
end $$;
create function aurora_private.connect_environment_defaults() returns trigger language plpgsql security definer set search_path='' as $$
declare item record;configuration jsonb;begin
 configuration:=jsonb_build_object('auto_default',4,'municipality',new.municipality_code,'latitude',new.latitude,'longitude',new.longitude,'state',new.state);
 for item in select * from (values ('ide_sisema','IDE-Sisema · Ambiente e território de MG','monthly'),('ibama','IBAMA · Embargos ambientais','weekly'),('icmbio','ICMBio · UCs federais e cavidades','monthly'),('iphan','IPHAN · Patrimônio e arqueologia','monthly'),('graprohab','Graprohab · Empreendimentos de SP','monthly')) as x(key,title,cadence) loop
  insert into public.aurora_sources(workspace_id,asset_id,source_key,title,config,cadence,created_by) values(new.workspace_id,new.id,item.key,item.title,configuration,item.cadence,new.created_by) on conflict do nothing;
  update public.aurora_sources set config=configuration,snapshot=null,last_success_at=null,last_status=null,last_error=null,lease_token=null,locked_until=null,last_attempt_at=null,next_run_at=now()
  where asset_id=new.id and source_key=item.key and (config is distinct from configuration or (tg_op='UPDATE' and old.geometry is distinct from new.geometry));
 end loop;return new;
end $$;
revoke all on function aurora_private.connect_environment_defaults() from public,anon,authenticated;
create trigger aurora_asset_environment_sources after insert or update of geometry,municipality_code,state on public.aurora_assets for each row execute function aurora_private.connect_environment_defaults();
insert into public.aurora_sources(workspace_id,asset_id,source_key,title,config,cadence,created_by)
select a.workspace_id,a.id,item.key,item.title,jsonb_build_object('auto_default',4,'municipality',a.municipality_code,'latitude',a.latitude,'longitude',a.longitude,'state',a.state),item.cadence,a.created_by
from public.aurora_assets a cross join (values ('ide_sisema','IDE-Sisema · Ambiente e território de MG','monthly'),('ibama','IBAMA · Embargos ambientais','weekly'),('icmbio','ICMBio · UCs federais e cavidades','monthly'),('iphan','IPHAN · Patrimônio e arqueologia','monthly'),('graprohab','Graprohab · Empreendimentos de SP','monthly')) as item(key,title,cadence)
where a.geometry is not null on conflict do nothing;
