create function aurora_private.guard_source_schedule() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.source_key not in ('ibge_census','ibge_population','ibge_gdp','ibge_sinapi','ibge_custom','bcb_selic','bcb_ipca','anm_mining') then new.cadence:='manual';end if;
 if tg_op='UPDATE' and (old.cadence,old.enabled) is distinct from (new.cadence,new.enabled) then new.next_run_at:=now();end if;
 if tg_op='INSERT' then
  perform pg_advisory_xact_lock(hashtext(new.workspace_id::text));
  if (select count(*) from public.aurora_sources where workspace_id=new.workspace_id)>=100 then raise exception 'Limite de 100 conexões por organização atingido';end if;
 end if;return new;end $$;
revoke all on function aurora_private.guard_source_schedule() from public,anon,authenticated;
create trigger aurora_source_schedule before insert or update of cadence,enabled on public.aurora_sources for each row execute function aurora_private.guard_source_schedule();
