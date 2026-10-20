-- Transactional permission and workflow regression tests; all fixtures rolled back.
begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,raw_app_meta_data) values
('e3302026-0000-4000-8000-000000000001','aurora-enterprise-owner@example.invalid',now(),'{}','{}'),
('e3302026-0000-4000-8000-000000000002','aurora-enterprise-analyst@example.invalid',now(),'{}','{}'),
('e3302026-0000-4000-8000-000000000003','aurora-enterprise-client@example.invalid',now(),'{}','{}');
insert into public.aurora_workspaces(id,name,created_by) values('e3302026-0000-4000-8000-000000000010','Enterprise test','e3302026-0000-4000-8000-000000000001'),('e3302026-0000-4000-8000-000000000011','Other tenant','e3302026-0000-4000-8000-000000000001');
insert into public.aurora_members(workspace_id,user_id,display_name,email,role) values
('e3302026-0000-4000-8000-000000000010','e3302026-0000-4000-8000-000000000001','Owner','owner@example.invalid','owner'),
('e3302026-0000-4000-8000-000000000010','e3302026-0000-4000-8000-000000000002','Analyst','analyst@example.invalid','analyst'),
('e3302026-0000-4000-8000-000000000010','e3302026-0000-4000-8000-000000000003','Client','client@example.invalid','client');
insert into public.aurora_assets(id,workspace_id,name,division,created_by,city,state,municipality_code,geometry) values('e3302026-0000-4000-8000-000000000020','e3302026-0000-4000-8000-000000000010','Own test asset','urban','e3302026-0000-4000-8000-000000000001','Monte Carmelo','MG','3143104','{"type":"Polygon","coordinates":[[[-47.49,-18.73],[-47.48,-18.73],[-47.48,-18.72],[-47.49,-18.73]]]}'),('e3302026-0000-4000-8000-000000000021','e3302026-0000-4000-8000-000000000011','Other tenant asset','urban','e3302026-0000-4000-8000-000000000001','Monte Carmelo','MG','3143104','{"type":"Polygon","coordinates":[[[-47.49,-18.73],[-47.48,-18.73],[-47.48,-18.72],[-47.49,-18.73]]]}');
insert into public.aurora_work_items(id,workspace_id,asset_id,module,kind,title,status,evidence,client_visible,created_by) values('e3302026-0000-4000-8000-000000000030','e3302026-0000-4000-8000-000000000010','e3302026-0000-4000-8000-000000000020','structuring','urban','Urban study','review','Test evidence',true,'e3302026-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub','e3302026-0000-4000-8000-000000000001',true);
do $$declare a uuid:='e3302026-0000-4000-8000-000000000020';r jsonb;p uuid;q uuid;z uuid;b uuid;failed boolean;begin
 r:=public.aurora_apply_wbs(a,'structuring');assert (r->>'created')::int=47,'Model count';
 r:=public.aurora_apply_wbs(a,'development');assert (r->>'created')::int=62,'Development count';
 select id into p from public.aurora_work_items where asset_id=a and wbs_code='2.01.01';
 select id into q from public.aurora_work_items where asset_id=a and wbs_code='2.01.02';
 select id into z from public.aurora_work_items where asset_id=a and wbs_code='2.01.03';
 update public.aurora_work_items set title='Custom mandate retained' where id=p;
 r:=public.aurora_apply_wbs(a,'structuring');assert (r->>'created')::int=0,'Idempotence';assert (select title='Custom mandate retained' from public.aurora_work_items where id=p),'Repeated application overwrote custom scope';
 failed:=false;begin update public.aurora_work_items set predecessor_ids=array[q] where id=p;exception when raise_exception then failed:=sqlerrm like '%circular%';end;assert failed,'Cycle accepted';
 failed:=false;begin perform public.aurora_apply_wbs('e3302026-0000-4000-8000-000000000021','structuring');exception when raise_exception then failed:=true;end;assert failed,'Cross-tenant application';
 failed:=false;begin update public.aurora_work_items set status='review',evidence='Attempt without deliveries' where id=p;exception when raise_exception then failed:=true;end;assert failed,'Unfinished review accepted';
 update public.aurora_work_items set progress=100,deliverables=jsonb_set(jsonb_set(deliverables,'{0,checked}','true'),'{0,evidence}','"Evidence version 1"') where id=p;
 assert (select progress=50 from public.aurora_work_items where id=p),'Progress was forged';
 failed:=false;begin update public.aurora_work_items set deliverables=jsonb_set(deliverables,'{1,checked}','true') where id=p;exception when raise_exception then failed:=sqlerrm like '%individual%';end;assert failed,'Delivery without evidence';
 update public.aurora_work_items set deliverables=(select jsonb_agg(d||'{"checked":true,"evidence":"Test evidence v1"}'::jsonb) from jsonb_array_elements(deliverables) d),evidence='Package acceptance v1',status='review' where id=p;
 perform public.aurora_review_work(p,'approved','Owner review with traceable evidence');
 assert (select status='approved' and reviewed_by=auth.uid() and progress=100 from public.aurora_work_items where id=p),'Formal review missing';
 b:=public.aurora_baseline_wbs(a,'structuring','Approved scope v1','Test baseline rationale and impacts');
 assert (select jsonb_array_length(snapshot->'packages')=47 and not(snapshot->>'costs_complete')::boolean from public.aurora_wbs_baselines where id=b),'Baseline scope or missing costs';
 update public.aurora_work_items set description='Revised scope requiring renewed acceptance' where id=p;
 assert (select status='review' and reviewed_by is null from public.aurora_work_items where id=p),'Scope edit retained approval';
 assert (select snapshot->'packages'->0->>'description'<>'Revised scope requiring renewed acceptance' from public.aurora_wbs_baselines where id=b),'Baseline mutated';
 perform public.aurora_review_work(p,'blocked','Required corrections recorded');
 failed:=false;begin update public.aurora_work_items set status='approved' where id=p;exception when raise_exception then failed:=true;end;assert failed,'Reused rejected review as approval';
 failed:=false;begin update public.aurora_work_items set deliverables=(select jsonb_agg(d||'{"checked":true,"evidence":"Test evidence v1"}'::jsonb) from jsonb_array_elements(deliverables) d),evidence='Package acceptance v1',status='done' where id=q;exception when raise_exception then failed:=sqlerrm like '%dependências%';end;assert failed,'Incomplete predecessor ignored';
 update public.aurora_work_items set scope_status='excluded',scope_note='Explicitly non-applicable in the test scope' where id=p;
 update public.aurora_work_items set deliverables=(select jsonb_agg(d||'{"checked":true,"evidence":"Test evidence v1"}'::jsonb) from jsonb_array_elements(deliverables) d),evidence='Package acceptance v1',status='done' where id=q;
 failed:=false;begin update public.aurora_work_items set scope_status='included' where id=p;exception when raise_exception then failed:=sqlerrm like '%sucessores%';end;assert failed,'Reopened predecessor left completed successor';
 failed:=false;begin update public.aurora_wbs_baselines set title='Tampering' where id=b;exception when insufficient_privilege then failed:=true;end;assert failed,'Baseline directly editable';
 failed:=false;begin update public.aurora_work_items set wbs_code='2.99.99' where id=p;exception when insufficient_privilege then failed:=true;end;assert failed,'Code modified';
end $$;
select set_config('request.jwt.claim.sub','e3302026-0000-4000-8000-000000000002',true);
do $$declare failed boolean;p uuid;begin
 select id into p from public.aurora_work_items where wbs_code='2.01.04';
 assert (select count(*)=1 from public.aurora_wbs_baselines),'Analyst cannot read baseline';
 failed:=false;begin perform public.aurora_baseline_wbs('e3302026-0000-4000-8000-000000000020','structuring','Unauthorized baseline','Insufficient review permission');exception when raise_exception then failed:=true;end;assert failed,'Analyst approved baseline';
 failed:=false;begin update public.aurora_work_items set scope_status='excluded',scope_note='Analyst attempted exclusion' where id=p;exception when raise_exception then failed:=true;end;assert failed,'Analyst excluded package';
end $$;
select set_config('request.jwt.claim.sub','e3302026-0000-4000-8000-000000000001',true);
select public.aurora_set_module_grant('e3302026-0000-4000-8000-000000000010','e3302026-0000-4000-8000-000000000002','structuring','none');
select set_config('request.jwt.claim.sub','e3302026-0000-4000-8000-000000000002',true);
do $$begin assert (select count(*)=0 from public.aurora_wbs_baselines),'Module revocation ignored';assert (select count(*)=0 from public.aurora_work_items where module='structuring'),'Work RLS revoked';end $$;
select set_config('request.jwt.claim.sub','e3302026-0000-4000-8000-000000000003',true);
do $$declare failed boolean;begin
 assert (select count(*)=0 from public.aurora_work_items),'Client raw work leak';assert (select count(*)=0 from public.aurora_wbs_baselines),'Client baseline leak';
 failed:=false;begin perform public.aurora_apply_wbs('e3302026-0000-4000-8000-000000000020','development');exception when raise_exception then failed:=true;end;assert failed,'Client template write';
end $$;
reset role;set local role anon;
do $$declare failed boolean;begin
 failed:=false;begin perform count(*) from public.aurora_wbs_baselines;exception when insufficient_privilege then failed:=true;end;assert failed,'Anonymous baseline leak';
 failed:=false;begin perform public.aurora_apply_wbs('e3302026-0000-4000-8000-000000000020','development');exception when insufficient_privilege then failed:=true;end;assert failed,'Anonymous template write';
end $$;
reset role;
select 'PASS: 109 packages, idempotence, tenant/module/client isolation, cycles, delivery evidence, calculated progress, dependency gates, review integrity, exclusions and immutable baselines' as result;
rollback;
