-- Go4Pro Testdaten: 100 Vereine, je ein Team, 1000 Spieler mit Übungen und Tagebuch.
-- Alles ist mit is_test = true gekennzeichnet und wird mit cleanup_test_data.sql wieder entfernt.
-- Optional: :'join_player' = ID eines echten Spielers, der einem Test-Team (D-Jugend) beitreten soll.
-- Läuft als Tabellen-Eigentümer (postgres). Schutz-Trigger sind nur innerhalb dieser Transaktion aus.

begin;

alter table clubs disable trigger user;
alter table teams disable trigger user;
alter table players disable trigger user;
alter table team_members disable trigger user;
alter table player_club_history disable trigger user;
alter table exercise_entries disable trigger user;
alter table diary_entries disable trigger user;
alter table club_licenses disable trigger user;

create temp table seed_cfg (join_player uuid) on commit drop;
insert into seed_cfg values (nullif(:'join_player', '')::uuid);

do $$
declare
  owner_id constant uuid := '7e570000-0000-4000-8000-000000000001';
  regions constant text[] := array['Württemberg', 'Baden', 'Bayern', 'Westfalen', 'Niederrhein', 'Niedersachsen', 'Hessen', 'Berlin'];
  region_clubs constant int[] := array[14, 10, 18, 14, 12, 12, 12, 8];
  region_cities constant text[] := array[
    'Stuttgart,Ulm,Heilbronn,Reutlingen,Esslingen,Ludwigsburg,Göppingen',
    'Karlsruhe,Mannheim,Heidelberg,Pforzheim,Bruchsal',
    'München,Augsburg,Nürnberg,Regensburg,Würzburg,Ingolstadt,Rosenheim',
    'Dortmund,Münster,Bielefeld,Paderborn,Hagen,Gelsenkirchen',
    'Düsseldorf,Duisburg,Essen,Krefeld,Mönchengladbach,Wuppertal',
    'Hannover,Braunschweig,Osnabrück,Oldenburg,Göttingen,Lüneburg',
    'Frankfurt,Kassel,Darmstadt,Wiesbaden,Gießen,Fulda',
    'Berlin-Mitte,Berlin-Spandau,Berlin-Neukölln,Berlin-Pankow'];
  region_plz constant text[] := array['7', '76', '8', '44', '40', '30', '6', '1'];
  prefixes constant text[] := array['SV', 'TSV', 'FC', 'SpVgg', 'TuS', 'SC', 'VfL', 'SG', 'FV', 'TV', 'VfR', 'DJK'];
  syl1 constant text[] := array['Linden', 'Birken', 'Eichen', 'Buchen', 'Erlen', 'Tannen', 'Rosen', 'Sonnen', 'Wiesen', 'Berg',
                                'Stein', 'Brunn', 'Hoch', 'Nieder', 'Ober', 'Alt', 'Neu', 'Kirch', 'Mühl', 'Wald', 'Grün', 'Hasel'];
  syl2 constant text[] := array['au', 'feld', 'heim', 'dorf', 'bach', 'hausen', 'berg', 'stadt', 'ingen', 'hofen', 'weiler', 'tal'];
  boys constant text[] := array['Leon', 'Noah', 'Paul', 'Elias', 'Finn', 'Ben', 'Luis', 'Felix', 'Jonas', 'Henry', 'Emil', 'Theo',
    'Lukas', 'Max', 'Anton', 'Jakob', 'Moritz', 'David', 'Mats', 'Ole', 'Milan', 'Leo', 'Tim', 'Niklas', 'Julian', 'Samuel',
    'Liam', 'Karl', 'Jan', 'Tom', 'Erik', 'Malte', 'Linus', 'Fabian', 'Kerem', 'Can', 'Yusuf', 'Ali', 'Mehmet', 'Luca',
    'Matteo', 'Nico', 'Tobias', 'Simon', 'Aaron', 'Leonard', 'Raphael', 'Vincent', 'Oskar', 'Mika', 'Jannik', 'Dominik',
    'Florian', 'Sebastian', 'Marlon', 'Adrian', 'Arda', 'Emir', 'Dario', 'Joel'];
  girls constant text[] := array['Mia', 'Emma', 'Hannah', 'Lea', 'Lina', 'Marie', 'Sophie', 'Lena', 'Ella', 'Clara', 'Ida',
    'Nele', 'Lara', 'Amelie', 'Zoe', 'Elif', 'Lia', 'Paula', 'Jana', 'Selin'];
  positions constant text[] := array['Abwehr', 'Abwehr', 'Mittelfeld', 'Mittelfeld', 'Mittelfeld', 'Sturm', 'Sturm'];
  diary_good constant text[] := array['Schwacher Fuß klappt besser', 'Viele Ballkontakte', 'Gute Pässe im Spiel', 'Tor geschossen',
    'Konzentriert geblieben', 'Gut im Zweikampf', 'Schneller geworden', 'Jonglier-Rekord'];
  diary_improve constant text[] := array['Mehr mit links', 'Kopfball üben', 'Ruhiger abschließen', 'Mehr reden auf dem Platz',
    'Schneller umschalten', 'Erster Kontakt', 'Ausdauer', 'Mehr Mut im Eins-gegen-eins'];
  -- Altersklassen: Anteil Teams, Name, Jahrgänge, Spielklasse
  ages constant text[] := array['E', 'D', 'D', 'D', 'C', 'C', 'B', 'A', 'D', 'C'];
  season text := current_season();
  season_start date := make_date(season_start_year(), 8, 1);
  r int; k int; i int; j int; n int;
  club_no int := 0;
  cid uuid; tid uuid; pid uuid;
  city text; ag text; uname text; league text; cname text;
  yr int; skill numeric; lvl level; ex exercises; target numeric; val numeric; st entry_status; at timestamptz;
  used_names text[] := '{}';
  join_pid uuid := (select join_player from seed_cfg);
  joined boolean := false;
begin
  perform setseed(0.4242);

  -- Testkonto (ohne Passwort, nicht anmeldbar). Der Trigger legt das Profil an.
  insert into auth.users (id, email, raw_user_meta_data)
  values (owner_id, 'testdaten@go4pro.invalid', '{"full_name":"Go4Pro Testdaten"}')
  on conflict (id) do nothing;
  insert into profiles (id, email, display_name) values (owner_id, 'testdaten@go4pro.invalid', 'Go4Pro Testdaten')
  on conflict (id) do nothing;
  update profiles set is_test = true where id = owner_id;

  for r in 1 .. array_length(regions, 1) loop
    for k in 1 .. region_clubs[r] loop
      club_no := club_no + 1;
      loop
        cname := prefixes[1 + floor(random() * array_length(prefixes, 1))::int] || ' '
              || syl1[1 + floor(random() * array_length(syl1, 1))::int]
              || syl2[1 + floor(random() * array_length(syl2, 1))::int];
        exit when not cname = any(used_names);
      end loop;
      used_names := used_names || cname;
      city := split_part(region_cities[r], ',', 1 + floor(random() * (length(region_cities[r]) - length(replace(region_cities[r], ',', '')) + 1))::int);
      if random() < 0.6 then cname := cname || ' ' || (1890 + floor(random() * 90))::int; end if;

      insert into clubs (name, city, postal_code, association, district, status, created_by, approved_by, is_test)
      values (cname, city, rpad(region_plz[r] || floor(random() * 99999)::text, 5, '0'), regions[r], 'Kreis ' || city,
              'approved', owner_id, owner_id, true)
      returning id into cid;

      insert into club_licenses (club_id, valid_from, valid_until, reference, amount_cents, created_by)
      values (cid, now() - interval '30 days', now() + interval '1 year', 'TESTDATEN', 0, owner_id);

      -- erster Verein in Württemberg mit D-Jugend, damit ein echter Spieler beitreten kann
      ag := case when r = 1 and k = 1 then 'D' else ages[1 + floor(random() * array_length(ages, 1))::int] end;
      uname := case ag when 'E' then 'U11' when 'D' then 'U13' when 'C' then 'U15' when 'B' then 'U17' else 'U19' end;
      league := ag || '-Junioren ' || case ag when 'E' then 'Kreisstaffel' when 'D' then 'Kreisliga' when 'C' then 'Bezirksliga'
                                              when 'B' then 'Landesliga' else 'Verbandsliga' end || ' ' || regions[r]
                || case when ag in ('D', 'C') then ' · Staffel ' || (1 + k % 2) else '' end;

      insert into teams (club_id, name, age_group, season, created_by, league, is_test)
      values (cid, uname, ag, season, owner_id, league, true)
      returning id into tid;

      if join_pid is not null and not joined and ag = 'D' then
        insert into team_members (team_id, player_id, jersey_number, status, approved_by, from_date)
        values (tid, join_pid, 7, 'approved', owner_id, current_date);
        update player_club_history set to_date = current_date where player_id = join_pid and to_date is null;
        insert into player_club_history (player_id, club_id, team_name, jersey_number, from_date, created_by)
        values (join_pid, cid, uname, 7, current_date, owner_id);
        joined := true;
      end if;

      for i in 1 .. 10 loop
        yr := season_start_year() - case ag when 'E' then 9 when 'D' then 11 when 'C' then 13 when 'B' then 15 else 17 end
              - floor(random() * 2)::int;
        insert into players (nickname, birth_year, preferred_position, guardian_user_id, usage_consent_at, public_consent_at,
                             created_at, is_test)
        values (case when random() < 0.12 then girls[1 + floor(random() * array_length(girls, 1))::int]
                     else boys[1 + floor(random() * array_length(boys, 1))::int] end
                  || ' ' || chr(65 + floor(random() * 26)::int) || '.',
                yr,
                case when i = 1 then 'Tor' else positions[1 + floor(random() * array_length(positions, 1))::int] end,
                owner_id, season_start, case when random() < 0.75 then season_start end, season_start, true)
        returning id into pid;

        insert into team_members (team_id, player_id, jersey_number, status, approved_by, from_date, created_at)
        values (tid, pid, case when i = 1 then 1 else i + 1 + floor(random() * 3)::int * 10 end, 'approved', owner_id,
                season_start, season_start);
        insert into player_club_history (player_id, club_id, team_name, jersey_number, from_date, created_by, created_at)
        values (pid, cid, uname, null, season_start, owner_id, season_start);

        skill := 0.35 + random() * 0.9;              -- Talent
        n := floor(power(random(), 1.3) * 55)::int + 3; -- Fleiß: 3 bis 58 Übungen
        for j in 1 .. n loop
          select * into ex from exercises e
           where e.active and group_index(e.min_group) <= group_index(ag)
             and (e.category <> 'torwart' or i = 1)
           order by random() limit 1;
          lvl := case when random() < 0.55 - skill * 0.25 then 'bronze'
                      when random() < 0.7 then 'silber' else 'gold' end;
          target := exercise_target(ex.id, ag, lvl);
          if ex.measure = 'check' then
            val := null;
          elsif ex.lower_is_better then
            val := round(target * (1.45 - skill * 0.5 * (0.5 + random()::numeric)), 1);
          else
            val := greatest(0, round(target * (0.45 + skill * 0.6 * (0.5 + random()::numeric))));
            if ex.measure = 'hits' then val := least(val, 10); end if;
          end if;
          at := now() - (power(random(), 0.8) * least(84, current_date - season_start)) * interval '1 day'
                - random() * interval '10 hours';
          st := case when random() < 0.78 then 'confirmed' when random() < 0.85 then 'pending' else 'rejected' end;
          insert into exercise_entries (player_id, exercise_id, club_id, team_id, season, age_group, trainer_user_id, level, value,
                                        achieved, status, player_confirmed_at, trainer_confirmed_at, created_by, created_at, updated_at)
          values (pid, ex.id, cid, tid, season, ag, owner_id, lvl, val,
                  case when ex.measure = 'check' then random() < 0.5 + skill * 0.3
                       else compute_achieved(pid, ex.id, lvl, val) end,
                  st, at, case when st = 'confirmed' then at + interval '1 day' end, owner_id, at, at);
        end loop;

        for j in 1 .. floor(random() * 14)::int loop
          at := now() - random() * least(84, current_date - season_start) * interval '1 day';
          insert into diary_entries (player_id, kind, minutes, mood, good, improve, created_by, created_at, updated_at,
                                     club_id, team_id, season, age_group)
          values (pid, (array['training', 'spiel', 'allein', 'frei'])[1 + floor(random() * 4)::int],
                  30 + floor(random() * 7)::int * 15, 2 + floor(random() * 4)::int,
                  diary_good[1 + floor(random() * array_length(diary_good, 1))::int],
                  diary_improve[1 + floor(random() * array_length(diary_improve, 1))::int],
                  owner_id, at, at, cid, tid, season, ag);
        end loop;
      end loop;
    end loop;
  end loop;
end $$;

alter table clubs enable trigger user;
alter table teams enable trigger user;
alter table players enable trigger user;
alter table team_members enable trigger user;
alter table player_club_history enable trigger user;
alter table exercise_entries enable trigger user;
alter table diary_entries enable trigger user;
alter table club_licenses enable trigger user;

commit;

select (select count(*) from clubs where is_test) as clubs, (select count(*) from teams where is_test) as teams,
       (select count(*) from players where is_test) as players,
       (select count(*) from exercise_entries e join players p on p.id = e.player_id where p.is_test) as entries,
       (select count(*) from diary_entries d join players p on p.id = d.player_id where p.is_test) as diary;
