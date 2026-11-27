-- Go4Pro 0015: Gesamtwertung (Rating 35–79) wie bei einer Spielerkarte, eindeutige Go4Pro-ID und QR-Abruf.
--
-- Bestandteile (jeweils 0–1):
--   Können     55 %  Bestleistungen je Übung (Gold > Silber > Bronze, Ziel erreicht, vom Trainer bestätigt)
--                    je Kategorie: 70 % die besten 3 Übungen + 30 % Breite über alle Übungen der Altersklasse
--   Aktivität  15 %  aktive Wochen in den letzten 8 Wochen
--   Umfang     10 %  bestätigte Übungen der letzten 90 Tage (40 = voll)
--   Bewertung  10 %  Trainer- (70 %) und Mitspieler-Bewertungen (30 %) der letzten 180 Tage
--   Spiele     10 %  Einsatzminuten und Torbeteiligungen (bestätigt) der letzten 180 Tage
-- Fehlt ein Bestandteil (z. B. noch keine Trainerbewertung), zählt sein Anteil zum Können.
-- Ergebnis = 35 + 44 × Summe → 35 (Start) bis 79 (Spitze). Zielwerte sind altersabhängig, daher fair über alle Jahrgänge.

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
  w_skill numeric := 0.55;
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

  select (avg((coalesce(technik, 0) + coalesce(taktik, 0) + coalesce(athletik, 0) + coalesce(einsatz, 0) + coalesce(fairplay, 0))::numeric
              / nullif(num_nonnulls(technik, taktik, athletik, einsatz, fairplay), 0)) - 1) / 4
    into trn from trainer_ratings
   where player_id = p_player and created_at > p_at - interval '180 days' and created_at <= p_at;

  select (avg((coalesce(technik, 0) + fairplay + coalesce(einsatz, 0))::numeric / num_nonnulls(technik, fairplay, einsatz)) - 1) / 4
    into peer from peer_ratings
   where rated_player_id = p_player and created_at > p_at - interval '180 days' and created_at <= p_at;

  rat := case when trn is not null and peer is not null then 0.7 * trn + 0.3 * peer else coalesce(trn, peer) end;

  select case when count(*) = 0 then null
              else avg(least(minutes, 60) / 60.0) * 0.6 + least(1, sum(goals + assists)::numeric / count(*)) * 0.4 end
    into mat from match_appearances
   where player_id = p_player and status = 'confirmed' and created_at > p_at - interval '180 days' and created_at <= p_at;

  if rat is null then w_skill := w_skill + 0.10; end if;
  if mat is null then w_skill := w_skill + 0.10; end if;
  total := w_skill * skill + 0.15 * act + 0.10 * vol + 0.10 * coalesce(rat, 0) + 0.10 * coalesce(mat, 0);
  ovr := greatest(35, least(79, round(35 + 44 * total)::int));

  return jsonb_build_object(
    'overall', ovr,
    'tier', case when ovr >= 65 then 'gold' when ovr >= 50 then 'silber' else 'bronze' end,
    'attributes', attrs,
    'components', jsonb_build_object(
      'skill', round(skill * 100), 'activity', round(act * 100), 'volume', round(vol * 100),
      'rating', case when rat is null then null else round(rat * 100) end,
      'match', case when mat is null then null else round(mat * 100) end),
    'age_group', grp);
end $$;
revoke execute on function rating_breakdown(uuid, timestamptz) from public, anon, authenticated;

-- Für Eltern/Spieler, Trainer und Admins: Wertung heute und vor 7 Tagen
create or replace function player_rating(p_player uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  now_ jsonb;
begin
  if not (is_player_owner(p_player) or is_trainer_of(p_player) or is_platform_admin()) then
    raise exception 'Keine Berechtigung.';
  end if;
  now_ := rating_breakdown(p_player);
  return now_ || jsonb_build_object(
    'overall_week_ago', (rating_breakdown(p_player, now() - interval '7 days') ->> 'overall')::int,
    'go4pro_id', 'G4P-' || (select code from players where id = p_player));
end $$;
revoke execute on function player_rating(uuid) from public, anon;
grant execute on function player_rating(uuid) to authenticated;

-- QR-Code-Abruf über die Go4Pro-ID. Auch ohne Anmeldung aufrufbar, gibt aber nur frei, was erlaubt ist:
--   eigene Spieler, Trainer, Admins → alles
--   öffentlich (Zustimmung der Eltern + Premium) → Karte; unter der C-Jugend nur mit Initiale
--   sonst → nur, dass es die ID gibt
create or replace function scan_player(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  pl players;
  full_access boolean;
  is_public boolean;
  t teams;
  c clubs;
  jersey int;
  rb jsonb;
begin
  select * into pl from players
   where code = upper(regexp_replace(coalesce(p_code, ''), '^(G4P-?)', '', 'i')) and anonymized_at is null;
  if not found then return jsonb_build_object('found', false); end if;

  full_access := auth.uid() is not null and (is_player_owner(pl.id) or is_trainer_of(pl.id) or is_platform_admin());
  is_public := pl.public_consent_at is not null and is_premium(pl.id);
  if not (full_access or is_public) then
    return jsonb_build_object('found', true, 'private', true, 'go4pro_id', 'G4P-' || pl.code,
                              'age_group', age_group(pl.birth_year));
  end if;

  select * into t from teams where id = active_team_of(pl.id);
  if found then select * into c from clubs where id = t.club_id; end if;
  select m.jersey_number into jersey from team_members m
   where m.player_id = pl.id and m.team_id = t.id and m.to_date is null limit 1;
  rb := rating_breakdown(pl.id);

  return jsonb_build_object(
    'found', true, 'private', false, 'full', full_access,
    'go4pro_id', 'G4P-' || pl.code,
    'nickname', case when full_access or u_class(pl.birth_year) >= 14 then pl.nickname else left(pl.nickname, 1) || '.' end,
    'position', pl.preferred_position,
    'birth_year', case when full_access then pl.birth_year end,
    'club', c.name, 'team', t.name, 'league', t.league, 'jersey', jersey,
    'overall', rb -> 'overall', 'tier', rb -> 'tier', 'attributes', rb -> 'attributes', 'age_group', rb -> 'age_group');
end $$;
revoke execute on function scan_player(text) from public;
grant execute on function scan_player(text) to anon, authenticated;

-- Kader mit Gesamtwertung
drop function if exists team_roster(uuid);
create function team_roster(p_team uuid)
returns table (player_id uuid, nickname text, jersey_number int, preferred_position text,
               points int, entries int, last_activity timestamptz, is_mine boolean, rating int)
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
         is_player_owner(p.id),
         (rating_breakdown(p.id) ->> 'overall')::int
    from team_members m
    join teams t on t.id = m.team_id
    join players p on p.id = m.player_id and p.anonymized_at is null
    left join exercise_entries e on e.player_id = p.id and e.status <> 'rejected'
   where m.team_id = p_team and m.status = 'approved' and m.to_date is null
   group by p.id, p.nickname, m.jersey_number, p.preferred_position
   order by 9 desc, 5 desc, p.nickname;
end $$;
revoke execute on function team_roster(uuid) from public, anon;
grant execute on function team_roster(uuid) to authenticated;
