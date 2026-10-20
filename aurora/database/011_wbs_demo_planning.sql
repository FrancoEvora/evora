-- Demonstration-only planning adjustment after published review. Preserve all previous baselines.
begin;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select m.user_id from public.aurora_members m join public.aurora_workspaces w on w.id=m.workspace_id where w.is_demo and w.id='a0202026-0000-4000-8000-000000000001' and m.active and m.role='owner' limit 1),'role','authenticated','aal','aal2')::text,true);
set local role authenticated;
do $$declare r record;p record;s date;b uuid;begin
 for r in select distinct x.asset_id,x.module from public.aurora_work_items x join public.aurora_workspaces w on w.id=x.workspace_id and w.is_demo
 where w.id='a0202026-0000-4000-8000-000000000001' and x.wbs_code is not null and x.status not in ('done','approved') and x.details->>'Demonstração' like 'Escopo, custos, datas,%' loop
  if exists(select 1 from public.aurora_wbs_baselines where asset_id=r.asset_id and module=r.module and title='EAP demonstrativa · planejamento revisado') then continue;end if;
  for p in select * from public.aurora_work_items where asset_id=r.asset_id and module=r.module and wbs_code is not null and status not in ('done','approved') and details->>'Demonstração' like 'Escopo, custos, datas,%' order by wbs_code loop
   s:=greatest(case when p.status in ('doing','review','blocked') then '2026-10-13'::date else '2026-10-20'::date+split_part(p.wbs_code,'.',2)::int*3 end,(select max(due_on)+1 from public.aurora_work_items where id=any(p.predecessor_ids)));
   update public.aurora_work_items set start_on=s,due_on=s+duration_days-1 where id=p.id;
  end loop;
  b:=public.aurora_baseline_wbs(r.asset_id,r.module,'EAP demonstrativa · planejamento revisado','DEMONSTRAÇÃO · ajuste das datas futuras dos pacotes em aberto, após revisão da navegação. Escopo, custos e versões anteriores preservados; cronograma sem compromisso real.');
  if r.module='development' then
   update public.aurora_work_items set details=details||jsonb_build_object('Premissas','DEMONSTRAÇÃO · alteração posterior à linha de base: contratação em lotes por frente, com revisão das interfaces e do plano de suprimentos ainda pendente de aprovação.') where asset_id=r.asset_id and module=r.module and wbs_code='3.08.01';
  end if;
 end loop;
end $$;
reset role;
select count(*) as preserved_baselines from public.aurora_wbs_baselines where workspace_id='a0202026-0000-4000-8000-000000000001';
commit;
