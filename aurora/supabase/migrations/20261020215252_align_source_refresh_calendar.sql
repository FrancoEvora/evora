-- Align refresh deadlines to 09:00 UTC, before the daily 09:10 UTC worker.
-- Adding an interval to the completion timestamp would miss the next cron window.
create or replace function aurora_private.finish_source(token text,i uuid,lease uuid,payload jsonb,failure text) returns void language plpgsql security definer set search_path='' as $$
declare s public.aurora_sources%rowtype;begin
 perform aurora_private.verify_worker(token);select * into s from public.aurora_sources where id=i for update;
 if s.id is null or s.lease_token is distinct from lease or s.locked_until<now() then raise exception 'Execução expirada';end if;
 if payload is not null and (octet_length(payload::text)>1000000 or jsonb_typeof(payload->'rows')<>'array') then raise exception 'Resposta inválida';end if;
 insert into public.aurora_source_runs(workspace_id,source_id,status,snapshot,error) values(s.workspace_id,i,case when failure is null then 'success' else 'error' end,payload,left(failure,500));
 update public.aurora_sources set snapshot=case when failure is null then payload else snapshot end,last_success_at=case when failure is null then now() else last_success_at end,last_status=case when failure is null then 'success' else 'error' end,last_error=left(failure,500),lease_token=null,locked_until=null,next_run_at=((date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')+interval '9 hours')+case when failure is not null then interval '1 day' when cadence='daily' then interval '1 day' when cadence='weekly' then interval '7 days' else interval '1 month' end where id=i;
end $$;
update public.aurora_sources set next_run_at=((date_trunc('day',coalesce(last_attempt_at,last_success_at) at time zone 'UTC') at time zone 'UTC')+interval '9 hours')+case when last_status='error' then interval '1 day' when cadence='daily' then interval '1 day' when cadence='weekly' then interval '7 days' else interval '1 month' end where enabled and cadence<>'manual' and last_attempt_at is not null and last_status in ('success','error');
