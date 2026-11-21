-- Vereins-Administration und Historie je Verein, Jugend (Altersklasse) und Saison
--
-- Grundsatz: Fakten verschwinden nie. Jeder Eintrag merkt sich, in welchem Verein, Team,
-- welcher Altersklasse und Saison er entstanden ist (Snapshot). Wechselt ein Spieler den Verein,
-- endet nur seine Mitgliedschaft – der alte Verein behält die Historie bis zum Wechsel,
-- sieht aber nichts mehr, was danach passiert.

-- ───────────────────────── Snapshot-Spalten ─────────────────────────

alter table exercise_entries add column team_id uuid references teams (id);
alter table exercise_entries add column season text;
alter table exercise_entries add column age_group text;
alter table diary_entries add column club_id uuid references clubs (id);
alter table diary_entries add column team_id uuid references teams (id);
alter table diary_entries add column season text;
alter table diary_entries add column age_group text;
alter table matches add column season text;
alter table matches add column age_group text;

create index if not exists exercise_entries_club_season on exercise_entries (club_id, season, age_group);
create index if not exists exercise_entries_team on exercise_entries (team_id);

create or replace function current_season() returns text
language sql stable set search_path = public as $$
  select season_start_year() || '/' || right((season_start_year() + 1)::text, 2);
$$;

-- Aktuelles Team (bestätigt, aktiv) eines Spielers – bei mehreren das zuletzt aufgenommene
create or replace function active_team_of(p_player uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select m.team_id from team_members m
   where m.player_id = p_player and m.status = 'approved' and m.to_date is null
   order by m.created_at desc limit 1;
$$;

-- Snapshot setzen (für Übungen und Tagebuch)
create or replace function set_entry_snapshot() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  tid uuid;
begin
  tid := active_team_of(new.player_id);
  new.team_id := tid;
  new.club_id := (select club_id from teams where id = tid);
  -- Saison und Jugend des Teams (z. B. nach einem frühen Saisonwechsel); ohne Team: Kalender-Saison und Jahrgang
  new.season := coalesce((select season from teams where id = tid), current_season());
  new.age_group := coalesce((select t.age_group from teams t where t.id = tid),
                            (select age_group(birth_year) from players where id = new.player_id));
  return new;
end $$;
revoke execute on function set_entry_snapshot() from public, anon, authenticated;

-- Reihenfolge: "a_" läuft vor den übrigen BEFORE-INSERT-Triggern (alphabetisch)
create trigger a_exercise_entries_snapshot before insert on exercise_entries
  for each row execute function set_entry_snapshot();
create trigger a_diary_entries_snapshot before insert on diary_entries
  for each row execute function set_entry_snapshot();

create or replace function set_match_snapshot() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.team_id is not null then
    select t.season, t.age_group into new.season, new.age_group from teams t where t.id = new.team_id;
  end if;
  return new;
end $$;
revoke execute on function set_match_snapshot() from public, anon, authenticated;
create trigger a_matches_snapshot before insert on matches for each row execute function set_match_snapshot();

-- Bestehende Einträge nachtragen (Altersklasse und Saison zum Zeitpunkt des Eintrags)
update exercise_entries e
   set season = (case when extract(month from e.created_at) >= 7 then extract(year from e.created_at)::int
                      else extract(year from e.created_at)::int - 1 end)::text || '/' ||
                right(((case when extract(month from e.created_at) >= 7 then extract(year from e.created_at)::int
                      else extract(year from e.created_at)::int - 1 end) + 1)::text, 2),
       age_group = (select age_group(p.birth_year) from players p where p.id = e.player_id)
 where e.season is null;

-- Snapshot ist unveränderlich (Übungseinträge)
create or replace function exercise_entry_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  confirming boolean := coalesce(current_setting('kick.confirming', true), '') = 'on';
begin
  if coalesce(current_setting('kick.anonymizing', true), '') = 'on' then return new; end if;

  new.id := old.id;
  new.player_id := old.player_id;
  new.exercise_id := old.exercise_id;
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  new.club_id := old.club_id;
  new.team_id := old.team_id;
  new.season := old.season;
  new.age_group := old.age_group;
  new.session_id := old.session_id;

  if not confirming then
    if (new.status, new.player_confirmed_at, new.trainer_confirmed_at, new.version, new.trainer_user_id, new.achieved)
       is distinct from (old.status, old.player_confirmed_at, old.trainer_confirmed_at, old.version, old.trainer_user_id, old.achieved) then
      raise exception 'Bestätigungen laufen nur über die Freigabe-Funktionen.';
    end if;
  end if;

  if (new.level, new.value, new.note) is distinct from (old.level, old.value, old.note) then
    if confirming then raise exception 'Bei der Freigabe dürfen Inhalte nicht geändert werden.'; end if;
    if now() > old.created_at + interval '12 hours' then
      raise exception 'Änderungen sind nur innerhalb von 12 Stunden nach dem Eintragen möglich.';
    end if;
    if new.level in ('silber', 'gold') and not is_premium(new.player_id) then
      raise exception 'Silber und Gold sind Premium. Bitte zuerst Premium freischalten.';
    end if;
    new.version := old.version + 1;
    new.status := 'pending';
    new.achieved := compute_achieved(new.player_id, new.exercise_id, new.level, new.value);
    new.player_confirmed_at := case when is_player_owner(new.player_id) then now() end;
    new.trainer_confirmed_at := null;
    if new.trainer_user_id is null and new.level in ('silber', 'gold') then
      new.trainer_user_id := team_trainer_for(new.player_id);
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function exercise_entry_before_update() from public, anon, authenticated;

create or replace function diary_edit_window() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('kick.anonymizing', true), '') = 'on' then return new; end if;
  if now() > old.created_at + interval '12 hours' then
    raise exception 'Änderungen sind nur innerhalb von 12 Stunden nach dem Eintragen möglich.';
  end if;
  new.id := old.id;
  new.player_id := old.player_id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.club_id := old.club_id;
  new.team_id := old.team_id;
  new.season := old.season;
  new.age_group := old.age_group;
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function diary_edit_window() from public, anon, authenticated;

-- ───────────────────────── Mitgliedschaften: Ende ist endgültig ─────────────────────────

create or replace function protect_team_member() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.player_id, new.team_id, new.from_date, new.created_at)
     is distinct from (old.player_id, old.team_id, old.from_date, old.created_at) then
    raise exception 'Spieler und Team einer Mitgliedschaft können nicht geändert werden.';
  end if;
  if old.to_date is not null and new.to_date is distinct from old.to_date then
    raise exception 'Eine beendete Mitgliedschaft bleibt beendet. Für eine Rückkehr bitte neu anmelden.';
  end if;
  if new.status is distinct from old.status then new.approved_by := auth.uid(); end if;
  return new;
end $$;
revoke execute on function protect_team_member() from public, anon, authenticated;

create or replace function protect_team_staff() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.user_id, new.team_id, new.from_date) is distinct from (old.user_id, old.team_id, old.from_date) then
    raise exception 'Trainer und Team können nicht geändert werden.';
  end if;
  if old.to_date is not null and new.to_date is distinct from old.to_date then
    raise exception 'Eine beendete Zuordnung bleibt beendet.';
  end if;
  return new;
end $$;
revoke execute on function protect_team_staff() from public, anon, authenticated;

-- Vereins-Staff sieht Übungseinträge, die in seinem Verein entstanden sind – auch nach einem Wechsel
create policy "Einträge lesen (Vereinshistorie)" on exercise_entries for select using (club_id is not null and is_club_staff(club_id));

-- Nur aktive Mitglieder lassen Trainer neue Daten sehen: is_trainer_of prüft bereits to_date is null.

-- ───────────────────────── Vereins-Administration ─────────────────────────

create or replace function require_club_admin(p_club uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not (is_club_admin(p_club) or is_platform_admin()) then
    raise exception 'Nur für Vereins-Admins.';
  end if;
end $$;
revoke execute on function require_club_admin(uuid) from public, anon;

-- Teams des Vereins, alle Saisons
create or replace function club_teams(p_club uuid)
returns table (team_id uuid, name text, age_group text, season text, active boolean, join_code text,
               players bigint, pending bigint, trainers text)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, t.age_group, t.season, t.active,
         case when t.active then t.join_code end,
         (select count(*) from team_members m where m.team_id = t.id and m.status = 'approved' and m.to_date is null),
         (select count(*) from team_members m where m.team_id = t.id and m.status = 'pending' and m.to_date is null),
         (select string_agg(pr.display_name, ', ' order by pr.display_name) from team_staff s join profiles pr on pr.id = s.user_id
           where s.team_id = t.id and s.status = 'approved' and s.to_date is null)
    from teams t
   where t.club_id = p_club and (is_club_staff(p_club) or is_platform_admin())
   order by t.season desc, t.active desc, t.age_group, t.name;
$$;
revoke execute on function club_teams(uuid) from public, anon;

-- Trainer*innen des Vereins inkl. ehemaliger
create or replace function club_trainers(p_club uuid)
returns table (membership_id uuid, user_id uuid, display_name text, email text, role membership_role,
               status approval_status, license text, is_nlz boolean, valid_from date, valid_to date, teams text)
language sql stable security definer set search_path = public as $$
  select cm.id, cm.user_id, pr.display_name, pr.email, cm.role, cm.status, cm.license, cm.is_nlz, cm.valid_from, cm.valid_to,
         (select string_agg(t.name || ' (' || t.season || ')', ', ' order by t.season desc, t.name)
            from team_staff s join teams t on t.id = s.team_id
           where s.user_id = cm.user_id and t.club_id = p_club and s.to_date is null and s.status = 'approved')
    from club_memberships cm join profiles pr on pr.id = cm.user_id
   where cm.club_id = p_club and (is_club_admin(p_club) or is_platform_admin())
   order by (cm.valid_to is null) desc, cm.status, pr.display_name;
$$;
revoke execute on function club_trainers(uuid) from public, anon;

-- Spieler*innen des Vereins inkl. ehemaliger (jede Mitgliedschaft eine Zeile)
create or replace function club_players(p_club uuid)
returns table (member_id uuid, player_id uuid, nickname text, birth_year int, team_id uuid, team_name text,
               season text, age_group text, status approval_status, jersey_number int, from_date date, to_date date)
language sql stable security definer set search_path = public as $$
  select m.id, p.id, p.nickname, p.birth_year, t.id, t.name, t.season, t.age_group, m.status, m.jersey_number,
         m.from_date, m.to_date
    from team_members m join teams t on t.id = m.team_id join players p on p.id = m.player_id
   where t.club_id = p_club and (is_club_admin(p_club) or is_platform_admin())
   order by (m.to_date is null) desc, t.season desc, t.name, p.nickname;
$$;
revoke execute on function club_players(uuid) from public, anon;

-- Trainer einem Team zuordnen
create or replace function club_assign_trainer(p_team uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  cid uuid := (select club_id from teams where id = p_team);
begin
  perform require_club_admin(cid);
  if not exists (select 1 from club_memberships where club_id = cid and user_id = p_user and status = 'approved'
                   and (valid_to is null or valid_to >= current_date)) then
    raise exception 'Diese Person ist nicht als Trainer*in im Verein freigeschaltet.';
  end if;
  if exists (select 1 from team_staff where team_id = p_team and user_id = p_user and to_date is null) then return; end if;
  insert into team_staff (team_id, user_id, status, approved_by) values (p_team, p_user, 'approved', auth.uid());
end $$;
revoke execute on function club_assign_trainer(uuid, uuid) from public, anon;

-- Trainer von einem Team abziehen
create or replace function club_unassign_trainer(p_team uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_club_admin((select club_id from teams where id = p_team));
  update team_staff set to_date = current_date where team_id = p_team and user_id = p_user and to_date is null;
end $$;
revoke execute on function club_unassign_trainer(uuid, uuid) from public, anon;

-- Trainer im Verein abmelden (alle Teams des Vereins)
create or replace function club_remove_trainer(p_membership uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  cm club_memberships;
begin
  select * into cm from club_memberships where id = p_membership;
  perform require_club_admin(cm.club_id);
  if cm.user_id = auth.uid() and cm.role = 'club_admin'
     and (select count(*) from club_memberships where club_id = cm.club_id and role = 'club_admin' and status = 'approved'
          and (valid_to is null or valid_to >= current_date)) <= 1 then
    raise exception 'Der letzte Vereins-Admin kann sich nicht selbst abmelden. Bitte zuerst eine weitere Person zum Admin machen.';
  end if;
  perform set_config('kick.club_admin', 'on', true);
  update club_memberships set valid_to = current_date where id = p_membership and valid_to is null;
  update team_staff s set to_date = current_date
    from teams t where t.id = s.team_id and t.club_id = cm.club_id and s.user_id = cm.user_id and s.to_date is null;
end $$;
revoke execute on function club_remove_trainer(uuid) from public, anon;

-- Freigeschaltete*n Trainer*in zum Vereins-Admin machen
create or replace function club_make_admin(p_membership uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  cm club_memberships;
begin
  select * into cm from club_memberships where id = p_membership;
  perform require_club_admin(cm.club_id);
  if cm.status <> 'approved' or cm.valid_to is not null then raise exception 'Nur aktive, freigeschaltete Trainer*innen.'; end if;
  if exists (select 1 from club_memberships where club_id = cm.club_id and user_id = cm.user_id and role = 'club_admin'
               and status = 'approved' and valid_to is null) then return; end if;
  insert into club_memberships (club_id, user_id, role, status, approved_by)
  values (cm.club_id, cm.user_id, 'club_admin', 'approved', auth.uid());
end $$;
revoke execute on function club_make_admin(uuid) from public, anon;

-- Spieler*in anmelden (Beitrittsanfrage annehmen) bzw. ablehnen
create or replace function club_review_member(p_member uuid, p_accept boolean, p_jersey int default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  m team_members;
begin
  select * into m from team_members where id = p_member;
  if not (is_team_staff(m.team_id) or is_platform_admin()) then raise exception 'Keine Berechtigung.'; end if;
  update team_members set status = case when p_accept then 'approved'::approval_status else 'rejected'::approval_status end,
                          jersey_number = coalesce(p_jersey, jersey_number),
                          to_date = case when p_accept then null else current_date end
   where id = p_member and status = 'pending' and to_date is null;
end $$;
revoke execute on function club_review_member(uuid, boolean, int) from public, anon;

-- Spieler*in aus einem Team abmelden. Ist es das letzte aktive Team im Verein, endet auch die Vereinszugehörigkeit.
create or replace function club_remove_player(p_member uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m team_members;
  cid uuid;
begin
  select * into m from team_members where id = p_member;
  cid := (select club_id from teams where id = m.team_id);
  perform require_club_admin(cid);
  update team_members set to_date = current_date where id = p_member and to_date is null;
  if not exists (select 1 from team_members tm join teams t on t.id = tm.team_id
                  where tm.player_id = m.player_id and t.club_id = cid and tm.to_date is null and tm.status = 'approved') then
    update player_club_history set to_date = current_date where player_id = m.player_id and club_id = cid and to_date is null;
  end if;
end $$;
revoke execute on function club_remove_player(uuid) from public, anon;

-- Spieler*in innerhalb des Vereins in ein anderes Team umsetzen (Historie bleibt)
create or replace function club_move_player(p_member uuid, p_new_team uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  m team_members;
  cid uuid;
  nid uuid;
begin
  select * into m from team_members where id = p_member;
  cid := (select club_id from teams where id = m.team_id);
  perform require_club_admin(cid);
  if (select club_id from teams where id = p_new_team) <> cid then raise exception 'Das Ziel-Team gehört zu einem anderen Verein.'; end if;
  if m.to_date is not null or m.status <> 'approved' then raise exception 'Nur aktive Mitglieder können umgesetzt werden.'; end if;
  update team_members set to_date = current_date where id = p_member;
  insert into team_members (team_id, player_id, jersey_number, status, approved_by)
  values (p_new_team, m.player_id, m.jersey_number, 'approved', auth.uid())
  on conflict do nothing returning id into nid;
  update player_club_history set team_name = (select name from teams where id = p_new_team)
   where player_id = m.player_id and club_id = cid and to_date is null;
  return nid;
end $$;
revoke execute on function club_move_player(uuid, uuid) from public, anon;

-- Saisonwechsel: Team in die neue Saison übernehmen (Spieler und Trainer), altes Team archivieren
create or replace function club_rollover_team(p_team uuid, p_name text, p_age_group text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  old_t teams;
  nid uuid;
  next_season text;
begin
  select * into old_t from teams where id = p_team;
  perform require_club_admin(old_t.club_id);
  if p_age_group not in ('E', 'D', 'C', 'B', 'A') then raise exception 'Ungültige Altersklasse.'; end if;
  next_season := (left(old_t.season, 4)::int + 1) || '/' || right((left(old_t.season, 4)::int + 2)::text, 2);
  if exists (select 1 from teams where club_id = old_t.club_id and name = trim(p_name) and season = next_season) then
    raise exception 'Dieses Team gibt es in der Saison % schon.', next_season;
  end if;
  insert into teams (club_id, name, age_group, season, created_by)
  values (old_t.club_id, trim(p_name), p_age_group, next_season, auth.uid()) returning id into nid;
  insert into team_staff (team_id, user_id, status, approved_by)
    select nid, s.user_id, 'approved', auth.uid() from team_staff s
     where s.team_id = p_team and s.status = 'approved' and s.to_date is null;
  insert into team_members (team_id, player_id, jersey_number, status, approved_by)
    select nid, m.player_id, m.jersey_number, 'approved', auth.uid() from team_members m
     where m.team_id = p_team and m.status = 'approved' and m.to_date is null;
  update team_members set to_date = current_date where team_id = p_team and to_date is null;
  update team_staff set to_date = current_date where team_id = p_team and to_date is null;
  perform set_config('kick.club_admin', 'on', true);
  update teams set active = false where id = p_team;
  return nid;
end $$;
revoke execute on function club_rollover_team(uuid, text, text) from public, anon;

-- Team archivieren (z. B. abgemeldet): alle Zuordnungen enden, Historie bleibt
create or replace function club_archive_team(p_team uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  cid uuid := (select club_id from teams where id = p_team);
begin
  perform require_club_admin(cid);
  update team_members set to_date = current_date where team_id = p_team and to_date is null;
  update team_staff set to_date = current_date where team_id = p_team and to_date is null;
  update teams set active = false where id = p_team;
end $$;
revoke execute on function club_archive_team(uuid) from public, anon;

-- ───────────────────────── Historie ─────────────────────────

-- Übersicht je Saison, Altersklasse und Team (aus den Snapshots – unabhängig von späteren Wechseln)
create or replace function club_history(p_club uuid)
returns table (season text, age_group text, team_id uuid, team_name text, players bigint,
               entries bigint, confirmed bigint, gold bigint, points bigint)
language sql stable security definer set search_path = public as $$
  select e.season, e.age_group, e.team_id, coalesce(t.name, '–'),
         count(distinct e.player_id), count(*),
         count(*) filter (where e.status = 'confirmed'),
         count(*) filter (where e.status = 'confirmed' and e.level = 'gold' and e.achieved),
         coalesce(sum(case when e.status = 'confirmed' then
           (case e.level when 'bronze' then 10 when 'silber' then 20 else 35 end) * 2
           + case when e.achieved then case e.level when 'bronze' then 5 when 'silber' then 10 else 18 end else 0 end
         end), 0)
    from exercise_entries e left join teams t on t.id = e.team_id
   where e.club_id = p_club and (is_club_staff(p_club) or is_platform_admin())
   group by e.season, e.age_group, e.team_id, t.name
   order by e.season desc, e.age_group, t.name;
$$;
revoke execute on function club_history(uuid) from public, anon;

-- Spieler*innen-Bilanz eines Teams in einer Saison (auch ehemalige)
create or replace function club_history_players(p_team uuid)
returns table (player_id uuid, nickname text, entries bigint, confirmed bigint, gold bigint, points bigint,
               still_in_club boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.nickname, count(*), count(*) filter (where e.status = 'confirmed'),
         count(*) filter (where e.status = 'confirmed' and e.level = 'gold' and e.achieved),
         coalesce(sum(case when e.status = 'confirmed' then
           (case e.level when 'bronze' then 10 when 'silber' then 20 else 35 end) * 2
           + case when e.achieved then case e.level when 'bronze' then 5 when 'silber' then 10 else 18 end else 0 end
         end), 0),
         exists (select 1 from player_club_history h where h.player_id = p.id and h.club_id = e.club_id and h.to_date is null)
    from exercise_entries e join players p on p.id = e.player_id
   where e.team_id = p_team and (is_club_staff(e.club_id) or is_platform_admin())
   group by p.id, p.nickname, e.club_id
   order by 6 desc, p.nickname;
$$;
revoke execute on function club_history_players(uuid) from public, anon;

-- Vereinshistorie eines Spielers (für Eltern/Spieler): alle Vereine und Teams mit Zeitraum
create or replace function my_club_history(p_player uuid)
returns table (club_name text, team_name text, season text, age_group text, from_date date, to_date date, jersey_number int)
language sql stable security definer set search_path = public as $$
  select c.name, t.name, t.season, t.age_group, m.from_date, m.to_date, m.jersey_number
    from team_members m join teams t on t.id = m.team_id join clubs c on c.id = t.club_id
   where m.player_id = p_player and m.status = 'approved' and is_player_owner(p_player)
   order by m.from_date desc;
$$;
revoke execute on function my_club_history(uuid) from public, anon;

-- Vereins-Admin darf über die Funktionen Teams archivieren; direkte Änderungen bleiben geschützt
create or replace function protect_team() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.club_id, new.join_code, new.created_by, new.season)
     is distinct from (old.club_id, old.join_code, old.created_by, old.season)
     and not is_platform_admin() then
    raise exception 'Verein, Saison und Code eines Teams können nicht geändert werden.';
  end if;
  if old.active = false and new.active = true and not is_platform_admin() then
    raise exception 'Ein archiviertes Team kann nicht reaktiviert werden. Bitte ein neues Team anlegen.';
  end if;
  return new;
end $$;
revoke execute on function protect_team() from public, anon, authenticated;

-- Vereinsmitgliedschaften: Abmelden über club_remove_trainer erlaubt das Setzen von valid_to
create or replace function protect_club_membership() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if is_platform_admin() then return new; end if;
  if (new.club_id, new.user_id, new.role, new.valid_from, new.created_at, new.is_nlz, new.license)
     is distinct from (old.club_id, old.user_id, old.role, old.valid_from, old.created_at, old.is_nlz, old.license) then
    raise exception 'Verein, Person und Rolle einer Mitgliedschaft können nicht geändert werden.';
  end if;
  if new.valid_to is distinct from old.valid_to and coalesce(current_setting('kick.club_admin', true), '') <> 'on' then
    raise exception 'Abmelden bitte über die Vereins-Administration.';
  end if;
  if new.user_id = auth.uid() and new.status is distinct from old.status then
    raise exception 'Die eigene Freigabe kann man nicht selbst ändern.';
  end if;
  if new.status is distinct from old.status then new.approved_by := auth.uid(); end if;
  return new;
end $$;
revoke execute on function protect_club_membership() from public, anon, authenticated;

-- Übersicht für die App: aktuelle Saison anzeigen
create or replace function app_current_season() returns text
language sql stable set search_path = public as $$ select current_season(); $$;

-- Vereinswechsel: Wird ein Spieler in einem Team eines anderen Vereins aufgenommen, enden die aktiven
-- Mitgliedschaften im alten Verein automatisch. Der alte Verein behält seine Historie (Snapshots).
create or replace function sync_club_history() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') and new.to_date is null then
    select club_id into cid from teams where id = new.team_id;
    -- Mitgliedschaften in anderen Vereinen beenden
    update team_members tm set to_date = current_date
      from teams t
     where t.id = tm.team_id and tm.player_id = new.player_id and t.club_id <> cid and tm.to_date is null;
    -- Vereinshistorie fortschreiben
    if not exists (select 1 from player_club_history where player_id = new.player_id and club_id = cid and to_date is null) then
      update player_club_history set to_date = current_date where player_id = new.player_id and to_date is null;
      insert into player_club_history (player_id, club_id, team_name, jersey_number, created_by)
      values (new.player_id, cid, (select name from teams where id = new.team_id), new.jersey_number, auth.uid());
    end if;
  end if;
  return new;
end $$;
revoke execute on function sync_club_history() from public, anon, authenticated;
drop trigger team_members_sync_history on team_members;
create trigger team_members_sync_history after insert or update on team_members
  for each row execute function sync_club_history();
