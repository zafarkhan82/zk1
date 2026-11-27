-- Go4Pro 0027: Bewertungen als Herzstück.
--   Begegnungen (Einzelaktion, Training, Spiel, Turnier) – darin bewerten Trainer*innen und Mitspieler*innen,
--   bei Spiel/Turnier auch die Gegner. 1–6 Sterne in festen Kategorien. Jede*r sieht, wer wie bewertet hat (live).
--   Wer bewertet, sammelt Go4Pro-Punkte. Bewertungen zählen 30 % der Gesamtwertung.
--   Profilbilder werden in der App auf 160 × 160 px verkleinert und klein in der Datenbank abgelegt.

-- ───────────────────────── Profilbilder ─────────────────────────
alter table players add column if not exists avatar text
  check (avatar is null or (length(avatar) <= 40000 and avatar like 'data:image/%'));
alter table profiles add column if not exists avatar text
  check (avatar is null or (length(avatar) <= 40000 and avatar like 'data:image/%'));

create or replace function set_player_avatar(p_player uuid, p_data text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_player_owner(p_player) then raise exception 'Nur für eigene Spieler*innen.'; end if;
  update players set avatar = nullif(p_data, '') where id = p_player;
end $$;

create or replace function set_my_avatar(p_data text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Bitte anmelden.'; end if;
  update profiles set avatar = nullif(p_data, '') where id = auth.uid();
end $$;

create or replace function my_avatar() returns text
language sql stable security definer set search_path = public as $$
  select avatar from profiles where id = auth.uid();
$$;

-- ───────────────────────── Begegnungen ─────────────────────────
create table if not exists encounters (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('einzelaktion', 'training', 'spiel', 'turnier')),
  team_id uuid not null references teams (id),
  opponent_team_id uuid references teams (id),
  match_key text unique,                       -- Spiele aus dem Spielplan: eine Begegnung für beide Teams
  title text not null check (length(title) between 2 and 120),
  occurred_on date not null default current_date,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  check (opponent_team_id is null or kind in ('spiel', 'turnier')),
  check (opponent_team_id is null or opponent_team_id <> team_id)
);
create index if not exists encounters_team on encounters (team_id, occurred_on desc);
create index if not exists encounters_opp on encounters (opponent_team_id, occurred_on desc);
alter table encounters enable row level security;
drop trigger if exists encounters_no_delete on encounters;
create trigger encounters_no_delete before delete on encounters for each row execute function forbid_delete();

-- ───────────────────────── Bewertungen ─────────────────────────
create table if not exists ratings (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references encounters (id),
  rated_player_id uuid not null references players (id),
  rater_user_id uuid not null references profiles (id),
  rater_player_id uuid references players (id),         -- null = Trainer*in
  rater_role text not null check (rater_role in ('trainer', 'mitspieler', 'gegner')),
  technik smallint check (technik between 1 and 6),
  spielverstaendnis smallint check (spielverstaendnis between 1 and 6),
  athletik smallint check (athletik between 1 and 6),
  einsatz smallint check (einsatz between 1 and 6),
  fairplay smallint check (fairplay between 1 and 6),
  teamgeist smallint check (teamgeist between 1 and 6),
  avg_stars numeric(3, 2) not null,
  created_at timestamptz not null default now(),
  reported_at timestamptz,
  hidden_at timestamptz,
  hidden_by uuid references profiles (id),
  check (rater_player_id is null or rater_player_id <> rated_player_id)
);
create unique index if not exists ratings_once on ratings (encounter_id, rated_player_id, coalesce(rater_player_id, rater_user_id));
create index if not exists ratings_rated on ratings (rated_player_id, created_at desc);
create index if not exists ratings_rater on ratings (rater_user_id, created_at desc);
alter table ratings enable row level security;
drop policy if exists "Bewertungen lesen" on ratings;
create policy "Bewertungen lesen" on ratings for select to authenticated
  using (is_player_owner(rated_player_id) or rater_user_id = auth.uid() or is_trainer_of(rated_player_id) or is_platform_admin());
drop trigger if exists ratings_no_delete on ratings;
create trigger ratings_no_delete before delete on ratings for each row execute function forbid_delete();
drop trigger if exists ratings_audit on ratings;
create trigger ratings_audit after insert or update on ratings for each row execute function audit_trigger();

-- Live-Aktualisierung (Supabase Realtime)
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'ratings') then
    execute 'alter publication supabase_realtime add table ratings';
  end if;
end $$;

-- ───────────────────────── Punkte ─────────────────────────
create table if not exists points_ledger (
  id bigint generated always as identity primary key,
  player_id uuid references players (id),
  user_id uuid references profiles (id),
  amount int not null,
  reason text not null,
  ref_id uuid,
  created_at timestamptz not null default now(),
  check ((player_id is null) <> (user_id is null))
);
create index if not exists points_player on points_ledger (player_id);
create index if not exists points_user on points_ledger (user_id);
alter table points_ledger enable row level security;
drop trigger if exists points_no_delete on points_ledger;
create trigger points_no_delete before delete on points_ledger for each row execute function forbid_delete();

create or replace function points_balance(p_player uuid, p_user uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0)::int from points_ledger
   where (p_player is not null and player_id = p_player) or (p_player is null and user_id = p_user);
$$;
revoke execute on function points_balance(uuid, uuid) from public, anon, authenticated;

-- Punkte einer Spielerin/eines Spielers (Eltern/Kind) bzw. des eigenen Kontos (p_player = null), mit Verlauf
create or replace function my_points(p_player uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if p_player is not null and not (is_player_owner(p_player) or is_platform_admin()) then raise exception 'Keine Berechtigung.'; end if;
  if p_player is null and auth.uid() is null then raise exception 'Bitte anmelden.'; end if;
  return jsonb_build_object(
    'balance', points_balance(p_player, auth.uid()),
    'earned', (select coalesce(sum(amount) filter (where amount > 0), 0) from points_ledger
                where (p_player is not null and player_id = p_player) or (p_player is null and user_id = auth.uid())),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('amount', amount, 'reason', reason, 'at', created_at) order by created_at desc), '[]'::jsonb)
                  from (select * from points_ledger
                         where (p_player is not null and player_id = p_player) or (p_player is null and user_id = auth.uid())
                         order by created_at desc limit 30) x));
end $$;

-- ───────────────────────── Begegnungen anlegen und finden ─────────────────────────
create or replace function rating_categories(p_role text) returns text[]
language sql immutable as $$
  select case p_role
    when 'trainer' then array['technik', 'spielverstaendnis', 'athletik', 'einsatz', 'fairplay', 'teamgeist']
    when 'mitspieler' then array['technik', 'einsatz', 'fairplay', 'teamgeist']
    else array['technik', 'einsatz', 'fairplay'] end;
$$;

create or replace function create_encounter(p_team uuid, p_kind text, p_title text, p_date date default current_date,
                                            p_opponent_team uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  eid uuid;
begin
  if not (is_team_staff(p_team) or is_platform_admin()) then raise exception 'Begegnungen legen Trainer*innen des Teams an.'; end if;
  if coalesce(p_date, current_date) > current_date + 1 or coalesce(p_date, current_date) < current_date - 14 then
    raise exception 'Bitte ein Datum aus den letzten 14 Tagen wählen.';
  end if;
  insert into encounters (kind, team_id, opponent_team_id, title, occurred_on, created_by)
  values (p_kind, p_team, case when p_kind in ('spiel', 'turnier') then p_opponent_team end, trim(p_title), coalesce(p_date, current_date), auth.uid())
  returning id into eid;
  return eid;
end $$;

-- Gegnerteams, die in Go4Pro sind (gleiche Staffel bzw. Altersklasse im Kreis)
create or replace function opponent_options(p_team uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'name', c.name || ' ' || o.name) order by c.name), '[]'::jsonb)
    from teams t join clubs tc on tc.id = t.club_id
    join teams o on o.id <> t.id and o.active and o.age_group = t.age_group and o.season = t.season
    join clubs c on c.id = o.club_id
   where t.id = p_team and (o.staffel_id = t.staffel_id or c.kreis_id = tc.kreis_id);
$$;

-- Spiele aus dem Spielplan werden automatisch zu Begegnungen (beide Teams, wenn beide in Go4Pro sind)
create or replace function ensure_match_encounters(p_team uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m record;
  base text;
  opp uuid;
begin
  for m in select * from matches where team_id = p_team and kickoff < now() and kickoff > now() - interval '7 days'
             and fussballde_missing_since is null loop
    base := coalesce(regexp_replace(m.fussballde_id, ':(H|A)$', ''), 'm:' || m.id::text);
    continue when exists (select 1 from encounters where match_key = base);
    opp := (select team_id from matches x where x.fussballde_id is not null and x.id <> m.id
              and regexp_replace(x.fussballde_id, ':(H|A)$', '') = base limit 1);
    insert into encounters (kind, team_id, opponent_team_id, match_key, title, occurred_on)
    values ('spiel', m.team_id, opp, base,
            case when m.is_home then m.team_name || ' – ' || m.opponent else m.opponent || ' – ' || m.team_name end,
            (m.kickoff at time zone 'Europe/Berlin')::date)
    on conflict (match_key) do nothing;
  end loop;
end $$;
revoke execute on function ensure_match_encounters(uuid) from public, anon, authenticated;

-- Wer nimmt an einer Begegnung teil? (Spieler*innen beider Teams)
create or replace function encounter_participants(p_encounter uuid)
returns table (player_id uuid, nickname text, avatar text, team_id uuid, jersey int)
language sql stable security definer set search_path = public as $$
  select p.id, p.nickname, p.avatar, m.team_id, m.jersey_number
    from encounters e
    join team_members m on m.team_id in (e.team_id, e.opponent_team_id) and m.status = 'approved' and m.to_date is null
    join players p on p.id = m.player_id and p.anonymized_at is null
   where e.id = p_encounter;
$$;
revoke execute on function encounter_participants(uuid) from public, anon, authenticated;

-- Rolle des Bewertenden gegenüber dem Bewerteten (null = darf nicht)
create or replace function rater_role_for(p_encounter uuid, p_rated uuid, p_rater_player uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  e encounters;
  rated_team uuid;
  rater_team uuid;
begin
  select * into e from encounters where id = p_encounter;
  select team_id into rated_team from encounter_participants(p_encounter) where player_id = p_rated;
  if rated_team is null then return null; end if;
  if p_rater_player is null then
    if is_team_staff(rated_team) then return 'trainer'; end if;
    if e.kind in ('spiel', 'turnier') and e.opponent_team_id is not null
       and is_team_staff(case when rated_team = e.team_id then e.opponent_team_id else e.team_id end) then return 'gegner'; end if;
    return null;
  end if;
  if not is_player_owner(p_rater_player) or p_rater_player = p_rated then return null; end if;
  if exists (select 1 from players a, players b where a.id = p_rater_player and b.id = p_rated
               and a.guardian_user_id is not null and a.guardian_user_id = b.guardian_user_id) then return null; end if;
  select team_id into rater_team from encounter_participants(p_encounter) where player_id = p_rater_player;
  if rater_team is null then return null; end if;
  if rater_team = rated_team then return 'mitspieler'; end if;
  if e.kind in ('spiel', 'turnier') then return 'gegner'; end if;
  return null;
end $$;
revoke execute on function rater_role_for(uuid, uuid, uuid) from public, anon, authenticated;

-- Begegnungen zum Bewerten: für eine*n Spieler*in (p_player) oder als Trainer*in (p_player = null, alle eigenen Teams)
create or replace function rating_inbox(p_player uuid default null) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  tids uuid[];
  res jsonb;
begin
  if p_player is not null then
    if not is_player_owner(p_player) then raise exception 'Nur für eigene Spieler*innen.'; end if;
    tids := array(select team_id from team_members where player_id = p_player and status = 'approved' and to_date is null);
  else
    tids := array(select team_id from team_staff where user_id = auth.uid() and status = 'approved' and to_date is null
                  union select t.id from teams t where t.active and is_club_admin(t.club_id));
  end if;
  perform ensure_match_encounters(t) from unnest(tids) t;

  select coalesce(jsonb_agg(x order by x ->> 'date' desc, x ->> 'created' desc), '[]'::jsonb) into res from (
    select jsonb_build_object(
      'id', e.id, 'kind', e.kind, 'title', e.title, 'date', e.occurred_on, 'created', e.created_at,
      'team', (select c.name || ' ' || t.name from teams t join clubs c on c.id = t.club_id where t.id = e.team_id),
      'opponent', (select c.name || ' ' || t.name from teams t join clubs c on c.id = t.club_id where t.id = e.opponent_team_id),
      'open_until', e.occurred_on + 7,
      'targets', (select coalesce(jsonb_agg(jsonb_build_object(
                     'player_id', pa.player_id, 'nickname', pa.nickname, 'avatar', pa.avatar, 'jersey', pa.jersey,
                     'role', rater_role_for(e.id, pa.player_id, p_player),
                     'categories', to_jsonb(rating_categories(rater_role_for(e.id, pa.player_id, p_player))),
                     'done', exists (select 1 from ratings r where r.encounter_id = e.id and r.rated_player_id = pa.player_id
                                       and coalesce(r.rater_player_id, r.rater_user_id) = coalesce(p_player, auth.uid())))
                   order by (rater_role_for(e.id, pa.player_id, p_player) = 'gegner'), pa.jersey nulls last, pa.nickname), '[]'::jsonb)
                    from encounter_participants(e.id) pa
                   where rater_role_for(e.id, pa.player_id, p_player) is not null)) as x
      from encounters e
     where (e.team_id = any (tids) or e.opponent_team_id = any (tids))
       and e.occurred_on >= current_date - 7 and e.occurred_on <= current_date) q;
  return res;
end $$;

-- Bewertung abgeben (+10 Punkte für die/den Bewertende*n, max. 30 Bewertungen pro Tag mit Punkten)
create or replace function submit_rating(p_encounter uuid, p_rated uuid, p_rater_player uuid, p_scores jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e encounters;
  role text;
  cats text[];
  c text;
  v int;
  sum_ int := 0;
  n int := 0;
  rid uuid;
  today_count int;
  pts int := 0;
begin
  if auth.uid() is null then raise exception 'Bitte anmelden.'; end if;
  select * into e from encounters where id = p_encounter;
  if not found then raise exception 'Begegnung nicht gefunden.'; end if;
  if e.occurred_on < current_date - 7 or e.occurred_on > current_date then
    raise exception 'Bewerten geht bis 7 Tage nach der Begegnung.';
  end if;
  role := rater_role_for(p_encounter, p_rated, p_rater_player);
  if role is null then raise exception 'Du kannst diese*n Spieler*in in dieser Begegnung nicht bewerten.'; end if;
  cats := rating_categories(role);
  foreach c in array cats loop
    v := nullif(p_scores ->> c, '')::int;
    if v is null or v < 1 or v > 6 then raise exception 'Bitte alle Kategorien mit 1 bis 6 Sternen bewerten.'; end if;
    sum_ := sum_ + v;
    n := n + 1;
  end loop;

  insert into ratings (encounter_id, rated_player_id, rater_user_id, rater_player_id, rater_role,
                       technik, spielverstaendnis, athletik, einsatz, fairplay, teamgeist, avg_stars)
  values (p_encounter, p_rated, auth.uid(), p_rater_player, role,
          case when 'technik' = any (cats) then (p_scores ->> 'technik')::int end,
          case when 'spielverstaendnis' = any (cats) then (p_scores ->> 'spielverstaendnis')::int end,
          case when 'athletik' = any (cats) then (p_scores ->> 'athletik')::int end,
          case when 'einsatz' = any (cats) then (p_scores ->> 'einsatz')::int end,
          case when 'fairplay' = any (cats) then (p_scores ->> 'fairplay')::int end,
          case when 'teamgeist' = any (cats) then (p_scores ->> 'teamgeist')::int end,
          round(sum_::numeric / n, 2))
  returning id into rid;

  select count(*) into today_count from ratings
   where coalesce(rater_player_id, rater_user_id) = coalesce(p_rater_player, auth.uid()) and created_at > now() - interval '1 day';
  if today_count <= 30 then
    pts := 10;
    insert into points_ledger (player_id, user_id, amount, reason, ref_id)
    values (p_rater_player, case when p_rater_player is null then auth.uid() end, pts, 'Bewertung abgegeben', rid);
  end if;
  return jsonb_build_object('id', rid, 'points', pts);
exception when unique_violation then
  raise exception 'Du hast diese*n Spieler*in in dieser Begegnung schon bewertet.';
end $$;

-- Erhaltene Bewertungen mit Namen, Bild und Rolle der Bewertenden (Eltern, Kind, Trainer*innen des Kindes)
create or replace function received_ratings(p_player uuid, p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (is_player_owner(p_player) or is_trainer_of(p_player) or is_platform_admin()) then raise exception 'Keine Berechtigung.'; end if;
  return jsonb_build_object(
    'items', (select coalesce(jsonb_agg(x order by x ->> 'at' desc), '[]'::jsonb) from (
       select jsonb_build_object(
         'id', r.id, 'at', r.created_at, 'role', r.rater_role, 'avg', r.avg_stars, 'reported', r.reported_at is not null,
         'scores', jsonb_strip_nulls(jsonb_build_object('technik', r.technik, 'spielverstaendnis', r.spielverstaendnis, 'athletik', r.athletik,
                                                        'einsatz', r.einsatz, 'fairplay', r.fairplay, 'teamgeist', r.teamgeist)),
         'rater', case when r.rater_player_id is not null then (select nickname from players where id = r.rater_player_id)
                       else (select display_name from profiles where id = r.rater_user_id) end,
         'rater_avatar', case when r.rater_player_id is not null then (select avatar from players where id = r.rater_player_id)
                              else (select avatar from profiles where id = r.rater_user_id) end,
         'encounter', jsonb_build_object('kind', e.kind, 'title', e.title, 'date', e.occurred_on)) as x
         from ratings r join encounters e on e.id = r.encounter_id
        where r.rated_player_id = p_player and r.hidden_at is null
        order by r.created_at desc limit least(greatest(p_limit, 1), 200)) q),
    'summary', (select jsonb_build_object(
       'count', count(*), 'avg', round(avg(avg_stars), 2),
       'technik', round(avg(technik), 2), 'spielverstaendnis', round(avg(spielverstaendnis), 2), 'athletik', round(avg(athletik), 2),
       'einsatz', round(avg(einsatz), 2), 'fairplay', round(avg(fairplay), 2), 'teamgeist', round(avg(teamgeist), 2),
       'trainer', round(avg(avg_stars) filter (where rater_role = 'trainer'), 2),
       'mitspieler', round(avg(avg_stars) filter (where rater_role = 'mitspieler'), 2),
       'gegner', round(avg(avg_stars) filter (where rater_role = 'gegner'), 2),
       'week', count(*) filter (where created_at > now() - interval '7 days'))
       from ratings where rated_player_id = p_player and hidden_at is null and created_at > now() - interval '180 days'));
end $$;

-- Selbst abgegebene Bewertungen
create or replace function given_ratings(p_player uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if p_player is not null and not is_player_owner(p_player) then raise exception 'Keine Berechtigung.'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
            'at', r.created_at, 'role', r.rater_role, 'avg', r.avg_stars,
            'rated', p.nickname, 'rated_avatar', p.avatar, 'encounter', e.title, 'kind', e.kind) order by r.created_at desc), '[]'::jsonb)
            from (select * from ratings where coalesce(rater_player_id, rater_user_id) = coalesce(p_player, auth.uid())
                   and (p_player is not null or rater_player_id is null) order by created_at desc limit 100) r
            join players p on p.id = r.rated_player_id join encounters e on e.id = r.encounter_id);
end $$;

-- Melden (Bewertete*r) und Ausblenden (Trainer*in des Teams, Admin)
create or replace function report_rating(p_rating uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from ratings where id = p_rating and is_player_owner(rated_player_id)) then raise exception 'Keine Berechtigung.'; end if;
  update ratings set reported_at = coalesce(reported_at, now()) where id = p_rating;
end $$;

create or replace function hide_rating(p_rating uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from ratings where id = p_rating and (is_trainer_of(rated_player_id) or is_platform_admin())) then
    raise exception 'Ausblenden können Trainer*innen des Teams.';
  end if;
  update ratings set hidden_at = now(), hidden_by = auth.uid() where id = p_rating;
end $$;

-- Gemeldete Bewertungen für Trainer*innen
create or replace function reported_ratings() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'rated', p.nickname, 'avg', r.avg_stars, 'role', r.rater_role,
           'rater', coalesce((select nickname from players where id = r.rater_player_id), (select display_name from profiles where id = r.rater_user_id)),
           'at', r.reported_at)), '[]'::jsonb)
    from ratings r join players p on p.id = r.rated_player_id
   where r.reported_at is not null and r.hidden_at is null and (is_trainer_of(r.rated_player_id) or is_platform_admin());
$$;

revoke execute on function set_player_avatar(uuid, text), set_my_avatar(text), my_avatar(), my_points(uuid), create_encounter(uuid, text, text, date, uuid),
  opponent_options(uuid), rating_inbox(uuid), submit_rating(uuid, uuid, uuid, jsonb), received_ratings(uuid, int), given_ratings(uuid),
  report_rating(uuid), hide_rating(uuid), reported_ratings() from public, anon;
grant execute on function set_player_avatar(uuid, text), set_my_avatar(text), my_avatar(), my_points(uuid), create_encounter(uuid, text, text, date, uuid),
  opponent_options(uuid), rating_inbox(uuid), submit_rating(uuid, uuid, uuid, jsonb), received_ratings(uuid, int), given_ratings(uuid),
  report_rating(uuid), hide_rating(uuid), reported_ratings() to authenticated;

-- ───────────────────────── Gesamtwertung: Bewertungen zählen 30 % ─────────────────────────
create or replace function rating_breakdown(p_player uuid, p_at timestamptz default now())
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  pl players;
  grp text;
  gk boolean;
  r record;
  attrs jsonb := '{}'::jsonb;
  skill_sum numeric := 0;
  skill_w numeric := 0;
  skill numeric := 0;
  act numeric;
  vol numeric;
  trn numeric;
  peer numeric;
  rat numeric;
  mat numeric;
  w_skill numeric := 0.40;
  total numeric;
  ovr int;
begin
  select * into pl from players where id = p_player;
  if not found then return null; end if;
  grp := coalesce((select t.age_group from teams t where t.id = active_team_of(p_player)), age_group(pl.birth_year), 'A');
  gk := pl.preferred_position = 'Tor';

  for r in
    with ex as (
      select e.id, e.category from exercises e
       where e.active and group_index(e.min_group) <= group_index(grp) and (e.category <> 'torwart' or gk)
    ), best as (
      select ex.id, ex.category,
             coalesce(max(case when en.id is null then 0 else
                          (case en.level when 'bronze' then 1 when 'silber' then 2 else 3 end)
                          * (case when en.achieved then 1 else 0.4 end)
                          * (case when en.status = 'confirmed' then 1 else 0.7 end) end) / 3.0, 0) as s
        from ex
        left join exercise_entries en on en.exercise_id = ex.id and en.player_id = p_player
              and en.status <> 'rejected' and en.created_at <= p_at
       group by ex.id, ex.category
    ), ranked as (
      select best.*, row_number() over (partition by category order by s desc) as rn from best
    )
    select category, 0.7 * avg(s) filter (where rn <= 3) + 0.3 * avg(s) as c
      from ranked group by category
  loop
    attrs := attrs || jsonb_build_object(r.category, round(35 + 44 * power(r.c, 0.8)));
    skill_sum := skill_sum + r.c * (case when r.category = 'torwart' then 2 else 1 end);
    skill_w := skill_w + (case when r.category = 'torwart' then 2 else 1 end);
  end loop;
  if skill_w > 0 then skill := skill_sum / skill_w; end if;

  select count(distinct date_trunc('week', x.at)) / 8.0 into act from (
    select created_at as at from exercise_entries where player_id = p_player and status <> 'rejected'
       and created_at > p_at - interval '56 days' and created_at <= p_at
    union all
    select created_at from diary_entries where player_id = p_player
       and created_at > p_at - interval '56 days' and created_at <= p_at) x;

  select least(1, count(*) / 40.0) into vol from exercise_entries
   where player_id = p_player and status = 'confirmed' and created_at > p_at - interval '90 days' and created_at <= p_at;

  -- Bewertungen von Trainer*innen, Mitspieler*innen und Gegnern (1–6 Sterne), letzte 180 Tage.
  -- Trainer*innen zählen doppelt, Gegner*innen einfach, Mitspieler*innen einfach.
  select (sum(rt.avg_stars * case rt.rater_role when 'trainer' then 2 else 1 end)
          / nullif(sum(case rt.rater_role when 'trainer' then 2 else 1 end), 0) - 1) / 5
    into rat from ratings rt
   where rt.rated_player_id = p_player and rt.hidden_at is null
     and rt.created_at > p_at - interval '180 days' and rt.created_at <= p_at;

  select case when count(*) = 0 then null
              else avg(least(minutes, 60) / 60.0) * 0.6 + least(1, sum(goals + assists)::numeric / count(*)) * 0.4 end
    into mat from match_appearances
   where player_id = p_player and status = 'confirmed' and created_at > p_at - interval '180 days' and created_at <= p_at;

  if rat is null then w_skill := w_skill + 0.30; end if;
  if mat is null then w_skill := w_skill + 0.10; end if;
  total := w_skill * skill + 0.10 * act + 0.10 * vol + 0.30 * coalesce(rat, 0) + 0.10 * coalesce(mat, 0);
  ovr := greatest(35, least(79, round(35 + 44 * total)::int));

  return jsonb_build_object(
    'overall', ovr,
    'tier', rating_tier(ovr),
    'attributes', attrs,
    'components', jsonb_build_object(
      'skill', round(skill * 100), 'activity', round(act * 100), 'volume', round(vol * 100),
      'rating', case when rat is null then null else round(rat * 100) end,
      'match', case when mat is null then null else round(mat * 100) end),
    'age_group', grp);
end $$;
revoke execute on function rating_breakdown(uuid, timestamptz) from public, anon, authenticated;
