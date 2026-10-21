-- Only public-source metadata on assets explicitly present in the curated demo.
-- Heavy geometries are separate public files, loaded on selection. No live identities.
update aurora_private.demo_snapshot d set body=jsonb_set(d.body,'{data,sources}',
 coalesce((select jsonb_agg(e.value) from jsonb_array_elements(d.body#>'{data,sources}') e where e.value->>'source_key' not in ('ibge_sectors','osm_places')),'[]') ||
 coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'workspace_id',s.workspace_id,'asset_id',s.asset_id,'source_key',s.source_key,'title',s.title,'config',s.config,'cadence',s.cadence,'enabled',s.enabled,'next_run_at',s.next_run_at,'last_attempt_at',s.last_attempt_at,'last_success_at',s.last_success_at,'last_status',s.last_status,'last_error',s.last_error,'snapshot',s.snapshot-'spatial','created_by','demo','created_at',s.created_at))
  from public.aurora_sources s join public.aurora_workspaces w on w.id=s.workspace_id and w.is_demo
  where s.source_key in ('ibge_sectors','osm_places') and exists(select 1 from jsonb_array_elements(d.body#>'{data,assets}') a where a->>'id'=s.asset_id::text)),'[]'));
select jsonb_build_object('sources',jsonb_array_length(body#>'{data,sources}'),'geography_sources',(select count(*) from jsonb_array_elements(body#>'{data,sources}') s where s->>'source_key' in ('ibge_sectors','osm_places')),'heavy_geometry_in_boot',(select count(*) from jsonb_array_elements(body#>'{data,sources}') s where s->'snapshot' ? 'spatial')) from aurora_private.demo_snapshot;
