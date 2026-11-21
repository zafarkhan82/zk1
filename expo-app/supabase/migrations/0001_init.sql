-- Kick-Tagebuch – Grundschema (Phase 2)
--
-- Prinzipien:
--  * Nichts wird gelöscht. DELETE ist auf allen Fachtabellen gesperrt.
--  * Jede Änderung landet im audit_log (wer, wann, alt, neu).
--  * Einträge sind 12 Stunden nach Erstellung änderbar, danach gesperrt.
--    Eine Änderung setzt beide Bestätigungen zurück.
--  * Ein Eintrag zählt erst, wenn Spieler (bzw. Eltern) UND Trainer per E-Mail bestätigt haben.
--  * DSGVO-Löschantrag: Person wird anonymisiert (Funktion anonymize_player), Statistik bleibt.
--  * Öffentlich sichtbar sind nur Spieler mit Eltern-Zustimmung, und nur Spitzname, Jahrgang, Verein.

create extension if not exists pgcrypto;

-- ───────────────────────── Typen ─────────────────────────

create type app_role as enum ('user', 'platform_admin');
create type membership_role as enum ('trainer', 'club_admin');
create type approval_status as enum ('pending', 'approved', 'rejected');
create type entry_status as enum ('pending', 'confirmed', 'rejected');
create type level as enum ('bronze', 'silber', 'gold');
create type confirmer_role as enum ('player', 'trainer');

-- ───────────────────────── Personen ─────────────────────────

-- Ein Konto pro Erwachsenem (Eltern, Trainer) oder Spieler ab 16.
create table profiles (
  id uuid primary key references auth.users (id),
  email text not null,
  display_name text not null,
  role app_role not null default 'user',
  created_at timestamptz not null default now()
);

create table clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  dfb_club_number text unique,          -- Vereinsnummer, verhindert Duplikate
  city text,
  postal_code text,
  association text,                     -- Landesverband, z. B. "WFV"
  district text,                        -- Kreis
  country text not null default 'DE',
  status approval_status not null default 'pending',
  created_by uuid references profiles (id),
  approved_by uuid references profiles (id),
  created_at timestamptz not null default now()
);
create index clubs_search on clubs using gin (to_tsvector('german', name || ' ' || coalesce(city, '')));

-- Trainer und Vereins-Admins. Freischaltung durch Vereins- oder Plattform-Admin.
create table club_memberships (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs (id),
  user_id uuid not null references profiles (id),
  role membership_role not null default 'trainer',
  is_nlz boolean not null default false,
  license text,
  status approval_status not null default 'pending',
  approved_by uuid references profiles (id),
  valid_from date not null default current_date,
  valid_to date,
  created_at timestamptz not null default now(),
  unique (club_id, user_id, role, valid_from)
);

create table players (
  id uuid primary key default gen_random_uuid(),
  nickname text not null,
  birth_year int not null check (birth_year between 1990 and 2100),
  preferred_position text,
  guardian_user_id uuid references profiles (id),  -- Elternkonto (Pflicht unter 16)
  own_user_id uuid references profiles (id),       -- eigenes Konto ab 16
  usage_consent_at timestamptz,                    -- Eltern: Nutzung erlaubt
  public_consent_at timestamptz,                   -- Eltern: Veröffentlichung erlaubt
  anonymized_at timestamptz,
  created_at timestamptz not null default now(),
  check (guardian_user_id is not null or own_user_id is not null)
);
create index players_search on players using gin (to_tsvector('simple', nickname));

-- Vereinshistorie: ein Wechsel schließt den alten Eintrag (to_date) und öffnet einen neuen.
create table player_club_history (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id),
  club_id uuid not null references clubs (id),
  team_name text,                       -- z. B. "U12-1"
  jersey_number int check (jersey_number between 1 and 99),
  from_date date not null default current_date,
  to_date date,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);
create unique index one_active_club on player_club_history (player_id) where to_date is null;

-- ───────────────────────── Übungskatalog (administrierbar) ─────────────────────────

create table exercises (
  id text primary key,                  -- z. B. "jonglieren"
  title text not null,
  category text not null,
  emoji text,
  min_group text not null,              -- 'E'..'A'
  measure text not null,                -- count | seconds | hits | check
  unit text not null,
  lower_is_better boolean not null default false,
  no_scale boolean not null default false,
  base jsonb not null,                  -- {"bronze":10,"silber":25,"gold":50}
  content jsonb not null,               -- variant, description, steps, tips, equipment, minutes
  active boolean not null default true, -- statt Löschen: deaktivieren
  updated_at timestamptz not null default now()
);

-- ───────────────────────── Einträge ─────────────────────────

create table exercise_entries (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id),
  exercise_id text not null references exercises (id),
  club_id uuid references clubs (id),
  trainer_user_id uuid references profiles (id),
  session_id uuid,                      -- gemeinsame Team-Einheit (Sammel-Eintrag durch Trainer)
  level level not null,
  value numeric,
  achieved boolean not null,
  note text,
  version int not null default 1,
  status entry_status not null default 'pending',
  player_confirmed_at timestamptz,
  trainer_confirmed_at timestamptz,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table matches (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs (id),
  team_name text,
  opponent text not null,
  kickoff timestamptz not null,
  competition text,                     -- Liga, Pokal, Turnier, Testspiel
  is_home boolean not null default true,
  goals_for int,
  goals_against int,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table match_appearances (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches (id),
  player_id uuid not null references players (id),
  minutes int not null check (minutes between 0 and 130),
  position text,
  jersey_number int check (jersey_number between 1 and 99),
  started boolean not null default true,
  goals int not null default 0 check (goals >= 0),
  assists int not null default 0 check (assists >= 0),
  yellow_cards int not null default 0,
  red_card boolean not null default false,
  version int not null default 1,
  status entry_status not null default 'pending',
  player_confirmed_at timestamptz,
  trainer_confirmed_at timestamptz,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, player_id)
);

-- Ein Bestätigungs-Link pro Eintrag und Rolle. Im Mail-Digest stehen mehrere davon.
create table confirmations (
  id uuid primary key default gen_random_uuid(),
  entity_table text not null check (entity_table in ('exercise_entries', 'match_appearances')),
  entity_id uuid not null,
  entity_version int not null,
  role confirmer_role not null,
  email text not null,
  token_hash text not null unique,
  sent_at timestamptz,
  confirmed_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now()
);
create index confirmations_entity on confirmations (entity_table, entity_id);

-- ───────────────────────── Audit-Log ─────────────────────────

create table audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_id text not null,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  actor uuid,
  at timestamptz not null default now()
);

create or replace function audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (table_name, row_id, action, old_data, new_data, actor)
  values (
    tg_table_name,
    coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'id', '?'),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    auth.uid()
  );
  return coalesce(new, old);
end $$;

create or replace function forbid_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'Löschen ist nicht erlaubt (%). Bitte deaktivieren oder anonymisieren.', tg_table_name;
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','clubs','club_memberships','players','player_club_history','exercises',
                           'exercise_entries','matches','match_appearances','confirmations']
  loop
    execute format('create trigger %I_audit after insert or update on %I for each row execute function audit_trigger()', t, t);
    execute format('create trigger %I_no_delete before delete on %I for each row execute function forbid_delete()', t, t);
  end loop;
end $$;

-- ───────────────────────── 12-Stunden-Regel ─────────────────────────

-- Fachliche Änderungen nur innerhalb von 12 h. Jede Änderung erhöht die Version
-- und setzt beide Bestätigungen zurück (neue Bestätigungs-Mails folgen).
create or replace function entry_edit_window() returns trigger
language plpgsql as $$
declare
  changed boolean;
begin
  -- Status und Bestätigungen darf nur confirm_by_token setzen.
  if (new.status, new.player_confirmed_at, new.trainer_confirmed_at, new.version)
     is distinct from (old.status, old.player_confirmed_at, old.trainer_confirmed_at, old.version)
     and coalesce(current_setting('kick.confirming', true), '') <> 'on' then
    raise exception 'Bestätigungen sind nur über den E-Mail-Link möglich.';
  end if;
  -- Reine Statuswechsel durch das Bestätigungssystem sind immer erlaubt.
  changed := (to_jsonb(new) - array['status','player_confirmed_at','trainer_confirmed_at','updated_at','version'])
          is distinct from (to_jsonb(old) - array['status','player_confirmed_at','trainer_confirmed_at','updated_at','version']);
  if not changed then
    return new;
  end if;
  if now() > old.created_at + interval '12 hours' then
    raise exception 'Änderungen sind nur innerhalb von 12 Stunden nach dem Eintragen möglich.';
  end if;
  new.version := old.version + 1;
  new.status := 'pending';
  new.player_confirmed_at := null;
  new.trainer_confirmed_at := null;
  new.updated_at := now();
  return new;
end $$;

create trigger exercise_entries_window before update on exercise_entries
  for each row execute function entry_edit_window();
create trigger match_appearances_window before update on match_appearances
  for each row execute function entry_edit_window();

-- Neue Einträge starten immer unbestätigt.
create or replace function entry_insert_defaults() returns trigger
language plpgsql as $$
begin
  new.version := 1;
  new.status := 'pending';
  new.player_confirmed_at := null;
  new.trainer_confirmed_at := null;
  new.created_at := now();
  new.updated_at := now();
  return new;
end $$;

create trigger exercise_entries_insert before insert on exercise_entries
  for each row execute function entry_insert_defaults();
create trigger match_appearances_insert before insert on match_appearances
  for each row execute function entry_insert_defaults();

-- Rolle (Admin) nur durch Plattform-Admins änderbar.
create or replace function protect_profile_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null and not exists (
       select 1 from profiles where id = auth.uid() and role = 'platform_admin') then
    raise exception 'Rollen dürfen nur Plattform-Admins ändern.';
  end if;
  return new;
end $$;

create trigger profiles_protect_role before update on profiles
  for each row execute function protect_profile_role();

-- Zustimmungen der Eltern darf nur das Eltern- bzw. eigene Konto ändern.
create or replace function protect_consent() returns trigger
language plpgsql as $$
begin
  if (new.usage_consent_at, new.public_consent_at) is distinct from (old.usage_consent_at, old.public_consent_at)
     and auth.uid() is not null
     and auth.uid() is distinct from old.guardian_user_id
     and auth.uid() is distinct from old.own_user_id
     and coalesce(current_setting('kick.anonymizing', true), '') <> 'on' then
    raise exception 'Zustimmungen können nur Eltern bzw. der Spieler selbst ändern.';
  end if;
  return new;
end $$;

create trigger players_protect_consent before update on players
  for each row execute function protect_consent();

-- ───────────────────────── Bestätigen per Link ─────────────────────────

-- Wird von der Bestätigungsseite mit dem Klartext-Token aus der E-Mail aufgerufen.
create or replace function confirm_by_token(p_token text, p_accept boolean default true)
returns text
language plpgsql security definer set search_path = public as $$
declare
  c confirmations;
  cur_version int;
begin
  select * into c from confirmations where token_hash = encode(digest(p_token, 'sha256'), 'hex');
  if not found then return 'unbekannt'; end if;
  if c.confirmed_at is not null or c.rejected_at is not null then return 'bereits_erledigt'; end if;

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

-- ───────────────────────── DSGVO: Anonymisieren statt Löschen ─────────────────────────

create or replace function anonymize_player(p_player uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'platform_admin') then
    raise exception 'Nur Plattform-Admins dürfen anonymisieren.';
  end if;
  perform set_config('kick.anonymizing', 'on', true);
  update players
     set nickname = 'Anonym-' || left(id::text, 6),
         public_consent_at = null,
         anonymized_at = now()
   where id = p_player;
  update exercise_entries set note = null where player_id = p_player;
end $$;

-- ───────────────────────── Öffentliche Sicht & Ranglisten ─────────────────────────

create or replace view public_players as
select p.id, p.nickname, p.birth_year, p.preferred_position,
       h.club_id, c.name as club_name, c.city, c.association, h.jersey_number
  from players p
  left join player_club_history h on h.player_id = p.id and h.to_date is null
  left join clubs c on c.id = h.club_id
 where p.public_consent_at is not null and p.anonymized_at is null;

-- Punkte wie in der App: Basis je Stärkegrad, +50 % Ziel erreicht, doppelte Basis (bestätigt).
create or replace view public_rankings as
select pp.id as player_id, pp.nickname, pp.birth_year, pp.club_id, pp.club_name, pp.city, pp.association,
       coalesce(sum(
         case e.level when 'bronze' then 10 when 'silber' then 20 when 'gold' then 35 else 0 end * 2
         + case when e.achieved then case e.level when 'bronze' then 5 when 'silber' then 10 when 'gold' then 18 else 0 end else 0 end
       ), 0)::int as points,
       count(e.id) as confirmed_entries
  from public_players pp
  left join exercise_entries e on e.player_id = pp.id and e.status = 'confirmed'
 group by pp.id, pp.nickname, pp.birth_year, pp.club_id, pp.club_name, pp.city, pp.association;

create or replace view public_match_stats as
select pp.id as player_id,
       count(a.id) as matches,
       coalesce(sum(a.minutes), 0) as minutes,
       coalesce(sum(a.goals), 0) as goals,
       coalesce(sum(a.assists), 0) as assists
  from public_players pp
  left join match_appearances a on a.player_id = pp.id and a.status = 'confirmed'
 group by pp.id;

-- ───────────────────────── Hilfsfunktionen für Zugriffsregeln ─────────────────────────

create or replace function is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'platform_admin');
$$;

create or replace function is_club_staff(p_club uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from club_memberships
     where club_id = p_club and user_id = auth.uid() and status = 'approved'
       and (valid_to is null or valid_to >= current_date));
$$;

create or replace function is_club_admin(p_club uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from club_memberships
     where club_id = p_club and user_id = auth.uid() and role = 'club_admin' and status = 'approved');
$$;

create or replace function can_manage_player(p_player uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from players where id = p_player
                  and (guardian_user_id = auth.uid() or own_user_id = auth.uid()))
      or exists (select 1 from player_club_history h
                  where h.player_id = p_player and h.to_date is null and is_club_staff(h.club_id));
$$;

-- ───────────────────────── Row Level Security ─────────────────────────

alter table profiles enable row level security;
alter table clubs enable row level security;
alter table club_memberships enable row level security;
alter table players enable row level security;
alter table player_club_history enable row level security;
alter table exercises enable row level security;
alter table exercise_entries enable row level security;
alter table matches enable row level security;
alter table match_appearances enable row level security;
alter table confirmations enable row level security;
alter table audit_log enable row level security;

create policy "eigenes Profil" on profiles for select using (id = auth.uid() or is_platform_admin());
create policy "Profil anlegen" on profiles for insert with check (id = auth.uid() and role = 'user');
create policy "Profil ändern" on profiles for update using (id = auth.uid() or is_platform_admin());

create policy "Vereine lesen" on clubs for select using (status = 'approved' or created_by = auth.uid() or is_platform_admin());
create policy "Verein vorschlagen" on clubs for insert with check (created_by = auth.uid() and status = 'pending');
create policy "Verein pflegen" on clubs for update using (is_club_admin(id) or is_platform_admin());

create policy "Mitgliedschaften lesen" on club_memberships for select
  using (user_id = auth.uid() or is_club_staff(club_id) or is_platform_admin());
create policy "Trainer beantragen" on club_memberships for insert
  with check (user_id = auth.uid() and status = 'pending');
create policy "Trainer freischalten" on club_memberships for update
  using (is_club_admin(club_id) or is_platform_admin());

create policy "Spieler lesen" on players for select using (can_manage_player(id) or is_platform_admin());
create policy "Spieler anlegen" on players for insert
  with check (guardian_user_id = auth.uid() or own_user_id = auth.uid());
create policy "Spieler pflegen" on players for update using (can_manage_player(id) or is_platform_admin());

create policy "Historie lesen" on player_club_history for select using (can_manage_player(player_id) or is_platform_admin());
create policy "Historie schreiben" on player_club_history for insert
  with check (is_club_staff(club_id) or can_manage_player(player_id));
create policy "Historie schließen" on player_club_history for update
  using (is_club_staff(club_id) or is_platform_admin());

create policy "Übungen lesen" on exercises for select using (true);
create policy "Übungen pflegen" on exercises for all using (is_platform_admin()) with check (is_platform_admin());

create policy "Einträge lesen" on exercise_entries for select using (can_manage_player(player_id) or is_platform_admin());
create policy "Einträge anlegen" on exercise_entries for insert
  with check (created_by = auth.uid() and can_manage_player(player_id));
create policy "Einträge ändern" on exercise_entries for update using (created_by = auth.uid() or is_platform_admin());

create policy "Spiele lesen" on matches for select using (is_club_staff(club_id) or is_platform_admin()
  or exists (select 1 from match_appearances a where a.match_id = id and can_manage_player(a.player_id)));
create policy "Spiele anlegen" on matches for insert with check (created_by = auth.uid() and is_club_staff(club_id));
create policy "Spiele ändern" on matches for update using (is_club_staff(club_id) or is_platform_admin());

create policy "Einsätze lesen" on match_appearances for select using (can_manage_player(player_id) or is_platform_admin());
create policy "Einsätze anlegen" on match_appearances for insert with check (created_by = auth.uid()
  and exists (select 1 from matches m where m.id = match_id and is_club_staff(m.club_id)));
create policy "Einsätze ändern" on match_appearances for update using (created_by = auth.uid() or is_platform_admin());

-- confirmations und audit_log: nur über security-definer-Funktionen bzw. für Admins lesbar.
create policy "Bestätigungen Admin" on confirmations for select using (is_platform_admin());
create policy "Audit Admin" on audit_log for select using (is_platform_admin());

grant select on public_players, public_rankings, public_match_stats to anon, authenticated;
