-- Go4Pro Testdaten: Spiele (letztes + nächstes je Testteam), Einsätze und Bewertungen.
-- Nach test_data.sql ausführen. Entfernen mit cleanup_test_data.sql.
begin;

alter table matches disable trigger user;
alter table match_appearances disable trigger user;
alter table trainer_ratings disable trigger user;
alter table peer_ratings disable trigger user;

do $$
declare
  owner_id constant uuid := '7e570000-0000-4000-8000-000000000001';
  t record;
  opp record;
  m_last uuid;
  mem record;
  i int;
  gf int;
  ga int;
  rater record;
  k int;
  comments constant text[] := array['Starker linker Fuß, bleib dran!', 'Sehr gutes Stellungsspiel.', 'Toller Einsatz bis zum Schluss.',
    'Schnell im Kopf, sucht die Lösung nach vorn.', 'Fair und hilfsbereit – Vorbild fürs Team.', null, null];
begin
  perform setseed(0.77);
  for t in select tm.id, tm.club_id, tm.name, tm.league, tm.season, tm.age_group from teams tm where tm.is_test loop
    select c.name into opp from teams o join clubs c on c.id = o.club_id
     where o.is_test and o.id <> t.id and o.league = t.league order by random() limit 1;
    if opp is null then
      select c.name into opp from clubs c where c.is_test and c.id <> t.club_id order by random() limit 1;
    end if;
    gf := floor(random() * 5)::int;
    ga := floor(random() * 4)::int;
    insert into matches (club_id, team_id, team_name, opponent, kickoff, competition, is_home, goals_for, goals_against,
                         created_by, season, age_group, venue)
    values (t.club_id, t.id, t.name, opp.name, date_trunc('day', now() - interval '3 days') + interval '11 hours',
            coalesce(t.league, 'Freundschaftsspiel'), random() < 0.5, gf, ga, owner_id, t.season, t.age_group, 'Sportplatz am Wald')
    returning id into m_last;
    insert into matches (club_id, team_id, team_name, opponent, kickoff, competition, is_home, created_by, season, age_group, venue)
    values (t.club_id, t.id, t.name, (select c.name from clubs c where c.is_test and c.id <> t.club_id order by random() limit 1),
            date_trunc('day', now() + interval '4 days') + interval '10 hours 30 minutes',
            coalesce(t.league, 'Freundschaftsspiel'), random() < 0.5, owner_id, t.season, t.age_group, 'Kunstrasen Süd');

    i := 0;
    for mem in select m.player_id from team_members m where m.team_id = t.id and m.status = 'approved' and m.to_date is null loop
      i := i + 1;
      insert into match_appearances (match_id, player_id, minutes, position, started, goals, assists, status,
                                     player_confirmed_at, trainer_confirmed_at, created_by)
      values (m_last, mem.player_id, case when i <= 7 then 50 + floor(random() * 11)::int else 10 + floor(random() * 30)::int end,
              null, i <= 7, case when gf > 0 and random() < 0.25 then 1 else 0 end,
              case when random() < 0.2 then 1 else 0 end, 'confirmed', now() - interval '2 days', now() - interval '2 days', owner_id);

      -- Trainer-Bewertungen (je Monat höchstens eine pro Trainer*in)
      for k in 0 .. floor(random() * 3)::int - 1 loop
        insert into trainer_ratings (player_id, trainer_user_id, technik, taktik, athletik, einsatz, fairplay, relation, context,
                                     comment, rater_club_id, created_at, is_test)
        values (mem.player_id, owner_id, 2 + floor(random() * 4)::int, 2 + floor(random() * 4)::int, 2 + floor(random() * 4)::int,
                3 + floor(random() * 3)::int, 3 + floor(random() * 3)::int,
                case when random() < 0.5 then 'eigener' else 'fremder' end,
                (array['training', 'spiel', 'turnier', 'sichtung'])[1 + floor(random() * 4)::int],
                comments[1 + floor(random() * array_length(comments, 1))::int],
                case when random() < 0.5 then t.club_id else (select id from clubs where is_test order by random() limit 1) end,
                now() - make_interval(days => 5 + k * 35), true);
      end loop;

      -- Bewertungen durch Mitspieler*innen
      for rater in select m2.player_id from team_members m2 where m2.team_id = t.id and m2.player_id <> mem.player_id
                     and m2.to_date is null order by random() limit floor(random() * 5)::int loop
        insert into peer_ratings (rated_player_id, rater_player_id, relation, technik, fairplay, einsatz, created_by, created_at, is_test)
        values (mem.player_id, rater.player_id, 'mitspieler', 2 + floor(random() * 4)::int, 3 + floor(random() * 3)::int,
                3 + floor(random() * 3)::int, owner_id, now() - make_interval(days => floor(random() * 60)::int), true);
      end loop;
    end loop;
  end loop;
end $$;

alter table matches enable trigger user;
alter table match_appearances enable trigger user;
alter table trainer_ratings enable trigger user;
alter table peer_ratings enable trigger user;

commit;

select (select count(*) from matches m join clubs c on c.id = m.club_id where c.is_test) as matches,
       (select count(*) from trainer_ratings where is_test) as trainer_ratings,
       (select count(*) from peer_ratings where is_test) as peer_ratings;
