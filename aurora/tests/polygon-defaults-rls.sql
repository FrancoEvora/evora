-- Read/write verification is fully rolled back. Uses only the existing demo owner.
begin;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select m.user_id from aurora_members m join aurora_workspaces w on w.id=m.workspace_id where w.is_demo and m.active and m.role='owner' limit 1),'role','authenticated','aal','aal2')::text,true);
set local role authenticated;
do $$
declare w uuid;i uuid;n int;g jsonb:='{"type":"Polygon","coordinates":[[[-47.49,-18.73],[-47.48,-18.73],[-47.48,-18.72],[-47.49,-18.72],[-47.49,-18.73]]]}';failed boolean;
begin
 select id into w from public.aurora_workspaces where is_demo limit 1;
 failed:=false;
 begin insert into public.aurora_assets(workspace_id,name,division,city,state,municipality_code) values(w,'QA missing perimeter','urban','Monte Carmelo','MG','3143104');exception when raise_exception then failed:=true;end;
 if not failed then raise exception 'FAIL: missing geometry accepted';end if;
 failed:=false;
 begin insert into public.aurora_assets(workspace_id,name,division,city,state,municipality_code,geometry) values(w,'QA crossing','urban','Monte Carmelo','MG','3143104','{"type":"Polygon","coordinates":[[[0,0],[1,1],[0,1],[1,0],[0,0]]]}');exception when raise_exception then failed:=true;end;
 if not failed then raise exception 'FAIL: self-intersection accepted';end if;
 failed:=false;
 begin insert into public.aurora_assets(workspace_id,name,division,city,state,municipality_code,geometry) values(w,'QA invalid municipality','urban','Monte Carmelo','SP','3143104',g);exception when raise_exception then failed:=true;end;
 if not failed then raise exception 'FAIL: state/code mismatch accepted';end if;
 insert into public.aurora_assets(workspace_id,name,division,city,state,municipality_code,geometry) values(w,'QA transactional polygon','urban','Monte Carmelo','MG','3143104',g) returning id into i;
 select count(*) into n from public.aurora_sources where asset_id=i and enabled and cadence in ('daily','weekly','monthly');
 if n<>9 then raise exception 'FAIL: default source count %',n;end if;
 if not exists(select 1 from public.aurora_assets where id=i and polygon_area_ha>0 and latitude is not null and longitude is not null and geometry->>'type'='MultiPolygon') then raise exception 'FAIL: calculated perimeter missing';end if;
 update public.aurora_sources set enabled=false,cadence='monthly' where asset_id=i and source_key='ibge_census';
 update public.aurora_assets set geometry=g where id=i;
 select count(*) into n from public.aurora_sources where asset_id=i;
 if n<>9 then raise exception 'FAIL: duplicate default sources';end if;
 update public.aurora_assets set municipality_code='3170206',city='Uberlândia' where id=i;
 if (select count(*) from public.aurora_sources where asset_id=i and source_key like 'ibge_%' and config->>'municipality'='3170206')<>5 then raise exception 'FAIL: stale municipal scope';end if;
 if not exists(select 1 from public.aurora_sources where asset_id=i and source_key='ibge_census' and not enabled and cadence='monthly') then raise exception 'FAIL: user schedule overwritten';end if;
 raise notice 'PASS: mandatory polygon, topology, official UF prefix, area, nine atomic connections, idempotence, geographic update and pause preservation';
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated','aal','aal2')::text,true);
do $$begin
 if exists(select 1 from public.aurora_assets) or exists(select 1 from public.aurora_sources) then raise exception 'FAIL: cross-tenant read';end if;
 if has_function_privilege('authenticated','aurora_private.connect_asset_defaults()','execute') then raise exception 'FAIL: trigger callable directly';end if;
 raise notice 'PASS: cross-tenant isolation and private provisioner';
end $$;
rollback;
