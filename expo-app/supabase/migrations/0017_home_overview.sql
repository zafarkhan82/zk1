-- Go4Pro 0017: Startseite als Übersicht – Spielzentrale, Team-Woche, Wertungsverlauf,
-- Bewertungen durch eigene und fremde Trainer*innen sowie durch Mitspieler*innen/Gegner (mit Schutzregeln).

-- ───────────────────────── Bewertungen: nur noch über die Funktionen ─────────────────────────
-- Direkte Inserts aus der App werden abgelehnt; geprüft wird in submit_*_rating (security definer).
create or replace function check_trainer_rating() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    raise exception 'Bitte über die App bewerten.';
  end if;
  return new;
end $$;

create or replace function check_peer_rating() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    raise exception 'Bitte über die App bewerten.';
  end if;
  return new;
end $$;

alter table trainer_ratings add column if not exists relation text not null default 'eigener'
  check (relation in ('eigener', 'fremder'));
alter table trainer_ratings add column if not exists context text not null default 'training'
  check (context in ('training', 'spiel', 'turnier', 'sichtung'));
alter table trainer_ratings add column if not exists comment text check (comment is null or length(comment) <= 300);
alter table trainer_ratings add column if not exists rater_club_id uuid references clubs (id);
alter table trainer_ratings add column if not exists is_test boolean not null default false;

alter table peer_ratings alter column match_id drop not null;
alter table peer_ratings add column if not exists is_test boolean not null default false;
create unique index if not exists peer_ratings_once_per_month on peer_ratings
  (rated_player_id, rater_player_id, (date_trunc('month', created_at at time zone 'UTC'))) where match_id is null;

-- Was darf die angemeldete Person bei dieser Go4Pro-ID bewerten?
create or replace function rating_options(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  pl players;
  staff_club uuid;
  raters jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('trainer', false, 'raters', '[]'::jsonb); end if;
  select * into pl from players where code = upper(regexp_replace(coalesce(p_code, ''), '^(G4P-?)', '', 'i')) and anonymized_at is null;
  if not found then return jsonb_build_object('trainer', false, 'raters', '[]'::jsonb); end if;

  select cm.club_id into staff_club from club_memberships cm join clubs c on c.id = cm.club_id
   where cm.user_id = auth.uid() and cm.status = 'approved' and c.status = 'approved'
     and (cm.valid_to is null or cm.valid_to >= current_date) limit 1;

  -- Eigene Kinder mit aktivem Team dürfen andere Spieler*innen bewerten (nicht Geschwister)
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nickname', p.nickname)), '[]'::jsonb) into raters
    from players p
   where (p.guardian_user_id = auth.uid() or p.own_user_id = auth.uid()) and p.anonymized_at is null
     and p.id <> pl.id and active_team_of(p.id) is not null
     and not (pl.guardian_user_id is not null and pl.guardian_user_id = p.guardian_user_id);

  return jsonb_build_object(
    'trainer', (staff_club is not null or is_platform_admin()) and not is_player_owner(pl.id),
    'own_trainer', is_trainer_of(pl.id),
    'raters', raters,
    'nickname', pl.nickname);
end $$;

create or replace function submit_trainer_rating(p_code text, p_context text, p_technik int, p_taktik int, p_athletik int,
                                                 p_einsatz int, p_fairplay int, p_comment text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  pl players;
  staff_club uuid;
begin
  select * into pl from players where code = upper(regexp_replace(coalesce(p_code, ''), '^(G4P-?)', '', 'i')) and anonymized_at is null;
  if not found then raise exception 'Spieler*in nicht gefunden.'; end if;
  if is_player_owner(pl.id) then raise exception 'Eigene Kinder kannst du nicht bewerten.'; end if;
  select cm.club_id into staff_club from club_memberships cm join clubs c on c.id = cm.club_id
   where cm.user_id = auth.uid() and cm.status = 'approved' and c.status = 'approved'
     and (cm.valid_to is null or cm.valid_to >= current_date) limit 1;
  if staff_club is null and not is_platform_admin() then
    raise exception 'Bewerten können freigeschaltete Trainer*innen eines Vereins.';
  end if;
  if exists (select 1 from trainer_ratings where player_id = pl.id and trainer_user_id = auth.uid()
               and created_at > now() - interval '30 days') then
    raise exception 'Du hast diese*n Spieler*in in den letzten 30 Tagen schon bewertet.';
  end if;
  insert into trainer_ratings (player_id, trainer_user_id, technik, taktik, athletik, einsatz, fairplay,
                               relation, context, comment, rater_club_id)
  values (pl.id, auth.uid(), p_technik, p_taktik, p_athletik, p_einsatz, p_fairplay,
          case when is_trainer_of(pl.id) then 'eigener' else 'fremder' end,
          coalesce(p_context, 'training'), nullif(trim(p_comment), ''), staff_club);
end $$;

-- Spieler*innen bewerten Spieler*innen: nur Sterne (keine Texte), Ergebnis nur als Durchschnitt ab 3 Bewertungen
create or replace function submit_peer_rating(p_rater uuid, p_code text, p_technik int, p_fairplay int, p_einsatz int)
returns void
language plpgsql security definer set search_path = public as $$
declare
  pl players;
  rater players;
begin
  select * into rater from players where id = p_rater and (guardian_user_id = auth.uid() or own_user_id = auth.uid());
  if not found then raise exception 'Nur für eigene Spieler*innen.'; end if;
  if active_team_of(rater.id) is null then raise exception 'Bewerten kann, wer in einem Team ist.'; end if;
  select * into pl from players where code = upper(regexp_replace(coalesce(p_code, ''), '^(G4P-?)', '', 'i')) and anonymized_at is null;
  if not found then raise exception 'Spieler*in nicht gefunden.'; end if;
  if pl.id = rater.id or (pl.guardian_user_id is not null and pl.guardian_user_id = rater.guardian_user_id) then
    raise exception 'Geschwister und sich selbst kann man nicht bewerten.';
  end if;
  if exists (select 1 from peer_ratings where rated_player_id = pl.id and rater_player_id = rater.id
               and created_at > now() - interval '30 days') then
    raise exception 'Du hast diese*n Spieler*in in den letzten 30 Tagen schon bewertet.';
  end if;
  if (select count(*) from peer_ratings where rater_player_id = rater.id and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Heute hast du schon genug bewertet.';
  end if;
  insert into peer_ratings (rated_player_id, rater_player_id, relation, technik, fairplay, einsatz, created_by)
  values (pl.id, rater.id, case when active_team_of(pl.id) = active_team_of(rater.id) then 'mitspieler' else 'gegner' end,
          p_technik, p_fairplay, p_einsatz, auth.uid());
end $$;

-- Übersicht der erhaltenen Bewertungen (letzte 180 Tage)
create or replace function rating_overview(p_player uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  tr jsonb;
  pr jsonb;
  recent jsonb;
begin
  if not (is_player_owner(p_player) or is_trainer_of(p_player) or is_platform_admin()) then raise exception 'Keine Berechtigung.'; end if;
  select jsonb_build_object(
           'count', count(*), 'own', count(*) filter (where relation = 'eigener'), 'foreign', count(*) filter (where relation = 'fremder'),
           'technik', round(avg(technik), 1), 'taktik', round(avg(taktik), 1), 'athletik', round(avg(athletik), 1),
           'einsatz', round(avg(einsatz), 1), 'fairplay', round(avg(fairplay), 1))
    into tr from trainer_ratings where player_id = p_player and created_at > now() - interval '180 days';
  select case when count(*) >= 3 then jsonb_build_object(
           'count', count(*), 'technik', round(avg(technik), 1), 'fairplay', round(avg(fairplay), 1), 'einsatz', round(avg(einsatz), 1),
           'mitspieler', count(*) filter (where relation = 'mitspieler'), 'gegner', count(*) filter (where relation = 'gegner'))
         else jsonb_build_object('count', count(*)) end
    into pr from peer_ratings where rated_player_id = p_player and created_at > now() - interval '180 days';
  select coalesce(jsonb_agg(x order by x ->> 'at' desc), '[]'::jsonb) into recent from (
    select jsonb_build_object('at', r.created_at, 'relation', r.relation, 'context', r.context, 'comment', r.comment,
             'club', c.name,
             'avg', round((coalesce(r.technik, 0) + coalesce(r.taktik, 0) + coalesce(r.athletik, 0) + coalesce(r.einsatz, 0)
                           + coalesce(r.fairplay, 0))::numeric / nullif(num_nonnulls(r.technik, r.taktik, r.athletik, r.einsatz, r.fairplay), 0), 1)) as x
      from trainer_ratings r left join clubs c on c.id = r.rater_club_id
     where r.player_id = p_player order by r.created_at desc limit 5) q;
  return jsonb_build_object('trainer', tr, 'peer', pr, 'recent', recent);
end $$;

-- ───────────────────────── Wertungsverlauf ─────────────────────────
create or replace function rating_history(p_player uuid, p_weeks int default 12) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  res jsonb := '[]'::jsonb;
  i int;
  at_ timestamptz;
begin
  if not (is_player_owner(p_player) or is_trainer_of(p_player) or is_platform_admin()) then raise exception 'Keine Berechtigung.'; end if;
  for i in reverse least(greatest(p_weeks, 2), 26) - 1 .. 0 loop
    at_ := now() - make_interval(days => i * 7);
    res := res || jsonb_build_object('at', at_, 'overall', (rating_breakdown(p_player, at_) ->> 'overall')::int);
  end loop;
  return res;
end $$;

-- ───────────────────────── Spielzentrale ─────────────────────────
-- Nächstes Spiel (bis 14 Tage voraus) und letztes Spiel (bis 7 Tage zurück) des aktiven Teams, mit eigenen Einsatzdaten
create or replace function my_match_center(p_player uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  tid uuid;
  nxt jsonb;
  lst jsonb;
begin
  if not (is_player_owner(p_player) or is_platform_admin()) then raise exception 'Nur für eigene Spieler.'; end if;
  tid := active_team_of(p_player);
  if tid is null then return jsonb_build_object('next', null, 'last', null); end if;

  select jsonb_build_object('id', m.id, 'kickoff', m.kickoff, 'opponent', m.opponent, 'is_home', m.is_home,
                            'competition', m.competition, 'venue', m.venue)
    into nxt from matches m
   where m.team_id = tid and m.fussballde_missing_since is null and m.kickoff >= now() - interval '2 hours'
     and m.kickoff < now() + interval '14 days'
   order by m.kickoff limit 1;

  select jsonb_build_object('id', m.id, 'kickoff', m.kickoff, 'opponent', m.opponent, 'is_home', m.is_home,
                            'competition', m.competition, 'goals_for', m.goals_for, 'goals_against', m.goals_against,
                            'me', (select jsonb_build_object('minutes', a.minutes, 'goals', a.goals, 'assists', a.assists,
                                                             'started', a.started, 'status', a.status)
                                     from match_appearances a where a.match_id = m.id and a.player_id = p_player))
    into lst from matches m
   where m.team_id = tid and m.fussballde_missing_since is null and m.kickoff < now() - interval '2 hours'
     and m.kickoff > now() - interval '7 days'
   order by m.kickoff desc limit 1;

  return jsonb_build_object('next', nxt, 'last', lst, 'team', (select name from teams where id = tid));
end $$;

-- ───────────────────────── Woche im Team (Gesprächsstoff) ─────────────────────────
-- Aufsteiger*in (größter Wertungs-Sprung), Fleißigste*r (meiste Übungen), Beste*r (meiste bestätigte Punkte) – letzte 7 Tage
create or replace function team_week(p_team uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  res jsonb;
begin
  if not (is_team_staff(p_team) or is_platform_admin() or exists (
      select 1 from team_members m where m.team_id = p_team and m.status = 'approved' and m.to_date is null
         and is_player_owner(m.player_id))) then
    raise exception 'Nur für Mitglieder des Teams.';
  end if;
  with mem as (
    select p.id, p.nickname, is_player_owner(p.id) as mine
      from team_members m join players p on p.id = m.player_id and p.anonymized_at is null
     where m.team_id = p_team and m.status = 'approved' and m.to_date is null
  ), stats as (
    select mem.*,
           (rating_breakdown(mem.id) ->> 'overall')::int - (rating_breakdown(mem.id, now() - interval '7 days') ->> 'overall')::int as climb,
           (select count(*) from exercise_entries e where e.player_id = mem.id and e.status <> 'rejected'
               and e.created_at > now() - interval '7 days') as busy,
           (select coalesce(sum(entry_points(e.level, e.achieved)), 0) from exercise_entries e where e.player_id = mem.id
               and e.status = 'confirmed' and e.created_at > now() - interval '7 days') as pts
      from mem
  )
  select jsonb_build_object(
    'climber', (select jsonb_build_object('nickname', nickname, 'value', climb, 'mine', mine) from stats where climb > 0 order by climb desc, pts desc limit 1),
    'busiest', (select jsonb_build_object('nickname', nickname, 'value', busy, 'mine', mine) from stats where busy > 0 order by busy desc, pts desc limit 1),
    'best', (select jsonb_build_object('nickname', nickname, 'value', pts, 'mine', mine) from stats where pts > 0 order by pts desc limit 1))
  into res;
  return res;
end $$;

revoke execute on function rating_options(text), submit_trainer_rating(text, text, int, int, int, int, int, text),
  submit_peer_rating(uuid, text, int, int, int), rating_overview(uuid), rating_history(uuid, int),
  my_match_center(uuid), team_week(uuid) from public, anon;
grant execute on function rating_options(text), submit_trainer_rating(text, text, int, int, int, int, int, text),
  submit_peer_rating(uuid, text, int, int, int), rating_overview(uuid), rating_history(uuid, int),
  my_match_center(uuid), team_week(uuid) to authenticated;
