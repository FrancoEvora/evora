-- INSERT ... RETURNING must check the inserted row's workspace directly.
-- A stable helper that re-selects the new asset can miss it in the statement snapshot.
alter policy asset_read on public.aurora_assets using(aurora_private.role_for(workspace_id) in ('owner','admin','manager','analyst','viewer'));
alter policy asset_update on public.aurora_assets using(aurora_private.role_for(workspace_id) in ('owner','admin','manager','analyst')) with check(aurora_private.role_for(workspace_id) in ('owner','admin','manager','analyst'));
