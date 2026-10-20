-- Executes entirely inside a rolled-back transaction. No real account or customer data is touched.
begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,raw_app_meta_data)
values
 ('f982a02b-563a-4352-913c-cbc865b2b001','aurora-owner-a@example.invalid',now(),'{}','{}'),
 ('f982a02b-563a-4352-913c-cbc865b2b002','aurora-owner-b@example.invalid',now(),'{}','{}'),
 ('f982a02b-563a-4352-913c-cbc865b2b003','aurora-analyst@example.invalid',now(),'{}','{}'),
 ('f982a02b-563a-4352-913c-cbc865b2b004','aurora-viewer@example.invalid',now(),'{}','{}'),
 ('f982a02b-563a-4352-913c-cbc865b2b005','aurora-client@example.invalid',now(),'{}','{}');
insert into public.aurora_workspaces(id,name,created_by) values
 ('f982a02b-563a-4352-913c-cbc865b2ba01','Isolated test A','f982a02b-563a-4352-913c-cbc865b2b001'),
 ('f982a02b-563a-4352-913c-cbc865b2ba02','Isolated test B','f982a02b-563a-4352-913c-cbc865b2b002');
insert into public.aurora_members(workspace_id,user_id,display_name,email,role) values
 ('f982a02b-563a-4352-913c-cbc865b2ba01','f982a02b-563a-4352-913c-cbc865b2b001','QA Owner A','aurora-owner-a@example.invalid','owner'),
 ('f982a02b-563a-4352-913c-cbc865b2ba02','f982a02b-563a-4352-913c-cbc865b2b002','QA Owner B','aurora-owner-b@example.invalid','owner'),
 ('f982a02b-563a-4352-913c-cbc865b2ba01','f982a02b-563a-4352-913c-cbc865b2b003','QA Analyst','aurora-analyst@example.invalid','analyst'),
 ('f982a02b-563a-4352-913c-cbc865b2ba01','f982a02b-563a-4352-913c-cbc865b2b004','QA Viewer','aurora-viewer@example.invalid','viewer'),
 ('f982a02b-563a-4352-913c-cbc865b2ba01','f982a02b-563a-4352-913c-cbc865b2b005','QA Client','aurora-client@example.invalid','client');
insert into public.aurora_assets(id,workspace_id,name,division,created_by) values
 ('f982a02b-563a-4352-913c-cbc865b2bc01','f982a02b-563a-4352-913c-cbc865b2ba01','Test asset A','urban','f982a02b-563a-4352-913c-cbc865b2b001'),
 ('f982a02b-563a-4352-913c-cbc865b2bc02','f982a02b-563a-4352-913c-cbc865b2ba02','Test asset B','rural','f982a02b-563a-4352-913c-cbc865b2b002');
insert into storage.objects(bucket_id,name,owner_id) values
 ('aurora-vault','f982a02b-563a-4352-913c-cbc865b2ba01/f982a02b-563a-4352-913c-cbc865b2bc01/test.txt','f982a02b-563a-4352-913c-cbc865b2b001'),
 ('aurora-vault','f982a02b-563a-4352-913c-cbc865b2ba02/f982a02b-563a-4352-913c-cbc865b2bc02/test.txt','f982a02b-563a-4352-913c-cbc865b2b002');
set local role authenticated;
select set_config('request.jwt.claim.sub','f982a02b-563a-4352-913c-cbc865b2b001',true);
do $$ begin
 assert (select count(*)=1 from public.aurora_assets),'Owner sees another tenant';
 assert (select count(*)=1 from public.aurora_workspaces),'Workspace leakage';
 assert (select count(*)=1 from storage.objects where bucket_id='aurora-vault'),'Private file leakage';
 begin update public.aurora_assets set workspace_id='f982a02b-563a-4352-913c-cbc865b2ba02' where id='f982a02b-563a-4352-913c-cbc865b2bc01';raise exception 'FAILED transfer protection';exception when insufficient_privilege then null;end;
 begin perform public.aurora_set_member('f982a02b-563a-4352-913c-cbc865b2ba01',auth.uid(),'admin',false);raise exception 'FAILED self-demotion guard';exception when raise_exception then if sqlerrm like 'FAILED%' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub','f982a02b-563a-4352-913c-cbc865b2b003',true);
do $$ begin
 update public.aurora_assets set notes='QA update' where id='f982a02b-563a-4352-913c-cbc865b2bc01';
 assert (select notes='QA update' from public.aurora_assets where id='f982a02b-563a-4352-913c-cbc865b2bc01'),'Analyst cannot edit';
 begin insert into public.aurora_assets(workspace_id,name,division) values('f982a02b-563a-4352-913c-cbc865b2ba02','Cross tenant attack','urban');raise exception 'FAILED cross-tenant insert';exception when insufficient_privilege then null;end;
 begin update public.aurora_members set role='owner' where user_id=auth.uid();raise exception 'FAILED privilege escalation';exception when insufficient_privilege then null;end;
 begin insert into public.aurora_runs(workspace_id,asset_id,prompt,result,model) values('f982a02b-563a-4352-913c-cbc865b2ba01','f982a02b-563a-4352-913c-cbc865b2bc01','test','fake','fake');raise exception 'FAILED fabricated AI run';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','f982a02b-563a-4352-913c-cbc865b2b004',true);
do $$ declare n int; begin
 assert (select count(*)=1 from public.aurora_assets),'Viewer cannot read';
 update public.aurora_assets set notes='unauthorized' where id='f982a02b-563a-4352-913c-cbc865b2bc01';get diagnostics n=row_count;assert n=0,'Viewer edited asset';
 begin insert into public.aurora_actions(workspace_id,asset_id,title) values('f982a02b-563a-4352-913c-cbc865b2ba01','f982a02b-563a-4352-913c-cbc865b2bc01','Unauthorized');raise exception 'FAILED viewer action';exception when insufficient_privilege then null;end;
 begin perform public.aurora_reserve_ai('f982a02b-563a-4352-913c-cbc865b2ba01');raise exception 'FAILED viewer AI';exception when raise_exception then if sqlerrm like 'FAILED%' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub','f982a02b-563a-4352-913c-cbc865b2b005',true);
do $$ begin
 assert (select count(*)=0 from public.aurora_assets),'Client sees unshared asset';
 assert (select count(*)=0 from storage.objects where bucket_id='aurora-vault'),'Client sees unshared file';
end $$;
reset role;
insert into public.aurora_asset_access(workspace_id,asset_id,user_id) values('f982a02b-563a-4352-913c-cbc865b2ba01','f982a02b-563a-4352-913c-cbc865b2bc01','f982a02b-563a-4352-913c-cbc865b2b005');
set local role authenticated;
do $$ begin
 assert (select count(*)=0 from public.aurora_assets),'Legacy share exposed raw asset';
 assert (select count(*)=0 from storage.objects where bucket_id='aurora-vault'),'Legacy share exposed raw file';
end $$;
reset role;
update public.aurora_members set active=false where user_id='f982a02b-563a-4352-913c-cbc865b2b005';
set local role authenticated;
do $$ begin assert (select count(*)=0 from public.aurora_assets),'Revoked membership still has access';end $$;
reset role;
set local role anon;
do $$ begin
 begin perform count(*) from public.aurora_assets;raise exception 'FAILED anonymous access';exception when insufficient_privilege then null;end;
 begin perform public.aurora_monitor_and_claim('wrong');raise exception 'FAILED worker secret';exception when raise_exception then if sqlerrm like 'FAILED%' then raise;end if;end;
end $$;
reset role;
select 'PASS: tenant isolation, storage isolation, roles, write guards, client grants, revocation, AI provenance, worker secret' as result;
rollback;
