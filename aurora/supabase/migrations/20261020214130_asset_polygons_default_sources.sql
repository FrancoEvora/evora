-- Mandatory asset perimeters and automatic, tenant-scoped public-source provisioning.
-- PostGIS already exists in extensions. No changes to other applications.
alter table public.aurora_assets add column municipality_code text;
alter table public.aurora_assets add column polygon_area_ha numeric;
grant select(municipality_code,polygon_area_ha),insert(municipality_code),update(municipality_code) on public.aurora_assets to authenticated;

create function aurora_private.guard_asset_polygon() returns trigger language plpgsql security invoker set search_path='' as $$
declare g extensions.geometry;part jsonb;pieces extensions.geometry[]:='{}';p extensions.geometry;uf_code text;
begin
 if new.geometry is null or new.geometry='null'::jsonb then raise exception 'O ativo precisa de uma poligonal. Desenhe ou importe seu perímetro.';end if;
 if octet_length(new.geometry::text)>1000000 then raise exception 'Poligonal muito grande. Simplifique para até 10.000 vértices.';end if;
 begin
  if new.geometry->>'type'='FeatureCollection' then
   for part in select value->'geometry' from jsonb_array_elements(new.geometry->'features') loop
    if coalesce(part->>'type','') not in ('Polygon','MultiPolygon') then raise exception 'Tipo não poligonal';end if;
    pieces:=array_append(pieces,extensions.st_geomfromgeojson(part));
   end loop;g:=extensions.st_multi(extensions.st_collectionextract(extensions.st_collect(pieces),3));
  else
   part:=case when new.geometry->>'type'='Feature' then new.geometry->'geometry' else new.geometry end;
   if coalesce(part->>'type','') not in ('Polygon','MultiPolygon') then raise exception 'Tipo não poligonal';end if;
   g:=extensions.st_multi(extensions.st_geomfromgeojson(part));
  end if;
 exception when others then raise exception 'Geometria inválida. Use Polygon ou MultiPolygon em WGS84.';end;
 if g is null or extensions.st_isempty(g) or extensions.st_srid(g)<>4326 or extensions.st_npoints(g)>10000 then raise exception 'Poligonal vazia, fora de WGS84 ou com mais de 10.000 vértices.';end if;
 g:=extensions.st_force2d(g);
 if not extensions.st_isvalid(g) then raise exception 'Poligonal inválida: %. Corrija cruzamentos e contornos.',extensions.st_isvalidreason(g);end if;
 if extensions.st_xmin(g::extensions.box3d)<-180 or extensions.st_xmax(g::extensions.box3d)>180 or extensions.st_ymin(g::extensions.box3d)<-90 or extensions.st_ymax(g::extensions.box3d)>90 then raise exception 'Coordenadas fora de WGS84.';end if;
 new.polygon_area_ha:=extensions.st_area(g::extensions.geography)/10000;
 if not(new.polygon_area_ha>0 and new.polygon_area_ha<51000000000) then raise exception 'Poligonal sem área válida.';end if;
 new.geometry:=extensions.st_asgeojson(g,9)::jsonb;
 p:=extensions.st_pointonsurface(g);new.latitude:=extensions.st_y(p);new.longitude:=extensions.st_x(p);
 uf_code:='{"RO":"11","AC":"12","AM":"13","RR":"14","PA":"15","AP":"16","TO":"17","MA":"21","PI":"22","CE":"23","RN":"24","PB":"25","PE":"26","AL":"27","SE":"28","BA":"29","MG":"31","ES":"32","RJ":"33","SP":"35","PR":"41","SC":"42","RS":"43","MS":"50","MT":"51","GO":"52","DF":"53"}'::jsonb->>new.state;
 if coalesce(new.municipality_code,'')!~'^[0-9]{7}$' or uf_code is null or left(new.municipality_code,2)<>uf_code or length(trim(new.city))=0 then raise exception 'Selecione um município oficial do IBGE e sua UF.';end if;
 return new;
end $$;
revoke all on function aurora_private.guard_asset_polygon() from public,anon,authenticated;
create trigger aurora_asset_polygon before insert or update on public.aurora_assets for each row execute function aurora_private.guard_asset_polygon();

-- Only synthetic demonstration records receive generated example perimeters.
-- The irregular hexagon is scaled in local UTM to the declared area, then converted to WGS84.
with examples as (
 select a.id,a.geometry,a.longitude,a.latitude,a.area_ha,
 (select s.config->>'municipality' from public.aurora_sources s where s.asset_id=a.id and s.source_key='ibge_census' limit 1) as code,
 extensions.st_geomfromtext('POLYGON((-0.5 -0.4,0.25 -0.5,0.55 -0.15,0.42 0.42,-0.2 0.5,-0.5 0.15,-0.5 -0.4))') as shape,
 32700+floor((a.longitude+180)/6)::int+1 as utm
 from public.aurora_assets a join public.aurora_workspaces w on w.id=a.workspace_id
 where w.is_demo and a.geometry is null
), projected as (
 select *,extensions.st_transform(extensions.st_setsrid(extensions.st_makepoint(longitude,latitude),4326),utm) as center,
 sqrt(area_ha*10000/extensions.st_area(shape)) as scale from examples
)
update public.aurora_assets a set municipality_code=e.code,
 geometry=extensions.st_asgeojson(extensions.st_transform(extensions.st_setsrid(extensions.st_translate(extensions.st_scale(e.shape,e.scale,e.scale),extensions.st_x(e.center),extensions.st_y(e.center)),e.utm),4326),9)::jsonb,
 notes=a.notes||E'\n\nPoligonal demonstrativa e sintética, gerada apenas para explorar a plataforma. Não representa limite cadastral, matrícula ou imóvel real.'
from projected e where e.id=a.id;

create unique index aurora_default_source_unique on public.aurora_sources(asset_id,source_key)
 where source_key in ('ibge_census','ibge_population','ibge_gdp','ibge_sinapi','bcb_selic','bcb_ipca','anm_mining');

-- The definer is restricted to this trigger (no executable RPC). Asset RLS authorizes
-- the initiating write; all seven targets are fixed and inherit NEW.workspace_id.
create function aurora_private.connect_asset_defaults() returns trigger language plpgsql security definer set search_path='' as $$
declare item record;configuration jsonb;begin
 for item in select * from (values
 ('ibge_census','IBGE · Censo e densidade','weekly'),('ibge_population','IBGE · Estimativa populacional','weekly'),
 ('ibge_gdp','IBGE · Economia municipal','weekly'),('ibge_sinapi','IBGE · SINAPI da construção','weekly'),
 ('bcb_selic','BCB · Meta Selic','daily'),('bcb_ipca','BCB · IPCA mensal','daily'),('anm_mining','ANM · Processos minerários','weekly')) as x(key,title,cadence)
 loop
  configuration:=jsonb_build_object('auto_default',1);
  if item.key like 'ibge_%' then configuration:=configuration||jsonb_build_object('municipality',new.municipality_code);
  elsif item.key='anm_mining' then configuration:=configuration||jsonb_build_object('latitude',new.latitude,'longitude',new.longitude);end if;
  insert into public.aurora_sources(workspace_id,asset_id,source_key,title,config,cadence,created_by)
  select new.workspace_id,new.id,item.key,item.title,configuration,item.cadence,new.created_by
  where not exists(select 1 from public.aurora_sources where asset_id=new.id and source_key=item.key)
  on conflict do nothing;
  -- Preserve pause/frequency choices; invalidate stale geography, leases and current snapshots.
  -- Immutable reading history remains available with its original geographic scope.
  update public.aurora_sources s set config=configuration,snapshot=null,last_success_at=null,last_status=null,last_error=null,
   lease_token=null,locked_until=null,last_attempt_at=null,next_run_at=now()
  where s.asset_id=new.id and s.source_key=item.key and s.config->>'auto_default'='1' and s.config is distinct from configuration;
 end loop;
 return new;
end $$;
revoke all on function aurora_private.connect_asset_defaults() from public,anon,authenticated;
create trigger aurora_asset_default_sources after insert or update of geometry,municipality_code on public.aurora_assets for each row execute function aurora_private.connect_asset_defaults();
-- Adopt existing default connections without discarding their valid historical snapshots.
update public.aurora_sources s set config=case when s.source_key like 'ibge_%' then jsonb_build_object('municipality',a.municipality_code,'auto_default',1) when s.source_key='anm_mining' then jsonb_build_object('latitude',a.latitude,'longitude',a.longitude,'auto_default',1) else jsonb_build_object('auto_default',1) end
from public.aurora_assets a where a.id=s.asset_id and s.source_key in ('ibge_census','ibge_population','ibge_gdp','ibge_sinapi','bcb_selic','bcb_ipca','anm_mining');
update public.aurora_assets set geometry=geometry where municipality_code is not null;
