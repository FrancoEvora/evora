-- Public demonstration coordinates are safe to query automatically. Operational
-- environmental sources remain provisioned but paused until their administrator
-- authorizes transmitting the study envelope to the external geoservices.
do $$ declare f text;begin
 f:=pg_get_functiondef('aurora_private.connect_environment_defaults()'::regprocedure);
 f:=replace(f,'title,config,cadence,created_by) values','title,config,cadence,created_by,enabled) values');
 f:=replace(f,'configuration,item.cadence,new.created_by) on conflict','configuration,item.cadence,new.created_by,(select w.is_demo from public.aurora_workspaces w where w.id=new.workspace_id)) on conflict');
 execute f;
end $$;
update public.aurora_sources s set enabled=false,lease_token=null,locked_until=null,last_status=case when last_status='running' then null else last_status end
from public.aurora_workspaces w where w.id=s.workspace_id and not w.is_demo and s.source_key in ('ide_sisema','ibama','icmbio','iphan','graprohab');
