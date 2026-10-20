-- Scheduled AI uses current authorized public-source snapshots.
create or replace function aurora_private.monitor_and_claim(token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare s record; jobs jsonb:='[]'::jsonb; lease uuid; begin
 perform aurora_private.verify_worker(token);
 insert into public.aurora_alerts(workspace_id,asset_id,title,severity,source_key)
 select workspace_id,asset_id,case when due_on<current_date then 'Ação vencida: ' else 'Prazo próximo: ' end||title,
 case when due_on<current_date then 'critical' else 'warning' end,'action:'||id::text||':'||due_on::text||':'||(due_on<current_date)::text
 from public.aurora_actions where status<>'done' and due_on<=current_date+7 on conflict(source_key) do nothing;
 insert into public.aurora_alerts(workspace_id,asset_id,title,severity,source_key)
 select workspace_id,asset_id,case when expires_on<current_date then 'Documento vencido: ' else 'Documento a vencer: ' end||title,
 case when expires_on<current_date then 'critical' else 'warning' end,'document:'||id::text||':'||expires_on::text||':'||(expires_on<current_date)::text
 from public.aurora_documents where expires_on<=current_date+30 on conflict(source_key) do nothing;
 insert into public.aurora_alerts(workspace_id,asset_id,title,severity,source_key)
 select workspace_id,asset_id,case when due_on<current_date then 'Etapa vencida: ' else 'Etapa próxima: ' end||title,case when due_on<current_date then 'critical' else 'warning' end,'work:'||id::text||':'||due_on::text||':'||(due_on<current_date)::text from public.aurora_work_items where status not in ('done','approved') and due_on<=current_date+7 on conflict(source_key) do nothing;
 insert into public.aurora_alerts(workspace_id,asset_id,title,severity,source_key)
 select workspace_id,asset_id,case when coalesce(renewal_due_on,expires_on)<current_date then 'Revisar licença: ' else 'Renovação próxima: ' end||title,case when coalesce(renewal_due_on,expires_on)<current_date then 'critical' else 'warning' end,'license:'||id::text||':'||coalesce(renewal_due_on,expires_on)::text||':'||(coalesce(renewal_due_on,expires_on)<current_date)::text from public.aurora_licenses where status<>'closed' and coalesce(renewal_due_on,expires_on)<=current_date+30 on conflict(source_key) do nothing;
 for s in select x.* from public.aurora_schedules x join public.aurora_members m on m.workspace_id=x.workspace_id and m.user_id=x.created_by
 where x.enabled and x.next_run_at<=now() and (x.locked_until is null or x.locked_until<now()) and m.active and m.role in ('owner','admin','manager')
 order by x.next_run_at limit 3 for update of x skip locked loop
 lease:=gen_random_uuid(); update public.aurora_schedules set locked_until=now()+interval '10 minutes',lease_token=lease where id=s.id;
 jobs:=jobs||jsonb_build_array(jsonb_build_object('id',s.id,'lease',lease,'workspace_id',s.workspace_id,'asset_id',s.asset_id,'created_by',s.created_by,'prompt',s.prompt,
 'workItems',(select coalesce(jsonb_agg(to_jsonb(z)),'[]'::jsonb) from (select title,module,kind,status,due_on,evidence,details,progress from public.aurora_work_items x where x.asset_id=s.asset_id and not exists(select 1 from public.aurora_module_grants g where g.workspace_id=s.workspace_id and g.user_id=s.created_by and g.module=x.module and g.permission='none') order by due_on nulls last limit 100) z),
 'licenses',(select coalesce(jsonb_agg(to_jsonb(z)),'[]'::jsonb) from (select title,license_type,authority,expires_on,renewal_due_on,status,legal_basis from public.aurora_licenses where asset_id=s.asset_id and not exists(select 1 from public.aurora_module_grants g where g.workspace_id=s.workspace_id and g.user_id=s.created_by and g.module in ('development','management') and g.permission='none' group by g.user_id having count(*)=2) limit 30) z),
 'publicSources',(select coalesce(jsonb_agg(to_jsonb(z)),'[]'::jsonb) from (select title,source_key,snapshot,last_status,last_success_at from public.aurora_sources where asset_id=s.asset_id and aurora_private.source_authorized(s.workspace_id,s.created_by) order by last_success_at desc nulls last limit 12) z),
 'is_demo',(select is_demo from public.aurora_workspaces where id=s.workspace_id),
 'asset',(select to_jsonb(a) from public.aurora_assets a where a.id=s.asset_id),
 'actions',(select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) from (select title,description,status,due_on,priority from public.aurora_actions where asset_id=s.asset_id order by due_on nulls last limit 60) a),
 'documents',(select coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) from (select id,title,category,expires_on,left(extracted_text,10000) as text from public.aurora_documents where asset_id=s.asset_id order by created_at desc limit 8) d),
 'notes',(select coalesce(jsonb_agg(to_jsonb(n)),'[]'::jsonb) from (select body,created_at from public.aurora_notes where asset_id=s.asset_id order by created_at desc limit 10) n)));
 end loop; return jobs; end $$;
