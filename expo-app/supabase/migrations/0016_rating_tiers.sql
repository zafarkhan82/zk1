-- Go4Pro 0016: Sechs feste Kartenstufen für die Gesamtwertung (35–79).
-- Die Grenzen stehen nur hier (und gleichlautend in src/lib/rating.ts → TIERS).
--   Weiß 35–44 · Bronze 45–52 · Silber 53–60 · Gold 61–68 · Schwarz-Platin 69–74 · Diamond-Blue 75–79

create or replace function rating_tier(p_overall int) returns text
language sql immutable as $$
  select case
    when p_overall >= 75 then 'diamant'
    when p_overall >= 69 then 'platin'
    when p_overall >= 61 then 'gold'
    when p_overall >= 53 then 'silber'
    when p_overall >= 45 then 'bronze'
    else 'weiss' end;
$$;
grant execute on function rating_tier(int) to anon, authenticated;

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
    'tier', rating_tier(ovr),
    'attributes', attrs,
    'components', jsonb_build_object(
      'skill', round(skill * 100), 'activity', round(act * 100), 'volume', round(vol * 100),
      'rating', case when rat is null then null else round(rat * 100) end,
      'match', case when mat is null then null else round(mat * 100) end),
    'age_group', grp);
end $$;
revoke execute on function rating_breakdown(uuid, timestamptz) from public, anon, authenticated;
