-- The authorized job carries canonical coordinates from the asset, independently of source config.
do $$ declare f text;r regprocedure;begin
 foreach r in array array['aurora_private.claim_source(uuid)'::regprocedure,'aurora_private.source_jobs(text)'::regprocedure] loop
  f:=pg_get_functiondef(r);
  if position('''asset_geometry''' in f)=0 then raise exception 'Unexpected source job';end if;
  f:=replace(f,'''asset_geometry'',','''asset_coordinates'',(select jsonb_build_object(''latitude'',a.latitude,''longitude'',a.longitude) from public.aurora_assets a where a.id=s.asset_id and a.workspace_id=s.workspace_id),''asset_geometry'',');
  execute f;
 end loop;
end $$;
