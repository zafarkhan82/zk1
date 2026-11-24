-- Go4Pro 0013: Kader, Ranglisten (Team, Spielklasse, Region, bundesweit) und Kennzeichnung von Testdaten.

-- ───────────────────────── Testdaten-Kennzeichen ─────────────────────────
-- Testdaten lassen sich später gezielt bereinigen (supabase/seed/cleanup_test_data.sql).
alter table clubs add column if not exists is_test boolean not null default false;
alter table teams add column if not exists is_test boolean not null default false;
alter table players add column if not exists is_test boolean not null default false;
alter table profiles add column if not exists is_test boolean not null default false;

create index if not exists exercise_entries_player_status on exercise_entries (player_id, status);
create index if not exists team_members_team on team_members (team_id) where to_date is null;
create index if not exists teams_league on teams (league, age_group) where active;

-- ───────────────────────── Punkte ─────────────────────────
-- Wie in der App (logXp) für bestätigte Einträge: 2 × Basis + Bonus bei erreichtem Ziel.
create or replace function entry_points(p_level level, p_achieved boolean) returns int
language sql immutable as $$
  select (case p_level when 'bronze' then 20 when 'silber' then 40 when 'gold' then 70 else 0 end)
       + (case when p_achieved then case p_level when 'bronze' then 5 when 'silber' then 10 when 'gold' then 18 else 0 end else 0 end);
$$;

-- ───────────────────────── Kader ─────────────────────────
-- Sichtbar für Eltern/Spieler mit aktivem Mitglied im Team, Team-Staff und Plattform-Admins.
create or replace function team_roster(p_team uuid)
returns table (player_id uuid, nickname text, jersey_number int, preferred_position text,
               points int, entries int, last_activity timestamptz, is_mine boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (is_team_staff(p_team) or is_platform_admin() or exists (
      select 1 from team_members m where m.team_id = p_team and m.status = 'approved' and m.to_date is null
         and is_player_owner(m.player_id))) then
    raise exception 'Nur für Mitglieder des Teams.';
  end if;
  return query
  select p.id, p.nickname, m.jersey_number, p.preferred_position,
         coalesce(sum(entry_points(e.level, e.achieved)) filter (where e.status = 'confirmed' and e.season = t.season), 0)::int,
         count(e.id) filter (where e.season = t.season)::int,
         max(e.created_at),
         is_player_owner(p.id)
    from team_members m
    join teams t on t.id = m.team_id
    join players p on p.id = m.player_id and p.anonymized_at is null
    left join exercise_entries e on e.player_id = p.id and e.status <> 'rejected'
   where m.team_id = p_team and m.status = 'approved' and m.to_date is null
   group by p.id, p.nickname, m.jersey_number, p.preferred_position
   order by 5 desc, p.nickname;
end $$;

-- ───────────────────────── Ranglisten ─────────────────────────
-- p_scope: team | league | region | national
-- p_period: season (aktuelle Saison) | month (letzte 30 Tage)
-- Team-Rangliste ist kostenlos. Ab Spielklasse: nur Spieler mit Premium und Veröffentlichungs-Erlaubnis;
-- unter der C-Jugend nur mit Initiale. Ohne Premium sieht man nur den eigenen Platz.
create or replace function rankings(p_player uuid, p_scope text, p_period text default 'season')
returns table (rank int, player_id uuid, nickname text, club_name text, team_name text,
               points int, entries int, is_me boolean, total int, locked boolean, scope_label text)
language plpgsql stable security definer set search_path = public as $$
declare
  t teams;
  c clubs;
  grp text;
  since timestamptz;
  can_see boolean;
  label text;
begin
  if not (is_player_owner(p_player) or is_platform_admin()) then
    raise exception 'Nur für eigene Spieler.';
  end if;
  if p_scope not in ('team', 'league', 'region', 'national') then raise exception 'Unbekannte Rangliste.'; end if;

  select * into t from teams where id = active_team_of(p_player);
  if found then select * into c from clubs where id = t.club_id; end if;
  grp := coalesce(t.age_group, (select age_group(birth_year) from players where id = p_player));
  since := case when p_period = 'month' then now() - interval '30 days' else '-infinity'::timestamptz end;
  can_see := p_scope = 'team' or is_premium(p_player) or is_platform_admin();

  if p_scope in ('team', 'league') and t.id is null then return; end if;
  if p_scope = 'league' and t.league is null then return; end if;
  if p_scope = 'region' and c.association is null then return; end if;

  label := case p_scope
    when 'team' then c.name || ' ' || t.name
    when 'league' then t.league
    when 'region' then grp || '-Jugend · ' || c.association
    else grp || '-Jugend · Deutschland' end;

  return query
  with pool as (
    select p.id, p.nickname, p.birth_year, cl.name as club_name, tm.name as team_name
      from team_members m
      join teams tm on tm.id = m.team_id and tm.active
      join clubs cl on cl.id = tm.club_id
      join players p on p.id = m.player_id and p.anonymized_at is null
     where m.status = 'approved' and m.to_date is null
       and case p_scope
             when 'team' then tm.id = t.id
             when 'league' then tm.league = t.league and tm.age_group = t.age_group and tm.season = t.season
             when 'region' then cl.association = c.association and tm.age_group = grp
             else tm.age_group = grp end
       and (p_scope = 'team' or p.id = p_player
            or (p.public_consent_at is not null and is_premium(p.id)))
  ), scored as (
    select pool.*,
           coalesce(sum(entry_points(e.level, e.achieved)), 0)::int as pts,
           count(e.id)::int as n
      from pool
      left join exercise_entries e on e.player_id = pool.id and e.status = 'confirmed' and e.created_at >= since
            and (p_period = 'month' or e.season = coalesce(t.season, current_season()))
     group by pool.id, pool.nickname, pool.birth_year, pool.club_name, pool.team_name
  ), ranked as (
    select scored.*, (rank() over (order by pts desc))::int as rk, (count(*) over ())::int as cnt
      from scored
  )
  select r.rk, r.id,
         case when r.id = p_player or p_scope = 'team' or u_class(r.birth_year) >= 14 then r.nickname
              else left(r.nickname, 1) || '.' end,
         r.club_name, r.team_name, r.pts, r.n, r.id = p_player, r.cnt, not can_see, label
    from ranked r
   where r.id = p_player or (can_see and r.rk <= 50)
   order by r.rk, r.nickname;
end $$;

revoke execute on function team_roster(uuid), rankings(uuid, text, text) from public, anon;
grant execute on function team_roster(uuid), rankings(uuid, text, text), entry_points(level, boolean) to authenticated;

-- Spielklasse und Verband für die App (my_teams erweitert)
drop function if exists my_teams(uuid);
create function my_teams(p_player uuid)
returns table (member_id uuid, team_id uuid, team_name text, club_name text, status approval_status, jersey_number int,
               league text, age_group text, association text, club_id uuid)
language sql stable security definer set search_path = public as $$
  select m.id, t.id, t.name, c.name, m.status, m.jersey_number, t.league, t.age_group, c.association, c.id
    from team_members m join teams t on t.id = m.team_id join clubs c on c.id = t.club_id
   where m.player_id = p_player and m.to_date is null and can_manage_player(p_player);
$$;
revoke execute on function my_teams(uuid) from public, anon;
grant execute on function my_teams(uuid) to authenticated;
