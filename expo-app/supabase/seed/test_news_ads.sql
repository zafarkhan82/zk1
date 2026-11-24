-- Go4Pro Testdaten: Nachrichten und Anzeigen (nach test_data.sql ausführen). Entfernen mit cleanup_test_data.sql.
begin;

do $$
declare
  owner_id constant uuid := '7e570000-0000-4000-8000-000000000001';
  sponsors constant text[] := array['Bäckerei Sonnenschein', 'Autohaus Berger', 'Physiopraxis Fit', 'Sport Huber',
                                    'Getränke Krause', 'Pizzeria Da Marco', 'Malerbetrieb Klein', 'Optik Weber'];
  t record;
  i int := 0;
begin
  insert into news (kind, title, body, author_label, pinned, created_by, published_at, is_test) values
    ('info', 'Neu: Ranglisten bis Deutschland',
     'Ab sofort siehst du, wo du im Team, in deiner Spielklasse, in deiner Region und deutschlandweit stehst. Es zählen nur Übungen, die dein Trainer bestätigt hat.',
     'Go4Pro', true, owner_id, now() - interval '1 day', true),
    ('tipp', 'Trinken nicht vergessen',
     'Trink schon eine Stunde vor dem Training ein großes Glas Wasser – und in jeder Pause ein paar Schlucke.',
     'Go4Pro', false, owner_id, now() - interval '3 days', true),
    ('info', 'Herbst-Challenge: 7 Tage am Ball',
     'Schaffst du es, eine Woche lang jeden Tag eine Übung einzutragen? Deine Serie siehst du oben auf der Startseite.',
     'Go4Pro', false, owner_id, now() - interval '5 days', true);

  for t in select tm.id, tm.club_id, tm.name, c.name as club from teams tm join clubs c on c.id = tm.club_id where tm.is_test loop
    i := i + 1;
    insert into news (club_id, team_id, kind, title, body, author_label, created_by, published_at, expires_at, is_test) values
      (t.club_id, t.id, 'training', 'Training Donnerstag schon um 17 Uhr',
       'Bitte 10 Minuten früher da sein, wir starten mit Koordination. Trinkflasche nicht vergessen!',
       'Trainer-Team ' || t.name, owner_id, now() - interval '20 hours', now() + interval '5 days', true),
      (t.club_id, t.id, 'lob', 'Starker Einsatz am Wochenende!',
       'Ihr habt bis zur letzten Minute gekämpft und euch gegenseitig unterstützt. Genau so!',
       'Trainer-Team ' || t.name, owner_id, now() - interval '2 days', null, true);
    insert into news (club_id, kind, title, body, author_label, created_by, published_at, is_test) values
      (t.club_id, 'info', 'Vereinsfest am 6. Dezember',
       'Nikolausturnier für alle Jugendteams, danach Punsch und Waffeln im Vereinsheim.',
       t.club, owner_id, now() - interval '4 days', true);
    insert into ads (club_id, sponsor, title, body, cta_label, link_url, category, status, created_by, approved_by, is_test)
    values (t.club_id, sponsors[1 + i % array_length(sponsors, 1)], 'Partner des ' || t.club,
            'Wir unterstützen die Jugend des ' || t.club || '. Danke für euren Einsatz!', 'Zum Partner',
            'https://go4pro.net', 'verein', 'aktiv', owner_id, owner_id, true);
  end loop;

  insert into ads (sponsor, title, body, cta_label, link_url, category, status, created_by, approved_by, is_test) values
    ('Kicker-Camp (Test)', 'Fußballcamp in den Osterferien', '5 Tage Technik, Spaß und Turniere für 7- bis 14-Jährige.',
     'Mehr erfahren', 'https://go4pro.net', 'camp', 'aktiv', owner_id, owner_id, true),
    ('Sportladen (Test)', 'Schienbeinschoner, die passen', 'Lass dich im Laden beraten – mit deinen Eltern.',
     'Mehr erfahren', 'https://go4pro.net', 'sport', 'aktiv', owner_id, owner_id, true);
end $$;

commit;

select (select count(*) from news where is_test) as news, (select count(*) from ads where is_test) as ads;
