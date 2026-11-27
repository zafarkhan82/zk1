-- Anbindung fussball.de / DFBnet (offizielle API, Zugang beantragt)
--
-- Ablauf: Die Edge Function "fussballde-sync" holt Daten über die API, normalisiert sie und schreibt
-- sie in Import-Tabellen (Staging). Danach übernimmt apply_fussballde_import() die Daten in Vereine,
-- Teams und Spiele – nur Anlegen und Aktualisieren, nie Löschen. Verschwindet etwas bei fussball.de,
-- bleibt es hier erhalten und wird nur als "nicht mehr gemeldet" markiert (Historie).

-- ───────────────────────── Externe Kennungen ─────────────────────────

alter table clubs add column fussballde_id text unique;
alter table clubs add column fussballde_synced_at timestamptz;
alter table clubs add column logo_url text;
alter table clubs add column address text;

alter table teams add column fussballde_id text unique;
alter table teams add column league text;           -- Spielklasse/Staffel, z. B. "Kreisliga A"
alter table teams add column fussballde_synced_at timestamptz;

alter table matches add column fussballde_id text unique;
alter table matches add column venue text;
alter table matches add column result_source text;   -- 'fussballde' | 'manuell'
alter table matches add column fussballde_synced_at timestamptz;
alter table matches add column fussballde_missing_since timestamptz; -- bei fussball.de nicht mehr gefunden

-- ───────────────────────── Sync-Protokoll ─────────────────────────

create type sync_status as enum ('laeuft', 'ok', 'fehler', 'nicht_eingerichtet');

create table sync_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'fussball.de',
  scope text not null,                 -- 'club', 'team', 'all'
  club_id uuid references clubs (id),
  status sync_status not null default 'laeuft',
  clubs_upserted int not null default 0,
  teams_upserted int not null default 0,
  matches_upserted int not null default 0,
  message text,
  started_by uuid references profiles (id),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
alter table sync_runs enable row level security;
create policy "Sync lesen" on sync_runs for select using (is_platform_admin() or (club_id is not null and is_club_admin(club_id)));
create trigger sync_runs_no_delete before delete on sync_runs for each row execute function forbid_delete();

-- ───────────────────────── Staging (normalisierte Rohdaten) ─────────────────────────

create table import_fussballde (
  id bigint generated always as identity primary key,
  run_id uuid not null references sync_runs (id),
  kind text not null check (kind in ('club', 'team', 'match')),
  external_id text not null,
  parent_external_id text,             -- Team → Verein, Spiel → Team
  data jsonb not null,                 -- normalisiert (siehe Edge Function)
  raw jsonb,                           -- Originalantwort zur Nachvollziehbarkeit
  applied_at timestamptz,
  created_at timestamptz not null default now()
);
create index import_fussballde_run on import_fussballde (run_id, kind);
alter table import_fussballde enable row level security;
create policy "Import lesen" on import_fussballde for select using (is_platform_admin());
create trigger import_fussballde_no_delete before delete on import_fussballde for each row execute function forbid_delete();

-- ───────────────────────── Übernahme ─────────────────────────

-- Übernimmt einen Sync-Lauf. Nur INSERT/UPDATE, nie DELETE. Aufruf durch die Edge Function (Service-Rolle).
create or replace function apply_fussballde_import(p_run uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r record;
  cid uuid;
  tid uuid;
  n_clubs int := 0;
  n_teams int := 0;
  n_matches int := 0;
  season text;
  actor uuid;
begin
  -- Wer gilt als Ersteller? Der startende Admin, bei automatischen Läufen der erste Plattform-Admin.
  actor := coalesce((select started_by from sync_runs where id = p_run),
                    (select id from profiles where role = 'platform_admin' order by created_at limit 1));
  -- Vereine
  for r in select * from import_fussballde where run_id = p_run and kind = 'club' and applied_at is null loop
    insert into clubs (name, city, postal_code, association, district, fussballde_id, dfb_club_number, logo_url, address,
                       status, fussballde_synced_at)
    values (r.data->>'name', r.data->>'city', r.data->>'postal_code', r.data->>'association', r.data->>'district',
            r.external_id, nullif(r.data->>'club_number', ''), r.data->>'logo_url', r.data->>'address', 'approved', now())
    on conflict (fussballde_id) do update
       set name = excluded.name, city = coalesce(excluded.city, clubs.city), postal_code = coalesce(excluded.postal_code, clubs.postal_code),
           association = coalesce(excluded.association, clubs.association), district = coalesce(excluded.district, clubs.district),
           logo_url = coalesce(excluded.logo_url, clubs.logo_url), address = coalesce(excluded.address, clubs.address),
           fussballde_synced_at = now();
    update import_fussballde set applied_at = now() where id = r.id;
    n_clubs := n_clubs + 1;
  end loop;

  -- Teams (nur Jugend E–A; Saison aus den Daten oder aktuelle Saison)
  for r in select * from import_fussballde where run_id = p_run and kind = 'team' and applied_at is null loop
    select id into cid from clubs where fussballde_id = r.parent_external_id;
    if cid is null or coalesce(r.data->>'age_group', '') not in ('E', 'D', 'C', 'B', 'A') then
      update import_fussballde set applied_at = now() where id = r.id;
      continue;
    end if;
    season := coalesce(nullif(r.data->>'season', ''), current_season());
    insert into teams (club_id, name, age_group, season, league, fussballde_id, fussballde_synced_at, created_by)
    values (cid, r.data->>'name', r.data->>'age_group', season, r.data->>'league', r.external_id, now(), actor)
    on conflict (fussballde_id) do update
       set name = excluded.name, league = coalesce(excluded.league, teams.league), fussballde_synced_at = now();
    update import_fussballde set applied_at = now() where id = r.id;
    n_teams := n_teams + 1;
  end loop;

  -- Spiele
  for r in select * from import_fussballde where run_id = p_run and kind = 'match' and applied_at is null loop
    select id, club_id into tid, cid from teams where fussballde_id = r.parent_external_id;
    if tid is null then
      update import_fussballde set applied_at = now() where id = r.id;
      continue;
    end if;
    perform set_config('kick.sync', 'on', true);
    insert into matches (club_id, team_id, opponent, kickoff, competition, is_home, goals_for, goals_against, venue,
                         fussballde_id, result_source, fussballde_synced_at, created_by)
    values (cid, tid, r.data->>'opponent', (r.data->>'kickoff')::timestamptz, r.data->>'competition',
            coalesce((r.data->>'is_home')::boolean, true), (r.data->>'goals_for')::int, (r.data->>'goals_against')::int,
            r.data->>'venue', r.external_id, 'fussballde', now(), actor)
    on conflict (fussballde_id) do update
       set opponent = excluded.opponent, competition = coalesce(excluded.competition, matches.competition),
           goals_for = coalesce(excluded.goals_for, matches.goals_for),
           goals_against = coalesce(excluded.goals_against, matches.goals_against),
           venue = coalesce(excluded.venue, matches.venue), fussballde_synced_at = now(), fussballde_missing_since = null;
    update import_fussballde set applied_at = now() where id = r.id;
    n_matches := n_matches + 1;
  end loop;

  -- Spiele, die für synchronisierte Teams nicht mehr gemeldet wurden: nur markieren, nicht löschen
  update matches m set fussballde_missing_since = now()
   where m.fussballde_id is not null and m.fussballde_missing_since is null
     and m.team_id in (select t.id from teams t join import_fussballde i on i.external_id = t.fussballde_id
                        where i.run_id = p_run and i.kind = 'team')
     and m.fussballde_id not in (select external_id from import_fussballde where run_id = p_run and kind = 'match');

  update sync_runs set status = 'ok', clubs_upserted = n_clubs, teams_upserted = n_teams, matches_upserted = n_matches,
                       finished_at = now()
   where id = p_run;
  return jsonb_build_object('clubs', n_clubs, 'teams', n_teams, 'matches', n_matches);
end $$;
revoke execute on function apply_fussballde_import(uuid) from public, anon, authenticated;

-- Synchronisierte Spiele: Datum, Verein und Team dürfen beim Abgleich aktualisiert werden (sonst geschützt)
create or replace function protect_match() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('kick.sync', true), '') = 'on' then return new; end if;
  if (new.kickoff, new.club_id, new.team_id, new.created_by, new.created_at)
     is distinct from (old.kickoff, old.club_id, old.team_id, old.created_by, old.created_at)
     and not is_platform_admin() then
    raise exception 'Datum, Verein und Team eines Spiels können nicht geändert werden.';
  end if;
  if old.fussballde_id is not null and (new.goals_for, new.goals_against, new.opponent)
     is distinct from (old.goals_for, old.goals_against, old.opponent) and not is_platform_admin() then
    raise exception 'Ergebnisse von fussball.de werden automatisch übernommen und können nicht von Hand geändert werden.';
  end if;
  return new;
end $$;
revoke execute on function protect_match() from public, anon, authenticated;

-- Abgleich-Zeitpunkt beim Anstoß übernehmen, wenn fussball.de das Datum verschiebt
create or replace function sync_match_kickoff(p_external text, p_kickoff timestamptz) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('kick.sync', 'on', true);
  update matches set kickoff = p_kickoff where fussballde_id = p_external and kickoff is distinct from p_kickoff;
end $$;
revoke execute on function sync_match_kickoff(text, timestamptz) from public, anon, authenticated;

-- ───────────────────────── Verknüpfen (Admin / Vereins-Admin) ─────────────────────────

-- Verein mit seiner fussball.de-Vereins-ID verknüpfen
create or replace function link_club_fussballde(p_club uuid, p_external text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_club_admin(p_club);
  if exists (select 1 from clubs where fussballde_id = trim(p_external) and id <> p_club) then
    raise exception 'Diese fussball.de-ID ist bereits mit einem anderen Verein verknüpft.';
  end if;
  perform set_config('kick.sync', 'on', true);
  update clubs set fussballde_id = nullif(trim(p_external), '') where id = p_club;
end $$;
revoke execute on function link_club_fussballde(uuid, text) from public, anon;

-- Team mit seiner fussball.de-Mannschafts-ID verknüpfen
create or replace function link_team_fussballde(p_team uuid, p_external text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_club_admin((select club_id from teams where id = p_team));
  if exists (select 1 from teams where fussballde_id = trim(p_external) and id <> p_team) then
    raise exception 'Diese Mannschafts-ID ist bereits mit einem anderen Team verknüpft.';
  end if;
  update teams set fussballde_id = nullif(trim(p_external), '') where id = p_team;
end $$;
revoke execute on function link_team_fussballde(uuid, text) from public, anon;

-- Team-Schutz: fussballde_id/league dürfen sich ändern, Verein/Saison/Code nicht
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

-- Status der Anbindung für die App
create or replace function fussballde_status(p_club uuid default null)
returns table (linked_club_id text, last_sync timestamptz, last_status sync_status, last_message text,
               teams_linked bigint, matches_synced bigint)
language sql stable security definer set search_path = public as $$
  select c.fussballde_id,
         (select max(finished_at) from sync_runs s where s.club_id = c.id),
         (select status from sync_runs s where s.club_id = c.id order by started_at desc limit 1),
         (select message from sync_runs s where s.club_id = c.id order by started_at desc limit 1),
         (select count(*) from teams t where t.club_id = c.id and t.fussballde_id is not null),
         (select count(*) from matches m where m.club_id = c.id and m.fussballde_id is not null)
    from clubs c
   where c.id = p_club and (is_club_staff(p_club) or is_platform_admin());
$$;
revoke execute on function fussballde_status(uuid) from public, anon;

-- Spielplan eines Teams (für Trainer, Eltern der Mitglieder und Vereins-Staff)
create or replace function team_schedule(p_team uuid)
returns table (match_id uuid, kickoff timestamptz, opponent text, is_home boolean, competition text, venue text,
               goals_for int, goals_against int, from_fussballde boolean)
language sql stable security definer set search_path = public as $$
  select m.id, m.kickoff, m.opponent, m.is_home, m.competition, m.venue, m.goals_for, m.goals_against, m.fussballde_id is not null
    from matches m
   where m.team_id = p_team and m.fussballde_missing_since is null
     and (is_team_staff(p_team) or is_platform_admin()
          or exists (select 1 from team_members tm join players p on p.id = tm.player_id
                      where tm.team_id = p_team and tm.to_date is null and tm.status = 'approved'
                        and (p.guardian_user_id = auth.uid() or p.own_user_id = auth.uid())))
   order by m.kickoff;
$$;
revoke execute on function team_schedule(uuid) from public, anon;
