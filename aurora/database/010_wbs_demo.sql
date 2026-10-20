-- Explicitly authorized synthetic examples. Only the curated demo portfolio is eligible.
-- Re-running does not overwrite packages, evidence or baselines edited by users.
begin;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select m.user_id from public.aurora_members m join public.aurora_workspaces w on w.id=m.workspace_id where w.is_demo and w.id='a0202026-0000-4000-8000-000000000001' and m.active and m.role='owner' limit 1),'role','authenticated','aal','aal2')::text,true);
set local role authenticated;
do $$
declare r record;p record;before_ids uuid[];new_ids uuid[];start_date date;completed_group int;group_no int;package_no int;closed boolean;b uuid;begin
 for r in select distinct a.id,a.name,x.module from public.aurora_assets a join public.aurora_work_items x on x.asset_id=a.id join public.aurora_workspaces w on w.id=a.workspace_id and w.is_demo
  where w.id='a0202026-0000-4000-8000-000000000001' and x.wbs_code is null and x.module in ('structuring','development') order by a.name,x.module loop
  select coalesce(array_agg(id),'{}') into before_ids from public.aurora_work_items where asset_id=r.id and module=r.module;
  perform public.aurora_apply_wbs(r.id,r.module);
  select coalesce(array_agg(id),'{}') into new_ids from public.aurora_work_items where asset_id=r.id and module=r.module and wbs_code is not null and not(id=any(before_ids));
  if cardinality(new_ids)=0 then continue;end if;
  completed_group:=case when r.module='development' then 3 when r.name='Jardins do Vale' then 11 when r.name='Vértice Logística' then 3 when r.name='Fazenda Boa Aurora' then 2 else 1 end;
  for p in select * from public.aurora_work_items where id=any(new_ids) order by wbs_code loop
   group_no:=split_part(p.wbs_code,'.',2)::int;package_no:=split_part(p.wbs_code,'.',3)::int;
   start_date:=greatest('2026-07-06'::date+group_no*3,(select max(due_on)+1 from public.aurora_work_items where id=any(p.predecessor_ids)));
   update public.aurora_work_items set start_on=start_date,due_on=start_date+duration_days-1,planned_cost=case when r.module='development' and group_no=10 then 420000+package_no*125000 else 8000+group_no*2500+package_no*1200 end,
    details=details||jsonb_build_object('Demonstração','Escopo, custos, datas, andamento e evidências são exemplos sintéticos para navegação. Não representam diligência, obra, licença ou aceite real.') where id=p.id;
   closed:=group_no<=completed_group;
   if closed then
    update public.aurora_work_items set deliverables=(select jsonb_agg(d||jsonb_build_object('checked',true,'evidence','DEMONSTRAÇÃO · entrega ilustrativa '||p.wbs_code||' / '||(d->>'id')||', revisão 01. Sem documento ou protocolo real.')) from jsonb_array_elements(deliverables) d),evidence='DEMONSTRAÇÃO · pacote ilustrativo conferido para navegação. Nenhum aceite técnico, jurídico ou regulatório real.',status='review' where id=p.id;
    perform public.aurora_review_work(p.id,'approved','DEMONSTRAÇÃO · aceite sintético do pacote, usado exclusivamente para ilustrar a trilha de revisão.');
   elsif group_no=completed_group+1 and package_no=1 then
    update public.aurora_work_items set deliverables=jsonb_set(jsonb_set(deliverables,'{0,checked}','true'),'{0,evidence}','"DEMONSTRAÇÃO · primeira entrega ilustrativa, revisão 01. Não é evidência real."'),status='doing' where id=p.id;
   elsif group_no=completed_group+1 and package_no=2 then
    update public.aurora_work_items set deliverables=(select jsonb_agg(d||'{"checked":true,"evidence":"DEMONSTRAÇÃO · entrega ilustrativa pendente de aceite. Sem documento real."}'::jsonb) from jsonb_array_elements(deliverables) d),status='review',evidence='DEMONSTRAÇÃO · pacote com entrega ilustrativa aguardando deliberação.' where id=p.id;
   elsif group_no=completed_group+1 and package_no=3 then
    update public.aurora_work_items set status='blocked',evidence='DEMONSTRAÇÃO · bloqueio ilustrativo: informação de entrada pendente de validação.' where id=p.id;
   end if;
  end loop;
  b:=public.aurora_baseline_wbs(r.id,r.module,'EAP demonstrativa · versão inicial','DEMONSTRAÇÃO · referência sintética de escopo, entregas, planejamento e alçadas; nenhuma aprovação real de empreendimento.');
  -- One clearly identified scope change demonstrates comparison without modifying the preserved version.
  if r.module='development' then
   update public.aurora_work_items set details=details||jsonb_build_object('Premissas','DEMONSTRAÇÃO · revisão da estratégia de contratação em lotes. Avaliar impacto no cronograma e nas interfaces antes de nova linha de base.') where id=any(new_ids) and wbs_code='3.08.01';
  end if;
 end loop;
end $$;
reset role;
select jsonb_build_object('packages',(select count(*) from public.aurora_work_items where wbs_code is not null and workspace_id='a0202026-0000-4000-8000-000000000001'),'baselines',(select count(*) from public.aurora_wbs_baselines where workspace_id='a0202026-0000-4000-8000-000000000001'));
commit;
