-- The legacy schedule guard must recognize both newly automatic geographic adapters.
do $$ declare f text;begin
 f:=pg_get_functiondef('aurora_private.guard_source_schedule()'::regprocedure);
 if position('ibge_sectors' in f)=0 then
  if position('''anm_mining'')' in f)=0 then raise exception 'Unexpected source schedule guard';end if;
  execute replace(f,'''anm_mining'')','''anm_mining'',''ibge_sectors'',''osm_places'')');
 end if;
end $$;
-- Restore only our newly provisioned defaults, without overwriting a user's edit.
update public.aurora_sources s set cadence=case source_key when 'ibge_sectors' then 'monthly' else 'weekly' end
where source_key in ('ibge_sectors','osm_places') and config->>'auto_default'='2' and cadence='manual'
and not exists(select 1 from public.aurora_audit a where a.entity='aurora_sources' and a.entity_id=s.id::text and a.action='update' and a.actor_id is not null);
update public.aurora_sources set next_run_at=date_trunc('day',last_success_at at time zone 'UTC') at time zone 'UTC'+interval '9 hours'+case when cadence='monthly' then interval '1 month' else interval '7 days' end
where source_key in ('ibge_sectors','osm_places') and config->>'auto_default'='2' and last_success_at is not null and cadence<>'manual';
