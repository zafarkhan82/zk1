-- Go4Pro 0024: Team-Zuordnungen der Trainer*innen einzeln (zum gezielten Entfernen im Vereinsbereich)
create or replace function club_trainer_teams(p_club uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when is_club_admin(p_club) or is_platform_admin() then
    coalesce(jsonb_agg(jsonb_build_object('user_id', s.user_id, 'team_id', t.id, 'name', t.name, 'season', t.season)
                       order by t.season desc, t.name), '[]'::jsonb) end
    from team_staff s join teams t on t.id = s.team_id
   where t.club_id = p_club and s.to_date is null and s.status = 'approved';
$$;
revoke execute on function club_trainer_teams(uuid) from public, anon;
grant execute on function club_trainer_teams(uuid) to authenticated;
grant execute on function club_unassign_trainer(uuid, uuid) to authenticated;
