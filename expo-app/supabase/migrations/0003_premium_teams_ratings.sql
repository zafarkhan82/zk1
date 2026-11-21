-- Kick-Tagebuch – Teams, Premium-Abo, Tagebuch, Bewertungen, Challenges
--
-- Preismodell: 20 € pro Kind und Jahr (Premium).
-- Kostenlos (team-intern): Tagebuch, alle Übungen selbst tracken, Team beitreten,
--   Team-Challenges auf Bronze, Spielberichte des eigenen Teams.
-- Premium: Trainer-Bestätigungen und Trainer-Bewertungen, Bewertungen durch Mitspieler und Gegner,
--   Challenges ab Silber, Challenges über den eigenen Verein hinaus, öffentliche Ranglisten.

-- ───────────────────────── Konten automatisch anlegen ─────────────────────────

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, 'Nutzer'), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end $$;
revoke execute on function handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ───────────────────────── Premium ─────────────────────────

create type sub_status as enum ('active', 'canceled', 'expired', 'refunded');
create type pay_provider as enum ('stripe', 'apple', 'google', 'manual');

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id),
  payer_user_id uuid not null references profiles (id),
  plan text not null default 'premium_year',
  status sub_status not null default 'active',
  valid_from timestamptz not null default now(),
  valid_until timestamptz not null,
  provider pay_provider not null,
  provider_ref text,                    -- Stripe-Subscription-ID bzw. Store-Transaktion
  amount_cents int not null default 2000,
  currency text not null default 'EUR',
  created_at timestamptz not null default now()
);
create index subscriptions_player on subscriptions (player_id, valid_until);

create or replace function is_premium(p_player uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from subscriptions
                  where player_id = p_player and status in ('active', 'canceled') and valid_until > now());
$$;

-- ───────────────────────── Teams ─────────────────────────

create table teams (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs (id),
  name text not null,                   -- z. B. "U12-1"
  age_group text not null,              -- 'E'..'A'
  season text not null,                 -- z. B. "2026/27"
  join_code text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 6)),
  active boolean not null default true,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now()
);

create table team_staff (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id),
  user_id uuid not null references profiles (id),
  status approval_status not null default 'pending',
  approved_by uuid references profiles (id),
  from_date date not null default current_date,
  to_date date,
  created_at timestamptz not null default now(),
  unique (team_id, user_id, from_date)
);

create table team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id),
  player_id uuid not null references players (id),
  jersey_number int check (jersey_number between 1 and 99),
  status approval_status not null default 'pending',
  approved_by uuid references profiles (id),
  from_date date not null default current_date,
  to_date date,
  created_at timestamptz not null default now()
);
create unique index one_active_team_membership on team_members (team_id, player_id) where to_date is null;

create or replace function is_team_staff(p_team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_staff
                  where team_id = p_team and user_id = auth.uid() and status = 'approved' and to_date is null)
      or exists (select 1 from teams t where t.id = p_team and is_club_admin(t.club_id));
$$;

-- Trainer eines Spielers = Staff in einem aktiven Team des Spielers
create or replace function is_trainer_of(p_player uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members m
                  where m.player_id = p_player and m.to_date is null and m.status = 'approved'
                    and is_team_staff(m.team_id));
$$;

-- Beitritt mit Code: Eltern bzw. Spieler ab 16. Freigabe danach durch den Trainer.
create or replace function join_team(p_code text, p_player uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  t teams;
  mid uuid;
begin
  if not exists (select 1 from players where id = p_player
                  and (guardian_user_id = auth.uid() or own_user_id = auth.uid())) then
    raise exception 'Nur Eltern oder der Spieler selbst können einem Team beitreten.';
  end if;
  select * into t from teams where join_code = upper(trim(p_code)) and active;
  if not found then raise exception 'Team-Code nicht gefunden.'; end if;
  insert into team_members (team_id, player_id) values (t.id, p_player)
  on conflict do nothing returning id into mid;
  return mid;
end $$;

-- Trainer-Konto einem Team zuordnen (Freigabe durch Vereins-Admin)
create or replace function join_team_as_trainer(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  t teams;
  sid uuid;
begin
  select * into t from teams where join_code = upper(trim(p_code)) and active;
  if not found then raise exception 'Team-Code nicht gefunden.'; end if;
  insert into team_staff (team_id, user_id) values (t.id, auth.uid()) returning id into sid;
  return sid;
end $$;

-- Vereinswechsel bzw. Teamwechsel: alte Mitgliedschaft schließen, Historie bleibt.
create or replace function leave_team(p_member uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update team_members set to_date = current_date
   where id = p_member and to_date is null
     and (is_team_staff(team_id) or exists (select 1 from players p where p.id = player_id
          and (p.guardian_user_id = auth.uid() or p.own_user_id = auth.uid())));
end $$;

-- can_manage_player um Team-Trainer erweitern
create or replace function can_manage_player(p_player uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from players where id = p_player
                  and (guardian_user_id = auth.uid() or own_user_id = auth.uid()))
      or exists (select 1 from player_club_history h
                  where h.player_id = p_player and h.to_date is null and is_club_staff(h.club_id))
      or is_trainer_of(p_player);
$$;

-- ───────────────────────── Tagebuch (online) ─────────────────────────

create table diary_entries (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id),
  kind text not null check (kind in ('training', 'spiel', 'allein', 'frei')),
  minutes int not null default 0 check (minutes between 0 and 600),
  mood int not null check (mood between 1 and 5),
  good text,
  improve text,
  version int not null default 1,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function diary_edit_window() returns trigger
language plpgsql set search_path = public as $$
begin
  if now() > old.created_at + interval '12 hours' then
    raise exception 'Änderungen sind nur innerhalb von 12 Stunden nach dem Eintragen möglich.';
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  new.created_at := old.created_at;
  return new;
end $$;
revoke execute on function diary_edit_window() from public, anon, authenticated;

create trigger diary_window before update on diary_entries for each row execute function diary_edit_window();
create trigger diary_entries_audit after insert or update on diary_entries for each row execute function audit_trigger();
create trigger diary_entries_no_delete before delete on diary_entries for each row execute function forbid_delete();

-- ───────────────────────── Bewertungen ─────────────────────────

-- Kategorien 1–5, kein Freitext (Schutz vor Beleidigungen). Einzelbewertungen sind nicht öffentlich,
-- angezeigt werden nur Durchschnitte ab 3 Bewertungen.
create table trainer_ratings (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id),
  trainer_user_id uuid not null references profiles (id),
  match_id uuid references matches (id),
  technik int check (technik between 1 and 5),
  taktik int check (taktik between 1 and 5),
  athletik int check (athletik between 1 and 5),
  einsatz int check (einsatz between 1 and 5),
  fairplay int check (fairplay between 1 and 5),
  created_at timestamptz not null default now()
);

-- Gegner-Verknüpfung: Spielbericht des eigenen Teams ↔ Spielbericht des Gegners
alter table matches add column opponent_club_id uuid references clubs (id);
alter table matches add column opponent_match_id uuid references matches (id);
alter table matches add column team_id uuid references teams (id);

create table peer_ratings (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches (id),          -- Spiel des Bewerteten
  rated_player_id uuid not null references players (id),
  rater_player_id uuid not null references players (id),
  relation text not null check (relation in ('mitspieler', 'gegner')),
  technik int check (technik between 1 and 5),
  fairplay int not null check (fairplay between 1 and 5),
  einsatz int check (einsatz between 1 and 5),
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  unique (match_id, rated_player_id, rater_player_id),
  check (rated_player_id <> rater_player_id)
);

create or replace function check_peer_rating() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m matches;
begin
  if not is_premium(new.rated_player_id) then
    raise exception 'Bewertungen durch andere Spieler sind eine Premium-Funktion des bewerteten Spielers.';
  end if;
  if not exists (select 1 from players where id = new.rater_player_id
                  and (guardian_user_id = auth.uid() or own_user_id = auth.uid())) then
    raise exception 'Bewerten nur für das eigene Spielerprofil.';
  end if;
  select * into m from matches where id = new.match_id;
  if not exists (select 1 from match_appearances where match_id = m.id and player_id = new.rated_player_id) then
    raise exception 'Der bewertete Spieler hat in diesem Spiel nicht gespielt.';
  end if;
  if exists (select 1 from match_appearances where match_id = m.id and player_id = new.rater_player_id) then
    new.relation := 'mitspieler';
  elsif m.opponent_match_id is not null and exists (
          select 1 from match_appearances where match_id = m.opponent_match_id and player_id = new.rater_player_id) then
    new.relation := 'gegner';
  else
    raise exception 'Bewerten können nur Mitspieler und Gegner aus diesem Spiel.';
  end if;
  if now() > m.kickoff + interval '7 days' then
    raise exception 'Bewertungen sind bis 7 Tage nach dem Spiel möglich.';
  end if;
  new.created_by := auth.uid();
  return new;
end $$;
revoke execute on function check_peer_rating() from public, anon, authenticated;
create trigger peer_ratings_check before insert on peer_ratings for each row execute function check_peer_rating();

create or replace function check_trainer_rating() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not is_premium(new.player_id) then
    raise exception 'Trainer-Bewertungen sind eine Premium-Funktion.';
  end if;
  if not is_trainer_of(new.player_id) and not exists (
       select 1 from player_club_history h where h.player_id = new.player_id and h.to_date is null and is_club_staff(h.club_id)) then
    raise exception 'Nur Trainer des Spielers dürfen bewerten.';
  end if;
  new.trainer_user_id := auth.uid();
  return new;
end $$;
revoke execute on function check_trainer_rating() from public, anon, authenticated;
create trigger trainer_ratings_check before insert on trainer_ratings for each row execute function check_trainer_rating();

do $$
declare t text;
begin
  foreach t in array array['subscriptions','teams','team_staff','team_members','trainer_ratings','peer_ratings']
  loop
    execute format('create trigger %I_audit after insert or update on %I for each row execute function audit_trigger()', t, t);
    execute format('create trigger %I_no_delete before delete on %I for each row execute function forbid_delete()', t, t);
  end loop;
end $$;

-- Bewertungen sind unveränderlich (keine 12-h-Korrektur, damit nichts nachträglich geschönt wird)
create or replace function forbid_update() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'Bewertungen können nicht geändert werden.';
end $$;
revoke execute on function forbid_update() from public, anon, authenticated;
create trigger trainer_ratings_no_update before update on trainer_ratings for each row execute function forbid_update();
create trigger peer_ratings_no_update before update on peer_ratings for each row execute function forbid_update();

-- Durchschnitt nur ab 3 Bewertungen, Bewertende bleiben anonym
create or replace view rating_summary as
select * from (
select player_id,
       count(*) as anzahl,
       round(avg(technik), 1) as technik,
       round(avg(taktik), 1) as taktik,
       round(avg(athletik), 1) as athletik,
       round(avg(einsatz), 1) as einsatz,
       round(avg(fairplay), 1) as fairplay,
       'trainer' as quelle
  from trainer_ratings group by player_id having count(*) >= 3
union all
select rated_player_id, count(*), round(avg(technik), 1), null, null, round(avg(einsatz), 1), round(avg(fairplay), 1), relation
  from peer_ratings group by rated_player_id, relation having count(*) >= 3
) r where r.player_id in (select id from public_players);

-- Eltern und Trainer sehen die Zusammenfassung auch ohne Veröffentlichung
create or replace function my_rating_summary(p_player uuid)
returns table (quelle text, anzahl bigint, technik numeric, taktik numeric, athletik numeric, einsatz numeric, fairplay numeric)
language sql stable security definer set search_path = public as $$
  select 'trainer', count(*), round(avg(technik),1), round(avg(taktik),1), round(avg(athletik),1), round(avg(einsatz),1), round(avg(fairplay),1)
    from trainer_ratings where player_id = p_player and can_manage_player(p_player) having count(*) >= 3
  union all
  select relation, count(*), round(avg(technik),1), null, null, round(avg(einsatz),1), round(avg(fairplay),1)
    from peer_ratings where rated_player_id = p_player and can_manage_player(p_player) group by relation having count(*) >= 3;
$$;

-- ───────────────────────── Challenges ─────────────────────────

create type challenge_scope as enum ('team', 'verein', 'region', 'national', 'international');

create table challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  exercise_id text not null references exercises (id),
  level level not null,
  scope challenge_scope not null,
  team_id uuid references teams (id),
  club_id uuid references clubs (id),
  association text,                     -- für scope = region
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by uuid not null references profiles (id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table challenge_participants (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges (id),
  player_id uuid not null references players (id),
  joined_by uuid not null references profiles (id),
  joined_at timestamptz not null default now(),
  unique (challenge_id, player_id)
);

create or replace function check_challenge_join() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c challenges;
begin
  select * into c from challenges where id = new.challenge_id;
  if not c.active or now() > c.ends_at then raise exception 'Diese Challenge ist beendet.'; end if;
  if (c.level <> 'bronze' or c.scope not in ('team', 'verein')) and not is_premium(new.player_id) then
    raise exception 'Challenges ab Silber und über den eigenen Verein hinaus sind Premium.';
  end if;
  if c.scope = 'team' and not exists (select 1 from team_members where team_id = c.team_id
        and player_id = new.player_id and status = 'approved' and to_date is null) then
    raise exception 'Diese Challenge ist nur für Mitglieder des Teams.';
  end if;
  if c.scope = 'verein' and not exists (select 1 from team_members m join teams t on t.id = m.team_id
        where t.club_id = c.club_id and m.player_id = new.player_id and m.status = 'approved' and m.to_date is null) then
    raise exception 'Diese Challenge ist nur für Spieler des Vereins.';
  end if;
  new.joined_by := auth.uid();
  return new;
end $$;
revoke execute on function check_challenge_join() from public, anon, authenticated;
create trigger challenge_participants_check before insert on challenge_participants
  for each row execute function check_challenge_join();

do $$
declare t text;
begin
  foreach t in array array['challenges','challenge_participants']
  loop
    execute format('create trigger %I_audit after insert or update on %I for each row execute function audit_trigger()', t, t);
    execute format('create trigger %I_no_delete before delete on %I for each row execute function forbid_delete()', t, t);
  end loop;
end $$;

-- Rangliste einer Challenge: bester bestätigter Wert im Zeitraum
create or replace view challenge_leaderboard as
select cp.challenge_id, pp.nickname, pp.club_name,
       case when ex.lower_is_better then min(e.value) else max(e.value) end as bestwert,
       ex.lower_is_better
  from challenge_participants cp
  join challenges c on c.id = cp.challenge_id
  join public_players pp on pp.id = cp.player_id
  join exercises ex on ex.id = c.exercise_id
  join exercise_entries e on e.player_id = cp.player_id and e.exercise_id = c.exercise_id
                          and e.level = c.level and e.status = 'confirmed'
                          and e.created_at between c.starts_at and c.ends_at
 group by cp.challenge_id, pp.nickname, pp.club_name, ex.lower_is_better;

-- ───────────────────────── Premium-Regeln an bestehenden Stellen ─────────────────────────

-- Trainer-Bestätigung von Übungen ist Premium. Ohne Premium bleibt ein Eintrag "selbst erfasst".
create or replace function check_entry_premium() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.trainer_user_id is not null and not is_premium(new.player_id) then
    raise exception 'Trainer-Bestätigungen sind eine Premium-Funktion.';
  end if;
  return new;
end $$;
revoke execute on function check_entry_premium() from public, anon, authenticated;
create trigger exercise_entries_premium before insert on exercise_entries
  for each row execute function check_entry_premium();

-- Öffentlich (über den Verein hinaus) erscheinen nur Premium-Spieler mit Eltern-Zustimmung.
create or replace view public_players as
select p.id, p.nickname, p.birth_year, p.preferred_position,
       h.club_id, c.name as club_name, c.city, c.association, h.jersey_number
  from players p
  left join player_club_history h on h.player_id = p.id and h.to_date is null
  left join clubs c on c.id = h.club_id
 where p.public_consent_at is not null and p.anonymized_at is null and is_premium(p.id);

-- ───────────────────────── Zugriffsregeln ─────────────────────────

alter table subscriptions enable row level security;
alter table teams enable row level security;
alter table team_staff enable row level security;
alter table team_members enable row level security;
alter table diary_entries enable row level security;
alter table trainer_ratings enable row level security;
alter table peer_ratings enable row level security;
alter table challenges enable row level security;
alter table challenge_participants enable row level security;

-- Abos schreibt nur der Zahlungsdienst (Service-Rolle). Eltern sehen die Abos ihrer Kinder.
create policy "Abos lesen" on subscriptions for select
  using (payer_user_id = auth.uid() or can_manage_player(player_id) or is_platform_admin());

create policy "Teams lesen" on teams for select using (true);
create policy "Team anlegen" on teams for insert with check (created_by = auth.uid() and (is_club_staff(club_id) or is_platform_admin()));
create policy "Team pflegen" on teams for update using (is_team_staff(id) or is_platform_admin());

create policy "Staff lesen" on team_staff for select using (user_id = auth.uid() or is_team_staff(team_id) or is_platform_admin());
create policy "Staff freigeben" on team_staff for update using (
  exists (select 1 from teams t where t.id = team_id and is_club_admin(t.club_id)) or is_platform_admin());

create policy "Mitglieder lesen" on team_members for select using (can_manage_player(player_id) or is_team_staff(team_id) or is_platform_admin());
create policy "Mitglieder pflegen" on team_members for update using (is_team_staff(team_id) or is_platform_admin());

create policy "Tagebuch lesen" on diary_entries for select using (can_manage_player(player_id) or is_platform_admin());
create policy "Tagebuch schreiben" on diary_entries for insert with check (created_by = auth.uid() and exists (
  select 1 from players p where p.id = player_id and (p.guardian_user_id = auth.uid() or p.own_user_id = auth.uid())));
create policy "Tagebuch ändern" on diary_entries for update using (created_by = auth.uid());

create policy "Trainer-Bewertungen lesen" on trainer_ratings for select using (can_manage_player(player_id) or is_platform_admin());
create policy "Trainer bewertet" on trainer_ratings for insert with check (true);  -- Prüfung im Trigger

create policy "Spieler-Bewertungen eigene" on peer_ratings for select using (created_by = auth.uid() or is_platform_admin());
create policy "Spieler bewertet" on peer_ratings for insert with check (true);      -- Prüfung im Trigger

create policy "Challenges lesen" on challenges for select using (active or is_platform_admin());
create policy "Challenge anlegen" on challenges for insert with check (created_by = auth.uid() and (
  (scope = 'team' and is_team_staff(team_id)) or (scope = 'verein' and is_club_staff(club_id)) or is_platform_admin()));
create policy "Challenge pflegen" on challenges for update using (created_by = auth.uid() or is_platform_admin());

create policy "Teilnahmen lesen" on challenge_participants for select using (can_manage_player(player_id) or is_platform_admin());
create policy "Teilnehmen" on challenge_participants for insert with check (exists (
  select 1 from players p where p.id = player_id and (p.guardian_user_id = auth.uid() or p.own_user_id = auth.uid())));

-- Trainer sehen Spieler, die ihrem Team beitreten möchten
create policy "Spieler lesen (Beitrittsanfrage)" on players for select using (exists (
  select 1 from team_members m where m.player_id = players.id and m.to_date is null and is_team_staff(m.team_id)));

-- Korrektur aus 0001: "id" bezog sich in der Unterabfrage auf match_appearances.id
drop policy "Spiele lesen" on matches;
create policy "Spiele lesen" on matches for select using (is_club_staff(club_id) or is_platform_admin()
  or (team_id is not null and is_team_staff(team_id))
  or exists (select 1 from match_appearances a where a.match_id = matches.id and can_manage_player(a.player_id)));

-- Spielberichte dürfen auch Team-Trainer anlegen und pflegen
drop policy "Spiele anlegen" on matches;
drop policy "Spiele ändern" on matches;
create policy "Spiele anlegen" on matches for insert with check (created_by = auth.uid()
  and (is_club_staff(club_id) or (team_id is not null and is_team_staff(team_id))));
create policy "Spiele ändern" on matches for update using (is_club_staff(club_id)
  or (team_id is not null and is_team_staff(team_id)) or is_platform_admin());
drop policy "Einsätze anlegen" on match_appearances;
create policy "Einsätze anlegen" on match_appearances for insert with check (created_by = auth.uid()
  and exists (select 1 from matches m where m.id = match_id
              and (is_club_staff(m.club_id) or (m.team_id is not null and is_team_staff(m.team_id)))));

grant select on public_players, public_rankings, public_match_stats, rating_summary, challenge_leaderboard to anon, authenticated;
