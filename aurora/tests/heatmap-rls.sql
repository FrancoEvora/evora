-- No test user, membership, asset, or reading persists after this transaction.
begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,raw_app_meta_data) values
('e3302026-0000-4000-8000-000000000001','aurora-geo-owner@example.invalid',now(),'{}','{}'),
('e3302026-0000-4000-8000-000000000002','aurora-geo-other@example.invalid',now(),'{}','{}'),
('e3302026-0000-4000-8000-000000000003','aurora-geo-viewer@example.invalid',now(),'{}','{}'),
('e3302026-0000-4000-8000-000000000004','aurora-geo-client@example.invalid',now(),'{}','{}');
insert into public.aurora_workspaces(id,name,created_by) values
('e3302026-0000-4000-8000-000000000010','Geo permission test','e3302026-0000-4000-8000-000000000001'),
('e3302026-0000-4000-8000-000000000011','Geo other tenant','e3302026-0000-4000-8000-000000000002');
insert into public.aurora_members(workspace_id,user_id,display_name,email,role) values
('e3302026-0000-4000-8000-000000000010','e3302026-0000-4000-8000-000000000001','Owner','owner@example.invalid','owner'),
('e3302026-0000-4000-8000-000000000011','e3302026-0000-4000-8000-000000000002','Other','other@example.invalid','owner'),
('e3302026-0000-4000-8000-000000000010','e3302026-0000-4000-8000-000000000003','Viewer','viewer@example.invalid','viewer'),
('e3302026-0000-4000-8000-000000000010','e3302026-0000-4000-8000-000000000004','Client','client@example.invalid','client');
insert into public.aurora_assets(id,workspace_id,name,division,created_by,city,state,municipality_code,geometry) values
('e3302026-0000-4000-8000-000000000020','e3302026-0000-4000-8000-000000000010','Geo QA synthetic','urban','e3302026-0000-4000-8000-000000000001','Monte Carmelo','MG','3143104','{"type":"Polygon","coordinates":[[[-47.49,-18.73],[-47.48,-18.73],[-47.48,-18.72],[-47.49,-18.73]]]}'),
('e3302026-0000-4000-8000-000000000021','e3302026-0000-4000-8000-000000000011','Geo QA other synthetic','urban','e3302026-0000-4000-8000-000000000002','Monte Carmelo','MG','3143104','{"type":"Polygon","coordinates":[[[-47.49,-18.73],[-47.48,-18.73],[-47.48,-18.72],[-47.49,-18.73]]]}');
update public.aurora_sources set snapshot='{"rows":[],"spatial":{"type":"FeatureCollection","features":[]}}',last_status='success'
where asset_id in ('e3302026-0000-4000-8000-000000000020','e3302026-0000-4000-8000-000000000021') and source_key='ibge_sectors';
update public.aurora_sources set snapshot='{"rows":[],"business":{"records":[]}}',last_status='success'
where asset_id in ('e3302026-0000-4000-8000-000000000020','e3302026-0000-4000-8000-000000000021') and source_key='cnpj_businesses';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e3302026-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
do $$ declare s uuid;begin
 assert (select count(*)=15 from public.aurora_sources_summary),'Summary view bypassed tenant RLS';
 assert (select count(*)=2 from public.aurora_sources_summary where source_key in ('ibge_sectors','osm_places')),'Missing default geographic connections';
 assert (select snapshot ? 'spatial' from public.aurora_sources where source_key='ibge_sectors'),'Authorized full geometry unavailable';
 assert (select not(snapshot ? 'spatial') from public.aurora_sources_summary where source_key='ibge_sectors'),'Heavy geometry leaked into boot summary';
 assert (select snapshot ? 'business' from public.aurora_sources where source_key='cnpj_businesses'),'Authorized business snapshot missing';
 assert (select not(snapshot ? 'business') from public.aurora_sources_summary where source_key='cnpj_businesses'),'Business records leaked into boot';
 assert not has_function_privilege('authenticated','aurora_private.connect_business_default()','execute'),'Business trigger executable';
 assert not has_function_privilege('authenticated','aurora_private.connect_environment_defaults()','execute'),'Environment provisioner executable';
 assert (select count(*)=5 from public.aurora_sources where source_key in ('ide_sisema','ibama','icmbio','iphan','graprohab') and cadence<>'manual'),'Missing automatic environment sources';
 select id into s from public.aurora_sources where source_key='ibama';
 begin perform public.aurora_import_source(s,'{"rows":[],"source_url":"https://example.invalid"}');raise exception 'FAILED forged environment source';exception when raise_exception then if sqlerrm like 'FAILED%' then raise;end if;end;
 assert (public.aurora_claim_source(s)->'asset_geometry') is not null,'Environmental job without polygon';
 select id into s from public.aurora_sources where source_key='cnpj_businesses';
 begin perform public.aurora_import_source(s,'{"rows":[],"source_url":"https://example.invalid"}');raise exception 'FAILED forged business source';exception when raise_exception then if sqlerrm like 'FAILED%' then raise;end if;end;
 select id into s from public.aurora_sources where source_key='ibge_sectors';
 begin perform public.aurora_import_source(s,'{"rows":[],"source_url":"https://example.invalid"}');raise exception 'FAILED forged official geography';exception when raise_exception then if sqlerrm like 'FAILED%' then raise;end if;end;
 assert not has_function_privilege('authenticated','aurora_private.connect_geo_defaults()','execute'),'Private trigger executable';
end $$;
select set_config('request.jwt.claims','{"sub":"e3302026-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',true);
do $$ declare s uuid;begin
 assert (select count(*)=15 from public.aurora_sources_summary),'Read-only authorized geography unavailable';
 select id into s from public.aurora_sources where source_key='osm_places';
 begin perform public.aurora_claim_source(s);raise exception 'FAILED viewer triggered provider';exception when raise_exception then if sqlerrm like 'FAILED%' then raise;end if;end;
end $$;
reset role;
insert into public.aurora_module_grants(workspace_id,user_id,module,permission) values('e3302026-0000-4000-8000-000000000010','e3302026-0000-4000-8000-000000000003','intelligence','none');
set local role authenticated;
do $$ begin assert (select count(*)=0 from public.aurora_sources_summary),'Module denial ignored by summary';assert (select count(*)=0 from public.aurora_sources),'Module denial ignored by full geometry';end $$;
select set_config('request.jwt.claims','{"sub":"e3302026-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2"}',true);
do $$ begin assert (select count(*)=0 from public.aurora_sources_summary),'Client saw internal geography';end $$;
reset role;
select 'PASS: fifteen sources, tenant/module/client isolation, full geometry authorization, light summaries, read-only refresh denial, official provenance protection' as verification;
rollback;
