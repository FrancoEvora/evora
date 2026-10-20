-- Cycle 2: report-only clients, optional MFA enforcement, workflow integrity.
create or replace function aurora_private.session_ok() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (coalesce(auth.jwt()->>'aal','aal1')='aal2' or not exists(select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified'))
$$;
revoke all on function aurora_private.session_ok() from public,anon;
grant execute on function aurora_private.session_ok() to authenticated;
create or replace function aurora_private.role_for(w uuid) returns text language sql stable security definer set search_path='' as $$
 select role from public.aurora_members where workspace_id=w and user_id=auth.uid() and active and aurora_private.session_ok()
$$;
create or replace function aurora_private.can_asset(a uuid,writing boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select aurora_private.session_ok() and exists(select 1 from public.aurora_assets x where x.id=a and
 case when writing then aurora_private.role_for(x.workspace_id) in ('owner','admin','manager','analyst') else aurora_private.role_for(x.workspace_id) in ('owner','admin','manager','analyst','viewer') end)
$$;
-- Legacy asset shares no longer grant clients raw operational data.
revoke insert,update,delete on public.aurora_asset_access from authenticated;
alter policy member_read on public.aurora_members using(aurora_private.session_ok() and (user_id=auth.uid() or aurora_private.role_for(workspace_id) in ('owner','admin','manager')));
alter policy report_access_read on public.aurora_report_access using(aurora_private.session_ok() and (user_id=auth.uid() or aurora_private.role_for(workspace_id) in ('owner','admin','manager')));
alter policy module_grants_read on public.aurora_module_grants using(aurora_private.session_ok() and (user_id=auth.uid() or aurora_private.role_for(workspace_id) in ('owner','admin','manager')));
-- Licenses span development and ongoing asset operations.
alter policy module_read on public.aurora_licenses using(aurora_private.module_access(workspace_id,'development') or aurora_private.module_access(workspace_id,'management'));
alter policy module_insert on public.aurora_licenses with check((aurora_private.module_access(workspace_id,'development','write') or aurora_private.module_access(workspace_id,'management','write')) and created_by=auth.uid());
alter policy module_update on public.aurora_licenses using(aurora_private.module_access(workspace_id,'development','write') or aurora_private.module_access(workspace_id,'management','write')) with check(aurora_private.module_access(workspace_id,'development','write') or aurora_private.module_access(workspace_id,'management','write'));
create or replace function aurora_private.guard_work_item() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is not null then
  if tg_op='INSERT' and (new.reviewed_by is not null or new.reviewed_at is not null or new.status='approved') then raise exception 'Use o fluxo de aprovação'; end if;
  if tg_op='UPDATE' and (old.title,old.description,old.details,old.evidence,old.due_on,old.owner_label,old.dependency_id,old.license_id,old.start_on) is distinct from (new.title,new.description,new.details,new.evidence,new.due_on,new.owner_label,new.dependency_id,new.license_id,new.start_on) then
    new.reviewed_by:=null;new.reviewed_at:=null;new.review_note:=null;if new.status='approved' then new.status:='review';end if;
  end if;
  if new.status='approved' and new.reviewed_by is null then raise exception 'Aprovação requer revisão registrada';end if;
 end if;
 if new.status in ('approved','done') and length(trim(new.evidence))<5 then raise exception 'Registre a evidência antes de concluir';end if;
 if new.dependency_id=new.id then raise exception 'Uma etapa não pode depender dela mesma';end if;
 if new.status in ('approved','done') and exists(select 1 from public.aurora_work_items d where d.id=new.dependency_id and d.status not in ('approved','done')) then raise exception 'Conclua a dependência primeiro';end if;
 if new.dependency_id is not null then
  if not exists(select 1 from public.aurora_work_items where id=new.dependency_id and asset_id=new.asset_id) then raise exception 'A dependência deve pertencer ao mesmo ativo';end if;
  if exists(with recursive chain as (select id,dependency_id from public.aurora_work_items where id=new.dependency_id union select x.id,x.dependency_id from public.aurora_work_items x join chain c on x.id=c.dependency_id) select 1 from chain where id=new.id) then raise exception 'Dependência circular não permitida';end if;
 end if;
 if new.license_id is not null and not exists(select 1 from public.aurora_licenses where id=new.license_id and asset_id=new.asset_id) then raise exception 'A licença deve pertencer ao mesmo ativo';end if;
 new.updated_at:=now();return new;
end $$;
create or replace function aurora_private.create_report(w uuid,t text,asset_ids uuid[],include_financial boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare r uuid;s jsonb;begin
 if coalesce(aurora_private.role_for(w),'') not in ('owner','admin','manager') then raise exception 'Sem permissão';end if;
 if include_financial and not aurora_private.module_access(w,'structuring') then raise exception 'Sem acesso ao orçamento';end if;
 if coalesce(array_length(asset_ids,1),0)=0 or array_length(asset_ids,1)>100 then raise exception 'Selecione entre 1 e 100 ativos';end if;
 if exists(select 1 from unnest(asset_ids) a where not exists(select 1 from public.aurora_assets x where x.id=a and x.workspace_id=w)) then raise exception 'Ativo fora da organização';end if;
 select jsonb_build_object('generated_at',now(),'is_demo',(select is_demo from public.aurora_workspaces where id=w),'include_financial',include_financial,
 'assets',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'stage',stage,'city',city,'state',state,'area_ha',area_ha,'estimated_value',case when include_financial then estimated_value else null end)) from public.aurora_assets where workspace_id=w and id=any(asset_ids)),'[]'::jsonb),
 'milestones',coalesce((select jsonb_agg(jsonb_build_object('asset_id',asset_id,'title',title,'module',module,'status',status,'progress',progress,'due_on',due_on)) from public.aurora_work_items where workspace_id=w and asset_id=any(asset_ids) and client_visible and aurora_private.module_access(w,module)),'[]'::jsonb),
 'financial',case when include_financial then coalesce((select jsonb_agg(jsonb_build_object('asset_id',asset_id,'direction',direction,'period',period,'planned',planned,'actual',actual)) from public.aurora_financial_lines where workspace_id=w and asset_id=any(asset_ids)),'[]'::jsonb) else '[]'::jsonb end) into s;
 insert into public.aurora_reports(workspace_id,title,snapshot) values(w,t,s) returning id into r;return r;
end $$;
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
 'is_demo',(select is_demo from public.aurora_workspaces where id=s.workspace_id),
 'asset',(select to_jsonb(a) from public.aurora_assets a where a.id=s.asset_id),
 'actions',(select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) from (select title,description,status,due_on,priority from public.aurora_actions where asset_id=s.asset_id order by due_on nulls last limit 60) a),
 'documents',(select coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) from (select id,title,category,expires_on,left(extracted_text,10000) as text from public.aurora_documents where asset_id=s.asset_id order by created_at desc limit 8) d),
 'notes',(select coalesce(jsonb_agg(to_jsonb(n)),'[]'::jsonb) from (select body,created_at from public.aurora_notes where asset_id=s.asset_id order by created_at desc limit 10) n)));
 end loop; return jobs; end $$;
drop policy read_asset on public.aurora_alerts;
create policy read_asset on public.aurora_alerts for select to authenticated using(aurora_private.can_asset(asset_id) and (case when source_key like 'work:%' then exists(select 1 from public.aurora_work_items w where w.id::text=split_part(source_key,':',2)) when source_key like 'license:%' then exists(select 1 from public.aurora_licenses l where l.id::text=split_part(source_key,':',2)) else true end));
