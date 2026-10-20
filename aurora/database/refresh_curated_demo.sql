update aurora_private.demo_snapshot d set body=jsonb_set(jsonb_set(d.body,'{data,assets}',(
 select jsonb_agg(e.value||jsonb_build_object('geometry',a.geometry,'polygon_area_ha',a.polygon_area_ha,'municipality_code',a.municipality_code,'latitude',a.latitude,'longitude',a.longitude,'notes',a.notes) order by e.ordinality)
 from jsonb_array_elements(d.body#>'{data,assets}') with ordinality e(value,ordinality) join public.aurora_assets a on a.id=(e.value->>'id')::uuid join public.aurora_workspaces w on w.id=a.workspace_id and w.is_demo
)),'{data,sources}',(
 select jsonb_agg(jsonb_build_object('id',s.id,'workspace_id',s.workspace_id,'asset_id',s.asset_id,'source_key',s.source_key,'title',s.title,'config',s.config,'cadence',s.cadence,'enabled',s.enabled,'next_run_at',s.next_run_at,'last_attempt_at',s.last_attempt_at,'last_success_at',s.last_success_at,'last_status',s.last_status,'last_error',s.last_error,'snapshot',s.snapshot) order by s.asset_id,s.source_key)
 from public.aurora_sources s join public.aurora_workspaces w on w.id=s.workspace_id and w.is_demo
 where exists(select 1 from jsonb_array_elements(d.body#>'{data,assets}') a where a->>'id'=s.asset_id::text)
));
select jsonb_build_object('assets',jsonb_array_length(body#>'{data,assets}'),'polygons',(select count(*) from jsonb_array_elements(body#>'{data,assets}') a where a->'geometry'->>'type'='MultiPolygon'),'connections',jsonb_array_length(body#>'{data,sources}'),'valid_readings',(select count(*) from jsonb_array_elements(body#>'{data,sources}') s where s->>'last_status'='success')) from aurora_private.demo_snapshot;
