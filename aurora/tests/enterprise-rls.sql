begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,raw_app_meta_data) values
('e2202026-0000-4000-8000-000000000001','aurora-enterprise-owner@example.invalid',now(),'{}','{}'),
('e2202026-0000-4000-8000-000000000002','aurora-enterprise-analyst@example.invalid',now(),'{}','{}'),
('e2202026-0000-4000-8000-000000000003','aurora-enterprise-client@example.invalid',now(),'{}','{}');
insert into public.aurora_workspaces(id,name,created_by) values('e2202026-0000-4000-8000-000000000010','Enterprise test','e2202026-0000-4000-8000-000000000001'),('e2202026-0000-4000-8000-000000000011','Other tenant','e2202026-0000-4000-8000-000000000001');
insert into public.aurora_members(workspace_id,user_id,display_name,email,role) values
('e2202026-0000-4000-8000-000000000010','e2202026-0000-4000-8000-000000000001','Owner','owner@example.invalid','owner'),
('e2202026-0000-4000-8000-000000000010','e2202026-0000-4000-8000-000000000002','Analyst','analyst@example.invalid','analyst'),
('e2202026-0000-4000-8000-000000000010','e2202026-0000-4000-8000-000000000003','Client','client@example.invalid','client');
insert into public.aurora_assets(id,workspace_id,name,division,created_by) values('e2202026-0000-4000-8000-000000000020','e2202026-0000-4000-8000-000000000010','Own test asset','urban','e2202026-0000-4000-8000-000000000001'),('e2202026-0000-4000-8000-000000000021','e2202026-0000-4000-8000-000000000011','Other tenant asset','urban','e2202026-0000-4000-8000-000000000001');
insert into public.aurora_work_items(id,workspace_id,asset_id,module,kind,title,status,evidence,client_visible,created_by) values('e2202026-0000-4000-8000-000000000030','e2202026-0000-4000-8000-000000000010','e2202026-0000-4000-8000-000000000020','structuring','urban','Urban study','review','Test evidence',true,'e2202026-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub','e2202026-0000-4000-8000-000000000002',true);
do $$ begin
 assert (select count(*)=1 from public.aurora_work_items),'Analyst RLS';
 begin perform public.aurora_review_work('e2202026-0000-4000-8000-000000000030','approved','Unauthorized self review');raise exception 'FAILED analyst approval';exception when raise_exception then if sqlerrm like 'FAILED%' then raise;end if;end;
 begin insert into public.aurora_work_items(workspace_id,asset_id,module,kind,title,status,reviewed_by,evidence) values('e2202026-0000-4000-8000-000000000010','e2202026-0000-4000-8000-000000000020','structuring','urban','Fake approval','approved',auth.uid(),'test evidence');raise exception 'FAILED forged approval';exception when raise_exception then if sqlerrm like 'FAILED%' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub','e2202026-0000-4000-8000-000000000001',true);
select public.aurora_review_work('e2202026-0000-4000-8000-000000000030','approved','Evidence checked by reviewer');
select public.aurora_set_module_grant('e2202026-0000-4000-8000-000000000010','e2202026-0000-4000-8000-000000000002','structuring','none');
do $$ declare r uuid;begin
 r:=public.aurora_create_report('e2202026-0000-4000-8000-000000000010','Client report',array['e2202026-0000-4000-8000-000000000020'::uuid],false);
 perform set_config('aurora.test_report',r::text,true);
 assert (select not(snapshot ? 'members') and jsonb_array_length(snapshot->'financial')=0 from public.aurora_reports where id=r),'Report leaked private fields';
 perform public.aurora_share_report(r,'e2202026-0000-4000-8000-000000000003',now()+interval '1 day',false,false);
 begin perform public.aurora_create_report('e2202026-0000-4000-8000-000000000010','Cross tenant attack',array['e2202026-0000-4000-8000-000000000021'::uuid],true);raise exception 'FAILED cross tenant snapshot';exception when raise_exception then if sqlerrm like 'FAILED%' then raise;end if;end;
end $$;
insert into public.aurora_sources(workspace_id,asset_id,source_key,title,config) values('e2202026-0000-4000-8000-000000000010','e2202026-0000-4000-8000-000000000020','ibge_census','Census QA','{"municipality":"3143104"}');
do $$ begin assert (select count(*)=1 from public.aurora_sources),'Owner cannot read sources';begin update public.aurora_sources set snapshot='{}';raise exception 'FAILED forged source';exception when insufficient_privilege then null;end;end $$;
select set_config('request.jwt.claim.sub','e2202026-0000-4000-8000-000000000002',true);
do $$ begin assert (select count(*)=0 from public.aurora_work_items),'Module deny ignored';end $$;
select set_config('request.jwt.claim.sub','e2202026-0000-4000-8000-000000000003',true);
do $$ begin assert (select count(*)=0 from public.aurora_assets),'Client sees raw assets';assert (select count(*)=0 from public.aurora_sources),'Client sees internal source';assert (select count(*)=0 from public.aurora_reports),'Client sees draft';assert (select count(*)=0 from public.aurora_work_items),'Client sees internal workflow';end $$;
select set_config('request.jwt.claim.sub','e2202026-0000-4000-8000-000000000001',true);
select public.aurora_publish_report(current_setting('aurora.test_report')::uuid,true);
select set_config('request.jwt.claim.sub','e2202026-0000-4000-8000-000000000003',true);
do $$ begin assert (select count(*)=1 from public.aurora_reports),'Client cannot see published authorized report';end $$;
select set_config('request.jwt.claim.sub','e2202026-0000-4000-8000-000000000001',true);
select public.aurora_share_report(current_setting('aurora.test_report')::uuid,'e2202026-0000-4000-8000-000000000003',null,false,true);
select set_config('request.jwt.claim.sub','e2202026-0000-4000-8000-000000000003',true);
do $$ begin assert (select count(*)=0 from public.aurora_reports),'Revoked report remains accessible';end $$;
reset role;
insert into auth.mfa_factors(id,user_id,friendly_name,factor_type,status,secret,created_at,updated_at) values('e2202026-0000-4000-8000-000000000099','e2202026-0000-4000-8000-000000000001','Test TOTP','totp','verified','test-only',now(),now());
set local role authenticated;
select set_config('request.jwt.claim.sub','e2202026-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal1"}',true);
do $$ begin assert (select count(*)=0 from public.aurora_assets),'MFA requirement bypassed';end $$;
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
do $$ begin assert (select count(*)=1 from public.aurora_assets),'MFA verified session denied';end $$;
reset role;set local role anon;
do $$ begin assert jsonb_array_length(public.aurora_demo()->'data'->'members')=0,'Public demo exposes identities';begin perform count(*) from public.aurora_work_items;raise exception 'FAILED anonymous internal data';exception when insufficient_privilege then null;end;end $$;
reset role;
select 'PASS: module permissions, reviews, report snapshots, draft protection, recipient access, revocation, tenant boundary, curated demo' as result;
rollback;
