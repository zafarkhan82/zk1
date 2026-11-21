-- Go4Pro – Umsetzung der Prüfung (Sicherheit, Freigabe-Modell, Ranglisten ab C, Vereinslizenz, Trainer)
--
-- Neues Freigabe-Modell:
--  * Bronze: selbst erfasst, keine Trainer-Freigabe nötig.
--  * Silber/Gold (Premium): Der Team-Trainer wird automatisch zugeordnet und gibt Einträge gesammelt
--    in der App frei (trainer_review_entries). Spielerseite gilt als bestätigt, wenn Eltern bzw. der
--    Spieler selbst eintragen; Einträge des Trainers bestätigen Eltern in der App.
--  * Ob ein Ziel erreicht ist, berechnet die Datenbank (Zielwerte je Altersklasse in exercises.base).

-- ───────────────────────── Hilfsfunktionen ─────────────────────────

create or replace function season_start_year() returns int
language sql stable set search_path = public as $$
  select case when extract(month from (now() at time zone 'Europe/Berlin')) >= 7
              then extract(year from (now() at time zone 'Europe/Berlin'))::int
              else extract(year from (now() at time zone 'Europe/Berlin'))::int - 1 end;
$$;

create or replace function u_class(p_birth_year int) returns int
language sql stable set search_path = public as $$ select season_start_year() + 1 - p_birth_year; $$;

create or replace function age_group(p_birth_year int) returns text
language sql stable set search_path = public as $$
  select case
    when u_class(p_birth_year) between 10 and 11 then 'E'
    when u_class(p_birth_year) between 12 and 13 then 'D'
    when u_class(p_birth_year) between 14 and 15 then 'C'
    when u_class(p_birth_year) between 16 and 17 then 'B'
    when u_class(p_birth_year) between 18 and 19 then 'A'
  end;
$$;

create or replace function group_index(p_group text) returns int
language sql immutable as $$ select array_position(array['E','D','C','B','A'], p_group); $$;

-- Ist der aufrufende Nutzer Elternteil bzw. der Spieler selbst?
create or replace function is_player_owner(p_player uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from players where id = p_player
                  and (guardian_user_id = auth.uid() or own_user_id = auth.uid()));
$$;

-- Zuständige*r Trainer*in eines Spielers (nicht Elternteil/Spieler selbst)
create or replace function team_trainer_for(p_player uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select s.user_id
    from team_members m
    join team_staff s on s.team_id = m.team_id and s.status = 'approved' and s.to_date is null
    join players p on p.id = m.player_id
   where m.player_id = p_player and m.status = 'approved' and m.to_date is null
     and s.user_id is distinct from p.guardian_user_id and s.user_id is distinct from p.own_user_id
   order by s.created_at
   limit 1;
$$;

-- Zielwert aus exercises.base: {"E":[b,s,g], ...}
create or replace function exercise_target(p_exercise text, p_group text, p_level level) returns numeric
language sql stable set search_path = public as $$
  select (base -> p_group ->> (case p_level when 'bronze' then 0 when 'silber' then 1 else 2 end))::numeric
    from exercises where id = p_exercise;
$$;

create or replace function compute_achieved(p_player uuid, p_exercise text, p_level level, p_value numeric) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  ex exercises;
  grp text;
  target numeric;
begin
  select * into ex from exercises where id = p_exercise;
  if ex.measure = 'check' or p_value is null then return false; end if;
  select age_group(birth_year) into grp from players where id = p_player;
  target := exercise_target(p_exercise, grp, p_level);
  if target is null then return false; end if;
  return case when ex.lower_is_better then p_value <= target else p_value >= target end;
end $$;

-- ───────────────────────── Vereinslizenz & Premium ─────────────────────────

create table club_licenses (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs (id),
  valid_from timestamptz not null default now(),
  valid_until timestamptz not null,
  reference text,
  amount_cents int,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);
alter table club_licenses enable row level security;
create policy "Lizenzen lesen" on club_licenses for select using (is_club_staff(club_id) or is_platform_admin());
create trigger club_licenses_audit after insert or update on club_licenses for each row execute function audit_trigger();
create trigger club_licenses_no_delete before delete on club_licenses for each row execute function forbid_delete();

create or replace function club_has_license(p_club uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from club_licenses where club_id = p_club and valid_from <= now() and valid_until > now());
$$;

create or replace function is_premium(p_player uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from subscriptions
                  where player_id = p_player and status in ('active', 'canceled') and valid_until > now())
      or exists (select 1 from team_members m join teams t on t.id = m.team_id
                  where m.player_id = p_player and m.status = 'approved' and m.to_date is null
                    and club_has_license(t.club_id));
$$;
-- is_premium wird von der öffentlichen Ranglisten-Sicht aufgerufen (Ausführung als aufrufende Rolle),
-- new_player_code als Spalten-Standardwert beim Anlegen eines Spielers – daher nur für anon gesperrt, wo möglich.
revoke execute on function new_player_code() from public, anon;
grant execute on function new_player_code() to authenticated;

create or replace function grant_club_license(p_club uuid, p_months int, p_reference text default null, p_amount_cents int default null)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  base timestamptz;
  until_ts timestamptz;
begin
  if not is_platform_admin() then raise exception 'Nur für Admins.'; end if;
  if p_months not between 1 and 36 then raise exception 'Laufzeit 1–36 Monate.'; end if;
  select greatest(now(), coalesce(max(valid_until), now())) into base from club_licenses where club_id = p_club;
  until_ts := base + make_interval(months => p_months);
  insert into club_licenses (club_id, valid_until, reference, amount_cents, created_by)
  values (p_club, until_ts, p_reference, p_amount_cents, auth.uid());
  return until_ts;
end $$;
revoke execute on function grant_club_license(uuid, int, text, int) from public, anon;

-- ───────────────────────── K1: Spieler & Teammitglieder schützen ─────────────────────────

drop policy "Spieler pflegen" on players;
create policy "Spieler pflegen" on players for update
  using (guardian_user_id = auth.uid() or own_user_id = auth.uid() or is_platform_admin());

create or replace function protect_player_identity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('kick.anonymizing', true), '') = 'on' then return new; end if;
  if (new.guardian_user_id, new.own_user_id, new.code, new.created_at)
     is distinct from (old.guardian_user_id, old.own_user_id, old.code, old.created_at)
     and not is_platform_admin() then
    raise exception 'Konto-Zuordnung und Spieler-Code können nicht geändert werden.';
  end if;
  return new;
end $$;
revoke execute on function protect_player_identity() from public, anon, authenticated;
create trigger players_protect_identity before update on players for each row execute function protect_player_identity();

-- H6: Eigenes Konto erst ab 16 (Jahrgang konservativ: mindestens 17 im laufenden Kalenderjahr)
create or replace function check_player_age() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.own_user_id is not null
     and extract(year from (now() at time zone 'Europe/Berlin'))::int - new.birth_year < 17 then
    raise exception 'Ein eigenes Konto ist erst ab 16 Jahren möglich. Bitte über ein Elternkonto anlegen.';
  end if;
  if age_group(new.birth_year) is null and tg_op = 'INSERT' then
    raise exception 'Go4Pro ist für die E- bis A-Jugend gedacht.';
  end if;
  return new;
end $$;
revoke execute on function check_player_age() from public, anon, authenticated;
create trigger players_check_age before insert or update of birth_year, own_user_id on players
  for each row execute function check_player_age();

create or replace function protect_team_member() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.player_id, new.team_id, new.from_date, new.created_at)
     is distinct from (old.player_id, old.team_id, old.from_date, old.created_at) then
    raise exception 'Spieler und Team einer Mitgliedschaft können nicht geändert werden.';
  end if;
  if new.status is distinct from old.status then new.approved_by := auth.uid(); end if;
  return new;
end $$;
revoke execute on function protect_team_member() from public, anon, authenticated;
create trigger team_members_protect before update on team_members for each row execute function protect_team_member();

create or replace function protect_team_staff() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.user_id, new.team_id, new.from_date) is distinct from (old.user_id, old.team_id, old.from_date) then
    raise exception 'Trainer und Team können nicht geändert werden.';
  end if;
  return new;
end $$;
revoke execute on function protect_team_staff() from public, anon, authenticated;
create trigger team_staff_protect before update on team_staff for each row execute function protect_team_staff();

-- Mittel: Team darf nicht in einen anderen Verein wandern; Challenge-Eckdaten fix
create or replace function protect_team() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.club_id, new.join_code, new.created_by) is distinct from (old.club_id, old.join_code, old.created_by)
     and not is_platform_admin() then
    raise exception 'Verein und Code eines Teams können nicht geändert werden.';
  end if;
  return new;
end $$;
revoke execute on function protect_team() from public, anon, authenticated;
create trigger teams_protect before update on teams for each row execute function protect_team();

create or replace function protect_challenge() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.exercise_id, new.level, new.scope, new.team_id, new.club_id, new.association, new.starts_at, new.ends_at, new.created_by)
     is distinct from (old.exercise_id, old.level, old.scope, old.team_id, old.club_id, old.association, old.starts_at, old.ends_at, old.created_by)
     and not is_platform_admin() then
    raise exception 'Eckdaten einer Challenge können nach dem Anlegen nicht geändert werden.';
  end if;
  return new;
end $$;
revoke execute on function protect_challenge() from public, anon, authenticated;
create trigger challenges_protect before update on challenges for each row execute function protect_challenge();

-- Profil-E-Mail und Rolle schützen
create or replace function protect_profile_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not exists (select 1 from profiles where id = auth.uid() and role = 'platform_admin') then
    if new.role is distinct from old.role then raise exception 'Rollen dürfen nur Plattform-Admins ändern.'; end if;
    if new.email is distinct from old.email then raise exception 'Die E-Mail-Adresse wird über die Anmeldung verwaltet.'; end if;
  end if;
  return new;
end $$;
revoke execute on function protect_profile_role() from public, anon, authenticated;

-- ───────────────────────── H1: Team-Codes nicht öffentlich ─────────────────────────

revoke select on teams from anon, authenticated;
grant select (id, club_id, name, age_group, season, active, created_by, created_at) on teams to anon, authenticated;

create or replace function team_join_code(p_team uuid) returns text
language sql stable security definer set search_path = public as $$
  select join_code from teams where id = p_team and is_team_staff(p_team);
$$;
revoke execute on function team_join_code(uuid) from public, anon;

-- ───────────────────────── Übungseinträge: Anlegen ─────────────────────────

drop trigger exercise_entries_insert on exercise_entries;
drop trigger if exists exercise_entries_premium_update on exercise_entries;

create or replace function exercise_entry_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ex exercises;
  grp text;
  owner_insert boolean;
  trainer_insert boolean;
begin
  select * into ex from exercises where id = new.exercise_id;
  if not found or not ex.active then raise exception 'Diese Übung gibt es nicht (mehr).'; end if;
  select age_group(birth_year) into grp from players where id = new.player_id;
  if grp is null or group_index(grp) < group_index(ex.min_group) then
    raise exception 'Diese Übung ist für eine ältere Altersklasse gedacht.';
  end if;
  if ex.measure <> 'check' and (new.value is null or new.value < 0) then
    raise exception 'Bitte ein gültiges Ergebnis eintragen.';
  end if;
  if ex.measure = 'check' then new.value := null; end if;

  owner_insert := is_player_owner(new.player_id);
  trainer_insert := not owner_insert and is_trainer_of(new.player_id);

  new.created_by := auth.uid();
  new.version := 1;
  new.status := 'pending';
  new.created_at := now();
  new.updated_at := now();
  new.achieved := compute_achieved(new.player_id, new.exercise_id, new.level, new.value);
  new.player_confirmed_at := case when owner_insert then now() end;
  new.trainer_user_id := null;
  new.trainer_confirmed_at := null;

  if trainer_insert then
    -- Sammelerfassung durch den Trainer: Trainerseite ist bestätigt, Eltern bestätigen in der App
    new.trainer_user_id := auth.uid();
    new.trainer_confirmed_at := now();
  elsif new.level in ('silber', 'gold') then
    new.trainer_user_id := team_trainer_for(new.player_id);
  end if;
  return new;
end $$;
revoke execute on function exercise_entry_before_insert() from public, anon, authenticated;
create trigger exercise_entries_insert before insert on exercise_entries
  for each row execute function exercise_entry_before_insert();

-- Premium-Prüfung (nach dem Anlegen-Trigger, alphabetische Reihenfolge)
create or replace function check_entry_premium() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.level in ('silber', 'gold') and not is_premium(new.player_id) then
    raise exception 'Silber und Gold sind Premium. Bitte zuerst Premium freischalten.';
  end if;
  return new;
end $$;
revoke execute on function check_entry_premium() from public, anon, authenticated;

-- ───────────────────────── Übungseinträge: Ändern (H2/H3/K2) ─────────────────────────

create or replace function exercise_entry_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  confirming boolean := coalesce(current_setting('kick.confirming', true), '') = 'on';
begin
  if coalesce(current_setting('kick.anonymizing', true), '') = 'on' then return new; end if;

  -- Unveränderlich
  new.id := old.id;
  new.player_id := old.player_id;
  new.exercise_id := old.exercise_id;
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  new.club_id := old.club_id;
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
    -- Wer ändert, bestätigt seine Seite neu; die Gegenseite muss neu freigeben
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
drop trigger exercise_entries_window on exercise_entries;
create trigger exercise_entries_window before update on exercise_entries
  for each row execute function exercise_entry_before_update();

-- Spiel-Einsätze: unveränderliche Felder fixieren (H2)
create or replace function entry_edit_window() returns trigger
language plpgsql set search_path = public as $$
declare
  ignore_cols text[] := array['status','player_confirmed_at','trainer_confirmed_at','updated_at','version'];
begin
  if coalesce(current_setting('kick.anonymizing', true), '') = 'on' then return new; end if;
  new.id := old.id;
  new.match_id := old.match_id;
  new.player_id := old.player_id;
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  if (new.status, new.player_confirmed_at, new.trainer_confirmed_at, new.version)
     is distinct from (old.status, old.player_confirmed_at, old.trainer_confirmed_at, old.version)
     and coalesce(current_setting('kick.confirming', true), '') <> 'on' then
    raise exception 'Bestätigungen laufen nur über die Freigabe-Funktionen.';
  end if;
  if (to_jsonb(new) - ignore_cols) is distinct from (to_jsonb(old) - ignore_cols) then
    if now() > old.created_at + interval '12 hours' then
      raise exception 'Änderungen sind nur innerhalb von 12 Stunden nach dem Eintragen möglich.';
    end if;
    new.version := old.version + 1;
    new.status := 'pending';
    new.player_confirmed_at := null;
    new.trainer_confirmed_at := null;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function entry_edit_window() from public, anon, authenticated;

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
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function diary_edit_window() from public, anon, authenticated;

-- ───────────────────────── Freigaben (Sammel-Freigabe) ─────────────────────────

-- Offene Freigaben für den angemeldeten Trainer
create or replace function trainer_pending_reviews()
returns table (entry_id uuid, player_id uuid, nickname text, team_name text, exercise_id text, level level,
               value numeric, achieved boolean, note text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select e.id, e.player_id, p.nickname, t.name, e.exercise_id, e.level, e.value, e.achieved, e.note, e.created_at
    from exercise_entries e
    join players p on p.id = e.player_id
    left join team_members m on m.player_id = e.player_id and m.status = 'approved' and m.to_date is null
    left join teams t on t.id = m.team_id
   where e.status = 'pending' and e.trainer_confirmed_at is null and e.trainer_user_id = auth.uid()
     and p.anonymized_at is null
   order by e.created_at;
$$;
revoke execute on function trainer_pending_reviews() from public, anon;

create or replace function trainer_review_entries(p_ids uuid[], p_accept boolean) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int := 0;
  e exercise_entries;
begin
  perform set_config('kick.confirming', 'on', true);
  for e in select * from exercise_entries where id = any(p_ids) and status = 'pending'
             and trainer_confirmed_at is null and trainer_user_id = auth.uid() for update
  loop
    if not is_trainer_of(e.player_id) then continue; end if;
    if p_accept then
      update exercise_entries
         set trainer_confirmed_at = now(),
             achieved = case when (select measure from exercises where id = e.exercise_id) = 'check' then true else achieved end,
             status = case when player_confirmed_at is not null then 'confirmed'::entry_status else status end
       where id = e.id;
    else
      update exercise_entries set status = 'rejected' where id = e.id;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function trainer_review_entries(uuid[], boolean) from public, anon;

-- Eltern bestätigen Einträge, die der Trainer erfasst hat
create or replace function player_confirm_entries(p_ids uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  perform set_config('kick.confirming', 'on', true);
  update exercise_entries
     set player_confirmed_at = now(),
         status = case when trainer_confirmed_at is not null then 'confirmed'::entry_status else status end
   where id = any(p_ids) and status = 'pending' and player_confirmed_at is null and is_player_owner(player_id);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function player_confirm_entries(uuid[]) from public, anon;

-- Alte Einzelanfrage bleibt kompatibel, setzt aber nie den Anfragenden selbst als Trainer (H3)
create or replace function request_trainer_confirmation(p_entry uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  e exercise_entries;
  trainer uuid;
begin
  select * into e from exercise_entries where id = p_entry;
  if not found or not is_player_owner(e.player_id) then raise exception 'Nur für eigene Einträge.'; end if;
  if not is_premium(e.player_id) then raise exception 'Trainer-Freigaben sind eine Premium-Funktion.'; end if;
  if e.trainer_user_id is not null then return e.trainer_user_id; end if;
  trainer := team_trainer_for(e.player_id);
  if trainer is null then raise exception 'Kein freigeschalteter Trainer im Team. Tritt zuerst einem Team bei.'; end if;
  perform set_config('kick.confirming', 'on', true);
  update exercise_entries set trainer_user_id = trainer where id = p_entry;
  return trainer;
end $$;

-- Token-Bestätigung: Links laufen nach 14 Tagen ab
create or replace function confirm_by_token(p_token text, p_accept boolean default true)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  c confirmations;
  cur_version int;
begin
  select * into c from confirmations where token_hash = encode(digest(p_token, 'sha256'), 'hex');
  if not found then return 'unbekannt'; end if;
  if c.confirmed_at is not null or c.rejected_at is not null then return 'bereits_erledigt'; end if;
  if c.created_at < now() - interval '14 days' then return 'abgelaufen'; end if;
  execute format('select version from %I where id = $1', c.entity_table) into cur_version using c.entity_id;
  if cur_version is distinct from c.entity_version then return 'veraltet'; end if;
  perform set_config('kick.confirming', 'on', true);
  if not p_accept then
    update confirmations set rejected_at = now() where id = c.id;
    execute format('update %I set status = ''rejected'' where id = $1', c.entity_table) using c.entity_id;
    return 'abgelehnt';
  end if;
  update confirmations set confirmed_at = now() where id = c.id;
  execute format(
    'update %I set %I = now(),
       status = case when coalesce(player_confirmed_at, case when $2 = ''player'' then now() end) is not null
                      and coalesce(trainer_confirmed_at, case when $2 = ''trainer'' then now() end) is not null
                     then ''confirmed''::entry_status else status end
     where id = $1',
    c.entity_table, c.role || '_confirmed_at')
  using c.entity_id, c.role::text;
  return 'bestaetigt';
end $$;

-- ───────────────────────── H4: Bewertungen & Spiele ─────────────────────────

-- Bewertungen durch Mitspieler und Gegner sind abgeschaltet (Mobbing-Schutz)
create or replace function check_peer_rating() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'Bewertungen durch Mitspieler und Gegner sind deaktiviert.';
end $$;
revoke execute on function check_peer_rating() from public, anon, authenticated;

-- Höchstens eine Trainer-Bewertung pro Spieler, Trainer und Monat bzw. Spiel
create unique index trainer_ratings_once_per_match on trainer_ratings (player_id, trainer_user_id, match_id) where match_id is not null;
create unique index trainer_ratings_once_per_month on trainer_ratings
  (player_id, trainer_user_id, (date_trunc('month', created_at at time zone 'UTC'))) where match_id is null;

-- Einzelbewertungen sehen nur der/die bewertende Trainer*in und Admins
drop policy "Trainer-Bewertungen lesen" on trainer_ratings;
create policy "Trainer-Bewertungen lesen" on trainer_ratings for select
  using (trainer_user_id = auth.uid() or is_platform_admin());

create or replace function my_rating_summary(p_player uuid)
returns table (quelle text, anzahl bigint, technik numeric, taktik numeric, athletik numeric, einsatz numeric, fairplay numeric)
language sql stable security definer set search_path = public as $$
  select 'trainer', count(*), round(avg(technik)), round(avg(taktik)), round(avg(athletik)), round(avg(einsatz)), round(avg(fairplay))
    from trainer_ratings where player_id = p_player and can_manage_player(p_player) having count(*) >= 3;
$$;

create or replace function protect_match() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.kickoff, new.club_id, new.team_id, new.created_by, new.created_at)
     is distinct from (old.kickoff, old.club_id, old.team_id, old.created_by, old.created_at)
     and not is_platform_admin() then
    raise exception 'Datum, Verein und Team eines Spiels können nicht geändert werden.';
  end if;
  return new;
end $$;
revoke execute on function protect_match() from public, anon, authenticated;
create trigger matches_protect before update on matches for each row execute function protect_match();

create or replace function check_match_appearance() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m matches;
begin
  select * into m from matches where id = new.match_id;
  if m.team_id is null or not exists (
       select 1 from team_members where team_id = m.team_id and player_id = new.player_id
          and status = 'approved' and to_date is null) then
    raise exception 'Nur bestätigte Mitglieder dieses Teams können eingetragen werden.';
  end if;
  return new;
end $$;
revoke execute on function check_match_appearance() from public, anon, authenticated;
create trigger match_appearances_check before insert on match_appearances
  for each row execute function check_match_appearance();

-- ───────────────────────── K2: Anonymisieren ─────────────────────────

create or replace function anonymize_player(p_player uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Nur Plattform-Admins dürfen anonymisieren.'; end if;
  perform set_config('kick.anonymizing', 'on', true);
  update players
     set nickname = 'Anonym-' || left(id::text, 6),
         public_consent_at = null,
         preferred_position = null,
         anonymized_at = now()
   where id = p_player;
  update exercise_entries set note = null where player_id = p_player;
  update diary_entries set good = null, improve = null where player_id = p_player;
  update audit_log set old_data = null, new_data = null
   where (table_name = 'players' and row_id = p_player::text)
      or (table_name in ('exercise_entries', 'diary_entries', 'team_members', 'match_appearances', 'player_club_history')
          and coalesce(new_data, old_data) ->> 'player_id' = p_player::text);
end $$;
revoke execute on function anonymize_player(uuid) from public, anon;

-- ───────────────────────── Ranglisten erst ab C-Jugend ─────────────────────────

create or replace view public_players as
select p.id, p.nickname, p.birth_year, p.preferred_position,
       h.club_id, c.name as club_name, c.city, c.association, h.jersey_number
  from players p
  left join player_club_history h on h.player_id = p.id and h.to_date is null
  left join clubs c on c.id = h.club_id
 where p.public_consent_at is not null and p.anonymized_at is null and is_premium(p.id)
   and u_class(p.birth_year) >= 14;

-- ───────────────────────── Zahlungsauftrag: nur eigener Spieler (Niedrig) ─────────────────────────

create or replace function create_payment_order(p_player uuid)
returns table (reference text, amount_cents int, status order_status, created_at timestamptz,
               bank_holder text, bank_iban text, bank_bic text, bank_name text, player_code text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  pl players;
  ref text;
  price int;
begin
  select * into pl from players where id = p_player
     and (guardian_user_id = auth.uid() or own_user_id = auth.uid());
  if not found then raise exception 'Nur für eigene Spieler.'; end if;
  ref := 'G4P-' || pl.code || '-' || to_char(now() at time zone 'Europe/Berlin', 'MMYYYY');
  select coalesce(nullif(value, '')::int, 2000) into price from app_settings where key = 'premium_price_cents';
  insert into payment_orders (player_id, payer_user_id, reference, amount_cents)
  values (pl.id, auth.uid(), ref, price)
  on conflict on constraint payment_orders_reference_key do nothing;
  if not exists (select 1 from payment_orders o where o.reference = ref and o.player_id = pl.id) then
    raise exception 'Verwendungszweck ist bereits vergeben. Bitte Support kontaktieren.';
  end if;
  return query
    select o.reference, o.amount_cents, o.status, o.created_at,
           (select value from app_settings where key = 'bank_holder'),
           (select value from app_settings where key = 'bank_iban'),
           (select value from app_settings where key = 'bank_bic'),
           (select value from app_settings where key = 'bank_name'),
           pl.code
      from payment_orders o where o.reference = ref and o.player_id = pl.id;
end $$;
revoke execute on function create_payment_order(uuid) from public, anon;

-- ───────────────────────── Wochen-Challenges: Einlösen online ─────────────────────────

create table challenge_claims (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id),
  week text not null,
  challenge_id text not null,
  xp int not null check (xp between 0 and 100),
  created_by uuid not null references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (player_id, week, challenge_id)
);
alter table challenge_claims enable row level security;
create policy "Claims lesen" on challenge_claims for select using (can_manage_player(player_id) or is_platform_admin());
create policy "Claims anlegen" on challenge_claims for insert with check (is_player_owner(player_id) and created_by = auth.uid());
create trigger challenge_claims_no_delete before delete on challenge_claims for each row execute function forbid_delete();

-- ───────────────────────── Trainer- und Vereinsverwaltung ─────────────────────────

-- Neuen Verein vorschlagen: Verein (wartend) + Vereins-Admin-Antrag des Vorschlagenden
create or replace function request_club(p_name text, p_city text, p_postal text, p_association text, p_dfb_number text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
begin
  if auth.uid() is null then raise exception 'Bitte anmelden.'; end if;
  if length(trim(coalesce(p_name, ''))) < 3 then raise exception 'Bitte den Vereinsnamen angeben.'; end if;
  insert into clubs (name, city, postal_code, association, dfb_club_number, created_by)
  values (trim(p_name), nullif(trim(p_city), ''), nullif(trim(p_postal), ''), nullif(trim(p_association), ''),
          nullif(trim(p_dfb_number), ''), auth.uid())
  returning id into cid;
  insert into club_memberships (club_id, user_id, role) values (cid, auth.uid(), 'club_admin');
  return cid;
end $$;
revoke execute on function request_club(text, text, text, text, text) from public, anon;

-- Als Trainer einem bestehenden (freigegebenen) Verein beitreten
create or replace function request_club_membership(p_club uuid, p_license text, p_is_nlz boolean)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  mid uuid;
begin
  if not exists (select 1 from clubs where id = p_club and status = 'approved') then
    raise exception 'Verein nicht gefunden.';
  end if;
  if exists (select 1 from club_memberships where club_id = p_club and user_id = auth.uid() and status <> 'rejected'
               and (valid_to is null or valid_to >= current_date)) then
    raise exception 'Du hast für diesen Verein schon einen Antrag oder eine Freigabe.';
  end if;
  insert into club_memberships (club_id, user_id, role, license, is_nlz)
  values (p_club, auth.uid(), 'trainer', nullif(trim(p_license), ''), coalesce(p_is_nlz, false))
  returning id into mid;
  return mid;
end $$;
revoke execute on function request_club_membership(uuid, text, boolean) from public, anon;

-- Meine Vereine und Teams (für den Trainer-Bereich)
create or replace function my_staff_overview()
returns table (club_id uuid, club_name text, club_status approval_status, role membership_role,
               membership_status approval_status, team_id uuid, team_name text, age_group text, season text,
               join_code text, pending_members bigint, license_until timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.status, cm.role, cm.status, t.id, t.name, t.age_group, t.season,
         case when t.id is not null and is_team_staff(t.id) then t.join_code end,
         (select count(*) from team_members m where m.team_id = t.id and m.status = 'pending' and m.to_date is null),
         (select max(valid_until) from club_licenses l where l.club_id = c.id and l.valid_until > now())
    from club_memberships cm
    join clubs c on c.id = cm.club_id
    left join teams t on t.club_id = c.id and t.active
         and (cm.role = 'club_admin' or exists (select 1 from team_staff s where s.team_id = t.id and s.user_id = auth.uid() and s.to_date is null))
   where cm.user_id = auth.uid() and (cm.valid_to is null or cm.valid_to >= current_date)
   order by c.name, t.name;
$$;
revoke execute on function my_staff_overview() from public, anon;

-- Team anlegen: Ersteller wird automatisch freigeschalteter Trainer des Teams
create or replace function create_team(p_club uuid, p_name text, p_age_group text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  tid uuid;
  season text := season_start_year() || '/' || right((season_start_year() + 1)::text, 2);
begin
  if not is_club_staff(p_club) then raise exception 'Nur freigeschaltete Trainer des Vereins.'; end if;
  if p_age_group not in ('E', 'D', 'C', 'B', 'A') then raise exception 'Ungültige Altersklasse.'; end if;
  insert into teams (club_id, name, age_group, season, created_by)
  values (p_club, trim(p_name), p_age_group, season, auth.uid()) returning id into tid;
  insert into team_staff (team_id, user_id, status, approved_by) values (tid, auth.uid(), 'approved', auth.uid());
  return tid;
end $$;
revoke execute on function create_team(uuid, text, text) from public, anon;

-- Offene Beitrittsanfragen der eigenen Teams
create or replace function team_member_requests(p_team uuid)
returns table (member_id uuid, player_id uuid, nickname text, birth_year int, status approval_status,
               jersey_number int, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.id, p.id, p.nickname, p.birth_year, m.status, m.jersey_number, m.created_at
    from team_members m join players p on p.id = m.player_id
   where m.team_id = p_team and m.to_date is null and is_team_staff(p_team) and p.anonymized_at is null
   order by m.status, p.nickname;
$$;
revoke execute on function team_member_requests(uuid) from public, anon;

-- Vereins-Admin: offene Trainer-Anträge
create or replace function club_trainer_requests(p_club uuid)
returns table (membership_id uuid, display_name text, email text, license text, is_nlz boolean, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select cm.id, pr.display_name, pr.email, cm.license, cm.is_nlz, cm.created_at
    from club_memberships cm join profiles pr on pr.id = cm.user_id
   where cm.club_id = p_club and cm.status = 'pending' and (is_club_admin(p_club) or is_platform_admin());
$$;
revoke execute on function club_trainer_requests(uuid) from public, anon;

-- Plattform-Admin: Vereine freigeben (inkl. Antrag des Vereins-Admins)
create or replace function admin_pending_clubs()
returns table (club_id uuid, name text, city text, association text, dfb_club_number text, requested_by text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.city, c.association, c.dfb_club_number, pr.email, c.created_at
    from clubs c left join profiles pr on pr.id = c.created_by
   where c.status = 'pending' and is_platform_admin()
   order by c.created_at;
$$;
revoke execute on function admin_pending_clubs() from public, anon;

create or replace function admin_review_club(p_club uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Nur für Admins.'; end if;
  update clubs set status = case when p_accept then 'approved'::approval_status else 'rejected'::approval_status end,
                   approved_by = auth.uid()
   where id = p_club and status = 'pending';
  update club_memberships set status = case when p_accept then 'approved'::approval_status else 'rejected'::approval_status end,
                              approved_by = auth.uid()
   where club_id = p_club and role = 'club_admin' and status = 'pending';
end $$;
revoke execute on function admin_review_club(uuid, boolean) from public, anon;

create or replace function admin_clubs()
returns table (club_id uuid, name text, city text, license_until timestamptz, teams bigint, players bigint)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.city,
         (select max(valid_until) from club_licenses l where l.club_id = c.id),
         (select count(*) from teams t where t.club_id = c.id and t.active),
         (select count(distinct m.player_id) from team_members m join teams t on t.id = m.team_id
           where t.club_id = c.id and m.status = 'approved' and m.to_date is null)
    from clubs c where c.status = 'approved' and is_platform_admin() order by c.name;
$$;
revoke execute on function admin_clubs() from public, anon;

-- Freigabe von Teammitgliedern setzt den Spieler auch in die Vereinshistorie (Vereinswechsel dokumentiert)
create or replace function sync_club_history() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
begin
  if new.status = 'approved' and old.status is distinct from 'approved' and new.to_date is null then
    select club_id into cid from teams where id = new.team_id;
    if not exists (select 1 from player_club_history where player_id = new.player_id and club_id = cid and to_date is null) then
      update player_club_history set to_date = current_date where player_id = new.player_id and to_date is null;
      insert into player_club_history (player_id, club_id, team_name, jersey_number, created_by)
      values (new.player_id, cid, (select name from teams where id = new.team_id), new.jersey_number, auth.uid());
    end if;
  end if;
  return new;
end $$;
revoke execute on function sync_club_history() from public, anon, authenticated;
create trigger team_members_sync_history after update on team_members for each row execute function sync_club_history();

-- ───────────────────────── Indizes (Architektur) ─────────────────────────

create index if not exists exercise_entries_player_created on exercise_entries (player_id, created_at desc);
create index if not exists exercise_entries_trainer_pending on exercise_entries (trainer_user_id) where status = 'pending';
create index if not exists exercise_entries_player_status on exercise_entries (player_id, status);
create index if not exists diary_entries_player_created on diary_entries (player_id, created_at desc);
create index if not exists match_appearances_player on match_appearances (player_id);
create index if not exists team_members_player_active on team_members (player_id) where to_date is null;
create index if not exists team_members_team_active on team_members (team_id) where to_date is null;
create index if not exists team_staff_user on team_staff (user_id) where to_date is null;
create index if not exists club_memberships_user on club_memberships (user_id);
create index if not exists players_guardian on players (guardian_user_id);
create index if not exists players_own on players (own_user_id);
create index if not exists payment_orders_player on payment_orders (player_id);
